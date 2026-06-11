import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, Platform, Modal } from 'react-native';
import { DataStorage, fmtDate } from '../utils/storage';
import { MonthlySchedule } from '../types';
import { DataTable, Column, PageHeader, FormModal, FormField, inputStyle, DatePicker, Select } from '../components';
import { useToast, useConfirm } from '../context';
import { TextInput } from 'react-native';
import * as XLSX from 'xlsx';

export function ScheduleScreen() {
  const { showToast } = useToast();
  const { showConfirm } = useConfirm();
  const [schedules, setSchedules] = useState<MonthlySchedule[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState<Partial<MonthlySchedule>>({});
  const [editId, setEditId] = useState<string | null>(null);
  const [partsMaster, setPartsMaster] = useState<any[]>([]);
  const [materialsMaster, setMaterialsMaster] = useState<any[]>([]);
  const [rawMaterials, setRawMaterials] = useState<any[]>([]);
  const [workOrders, setWorkOrders] = useState<any[]>([]);
  const [stages, setStages] = useState<any[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const data = await DataStorage.getMonthlySchedules();
    const pts = await DataStorage.getParts();
    const mats = await DataStorage.getMaterials();
    const raw = await DataStorage.getRawMaterials();
    const wos = await DataStorage.getWorkOrders();
    const stgs = await DataStorage.getProcessStages('all');
    setSchedules(data);
    setPartsMaster(pts);
    setMaterialsMaster(mats);
    setRawMaterials(raw);
    setWorkOrders(wos);
    setStages(stgs);
  };

  const getAchievedQty = (scheduleId: string) => {
    const scheduleOrders = workOrders.filter(o => String(o.scheduleId) === scheduleId);
    return scheduleOrders.reduce((sum, wo) => {
      const id = String((wo as any)._id || wo.id);
      const orderStages = stages.filter(s => String(s.workOrderId?._id || s.workOrderId) === id);
      if (orderStages.length === 0) return sum;
      const maxGood = Math.max(...orderStages.map(s => s.goodPartsCount || 0));
      return sum + maxGood;
    }, 0);
  };

  const handleSave = async () => {
    if (!formData.partId || !formData.date || !formData.requiredQuantity) {
      showToast({ message: 'Please fill all required fields', type: 'warning' });
      return;
    }
    const today = new Date().toISOString().split('T')[0];
    if (formData.date < today) {
      showToast({ message: 'Scheduled date cannot be in the past', type: 'warning' });
      return;
    }

    const qty = Number(formData.requiredQuantity) || 0;
    const wt = formData.weightPerPartKg || 0;
    const buf = formData.bufferPercent || 0;
    const totalWeightKg = (qty * wt) + (qty * wt * buf / 100);

    const schedData = {
      ...formData,
      serialNumber: formData.serialNumber || (editId ? undefined : `SCH-${Date.now().toString().slice(-6)}`),
      totalWeightKg,
      tenantId: (await DataStorage.getCurrentUser())?.tenantId || 'SYSTEM'
    } as any;

    let result;
    if (editId) {
      result = await DataStorage.updateMonthlySchedule(editId, schedData);
    } else {
      result = await DataStorage.createMonthlySchedule(schedData);
    }

    if (result) {
      showToast({ message: `Schedule ${editId ? 'updated' : 'added'} successfully`, type: 'success' });
      setShowModal(false);
      setFormData({});
      setEditId(null);
      loadData();
    } else {
      showToast({ message: `Failed to ${editId ? 'update' : 'save'} schedule`, type: 'error' });
    }
  };

  const handleEdit = (s: MonthlySchedule) => {
    const id = (s as any)._id || s.id;
    setEditId(id);

    // Ensure the date is in YYYY-MM-DD format for the DatePicker
    let formattedDate = '';
    if (s.date) {
      const d = new Date(s.date);
      if (!isNaN(d.getTime())) {
        formattedDate = d.toISOString().split('T')[0];
      }
    }

    setFormData({
      ...s,
      date: formattedDate
    });
    setShowModal(true);
  };

  const downloadTemplate = () => {
    if (Platform.OS !== 'web') {
      showToast({ message: 'Download only supported on web', type: 'warning' });
      return;
    }
    const templateData = [
      { serialNumber: 'SCH-001', partId: 'P-101', partName: 'Engine Block', requiredQuantity: 500, date: '2026-05-01' },
      { serialNumber: 'SCH-002', partId: 'P-102', partName: 'Clutch Cover', requiredQuantity: 800, date: '2026-05-01' }
    ];
    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Schedules');
    XLSX.writeFile(wb, 'Monthly_Schedule_Template.xlsx');
  };

  const handleFileUpload = async (event: any) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const json = XLSX.utils.sheet_to_json(worksheet);

        if (json.length === 0) {
          showToast({ message: 'Uploaded file is empty', type: 'error' });
          return;
        }

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        let successCount = 0;
        let skippedCount = 0;
        for (const row of json as any[]) {
          if (row.partId && row.partName && row.requiredQuantity && row.date) {
            const rowDate = new Date(row.date);
            if (!isNaN(rowDate.getTime()) && rowDate < todayStart) {
              skippedCount++;
              continue;
            }
            const newItem = {
              serialNumber: row.serialNumber || `SCH-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`,
              partId: row.partId,
              partName: row.partName,
              requiredQuantity: Number(row.requiredQuantity),
              date: row.date,
            };
            await DataStorage.createMonthlySchedule(newItem);
            successCount++;
          }
        }

        const msg = skippedCount > 0
          ? `Imported ${successCount} schedule(s). ${skippedCount} row(s) skipped — past dates are not allowed.`
          : `Successfully imported ${successCount} schedules.`;
        showToast({ message: msg, type: 'success' });
        loadData();
      } catch (err: any) {
        showToast({ message: err.message, type: 'error' });
      }
    };
    reader.readAsBinaryString(file);
    event.target.value = ''; // Reset input
  };

  const triggerUpload = () => {
    if (Platform.OS !== 'web') {
      showToast({ message: 'Bulk Upload only supported on Web currently.', type: 'info' });
      return;
    }
    document.getElementById('scheduleFileInput')?.click();
  };

  const handleDelete = (id: string) => {
    showConfirm({
      title: 'Delete Schedule',
      message: 'Are you sure you want to delete this schedule?',
      isDestructive: true,
      confirmLabel: 'Delete',
      onConfirm: async () => {
        const success = await DataStorage.deleteMonthlySchedule(id);
        if (success) {
          showToast({ message: 'Schedule deleted successfully', type: 'success' });
          loadData();
        } else {
          showToast({ message: 'Failed to delete schedule.', type: 'error' });
        }
      }
    });
  };

  const columns: Column<MonthlySchedule>[] = [
    {
      key: 'actions',
      header: 'Actions',
      width: 160,
      render: (s) => {
        const scheduleId = String((s as any)._id || s.id);
        const linkedOrders = workOrders.filter(wo => String(wo.scheduleId) === scheduleId);
        const isLinked = linkedOrders.length > 0;

        // Completed when: all linked MAIN work orders are COMPLETED, or achieved qty >= required
        const achieved = getAchievedQty(scheduleId);
        const allWoCompleted = isLinked && linkedOrders
          .filter(wo => wo.type === 'MAIN' || !wo.type)
          .every(wo => wo.status === 'COMPLETED');
        const isCompleted = allWoCompleted || (isLinked && achieved >= s.requiredQuantity);

        return (
          <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
            {isLinked ? (
              isCompleted ? (
                <View style={{ backgroundColor: '#f0fdf4', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: '#bbf7d0' }}>
                  <Text style={{ color: '#16a34a', fontSize: 10, fontWeight: '800' }}>COMPLETED</Text>
                </View>
              ) : (
                <View style={{ backgroundColor: '#f7fbfa', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: '#d7e6e4' }}>
                  <Text style={{ color: '#5b7773', fontSize: 10, fontWeight: '800' }}>IN PRODUCTION</Text>
                </View>
              )
            ) : (
              <>
                <TouchableOpacity
                  style={{ backgroundColor: '#e8f8f6', padding: 6, borderRadius: 6, alignItems: 'center' }}
                  onPress={() => handleEdit(s)}
                >
                  <Text style={{ color: '#00877f', fontSize: 12 }}>✏️</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ backgroundColor: '#fee2e2', padding: 6, borderRadius: 6, alignItems: 'center' }}
                  onPress={() => handleDelete(scheduleId)}
                >
                  <Text style={{ color: '#ef4444', fontSize: 12 }}>🗑</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        );
      }
    },
    { key: 'serialNumber', header: 'Serial #', width: 120 },

    { key: 'partId', header: 'Part ID', minWidth: 120 },
    { key: 'partName', header: 'Part Name', minWidth: 150 },
    {
      key: 'requiredQuantity',
      header: 'Required Qty',
      width: 120,
      render: (s) => <Text style={{ fontWeight: '700', color: '#00877f' }}>{s.requiredQuantity}</Text>
    },
    {
      key: 'achievedQuantity',
      header: 'Achieved Qty',
      width: 120,
      render: (s) => {
        const achieved = getAchievedQty((s as any)._id || s.id);
        const color = achieved >= s.requiredQuantity ? '#16a34a' : '#d97706';
        return <Text style={{ fontWeight: '800', color }}>{achieved}</Text>;
      }
    },
    {
      key: 'date',
      header: 'Date',
      width: 120,
      render: (s) => <Text style={{ fontSize: 13, color: '#315451' }}>{fmtDate(s.date)}</Text>
    },
  ];

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ padding: 16 }}>
      <View style={styles.maxWidth}>
        <PageHeader
          title="Monthly Customer Schedules"
          subtitle="Manage monthly production requirements pushed by customers."
          actionLabel="+ Add Form Entry"
          onAction={async () => {
            await loadData(); // Ensure latest inventory is loaded for dropdowns
            setShowModal(true);
          }}
        />

        {/* Upload & Template Actions */}
        <View style={styles.actionRow}>
          {Platform.OS === 'web' && (
            <input
              type="file"
              id="scheduleFileInput"
              accept=".xlsx,.xls,.csv"
              style={{ display: 'none' }}
              onChange={handleFileUpload}
            />
          )}
          <TouchableOpacity style={[styles.btnBox, { backgroundColor: '#e8f8f6', borderColor: '#bfdbfe' }]} onPress={downloadTemplate}>
            <Text style={{ fontSize: 13, color: '#006b65', fontWeight: '600' }}>📥 Download Format (Excel/CSV)</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.btnBox, { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' }]} onPress={triggerUpload}>
            <Text style={{ fontSize: 13, color: '#166534', fontWeight: '600' }}>📤 Bulk Import via Excel/CSV</Text>
          </TouchableOpacity>
        </View>

        <DataTable
          data={schedules}
          columns={columns}
          keyExtractor={(s) => s.id || s._id || s.serialNumber || Date.now().toString()}
          emptyMessage="No schedules found. Start by entering manually or importing via Excel."
        />

        <FormModal
          visible={showModal}
          title={editId ? "Edit Schedule" : "Add New Schedule"}
          subtitle={editId ? "Modify component target quantity" : "Manually enter a component's target quantity for a month"}
          onClose={() => { setShowModal(false); setFormData({}); setEditId(null); }}
          onSave={handleSave}
          saveLabel="Save Schedule"
        >
          <FormField label="Part ID" required>
            <Select
              placeholder="Select Part"
              value={formData.partId || ''}
              options={partsMaster.map(p => ({ label: `${p.partId} | ${p.partName}`, value: p.partId }))}
              onSelect={(val) => {
                const part = partsMaster.find(p => p.partId === val);
                if (part) {
                  const qty = Number(formData.requiredQuantity) || 0;
                  const wt = Number(part.weightPerPartKg || 0);
                  const buf = Number(part.bufferPercent || 0);
                  const baseWt = qty * wt;
                  const totalWt = baseWt + (baseWt * buf / 100);
                  setFormData({
                    ...formData,
                    partId: val,
                    partName: part.partName,
                    materialId: part.materialId,
                    weightPerPartKg: wt,
                    bufferPercent: buf,
                    totalWeightKg: totalWt,
                    materialReceiptId: '',
                    batchNumber: '',
                    grade: ''
                  });
                } else {
                  setFormData({ ...formData, partId: val, materialReceiptId: '', batchNumber: '', grade: '' });
                }
              }}
            />
          </FormField>
          <FormField label="Part Name">
            <TextInput
              style={[inputStyle.input, { backgroundColor: '#edf5f4' }]}
              editable={false}
              value={formData.partName}
            />
          </FormField>
          <FormField label="Weight Per Part (KG)">
            <TextInput
              style={[inputStyle.input, { backgroundColor: '#edf5f4' }]}
              editable={false}
              value={formData.weightPerPartKg !== undefined ? String(formData.weightPerPartKg) : '0'}
            />
          </FormField>
          <FormField label="Buffer %">
            <TextInput
              style={[inputStyle.input, { backgroundColor: '#edf5f4' }]}
              editable={false}
              value={formData.bufferPercent !== undefined ? String(formData.bufferPercent) : '0'}
            />
          </FormField>
          {formData.materialId && rawMaterials.some(m => m.materialId === formData.materialId && m.status === 'APPROVED') && (
            <FormField label="Select Batch *">
              <Select
                placeholder="Select Batch"
                value={formData.materialReceiptId || ''}
                options={rawMaterials
                  .filter(m => m.materialId === formData.materialId && m.status === 'APPROVED')
                  .map(m => {
                    const remaining = (m.receivedQuantity || 0) - (m.rejectedQuantity || 0) - (m.usedQuantity || 0);
                    return {
                      label: `Batch-${m.batchNumber || '—'} | ${remaining.toFixed(0)} KG avail`,
                      value: String((m as any)._id || m.id || '')
                    };
                  })}
                onSelect={(val) => {
                  const batch = rawMaterials.find(m => String((m as any)._id || m.id || '') === val);
                  if (batch) {
                    setFormData({
                      ...formData,
                      materialReceiptId: val,
                      batchNumber: batch.batchNumber || '',
                      grade: batch.grade || formData.grade || ''
                    });
                  }
                }}
              />
            </FormField>
          )}
          {formData.materialId && (
            !rawMaterials.some(m => m.materialId === formData.materialId && m.status === 'APPROVED') ||
            !!formData.materialReceiptId
          ) && (
            <FormField label="Raw Material">
              <TextInput
                style={[inputStyle.input, { backgroundColor: '#edf5f4' }]}
                editable={false}
                value={(() => {
                  const mat = materialsMaster.find(m => m.materialId === formData.materialId);
                  return mat ? `${mat.materialId} | ${mat.materialName}` : (formData.materialId || '—');
                })()}
              />
            </FormField>
          )}
          {/* <FormField label="Available Weight (KG)">
            <TextInput
              style={[inputStyle.input, { backgroundColor: '#edf5f4', fontWeight: '800', color: '#16a34a' }]}
              editable={false}
              value={(() => {
                if (!formData.materialId) return '0';
                const totalReceived = rawMaterials
                  .filter(m => m.materialId === formData.materialId && m.status === 'APPROVED')
                  .reduce((sum, m) => sum + (m.receivedQuantity || 0), 0);
                const totalScheduled = schedules
                  .filter(s => s.materialId === formData.materialId && (s.id || (s as any)._id) !== editId)
                  .reduce((sum, s) => sum + (s.totalWeightKg || 0), 0);
                return (totalReceived - totalScheduled).toFixed(2);
              })()}
            />
          </FormField> */}
          <FormField label="Required Quantity (Nos) *" required>
            <TextInput
              style={inputStyle.input}
              placeholder="0"
              keyboardType="numeric"
              value={formData.requiredQuantity?.toString() || ''}
              onChangeText={(t) => {
                const val = t.replace(/[^0-9]/g, '');
                setFormData({ ...formData, requiredQuantity: val });
              }}
            />
          </FormField>
          <FormField label="Scheduled Date" required>
            <DatePicker
              value={formData.date || ''}
              minDate={new Date().toLocaleDateString('en-CA')}
              onChange={(d) => setFormData({ ...formData, date: d })}
              placeholder="Select month/date"
            />
          </FormField>
          <FormField label="Total Weight (Including Buffer) (KG)">
            <TextInput
              style={[inputStyle.input, { backgroundColor: '#edf5f4', fontWeight: '800', color: '#16a34a' }]}
              editable={false}
              value={(() => {
                const qty = Number(formData.requiredQuantity) || 0;
                const wt = formData.weightPerPartKg || 0;
                const buf = formData.bufferPercent || 0;
                return ((qty * wt) + (qty * wt * buf / 100)).toFixed(3);
              })()}
            />
          </FormField>
        </FormModal>

      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#edf5f4' },
  maxWidth: { width: '100%', alignSelf: 'center' },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  btnBox: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
  }
});
