import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { DataStorage } from '../utils/storage';
import { QualityInspection, User, Machine, MonthlySchedule } from '../types';
import { DataTable, Column, PageHeader, FormModal, FormField, inputStyle, DatePicker, StatusBadge, Select } from '../components';

type QITab = 'in_process' | 'final';

export function QualityScreen() {
  const [inspections, setInspections] = useState<QualityInspection[]>([]);
  const [activeTab, setActiveTab] = useState<QITab | 'history'>('in_process');
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState<Partial<QualityInspection>>({});
  const [validationError, setValidationError] = useState('');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [batches, setBatches] = useState<string[]>([]);
  const [schedules, setSchedules] = useState<MonthlySchedule[]>([]);
  const [shifts, setShifts] = useState<any[]>([]);
  const [allReasons, setAllReasons] = useState<any[]>([]);
  const [qualityReasons, setQualityReasons] = useState<any[]>([]);

  useEffect(() => {
    loadData();
  }, [activeTab]);

  const loadData = async () => {
    const [insp, user, m, b, s, sh, re] = await Promise.all([
      DataStorage.getQualityInspections(),
      DataStorage.getCurrentUser(),
      DataStorage.getMachines(),
      DataStorage.getInventoryBatches(),
      DataStorage.getMonthlySchedules(),
      DataStorage.getShifts(),
      DataStorage.getReasons()
    ]);
    setInspections(insp);
    setCurrentUser(user);
    setMachines(m);
    setBatches(b);
    setSchedules(s);
    setShifts(sh);
    setAllReasons(re);
  };

  const today = new Date().toISOString().split('T')[0];

  useEffect(() => {
    if (!allReasons.length) return;

    const selectedMachine = machines.find(m => m.machineId === formData.machine);
    const processType = activeTab === 'final' ? 'FINAL_QA' : (selectedMachine?.type || 'ALL');

    const filtered = allReasons.filter(r => {
      const proc = (r.type || r.processType || r.processCategory || r.stageType || '').toUpperCase();
      return proc === processType || proc === '' || proc === 'GENERAL' || proc === 'ALL';
    });
    setQualityReasons(filtered);
  }, [formData.machine, activeTab, allReasons, machines]);

  const tabData = activeTab === 'history'
    ? inspections
    : inspections.filter((i) => i.type === activeTab && i.date === today);

  const handleSave = async () => {
    const produced = formData.producedCount || 0;
    const good = formData.goodCount || 0;
    const rework = formData.reworkCount || 0;
    const rejected = formData.rejectedCount || 0;

    if (!formData.masterId || !formData.partId || !formData.machine || !formData.shift) {
      setValidationError('Date, Master ID, Part ID, Shift, and Machine are mandatory.');
      return;
    }

    if (produced > 0 && good + rework + rejected !== produced) {
      setValidationError(`Total count must match: Produced (${produced}) = Good (${good}) + Rework (${rework}) + Rejected (${rejected})`);
      return;
    }

    if (rework > 0 && (!formData.reworkReasons || formData.reworkReasons.length === 0)) {
      setValidationError('Reasons are mandatory for Rework parts.');
      return;
    }

    if (rejected > 0 && (!formData.rejectionReasons || formData.rejectionReasons.length === 0)) {
      setValidationError('Reasons are mandatory for Rejected parts.');
      return;
    }

    setValidationError('');

    const newInspection: any = {
      id: Date.now().toString(),
      date: formData.date || new Date().toISOString().split('T')[0],
      masterId: formData.masterId || '',
      batchNumber: (formData as any).batchNumber || '',
      partId: formData.partId || '',
      shift: formData.shift || '',
      machine: formData.machine || '',
      producedCount: produced,
      goodCount: good,
      reworkCount: rework,
      reworkReasons: formData.reworkReasons || [],
      rejectedCount: rejected,
      rejectionReasons: formData.rejectionReasons || [],
      inspectedBy: formData.inspectedBy || '',
      type: (activeTab === 'history' ? 'in_process' : activeTab) as 'in_process' | 'final',
      status: 'pending',
    };

    const updated = [...inspections, newInspection];
    await DataStorage.saveQualityInspections(updated);
    setInspections(updated);
    setShowModal(false);
    setFormData({});
  };

  // Totals
  const totalProduced = tabData.reduce((s, i) => s + i.producedCount, 0);
  const totalGood = tabData.reduce((s, i) => s + i.goodCount, 0);
  const totalRework = tabData.reduce((s, i) => s + i.reworkCount, 0);
  const totalRejected = tabData.reduce((s, i) => s + i.rejectedCount, 0);

  const handleUpdateStatus = async (id: string, newStatus: 'approved' | 'rejected') => {
    const updated = inspections.map(i =>
      i.id === id ? { ...i, status: newStatus } as QualityInspection : i
    );
    await DataStorage.saveQualityInspections(updated);
    setInspections(updated);
  };

  const columns: Column<QualityInspection>[] = [
    {
      key: 'status',
      header: 'Status',
      width: 110,
      render: (i) => <StatusBadge variant={i.status || 'pending'} />,
    },
    { key: 'date', header: 'Date', width: 110 },
    { key: 'masterId', header: 'Master ID', minWidth: 110 },
    { key: 'batchNumber' as any, header: 'Batch No', minWidth: 110, render: (i: any) => <Text style={{ fontSize: 13, fontWeight: '700', color: '#059669' }}>{i.batchNumber || '—'}</Text> },
    { key: 'partId', header: 'Part ID', minWidth: 120 },
    { key: 'shift', header: 'Shift', width: 90 },
    { key: 'machine', header: 'Machine', minWidth: 110 },
    {
      key: 'producedCount',
      header: 'Produced',
      width: 95,
      render: (i) => <Text style={styles.numCell}>{i.producedCount}</Text>,
    },
    {
      key: 'goodCount',
      header: 'Good ✓',
      width: 90,
      render: (i) => <Text style={[styles.numCell, { color: '#16a34a' }]}>{i.goodCount}</Text>,
    },
    {
      key: 'reworkCount',
      header: 'Rework ↩',
      width: 100,
      render: (i) => (
        <View>
          <Text style={[styles.numCell, { color: '#d97706' }]}>{i.reworkCount}</Text>
          {i.reworkReasons.length > 0 && (
            <Text style={styles.reasonText}>{i.reworkReasons.map((r) => `${r.reason} (${r.count})`).join(', ')}</Text>
          )}
        </View>
      ),
    },
    {
      key: 'rejectedCount',
      header: 'Rejected ✕',
      width: 105,
      render: (i) => (
        <View>
          <Text style={[styles.numCell, { color: '#dc2626' }]}>{i.rejectedCount}</Text>
          {i.rejectionReasons.length > 0 && (
            <Text style={styles.reasonText}>{i.rejectionReasons.map((r) => `${r.reason} (${r.count})`).join(', ')}</Text>
          )}
        </View>
      ),
    },
    { key: 'inspectedBy', header: 'Inspected By', minWidth: 130 },
  ];

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ padding: 16 }}>
      <View style={styles.maxWidth}>
        {/* <PageHeader
          title="Quality Inspection"
          subtitle="In-process and final quality inspection records"
          actionLabel="+ Add Inspection"
          onAction={() => setShowModal(true)}
        /> */}

        {/* Summary Stats */}
        <View style={styles.statRow}>
          <View style={[styles.statBox, { backgroundColor: '#f7fbfa' }]}>
            <Text style={[styles.statVal, { color: '#315451' }]}>{totalProduced}</Text>
            <Text style={styles.statLab}>Total Produced</Text>
          </View>
          <View style={[styles.statBox, { backgroundColor: '#dcfce7' }]}>
            <Text style={[styles.statVal, { color: '#16a34a' }]}>{totalGood}</Text>
            <Text style={[styles.statLab, { color: '#166534' }]}>Good Parts ✓</Text>
          </View>
          <View style={[styles.statBox, { backgroundColor: '#fef3c7' }]}>
            <Text style={[styles.statVal, { color: '#d97706' }]}>{totalRework}</Text>
            <Text style={[styles.statLab, { color: '#92400e' }]}>Rework ↩</Text>
          </View>
          <View style={[styles.statBox, { backgroundColor: '#fee2e2' }]}>
            <Text style={[styles.statVal, { color: '#dc2626' }]}>{totalRejected}</Text>
            <Text style={[styles.statLab, { color: '#991b1b' }]}>Rejected ✕</Text>
          </View>
        </View>

        {/* Tab Bar */}
        <View style={styles.tabBar}>
          {(['in_process', 'final', 'history'] as const).map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[styles.tab, activeTab === tab && styles.tabActive]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                {tab === 'in_process' ? '🔬 Today QI' : tab === 'final' ? '🏁 Today FQI' : '📜 History'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <DataTable
          data={tabData}
          columns={columns}
          keyExtractor={(i) => i.id}
          emptyMessage={`No ${activeTab === 'in_process' ? 'in-process' : 'final'} inspection records.`}
        />

        {/* Form Modal */}
        <FormModal
          visible={showModal}
          title={activeTab === 'in_process' ? 'Add In-Process Inspection' : 'Add Final Inspection (FQI)'}
          subtitle="Enter quality inspection results for this batch"
          onClose={() => { setShowModal(false); setFormData({}); setValidationError(''); }}
          onSave={handleSave}
          saveLabel="Save Inspection"
        >
          {validationError ? (
            <View style={styles.validationError}>
              <Text style={styles.validationErrorText}>⚠ {validationError}</Text>
            </View>
          ) : null}
          <FormField label="Date" required>
            <DatePicker value={formData.date || ''} onChange={(d) => setFormData({ ...formData, date: d })} placeholder="Select inspection date" />
          </FormField>
          <FormField label="Master ID" required>
            <Select
              label="Master Batch"
              placeholder="Select Master ID"
              value={formData.masterId || ''}
              options={batches.map(b => ({ label: b, value: b }))}
              onSelect={(val) => setFormData({ ...formData, masterId: val })}
            />
          </FormField>
          <FormField label="Batch No">
            <TextInput
              style={inputStyle.input}
              placeholder="Enter Batch Number (optional)"
              value={(formData as any).batchNumber || ''}
              onChangeText={(t) => setFormData({ ...formData, batchNumber: t } as any)}
            />
          </FormField>
          <FormField label="Part ID" required>
            <Select
              label="Part ID"
              placeholder="Select Part ID"
              value={formData.partId || ''}
              options={schedules.map(s => ({ label: s.partId, value: s.partId }))}
              onSelect={(val) => setFormData({ ...formData, partId: val })}
            />
          </FormField>
          <FormField label="Shift" required>
            <View style={styles.pillRow}>
              {shifts.map((s) => (
                <TouchableOpacity
                  key={s._id || s.name}
                  style={[styles.pill, formData.shift === s.name && styles.pillActive]}
                  onPress={() => setFormData({ ...formData, shift: s.name })}
                >
                  <Text style={[styles.pillText, formData.shift === s.name && styles.pillTextActive]}>{s.name}</Text>
                </TouchableOpacity>
              ))}
              {shifts.length === 0 && <Text style={{ fontSize: 12, color: '#7a9692' }}>No shifts configured.</Text>}
            </View>
          </FormField>
          <FormField label="Machine" required>
            <Select
              label="Machine"
              placeholder="Select Machine"
              value={formData.machine || ''}
              options={machines.map(m => ({ label: m.name, value: m.machineId }))}
              onSelect={(val) => setFormData({ ...formData, machine: val })}
            />
          </FormField>
          <FormField label="Produced Part Count" required>
            <TextInput style={inputStyle.input} placeholder="0" value={formData.producedCount?.toString()} onChangeText={(t) => setFormData({ ...formData, producedCount: parseInt(t) || 0 })} keyboardType="numeric" />
          </FormField>
          <View style={styles.countRow}>
            <View style={{ flex: 1 }}>
              <FormField label="Good Parts ✓" required>
                <TextInput style={[inputStyle.input, { borderColor: '#86efac' }]} placeholder="0" value={formData.goodCount?.toString()} onChangeText={(t) => setFormData({ ...formData, goodCount: parseInt(t) || 0 })} keyboardType="numeric" />
              </FormField>
            </View>
            <View style={{ flex: 1 }}>
              <FormField label="Rework ↩" required>
                <TextInput style={[inputStyle.input, { borderColor: '#fcd34d' }]} placeholder="0" value={formData.reworkCount?.toString()} onChangeText={(t) => setFormData({ ...formData, reworkCount: parseInt(t) || 0 })} keyboardType="numeric" />
              </FormField>
            </View>
            <View style={{ flex: 1 }}>
              <FormField label="Rejected ✕" required>
                <TextInput style={[inputStyle.input, { borderColor: '#fca5a5' }]} placeholder="0" value={formData.rejectedCount?.toString()} onChangeText={(t) => setFormData({ ...formData, rejectedCount: parseInt(t) || 0 })} keyboardType="numeric" />
              </FormField>
            </View>
          </View>

          {(formData.reworkCount || 0) > 0 && (
            <FormField label="Rework Reasons & Counts *" required>
              {(formData.reworkReasons || []).map((r, idx) => (
                <View key={idx} style={styles.reasonRow}>
                  <View style={{ flex: 2 }}>
                    <Select
                      placeholder="Reason"
                      value={r.reason}
                      options={qualityReasons.filter(q => (q.category || q.reasonType || q.reason_type || '').toUpperCase() === 'REWORK').map(q => ({ label: q.reason, value: q.reason }))}
                      onSelect={(v) => {
                        const updated = [...(formData.reworkReasons || [])];
                        updated[idx].reason = v;
                        setFormData({ ...formData, reworkReasons: updated });
                      }}
                    />
                  </View>
                  <TextInput
                    style={[inputStyle.input, { flex: 1, height: 45 }]}
                    placeholder="Qty"
                    keyboardType="numeric"
                    value={r.count?.toString()}
                    onChangeText={(t) => {
                      const updated = [...(formData.reworkReasons || [])];
                      updated[idx].count = parseInt(t) || 0;
                      setFormData({ ...formData, reworkReasons: updated });
                    }}
                  />
                  <TouchableOpacity onPress={() => {
                    const updated = (formData.reworkReasons || []).filter((_, i) => i !== idx);
                    setFormData({ ...formData, reworkReasons: updated });
                  }} style={styles.removeBtn}>
                    <Text style={styles.removeBtnText}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity
                onPress={() => setFormData({ ...formData, reworkReasons: [...(formData.reworkReasons || []), { reason: '', count: 0 }] })}
                style={styles.addReasonBtn}
              >
                <Text style={styles.addReasonBtnText}>+ Add Rework Reason</Text>
              </TouchableOpacity>
            </FormField>
          )}

          {(formData.rejectedCount || 0) > 0 && (
            <FormField label="Rejection Reasons & Counts *" required>
              {(formData.rejectionReasons || []).map((r, idx) => (
                <View key={idx} style={[styles.reasonRow, { backgroundColor: '#fff1f2', borderColor: '#fecdd3' }]}>
                  <View style={{ flex: 2 }}>
                    <Select
                      placeholder="Reason"
                      value={r.reason}
                      options={qualityReasons.filter(q => (q.category || q.reasonType || q.reason_type || '').toUpperCase() === 'REJECTION').map(q => ({ label: q.reason, value: q.reason }))}
                      onSelect={(v) => {
                        const updated = [...(formData.rejectionReasons || [])];
                        updated[idx].reason = v;
                        setFormData({ ...formData, rejectionReasons: updated });
                      }}
                    />
                  </View>
                  <TextInput
                    style={[inputStyle.input, { flex: 1, height: 45 }]}
                    placeholder="Qty"
                    keyboardType="numeric"
                    value={r.count?.toString()}
                    onChangeText={(t) => {
                      const updated = [...(formData.rejectionReasons || [])];
                      updated[idx].count = parseInt(t) || 0;
                      setFormData({ ...formData, rejectionReasons: updated });
                    }}
                  />
                  <TouchableOpacity onPress={() => {
                    const updated = (formData.rejectionReasons || []).filter((_, i) => i !== idx);
                    setFormData({ ...formData, rejectionReasons: updated });
                  }} style={styles.removeBtn}>
                    <Text style={styles.removeBtnText}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity
                onPress={() => setFormData({ ...formData, rejectionReasons: [...(formData.rejectionReasons || []), { reason: '', count: 0 }] })}
                style={styles.addReasonBtn}
              >
                <Text style={styles.addReasonBtnText}>+ Add Rejection Reason</Text>
              </TouchableOpacity>
            </FormField>
          )}
          <FormField label="Inspected By" required>
            <TextInput style={inputStyle.input} placeholder="Inspector name" value={formData.inspectedBy} onChangeText={(t) => setFormData({ ...formData, inspectedBy: t })} />
          </FormField>
        </FormModal>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#edf5f4' },
  maxWidth: { width: '100%', alignSelf: 'center' },
  statRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 12 },
  statBox: {
    flex: 1, minWidth: 100, borderRadius: 12, padding: 16,
    alignItems: 'center', borderWidth: 1, borderColor: '#d7e6e4',
    marginHorizontal: 4, marginBottom: 8,
  },
  statVal: { fontSize: 26, fontWeight: '800' },
  statLab: { fontSize: 12, fontWeight: '700', color: '#5b7773', textAlign: 'center' },
  tabBar: {
    flexDirection: 'row', backgroundColor: '#ffffff',
    borderRadius: 12, padding: 4, borderWidth: 1, borderColor: '#d7e6e4',
    marginBottom: 16,
  },
  tab: {
    flex: 1, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 9, alignItems: 'center',
    marginHorizontal: 2,
  },
  tabActive: { backgroundColor: '#00877f' },
  tabText: { fontSize: 14, fontWeight: '600', color: '#5b7773' },
  tabTextActive: { color: '#ffffff' },
  numCell: { fontSize: 14, fontWeight: '800', color: '#083d3a' },
  reasonText: { fontSize: 10, color: '#7a9692', marginTop: 2, maxWidth: 100 },
  validationError: {
    backgroundColor: '#fee2e2', borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: '#fca5a5',
  },
  validationErrorText: { fontSize: 13, color: '#991b1b', fontWeight: '600' },
  countRow: { flexDirection: 'row' },
  pillRow: { flexDirection: 'row', marginBottom: 8 },
  pill: {
    borderWidth: 1, borderColor: '#c8dbd8', borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 7, backgroundColor: '#f7fbfa',
    marginRight: 8,
  },
  pillActive: { backgroundColor: '#00877f', borderColor: '#00877f' },
  pillText: { fontSize: 13, fontWeight: '600', color: '#486966' },
  pillTextActive: { color: '#ffffff' },
  btnApprove: {
    backgroundColor: '#dcfce7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  btnApproveText: { fontSize: 11, fontWeight: '700', color: '#166534' },
  btnReject: {
    backgroundColor: '#fee2e2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  btnRejectText: { fontSize: 11, fontWeight: '700', color: '#991b1b' },
  reasonRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
    alignItems: 'center',
    backgroundColor: '#f7fbfa',
    padding: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#d7e6e4'
  },
  removeBtn: { backgroundColor: '#fee2e2', borderRadius: 8, padding: 12 },
  removeBtnText: { color: '#dc2626', fontWeight: 'bold' },
  addReasonBtn: { alignSelf: 'flex-start', padding: 8, backgroundColor: '#edf5f4', borderRadius: 6 },
  addReasonBtnText: { fontSize: 12, color: '#486966', fontWeight: 'bold' },
});