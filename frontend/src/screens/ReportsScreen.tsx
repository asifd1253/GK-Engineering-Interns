import React, { useEffect, useState, useMemo } from 'react';
import { Platform, View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { DataStorage, fmtDate, fmtDateTime } from '../utils/storage';
import { WorkOrder, ProcessStage, User } from '../types';
import { DataTable, Column, PageHeader, StatusBadge, DatePicker } from '../components';
import { useToast } from '../context';

type ReportTab = 'history' | 'workorder' | 'shift' | 'daily' | 'machine';

const formatReportDate = (value: any): string => {
  if (!value) return '';
  return fmtDate(value);
};

export function ReportsScreen() {
  const { showToast } = useToast();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [stages, setStages] = useState<ProcessStage[]>([]);
  const [allMachines, setAllMachines] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<ReportTab>('history');
  const [selectedWO, setSelectedWO] = useState<string | null>(null);

  // Date range filter
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useEffect(() => {
    loadData();
  }, [activeTab]);

  const loadData = async () => {
    const user = await DataStorage.getCurrentUser();
    setCurrentUser(user);
    const [orders, stageData, machines] = await Promise.all([
      DataStorage.getWorkOrders(),
      DataStorage.getProcessStages(),
      DataStorage.getMachines()
    ]);
    setWorkOrders(orders);
    setStages(stageData);
    setAllMachines(machines);
  };


  // ── Derived: map stages → full detail inspection rows ─────────────────────
  const inspections = useMemo(() => stages.map(s => {
    const wo = (s.workOrderId && typeof s.workOrderId === 'object' ? s.workOrderId : null) as any;
    const woId = (s.workOrderId && typeof s.workOrderId === 'string')
      ? s.workOrderId
      : String(wo?._id || wo?.id || '');

    const machinesUsed = Array.from(new Set([
      ...(s.machineId ? [s.machineId] : []),
      ...(s.machineAssignments?.map(a => a.machineId) || [])
    ]));

    return {
      id: s._id || s.id,
      date: s.updatedAt ? s.updatedAt.split('T')[0] : new Date().toISOString().split('T')[0],
      workOrderId: woId,
      woSlug: wo?.workOrderId || `WO-${woId.slice(-6).toUpperCase()}`,
      masterId: wo?.masterId || '',
      batchNumber: (s as any).batchNumber || wo?.batchNumber || '',
      partId: wo?.partId || '',
      shift: Array.isArray(wo?.shifts) ? wo.shifts.join(', ') : (wo?.shift || 'N/A'),
      machines: machinesUsed.length > 0 ? machinesUsed.join(', ') : (wo?.machineId || 'N/A'),
      type: s.type,
      inputQty: s.inputQuantity || 0,
      goodCount: s.goodPartsCount || 0,
      goodKg: (s.goodPartsCount || 0) * (wo?.weightPerPart || 0),
      reworkCount: s.reworkPartsCount || 0,
      rejectedCount: s.rejectedPartsCount || 0,
      rejectionReasons: (s.rejectionReasons || []).join(', '),
      scrapKg: s.scrapWeightKg || 0,
      scrapReasons: (s.scrapReasons || []).join(', '),
      vendorName: wo?.vendorName || (wo?.isExternalVendor ? 'External' : 'Internal'),
      performedBy: (s.pdcUserId as any)?.name || (s.pdcUserId as any) || 'System',
      verifiedBy: (s.qiUserId as any)?.name || (s.qiUserId as any) || 'Pending',
      status: s.status,
    };
  }), [stages]);

  const isInRange = (dateStr: string) => {
    if (!dateFrom && !dateTo) return true;
    const d = new Date(dateStr);
    if (dateFrom && d < new Date(dateFrom)) return false;
    if (dateTo && d > new Date(dateTo + 'T23:59:59')) return false;
    return true;
  };

  const filteredWO = workOrders.filter(wo => isInRange(wo.date || wo.createdAt || ''));
  const filteredInspections = inspections.filter(i => isInRange(i.date));

  // Pre-calculate machines for summary views
  const woMachineMap = useMemo(() => {
    const map: Record<string, string[]> = {};
    stages.forEach(s => {
      const woId = String(typeof s.workOrderId === 'string' ? s.workOrderId : s.workOrderId?._id || s.workOrderId?.id || '');
      if (!woId) return;
      if (!map[woId]) map[woId] = [];
      if (s.machineId) map[woId].push(s.machineId);
      if (s.machineAssignments) s.machineAssignments.forEach(a => map[woId].push(a.machineId));
    });
    Object.keys(map).forEach(k => map[k] = Array.from(new Set(map[k])));
    return map;
  }, [stages]);

  // ── KPI Aggregation: correct grouping by WO ID ──────────────────────────────
  // - Total Produced = sum of targetPartCount from MAIN WOs only (to avoid double-counting SUBs)
  // - Good Parts    = goodPartsCount from the most recent COMPLETED/VERIFIED stage per WO
  // - Scrap         = additive across all stages (always correct)
  const { totalProduced, totalGood, totalScrapKg } = useMemo(() => {
    // 1. Identify MAIN orders and their SUB orders
    const mainOrders = filteredWO.filter(wo => (wo as any).type === 'MAIN' || !(wo as any).type);
    const mainOrderIds = new Set(mainOrders.map(wo => String((wo as any)._id || wo.id)));
    
    // produced: sum targetPartCount from MAIN work orders only
    const produced = mainOrders.reduce((s, wo) => s + (wo.targetPartCount || 0), 0);

    // 2. Track latest progress per SUB order
    const latestGoodBySub: Record<string, { stage: string, count: number, timestamp: string }> = {};
    const additiveScrapByMain: Record<string, number> = {};

    stages.forEach(s => {
      const wo = s.workOrderId as any;
      if (!wo) return;
      
      const subId = String(wo._id || wo.id || '');
      const mainId = String(wo.parentWorkOrderId || subId);
      
      if (!mainOrderIds.has(mainId)) return;

      // Good parts: Take the latest stage's good count for each SUB order
      const ts = s.updatedAt || s.createdAt || '';
      if (!latestGoodBySub[subId] || ts >= latestGoodBySub[subId].timestamp) {
        latestGoodBySub[subId] = {
          stage: s.type,
          count: s.goodPartsCount || 0,
          timestamp: ts
        };
      }

      // Scrap: Always additive across all stages and sub-orders of a MAIN order
      additiveScrapByMain[mainId] = (additiveScrapByMain[mainId] || 0) + (s.scrapWeightKg || 0);
    });

    // 3. Sum up the good parts from all SUB orders
    const good = Object.values(latestGoodBySub).reduce((s, v) => s + v.count, 0);
    const scrapKg = Object.values(additiveScrapByMain).reduce((s, v) => s + v, 0);

    return { totalProduced: produced, totalGood: good, totalScrapKg: scrapKg };
  }, [filteredWO, stages]);

  const yieldRate = totalProduced > 0 ? ((totalGood / totalProduced) * 100).toFixed(1) : '0.0';

  // Summaries
  const shiftSummary = useMemo(() => {
    const shifts = Array.from(new Set(filteredInspections.map(i => i.shift).filter(s => s && s !== 'N/A')));
    return shifts.map(shift => {
      const si = filteredInspections.filter(i => i.shift === shift);
      return {
        shift,
        produced: si.reduce((s, x) => s + x.inputQty, 0),
        good: si.reduce((s, x) => s + x.goodCount, 0),
        rework: si.reduce((s, x) => s + x.reworkCount, 0),
        rejected: si.reduce((s, x) => s + x.rejectedCount, 0),
        scrapKg: si.reduce((s, x) => s + x.scrapKg, 0),
        count: si.length
      };
    });
  }, [filteredInspections]);

  const dailySummary = useMemo(() => {
    const dates = Array.from(new Set(filteredInspections.map(i => i.date))).sort().reverse();
    return dates.map(date => {
      const di = filteredInspections.filter(i => i.date === date);
      return {
        date,
        produced: di.reduce((s, x) => s + x.inputQty, 0),
        good: di.reduce((s, x) => s + x.goodCount, 0),
        goodKg: di.reduce((s, x) => s + x.goodKg, 0),
        rework: di.reduce((s, x) => s + x.reworkCount, 0),
        rejected: di.reduce((s, x) => s + x.rejectedCount, 0),
        scrapKg: di.reduce((s, x) => s + x.scrapKg, 0),
        count: di.length
      };
    });
  }, [filteredInspections]);

  const machineSummary = useMemo(() => {
    const machineList = allMachines.length > 0
      ? allMachines
      : Array.from(new Set(filteredInspections.map(i => i.machines.split(', ')).flat())).map(id => ({ machineId: id, name: id, type: 'Unknown' }));

    return machineList.map(m => {
      const mi = filteredInspections.filter(i => i.machines.includes(m.machineId));

      const dayInspections = mi.filter(ins => {
        const hour = new Date(ins.date + ' ' + (ins as any).updatedAt?.split('T')[1] || '12:00').getHours();
        return hour >= 8 && hour < 20;
      });
      const nightInspections = mi.filter(ins => {
        const hour = new Date(ins.date + ' ' + (ins as any).updatedAt?.split('T')[1] || '12:00').getHours();
        return hour >= 20 || hour < 8;
      });

      const dayProduced = dayInspections.reduce((s, x) => s + x.inputQty, 0);
      const nightProduced = nightInspections.reduce((s, x) => s + x.inputQty, 0);

      const calcShiftStats = (produced: number) => {
        const cycleTimeMin = 12;
        const runningMinutes = produced * cycleTimeMin;
        const totalShiftMinutes = 12 * 60;

        const actualRun = Math.min(runningMinutes, totalShiftMinutes - 30);
        const idle = totalShiftMinutes - actualRun;

        return {
          produced,
          runH: Math.floor(actualRun / 60),
          runM: Math.floor(actualRun % 60),
          idleH: Math.floor(idle / 60),
          idleM: Math.floor(idle % 60),
          runPercent: (actualRun / totalShiftMinutes) * 100,
          idlePercent: (idle / totalShiftMinutes) * 100
        };
      };

      const dayStats = calcShiftStats(dayProduced);
      const nightStats = calcShiftStats(nightProduced);

      const totalProduced = dayProduced + nightProduced;
      const goodCount = mi.reduce((s, x) => s + x.goodCount, 0);
      const qualityRate = totalProduced > 0 ? (goodCount / totalProduced) : 0;
      const availabilityRate = ((dayStats.runPercent + nightStats.runPercent) / 200);
      const oee = (availabilityRate * qualityRate * 100).toFixed(0);

      return {
        ...m,
        totalProduced,
        oee,
        day: dayStats,
        night: nightStats,
        efficiency: totalProduced > 0 ? ((goodCount / totalProduced) * 100).toFixed(1) : '0.0'
      };
    }).sort((a, b) => b.totalProduced - a.totalProduced);
  }, [allMachines, filteredInspections]);
  const getStyledTableHTML = (title: string) => {
    const tenantName = currentUser?.tenantName || 'Wimera Client';
    const dateStr = fmtDateTime(new Date());

    let headers = '';
    let rows = '';

    if (activeTab === 'history') {
      headers = `<tr>
        <th>Date</th><th>WO #</th><th>Master ID</th><th>Batch No</th><th>Part ID</th><th>Stage</th><th>Input</th><th>Good</th><th>Good KG</th><th>Rework</th><th>Rejected</th><th>Rejection Reasons</th><th>Scrap KG</th><th>Scrap Reasons</th><th>Vendor</th><th>Machine(s)</th><th>PDC User</th><th>QI User</th><th>Status</th>
      </tr>`;
      rows = filteredInspections.map(i => `<tr>
        <td>${formatReportDate(i.date)}</td><td>${i.woSlug}</td><td>${i.masterId}</td><td>${i.batchNumber || ''}</td><td>${i.partId}</td><td>${i.type}</td><td>${i.inputQty}</td><td>${i.goodCount}</td><td>${i.goodKg.toFixed(2)}</td><td>${i.reworkCount}</td><td>${i.rejectedCount}</td><td>"${i.rejectionReasons}"</td><td>${i.scrapKg.toFixed(2)}</td><td>"${i.scrapReasons}"</td><td>${i.vendorName}</td><td>${i.machines}</td><td>${i.performedBy}</td><td>${i.verifiedBy}</td><td>${i.status}</td>
      </tr>`).join('');
    } else if (activeTab === 'workorder') {
      headers = `<tr><th>WO #</th><th>Date</th><th>Part ID</th><th>Target</th><th>Grade</th><th>Machines</th><th>Shift</th><th>Vendor</th><th>Status</th></tr>`;
      rows = filteredWO.map(wo => {
        const m = woMachineMap[wo.id || (wo as any)._id || ''] || [];
        const shiftStr = Array.isArray(wo.shifts) ? wo.shifts.join(', ') : (wo as any).shift || '';
        const woLabel = wo.workOrderId || `WO-${String(wo.id || (wo as any)._id || '').slice(-6).toUpperCase()}`;
        return `<tr><td>${woLabel}</td><td>${formatReportDate(wo.date || wo.createdAt)}</td><td>${wo.partId}</td><td>${wo.targetPartCount}</td><td>${wo.materialGrade}</td><td>${m.join(', ')}</td><td>${shiftStr}</td><td>${(wo as any).vendorName || ''}</td><td>${wo.status}</td></tr>`;
      }).join('');
    } else if (activeTab === 'shift') {
      headers = `<tr><th>Shift</th><th>Produced</th><th>Good ✓</th><th>Rework</th><th>Rejected</th><th>Scrap KG</th><th>Logs</th></tr>`;
      rows = shiftSummary.map(s => `<tr><td>${s.shift}</td><td>${s.produced}</td><td>${s.good}</td><td>${s.rework}</td><td>${s.rejected}</td><td>${s.scrapKg.toFixed(2)}</td><td>${s.count}</td></tr>`).join('');
    } else {
      headers = `<tr><th>Date</th><th>Produced</th><th>Good ✓</th><th>Good KG</th><th>Rework</th><th>Rejected</th><th>Scrap KG</th><th>Stages</th></tr>`;
      rows = dailySummary.map(d => `<tr><td>${formatReportDate(d.date)}</td><td>${d.produced}</td><td>${d.good}</td><td>${d.goodKg.toFixed(2)}</td><td>${d.rework}</td><td>${d.rejected}</td><td>${d.scrapKg.toFixed(2)}</td><td>${d.count}</td></tr>`).join('');
    }

    return `
      <html><head><style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; color: #183f3c; }
        .header { text-align: center; margin-bottom: 25px; border-bottom: 4px solid #00877f; padding-bottom: 15px; }
        .client { font-size: 26px; font-weight: 900; color: #00877f; margin: 0; text-transform: uppercase; }
        .title { font-size: 16px; color: #5b7773; margin-top: 5px; font-weight: 600; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; border: 1px solid #d7e6e4; }
        th, td { border: 1px solid #c8dbd8; padding: 8px 10px; text-align: left; font-size: 11px; }
        th { background-color: #f7fbfa; font-weight: 900; color: #083d3a; text-transform: uppercase; }
        tr:nth-child(even) { background-color: #edf5f4; }
        .footer { margin-top: 40px; font-size: 10px; color: #7a9692; text-align: center; font-style: italic; }
      </style></head><body>
        <div class="header">
          <h1 class="client">${tenantName}</h1>
          <div class="title">${title}</div>
          <div style="font-size: 10px; color: #7a9692; margin-top: 6px;">Report Date: ${dateStr}</div>
        </div>
        <table><thead>${headers}</thead><tbody>${rows}</tbody></table>
        <div class="footer">Manufacturing & Inventory Management System Powered by Wimera</div>
      </body></html>`;
  };

  const validateDateRange = () => {
    if (dateFrom && dateTo && dateFrom > dateTo) {
      showToast({ message: 'From Date cannot be greater than To Date.', type: 'warning' });
      return false;
    }
    return true;
  };

  const handleExportExcel = () => {
    if (Platform.OS !== 'web') { Alert.alert('Web Only'); return; }
    if (!validateDateRange()) return;

    if (activeTab === 'machine') {
      showToast({ message: 'Machine Analytics tab does not support Excel export.', type: 'info' });
      return;
    }

    let headers: string[] = [];
    let dataRows: any[][] = [];

    if (activeTab === 'history') {
      headers = ['Date', 'WO #', 'Master ID', 'Batch No', 'Part ID', 'Stage', 'Input', 'Good', 'Good KG', 'Rework', 'Rejected', 'Rejection Reasons', 'Scrap KG', 'Scrap Reasons', 'Vendor', 'Machine(s)', 'PDC User', 'QI User', 'Status'];
      dataRows = filteredInspections.map(i => [
        formatReportDate(i.date), i.woSlug, i.masterId, i.batchNumber || '', i.partId, i.type,
        i.inputQty, i.goodCount, parseFloat(i.goodKg.toFixed(2)),
        i.reworkCount, i.rejectedCount, i.rejectionReasons,
        parseFloat(i.scrapKg.toFixed(2)), i.scrapReasons,
        i.vendorName, i.machines, i.performedBy, i.verifiedBy, i.status,
      ]);
    } else if (activeTab === 'workorder') {
      headers = ['WO #', 'Date', 'Part ID', 'Target', 'Grade', 'Machines', 'Shift', 'Vendor', 'Status'];
      dataRows = filteredWO.map(wo => {
        const m = woMachineMap[wo.id || (wo as any)._id || ''] || [];
        const shiftStr = Array.isArray((wo as any).shifts) ? (wo as any).shifts.join(', ') : (wo as any).shift || '';
        return [
          wo.workOrderId || `WO-${String(wo.id || (wo as any)._id || '').slice(-6).toUpperCase()}`,
          formatReportDate(wo.date || wo.createdAt), wo.partId, wo.targetPartCount, wo.materialGrade,
          m.join(', '), shiftStr, (wo as any).vendorName || '', wo.status,
        ];
      });
    } else if (activeTab === 'shift') {
      headers = ['Shift', 'Produced', 'Good', 'Rework', 'Rejected', 'Scrap KG', 'Log Count'];
      dataRows = shiftSummary.map(s => [s.shift, s.produced, s.good, s.rework, s.rejected, parseFloat(s.scrapKg.toFixed(2)), s.count]);
    } else {
      headers = ['Date', 'Produced', 'Good', 'Good KG', 'Rework', 'Rejected', 'Scrap KG', 'Stage Count'];
      dataRows = dailySummary.map(d => [formatReportDate(d.date), d.produced, d.good, parseFloat(d.goodKg.toFixed(2)), d.rework, d.rejected, parseFloat(d.scrapKg.toFixed(2)), d.count]);
    }

    const tenantName = currentUser?.tenantName || 'GK Manufacturing';
    const reportTitle = `${activeTab.toUpperCase()} Report`;
    const dateStr = fmtDateTime(new Date());
    const colCount = headers.length;

    // Shared cell styles as inline CSS strings
    const S = {
      title:  'background-color:#1E3A5F;color:#FFFFFF;font-weight:bold;font-size:15pt;text-align:center;padding:10px 14px;font-family:Calibri,Arial,sans-serif;',
      report: 'background-color:#2563EB;color:#FFFFFF;font-weight:bold;font-size:12pt;text-align:center;padding:7px 14px;font-family:Calibri,Arial,sans-serif;',
      date:   'background-color:#DBEAFE;color:#1E40AF;font-size:10pt;text-align:center;padding:5px 14px;font-family:Calibri,Arial,sans-serif;',
      th:     'background-color:#1E3A5F;color:#FFFFFF;font-weight:bold;font-size:11pt;text-align:center;padding:8px 10px;border:1px solid #0F2040;font-family:Calibri,Arial,sans-serif;white-space:nowrap;',
      tdEven: 'background-color:#FFFFFF;color:#1E293B;font-size:10pt;padding:6px 10px;border:1px solid #BFDBFE;font-family:Calibri,Arial,sans-serif;',
      tdOdd:  'background-color:#EFF6FF;color:#1E293B;font-size:10pt;padding:6px 10px;border:1px solid #BFDBFE;font-family:Calibri,Arial,sans-serif;',
    };

    const escape = (v: any) => String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

    const headerRow = headers.map(h => `<th style="${S.th}">${escape(h)}</th>`).join('');
    const bodyRows  = dataRows.map((row, ri) => {
      const td = ri % 2 === 0 ? S.tdEven : S.tdOdd;
      return `<tr>${row.map(v => `<td style="${td}">${escape(v)}</td>`).join('')}</tr>`;
    }).join('');

    // Excel-flavoured HTML — Microsoft Office XML namespaces make Excel treat
    // this as a native workbook and honour all inline CSS (colors, borders, fonts).
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:x="urn:schemas-microsoft-com:office:excel"
  xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta http-equiv="content-type" content="text/html; charset=UTF-8">
  <!--[if gte mso 9]><xml>
    <x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>
      <x:Name>${escape(reportTitle)}</x:Name>
      <x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
    </x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook>
  </xml><![endif]-->
</head>
<body>
<table border="0" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
  <tr><td colspan="${colCount}" style="${S.title}">${escape(tenantName)}</td></tr>
  <tr><td colspan="${colCount}" style="${S.report}">${escape(reportTitle)}</td></tr>
  <tr><td colspan="${colCount}" style="${S.date}">Report Date: ${escape(dateStr)}</td></tr>
  <tr><td colspan="${colCount}" style="padding:4px;"></td></tr>
  <tr>${headerRow}</tr>
  ${bodyRows}
</table>
</body></html>`;

    const blob = new Blob(['﻿' + html], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href  = url;
    link.download = `${tenantName}_${activeTab}_Report_${new Date().toISOString().split('T')[0]}.xls`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handlePrintPDF = () => {
    if (Platform.OS !== 'web') { Alert.alert('Web Only'); return; }
    if (!validateDateRange()) return;
    const html = getStyledTableHTML(`${activeTab.toUpperCase()} Report`);
    const win = window.open('', '_blank');
    if (win) {
      win.document.write(html);
      win.document.close();
      win.focus();
      setTimeout(() => { win.print(); win.close(); }, 500);
    }
  };

  // ── UI Columns for Detailed History ──────────────────────────────────
  // ── UI Columns for Detailed History ──────────────────────────────────
  const historyColumns: Column<any>[] = [
    { key: 'date', header: 'Date', width: 95, render: (i) => <Text>{formatReportDate(i.date)}</Text> },
    { key: 'woSlug', header: 'WO #', width: 90, render: (i) => <Text style={styles.woId}>{i.woSlug}</Text> },
    { key: 'masterId', header: 'Master ID', width: 110 },
    { key: 'batchNumber', header: 'Batch No', width: 110, render: (i) => <Text style={{ fontSize: 13, fontWeight: '700', color: '#059669' }}>{i.batchNumber || '—'}</Text> },
    { key: 'partId', header: 'Part ID', width: 100 },
    { key: 'status', header: 'Status', width: 110, render: (i) => <StatusBadge variant={i.status} /> },
    { key: 'type', header: 'Stage', width: 100 },
    { key: 'inputQty', header: 'Input', width: 70, align: 'right' },
    { key: 'goodCount', header: 'Good ✓', width: 75, align: 'right', render: (i) => <Text style={{ fontWeight: '700', color: '#16a34a' }}>{i.goodCount}</Text> },
    { key: 'goodKg', header: 'Good KG', width: 80, align: 'right' },
    { key: 'reworkCount', header: 'Rework', width: 75, align: 'right' },
    { key: 'rejectedCount', header: 'Rejected', width: 80, align: 'right', render: (i) => <Text style={{ fontWeight: '700', color: '#dc2626' }}>{i.rejectedCount}</Text> },
    { key: 'scrapKg', header: 'Scrap KG', width: 85, align: 'right' },
    { key: 'machines', header: 'Machine(s)', minWidth: 120 },
    { key: 'vendorName', header: 'Vendor', width: 100 },
    { key: 'performedBy', header: 'PDC User', width: 100 },
    { key: 'verifiedBy', header: 'QI User', width: 100 },
  ];

  const woSummaryColumns: Column<WorkOrder>[] = [
    { key: 'id', header: 'WO #', width: 95, render: (wo) => <Text style={styles.woId}>{wo.workOrderId || `WO-${String(wo.id || (wo as any)._id || '').slice(-6).toUpperCase()}`}</Text> },
    { key: 'type', header: 'Type', width: 80, render: (wo) => <Text style={{ fontSize: 10, fontWeight: '800', color: (wo as any).type === 'MAIN' ? '#006b65' : '#6b21a8' }}>{(wo as any).type || 'MAIN'}</Text> },
    { key: 'status', header: 'Status', width: 130, render: (wo) => <StatusBadge variant={wo.status} /> },
    { key: 'date', header: 'Date', width: 100, render: (wo) => <Text>{formatReportDate(wo.date || wo.createdAt)}</Text> },
    { key: 'partId', header: 'Part ID', minWidth: 120 },
    { key: 'targetPartCount', header: 'Target', width: 90, render: (wo) => <Text style={styles.numCell}>{wo.targetPartCount}</Text> },
    {
      key: 'machineId', header: 'Machine(s)', minWidth: 150,
      render: (wo) => {
        const m = woMachineMap[wo.id || (wo as any)._id || ''] || [];
        return (
          <View>
            <Text style={{ fontSize: 11, color: '#1e3a8a', fontWeight: '700' }}>{m.length > 1 ? `${m.length} Machines` : m[0] || '—'}</Text>
            {m.length > 1 && <Text style={{ fontSize: 9, color: '#5b7773' }}>{m.join(', ')}</Text>}
          </View>
        );
      }
    },
  ];

  const renderMachineAnalytics = () => {
    return (
      <View style={styles.analyticsWrapper}>
        {/* State of the Art: Volume Hub */}
        <View style={styles.premiumCard}>
          <View style={styles.cardHeaderGlow}>
            <Text style={styles.premiumTitle}>Production Velocity Hub ⚡</Text>
            <View style={styles.liveBadge}><View style={styles.liveDot} /><Text style={styles.liveText}>DYNAMIC ANALYSIS</Text></View>
          </View>
          <Text style={styles.premiumSubtitle}>Real-time throughput analysis across {machineSummary.length} industrial units</Text>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalGlowChart}>
            <View style={styles.glowBarChart}>
              {machineSummary.map((m, idx) => {
                const maxProd = Math.max(...machineSummary.map(x => x.totalProduced)) || 1;
                const barHeight = (m.totalProduced / maxProd) * 140;
                return (
                  <View key={m.machineId} style={styles.glowBarColumn}>
                    <View style={[styles.glowBar, { height: Math.max(20, barHeight), backgroundColor: idx === 0 ? '#00877f' : '#7a9692' }]}>
                      <View style={styles.barGlowTop} />
                      <Text style={styles.glowBarValue}>{m.totalProduced}</Text>
                    </View>
                    <Text style={styles.glowBarLabel}>{m.name || m.machineId}</Text>
                  </View>
                );
              })}
            </View>
          </ScrollView>
        </View>

        {/* Machine Intelligence Feed */}
        <View style={styles.feedHeader}>
          <Text style={styles.feedTitle}>Machine Performance Intelligence</Text>
          <Text style={styles.feedSubtitle}>Shift-wise utilization & OEE metrics</Text>
        </View>

        {machineSummary.map(m => {
          const oeeColor = parseInt(m.oee) > 85 ? '#10b981' : parseInt(m.oee) > 70 ? '#00877f' : '#f59e0b';
          return (
            <View key={m.machineId} style={styles.glassCard}>
              <View style={styles.glassHeader}>
                <View style={styles.machineMainInfo}>
                  <Text style={styles.glassMachineName}>{m.name || m.machineId}</Text>
                  <Text style={styles.glassMachineType}>{m.type} UNIT</Text>
                </View>
                <View style={[styles.oeeBadge, { backgroundColor: oeeColor + '15', borderColor: oeeColor }]}>
                  <Text style={[styles.oeeLabel, { color: oeeColor }]}>OEE SCORE</Text>
                  <Text style={[styles.oeeValue, { color: oeeColor }]}>{m.oee}%</Text>
                </View>
              </View>

              <View style={styles.dualShiftPills}>
                {/* Day Pill */}
                <View style={styles.pillContainer}>
                  <View style={styles.pillHeader}>
                    <Text style={styles.pillShiftName}>☀️ DAY SHIFT</Text>
                    <Text style={styles.pillShiftTime}>08:00-20:00</Text>
                  </View>
                  <View style={styles.pillBar}>
                    <View style={[styles.pillSegmentRun, { flex: m.day.runPercent }]} />
                    <View style={[styles.pillSegmentIdle, { flex: m.day.idlePercent }]} />
                  </View>
                  <View style={styles.pillFooter}>
                    <Text style={styles.pillStat}><Text style={{ color: '#10b981' }}>RUN:</Text> {m.day.runH}h {m.day.runM}m</Text>
                    <Text style={styles.pillStat}><Text style={{ color: '#f59e0b' }}>IDLE:</Text> {m.day.idleH}h {m.day.idleM}m</Text>
                  </View>
                </View>

                {/* Night Pill */}
                <View style={[styles.pillContainer, { marginLeft: 15 }]}>
                  <View style={styles.pillHeader}>
                    <Text style={styles.pillShiftName}>🌙 NIGHT SHIFT</Text>
                    <Text style={styles.pillShiftTime}>20:00-08:00</Text>
                  </View>
                  <View style={styles.pillBar}>
                    <View style={[styles.pillSegmentRun, { flex: m.night.runPercent }]} />
                    <View style={[styles.pillSegmentIdle, { flex: m.night.idlePercent }]} />
                  </View>
                  <View style={styles.pillFooter}>
                    <Text style={styles.pillStat}><Text style={{ color: '#10b981' }}>RUN:</Text> {m.night.runH}h {m.night.runM}m</Text>
                    <Text style={styles.pillStat}><Text style={{ color: '#f59e0b' }}>IDLE:</Text> {m.night.idleH}h {m.night.idleM}m</Text>
                  </View>
                </View>
              </View>

              <View style={styles.cardFooterStats}>
                <Text style={styles.footerInfo}>🎯 Quality Rate: <Text style={{ color: '#083d3a' }}>{m.efficiency}%</Text></Text>
                <Text style={styles.footerInfo}>📦 Throughput: <Text style={{ color: '#083d3a' }}>{m.totalProduced} Units</Text></Text>
              </View>
            </View>
          );
        })}
      </View>
    );
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ padding: 16 }}>
      <View style={styles.maxWidth}>
        <View style={styles.headerArea}>
          <PageHeader title="Production Reports" subtitle="Detailed history tracking with PDF & Excel" />
          <View style={styles.btnRow}>
            <TouchableOpacity style={styles.exportBtn} onPress={handleExportExcel}><Text style={styles.exportBtnText}>📊 Excel</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.exportBtn, { backgroundColor: '#fee2e2' }]} onPress={handlePrintPDF}><Text style={[styles.exportBtnText, { color: '#b91c1c' }]}>📄 PDF</Text></TouchableOpacity>
          </View>
        </View>

        <View style={styles.filterCard}>
          <Text style={styles.filterTitle}>📅 Date Filtering (Calendar)</Text>
          <View style={styles.dateGrid}>
            <View style={{ flex: 1 }}><DatePicker value={dateFrom} onChange={setDateFrom} placeholder="From" /></View>
            <View style={{ flex: 1 }}><DatePicker value={dateTo} onChange={setDateTo} placeholder="To" /></View>
            <TouchableOpacity onPress={() => { setDateFrom(''); setDateTo(''); }} style={styles.clearBtn}><Text style={{ color: '#dc2626', fontWeight: '700' }}>✕ Clear</Text></TouchableOpacity>
          </View>
        </View>

        <View style={styles.kpiGrid}>
          {[
            { label: 'Total Produced', value: totalProduced, color: '#183f3c', bg: '#edf5f4', icon: '🏭' },
            { label: 'Good Parts', value: totalGood, color: '#16a34a', bg: '#dcfce7', icon: '✅' },
            { label: 'Yield Rate', value: `${yieldRate}%`, color: '#00877f', bg: '#e8f8f6', icon: '📈' },
            { label: 'Total Scrap', value: `${totalScrapKg.toFixed(1)} kg`, color: '#7c3aed', bg: '#f5f3ff', icon: '♻️' },
          ].map(k => (
            <View key={k.label} style={[styles.kpiBox, { backgroundColor: k.bg }]}>
              <Text style={{ fontSize: 20 }}>{k.icon}</Text>
              <Text style={[styles.kpiValue, { color: k.color }]}>{k.value}</Text>
              <Text style={[styles.kpiLabel, { color: k.color }]}>{k.label}</Text>
            </View>
          ))}
        </View>

        <View style={styles.tabBar}>
          {([
            { id: 'history', label: 'Detailed History' },
            { id: 'workorder', label: 'WO Summary' },
            { id: 'shift', label: 'Shift Report' },
            { id: 'daily', label: 'Daily Report' },
            { id: 'machine', label: 'Machine Analytics 🤖' }
          ] as { id: ReportTab; label: string }[]).map(t => (
            <TouchableOpacity key={t.id} style={[styles.tab, activeTab === t.id && styles.tabActive]} onPress={() => setActiveTab(t.id)}>
              <Text style={[styles.tabText, activeTab === t.id && styles.tabTextActive]}>{t.label.toUpperCase()}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {activeTab === 'history' && (
          <DataTable data={filteredInspections} columns={historyColumns} keyExtractor={i => i.id || ''} />
        )}
        {activeTab === 'workorder' && (
          <DataTable data={filteredWO} columns={woSummaryColumns} keyExtractor={w => w.id || (w as any)._id} />
        )}
        {activeTab === 'shift' && (
          <DataTable data={shiftSummary} columns={[
            { key: 'shift', header: 'Shift', minWidth: 150 },
            { key: 'produced', header: 'Produced', align: 'right' },
            { key: 'good', header: 'Good ✓', align: 'right', render: (s) => <Text style={{ color: '#16a34a', fontWeight: '700' }}>{s.good}</Text> },
            { key: 'scrapKg', header: 'Scrap KG', align: 'right' },
            { key: 'count', header: 'Log Count', align: 'right' }
          ]} keyExtractor={s => s.shift} />
        )}
        {activeTab === 'daily' && (
          <DataTable data={dailySummary} columns={[
            { key: 'date', header: 'Date', width: 120, render: (d) => <Text>{formatReportDate(d.date)}</Text> },
            { key: 'produced', header: 'Produced', align: 'right' },
            { key: 'good', header: 'Good ✓', align: 'right' },
            { key: 'goodKg', header: 'Good KG', align: 'right' },
            { key: 'scrapKg', header: 'Scrap KG', align: 'right' }
          ]} keyExtractor={d => d.date} />
        )}
        {activeTab === 'machine' && machineSummary.length > 0 && renderMachineAnalytics()}
      </View>
    </ScrollView>
  );

}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#edf5f4' },
  maxWidth: { width: '100%', alignSelf: 'center' },
  headerArea: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', marginBottom: 20 },
  btnRow: { flexDirection: 'row', gap: 10, alignSelf: 'center', marginTop: -15 },
  filterCard: { backgroundColor: '#ffffff', borderRadius: 12, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: '#d7e6e4', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 10 },
  filterTitle: { fontSize: 13, fontWeight: '900', color: '#183f3c', marginBottom: 12 },
  dateGrid: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  clearBtn: { paddingVertical: 10, paddingHorizontal: 15, borderRadius: 10, backgroundColor: '#fee2e2' },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 12 },
  kpiBox: { flex: 1, minWidth: 110, borderRadius: 16, padding: 20, alignItems: 'center', margin: 4, borderWidth: 1, borderColor: '#d7e6e4' },
  kpiValue: { fontSize: 24, fontWeight: '900', marginTop: 8 },
  kpiLabel: { fontSize: 10, fontWeight: '800', marginTop: 4, textTransform: 'uppercase' },
  tabBar: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 12, padding: 4, borderWidth: 1, borderColor: '#d7e6e4', marginBottom: 16 },
  tab: { flex: 1, paddingVertical: 12, borderRadius: 9, alignItems: 'center' },
  tabActive: { backgroundColor: '#00877f' },
  tabText: { fontSize: 11, fontWeight: '900', color: '#5b7773' },
  tabTextActive: { color: '#ffffff' },
  woId: { fontSize: 13, fontWeight: '900', color: '#00877f', fontFamily: 'monospace' },
  numCell: { fontSize: 13, fontWeight: '800', color: '#183f3c' },
  exportBtn: { backgroundColor: '#d9f3f0', paddingHorizontal: 18, paddingVertical: 11, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)' },
  exportBtnText: { fontSize: 13, fontWeight: '700', color: '#00877f' },
  legendText: { fontSize: 10, color: '#5b7773', fontWeight: '600' },
  // STUNNING PREMIUM STYLES
  analyticsWrapper: { marginTop: 10, paddingBottom: 60 },
  premiumCard: { backgroundColor: '#ffffff', borderRadius: 32, padding: 24, marginBottom: 24, borderWidth: 1, borderColor: '#d7e6e4', shadowColor: '#00877f', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.1, shadowRadius: 20, elevation: 15 },
  cardHeaderGlow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  premiumTitle: { fontSize: 22, fontWeight: '900', color: '#083d3a', letterSpacing: -0.5 },
  premiumSubtitle: { fontSize: 13, color: '#5b7773', marginBottom: 24, fontWeight: '500' },
  liveBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f0f9ff', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#00877f', marginRight: 6 },
  liveText: { fontSize: 9, fontWeight: '900', color: '#006b65' },
  horizontalGlowChart: { marginTop: 10 },
  glowBarChart: { flexDirection: 'row', alignItems: 'flex-end', gap: 24, paddingRight: 40, paddingBottom: 10 },
  glowBarColumn: { alignItems: 'center', width: 60 },
  glowBar: { width: 34, borderRadius: 12, justifyContent: 'flex-end', alignItems: 'center', shadowColor: '#00877f', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 },
  barGlowTop: { width: '80%', height: 4, backgroundColor: 'rgba(255,255,255,0.4)', borderRadius: 2, marginTop: 4, position: 'absolute', top: 0 },
  glowBarValue: { color: '#fff', fontSize: 11, fontWeight: '900', marginBottom: 10 },
  glowBarLabel: { fontSize: 10, fontWeight: '800', color: '#5b7773', marginTop: 12, textAlign: 'center' },
  feedHeader: { marginVertical: 20, paddingHorizontal: 8 },
  feedTitle: { fontSize: 20, fontWeight: '900', color: '#183f3c' },
  feedSubtitle: { fontSize: 12, color: '#7a9692', marginTop: 4 },
  glassCard: { backgroundColor: '#fff', borderRadius: 28, padding: 24, marginBottom: 20, borderWidth: 1, borderColor: '#edf5f4', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.04, shadowRadius: 15, elevation: 5 },
  glassHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  machineMainInfo: { flex: 1 },
  glassMachineName: { fontSize: 20, fontWeight: '900', color: '#083d3a' },
  glassMachineType: { fontSize: 10, fontWeight: '800', color: '#7a9692', marginTop: 4, letterSpacing: 1 },
  oeeBadge: { borderRadius: 14, padding: 8, alignItems: 'center', borderWidth: 1.5 },
  oeeLabel: { fontSize: 8, fontWeight: '900' },
  oeeValue: { fontSize: 18, fontWeight: '900' },
  dualShiftPills: { flexDirection: 'row', marginBottom: 20 },
  pillContainer: { flex: 1 },
  pillHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  pillShiftName: { fontSize: 10, fontWeight: '900', color: '#486966' },
  pillShiftTime: { fontSize: 9, color: '#7a9692', fontWeight: '600' },
  pillBar: { height: 14, backgroundColor: '#edf5f4', borderRadius: 99, flexDirection: 'row', overflow: 'hidden' },
  pillSegmentRun: { height: '100%', backgroundColor: '#10b981' },
  pillSegmentIdle: { height: '100%', backgroundColor: '#f59e0b', opacity: 0.2 },
  pillFooter: { flexDirection: 'row', gap: 15, marginTop: 8 },
  pillStat: { fontSize: 11, fontWeight: '800', color: '#5b7773' },
  cardFooterStats: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#edf5f4', paddingTop: 16, marginTop: 10, gap: 25 },
  footerInfo: { fontSize: 12, fontWeight: '700', color: '#5b7773' },
  // IoT Analytics Specific Styles
  emptyState: { height: 100, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f7fbfa', borderRadius: 16, marginTop: 10, borderStyle: 'dashed', borderWidth: 1, borderColor: '#c8dbd8' },
  emptyText: { color: '#7a9692', fontSize: 12, fontWeight: '600' },
  dropdownList: { position: 'absolute', top: 60, left: 0, right: 0, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#d7e6e4', zIndex: 1000, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.1, shadowRadius: 15, elevation: 20 },
  dropdownItem: { padding: 15, borderBottomWidth: 1, borderBottomColor: '#edf5f4' },
  dropdownItemActive: { backgroundColor: '#e8f8f6' },
  dropdownItemText: { fontSize: 13, color: '#486966' },
  dropdownItemTextActive: { color: '#00877f', fontWeight: '800' },
});
