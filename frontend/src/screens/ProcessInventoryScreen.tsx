import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl,
  ActivityIndicator, TouchableOpacity,
} from 'react-native';
import { DataStorage } from '../utils/storage';
import { DataTable, Column } from '../components';

type ActiveTab = 'overview' | 'detail' | 'workorders';

interface ProcessInventoryMetrics {
  processId: string;
  processName: string;
  pendingCount: number;
  inProgressCount: number;
  completedGoodCount: number;
  reworkCount: number;
  rejectedCount: number;
  scrapWeightKg: number;
  totalWip: number;
  activeWoCount: number;
  yieldRate: number;
  inputTotal: number;
}

interface ActiveStageRow {
  stageId: string;
  woDisplayId: string;
  partId: string;
  processType: string;
  processName: string;
  status: string;
  inputQty: number;
  goodParts: number;
  reworkParts: number;
  rejectedParts: number;
  scrapKg: number;
  isOutsourced: boolean;
  materialGrade: string;
}

const PROCESS_CONFIG: Record<string, { icon: string; color: string; bgColor: string; borderColor: string; lightBg: string }> = {
  DIE_CASTING:  { icon: '🔥', color: '#00877f', bgColor: '#00877f', borderColor: '#bfdbfe', lightBg: '#e8f8f6' },
  COATING:      { icon: '🎨', color: '#7c3aed', bgColor: '#7c3aed', borderColor: '#ddd6fe', lightBg: '#f5f3ff' },
  MACHINING:    { icon: '⚙️', color: '#006b65', bgColor: '#006b65', borderColor: '#bae6fd', lightBg: '#f0f9ff' },
  FINAL_QA:     { icon: '✅', color: '#059669', bgColor: '#059669', borderColor: '#bbf7d0', lightBg: '#f0fdf4' },
  OUTSOURCED:   { icon: '📦', color: '#d97706', bgColor: '#d97706', borderColor: '#fde68a', lightBg: '#fffbeb' },
};

const getPC = (id: string) =>
  PROCESS_CONFIG[id] ?? { icon: '🏭', color: '#486966', bgColor: '#486966', borderColor: '#d7e6e4', lightBg: '#f7fbfa' };

const STATUS_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  IN_PROGRESS:  { label: 'In Progress', color: '#d97706', bg: '#fef3c7' },
  READY_FOR_QI: { label: 'Ready for QI', color: '#00877f', bg: '#d9f3f0' },
  QI_SUBMITTED: { label: 'QI Submitted', color: '#7c3aed', bg: '#ede9fe' },
  PDC_VERIFIED: { label: 'PDC Verified', color: '#059669', bg: '#dcfce7' },
  PENDING:      { label: 'Pending', color: '#5b7773', bg: '#edf5f4' },
  COMPLETED:    { label: 'Completed', color: '#166534', bg: '#bbf7d0' },
};

export function ProcessInventoryScreen() {
  const [loading, setLoading]               = useState(true);
  const [refreshing, setRefreshing]         = useState(false);
  const [activeTab, setActiveTab]           = useState<ActiveTab>('overview');
  const [metrics, setMetrics]               = useState<ProcessInventoryMetrics[]>([]);
  const [activeStageRows, setActiveStageRows] = useState<ActiveStageRow[]>([]);
  const [lastUpdated, setLastUpdated]       = useState('');
  const [overallStats, setOverallStats]     = useState({
    totalWip: 0, totalCompleted: 0, totalScrap: 0,
    totalRejected: 0, totalRework: 0,
    overallYield: 0, activeWoCount: 0,
  });

  useEffect(() => { loadData(); }, []);

  const loadData = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const [allProcesses, allStages, allWorkOrders] = await Promise.all([
        DataStorage.getProcesses(),
        DataStorage.getProcessStages(),
        DataStorage.getWorkOrders(),
      ]);

      const woMap = new Map<string, any>();
      allWorkOrders.forEach((wo: any) => woMap.set(String(wo._id || wo.id), wo));

      const processMap = new Map<string, ProcessInventoryMetrics>();

      allProcesses.forEach((p: any) => {
        processMap.set(p.processId, {
          processId: p.processId, processName: p.processName,
          pendingCount: 0, inProgressCount: 0, completedGoodCount: 0,
          reworkCount: 0, rejectedCount: 0, scrapWeightKg: 0,
          totalWip: 0, activeWoCount: 0, yieldRate: 0, inputTotal: 0,
        });
      });
      processMap.set('OUTSOURCED', {
        processId: 'OUTSOURCED', processName: 'Vendor Hub (Outsourced)',
        pendingCount: 0, inProgressCount: 0, completedGoodCount: 0,
        reworkCount: 0, rejectedCount: 0, scrapWeightKg: 0,
        totalWip: 0, activeWoCount: 0, yieldRate: 0, inputTotal: 0,
      });

      let tWip = 0, tCompleted = 0, tScrap = 0, tRejected = 0, tRework = 0;
      const activeWoIds = new Set<string>();
      const stageRows: ActiveStageRow[] = [];

      allStages.forEach((stage: any) => {
        const woRaw = stage.workOrderId;
        const wo = (typeof woRaw === 'object' && woRaw !== null)
          ? woRaw
          : woMap.get(String(woRaw || '')) || {};
        if (!wo || wo.type === 'MAIN' || !wo.type) return;

        const isOutsourced = wo.isExternalVendor || wo.isOutsourced;
        const targetProcess = isOutsourced ? 'OUTSOURCED' : stage.type;

        let metric = processMap.get(targetProcess);
        if (!metric) {
          metric = {
            processId: targetProcess,
            processName: targetProcess.replace(/_/g, ' '),
            pendingCount: 0, inProgressCount: 0, completedGoodCount: 0,
            reworkCount: 0, rejectedCount: 0, scrapWeightKg: 0,
            totalWip: 0, activeWoCount: 0, yieldRate: 0, inputTotal: 0,
          };
          processMap.set(targetProcess, metric);
        }

        const inputQty  = stage.inputQuantity || wo.targetPartCount || 0;
        const goodQty   = stage.goodPartsCount || 0;
        const routedQty = stage.routedPartsCount || 0;
        const unroutedGood = Math.max(0, goodQty - routedQty);

        if (stage.status === 'PENDING') {
          metric.pendingCount += inputQty;
          metric.totalWip     += inputQty;
          tWip += inputQty;
        } else if (['IN_PROGRESS', 'READY_FOR_QI', 'QI_SUBMITTED', 'PDC_VERIFIED'].includes(stage.status)) {
          const activeWip = Math.max(0, inputQty - goodQty);
          metric.inProgressCount += activeWip;
          metric.totalWip        += activeWip;
          tWip += activeWip;
          const woId = String(wo._id || wo.id || '');
          if (woId && !activeWoIds.has(woId)) {
            activeWoIds.add(woId);
            metric.activeWoCount++;
          }
        }

        metric.completedGoodCount += unroutedGood;
        metric.reworkCount        += stage.reworkPartsCount   || 0;
        metric.rejectedCount      += stage.rejectedPartsCount || 0;
        metric.scrapWeightKg      += stage.scrapWeightKg      || 0;
        metric.inputTotal         += inputQty;

        tCompleted += unroutedGood;
        tRejected  += stage.rejectedPartsCount || 0;
        tRework    += stage.reworkPartsCount   || 0;
        tScrap     += stage.scrapWeightKg      || 0;

        if (!['PENDING', 'COMPLETED'].includes(stage.status)) {
          const processConf = allProcesses.find((p: any) => p.processId === targetProcess);
          stageRows.push({
            stageId:      String(stage._id || stage.id || ''),
            woDisplayId:  wo.workOrderId || String(wo._id || wo.id || '').slice(-6) || '—',
            partId:       wo.partId || '—',
            processType:  targetProcess,
            processName:  processConf?.processName || targetProcess.replace(/_/g, ' '),
            status:       stage.status,
            inputQty,
            goodParts:    goodQty,
            reworkParts:  stage.reworkPartsCount   || 0,
            rejectedParts:stage.rejectedPartsCount || 0,
            scrapKg:      stage.scrapWeightKg      || 0,
            isOutsourced: !!isOutsourced,
            materialGrade: wo.materialGrade || '—',
          });
        }
      });

      processMap.forEach(m => {
        const tot = m.completedGoodCount + m.reworkCount + m.rejectedCount;
        m.yieldRate = tot > 0 ? Math.round((m.completedGoodCount / tot) * 100) : 0;
      });

      const totalOutput = tCompleted + tRework + tRejected;
      const overallYield = totalOutput > 0 ? Math.round((tCompleted / totalOutput) * 100) : 0;

      const result = Array.from(processMap.values()).filter(m =>
        m.totalWip > 0 || m.completedGoodCount > 0 || m.reworkCount > 0 || m.rejectedCount > 0 ||
        allProcesses.some((ap: any) => ap.processId === m.processId)
      );

      setMetrics(result);
      setActiveStageRows(stageRows);
      setOverallStats({ totalWip: tWip, totalCompleted: tCompleted, totalScrap: tScrap, totalRejected: tRejected, totalRework: tRework, overallYield, activeWoCount: activeWoIds.size });
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // ─── Detail table columns ───────────────────────────────────────────────
  const detailColumns: Column<ProcessInventoryMetrics>[] = [
    {
      key: 'processName',
      header: 'Process Stage',
      width: 220,
      render: (item) => {
        const pc = getPC(item.processId);
        return (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={[s.processIconBox, { backgroundColor: pc.lightBg, borderColor: pc.borderColor, borderWidth: 1 }]}>
              <Text style={{ fontSize: 18 }}>{pc.icon}</Text>
            </View>
            <View>
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#083d3a' }}>{item.processName}</Text>
              <Text style={{ fontSize: 10, color: '#7a9692', marginTop: 1 }}>{item.processId}</Text>
            </View>
          </View>
        );
      },
    },
    {
      key: 'totalWip',
      header: 'Total WIP',
      width: 120,
      render: (item) => (
        <View style={{ backgroundColor: '#e8f8f6', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 }}>
          <Text style={{ fontSize: 14, fontWeight: '800', color: '#00877f' }}>{item.totalWip.toLocaleString()}</Text>
          <Text style={{ fontSize: 9, color: '#5b7773' }}>pcs</Text>
        </View>
      ),
    },
    {
      key: 'pendingCount',
      header: 'Pending',
      width: 110,
      render: (item) => <Text style={{ fontSize: 13, color: '#5b7773', fontWeight: '600' }}>{item.pendingCount.toLocaleString()}</Text>,
    },
    {
      key: 'inProgressCount',
      header: 'In Progress',
      width: 115,
      render: (item) => <Text style={{ fontSize: 13, color: '#d97706', fontWeight: '700' }}>{item.inProgressCount.toLocaleString()}</Text>,
    },
    {
      key: 'completedGoodCount',
      header: 'Good Ready',
      width: 120,
      render: (item) => (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <Text style={{ fontSize: 13, color: '#16a34a', fontWeight: '700' }}>{item.completedGoodCount.toLocaleString()}</Text>
          {item.completedGoodCount > 0 && <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: '#22c55e' }} />}
        </View>
      ),
    },
    {
      key: 'reworkCount',
      header: 'Rework ↩',
      width: 100,
      render: (item) => <Text style={{ fontSize: 13, color: '#ea580c', fontWeight: '600' }}>{item.reworkCount.toLocaleString()}</Text>,
    },
    {
      key: 'rejectedCount',
      header: 'Rejected ✕',
      width: 105,
      render: (item) => <Text style={{ fontSize: 13, color: '#dc2626', fontWeight: '600' }}>{item.rejectedCount.toLocaleString()}</Text>,
    },
    {
      key: 'yieldRate' as any,
      header: 'Yield %',
      width: 100,
      render: (item) => {
        const y = item.yieldRate;
        const col = y >= 90 ? '#16a34a' : y >= 75 ? '#d97706' : '#dc2626';
        const bg  = y >= 90 ? '#dcfce7' : y >= 75 ? '#fef3c7' : '#fee2e2';
        return (
          <View style={{ backgroundColor: bg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, alignSelf: 'flex-start' }}>
            <Text style={{ fontSize: 13, fontWeight: '800', color: col }}>{y}%</Text>
          </View>
        );
      },
    },
    {
      key: 'scrapWeightKg',
      header: 'Scrap KG',
      width: 110,
      render: (item) => (
        <Text style={{ fontSize: 13, color: '#991b1b', fontWeight: '700' }}>
          {item.scrapWeightKg.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </Text>
      ),
    },
    {
      key: 'activeWoCount' as any,
      header: 'Active WOs',
      width: 100,
      render: (item) => (
        <View style={{ backgroundColor: '#edf5f4', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, alignSelf: 'flex-start' }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#315451' }}>{item.activeWoCount}</Text>
        </View>
      ),
    },
  ];

  // ─── Work-orders table columns ───────────────────────────────────────────
  const woColumns: Column<ActiveStageRow>[] = [
    {
      key: 'woDisplayId',
      header: 'Work Order',
      width: 130,
      render: (row) => (
        <Text style={{ fontSize: 13, fontWeight: '800', color: '#00877f', fontFamily: 'monospace' }}>
          {row.woDisplayId}
        </Text>
      ),
    },
    {
      key: 'partId',
      header: 'Part ID',
      width: 120,
      render: (row) => <Text style={{ fontSize: 13, fontWeight: '600', color: '#083d3a' }}>{row.partId}</Text>,
    },
    {
      key: 'processName',
      header: 'Process',
      width: 160,
      render: (row) => {
        const pc = getPC(row.processType);
        return (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ fontSize: 14 }}>{pc.icon}</Text>
            <Text style={{ fontSize: 12, fontWeight: '700', color: pc.color }}>{row.processName}</Text>
          </View>
        );
      },
    },
    {
      key: 'status',
      header: 'Stage Status',
      width: 140,
      render: (row) => {
        const s = STATUS_LABEL[row.status] || { label: row.status, color: '#486966', bg: '#edf5f4' };
        return (
          <View style={{ backgroundColor: s.bg, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: s.color }}>{s.label}</Text>
          </View>
        );
      },
    },
    {
      key: 'materialGrade',
      header: 'Grade',
      width: 110,
      render: (row) => <Text style={{ fontSize: 12, color: '#486966', fontWeight: '600' }}>{row.materialGrade}</Text>,
    },
    {
      key: 'inputQty',
      header: 'Input',
      width: 90,
      render: (row) => <Text style={{ fontSize: 13, fontWeight: '700', color: '#315451' }}>{row.inputQty.toLocaleString()}</Text>,
    },
    {
      key: 'goodParts',
      header: 'Good ✓',
      width: 90,
      render: (row) => <Text style={{ fontSize: 13, fontWeight: '700', color: '#16a34a' }}>{row.goodParts.toLocaleString()}</Text>,
    },
    {
      key: 'reworkParts',
      header: 'Rework ↩',
      width: 100,
      render: (row) => <Text style={{ fontSize: 13, fontWeight: '700', color: '#ea580c' }}>{row.reworkParts.toLocaleString()}</Text>,
    },
    {
      key: 'rejectedParts',
      header: 'Rejected ✕',
      width: 105,
      render: (row) => <Text style={{ fontSize: 13, fontWeight: '700', color: '#dc2626' }}>{row.rejectedParts.toLocaleString()}</Text>,
    },
    {
      key: 'scrapKg',
      header: 'Scrap KG',
      width: 100,
      render: (row) => (
        <Text style={{ fontSize: 12, color: '#991b1b', fontWeight: '600' }}>
          {row.scrapKg.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </Text>
      ),
    },
  ];

  // ─── Sub-renders ─────────────────────────────────────────────────────────

  const renderKpiBar = () => (
    <View style={s.kpiBar}>
      {[
        { label: 'Total WIP',   value: overallStats.totalWip.toLocaleString(),    suffix: 'pcs',   color: '#00877f', bg: '#e8f8f6',  icon: '🔄' },
        { label: 'Good Ready',  value: overallStats.totalCompleted.toLocaleString(), suffix: 'pcs', color: '#16a34a', bg: '#dcfce7',  icon: '✅' },
        { label: 'Rework',      value: overallStats.totalRework.toLocaleString(), suffix: 'pcs',   color: '#d97706', bg: '#fef3c7',  icon: '↩' },
        { label: 'Rejected',    value: overallStats.totalRejected.toLocaleString(), suffix: 'pcs', color: '#dc2626', bg: '#fee2e2',  icon: '✕' },
        { label: 'Scrap Weight',value: overallStats.totalScrap.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 }), suffix: 'KG', color: '#7c3aed', bg: '#f5f3ff', icon: '🗑' },
        { label: 'Overall Yield',value: `${overallStats.overallYield}`,           suffix: '%',     color: overallStats.overallYield >= 90 ? '#16a34a' : overallStats.overallYield >= 75 ? '#d97706' : '#dc2626', bg: overallStats.overallYield >= 90 ? '#dcfce7' : overallStats.overallYield >= 75 ? '#fef3c7' : '#fee2e2', icon: '📊' },
        { label: 'Active WOs',  value: overallStats.activeWoCount.toString(),     suffix: '',      color: '#006b65', bg: '#f0f9ff',  icon: '📋' },
      ].map((kpi) => (
        <View key={kpi.label} style={[s.kpiCard, { backgroundColor: kpi.bg }]}>
          <Text style={s.kpiIcon}>{kpi.icon}</Text>
          <Text style={[s.kpiValue, { color: kpi.color }]}>{kpi.value}<Text style={s.kpiSuffix}> {kpi.suffix}</Text></Text>
          <Text style={s.kpiLabel}>{kpi.label}</Text>
        </View>
      ))}
    </View>
  );

  const renderProcessCard = (metric: ProcessInventoryMetrics) => {
    const pc = getPC(metric.processId);
    const inputTotal = metric.inputTotal || 1;
    const goodPct   = Math.min(100, Math.round((metric.completedGoodCount / inputTotal) * 100));
    const wipPct    = Math.min(100 - goodPct, Math.round((metric.totalWip / inputTotal) * 100));
    const y = metric.yieldRate;
    const yColor = y >= 90 ? '#16a34a' : y >= 75 ? '#d97706' : '#dc2626';
    const yBg    = y >= 90 ? '#dcfce7' : y >= 75 ? '#fef3c7' : '#fee2e2';

    return (
      <View key={metric.processId} style={[s.processCard, { borderLeftColor: pc.color }]}>
        {/* Card header */}
        <View style={[s.cardHead, { backgroundColor: pc.lightBg }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
            <View style={[s.cardIconCircle, { borderColor: pc.borderColor }]}>
              <Text style={{ fontSize: 22 }}>{pc.icon}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.cardTitle, { color: pc.color }]}>{metric.processName}</Text>
              <Text style={s.cardSubtitle}>Process Stage Inventory</Text>
            </View>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 4 }}>
            <View style={[s.yieldBadge, { backgroundColor: yBg }]}>
              <Text style={[s.yieldText, { color: yColor }]}>{y}% yield</Text>
            </View>
            {metric.activeWoCount > 0 && (
              <View style={s.woBadge}>
                <Text style={s.woBadgeText}>{metric.activeWoCount} WO active</Text>
              </View>
            )}
          </View>
        </View>

        {/* Progress bar */}
        <View style={s.progressSection}>
          <View style={s.progressBar}>
            <View style={[s.progressFillGood, { flex: goodPct }]} />
            <View style={[s.progressFillWip,  { flex: wipPct  }]} />
            <View style={{ flex: Math.max(0, 100 - goodPct - wipPct), backgroundColor: '#d7e6e4' }} />
          </View>
          <View style={s.progressLegend}>
            <View style={s.legendItem}><View style={[s.legendDot, { backgroundColor: '#22c55e' }]} /><Text style={s.legendText}>Good {goodPct}%</Text></View>
            <View style={s.legendItem}><View style={[s.legendDot, { backgroundColor: pc.color }]} /><Text style={s.legendText}>WIP {wipPct}%</Text></View>
          </View>
        </View>

        {/* Stats grid */}
        <View style={s.statsGrid}>
          {[
            { label: 'Pending',    value: metric.pendingCount,       color: '#5b7773', bg: '#f7fbfa' },
            { label: 'In Progress',value: metric.inProgressCount,    color: '#d97706', bg: '#fffbeb' },
            { label: 'Good Ready', value: metric.completedGoodCount, color: '#16a34a', bg: '#f0fdf4' },
            { label: 'Rework ↩',   value: metric.reworkCount,        color: '#ea580c', bg: '#fff7ed' },
            { label: 'Rejected ✕', value: metric.rejectedCount,      color: '#dc2626', bg: '#fff1f2' },
            { label: 'Scrap KG',   value: metric.scrapWeightKg,      color: '#7c3aed', bg: '#faf5ff', isFloat: true },
          ].map((stat) => (
            <View key={stat.label} style={[s.statCell, { backgroundColor: stat.bg }]}>
              <Text style={[s.statCellVal, { color: stat.color }]}>
                {(stat as any).isFloat
                  ? stat.value.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
                  : (stat.value as number).toLocaleString()}
              </Text>
              <Text style={s.statCellLab}>{stat.label}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  };

  // ─── Main render ─────────────────────────────────────────────────────────
  return (
    <ScrollView
      style={s.root}
      contentContainerStyle={{ padding: 20 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadData(true)} />}
    >
      {/* ── Header ── */}
      <View style={s.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>Individual Process Inventory</Text>
          <Text style={s.headerSub}>Real-time WIP, yield, and material flow across all production stages</Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 6 }}>
          <View style={s.liveBadge}><View style={s.liveDot} /><Text style={s.liveText}>Live</Text></View>
          {lastUpdated ? <Text style={s.updatedText}>Updated {lastUpdated}</Text> : null}
          <TouchableOpacity style={s.refreshBtn} onPress={() => loadData(true)}>
            <Text style={s.refreshBtnText}>↻ Refresh</Text>
          </TouchableOpacity>
        </View>
      </View>

      {loading && !refreshing ? (
        <View style={{ padding: 60, alignItems: 'center' }}>
          <ActivityIndicator size="large" color="#00877f" />
          <Text style={{ marginTop: 16, color: '#5b7773', fontSize: 14, fontWeight: '600' }}>Loading Inventory Data...</Text>
        </View>
      ) : (
        <>
          {/* ── KPI Bar ── */}
          {renderKpiBar()}

          {/* ── Tab Bar ── */}
          <View style={s.tabBar}>
            {([
              { key: 'overview',    label: '🏭 By Process' },
              { key: 'detail',      label: '📋 Stage Detail' },
              { key: 'workorders',  label: '📄 Active Orders' },
            ] as { key: ActiveTab; label: string }[]).map((tab) => (
              <TouchableOpacity
                key={tab.key}
                style={[s.tab, activeTab === tab.key && s.tabActive]}
                onPress={() => setActiveTab(tab.key)}
              >
                <Text style={[s.tabText, activeTab === tab.key && s.tabTextActive]}>{tab.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* ── Overview: process cards ── */}
          {activeTab === 'overview' && (
            <View style={s.cardsGrid}>
              {metrics.length === 0 ? (
                <View style={s.emptyState}>
                  <Text style={s.emptyIcon}>📭</Text>
                  <Text style={s.emptyTitle}>No inventory data yet</Text>
                  <Text style={s.emptyText}>Start work orders to see process inventory metrics here.</Text>
                </View>
              ) : (
                metrics.map(renderProcessCard)
              )}
            </View>
          )}

          {/* ── Detail: enhanced table ── */}
          {activeTab === 'detail' && (
            <View style={s.tableCard}>
              <View style={s.tableCardHead}>
                <Text style={s.tableCardTitle}>Stage Inventory — All Processes</Text>
                <View style={s.liveBadge}><View style={s.liveDot} /><Text style={s.liveText}>Live Sync</Text></View>
              </View>
              <View style={{ padding: 16 }}>
                <DataTable
                  data={metrics}
                  columns={detailColumns}
                  keyExtractor={(item) => item.processId}
                  emptyMessage="No inventory data available."
                />
              </View>
            </View>
          )}

          {/* ── Work Orders: active stage rows ── */}
          {activeTab === 'workorders' && (
            <View style={s.tableCard}>
              <View style={s.tableCardHead}>
                <View>
                  <Text style={s.tableCardTitle}>Active Work Orders in Production</Text>
                  <Text style={{ fontSize: 12, color: '#5b7773', marginTop: 2 }}>
                    {activeStageRows.length} order{activeStageRows.length !== 1 ? 's' : ''} currently in progress
                  </Text>
                </View>
                <View style={[s.liveBadge, { backgroundColor: '#fef3c7' }]}>
                  <View style={[s.liveDot, { backgroundColor: '#d97706' }]} />
                  <Text style={[s.liveText, { color: '#d97706' }]}>{overallStats.activeWoCount} Active</Text>
                </View>
              </View>
              <View style={{ padding: 16 }}>
                {activeStageRows.length === 0 ? (
                  <View style={[s.emptyState, { paddingVertical: 32 }]}>
                    <Text style={s.emptyIcon}>🏁</Text>
                    <Text style={s.emptyTitle}>No active work orders</Text>
                    <Text style={s.emptyText}>All work orders are either pending or completed.</Text>
                  </View>
                ) : (
                  <DataTable
                    data={activeStageRows}
                    columns={woColumns}
                    keyExtractor={(row) => row.stageId}
                    emptyMessage="No active work orders."
                  />
                )}
              </View>
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#edf5f4' },

  // Header
  headerRow:  { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 20, gap: 12 },
  headerTitle:{ fontSize: 22, fontWeight: '900', color: '#083d3a', letterSpacing: -0.3 },
  headerSub:  { fontSize: 13, color: '#5b7773', marginTop: 3, fontWeight: '500' },
  liveBadge:  { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#dcfce7', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  liveDot:    { width: 7, height: 7, borderRadius: 4, backgroundColor: '#16a34a' },
  liveText:   { fontSize: 11, fontWeight: '800', color: '#16a34a', textTransform: 'uppercase', letterSpacing: 0.5 },
  updatedText:{ fontSize: 11, color: '#7a9692', fontWeight: '500' },
  refreshBtn: { backgroundColor: '#00877f', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8 },
  refreshBtnText: { fontSize: 12, fontWeight: '700', color: '#fff' },

  // KPI bar
  kpiBar:     { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  kpiCard:    { flex: 1, minWidth: 110, borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(0,0,0,0.04)' },
  kpiIcon:    { fontSize: 20, marginBottom: 4 },
  kpiValue:   { fontSize: 22, fontWeight: '900', letterSpacing: -0.5 },
  kpiSuffix:  { fontSize: 12, fontWeight: '600' },
  kpiLabel:   { fontSize: 11, color: '#486966', fontWeight: '600', marginTop: 3, textAlign: 'center' },

  // Tab bar
  tabBar:       { flexDirection: 'row', backgroundColor: '#ffffff', borderRadius: 14, padding: 5, marginBottom: 20, borderWidth: 1, borderColor: '#d7e6e4', gap: 3 },
  tab:          { flex: 1, paddingVertical: 11, borderRadius: 10, alignItems: 'center' },
  tabActive:    { backgroundColor: '#00877f' },
  tabText:      { fontSize: 13, fontWeight: '700', color: '#5b7773' },
  tabTextActive:{ color: '#ffffff' },

  // Process cards grid
  cardsGrid:    { gap: 16 },
  processCard:  {
    backgroundColor: '#ffffff', borderRadius: 16,
    borderLeftWidth: 5, borderLeftColor: '#00877f',
    borderWidth: 1, borderColor: '#d7e6e4',
    overflow: 'hidden',
    shadowColor: '#083d3a', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04, shadowRadius: 12, elevation: 2,
  },
  cardHead:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingLeft: 20 },
  cardIconCircle: { width: 48, height: 48, borderRadius: 14, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  cardTitle:      { fontSize: 16, fontWeight: '800', letterSpacing: -0.2 },
  cardSubtitle:   { fontSize: 11, color: '#7a9692', marginTop: 2, fontWeight: '500' },
  yieldBadge:     { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  yieldText:      { fontSize: 12, fontWeight: '800' },
  woBadge:        { backgroundColor: '#edf5f4', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  woBadgeText:    { fontSize: 10, color: '#486966', fontWeight: '700' },

  // Progress bar
  progressSection:{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 12 },
  progressBar:    { height: 10, borderRadius: 6, flexDirection: 'row', overflow: 'hidden', backgroundColor: '#d7e6e4' },
  progressFillGood:{ backgroundColor: '#22c55e' },
  progressFillWip: { backgroundColor: '#60a5fa' },
  progressLegend: { flexDirection: 'row', gap: 16, marginTop: 7 },
  legendItem:     { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot:      { width: 8, height: 8, borderRadius: 4 },
  legendText:     { fontSize: 11, color: '#5b7773', fontWeight: '600' },

  // Stats grid inside card
  statsGrid:      { flexDirection: 'row', flexWrap: 'wrap', padding: 12, paddingTop: 4, gap: 8 },
  statCell:       { flex: 1, minWidth: 90, borderRadius: 10, padding: 10, alignItems: 'center' },
  statCellVal:    { fontSize: 18, fontWeight: '900', letterSpacing: -0.3 },
  statCellLab:    { fontSize: 10, color: '#5b7773', fontWeight: '600', marginTop: 2 },

  // Table card
  tableCard:      {
    backgroundColor: '#ffffff', borderRadius: 16,
    borderWidth: 1, borderColor: '#d7e6e4', overflow: 'hidden',
    shadowColor: '#083d3a', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03, shadowRadius: 12, elevation: 2, marginBottom: 24,
  },
  tableCardHead:  {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, borderBottomWidth: 1, borderBottomColor: '#edf5f4',
    backgroundColor: '#fafaf9',
  },
  tableCardTitle: { fontSize: 15, fontWeight: '800', color: '#083d3a' },
  processIconBox: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },

  // Empty state
  emptyState:   { alignItems: 'center', paddingVertical: 48 },
  emptyIcon:    { fontSize: 40, marginBottom: 12 },
  emptyTitle:   { fontSize: 16, fontWeight: '800', color: '#315451', marginBottom: 6 },
  emptyText:    { fontSize: 13, color: '#7a9692', textAlign: 'center', fontWeight: '500' },
});
