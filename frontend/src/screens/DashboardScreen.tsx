import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DataStorage, fmtDate } from '../utils/storage';
import { DashboardData, QualityInspection, User, WorkOrder } from '../types';

const PROCESS_METADATA: Record<string, { icon: keyof typeof Ionicons.glyphMap; color: string; bg: string }> = {
  DIE_CASTING: { icon: 'construct-outline', color: '#00877f', bg: '#d9f3f0' },
  COATING: { icon: 'color-palette-outline', color: '#0f766e', bg: '#d9f3f0' },
  MACHINING: { icon: 'hardware-chip-outline', color: '#7c3aed', bg: '#ede9fe' },
  FINAL_QA: { icon: 'shield-checkmark-outline', color: '#c2410c', bg: '#ffedd5' },
};

const formatNumber = (value: number | undefined) => (value || 0).toLocaleString();
const clampPercent = (value: number) => Math.min(100, Math.max(0, value));
const WORK_ORDERS_PAGE_SIZE = 6;

export function DashboardScreen() {
  const { width } = useWindowDimensions();
  const isCompact = width < 780;
  const [data, setData] = useState<DashboardData>({
    totalRawMaterials: 0,
    totalReceivedKg: 0,
    totalUsedKg: 0,
    remainingKg: 0,
    totalWorkOrders: 0,
    activeWorkOrders: 0,
    totalInspections: 0,
    totalScrap: 0,
    totalProduced: 0,
    totalGood: 0,
    totalRework: 0,
    totalRejected: 0,
  });
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [inspections, setInspections] = useState<QualityInspection[]>([]);
  const [stages, setStages] = useState<any[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [activeProcesses, setActiveProcesses] = useState<any[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setIsRefreshing(true);
      const [dashboardData, orders, insp, currentUser, processes, stgs] = await Promise.all([
        DataStorage.getDashboardData(),
        DataStorage.getWorkOrders(),
        DataStorage.getQualityInspections(),
        DataStorage.getCurrentUser(),
        DataStorage.getProcesses(),
        DataStorage.getProcessStages('all'),
      ]);

      setData(dashboardData);
      setWorkOrders(orders);
      setInspections(insp);
      setUser(currentUser);
      setActiveProcesses(processes.sort((a: any, b: any) => (a.order || 0) - (b.order || 0)));
      setStages(stgs || []);
    } finally {
      setIsRefreshing(false);
    }
  };

  const totalProduced = data.totalProduced || 0;
  const totalGood = data.totalGood || 0;
  const totalRework = data.totalRework || 0;
  const totalRejected = data.totalRejected || 0;
  const inspectedTotal = totalGood + totalRework + totalRejected;
  const yieldRate = inspectedTotal > 0 ? Math.round((totalGood / inspectedTotal) * 100) : 0;
  const completedOrders = workOrders.filter((wo) => (wo.status || '').toUpperCase() === 'COMPLETED').length;
  const notStarted = workOrders.filter((wo) => ['NOT_STARTED', 'PENDING'].includes((wo.status || '').toUpperCase())).length;
  const remainingKg = data.remainingKg || 0;
  const materialUseRate = (data.totalReceivedKg || 0) > 0 ? Math.round(((data.totalUsedKg || 0) / (data.totalReceivedKg || 1)) * 100) : 0;

  const getStatusColor = (status: string) => {
    const s = (status || '').toUpperCase();
    if (s === 'COMPLETED') return '#00877f';
    if (s === 'IN_PROGRESS' || s === 'STARTED') return '#d97706';
    return '#5b7773';
  };
  const getStatusLabel = (status: string) => {
    const s = (status || '').toUpperCase();
    if (s === 'COMPLETED') return 'Completed';
    if (s === 'IN_PROGRESS' || s === 'STARTED') return 'In Progress';
    return 'Pending';
  };

  const woNum = (id: string) => parseInt((id || '').replace(/\D/g, '') || '0', 10);

  // ── Section 1: Main Work Orders ──────────────────────────────────────────
  const mainOrders = workOrders
    .filter(wo => !wo.parentWorkOrderId && (wo.type === 'MAIN' || !wo.type))
    .sort((a, b) => woNum(b.workOrderId) - woNum(a.workOrderId));

  // ── Section 2: Sub Work Orders ───────────────────────────────────────────
  const subOrders = workOrders
    .filter(wo => (wo.type || '').toUpperCase() === 'SUB')
    .sort((a, b) => woNum(b.workOrderId) - woNum(a.workOrderId));

  // ── Section 3: Rework Orders ─────────────────────────────────────────────
  const reworkOrders = workOrders
    .filter(wo => (wo.type || '').toUpperCase() === 'REWORK')
    .sort((a, b) => woNum(b.workOrderId) - woNum(a.workOrderId));

  // helper to aggregate stage production counts
  const stageAgg = (s: any) => ({
    input: s.inputQuantity || 0,
    good: s.goodPartsCount || 0,
    rework: s.reworkPartsCount || 0,
    rejected: s.rejectedPartsCount || 0,
    scrap: s.scrapWeightKg || 0,
    type: s.type || '',
  });

  // ── Section 4: Day wise ──────────────────────────────────────────────────
  const dayMap: Record<string, { input: number; good: number; rework: number; rejected: number; scrap: number }> = {};
  stages.forEach(s => {
    const date = s.productionDate || s.actualStartDate || s.startDate || '';
    if (!date) return;
    const d = date.toString().split('T')[0];
    if (!dayMap[d]) dayMap[d] = { input: 0, good: 0, rework: 0, rejected: 0, scrap: 0 };
    const a = stageAgg(s);
    dayMap[d].input += a.input; dayMap[d].good += a.good;
    dayMap[d].rework += a.rework; dayMap[d].rejected += a.rejected; dayMap[d].scrap += a.scrap;
  });
  const dayRows = Object.entries(dayMap).sort((a, b) => b[0].localeCompare(a[0]));

  // ── Section 5: Machine wise ──────────────────────────────────────────────
  const machineMap: Record<string, { input: number; good: number; rework: number; rejected: number; scrap: number; process: string }> = {};
  stages.forEach(s => {
    const assignments: any[] = s.machineAssignments || [];
    if (assignments.length === 0 && s.machineId) {
      const key = s.machineId;
      if (!machineMap[key]) machineMap[key] = { input: 0, good: 0, rework: 0, rejected: 0, scrap: 0, process: s.type || '' };
      const a = stageAgg(s);
      machineMap[key].input += a.input; machineMap[key].good += a.good;
      machineMap[key].rework += a.rework; machineMap[key].rejected += a.rejected; machineMap[key].scrap += a.scrap;
    } else {
      assignments.forEach((ma: any) => {
        const key = String(ma.machineId || '').trim();
        if (!key) return;
        if (!machineMap[key]) machineMap[key] = { input: 0, good: 0, rework: 0, rejected: 0, scrap: 0, process: s.type || '' };
        machineMap[key].input += ma.qty || ma.targetQuantity || 0;
        machineMap[key].good += ma.goodPartsCount || 0;
        machineMap[key].rework += ma.reworkPartsCount || 0;
        machineMap[key].rejected += ma.rejectedPartsCount || 0;
        machineMap[key].scrap += ma.scrapWeightKg || 0;
      });
    }
  });
  const machineRows = Object.entries(machineMap).sort((a, b) => a[0].localeCompare(b[0]));

  // ── Section 6: Shift wise ────────────────────────────────────────────────
  const shiftMap: Record<string, { input: number; good: number; rework: number; rejected: number; scrap: number }> = {};
  stages.forEach(s => {
    const assignments: any[] = s.machineAssignments || [];
    const shiftKey = String(s.shift || s.shiftId || '').trim();
    if (assignments.length === 0) {
      if (!shiftKey) return;
      if (!shiftMap[shiftKey]) shiftMap[shiftKey] = { input: 0, good: 0, rework: 0, rejected: 0, scrap: 0 };
      const a = stageAgg(s);
      shiftMap[shiftKey].input += a.input; shiftMap[shiftKey].good += a.good;
      shiftMap[shiftKey].rework += a.rework; shiftMap[shiftKey].rejected += a.rejected; shiftMap[shiftKey].scrap += a.scrap;
    } else {
      assignments.forEach((ma: any) => {
        const sk = String(ma.shift || ma.shiftId || '').trim();
        if (!sk) return;
        if (!shiftMap[sk]) shiftMap[sk] = { input: 0, good: 0, rework: 0, rejected: 0, scrap: 0 };
        shiftMap[sk].input += ma.qty || ma.targetQuantity || 0;
      });
    }
  });
  const shiftRows = Object.entries(shiftMap).sort((a, b) => a[0].localeCompare(b[0]));

  return (
    <ScrollView style={D.root} contentContainerStyle={D.scroll}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <View style={D.header}>
        <View style={D.headerLeft}>
          <Text style={D.headerKicker}>Production Dashboard</Text>
          <Text style={D.headerTitle}>{user?.tenantName || 'GK Manufacturing'}</Text>
          <Text style={D.headerDate}>{fmtDate(new Date())}</Text>
        </View>
        <TouchableOpacity style={D.refreshBtn} onPress={loadDashboardData} disabled={isRefreshing} activeOpacity={0.85}>
          {isRefreshing ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="refresh-circle" size={20} color="#fff" />}
          <Text style={D.refreshBtnText}>{isRefreshing ? 'Loading…' : 'Refresh'}</Text>
        </TouchableOpacity>
      </View>

      {/* ── KPI Strip ──────────────────────────────────────────────────── */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }} contentContainerStyle={{ gap: 12, paddingHorizontal: 2 }}>
        <KpiCard icon="cube-outline" color="#00877f" label="Raw Material" value={`${formatNumber(data.totalRawMaterials)} KG`} sub="Total received" />
        <KpiCard icon="clipboard-outline" color="#7c3aed" label="Work Orders" value={formatNumber(data.totalWorkOrders)} sub={`${completedOrders} completed`} />
        <KpiCard icon="flash-outline" color="#d97706" label="Active Orders" value={formatNumber(data.activeWorkOrders)} sub={`${notStarted} pending`} />
        <KpiCard icon="shield-checkmark-outline" color="#0891b2" label="Yield Rate" value={`${yieldRate}%`} sub={`${formatNumber(totalGood)} good parts`} />
        <KpiCard icon="warning-outline" color="#dc2626" label="Scrap" value={`${formatNumber(data.totalScrap)} KG`} sub="Total scrap" />
        <KpiCard icon="construct-outline" color="#0f766e" label="Rework" value={formatNumber(totalRework)} sub="Parts reworked" />
      </ScrollView>

      {/* ── Section 1: Work Order ──────────────────────────────────────── */}
      <FilteredSection
        title="Work Order" icon="clipboard-outline" accent="#7c3aed"
        emptyLabel="No main work orders found."
        headers={['WO ID', 'Part', 'Status', 'Target', 'Good', 'Rework', 'Rejected']}
        rows={mainOrders.map(wo => ({
          key: wo._id || wo.id,
          searchKey: `${wo.workOrderId || ''} ${wo.partName || ''} ${wo.partId || ''}`,
          status: wo.status,
          cols: [wo.workOrderId || '—', wo.partName || wo.partId || '—', getStatusLabel(wo.status), `${wo.targetPartCount || 0} pcs`, wo.goodParts || 0, wo.reworkParts || 0, wo.rejectedParts || 0],
          colors: ['#0f172a', '#64748b', getStatusColor(wo.status), '#334155', '#16a34a', '#d97706', '#dc2626'],
        }))}
        showStatusFilter getStatusLabel={getStatusLabel}
      />

      {/* ── Section 2: Sub Work Order ──────────────────────────────────── */}
      <FilteredSection
        title="Sub Work Order" icon="git-branch-outline" accent="#0ea5e9"
        emptyLabel="No sub-orders found."
        headers={['SWO ID', 'Parent WO', 'Part', 'Status', 'Target', 'Good', 'Rework', 'Rejected']}
        rows={subOrders.map(wo => {
          const parent = workOrders.find(w => String(w._id || w.id) === String(wo.parentWorkOrderId));
          return {
            key: wo._id || wo.id,
            searchKey: `${wo.workOrderId || ''} ${parent?.workOrderId || ''} ${wo.partName || ''} ${wo.partId || ''}`,
            status: wo.status,
            cols: [wo.workOrderId || '—', parent?.workOrderId || '—', wo.partName || wo.partId || '—', getStatusLabel(wo.status), `${wo.targetPartCount || 0} pcs`, wo.goodParts || 0, wo.reworkParts || 0, wo.rejectedParts || 0],
            colors: ['#0f172a', '#0ea5e9', '#64748b', getStatusColor(wo.status), '#334155', '#16a34a', '#d97706', '#dc2626'],
          };
        })}
        showStatusFilter getStatusLabel={getStatusLabel}
      />

      {/* ── Section 3: Rework Order ────────────────────────────────────── */}
      <FilteredSection
        title="Rework Order" icon="refresh-circle-outline" accent="#d97706"
        emptyLabel="No rework orders found."
        headers={['RW ID', 'Parent WO', 'Part', 'Status', 'Target', 'Good', 'Rework', 'Rejected']}
        rows={reworkOrders.map(wo => {
          const parent = workOrders.find(w => String(w._id || w.id) === String(wo.parentWorkOrderId));
          return {
            key: wo._id || wo.id,
            searchKey: `${wo.workOrderId || ''} ${parent?.workOrderId || ''} ${wo.partName || ''}`,
            status: wo.status,
            cols: [wo.workOrderId || '—', parent?.workOrderId || '—', wo.partName || wo.partId || '—', getStatusLabel(wo.status), `${wo.targetPartCount || 0} pcs`, wo.goodParts || 0, wo.reworkParts || 0, wo.rejectedParts || 0],
            colors: ['#0f172a', '#d97706', '#64748b', getStatusColor(wo.status), '#334155', '#16a34a', '#d97706', '#dc2626'],
          };
        })}
        showStatusFilter getStatusLabel={getStatusLabel}
      />

      {/* ── Section 4: Day Wise ────────────────────────────────────────── */}
      <FilteredSection
        title="Day Wise Production" icon="calendar-outline" accent="#0891b2"
        emptyLabel="No production data with dates yet."
        headers={['Date', 'Input', 'Good', 'Rework', 'Rejected', 'Scrap KG']}
        rows={dayRows.map(([date, r]) => ({
          key: date,
          searchKey: date,
          cols: [date, r.input, r.good, r.rework, r.rejected, r.scrap.toFixed(2)],
          colors: ['#334155', '#334155', '#16a34a', '#d97706', '#dc2626', '#7c3aed'],
        }))}
        searchPlaceholder="Search by date…"
      />

      {/* ── Section 5: Machine Wise ────────────────────────────────────── */}
      <FilteredSection
        title="Machine Wise Production" icon="hardware-chip-outline" accent="#7c3aed"
        emptyLabel="No machine data yet."
        headers={['Machine', 'Process', 'Input', 'Good', 'Rework', 'Rejected', 'Scrap KG']}
        rows={machineRows.map(([machine, r]) => ({
          key: machine,
          searchKey: machine,
          cols: [machine, r.process || '—', r.input, r.good, r.rework, r.rejected, r.scrap.toFixed(2)],
          colors: ['#334155', '#64748b', '#334155', '#16a34a', '#d97706', '#dc2626', '#7c3aed'],
        }))}
        searchPlaceholder="Search by machine…"
      />

      {/* ── Section 6: Shift Wise ──────────────────────────────────────── */}
      <FilteredSection
        title="Shift Wise Production" icon="time-outline" accent="#00877f"
        emptyLabel="No shift data yet."
        headers={['Shift', 'Input', 'Good', 'Rework', 'Rejected']}
        rows={shiftRows.map(([shift, r]) => ({
          key: shift,
          searchKey: shift,
          cols: [shift, r.input, r.good, r.rework, r.rejected],
          colors: ['#334155', '#334155', '#16a34a', '#d97706', '#dc2626'],
        }))}
        searchPlaceholder="Search by shift…"
      />

    </ScrollView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 10;
const STATUS_FILTERS = ['ALL', 'IN_PROGRESS', 'COMPLETED', 'PENDING'] as const;
const STATUS_FILTER_LABELS: Record<string, string> = { ALL: 'All', IN_PROGRESS: 'In Progress', COMPLETED: 'Completed', PENDING: 'Pending' };

type TableRow = { key: any; searchKey: string; status?: string; cols: any[]; colors: string[] };

function FilteredSection({
  title, icon, accent, emptyLabel, headers, rows,
  showStatusFilter, searchPlaceholder, getStatusLabel,
}: {
  title: string; icon: keyof typeof Ionicons.glyphMap; accent: string;
  emptyLabel: string; headers: string[]; rows: TableRow[];
  showStatusFilter?: boolean; searchPlaceholder?: string;
  getStatusLabel?: (s: string) => string;
}) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [page, setPage] = useState(0);

  const filtered = rows.filter(r => {
    const matchSearch = !search.trim() || r.searchKey.toLowerCase().includes(search.trim().toLowerCase());
    const matchStatus = !showStatusFilter || statusFilter === 'ALL' ||
      (r.status || '').toUpperCase() === statusFilter ||
      (statusFilter === 'PENDING' && ['NOT_STARTED', 'PENDING'].includes((r.status || '').toUpperCase()));
    return matchSearch && matchStatus;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const paged = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  // Status counts for tab badges
  const statusCounts: Record<string, number> = { ALL: rows.length };
  rows.forEach(r => {
    const s = (r.status || '').toUpperCase();
    const key = ['NOT_STARTED', 'PENDING'].includes(s) ? 'PENDING' : s;
    statusCounts[key] = (statusCounts[key] || 0) + 1;
  });

  return (
    <Section title={title} icon={icon} accent={accent} count={rows.length}>
      {rows.length === 0 ? <EmptyRow label={emptyLabel} /> : (
        <>
          {/* ── Filters row ── */}
          <View style={D.filterBar}>
            {/* Search */}
            <View style={D.searchBox}>
              <Ionicons name="search-outline" size={14} color="#94a3b8" />
              <TextInput
                style={D.searchInput}
                placeholder={searchPlaceholder || 'Search…'}
                placeholderTextColor="#94a3b8"
                value={search}
                onChangeText={t => { setSearch(t); setPage(0); }}
              />
              {search.length > 0 && (
                <TouchableOpacity onPress={() => { setSearch(''); setPage(0); }}>
                  <Ionicons name="close-circle" size={14} color="#94a3b8" />
                </TouchableOpacity>
              )}
            </View>

            {/* Status filter tabs */}
            {showStatusFilter && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={D.filterTabs} contentContainerStyle={{ gap: 6 }}>
                {STATUS_FILTERS.map(f => {
                  const active = statusFilter === f;
                  const cnt = statusCounts[f] || 0;
                  return (
                    <TouchableOpacity
                      key={f}
                      style={[D.filterTab, active && { backgroundColor: accent, borderColor: accent }]}
                      onPress={() => { setStatusFilter(f); setPage(0); }}
                      activeOpacity={0.8}
                    >
                      <Text style={[D.filterTabText, active && { color: '#fff' }]}>{STATUS_FILTER_LABELS[f]}</Text>
                      <View style={[D.filterTabBadge, active && { backgroundColor: 'rgba(255,255,255,0.25)' }]}>
                        <Text style={[D.filterTabBadgeText, active && { color: '#fff' }]}>{cnt}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
          </View>

          {/* ── Table ── */}
          {paged.length === 0 ? (
            <EmptyRow label="No results match your filter." />
          ) : (
            <>
              <ProdTableHeader cols={headers} />
              {paged.map((r, i) => (
                <ProdTableRow key={r.key ?? i} odd={i % 2 === 1} cols={r.cols} colors={r.colors} />
              ))}
            </>
          )}

          {/* ── Pagination ── */}
          {totalPages > 1 && (
            <View style={D.pagination}>
              <TouchableOpacity
                style={[D.pageBtn, safePage === 0 && D.pageBtnDisabled]}
                onPress={() => setPage(p => Math.max(0, p - 1))}
                disabled={safePage === 0}
                activeOpacity={0.8}
              >
                <Ionicons name="chevron-back" size={14} color={safePage === 0 ? '#cbd5e1' : accent} />
                <Text style={[D.pageBtnText, { color: safePage === 0 ? '#cbd5e1' : accent }]}>Prev</Text>
              </TouchableOpacity>

              <View style={D.pageInfo}>
                <Text style={D.pageInfoText}>
                  {safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
                </Text>
                <Text style={D.pageInfoSub}>Page {safePage + 1} of {totalPages}</Text>
              </View>

              <TouchableOpacity
                style={[D.pageBtn, safePage >= totalPages - 1 && D.pageBtnDisabled]}
                onPress={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={safePage >= totalPages - 1}
                activeOpacity={0.8}
              >
                <Text style={[D.pageBtnText, { color: safePage >= totalPages - 1 ? '#cbd5e1' : accent }]}>Next</Text>
                <Ionicons name="chevron-forward" size={14} color={safePage >= totalPages - 1 ? '#cbd5e1' : accent} />
              </TouchableOpacity>
            </View>
          )}
        </>
      )}
    </Section>
  );
}

function KpiCard({ icon, color, label, value, sub }: { icon: keyof typeof Ionicons.glyphMap; color: string; label: string; value: string | number; sub: string }) {
  return (
    <View style={[D.kpiCard, { borderTopColor: color }]}>
      <View style={[D.kpiIcon, { backgroundColor: color + '15' }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <Text style={D.kpiLabel}>{label}</Text>
      <Text style={[D.kpiValue, { color }]}>{value}</Text>
      <Text style={D.kpiSub}>{sub}</Text>
    </View>
  );
}

function Section({ title, icon, accent, count, children }: { title: string; icon: keyof typeof Ionicons.glyphMap; accent: string; count: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <View style={[D.section, { borderLeftColor: accent }]}>
      <TouchableOpacity style={D.sectionHead} onPress={() => setOpen(!open)} activeOpacity={0.8}>
        <View style={D.sectionHeadLeft}>
          <View style={[D.sectionIcon, { backgroundColor: accent + '15' }]}>
            <Ionicons name={icon} size={15} color={accent} />
          </View>
          <Text style={D.sectionTitle}>{title}</Text>
          <View style={[D.countBadge, { backgroundColor: accent + '15' }]}>
            <Text style={[D.countText, { color: accent }]}>{count}</Text>
          </View>
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color="#94a3b8" />
      </TouchableOpacity>
      {open && <View style={D.sectionBody}>{children}</View>}
    </View>
  );
}


function ProdTableHeader({ cols }: { cols: string[] }) {
  return (
    <View style={D.tblHead}>
      {cols.map((c, i) => (
        <Text key={i} style={[D.tblHCell, i === 0 && { flex: 1.5 }]}>{c}</Text>
      ))}
    </View>
  );
}

function ProdTableRow({ cols, colors, odd }: { cols: any[]; colors: string[]; odd: boolean }) {
  return (
    <View style={[D.tblRow, odd && { backgroundColor: '#f8fafc' }]}>
      {cols.map((c, i) => (
        <Text key={i} style={[D.tblCell, i === 0 && { flex: 1.5 }, { color: colors[i] || '#334155' }, i > 1 && { fontWeight: '700' }]} numberOfLines={1}>
          {String(c ?? '—')}
        </Text>
      ))}
    </View>
  );
}

function EmptyRow({ label }: { label: string }) {
  return (
    <View style={D.emptyRow}>
      <Ionicons name="information-circle-outline" size={18} color="#94a3b8" />
      <Text style={D.emptyText}>{label}</Text>
    </View>
  );
}



// ─── Professional Design System ─────────────────────────────────────────────
const D = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f0f4f8' },
  scroll: { padding: 20, paddingBottom: 40, gap: 16 },

  // Header
  header: {
    backgroundColor: '#063f3d', borderRadius: 16, padding: 20,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    shadowColor: '#063f3d', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25, shadowRadius: 14, elevation: 8,
  },
  headerLeft: { flex: 1 },
  headerKicker: { color: '#6ee7b7', fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1.5 },
  headerTitle: { color: '#ffffff', fontSize: 24, fontWeight: '900', marginTop: 4, letterSpacing: -0.5 },
  headerDate: { color: '#94a3b8', fontSize: 12, marginTop: 4 },
  refreshBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#00877f', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  refreshBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  // KPI Cards
  kpiCard: {
    width: 160, backgroundColor: '#fff', borderRadius: 14,
    padding: 16, borderTopWidth: 3,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  kpiIcon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  kpiLabel: { fontSize: 10, fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.8 },
  kpiValue: { fontSize: 22, fontWeight: '900', marginTop: 4, letterSpacing: -0.5 },
  kpiSub: { fontSize: 11, color: '#94a3b8', marginTop: 4, fontWeight: '500' },

  // Sections
  section: {
    backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden',
    borderLeftWidth: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  sectionHead: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
  },
  sectionHeadLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sectionIcon: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: '#0f172a', letterSpacing: -0.2 },
  countBadge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
  countText: { fontSize: 12, fontWeight: '800' },
  sectionBody: { padding: 12, gap: 8 },

  // WO Rows
  woRow: {
    flexDirection: 'row', backgroundColor: '#f8fafc', borderRadius: 12,
    overflow: 'hidden', borderWidth: 1, borderColor: '#e2e8f0',
  },
  woAccent: { width: 4 },
  woMain: { flex: 1, padding: 12, gap: 6 },
  woTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  woId: { fontSize: 14, fontWeight: '900', color: '#0f172a', fontFamily: 'monospace' },
  woPart: { fontSize: 11, color: '#64748b', fontWeight: '500' },
  woStats: { flexDirection: 'row', gap: 8, marginTop: 4 },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4,
    borderWidth: 1,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 10, fontWeight: '800' },

  // Stat Chips
  statChip: {
    backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 10,
    paddingVertical: 6, borderWidth: 1, borderColor: '#e2e8f0', alignItems: 'center',
  },
  statValue: { fontSize: 13, fontWeight: '900' },
  statLabel: { fontSize: 9, color: '#94a3b8', fontWeight: '600', textTransform: 'uppercase', marginTop: 1 },

  // Production Tables
  tblHead: {
    flexDirection: 'row', backgroundColor: '#1e293b', borderRadius: 8,
    paddingVertical: 10, paddingHorizontal: 8, marginBottom: 4,
  },
  tblHCell: { flex: 1, fontSize: 10, fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 },
  tblRow: {
    flexDirection: 'row', paddingVertical: 10, paddingHorizontal: 8,
    borderBottomWidth: 1, borderBottomColor: '#f1f5f9', backgroundColor: '#fff',
  },
  tblCell: { flex: 1, fontSize: 12, fontWeight: '500', color: '#334155' },

  // Empty
  emptyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 16, justifyContent: 'center' },
  emptyText: { fontSize: 13, color: '#94a3b8', fontWeight: '500' },

  // Filter bar
  filterBar: { gap: 10, marginBottom: 10 },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#f8fafc', borderRadius: 10, borderWidth: 1,
    borderColor: '#e2e8f0', paddingHorizontal: 12, paddingVertical: 8,
  },
  searchInput: { flex: 1, fontSize: 13, color: '#0f172a', outlineWidth: 0 } as any,
  filterTabs: { flexGrow: 0 },
  filterTab: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
    backgroundColor: '#f8fafc', borderWidth: 1.5, borderColor: '#e2e8f0',
  },
  filterTabText: { fontSize: 12, fontWeight: '700', color: '#64748b' },
  filterTabBadge: {
    backgroundColor: '#e2e8f0', borderRadius: 10,
    paddingHorizontal: 6, paddingVertical: 1,
  },
  filterTabBadgeText: { fontSize: 10, fontWeight: '800', color: '#64748b' },

  // Pagination
  pagination: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#f1f5f9',
  },
  pageBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8,
    borderWidth: 1.5, borderColor: '#e2e8f0', backgroundColor: '#f8fafc',
  },
  pageBtnDisabled: { borderColor: '#f1f5f9', backgroundColor: '#fafafa' },
  pageBtnText: { fontSize: 12, fontWeight: '700' },
  pageInfo: { alignItems: 'center' },
  pageInfoText: { fontSize: 12, fontWeight: '700', color: '#334155' },
  pageInfoSub: { fontSize: 10, color: '#94a3b8', marginTop: 2 },
});

// Keep old styles reference to avoid compile errors from any lingering references
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#f2f7f6',
  },
  scrollContent: {
    padding: 12,
    paddingBottom: 20,
  },
  workspace: {
    width: '100%',
    maxWidth: 1220,
    alignSelf: 'center',
    gap: 10,
  },
  topBar: {
    minHeight: 82,
    backgroundColor: '#063f3d',
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  topBarCompact: {
    alignItems: 'stretch',
    flexDirection: 'column',
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
  },
  kicker: {
    color: '#8de0d9',
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  title: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '900',
    marginTop: 2,
  },
  dateText: {
    color: '#c8dbd8',
    fontSize: 12,
    marginTop: 4,
  },
  refreshBtn: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: '#00877f',
    borderRadius: 10,
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  refreshBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
  metricStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  metricCard: {
    flex: 1,
    minWidth: 165,
    minHeight: 86,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d7e6e4',
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  metricIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricBody: {
    flex: 1,
    minWidth: 0,
  },
  metricTitle: {
    color: '#5b7773',
    fontSize: 11,
    fontWeight: '800',
  },
  metricValue: {
    color: '#083d3a',
    fontSize: 22,
    fontWeight: '900',
    marginTop: 1,
  },
  metricLabel: {
    color: '#7a9692',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 1,
  },
  contentGrid: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  contentGridCompact: {
    flexDirection: 'column',
  },
  controlsColumn: {
    flex: 1,
    minWidth: 240,
    gap: 10,
  },
  ordersPanel: {
    flex: 1.45,
    minWidth: 340,
  },
  fullWidthPanel: {
    width: '100%',
    minWidth: 0,
  },
  measureMainText: {
    flex: 1,
    minWidth: 0,
  },
  panel: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d7e6e4',
    padding: 14,
    overflow: 'hidden',
  },
  sectionHeader: {
    marginBottom: 12,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    color: '#083d3a',
    fontSize: 15,
    fontWeight: '900',
  },
  mainMeasure: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#f7fbfa',
    borderRadius: 10,
    padding: 12,
  },
  measureLabel: {
    color: '#5b7773',
    fontSize: 11,
    fontWeight: '800',
  },
  measureValue: {
    fontSize: 25,
    fontWeight: '900',
    marginTop: 2,
  },
  measureMeta: {
    minWidth: 64,
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d7e6e4',
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  measureMetaValue: {
    color: '#00877f',
    fontSize: 18,
    fontWeight: '900',
  },
  measureMetaLabel: {
    color: '#5b7773',
    fontSize: 10,
    fontWeight: '800',
  },
  progressTrack: {
    height: 7,
    backgroundColor: '#d7e6e4',
    borderRadius: 999,
    overflow: 'hidden',
    marginTop: 12,
  },
  progressFill: {
    height: 7,
    borderRadius: 999,
  },
  inlineStats: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  compactStat: {
    flex: 1,
    minWidth: 0,
    borderRadius: 10,
    backgroundColor: '#f7fbfa',
    borderWidth: 1,
    borderColor: '#d7e6e4',
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  compactValue: {
    fontSize: 15,
    fontWeight: '900',
  },
  compactLabel: {
    color: '#5b7773',
    fontSize: 10,
    fontWeight: '800',
    marginTop: 2,
  },
  qualityRow: {
    flexDirection: 'row',
    gap: 10,
  },
  yieldDial: {
    width: 140,
    borderRadius: 12,
    backgroundColor: '#e8f8f6',
    borderWidth: 1,
    borderColor: '#a9e4df',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
  },
  yieldValue: {
    color: '#00877f',
    fontSize: 32,
    fontWeight: '900',
  },
  qualityStats: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    minWidth: 0,
  },
  orderList: {
    width: '100%',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#d7e6e4',
    overflow: 'hidden',
  },
  orderRow: {
    width: '100%',
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eef2f7',
  },
  orderRowCompact: {
    alignItems: 'flex-start',
  },
  orderIdentity: {
    flex: 1,
    minWidth: 0,
  },
  orderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
  },
  orderId: {
    color: '#00877f',
    fontFamily: 'monospace',
    fontSize: 13,
    fontWeight: '900',
  },
  orderDetail: {
    color: '#5b7773',
    fontSize: 11,
    marginTop: 2,
  },
  orderMeta: {
    maxWidth: 150,
    alignItems: 'flex-end',
    gap: 5,
    flexShrink: 0,
  },
  orderQty: {
    color: '#264946',
    fontSize: 12,
    fontWeight: '800',
  },
  statusBadge: {
    maxWidth: 140,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    flexShrink: 1,
    fontSize: 10,
    fontWeight: '900',
  },
  subOrderList: {
    backgroundColor: '#f7fbfa',
    borderBottomWidth: 1,
    borderBottomColor: '#eef2f7',
  },
  subOrderRow: {
    width: '100%',
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 22,
    paddingVertical: 9,
    borderTopWidth: 1,
    borderTopColor: '#d7e6e4',
  },
  subOrderId: {
    color: '#315451',
    fontFamily: 'monospace',
    fontSize: 12,
    fontWeight: '900',
  },
  subOrderEmpty: {
    color: '#7a9692',
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 22,
    paddingVertical: 10,
  },
  paginationBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 10,
  },
  pageButton: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#a9e4df',
    backgroundColor: '#e8f8f6',
    paddingHorizontal: 10,
  },
  pageButtonDisabled: {
    borderColor: '#d7e6e4',
    backgroundColor: '#f7fbfa',
  },
  pageButtonText: {
    color: '#00877f',
    fontSize: 12,
    fontWeight: '900',
  },
  pageButtonTextDisabled: {
    color: '#7a9692',
  },
  pageCount: {
    flex: 1,
    color: '#5b7773',
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center',
  },
  processRail: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  processRailCompact: {
    flexDirection: 'column',
  },
  processNode: {
    flex: 1,
    minWidth: 160,
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 10,
    backgroundColor: '#f7fbfa',
    borderWidth: 1,
    borderColor: '#d7e6e4',
    padding: 10,
  },
  processIconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  processText: {
    flex: 1,
    minWidth: 0,
  },
  processName: {
    color: '#083d3a',
    fontSize: 12,
    fontWeight: '900',
  },
  processStep: {
    color: '#5b7773',
    fontSize: 10,
    fontWeight: '800',
    marginTop: 2,
  },
  emptyText: {
    width: '100%',
    color: '#7a9692',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    paddingVertical: 12,
  },
});
