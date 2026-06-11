import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { DataStorage, API_BASE_URL, fmtDate, fmtDateTime } from '../utils/storage';
import { RawMaterial, MonthlySchedule, User } from '../types';
import { DataTable, Column, PageHeader, FormModal, FormField, inputStyle, DatePicker, StatusBadge, Select } from '../components';
import { useToast, useConfirm } from '../context';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import * as XLSX from 'xlsx';

type TabKey = 'raw' | 'schedule' | 'usage';

interface InventoryScreenProps {
  user?: User;
}

export function InventoryScreen({ user: propUser }: InventoryScreenProps) {
  const { showToast } = useToast();
  const { showConfirm } = useConfirm();
  const [activeTab, setActiveTab] = useState<TabKey>('raw');
  const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>([]);
  const [schedules, setSchedules] = useState<MonthlySchedule[]>([]);
  const [workOrders, setWorkOrders] = useState<any[]>([]);
  const [stages, setStages] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState<Partial<RawMaterial>>({});
  const [schedFormData, setSchedFormData] = useState<Partial<MonthlySchedule>>({});
  const [showSchedModal, setShowSchedModal] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(propUser || null);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectFormData, setRejectFormData] = useState({ id: '', totalQty: 0, rejectedQty: 0, reason: '' });
  const [selectedMaterialForHistory, setSelectedMaterialForHistory] = useState<RawMaterial | null>(null);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [materialsMaster, setMaterialsMaster] = useState<any[]>([]);
  const [partsMaster, setPartsMaster] = useState<any[]>([]);
  const [editSchedId, setEditSchedId] = useState<string | null>(null);
  const [deleteSchedConfirmId, setDeleteSchedConfirmId] = useState<string | null>(null);
  const [stockSummary, setStockSummary] = useState<any>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const rawRefs = useRef<(TextInput | null)[]>([]);
  const schedRefs = useRef<(TextInput | null)[]>([]);

  const focusRaw = (index: number) => rawRefs.current[index]?.focus();
  const focusSched = (index: number) => schedRefs.current[index]?.focus();

  useEffect(() => {
    loadData();
  }, [activeTab]);

  const loadData = async () => {
    const materials = await DataStorage.getRawMaterials();
    const sched = await DataStorage.getMonthlySchedules();
    const orders = await DataStorage.getWorkOrders();
    const stgs = await DataStorage.getProcessStages();
    const matsMaster = await DataStorage.getMaterials();
    const ptsMaster = await DataStorage.getParts();

    setRawMaterials(materials);
    setSchedules(sched);
    setWorkOrders(orders);
    setStages(stgs);
    setMaterialsMaster(matsMaster);
    setPartsMaster(ptsMaster);

    // Load stock summary for the dashboard panel
    const summary = await DataStorage.getStockSummary();
    setStockSummary(summary);

    // Fallback if prop not provided
    if (!currentUser) {
      const user = await DataStorage.getCurrentUser();
      setCurrentUser(user);
    }
  };

  const handleSaveMaterial = async () => {
    if (!formData.rawMaterialId || !formData.grade || !formData.batchNumber) {
      showToast({ message: 'Material ID, Grade, and Batch Number are required.', type: 'warning' });
      return;
    }
    const today = new Date().toISOString().split('T')[0];
    if (formData.date && formData.date > today) {
      showToast({ message: 'Date Received cannot be a future date.', type: 'warning' });
      return;
    }
    const newMaterial: any = {
      materialId: formData.rawMaterialId || '',
      grade: formData.grade || '',
      batchNumber: formData.batchNumber || '',
      receivedQuantity: formData.receivedQuantity || 0,
      dateReceived: formData.date || new Date().toISOString().split('T')[0],
      receivedById: currentUser?.id || 'SYSTEM_USER',
      receivedByName: formData.receivedBy || currentUser?.name || 'System',
      numberOfComponents: formData.requiredComponents || 0,
      weightPerComponentKg: formData.weightPerComponent || 0,
      status: 'PENDING',
      tenantId: currentUser?.tenantId || 'SYSTEM',
    };
    const saved = await DataStorage.createRawMaterial(newMaterial);
    if (saved) {
      await loadData(); // Reload from backend to get the latest list with real IDs
      setShowModal(false);
      setFormData({});
      showToast({ message: 'Material saved successfully.', type: 'success' });
    } else {
      showToast({ message: 'Failed to save raw material.', type: 'error' });
    }
  };

  const handleSaveSchedule = async () => {
    if (!schedFormData.partId || !schedFormData.date || !schedFormData.requiredQuantity) {
      showToast({ message: 'Please fill all required fields.', type: 'warning' });
      return;
    }
    const today = new Date().toISOString().split('T')[0];
    if (schedFormData.date < today) {
      showToast({ message: 'Scheduled date cannot be in the past.', type: 'warning' });
      return;
    }
    const qty = Number(schedFormData.requiredQuantity) || 0;
    const wt = schedFormData.weightPerPartKg || 0;
    const buf = schedFormData.bufferPercent || 0;
    const totalWeight = (qty * wt) + (qty * wt * (buf / 100));
    
    // Calculate remaining weight for this batch
    const usedWeight = schedules
      .filter(s => s.materialReceiptId === schedFormData.materialReceiptId && (s.id || (s as any)._id) !== editSchedId)
      .reduce((sum, s) => sum + (s.totalWeightKg || 0), 0);
    const batch = rawMaterials.find(m => (m._id || m.id) === schedFormData.materialReceiptId);
    const availableWeight = (batch?.receivedQuantity || 0) - usedWeight;

    if (totalWeight > (availableWeight + 0.001)) {
      showToast({ message: `Required weight (${totalWeight.toFixed(2)} KG) exceeds remaining batch weight (${availableWeight.toFixed(2)} KG).`, type: 'warning' });
      return;
    }

    const schedData: any = {
      serialNumber: schedFormData.serialNumber || (editSchedId ? undefined : String(schedules.length + 1)),
      partId: schedFormData.partId || '',
      partName: schedFormData.partName || '',
      requiredQuantity: qty,
      weightPerPartKg: wpp,
      bufferPercent: buffer,
      totalWeightKg: totalWeight,
      date: schedFormData.date || new Date().toISOString().split('T')[0],
      materialId: schedFormData.materialId || '',
      grade: schedFormData.grade || '',
      tenantId: currentUser?.tenantId || 'SYSTEM'
    };

    let saved;
    if (editSchedId) {
      saved = await DataStorage.updateMonthlySchedule(editSchedId, schedData);
    } else {
      saved = await DataStorage.createMonthlySchedule(schedData);
    }

    if (saved) {
      await loadData();
      setShowSchedModal(false);
      setSchedFormData({});
      setEditSchedId(null);
      showToast({ message: 'Schedule saved successfully.', type: 'success' });
    } else {
      showToast({ message: `Failed to ${editSchedId ? 'update' : 'save'} schedule.`, type: 'error' });
    }
  };

  const handleEditSched = (s: MonthlySchedule) => {
    const id = (s as any)._id || s.id;
    setEditSchedId(id);
    
    let formattedDate = '';
    if (s.date) {
      const d = new Date(s.date);
      if (!isNaN(d.getTime())) {
        formattedDate = d.toISOString().split('T')[0];
      }
    }

    setSchedFormData({ 
      ...s, 
      date: formattedDate 
    });
    setShowSchedModal(true);
  };

  const handleImportExcel = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
          'text/csv',
          'application/csv'
        ],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setIsImporting(true);
        const file = result.assets[0];

        let response;
        if (activeTab === 'raw') {
          response = await DataStorage.uploadInventoryExcel(file);
        } else {
          response = await DataStorage.uploadScheduleExcel(file);
        }

        setIsImporting(false);
        if (response.success) {
          showToast({ message: response.message, type: 'success' });
          await loadData();
        } else {
          showToast({ message: response.message, type: 'error' });
        }
      }
    } catch (e: any) {
      setIsImporting(false);
      showToast({ message: e.message || 'An error occurred during import.', type: 'error' });
    }
  };

  const downloadSample = async () => {
    const headers = activeTab === 'raw'
      ? 'materialId,grade,receivedQuantity,batchNumber,weightPerComponentKg,numberOfComponents,dateReceived\nRM-001,A,500,BATCH-001,0.5,1000,2024-04-18'
      : 'serialNumber,partId,partName,requiredQuantity,date\n1,RE-001,Engine Cover,500,2024-05-01';

    const fileName = activeTab === 'raw' ? 'inventory_sample.csv' : 'schedule_sample.csv';

    if (Platform.OS === 'web') {
      const blob = new Blob([headers], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
    } else {
      const fileUri = FileSystem.documentDirectory + fileName;
      await FileSystem.writeAsStringAsync(fileUri, headers, { encoding: FileSystem.EncodingType.UTF8 });
      await Sharing.shareAsync(fileUri);
    }
  };

  const handleSyncAll = async () => {
    try {
      const resp = await fetch(`${API_BASE_URL}/inventory/sync-all`, {
        headers: await DataStorage.getHeaders()
      });
      if (resp.ok) {
        showToast({ message: 'Inventory stock levels have been recalculated.', type: 'success' });
        await loadData();
      } else {
        const err = await resp.json();
        showToast({ message: err.message || 'Failed to sync stock.', type: 'error' });
      }
    } catch (e: any) {
      showToast({ message: 'Network error.', type: 'error' });
    }
  };

  const handleDeleteRaw = (id: string) => {
    showConfirm({
      title: 'Delete Material',
      message: 'Are you sure you want to delete this raw material?',
      isDestructive: true,
      confirmLabel: 'Delete',
      onConfirm: async () => {
        const success = await DataStorage.deleteRawMaterial(id);
        if (success) {
          loadData();
          showToast({ message: 'Deleted successfully.', type: 'success' });
        } else {
          showToast({ message: 'Failed to delete.', type: 'error' });
        }
      }
    });
  };

  const handleDeleteSched = async () => {
    if (!deleteSchedConfirmId) return;
    const success = await DataStorage.deleteMonthlySchedule(deleteSchedConfirmId);
    if (success) {
      setDeleteSchedConfirmId(null);
      loadData();
      showToast({ message: 'Schedule deleted.', type: 'success' });
    } else {
      showToast({ message: 'Failed to delete schedule.', type: 'error' });
    }
  };

  // Summary stats
  const totalApprovedKg = rawMaterials
    .filter(m => m.status === 'APPROVED' || m.status === 'PARTIAL_REJECT')
    .reduce((s, m) => s + (m.receivedQuantity - (m.rejectedQuantity || 0)), 0);

  const totalUsedKg = rawMaterials
    .reduce((s, m) => s + (m.usedQuantity || 0), 0);

  const remainingKg = Math.max(0, totalApprovedKg - totalUsedKg);

  const pendingKg = rawMaterials
    .filter(m => m.status === 'PENDING')
    .reduce((s, m) => s + m.receivedQuantity, 0);

  const totalBatches = new Set(rawMaterials.map((m) => m.batchNumber)).size;

  // Usage grouped by Material (masterId + grade)
  const materialGroups = (() => {
    const map: Record<string, {
      masterId: string;
      grade: string;
      totalUsedKg: number;
      totalGoodParts: number;
      processUsage: Record<string, number>;
      wos: Array<{
        woSlug: string; partId: string; partName: string;
        targetParts: number; usedKg: number; goodParts: number;
        status: string; date: string;
        processSummary: Record<string, number>;
      }>;
    }> = {};

    workOrders.forEach(wo => {
      const woId = String((wo as any)._id || wo.id || '');
      const key = `${wo.masterId || 'UNKNOWN'}__${wo.materialGrade || 'N/A'}`;
      const woStages = stages.filter(s => {
        const sWoId = typeof s.workOrderId === 'string' ? s.workOrderId : s.workOrderId?._id || s.workOrderId?.id;
        return String(sWoId) === woId;
      });

      const usedKg = (wo.requiredQuantityKg || 0) + (wo.bufferKg || 0);
      const lastGoodStage = [...woStages].reverse().find((st: any) => (st.goodPartsCount || 0) > 0);
      const goodParts = lastGoodStage ? (lastGoodStage as any).goodPartsCount : 0;

      // Process-wise breakdown for this WO
      const woProcessUsage: Record<string, number> = {};
      woStages.forEach(s => {
        if (s.inputQuantity) {
          woProcessUsage[s.type] = (woProcessUsage[s.type] || 0) + s.inputQuantity;
        }
      });

      if (!map[key]) {
        map[key] = {
          masterId: wo.masterId || '—',
          grade: wo.materialGrade || '—',
          totalUsedKg: 0, totalGoodParts: 0, processUsage: {}, wos: []
        };
      }
      map[key].totalUsedKg += usedKg;
      map[key].totalGoodParts += goodParts;

      // Aggregate process usage to the material group
      Object.entries(woProcessUsage).forEach(([type, qty]) => {
        map[key].processUsage[type] = (map[key].processUsage[type] || 0) + qty;
      });

      map[key].wos.push({
        woSlug: wo?.workOrderId || `WO-${woId.slice(-6).toUpperCase()}`,
        partId: wo.partId || '—',
        partName: wo.partName || '—',
        targetParts: wo.targetPartCount || 0,
        usedKg, goodParts,
        status: wo.status,
        date: wo.date || '',
        processSummary: woProcessUsage,
      });
    });
    return Object.values(map);
  })();

  const handleUpdateStatus = async (id: string, newStatus: 'approved' | 'rejected') => {
    if (newStatus === 'rejected') {
      const item = rawMaterials.find(m => m.id === id || m._id === id);
      if (item) {
        setRejectFormData({
          id: item.id || item._id || '',
          totalQty: item.receivedQuantity,
          rejectedQty: item.receivedQuantity,
          reason: ''
        });
        setShowRejectModal(true);
        return;
      }
    }

    const item = rawMaterials.find(m => m.id === id || m._id === id);
    if (!item) return;

    const updatedItem = {
      ...item,
      status: 'APPROVED' as any,
      approvedById: currentUser?.id,
      approvedByName: currentUser?.name || 'System'
    };
    const saved = await DataStorage.updateRawMaterial(id, updatedItem);
    if (saved) {
      await loadData();
    }
  };

  const handleSaveReject = async () => {
    if (rejectFormData.rejectedQty <= 0) {
      showToast({ message: 'Rejected quantity must be greater than 0', type: 'warning' });
      return;
    }
    if (rejectFormData.rejectedQty > rejectFormData.totalQty) {
      showToast({ message: 'Cannot reject more than received', type: 'warning' });
      return;
    }
    const item = rawMaterials.find(m => m.id === rejectFormData.id || m._id === rejectFormData.id);
    if (!item) return;

    let newStatus = 'PARTIAL_REJECT';
    if (rejectFormData.rejectedQty === rejectFormData.totalQty) {
      newStatus = 'REJECTED';
    }

    const updatedItem = {
      ...item,
      status: newStatus as any,
      rejectedQuantity: rejectFormData.rejectedQty,
      rejectionReason: rejectFormData.reason || '',
      approvedById: currentUser?.id,
      approvedByName: currentUser?.name || 'System'
    };
    const saved = await DataStorage.updateRawMaterial(rejectFormData.id, updatedItem);
    if (saved) {
      await loadData();
      setShowRejectModal(false);
      setRejectFormData({ id: '', totalQty: 0, rejectedQty: 0, reason: '' });
    }
  };

  // Columns
  // Columns
  const rawColumns: Column<RawMaterial>[] = [
    {
      key: 'id',
      header: 'Actions',
      width: 220,
      searchable: false,
      render: (m) => {
        const itemStatus = (m.status || '').trim().toUpperCase();
        if (itemStatus !== 'PENDING') return <StatusBadge variant={m.status} />;

        const role = (currentUser?.role || '').toLowerCase();
        const email = (currentUser?.email || '').toLowerCase();
        const username = (currentUser?.username || '').toLowerCase();
        const isAuthorizedUser =
          role.includes('admin') ||
          role.includes('super') ||
          role.includes('tenant') ||
          role.includes('inventory_qi') ||
          email.includes('invqi') ||
          username.includes('invqi');

        if (!isAuthorizedUser) return <StatusBadge variant={m.status} />;

        const itemId = m._id || m.id || '';
        if (!itemId) return <Text style={{ fontSize: 10, color: 'red' }}>Error: No ID</Text>;

        const isAdmin = role.includes('admin') || role.includes('tenant') || role.includes('super');

        return (
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <TouchableOpacity style={[styles.btnApprove, { marginRight: 4 }]} onPress={() => handleUpdateStatus(itemId, 'approved')}>
              <Text style={styles.btnApproveText}>Approve</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnReject} onPress={() => handleUpdateStatus(itemId, 'rejected')}>
              <Text style={styles.btnRejectText}>Reject</Text>
            </TouchableOpacity>
            {isAdmin && (
              <TouchableOpacity
                style={{ backgroundColor: '#f0f9ff', padding: 6, borderRadius: 6, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#bae6fd' }}
                onPress={() => {
                  setSelectedMaterialForHistory(m);
                  setShowHistoryModal(true);
                }}
              >
                <Text style={{ color: '#006b65', fontSize: 12 }}>📋 Hist</Text>
              </TouchableOpacity>
            )}
            {isAdmin && (
              <TouchableOpacity style={{ backgroundColor: '#fee2e2', padding: 6, borderRadius: 6, alignItems: 'center', justifyContent: 'center' }} onPress={() => handleDeleteRaw(itemId)}>
                <Text style={{ color: '#ef4444', fontSize: 12 }}>🗑</Text>
              </TouchableOpacity>
            )}
          </View>
        );
      },
    },
    {
      key: 'status',
      header: 'Status',
      width: 110,
      render: (m) => <StatusBadge variant={m.status} />,
    },
    { key: 'materialId', header: 'Material ID', minWidth: 120 },
    { key: 'grade', header: 'Grade', width: 80 },
    { key: 'batchNumber', header: 'Batch No', minWidth: 120 },
    {
      key: 'usedQuantity',
      header: 'Remaining (KG)',
      width: 120,
      align: 'right',
      render: (m) => {
        const remaining = m.receivedQuantity - (m.rejectedQuantity || 0) - (m.usedQuantity || 0);
        const isLow = remaining < 100 && remaining > 0;
        const isEmpty = remaining <= 0;
        return (
          <View>
            <Text style={[
              styles.numericCell,
              {
                color: isEmpty ? '#ef4444' : (isLow ? '#f59e0b' : '#15803d'),
                fontWeight: '700',
                textAlign: 'right'
              }
            ]}>
              {remaining.toLocaleString()}
            </Text>
          </View>
        );
      },
    },
    {
      key: 'receivedQuantity',
      header: 'Recv (KG)',
      width: 100,
      align: 'right',
      render: (m) => <Text style={[styles.numericCell, { textAlign: 'right' }]}>{m.receivedQuantity.toLocaleString()}</Text>,
    },

    {
      key: 'dateReceived',
      header: 'Date Received',
      width: 140,
      render: (m) => <Text style={{ fontSize: 12 }}>{fmtDate(m.dateReceived)}</Text>
    },
    { key: 'receivedByName', header: 'Recv By', minWidth: 120 },

  ];

  const schedColumns: Column<MonthlySchedule>[] = [
    {
      key: 'actions',
      header: 'Actions',
      width: 160,
      render: (s) => {
        const role = (currentUser?.role || '').toLowerCase();
        const canEdit = role.includes('admin') || role.includes('super') || role.includes('tenant') || role.includes('pdc');
        if (!canEdit) return <Text style={{ fontSize: 11, color: '#7a9692' }}>—</Text>;
        const id = (s as any)._id || s.id || '';
        return (
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <TouchableOpacity
              style={{ backgroundColor: '#e8f8f6', padding: 6, borderRadius: 6, alignItems: 'center' }}
              onPress={() => handleEditSched(s)}
            >
              <Text style={{ color: '#00877f', fontSize: 12 }}>✏️</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{ backgroundColor: '#fee2e2', padding: 6, borderRadius: 6, alignItems: 'center' }}
              onPress={() => {
                showConfirm({
                  title: 'Delete Schedule',
                  message: 'Are you sure you want to delete this schedule?',
                  isDestructive: true,
                  onConfirm: async () => {
                    const success = await DataStorage.deleteMonthlySchedule(id);
                    if (success) {
                      loadData();
                      showToast({ message: 'Schedule deleted.', type: 'success' });
                    } else {
                      showToast({ message: 'Failed to delete schedule.', type: 'error' });
                    }
                  }
                });
              }}
            >
              <Text style={{ color: '#ef4444', fontSize: 12 }}>🗑</Text>
            </TouchableOpacity>
          </View>
        );
      }
    },
    { key: 'serialNumber', header: 'S.No', width: 70 },
    { key: 'partId', header: 'Part ID', minWidth: 120 },
    { key: 'partName', header: 'Part Name', minWidth: 180 },
    {
      key: 'requiredQuantity',
      header: 'Schedule Qty',
      width: 120,
      render: (s) => <Text style={styles.numericCell}>{s.requiredQuantity.toLocaleString()}</Text>,
    },
    {
      key: 'date',
      header: 'Date',
      width: 120,
      render: (s) => <Text style={{ fontSize: 13, color: '#315451' }}>{fmtDate(s.date)}</Text>
    },
  ];

  const role = (currentUser?.role || '').toLowerCase();
  const email = (currentUser?.email || '').toLowerCase();
  const canAddSched = role.includes('admin') || role.includes('tenant') || role.includes('super') || role.includes('pdc');

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ padding: 16 }}>
      <View style={styles.maxWidth}>
        <PageHeader
          title="Inventory Management"
          subtitle={activeTab === 'raw' ? "Track raw materials and incoming batches" : "Manage monthly production schedules"}
          actionLabel={activeTab === 'raw' ? (((role.includes('qi') && !role.includes('admin')) || email.includes('invqi')) ? undefined : 'Add Inventory') : undefined}
          actionIcon={activeTab === 'raw' ? (((role.includes('qi') && !role.includes('admin')) || email.includes('invqi')) ? undefined : '📦') : undefined}
          onAction={async () => {
            if (activeTab === 'raw') {
              setFormData({ receivedBy: currentUser?.name || '', date: new Date().toISOString().split('T')[0] });
              setShowModal(true);
            } else if (canAddSched) {
              setSchedFormData({ date: new Date().toISOString().split('T')[0] });
              setEditSchedId(null);
              await loadData(); // Ensure latest inventory is loaded for dropdowns
              setShowSchedModal(true);
            }
          }}
        />

        {/* Action Bar for Excel */}
        {!((role.includes('qi') && !role.includes('admin')) || email.includes('invqi')) && (
          <View style={styles.actionBar}>
            <TouchableOpacity style={styles.actionBtn} onPress={handleImportExcel}>
              <Text style={styles.actionBtnText}>📂 Import Excel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#f7fbfa', borderColor: '#d7e6e4', borderWidth: 1 }]} onPress={handleSyncAll}>
              <Text style={[styles.actionBtnText, { color: '#486966' }]}>🔄 Refresh Stock</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtnOutline} onPress={downloadSample}>
              <Text style={styles.actionBtnOutlineText}>⬇ Sample</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Temporary Role Debug Header for User Verification */}
        {/* <View style={{ backgroundColor: '#fff7ed', padding: 8, borderRadius: 8, borderWidth: 1, borderColor: '#ffedd5', marginBottom: 12, flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ fontSize: 12, color: '#9a3412', fontWeight: '600' }}>
            User Context: <Text style={{ fontWeight: '800' }}>{currentUser?.email}</Text> | Role: <Text style={{ fontWeight: '800' }}>{currentUser?.role}</Text> | Perms: <Text style={{ fontWeight: '800' }}>{((currentUser?.role || '').toLowerCase().includes('qi') || (currentUser?.role || '').toLowerCase().includes('admin') || currentUser?.email === 'invqi@ck.com') ? 'GRANTED' : 'DENIED'}</Text>
          </Text>
        </View> */}

        {/* Summary Stats */}
        <View style={styles.statRow}>
          <View style={[styles.statBox, { backgroundColor: '#dcfce7' }]}>
            <Text style={[styles.statValue, { color: '#15803d' }]}>{totalApprovedKg.toFixed(1)}</Text>
            <Text style={[styles.statLabel, { color: '#15803d' }]}>Total Approved (KG)</Text>
          </View>
          <View style={[styles.statBox, { backgroundColor: '#fef3c7' }]}>
            <Text style={[styles.statValue, { color: '#b45309' }]}>{totalUsedKg.toFixed(1)}</Text>
            <Text style={[styles.statLabel, { color: '#b45309' }]}>Total Used (KG)</Text>
          </View>
          <View style={[styles.statBox, { backgroundColor: '#e8f8f6' }]}>
            <Text style={[styles.statValue, { color: '#00877f' }]}>{remainingKg.toFixed(1)}</Text>
            <Text style={[styles.statLabel, { color: '#00877f' }]}>Remaining (KG)</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{pendingKg.toLocaleString()}</Text>
            <Text style={styles.statLabel}>Pending Approval</Text>
          </View>
        </View>

        {/* Tab Bar */}
        <View style={styles.tabBar}>
          {(['raw', 'schedule', 'usage'] as TabKey[]).map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[styles.tab, activeTab === tab && styles.tabActive]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                {tab === 'raw' ? '📦 Raw Materials' : tab === 'schedule' ? '📅 Monthly Schedule' : '📊 WO Usage'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Stock Summary Dashboard Panel */}
        {activeTab === 'usage' && stockSummary && (
          <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 18, marginBottom: 4, borderWidth: 1, borderColor: '#d7e6e4', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 }}>

            {/* Panel title */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <Text style={{ fontSize: 20 }}>📊</Text>
              <Text style={{ fontSize: 17, fontWeight: '900', color: '#083d3a' }}>Stock Summary</Text>
            </View>

            {/* Inventory + WIP row */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
              {[
                { icon: '🏗️', label: 'Raw Inventory', value: (stockSummary.rawInventoryKg || 0).toFixed(1), unit: 'KG', color: '#00877f', bg: '#e8f8f6', border: '#bfdbfe' },
                { icon: '⚙️', label: 'Work In Progress', value: (stockSummary.wipKg || 0).toFixed(1), unit: 'KG', color: '#d97706', bg: '#fef3c7', border: '#fde68a' },
                { icon: '✅', label: 'Available (Net)', value: (stockSummary.availableInventoryKg || 0).toFixed(1), unit: 'KG', color: '#15803d', bg: '#dcfce7', border: '#86efac' },
              ].map(item => (
                <View key={item.label} style={{ flex: 1, minWidth: 110, backgroundColor: item.bg, borderRadius: 12, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: item.border }}>
                  <Text style={{ fontSize: 22, marginBottom: 6 }}>{item.icon}</Text>
                  <Text style={{ fontSize: 22, fontWeight: '900', color: item.color, lineHeight: 26 }}>{item.value}</Text>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: item.color }}>{item.unit}</Text>
                  <Text style={{ fontSize: 11, fontWeight: '600', color: item.color, marginTop: 4, textAlign: 'center', opacity: 0.8 }}>{item.label}</Text>
                </View>
              ))}
            </View>

            {/* Process-wise stock header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <View style={{ width: 4, height: 18, backgroundColor: '#315451', borderRadius: 2 }} />
              <Text style={{ fontSize: 14, fontWeight: '800', color: '#315451', letterSpacing: 0.5 }}>Process-wise Stock</Text>
            </View>

            <View style={{ gap: 10 }}>
              {[
                { key: 'DIE_CASTING', label: 'Die Casting', icon: '🏭', color: '#006b65', bg: '#e8f8f6', border: '#bfdbfe', accent: '#00877f' },
                { key: 'COATING',     label: 'Coating',     icon: '🎨', color: '#6d28d9', bg: '#f5f3ff', border: '#ddd6fe', accent: '#7c3aed' },
                { key: 'MACHINING',   label: 'Machining',   icon: '⚙️', color: '#92400e', bg: '#fef3c7', border: '#fde68a', accent: '#b45309' },
              ].map(proc => {
                const ps = stockSummary.processSummary?.[proc.key];
                if (!ps) return null;
                return (
                  <View key={proc.key} style={{ borderRadius: 12, borderWidth: 1, borderColor: proc.border, overflow: 'hidden' }}>
                    {/* Process header */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: proc.bg, paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: proc.border }}>
                      <Text style={{ fontSize: 20 }}>{proc.icon}</Text>
                      <Text style={{ fontSize: 15, fontWeight: '800', color: proc.accent }}>{proc.label}</Text>
                    </View>
                    {/* Metrics row */}
                    <View style={{ flexDirection: 'row', backgroundColor: '#fff' }}>
                      {[
                        { label: 'Good Parts', parts: ps.goodParts, kg: ps.goodKg, color: '#15803d', bg: '#f0fdf4', border: '#bbf7d0' },
                        { label: 'Rework',     parts: ps.reworkParts, kg: ps.reworkKg, color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
                        { label: 'Rejected',   parts: ps.rejectedParts, kg: ps.rejectedKg, color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
                        { label: 'Scrap',      parts: null, kg: ps.scrapKg, color: '#6b7280', bg: '#f7fbfa', border: '#d7e6e4' },
                      ].map((m, idx, arr) => (
                        <View key={m.label} style={{ flex: 1, backgroundColor: m.bg, padding: 10, alignItems: 'center', borderRightWidth: idx < arr.length - 1 ? 1 : 0, borderRightColor: '#d7e6e4' }}>
                          <Text style={{ fontSize: 11, fontWeight: '700', color: m.color, marginBottom: 5, textAlign: 'center' }}>{m.label}</Text>
                          {m.parts !== null && (
                            <Text style={{ fontSize: 16, fontWeight: '900', color: m.color }}>{m.parts}</Text>
                          )}
                          {m.parts !== null && (
                            <Text style={{ fontSize: 10, color: m.color, fontWeight: '600' }}>pcs</Text>
                          )}
                          <Text style={{ fontSize: m.parts !== null ? 12 : 18, fontWeight: '900', color: m.color, marginTop: m.parts !== null ? 3 : 0 }}>{m.kg.toFixed(1)}</Text>
                          <Text style={{ fontSize: 10, color: m.color, fontWeight: '600' }}>KG</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                );
              })}
            </View>

            {/* Process Balances */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 20, marginBottom: 12 }}>
              <View style={{ width: 4, height: 18, backgroundColor: '#315451', borderRadius: 2 }} />
              <Text style={{ fontSize: 14, fontWeight: '800', color: '#315451', letterSpacing: 0.5 }}>Process Balances</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1, backgroundColor: '#f0f9ff', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#bae6fd' }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#006b65', marginBottom: 6 }}>Die Cast → Coating</Text>
                <Text style={{ fontSize: 22, fontWeight: '900', color: '#006b65' }}>{(stockSummary.balances?.dieCastBalance || 0).toFixed(1)}</Text>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#006b65' }}>KG available</Text>
              </View>
              <View style={{ flex: 1, backgroundColor: '#fdf4ff', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#e9d5ff' }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#7e22ce', marginBottom: 6 }}>Coating → Machining</Text>
                <Text style={{ fontSize: 22, fontWeight: '900', color: '#7e22ce' }}>{(stockSummary.balances?.coatingBalance || 0).toFixed(1)}</Text>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#7e22ce' }}>KG available</Text>
              </View>
            </View>
          </View>
        )}

        {/* Table */}
        {activeTab === 'raw' ? (
          <DataTable
            data={rawMaterials}
            columns={rawColumns}
            keyExtractor={(m) => m._id || m.id || String(Math.random())}
            emptyMessage="No raw materials recorded. Add the first entry."
          />
        ) : activeTab === 'schedule' ? (
          <DataTable
            data={schedules}
            columns={schedColumns}
            keyExtractor={(s) => s._id || s.id || String(Math.random())}
            emptyMessage="No monthly schedule entries yet."
          />
        ) : (
          /* WO Usage Tab */
          <View style={{ gap: 14 }}>
            {/* Top summary bar */}
            <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
              {[
                { icon: '🏭', label: 'Total Consumed', value: `${totalUsedKg.toFixed(1)} KG`, bg: '#fef3c7', border: '#fde68a', val: '#b45309', sub: '#92400e' },
                { icon: '📦', label: 'Stock Remaining', value: `${remainingKg.toFixed(1)} KG`, bg: '#dcfce7', border: '#86efac', val: '#15803d', sub: '#166534' },
                { icon: '📋', label: 'Work Orders', value: String(workOrders.length), bg: '#e8f8f6', border: '#bfdbfe', val: '#00877f', sub: '#006b65' },
              ].map(s => (
                <View key={s.label} style={{ flex: 1, minWidth: 130, backgroundColor: s.bg, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: s.border }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <Text style={{ fontSize: 20 }}>{s.icon}</Text>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: s.sub }}>{s.label}</Text>
                  </View>
                  <Text style={{ fontSize: 26, fontWeight: '900', color: s.val }}>{s.value}</Text>
                </View>
              ))}
            </View>

            {/* Material accordion cards */}
            {materialGroups.length === 0 ? (
              <View style={{ padding: 40, alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#d7e6e4' }}>
                <Text style={{ fontSize: 32, marginBottom: 10 }}>📭</Text>
                <Text style={{ fontSize: 15, color: '#7a9692', fontWeight: '600' }}>No work orders recorded yet.</Text>
              </View>
            ) : (
              materialGroups.map((grp, gi) => {
                const groupKey = grp.masterId + gi;
                const isExpanded = expandedGroups.has(groupKey);
                const toggleGroup = () => {
                  setExpandedGroups(prev => {
                    const next = new Set(prev);
                    if (next.has(groupKey)) next.delete(groupKey);
                    else next.add(groupKey);
                    return next;
                  });
                };
                return (
                  <View key={groupKey} style={{
                    backgroundColor: '#fff', borderRadius: 14,
                    overflow: 'hidden',
                    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
                    borderWidth: 1, borderColor: isExpanded ? '#7c3aed' : '#d7e6e4',
                  }}>
                    {/* ── Collapsed header (always visible, tappable) ── */}
                    <TouchableOpacity onPress={toggleGroup} activeOpacity={0.85}>
                      <View style={{ flexDirection: 'row' }}>
                        <View style={{ width: 5, backgroundColor: '#7c3aed', borderTopLeftRadius: 14, borderBottomLeftRadius: isExpanded ? 0 : 14 }} />
                        <View style={{ flex: 1, backgroundColor: isExpanded ? '#f5f3ff' : '#fafafa', padding: 16 }}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            {/* Left: identity */}
                            <View style={{ flex: 1, marginRight: 12 }}>
                              <Text style={{ fontSize: 10, color: '#7c3aed', fontWeight: '700', letterSpacing: 1.2, marginBottom: 2 }}>MATERIAL MASTER</Text>
                              <Text style={{ fontSize: 19, fontWeight: '900', color: '#4c1d95' }}>{grp.masterId}</Text>
                              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                                <View style={{ backgroundColor: '#ede9fe', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: '#c4b5fd' }}>
                                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#6d28d9' }}>Grade: {grp.grade}</Text>
                                </View>
                                <View style={{ backgroundColor: '#e0e7ff', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: '#c7d2fe' }}>
                                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#3730a3' }}>{grp.wos.length} WO{grp.wos.length !== 1 ? 's' : ''}</Text>
                                </View>
                              </View>
                            </View>

                            {/* Right: quick stats + chevron */}
                            <View style={{ alignItems: 'flex-end', gap: 6 }}>
                              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 2 }}>
                                <View style={{ backgroundColor: '#fef3c7', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12, borderWidth: 1, borderColor: '#fbbf24', alignItems: 'center', minWidth: 72 }}>
                                  <Text style={{ fontSize: 17, fontWeight: '900', color: '#b45309' }}>{grp.totalUsedKg.toFixed(1)}</Text>
                                  <Text style={{ fontSize: 9, color: '#92400e', fontWeight: '700', marginTop: 1 }}>KG Used</Text>
                                </View>
                                <View style={{ backgroundColor: '#dcfce7', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12, borderWidth: 1, borderColor: '#4ade80', alignItems: 'center', minWidth: 72 }}>
                                  <Text style={{ fontSize: 17, fontWeight: '900', color: '#15803d' }}>{grp.totalGoodParts.toLocaleString()}</Text>
                                  <Text style={{ fontSize: 9, color: '#166534', fontWeight: '700', marginTop: 1 }}>Pcs Made</Text>
                                </View>
                              </View>
                              <Text style={{ fontSize: 18, color: '#7c3aed' }}>{isExpanded ? '▲' : '▼'}</Text>
                            </View>
                          </View>

                          {/* Process-wise totals (always shown in header) */}
                          {Object.keys(grp.processUsage).length > 0 && (
                            <View style={{ marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#e5e0fa', flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                              {Object.entries(grp.processUsage).map(([type, qty]) => (
                                <View key={type} style={{ backgroundColor: '#fff', borderRadius: 7, paddingVertical: 5, paddingHorizontal: 10, borderWidth: 1, borderColor: '#ddd6fe', flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                                  <Text style={{ fontSize: 11, color: '#6d28d9', fontWeight: '600' }}>{type.replace(/_/g, ' ')}</Text>
                                  <View style={{ width: 1, height: 11, backgroundColor: '#c4b5fd' }} />
                                  <Text style={{ fontSize: 12, color: '#4c1d95', fontWeight: '900' }}>{qty.toLocaleString()}</Text>
                                </View>
                              ))}
                            </View>
                          )}
                        </View>
                      </View>
                    </TouchableOpacity>

                    {/* ── Expanded: WO list ── */}
                    {isExpanded && (
                      <View style={{ borderTopWidth: 1, borderTopColor: '#ddd6fe' }}>
                        {/* Section label */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#f5f3ff', gap: 8 }}>
                          <Text style={{ fontSize: 12, fontWeight: '800', color: '#6d28d9' }}>Work Orders ({grp.wos.length})</Text>
                          <View style={{ flex: 1, height: 1, backgroundColor: '#ddd6fe' }} />
                        </View>

                        <View style={{ padding: 12, gap: 10 }}>
                          {grp.wos.map((wo, wi) => (
                            <View key={wo.woSlug + wi} style={{
                              borderRadius: 10, borderWidth: 1, borderColor: '#d7e6e4', overflow: 'hidden',
                            }}>
                              {/* WO header band */}
                              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f7fbfa', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#d7e6e4' }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                  <View style={{ width: 4, height: 20, backgroundColor: '#00877f', borderRadius: 2 }} />
                                  <Text style={{ fontSize: 15, fontWeight: '800', color: '#00877f' }}>{wo.woSlug}</Text>
                                </View>
                                <StatusBadge variant={wo.status} />
                              </View>

                              <View style={{ padding: 12 }}>
                                {/* Part info */}
                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                                  <View style={{ backgroundColor: '#e8f8f6', borderRadius: 6, paddingVertical: 5, paddingHorizontal: 10, borderWidth: 1, borderColor: '#bfdbfe' }}>
                                    <Text style={{ fontSize: 12, color: '#006b65', fontWeight: '700' }}>Part: {wo.partId}</Text>
                                  </View>
                                  {wo.partName && wo.partName !== '—' && (
                                    <View style={{ backgroundColor: '#fdf4ff', borderRadius: 6, paddingVertical: 5, paddingHorizontal: 10, borderWidth: 1, borderColor: '#e9d5ff' }}>
                                      <Text style={{ fontSize: 12, color: '#7e22ce', fontWeight: '600' }}>{wo.partName}</Text>
                                    </View>
                                  )}
                                </View>

                                {/* Process breakdown */}
                                {Object.keys(wo.processSummary).length > 0 && (
                                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginBottom: 12 }}>
                                    {Object.entries(wo.processSummary).map(([type, qty]) => (
                                      <View key={type} style={{ backgroundColor: '#edf5f4', borderRadius: 6, paddingVertical: 4, paddingHorizontal: 8, borderWidth: 1, borderColor: '#d7e6e4', flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                        <Text style={{ fontSize: 11, color: '#486966', fontWeight: '600' }}>{type.replace(/_/g, ' ')}</Text>
                                        <Text style={{ fontSize: 11, color: '#183f3c', fontWeight: '900' }}>{qty}</Text>
                                      </View>
                                    ))}
                                  </View>
                                )}

                                {/* Metric boxes */}
                                <View style={{ flexDirection: 'row', gap: 8 }}>
                                  <View style={{ flex: 1, backgroundColor: '#fef9c3', borderRadius: 8, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: '#fde047' }}>
                                    <Text style={{ fontSize: 11, color: '#713f12', fontWeight: '700', marginBottom: 4 }}>Target</Text>
                                    <Text style={{ fontSize: 20, fontWeight: '900', color: '#854d0e' }}>{wo.targetParts.toLocaleString()}</Text>
                                    <Text style={{ fontSize: 10, color: '#92400e', fontWeight: '600', marginTop: 2 }}>Parts</Text>
                                  </View>
                                  <View style={{ flex: 1, backgroundColor: '#dcfce7', borderRadius: 8, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: '#4ade80' }}>
                                    <Text style={{ fontSize: 11, color: '#166534', fontWeight: '700', marginBottom: 4 }}>Good Parts</Text>
                                    <Text style={{ fontSize: 20, fontWeight: '900', color: '#15803d' }}>{wo.goodParts.toLocaleString()}</Text>
                                    <Text style={{ fontSize: 10, color: '#166534', fontWeight: '600', marginTop: 2 }}>Produced</Text>
                                  </View>
                                  <View style={{ flex: 1, backgroundColor: '#fef3c7', borderRadius: 8, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: '#fbbf24' }}>
                                    <Text style={{ fontSize: 11, color: '#92400e', fontWeight: '700', marginBottom: 4 }}>Material</Text>
                                    <Text style={{ fontSize: 20, fontWeight: '900', color: '#b45309' }}>{wo.usedKg.toFixed(1)}</Text>
                                    <Text style={{ fontSize: 10, color: '#92400e', fontWeight: '600', marginTop: 2 }}>KG Used</Text>
                                  </View>
                                </View>
                              </View>
                            </View>
                          ))}
                        </View>
                      </View>
                    )}
                  </View>
                );
              })
            )}
          </View>
        )}

        {/* Raw Material Modal */}
        <FormModal
          visible={showModal}
          title="Add Raw Material"
          subtitle="Enter details for incoming material batch"
          onClose={() => { setShowModal(false); setFormData({}); }}
          onSave={handleSaveMaterial}
          saveLabel="Save Material"
        >
          <FormField label="Material ID" required>
            <Select
              placeholder="Select Material"
              value={formData.rawMaterialId}
              options={materialsMaster.map(m => {
                const grade = m.materialGrades?.[0] || '';
                return {
                  label: grade ? `${m.materialId} | ${m.materialName} | ${grade}` : `${m.materialId} | ${m.materialName}`,
                  value: m.materialId
                };
              })}
              onSelect={(val) => {
                const mat = materialsMaster.find(m => m.materialId === val);
                const grade = mat?.materialGrades?.[0] || '';
                setFormData({ ...formData, rawMaterialId: val, grade });
              }}
            />
          </FormField>
          <FormField label="Batch Number" required>
            <TextInput
              style={inputStyle.input}
              placeholder="e.g. BATCH-001"
              value={formData.batchNumber || ''}
              onChangeText={(t) => setFormData({ ...formData, batchNumber: t })}
            />
          </FormField>
          <FormField label="Received Quantity (KG)" required>
            <TextInput
              ref={el => rawRefs.current[2] = el}
              returnKeyType="next"
              blurOnSubmit={false}
              onSubmitEditing={() => focusRaw(3)}
              style={inputStyle.input}
              placeholder="0.00"
              value={formData.receivedQuantity?.toString()}
              onChangeText={(t) => setFormData({ ...formData, receivedQuantity: parseFloat(t) || 0 })}
              keyboardType="numeric"
            />
          </FormField>
          <FormField label="Date Received" required>
            <DatePicker
              value={formData.date || ''}
              onChange={(d) => setFormData({ ...formData, date: d })}
              placeholder="Select date received"
              maxDate={new Date().toISOString().split('T')[0]}
            />
          </FormField>

          <FormField label="Received By">
            <TextInput ref={el => rawRefs.current[4] = el} returnKeyType="done" style={inputStyle.input} placeholder="Name of receiver" value={formData.receivedBy} onChangeText={(t) => setFormData({ ...formData, receivedBy: t })} />
          </FormField>
        </FormModal>

        {/* Schedule Modal */}
        <FormModal
          visible={showSchedModal}
          title={`${editSchedId ? 'Edit' : 'Add'} Monthly Schedule`}
          subtitle={editSchedId ? "Modify customer schedule details" : "Enter customer schedule details"}
          onClose={() => { setShowSchedModal(false); setSchedFormData({}); setEditSchedId(null); }}
                    onSave={handleSaveSchedule}
          saveLabel="Save Schedule"
        >
          <FormField label="Part ID" required>
            <Select
              placeholder="Select Part"
              value={schedFormData.partId}
              options={partsMaster.map(p => ({ label: `${p.partId} | ${p.partName}`, value: p.partId }))}
              onSelect={(val) => {
                const part = partsMaster.find(p => p.partId === val);
                if (part) {
                  setSchedFormData({
                    ...schedFormData,
                    partId: val,
                    partName: part.partName,
                    materialId: part.materialId,
                    weightPerPartKg: part.weightPerPartKg,
                    bufferPercent: part.bufferPercent || 0,
                    materialReceiptId: '',
                    batchNumber: '',
                    grade: ''
                  });
                } else {
                  setSchedFormData({ ...schedFormData, partId: val, materialReceiptId: '', batchNumber: '', grade: '' });
                }
              }}
            />
          </FormField>
          <FormField label="Part Name">
            <TextInput
              style={[inputStyle.input, { backgroundColor: '#edf5f4' }]}
              editable={false}
              value={schedFormData.partName}
            />
          </FormField>
          <FormField label="Weight Per Part (KG)">
            <TextInput
              style={[inputStyle.input, { backgroundColor: '#edf5f4' }]}
              editable={false}
              value={schedFormData.weightPerPartKg !== undefined ? String(schedFormData.weightPerPartKg) : '0'}
            />
          </FormField>
          <FormField label="Buffer %">
            <TextInput
              style={[inputStyle.input, { backgroundColor: '#edf5f4' }]}
              editable={false}
              value={schedFormData.bufferPercent !== undefined ? String(schedFormData.bufferPercent) : '0'}
            />
          </FormField>
          {schedFormData.materialId && rawMaterials.some(m => m.materialId === schedFormData.materialId && m.status === 'APPROVED') && (
            <FormField label="Select Batch *">
              <Select
                placeholder="Select Batch"
                value={schedFormData.materialReceiptId || ''}
                options={rawMaterials
                  .filter(m => m.materialId === schedFormData.materialId && m.status === 'APPROVED')
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
                    setSchedFormData({
                      ...schedFormData,
                      materialReceiptId: val,
                      batchNumber: batch.batchNumber || '',
                      grade: batch.grade || schedFormData.grade || ''
                    });
                  }
                }}
              />
            </FormField>
          )}
          {schedFormData.materialId && (
            !rawMaterials.some(m => m.materialId === schedFormData.materialId && m.status === 'APPROVED') ||
            !!schedFormData.materialReceiptId
          ) && (
            <FormField label="Raw Material">
              <TextInput
                style={[inputStyle.input, { backgroundColor: '#edf5f4' }]}
                editable={false}
                value={(() => {
                  const mat = materialsMaster.find(m => m.materialId === schedFormData.materialId);
                  return mat ? `${mat.materialId} | ${mat.materialName}` : (schedFormData.materialId || '—');
                })()}
              />
            </FormField>
          )}
          <FormField label="Available Weight (KG)">
            <TextInput
              style={[inputStyle.input, { backgroundColor: '#edf5f4', fontWeight: '800', color: '#16a34a' }]}
              editable={false}
              value={(() => {
                if (!schedFormData.materialId) return '0';
                const totalReceived = rawMaterials
                  .filter(m => m.materialId === schedFormData.materialId && m.status === 'APPROVED')
                  .reduce((sum, m) => sum + (m.receivedQuantity || 0), 0);
                const totalScheduled = schedules
                  .filter(s => s.materialId === schedFormData.materialId && (s.id || (s as any)._id) !== editSchedId)
                  .reduce((sum, s) => sum + (s.totalWeightKg || 0), 0);
                return (totalReceived - totalScheduled).toFixed(2);
              })()}
            />
          </FormField>
          <FormField label="Required Quantity (Nos) *" required>
            <TextInput
              style={inputStyle.input}
              placeholder="0"
              keyboardType="numeric"
              value={schedFormData.requiredQuantity?.toString() || ''}
              onChangeText={(t) => {
                const val = t.replace(/[^0-9]/g, '');
                setSchedFormData({ ...schedFormData, requiredQuantity: val });
              }}
            />
          </FormField>
          <FormField label="Scheduled Date" required>
            <DatePicker 
              value={schedFormData.date || ''} 
              minDate={new Date().toLocaleDateString('en-CA')}
              onChange={(d) => setSchedFormData({ ...schedFormData, date: d })} 
              placeholder="Select schedule date" 
            />
          </FormField>
          <FormField label="Total Weight (Including Buffer) (KG)">
            <TextInput
              style={[inputStyle.input, { backgroundColor: '#edf5f4', fontWeight: '800', color: '#16a34a' }]}
              editable={false}
              value={(() => {
                const qty = Number(schedFormData.requiredQuantity) || 0;
                const wpp = schedFormData.weightPerPartKg || 0;
                const buffer = schedFormData.bufferPercent || 0;
                const baseWeight = qty * wpp;
                const totalWeight = baseWeight + (baseWeight * (buffer / 100));
                return totalWeight.toFixed(3);
              })()}
            />
          </FormField>
        </FormModal>

        {/* Rejection Modal */}
        <FormModal
          visible={showRejectModal}
          title="Reject Material"
          subtitle="Enter rejection details (Partial or Full)"
          onClose={() => { setShowRejectModal(false); }}
          onSave={handleSaveReject}
          saveLabel="Confirm Rejection"
        >
          <View style={{ marginBottom: 12, padding: 12, backgroundColor: '#f7fbfa', borderRadius: 8 }}>
            <Text style={{ fontSize: 13, color: '#5b7773' }}>Original Quantity: <Text style={{ fontWeight: '700', color: '#083d3a' }}>{rejectFormData.totalQty} KG</Text></Text>
          </View>

          <FormField label="Quantity to Reject (KG)" required>
            <TextInput
              style={inputStyle.input}
              placeholder="0.00"
              value={rejectFormData.rejectedQty.toString()}
              onChangeText={(t) => setRejectFormData({ ...rejectFormData, rejectedQty: parseFloat(t) || 0 })}
              keyboardType="numeric"
            />
          </FormField>

          <FormField label="Reason for Rejection" required>
            <TextInput
              style={[inputStyle.input, { height: 80, textAlignVertical: 'top' }]}
              placeholder="Enter reason..."
              multiline
              value={rejectFormData.reason}
              onChangeText={(t) => setRejectFormData({ ...rejectFormData, reason: t })}
            />
          </FormField>
        </FormModal>

        {/* Import Loading Overlay */}
        <Modal transparent visible={isImporting} animationType="fade">
          <View style={styles.loadingOverlay}>
            <View style={styles.loadingContent}>
              <ActivityIndicator size="large" color="#00877f" />
              <Text style={styles.loadingText}>Uploading & Processing...</Text>
              <Text style={styles.loadingSubtext}>Please do not close the app</Text>
            </View>
          </View>
        </Modal>

        {/* Custom Delete Confirmation Modal */}
        <Modal
          visible={!!deleteSchedConfirmId}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setDeleteSchedConfirmId(null)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Confirm Delete</Text>
              <Text style={styles.modalSubtitle}>Are you sure you want to delete this schedule?</Text>

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.modalBtn, { backgroundColor: '#edf5f4' }]}
                  onPress={() => setDeleteSchedConfirmId(null)}
                >
                  <Text style={[styles.modalBtnText, { color: '#486966' }]}>No</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalBtn, { backgroundColor: '#ef4444' }]}
                  onPress={handleDeleteSched}
                >
                  <Text style={[styles.modalBtnText, { color: '#ffffff' }]}>Yes, Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Consumption History Modal */}
        <FormModal
          visible={showHistoryModal}
          title="Consumption History"
          subtitle={`${selectedMaterialForHistory?.materialId || '—'} | ${selectedMaterialForHistory?.grade || '—'}`}
          onClose={() => setShowHistoryModal(false)}
          onSave={() => setShowHistoryModal(false)}
          saveLabel="Close"
        >
          <View style={{ marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#f7fbfa', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#d7e6e4', marginBottom: 16 }}>
              <View>
                <Text style={{ fontSize: 11, color: '#5b7773', fontWeight: '600' }}>TOTAL RECEIVED</Text>
                <Text style={{ fontSize: 18, fontWeight: '800', color: '#083d3a' }}>{selectedMaterialForHistory?.receivedQuantity || 0} KG</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontSize: 11, color: '#5b7773', fontWeight: '600' }}>TOTAL USED</Text>
                <Text style={{ fontSize: 18, fontWeight: '800', color: '#00877f' }}>{selectedMaterialForHistory?.usedQuantity || 0} KG</Text>
              </View>
            </View>

            <Text style={{ fontSize: 14, fontWeight: '700', color: '#183f3c', marginBottom: 12 }}>Usage Audit Log</Text>
            
            {!selectedMaterialForHistory?.consumptionLog || selectedMaterialForHistory.consumptionLog.length === 0 ? (
              <View style={{ padding: 30, alignItems: 'center', backgroundColor: '#f7fbfa', borderRadius: 12, borderStyle: 'dashed', borderWidth: 1, borderColor: '#c8dbd8' }}>
                <Text style={{ fontSize: 13, color: '#7a9692' }}>No consumption recorded yet.</Text>
              </View>
            ) : (
              <View style={{ gap: 8 }}>
                {selectedMaterialForHistory.consumptionLog.map((log, idx) => (
                  <View key={idx} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#edf5f4' }}>
                    <View>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: '#00877f' }}>{log.workOrderId}</Text>
                      <Text style={{ fontSize: 11, color: '#5b7773', marginTop: 2 }}>
                        {fmtDateTime(log.timestamp)}
                      </Text>
                    </View>
                    <View style={{ backgroundColor: '#e8f8f6', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}>
                      <Text style={{ fontSize: 14, fontWeight: '800', color: '#006b65' }}>-{log.quantity} KG</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        </FormModal>

      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#edf5f4' },
  maxWidth: { width: '100%', alignSelf: 'center', gap: 16 },
  statRow: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
  },
  statBox: {
    flex: 1,
    minWidth: 120,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#d7e6e4',
    alignItems: 'center',
    gap: 4,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '800',
    color: '#00877f',
  },
  statLabel: {
    fontSize: 12,
    color: '#5b7773',
    fontWeight: '600',
    textAlign: 'center',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 4,
    borderWidth: 1,
    borderColor: '#d7e6e4',
    borderColor: '#d7e6e4',
    gap: 4,
    marginBottom: 8,
  },
  actionBar: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 8,
  },
  actionBtn: {
    backgroundColor: '#00877f',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  actionBtnOutline: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  actionBtnOutlineText: {
    color: '#4b5563',
    fontSize: 13,
    fontWeight: '600',
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 9,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: '#00877f',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#5b7773',
  },
  tabTextActive: {
    color: '#ffffff',
  },
  numericCell: {
    fontSize: 13,
    fontWeight: '700',
    color: '#00877f',
    textAlign: 'right',
  },
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
  loadingOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingContent: {
    backgroundColor: '#ffffff',
    padding: 32,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 8,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    fontWeight: '700',
    color: '#083d3a',
  },
  loadingSubtext: {
    marginTop: 4,
    fontSize: 13,
    color: '#5b7773',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 24,
    width: 320,
    maxWidth: '90%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#083d3a',
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#486966',
    marginBottom: 24,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  modalBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalBtnText: {
    fontSize: 14,
    fontWeight: '600',
  }
});
