import React, { useEffect, useState, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl,
  ActivityIndicator, TouchableOpacity,
} from 'react-native';
import { DataStorage } from '../utils/storage';

// ─── helpers ────────────────────────────────────────────────────────────────
const fmtKg = (n: number) => (n <= 0 ? '' : n >= 1000 ? n.toFixed(0) : n.toFixed(2));
const fmtQty = (n: number) => (n <= 0 ? '' : n.toLocaleString());

// ─── constants ───────────────────────────────────────────────────────────────
const PROCESS_ORDER = ['DIE_CASTING', 'COATING', 'MACHINING', 'FINAL_QA', 'OUTSOURCED'];
const PROCESS_LABELS: Record<string, string> = {
  DIE_CASTING: 'Die Casting', COATING: 'Coating',
  MACHINING: 'Machining', FINAL_QA: 'Final QA', OUTSOURCED: 'Outsourced',
};

const STATUS_FILTERS = ['ALL', 'IN_PROGRESS', 'PENDING', 'COMPLETED'];
const STATUS_COLORS: Record<string, string> = {
  IN_PROGRESS: '#0ea5e9', PENDING: '#f59e0b',
  COMPLETED: '#22c55e', CANCELLED: '#ef4444',
};
const STATUS_LABELS: Record<string, string> = {
  IN_PROGRESS: 'In Progress', PENDING: 'Pending',
  COMPLETED: 'Completed', CANCELLED: 'Cancelled',
};

// ─── cell widths ────────────────────────────────────────────────────────────
const W_PROCESS = 155;
const W_DETAIL = 130;
const W_STOCKTYPE = 155;
const W_KG_ONLY = 88;
const W_QTY_KG = 136;

// ─── colours ─────────────────────────────────────────────────────────────────
const BORDER = '#000';
const HDR_BG = '#1e293b';
const HDR2_BG = '#334155';
const TOTAL_BG = '#0f172a';
const STOCK_COLORS: Record<string, { bg: string; text: string }> = {
  'RAW MATL': { bg: '#dbeafe', text: '#1d4ed8' },
  'WIP': { bg: '#dcfce7', text: '#15803d' },
  'PART STOCK': { bg: '#f0f9ff', text: '#0369a1' },
  'REWORK STOCK': { bg: '#fef9c3', text: '#78350f' },
  'LOST STOCK': { bg: '#fee2e2', text: '#991b1b' },
  'SCRAP STOCK': { bg: '#fff7ed', text: '#9a3412' },
};

// ─── types ───────────────────────────────────────────────────────────────────
interface Cell { kg: number; qty: number; }

interface LedgerRow {
  stage: string;
  process: string;
  detail: string;
  stockType: string;
  cells: Cell[];
  isFirstInStage: boolean;
}

// ─── Main Screen ─────────────────────────────────────────────────────────────
export function InventoryLedgerScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<any | null>(null);
  const [activeFilter, setFilter] = useState('ALL');

  useEffect(() => { load(); }, []);

  const load = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const result = await DataStorage.getInventoryLedger();
      if (result) setData(result);
    } catch (_) { }
    finally { setLoading(false); setRefreshing(false); }
  };

  // ── All hooks must be called before any early returns ──
  const workOrders: any[] = data?.workOrders || [];
  const rawMaterial = data?.rawMaterial || { totalReceivedKg: 0, availableKg: 0 };
  const wip = data?.wip || { kg: 0 };

  const filteredWOs: any[] = useMemo(() => {
    if (activeFilter === 'ALL') return workOrders;
    return workOrders.filter((wo: any) => wo.status === activeFilter);
  }, [workOrders, activeFilter]);

  const statusCounts: Record<string, number> = useMemo(() => {
    const counts: Record<string, number> = { ALL: workOrders.length };
    for (const wo of workOrders) {
      counts[wo.status] = (counts[wo.status] || 0) + 1;
    }
    return counts;
  }, [workOrders]);

  const woNum = (id: string) => parseInt((id || '').replace(/\D/g, '') || '0', 10);

  // Group: main WOs (most recent first) + all children from full list
  const groupedWOs: { main: any; children: any[] }[] = useMemo(() => {
    const mainWOs = filteredWOs
      .filter(wo => !wo.parentWorkOrderId)
      .sort((a, b) => woNum(b.workOrderId) - woNum(a.workOrderId)); // most recent first

    return mainWOs.map(main => ({
      main,
      children: workOrders
        .filter(wo => wo.parentWorkOrderId && String(wo.parentWorkOrderId) === String(main.id))
        .sort((a, b) => {
          if (a.type === 'REWORK' && b.type !== 'REWORK') return 1;
          if (a.type !== 'REWORK' && b.type === 'REWORK') return -1;
          return woNum(a.workOrderId) - woNum(b.workOrderId);
        }),
    }));
  }, [workOrders, filteredWOs]);

  // ── Early returns AFTER all hooks ──
  if (loading) return (
    <View style={S.center}>
      <ActivityIndicator size="large" color="#00877f" />
      <Text style={S.loadingText}>Loading Inventory Ledger…</Text>
    </View>
  );

  if (!data) return (
    <View style={S.center}>
      <Text style={S.errorText}>No data available.</Text>
      <TouchableOpacity style={S.retryBtn} onPress={() => load()}>
        <Text style={S.retryBtnText}>Retry</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <ScrollView
      style={S.root}
      contentContainerStyle={S.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
    >
      {/* ── Page header ── */}
      <View style={S.pageHeader}>
        <View>
          <Text style={S.pageTitle}>Inventory Ledger</Text>
          <Text style={S.pageSubtitle}>Material flow per Work Order</Text>
        </View>
        <TouchableOpacity style={S.refreshBtn} onPress={() => load(true)}>
          <Text style={S.refreshBtnText}>⟳  Refresh</Text>
        </TouchableOpacity>
      </View>

      {/* ── Summary cards ── */}
      <View style={S.cardRow}>
        <SummaryCard label="Total Received" value={`${fmtKg(rawMaterial.totalReceivedKg) || '0'} KG`} color="#0ea5e9" />
        <SummaryCard label="Available Stock" value={`${fmtKg(rawMaterial.availableKg) || '0'} KG`} color="#22c55e" />
        <SummaryCard label="WIP" value={`${fmtKg(wip.kg) || '0'} KG`} color="#f59e0b" />
        <SummaryCard label="Work Orders" value={`${(workOrders || []).length}`} color="#8b5cf6" />
      </View>

      {/* ── Status filter tabs ── */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={S.tabsScroll}>
        <View style={S.tabs}>
          {STATUS_FILTERS.map(f => {
            const count = statusCounts[f] || 0;
            const isActive = activeFilter === f;
            const color = f === 'ALL' ? '#00877f' : (STATUS_COLORS[f] || '#64748b');
            return (
              <TouchableOpacity
                key={f}
                style={[S.tab, isActive && { backgroundColor: color, borderColor: color }]}
                onPress={() => setFilter(f)}
              >
                <Text style={[S.tabText, isActive && S.tabTextActive]}>
                  {f === 'ALL' ? 'All' : STATUS_LABELS[f] || f}
                </Text>
                <View style={[S.tabBadge, isActive && { backgroundColor: 'rgba(255,255,255,0.3)' }]}>
                  <Text style={[S.tabBadgeText, isActive && { color: '#fff' }]}>{count}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      {/* ── One table per Main WO group ── */}
      {groupedWOs.length === 0 ? (
        <View style={S.emptyBox}>
          <Text style={S.emptyText}>No Work Orders found for "{activeFilter === 'ALL' ? 'All' : STATUS_LABELS[activeFilter] || activeFilter}"</Text>
        </View>
      ) : (
        groupedWOs.map(({ main, children }) => (
          <WoGroupLedger key={main.id} main={main} children={children} />
        ))
      )}
    </ScrollView>
  );
}

// ─── Build ledger rows for one WO given a unified process column list ─────────
function buildWoRows(wo: any, allProcessTypes: string[], numCols: number, skipStages = false): LedgerRow[] {
  const wpp = wo.weightPerPart || 0;
  const allocated = wo.allocatedKg || 0;
  const consumed = wo.consumedKg || allocated;
  const emptyRow = (): Cell[] => Array.from({ length: numCols }, () => ({ kg: 0, qty: 0 }));
  const rows: LedgerRow[] = [];

  // Stage 1: Raw Matl Inward
  const r1 = emptyRow();
  r1[0] = { kg: allocated, qty: 0 };
  for (let i = 1; i < numCols; i++) r1[i] = { kg: Math.max(0, allocated - consumed), qty: 0 };
  rows.push({ stage: 'Stage 1', process: 'Raw Matl Inward', detail: '', stockType: 'RAW MATL', cells: r1, isFirstInStage: true });

  // Stage 2: W.O Assignment + WIP
  const woTypeLabel = wo.type === 'REWORK' ? 'Rework Order' : wo.type === 'SUB' ? 'Sub-Order' : 'Main Order';
  rows.push({ stage: 'Stage 2', process: `W.O: ${wo.workOrderId}`, detail: woTypeLabel, stockType: '', cells: emptyRow(), isFirstInStage: true });

  const r2b = emptyRow();
  r2b[1] = { kg: consumed, qty: wo.targetPartCount || 0 };
  rows.push({ stage: '', process: 'M/c Assignment', detail: `Target: ${wo.targetPartCount || 0} pcs`, stockType: 'WIP', cells: r2b, isFirstInStage: false });

  // Stage 3+: only for SUB / REWORK — main WO is reference only
  if (!skipStages) {
    let cumLostKg = 0;
    allProcessTypes.forEach((pt, idx) => {
      const colIdx = idx + 2;
      const ps = (wo.processBreakdown || []).find((p: any) => p.processType === pt);
      const goodKg = ps ? (ps.goodParts || 0) * wpp : 0;
      const reworkKg = ps ? (ps.reworkParts || 0) * wpp : 0;
      const lostKg = ps ? (ps.rejectedParts || 0) * wpp : 0;
      const scrapKg = ps ? (ps.scrapKg || 0) : 0;
      cumLostKg += lostKg;

      let downstreamKg = 0, downstreamQty = 0;
      for (let k = idx + 1; k < allProcessTypes.length; k++) {
        const nx = (wo.processBreakdown || []).find((p: any) => p.processType === allProcessTypes[k]);
        if (nx) {
          downstreamKg += ((nx.goodParts || 0) + (nx.reworkParts || 0) + (nx.rejectedParts || 0)) * wpp + (nx.scrapKg || 0);
          downstreamQty += (nx.goodParts || 0) + (nx.reworkParts || 0);
        }
      }

      const cPart = emptyRow(); cPart[colIdx] = { kg: goodKg + downstreamKg, qty: (ps?.goodParts || 0) + downstreamQty };
      const cRework = emptyRow(); cRework[colIdx] = { kg: reworkKg, qty: ps?.reworkParts || 0 };
      const cLost = emptyRow(); cLost[colIdx] = { kg: cumLostKg, qty: ps?.rejectedParts || 0 };
      const cScrap = emptyRow(); cScrap[colIdx] = { kg: scrapKg, qty: 0 };

      rows.push({ stage: `Stage ${idx + 3}`, process: PROCESS_LABELS[pt] || pt, detail: `Good Part - ${ps?.goodParts || 0}`, stockType: 'PART STOCK', cells: cPart, isFirstInStage: true });
      rows.push({ stage: '', process: '', detail: `Rework - ${ps?.reworkParts || 0}`, stockType: 'REWORK STOCK', cells: cRework, isFirstInStage: false });
      rows.push({ stage: '', process: '', detail: `Reject - ${ps?.rejectedParts || 0}`, stockType: 'LOST STOCK', cells: cLost, isFirstInStage: false });
      rows.push({ stage: '', process: '', detail: scrapKg > 0 ? `Scrap - ${scrapKg.toFixed(2)} KG` : '', stockType: 'SCRAP STOCK', cells: cScrap, isFirstInStage: false });
    });
  }
  return rows;
}

// ─── One table per Main WO group (main + SWOs + rework inline) ───────────────
function WoGroupLedger({ main, children }: { main: any; children: any[] }) {
  const [collapsed, setCollapsed] = useState(false);

  // Unified process types across main + all children
  const allProcessTypes: string[] = PROCESS_ORDER.filter(pt =>
    [main, ...children].some(wo =>
      (wo.processBreakdown || []).some((p: any) => p.processType === pt)
    )
  );

  const numCols = 2 + allProcessTypes.length;
  const colMetas = [
    { label: 'Stage 1', sub: 'Stock in KG', hasQty: false },
    { label: 'Stage 2', sub: 'KG', hasQty: false },
    ...allProcessTypes.map((pt, i) => ({ label: `Stage ${i + 3}`, sub: PROCESS_LABELS[pt] || pt, hasQty: true })),
  ];
  const colWidth = (i: number) => colMetas[i]?.hasQty ? W_QTY_KG : W_KG_ONLY;

  const mainStatusColor = STATUS_COLORS[main.status] || '#64748b';
  const mainStatusLabel = STATUS_LABELS[main.status] || main.status;
  const allocated = main.allocatedKg || 0;

  // Render a single data row
  const renderDataRow = (r: LedgerRow, ri: number, stageColor: string) => {
    const sc = STOCK_COLORS[r.stockType] || { bg: '#fff', text: '#1e293b' };
    const rowBg = r.stockType ? '#fff' : '#f8fafc';
    return (
      <View key={ri} style={[S.tr, { backgroundColor: rowBg }]}>
        <View style={[S.cell, { width: W_PROCESS, flexDirection: 'row', alignItems: 'flex-start', paddingTop: 7 }]}>
          {r.isFirstInStage && r.stage
            ? <View style={[S.stageTag, { backgroundColor: stageColor }]}><Text style={S.stageTagText}>{r.stage}</Text></View>
            : <View style={{ width: 56 }} />}
          <Text style={[S.tdText, { flex: 1, fontWeight: r.isFirstInStage ? '700' : '400', fontSize: 11 }]} numberOfLines={3}>{r.process}</Text>
        </View>
        <View style={[S.cell, { width: W_DETAIL }]}>
          <Text style={[S.tdText, { fontSize: 10, color: '#64748b' }]}>{r.detail}</Text>
        </View>
        <View style={[S.cell, { width: W_STOCKTYPE, backgroundColor: sc.bg }]}>
          <Text style={[S.tdText, { fontWeight: '700', fontSize: 11, color: sc.text }]}>{r.stockType}</Text>
        </View>
        {r.cells.map((c, ci) => {
          const hasQty = colMetas[ci]?.hasQty;
          const isLast = ci === colMetas.length - 1;
          return hasQty ? (
            <View key={ci} style={[S.cell, { width: W_QTY_KG, padding: 0, flexDirection: 'row', borderRightWidth: isLast ? 0 : 1 }]}>
              <View style={{ flex: 1, borderRightWidth: 1, borderColor: BORDER, justifyContent: 'center', paddingHorizontal: 5, paddingVertical: 6 }}>
                <Text style={[S.tdText, S.numText]}>{fmtQty(c.qty)}</Text>
              </View>
              <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 5, paddingVertical: 6 }}>
                <Text style={[S.tdText, S.numText]}>{fmtKg(c.kg)}</Text>
              </View>
            </View>
          ) : (
            <View key={ci} style={[S.cell, { width: W_KG_ONLY, borderRightWidth: isLast ? 0 : 1 }]}>
              <Text style={[S.tdText, S.numText]}>{fmtKg(c.kg)}</Text>
            </View>
          );
        })}
      </View>
    );
  };

  // Sub-header row that spans all columns inside the table
  const renderSubHeader = (child: any) => {
    const isRework = child.type === 'REWORK';
    const bg = isRework ? '#fef3c7' : '#e0f2fe';
    const textColor = isRework ? '#92400e' : '#0369a1';
    const icon = isRework ? '↩' : '⤷';
    const label = isRework ? 'REWORK ORDER' : 'SUB-ORDER';
    const childStatusColor = STATUS_COLORS[child.status] || '#64748b';
    const childStatusLabel = STATUS_LABELS[child.status] || child.status;
    return (
      <View key={`hdr-${child.id}`} style={[S.tr, { backgroundColor: bg, borderTopWidth: 2, borderTopColor: '#cbd5e1' }]}>
        <View style={[S.cell, { width: W_PROCESS, backgroundColor: bg }]}>
          <Text style={{ fontSize: 11, fontWeight: '800', color: textColor }}>{icon} {child.workOrderId}</Text>
          <Text style={{ fontSize: 9, color: textColor, opacity: 0.8, marginTop: 1 }}>{label}</Text>
        </View>
        <View style={[S.cell, { width: W_DETAIL, backgroundColor: bg }]}>
          <View style={{ backgroundColor: childStatusColor + '22', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-start', borderWidth: 1, borderColor: childStatusColor }}>
            <Text style={{ fontSize: 9, fontWeight: '700', color: childStatusColor }}>{childStatusLabel}</Text>
          </View>
        </View>
        <View style={[S.cell, { width: W_STOCKTYPE, backgroundColor: bg }]}>
          <Text style={{ fontSize: 10, color: textColor, fontWeight: '600' }}>Target: {child.targetPartCount || 0} pcs</Text>
        </View>
        {colMetas.map((_, ci) => (
          <View key={ci} style={[S.cell, { width: colWidth(ci), backgroundColor: bg, borderRightWidth: ci === colMetas.length - 1 ? 0 : 1, borderColor: '#cbd5e1' }]} />
        ))}
      </View>
    );
  };

  // Main WO = reference only (Stage 1 + Stage 2 only, no process stages)
  const mainRows = buildWoRows(main, allProcessTypes, numCols, true);

  return (
    <View style={S.woGroup}>
      {/* Group header — tap to collapse */}
      <TouchableOpacity style={S.woHeader} onPress={() => setCollapsed(!collapsed)} activeOpacity={0.8}>
        <View style={[S.woStatusBar, { backgroundColor: mainStatusColor }]} />
        <View style={S.woHeaderContent}>
          <View style={S.woHeaderLeft}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={S.woId}>{main.workOrderId}</Text>
              {children.length > 0 && (
                <View style={{ backgroundColor: '#e0f2fe', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: '#0369a1' }}>{children.length} sub-order{children.length > 1 ? 's' : ''}</Text>
                </View>
              )}
            </View>
            {main.partName ? <Text style={S.woPart}>{main.partName} {main.partId ? `(${main.partId})` : ''}</Text> : null}
            <View style={S.woMetaRow}>
              {main.startDate ? <Text style={S.woMeta}>📅 {new Date(main.startDate).toLocaleDateString()}</Text> : null}
              {main.endDate ? <Text style={S.woMeta}> → {new Date(main.endDate).toLocaleDateString()}</Text> : null}
            </View>
          </View>
          <View style={S.woHeaderRight}>
            <View style={[S.statusPill, { backgroundColor: mainStatusColor + '22', borderColor: mainStatusColor }]}>
              <Text style={[S.statusPillText, { color: mainStatusColor }]}>{mainStatusLabel}</Text>
            </View>
            <Text style={S.woAllocated}>{allocated.toFixed(0)} KG allocated</Text>
            {main.targetPartCount > 0 ? <Text style={S.woTarget}>{main.targetPartCount} pcs target</Text> : null}
            <Text style={S.woChevron}>{collapsed ? '▼' : '▲'}</Text>
          </View>
        </View>
      </TouchableOpacity>

      {/* Single combined table */}
      {!collapsed && (
        <ScrollView horizontal showsHorizontalScrollIndicator>
          <View style={S.table}>

            {/* Column header row 1 */}
            <View style={[S.tr, { backgroundColor: HDR_BG }]}>
              <HCell w={W_PROCESS} label="PROCESS" />
              <HCell w={W_DETAIL} label="DETAILS" />
              <HCell w={W_STOCKTYPE} label="STOCK TYPE" stockType />
              {colMetas.map((c, i) => <HCell key={i} w={colWidth(i)} label={c.label} last={i === colMetas.length - 1} />)}
            </View>

            {/* Column header row 2 */}
            <View style={[S.tr, { backgroundColor: HDR2_BG }]}>
              <HCell w={W_PROCESS} label="" />
              <HCell w={W_DETAIL} label="" />
              <HCell w={W_STOCKTYPE} label="" stockType />
              {colMetas.map((c, i) =>
                c.hasQty ? (
                  <View key={i} style={[S.cell, { width: W_QTY_KG, flexDirection: 'row', padding: 0, backgroundColor: HDR2_BG, borderRightWidth: i === colMetas.length - 1 ? 0 : 1, borderColor: '#475569' }]}>
                    <View style={{ flex: 1, borderRightWidth: 1, borderColor: '#475569', justifyContent: 'center', alignItems: 'center', paddingVertical: 5 }}>
                      <Text style={S.hText}>QTY</Text>
                    </View>
                    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 5 }}>
                      <Text style={S.hText}>KG</Text>
                    </View>
                  </View>
                ) : (
                  <HCell key={i} w={colWidth(i)} label={c.sub} last={i === colMetas.length - 1} />
                )
              )}
            </View>

            {/* Main WO rows */}
            {mainRows.map((r, ri) => renderDataRow(r, ri, mainStatusColor))}

            {/* Each child: sub-header + full process rows inline */}
            {children.map(child => {
              const childStatusColor = STATUS_COLORS[child.status] || '#64748b';
              const childRows = buildWoRows(child, allProcessTypes, numCols, false);
              return (
                <React.Fragment key={child.id}>
                  {renderSubHeader(child)}
                  {childRows.map((r, ri) => renderDataRow(r, ri, childStatusColor))}
                </React.Fragment>
              );
            })}

            {/* Grand total — sums across all children process rows only (main is reference) */}
            {(() => {
              const allChildRows = children.flatMap(c => buildWoRows(c, allProcessTypes, numCols, false));
              return (
                <View style={[S.tr, { backgroundColor: TOTAL_BG }]}>
                  <View style={[S.cell, { width: W_PROCESS, backgroundColor: TOTAL_BG }]}>
                    <Text style={[S.tdText, { color: '#94a3b8', fontWeight: '800', fontSize: 11 }]}>TOTAL</Text>
                  </View>
                  <View style={[S.cell, { width: W_DETAIL, backgroundColor: TOTAL_BG }]}><Text /></View>
                  <View style={[S.cell, { width: W_STOCKTYPE, backgroundColor: '#1e293b' }]}>
                    <Text style={[S.tdText, { color: '#94a3b8', fontWeight: '700', fontSize: 11 }]}>TOTAL ACCOUNT</Text>
                  </View>
                  {colMetas.map((cm, ci) => {
                    const isLast = ci === colMetas.length - 1;
                    const totalKg = allChildRows.reduce((s, r) => s + (r.cells[ci]?.kg || 0), 0);
                    return cm.hasQty ? (
                      <View key={ci} style={[S.cell, { width: W_QTY_KG, padding: 0, flexDirection: 'row', backgroundColor: TOTAL_BG, borderRightWidth: isLast ? 0 : 1, borderColor: '#334155' }]}>
                        <View style={{ flex: 1, borderRightWidth: 1, borderColor: '#334155', justifyContent: 'center', padding: 5 }}><Text /></View>
                        <View style={{ flex: 1, justifyContent: 'center', padding: 5 }}>
                          <Text style={[S.tdText, S.numText, { color: '#38bdf8', fontWeight: '800' }]}>{fmtKg(totalKg)}</Text>
                        </View>
                      </View>
                    ) : (
                      <View key={ci} style={[S.cell, { width: W_KG_ONLY, backgroundColor: TOTAL_BG, borderRightWidth: isLast ? 0 : 1, borderColor: '#334155' }]}>
                        <Text style={[S.tdText, S.numText, { color: '#38bdf8', fontWeight: '800' }]}>{fmtKg(totalKg)}</Text>
                      </View>
                    );
                  })}
                </View>
              );
            })()}

          </View>
        </ScrollView>
      )}
    </View>
  );
}

// ─── Small sub-components ────────────────────────────────────────────────────
function SummaryCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={[SC.card, { borderLeftColor: color }]}>
      <Text style={SC.cardLabel}>{label}</Text>
      <Text style={[SC.cardValue, { color }]}>{value}</Text>
    </View>
  );
}

interface HCellProps { w: number; label: string; stockType?: boolean; last?: boolean; }
function HCell({ w, label, stockType, last }: HCellProps) {
  return (
    <View style={[
      S.cell,
      { width: w, backgroundColor: stockType ? HDR2_BG : HDR_BG, borderRightWidth: last ? 0 : 1, borderColor: '#475569' },
    ]}>
      <Text style={S.hText}>{label}</Text>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f1f5f9' },
  content: { padding: 16, paddingBottom: 50 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f1f5f9' },
  loadingText: { marginTop: 12, fontSize: 15, fontWeight: '600', color: '#00877f' },
  errorText: { marginTop: 12, fontSize: 15, fontWeight: '600', color: '#991b1b' },
  retryBtn: { marginTop: 16, paddingHorizontal: 20, paddingVertical: 10, backgroundColor: '#00877f', borderRadius: 8 },
  retryBtnText: { color: '#fff', fontWeight: '700' },

  pageHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  pageTitle: { fontSize: 24, fontWeight: '800', color: '#0f172a', letterSpacing: -0.5 },
  pageSubtitle: { fontSize: 13, color: '#64748b', marginTop: 2 },
  refreshBtn: { backgroundColor: '#00877f', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  refreshBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  cardRow: { flexDirection: 'row', gap: 8, marginBottom: 16, flexWrap: 'wrap' },

  tabsScroll: { marginBottom: 16 },
  tabs: { flexDirection: 'row', gap: 8, paddingBottom: 4 },
  tab: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 20, backgroundColor: '#fff',
    borderWidth: 1.5, borderColor: '#e2e8f0',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 2, elevation: 1,
  },
  tabText: { fontSize: 13, fontWeight: '600', color: '#64748b' },
  tabTextActive: { color: '#fff' },
  tabBadge: { backgroundColor: '#f1f5f9', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1 },
  tabBadgeText: { fontSize: 11, fontWeight: '700', color: '#64748b' },

  emptyBox: { backgroundColor: '#fff', borderRadius: 12, padding: 40, alignItems: 'center', marginTop: 20 },
  emptyText: { fontSize: 15, color: '#94a3b8', fontWeight: '500' },

  woGroup: {
    marginBottom: 20,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 8, elevation: 4,
    backgroundColor: '#f8fafc',
  },
  woCard: {
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  woStatusBar: { height: 4 },
  woHeader: { padding: 14 },
  woHeaderContent: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  woHeaderLeft: { flex: 1 },
  woHeaderRight: { alignItems: 'flex-end', gap: 4 },
  woId: { fontSize: 17, fontWeight: '800', color: '#0f172a', letterSpacing: -0.3 },
  woPart: { fontSize: 13, color: '#475569', marginTop: 2, fontWeight: '500' },
  woMetaRow: { flexDirection: 'row', marginTop: 4 },
  woMeta: { fontSize: 11, color: '#94a3b8' },
  statusPill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12, borderWidth: 1 },
  statusPillText: { fontSize: 11, fontWeight: '700' },
  woAllocated: { fontSize: 12, color: '#475569', fontWeight: '600' },
  woTarget: { fontSize: 11, color: '#94a3b8' },
  woChevron: { fontSize: 16, color: '#94a3b8', marginTop: 4 },

  table: { borderWidth: 1, borderColor: BORDER, backgroundColor: '#fff', marginHorizontal: 14, marginBottom: 14 },
  tr: { flexDirection: 'row', borderBottomWidth: 1, borderColor: BORDER },

  cell: {
    borderRightWidth: 1, borderColor: BORDER,
    paddingHorizontal: 6, paddingVertical: 5,
    justifyContent: 'center', minHeight: 34,
  },

  hText: { fontWeight: '700', fontSize: 11, color: '#fff', textAlign: 'center' },
  tdText: { fontSize: 11, color: '#1e293b' },
  numText: { textAlign: 'right', fontVariant: ['tabular-nums'] as any },

  stageTag: {
    width: 54, borderRadius: 4,
    paddingHorizontal: 3, paddingVertical: 2,
    marginRight: 5, alignSelf: 'flex-start',
    alignItems: 'center',
  },
  stageTagText: { fontSize: 9, fontWeight: '800', color: '#fff', textAlign: 'center' },
});

const SC = StyleSheet.create({
  card: {
    flex: 1, minWidth: 120, backgroundColor: '#fff',
    borderRadius: 10, padding: 12, borderLeftWidth: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  cardLabel: { fontSize: 11, color: '#64748b', fontWeight: '500', marginBottom: 4 },
  cardValue: { fontSize: 16, fontWeight: '800' },
});
