import React, { useEffect, useMemo, useState } from 'react';
import {
  Dimensions,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import { DataStorage, fmtDate } from '../utils/storage';
import { DatePicker, StatusBadge } from '../components';

const { width } = Dimensions.get('window');
const isWeb = Platform.OS === 'web';

type QueryFilters = {
  date?: string;
  shift?: string;
  workorder?: string;
  suborder?: string;
  machineId?: string;
};

const toDateOnly = (date?: string | number | Date) => {
  if (!date) return '';
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return String(date).slice(0, 10);
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const today = () => toDateOnly(new Date());

const readQueryFilters = (): QueryFilters => {
  if (!isWeb || typeof window === 'undefined') return {};
  const params = new URLSearchParams(window.location.search);
  return {
    date: params.get('date') || params.get('queryDate') || undefined,
    shift: params.get('shift') || params.get('shiftId') || undefined,
    workorder: params.get('workorder') || params.get('workOrder') || params.get('workOrderId') || undefined,
    suborder: params.get('suborder') || params.get('subOrder') || params.get('subOrderId') || undefined,
    machineId: params.get('machineId') || params.get('gatewayId') || undefined,
  };
};

const getWorkOrderKey = (wo: any) => String(wo?.workOrderId || wo?.id || wo?._id || '');

const getWorkOrderLabel = (wo: any) => {
  const id = getWorkOrderKey(wo);
  if (!id) return 'No Work Order';
  return wo?.workOrderId || `WO-${id.slice(-6).toUpperCase()}`;
};

const getSubOrders = (wo: any) => {
  if (!wo) return [];
  const raw = wo.subOrders || wo.suborders || wo.childWorkOrders || wo.children || [];
  return Array.isArray(raw) ? raw : [];
};

const getMachineAssignment = (wo: any, machineId?: string) => {
  const assignments = Array.isArray(wo?.machineAssignments) ? wo.machineAssignments : [];
  if (!assignments.length) return null;
  if (!machineId) return assignments[0];
  return assignments.find((item: any) => String(item?.machineId) === String(machineId)) || assignments[0];
};

const getWorkOrderDetail = (wo: any, machineId: string | undefined, keys: string[], fallback = '-') => {
  const assignment = getMachineAssignment(wo, machineId);
  const sources = [assignment, wo];
  for (const source of sources) {
    for (const key of keys) {
      const value = source?.[key];
      if (value !== undefined && value !== null && value !== '') return value;
    }
  }
  return fallback;
};

const getWorkOrderShift = (wo: any, machineId?: string) => {
  const assignmentShift = getWorkOrderDetail(wo, machineId, ['shift', 'shiftId', 'shiftIdN'], '');
  if (assignmentShift) return String(assignmentShift);
  const shifts = wo?.shifts;
  if (Array.isArray(shifts) && shifts.length) return shifts.join(', ');
  return '-';
};

const getWorkOrderMetaText = (wo: any, machineId?: string) => {
  const process = getWorkOrderDetail(wo, machineId, ['process'], '');
  const status = getWorkOrderDetail(wo, machineId, ['status', 'Status', 'stageStatus'], '');
  const target = getWorkOrderDetail(wo, machineId, ['targetPartCount', 'targetQuantity', 'target'], '');
  const shift = getWorkOrderShift(wo, machineId);
  return [
    process && `Process: ${process}`,
    status && `Status: ${status}`,
    target && `Target: ${target}`,
    shift !== '-' && `Shift: ${shift}`,
  ].filter(Boolean).join(' | ') || 'Production order';
};

const getPinPartCounts = (row: any) => {
  if (!row) return [];
  return Object.keys(row)
    .map((key) => {
      const match = key.match(/^partCountPin(\d+)$/i);
      if (!match) return null;
      return {
        pin: Number(match[1]),
        label: `Pin ${match[1]}`,
        count: Number(row[key] || 0),
      };
    })
    .filter((item): item is { pin: number; label: string; count: number } => Boolean(item))
    .sort((a, b) => a.pin - b.pin);
};

const getStatusDurationSeconds = (items: any[], names: string[]) => {
  const allowed = new Set(names.map((name) => name.toLowerCase()));
  return items.reduce((sum, item: any) => {
    const name = String(item?.status_name || item?.name || item?.status || '').toLowerCase();
    if (!allowed.has(name)) return sum;
    return sum + Number(item?.duration || 0);
  }, 0);
};

const getOverlapSeconds = (startA: Date, endA: Date, startB: Date, endB: Date) => {
  const start = Math.max(startA.getTime(), startB.getTime());
  const end = Math.min(endA.getTime(), endB.getTime());
  return Math.max((end - start) / 1000, 0);
};

const getShiftBreakSeconds = (shiftList: any[], date: string, windowStart: Date, windowEnd: Date) => {
  return shiftList.reduce((total, shift: any) => {
    const breaks = Array.isArray(shift?.breaks) ? shift.breaks : [];
    return total + breaks.reduce((breakTotal: number, item: any) => {
      const startTime = item?.breakStartTime || item?.startTime;
      const endTime = item?.breakEndTime || item?.endTime;
      if (!startTime || !endTime) return breakTotal;
      const breakStart = buildDateTime(date, startTime);
      let breakEnd = buildDateTime(date, endTime);
      if (breakEnd <= breakStart) breakEnd.setDate(breakEnd.getDate() + 1);
      if (breakStart < windowStart && shift?.endNextDay) {
        breakStart.setDate(breakStart.getDate() + 1);
        breakEnd.setDate(breakEnd.getDate() + 1);
      }
      return breakTotal + getOverlapSeconds(breakStart, breakEnd, windowStart, windowEnd);
    }, 0);
  }, 0);
};

const parseClock = (time?: string) => {
  const [h, m] = String(time || '00:00').split(':').map(Number);
  return { h: Number.isFinite(h) ? h : 0, m: Number.isFinite(m) ? m : 0 };
};

const buildDateTime = (date: string, time: string, addDay = false) => {
  const { h, m } = parseClock(time);
  const d = new Date(`${date}T00:00:00`);
  d.setHours(h, m, 0, 0);
  if (addDay) d.setDate(d.getDate() + 1);
  return d;
};

const formatTime = (date: Date) => {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
};

const statusColor = (status?: string, future?: boolean) => {
  if (future) return '#bfbfbf';
  const normalized = String(status || '').toLowerCase();
  if (normalized.includes('running')) return '#71965f';
  if (normalized.includes('idle')) return '#d6a94c';
  if (normalized.includes('off')) return '#b0b0b0';
  if (normalized.includes('standby')) return '#f54c4c';
  if (normalized.includes('disconnect')) return '#b0b0b0';
  if (normalized.includes('no data')) return '#bfbfbf';
  if (normalized.includes('planned')) return '#bfbfbf';
  if (normalized.includes('breakdown')) return '#eb5857';
  return '#d75c5c';
};

const ganttSegmentColor = (segment: any) =>
  segment?.itemStyle?.normal?.color ||
  segment?.itemStyle?.color ||
  statusColor(segment?.name, segment?.isFuture);

const toTimestamp = (value: any) => {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

const getStatusStartTs = (item: any) => toTimestamp(item?.value?.[1] ?? item?.startTime ?? item?.start ?? item?.packet_id);
const getStatusEndTs = (item: any) => toTimestamp(item?.value?.[2] ?? item?.endTime ?? item?.end);
const getStatusDuration = (item: any, startTs: number, endTs: number) => {
  if (item?.value?.[3]) return item.value[3];
  const seconds = Math.max(Math.round((endTs - startTs) / 1000), 0);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

const formatDurationSeconds = (duration?: number) => {
  const seconds = Math.max(Math.round(Number(duration || 0)), 0);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h) return `${h}h ${m}m ${s}s`;
  if (m) return `${m}m ${s}s`;
  return `${s}s`;
};

const formatCompactCount = (value: number) => {
  const rounded = Math.round(Number(value || 0));
  if (Math.abs(rounded) < 1000) return String(rounded);
  const compact = rounded / 1000;
  return `${Number.isInteger(compact) ? compact.toFixed(0) : compact.toFixed(1)}k`;
};

const normalizePercent = (value: any) => {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) return 0;
  return Math.abs(numeric) <= 1 ? numeric * 100 : numeric;
};

const sampleShifts = [
  { _id: 'sample-shift-a', id: 'sample-shift-a', shiftId: 'A', name: 'Shift-A', startTime: '06:00', endTime: '14:30' },
  { _id: 'sample-shift-b', id: 'sample-shift-b', shiftId: 'B', name: 'Shift-B', startTime: '14:30', endTime: '22:30' },
  { _id: 'sample-shift-c', id: 'sample-shift-c', shiftId: 'C', name: 'Shift-C', startTime: '22:30', endTime: '06:00', endNextDay: true },
];

const createSampleMachine = (date: string) => {
  const sampleWorkOrder = {
    id: 'sample-wo-001',
    workOrderId: 'WO-SAMPLE-001',
    partId: 'Demo Component',
    status: 'IN_PROGRESS',
    target: 32,
    targetPartCount: 32,
    startDate: `${date}T06:00:00`,
    endDate: `${date}T23:59:59`,
    shifts: sampleShifts.map((shift) => shift._id),
    subOrders: [
      {
        id: 'sample-sub-001',
        workOrderId: 'SUB-SAMPLE-001',
        partId: 'Demo Component / OP10',
        status: 'IN_PROGRESS',
        target: 18,
        targetPartCount: 18,
        startDate: `${date}T06:00:00`,
        endDate: `${date}T14:30:00`,
        shifts: ['sample-shift-a'],
      },
    ],
  };

  return {
    id: 'sample-machine-001',
    _id: 'sample-machine-001',
    name: 'Sample Machine',
    machineId: 'SAMPLE-MC-01',
    status: 'PROCESSING',
    producedCount: 25,
    currentWorkOrder: sampleWorkOrder,
    workOrders: [sampleWorkOrder],
    isSample: true,
  };
};

const createSampleHourData = (slots: Array<{ date: string; hour: number }>) => {
  const counts = [8, 3, 0, 2, 0, 0, 4, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  return slots.map((slot, index) => ({
    sourceDate: slot.date,
    hourNumber: slot.hour,
    partProduced: counts[index] ?? 0,
    oEE: counts[index] ? 93.75 : 0,
    isSample: true,
  }));
};

const createSampleStatusData = (start: Date, end: Date) => {
  const totalMs = Math.max(end.getTime() - start.getTime(), 1);
  const minutes = (fraction: number) => new Date(start.getTime() + totalMs * fraction).getTime();
  return [
    { packet_id: start.getTime(), name: 'Running', partCnt: 2, isSample: true },
    { packet_id: minutes(0.04), name: 'Running', partCnt: 3, isSample: true },
    { packet_id: minutes(0.075), name: 'Idle', partCnt: 0, isSample: true },
    { packet_id: minutes(0.083), name: 'Running', partCnt: 2, isSample: true },
    { packet_id: minutes(0.12), name: 'Running', partCnt: 1, isSample: true },
    { packet_id: minutes(0.145), name: 'BreakDown', partCnt: 0, isSample: true },
    { packet_id: minutes(0.16), name: 'Running', partCnt: 3, isSample: true },
    { packet_id: minutes(0.205), name: 'Running', partCnt: 4, isSample: true },
    { packet_id: minutes(0.255), name: 'Idle', partCnt: 0, isSample: true },
    { packet_id: minutes(0.275), name: 'Running', partCnt: 5, isSample: true },
    { packet_id: minutes(0.345), name: 'Running', partCnt: 3, isSample: true },
  ];
};

export function MachineAnalyticsScreen({ route }: any) {
  const isFocused = useIsFocused();
  const queryFilters = useMemo(
    () => ({ ...readQueryFilters(), ...(route?.params || {}) }),
    [route?.params]
  );

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [machines, setMachines] = useState<any[]>([]);
  const [shifts, setShifts] = useState<any[]>([]);
  const [selectedMachine, setSelectedMachine] = useState<any>(null);
  const [selectedWorkOrder, setSelectedWorkOrder] = useState<any>(null);
  const [selectedSubOrder, setSelectedSubOrder] = useState<any>(null);
  const [analyticsDate, setAnalyticsDate] = useState(queryFilters.date || today());
  const [hourData, setHourData] = useState<any[]>([]);
  const [statusData, setStatusData] = useState<any[]>([]);
  const [statusChartData, setStatusChartData] = useState<any[]>([]);
  const [partCountSummary, setPartCountSummary] = useState<any>(null);
  const [loadingIot, setLoadingIot] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showMachineMenu, setShowMachineMenu] = useState(false);
  const [showWorkOrderMenu, setShowWorkOrderMenu] = useState(false);
  const [hoveredHour, setHoveredHour] = useState<any>(null);
  const [hoveredOeeHour, setHoveredOeeHour] = useState<any>(null);
  const [hoveredStatus, setHoveredStatus] = useState<any>(null);
  const [ganttRange, setGanttRange] = useState<{ startPct: number; endPct: number } | null>(null);
  const [selectionDraft, setSelectionDraft] = useState<{ startPct: number; currentPct: number } | null>(null);
  const [timelineTrackWidth, setTimelineTrackWidth] = useState(1);
  const [zoomSliderWidth, setZoomSliderWidth] = useState(1);

  const isWide = width > 900;

  const workOrders = selectedMachine?.workOrders || [];
  const subOrders = useMemo(() => getSubOrders(selectedWorkOrder), [selectedWorkOrder]);

  const activeWorkOrder = selectedSubOrder || selectedWorkOrder || selectedMachine?.currentWorkOrder;

  const selectedShiftIds = useMemo(() => {
    const ids = activeWorkOrder?.shifts || activeWorkOrder?.shiftIds || [];
    return Array.isArray(ids) ? ids.map(String) : [String(ids)];
  }, [activeWorkOrder]);

  const workOrderShifts = useMemo(() => {
    if (!shifts.length) return [];
    if (!selectedShiftIds.length || !selectedShiftIds[0]) return shifts;
    const matched = shifts.filter((shift: any) => {
      const ids = [shift._id, shift.id, shift.shiftId, shift.name].filter(Boolean).map(String);
      return selectedShiftIds.some((sid: string) => ids.includes(sid));
    });
    return matched.length ? matched : shifts;
  }, [selectedShiftIds, shifts]);

  const reportWindow = useMemo(() => {
    const shiftList = workOrderShifts;
    const firstShift = shiftList[0] || { startTime: '06:00', endTime: '06:00', name: 'Day' };
    const lastShift = shiftList[shiftList.length - 1] || firstShift;
    const firstStart = parseClock(firstShift.startTime);
    const lastEnd = parseClock(lastShift.endTime);
    const lastStart = parseClock(lastShift.startTime);
    const crossesMidnight =
      Boolean(lastShift.endNextDay) ||
      lastEnd.h * 60 + lastEnd.m <= lastStart.h * 60 + lastStart.m ||
      shiftList.length > 1;

    const start = buildDateTime(analyticsDate, firstShift.startTime || '06:00');
    const end = buildDateTime(analyticsDate, lastShift.endTime || firstShift.startTime || '06:00', crossesMidnight);
    if (end <= start) end.setDate(end.getDate() + 1);

    return { start, end, shifts: shiftList };
  }, [analyticsDate, workOrderShifts]);

  const filteredMachines = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase();
    if (!needle) return machines;
    return machines.filter((machine: any) =>
      String(machine.name || '').toLowerCase().includes(needle) ||
      String(machine.machineId || '').toLowerCase().includes(needle)
    );
  }, [machines, searchQuery]);

  const hourSlots = useMemo(() => {
    const slots: Array<{ date: string; hour: number; label: string }> = [];
    const cursor = new Date(reportWindow.start);
    while (cursor < reportWindow.end && slots.length <= 48) {
      slots.push({
        date: toDateOnly(cursor),
        hour: cursor.getHours(),
        label: `${String(cursor.getHours()).padStart(2, '0')}:00`,
      });
      cursor.setHours(cursor.getHours() + 1);
    }
    return slots;
  }, [reportWindow]);

  const activeAssignment = getMachineAssignment(activeWorkOrder, selectedMachine?.machineId);
  const currentWorkOrderAssignment = getMachineAssignment(selectedMachine?.currentWorkOrder, selectedMachine?.machineId);
  const partsPerCycle = Number(activeAssignment?.partsPerCycle ?? activeWorkOrder?.partsPerCycle ?? 1) || 1;
  const currentWorkOrderPartsPerCycle = Number(
    currentWorkOrderAssignment?.partsPerCycle ??
    selectedMachine?.currentWorkOrder?.partsPerCycle ??
    partsPerCycle
  ) || 1;

  const hourlyChartData = useMemo(() => {
    const nowTs = Date.now();
    return hourSlots.map((slot) => {
      const found = hourData.find((item: any) => {
        const itemDate = item.sourceDate || item.date || toDateOnly(item.packet_id || item.createdAt);
        return Number(item.hourNumber ?? item.hour ?? item.hr) === slot.hour && itemDate === slot.date;
      });
      const slotTime = buildDateTime(slot.date, slot.label);
      const isFuture = slotTime.getTime() > nowTs;
      const isSample = Boolean(found?.isSample);
      const pinCounts = getPinPartCounts(found);
      const pinPartProduced = pinCounts.reduce((sum, item) => sum + item.count, 0);
      const rawPartProduced = pinCounts.length ? pinPartProduced : Number(found?.partProduced ?? found?.partCount ?? found?.count ?? 0);
      const hourlyPartsPerCycle = Number(found?.partsPerCycle ?? found?.PartsPerCycle ?? found?.parts_per_cycle ?? partsPerCycle) || 1;
      return {
        ...slot,
        partProduced: isFuture && !isSample ? 0 : rawPartProduced * hourlyPartsPerCycle,
        rawPartProduced: isFuture && !isSample ? 0 : rawPartProduced,
        partsPerCycle: hourlyPartsPerCycle,
        pinCounts,
        oEE: isFuture && !isSample ? 0 : normalizePercent(found?.oEE ?? found?.oee ?? found?.OEE),
        availability: isFuture && !isSample ? 0 : normalizePercent(found?.availability ?? found?.Availability),
        performance: isFuture && !isSample ? 0 : normalizePercent(found?.performance ?? found?.Performance),
        quality: isFuture && !isSample ? 0 : normalizePercent(found?.quality ?? found?.Quality),
        hasHourData: Boolean(found),
        isFuture: isFuture && !isSample,
        isSample,
      };
    });
  }, [hourData, hourSlots, partsPerCycle]);

  const visibleWindow = useMemo(() => {
    const startTs = reportWindow.start.getTime();
    const endTs = reportWindow.end.getTime();
    const totalMs = Math.max(endTs - startTs, 1);
    if (!ganttRange) return { startTs, endTs };
    return {
      startTs: startTs + totalMs * (ganttRange.startPct / 100),
      endTs: startTs + totalMs * (ganttRange.endPct / 100),
    };
  }, [ganttRange, reportWindow]);

  const timelineTicks = useMemo(() => {
    const labels: string[] = [];
    const totalMs = visibleWindow.endTs - visibleWindow.startTs;
    const count = 4;
    for (let i = 0; i <= count; i += 1) {
      const tick = new Date(visibleWindow.startTs + (totalMs / count) * i);
      labels.push(formatTime(tick));
    }
    return labels;
  }, [visibleWindow]);

  const shiftMarkers = useMemo(() => {
    const totalMs = Math.max(visibleWindow.endTs - visibleWindow.startTs, 1);
    return reportWindow.shifts.slice(1).map((shift: any) => {
      let marker = buildDateTime(analyticsDate, shift.startTime || '00:00');
      if (marker < reportWindow.start) marker = buildDateTime(analyticsDate, shift.startTime || '00:00', true);
      const markerTs = marker.getTime();
      if (markerTs < visibleWindow.startTs || markerTs > visibleWindow.endTs) return null;
      return {
        label: `${shift.name || 'Shift'} - ${shift.startTime}:00`,
        left: `${Math.min(Math.max(((markerTs - visibleWindow.startTs) / totalMs) * 100, 0), 100)}%`,
      };
    }).filter((marker): marker is { label: string; left: string } => Boolean(marker));
  }, [analyticsDate, reportWindow, visibleWindow]);

  const statusSegments = useMemo(() => {
    if (!statusData.length) return [];
    const startTs = reportWindow.start.getTime();
    const endTs = reportWindow.end.getTime();
    const totalMs = Math.max(endTs - startTs, 1);
    const nowTs = Date.now();
    const effectiveEnd = Math.min(endTs, nowTs);
    const packets = statusData
      .map((item: any) => {
        const segmentStartTs = getStatusStartTs(item);
        const rawEndTs = getStatusEndTs(item);
        return {
          ...item,
          segmentStartTs,
          segmentEndTs: rawEndTs || 0,
        };
      })
      .filter((item: any) => item.segmentStartTs && item.segmentStartTs <= endTs && (!item.segmentEndTs || item.segmentEndTs >= startTs))
      .sort((a: any, b: any) => a.segmentStartTs - b.segmentStartTs);

    const segments: any[] = [];
    let cursor = startTs;

    packets.forEach((packet: any, index: number) => {
      const packetTs = Math.max(packet.segmentStartTs, startTs);
      const rawNextTs = packet.segmentEndTs || packets[index + 1]?.segmentStartTs || (packet.isSample ? endTs : effectiveEnd);
      const nextTs = Math.min(rawNextTs, endTs);
      if (packetTs > cursor) {
        segments.push({
          name: 'No Data',
          width: ((packetTs - cursor) / totalMs) * 100,
          isFuture: packetTs > nowTs,
          segmentStartTs: cursor,
          segmentEndTs: packetTs,
          duration: getStatusDuration(null, cursor, packetTs),
        });
      }
      const segmentEnd = Math.max(Math.min(nextTs, effectiveEnd), packetTs);
      if (segmentEnd > packetTs) {
        segments.push({
          ...packet,
          width: ((segmentEnd - packetTs) / totalMs) * 100,
          isFuture: false,
          segmentStartTs: packetTs,
          segmentEndTs: segmentEnd,
          duration: getStatusDuration(packet, packetTs, segmentEnd),
        });
      }
      cursor = Math.max(segmentEnd, packetTs);
    });

    if (cursor < endTs) {
      segments.push({
        name: 'No Data',
        width: ((endTs - cursor) / totalMs) * 100,
        isFuture: cursor > nowTs,
        segmentStartTs: cursor,
        segmentEndTs: endTs,
        duration: getStatusDuration(null, cursor, endTs),
      });
    }

    return segments.filter((segment) => segment.width > 0.05);
  }, [reportWindow, statusData]);

  const visibleStatusSegments = useMemo(() => {
    const totalMs = Math.max(visibleWindow.endTs - visibleWindow.startTs, 1);
    return statusSegments
      .map((segment: any) => {
        const segmentStart = Math.max(segment.segmentStartTs, visibleWindow.startTs);
        const segmentEnd = Math.min(segment.segmentEndTs, visibleWindow.endTs);
        if (segmentEnd <= segmentStart) return null;
        return {
          ...segment,
          width: ((segmentEnd - segmentStart) / totalMs) * 100,
          segmentStartTs: segmentStart,
          segmentEndTs: segmentEnd,
          duration: getStatusDuration(segment.name === 'No Data' ? null : segment, segmentStart, segmentEnd),
        };
      })
      .filter(Boolean);
  }, [statusSegments, visibleWindow]);

  const targetCount = Number(activeWorkOrder?.target ?? activeWorkOrder?.targetPartCount ?? activeWorkOrder?.targetQuantity ?? 0);
  const hourlyTotalProduced = hourlyChartData.reduce((sum, item) => sum + (item.partProduced || 0), 0);
  const displayedHourlyChartData = hourlyChartData.filter((item: any) => item.hasHourData);
  const maxHourlyCount = Math.max(...displayedHourlyChartData.map((item) => item.partProduced || 0), 1);
  const hourlyAxisMax = Math.max(Math.ceil(maxHourlyCount * 1.2), 8);
  const hourlyYAxisTicks = Array.from({ length: 5 }, (_, index) => {
    const value = hourlyAxisMax - (hourlyAxisMax / 4) * index;
    return Math.round(value);
  });
  const hasPartCountSummary = partCountSummary?.partCount !== undefined && partCountSummary?.partCount !== null;
  const totalProduced = hasPartCountSummary ? Number(partCountSummary.partCount || 0) * currentWorkOrderPartsPerCycle : hourlyTotalProduced;
  const oeeMetricDefs = [
    { label: 'OEE', key: 'oEE', color: '#0d9488' },
    { label: 'A', key: 'availability', color: '#00877f' },
    { label: 'P', key: 'performance', color: '#7c3aed' },
    { label: 'Q', key: 'quality', color: '#16a34a' },
  ];
  const lutDateTime = useMemo(() => {
    const latestSegmentEnd = hourData.reduce((latest: number, item: any) => {
      const value = toTimestamp(item?.segmentWindowEnd ?? item?.SegmentWindowEnd);
      return value > latest ? value : latest;
    }, 0);
    return latestSegmentEnd ? new Date(latestSegmentEnd) : reportWindow.start;
  }, [hourData, reportWindow.start]);
  const efficiency = targetCount
    ? Math.min((totalProduced / targetCount) * 100, 100)
    : 0;
  const usingSampleData = Boolean(selectedMachine?.isSample || hourData.some((item: any) => item.isSample) || statusData.some((item: any) => item.isSample));
  const selectionOverlay = selectionDraft
    ? {
      left: `${Math.min(selectionDraft.startPct, selectionDraft.currentPct)}%`,
      width: `${Math.abs(selectionDraft.currentPct - selectionDraft.startPct)}%`,
    }
    : null;
  const activeZoomRange = ganttRange || { startPct: 0, endPct: 100 };
  const zoomWindowStyle = {
    left: `${activeZoomRange.startPct}%`,
    width: `${activeZoomRange.endPct - activeZoomRange.startPct}%`,
  };

  const visiblePctToFullPct = (pct: number) => {
    const base = ganttRange || { startPct: 0, endPct: 100 };
    return base.startPct + ((base.endPct - base.startPct) * pct) / 100;
  };

  const getSelectionPct = (event: any) => {
    const locationX = Number(event?.nativeEvent?.locationX ?? 0);
    return Math.min(Math.max((locationX / Math.max(timelineTrackWidth, 1)) * 100, 0), 100);
  };

  const startGanttSelection = (event: any) => {
    const pct = getSelectionPct(event);
    setHoveredStatus(null);
    setSelectionDraft({ startPct: pct, currentPct: pct });
  };

  const updateGanttSelection = (event: any) => {
    setSelectionDraft((draft) => draft ? { ...draft, currentPct: getSelectionPct(event) } : draft);
  };

  const finishGanttSelection = (event: any) => {
    setSelectionDraft((draft) => {
      if (!draft) return null;
      const currentPct = getSelectionPct(event);
      const startPct = Math.min(visiblePctToFullPct(draft.startPct), visiblePctToFullPct(currentPct));
      const endPct = Math.max(visiblePctToFullPct(draft.startPct), visiblePctToFullPct(currentPct));
      if (endPct - startPct >= 2) {
        setGanttRange({ startPct, endPct });
      }
      return null;
    });
  };

  const getZoomSliderPct = (event: any) => {
    const locationX = Number(event?.nativeEvent?.locationX ?? 0);
    return Math.min(Math.max((locationX / Math.max(zoomSliderWidth, 1)) * 100, 0), 100);
  };

  const startZoomSliderSelection = (event: any) => {
    const pct = getZoomSliderPct(event);
    setSelectionDraft({ startPct: pct, currentPct: pct });
  };

  const updateZoomSliderSelection = (event: any) => {
    setSelectionDraft((draft) => draft ? { ...draft, currentPct: getZoomSliderPct(event) } : draft);
  };

  const finishZoomSliderSelection = (event: any) => {
    setSelectionDraft((draft) => {
      if (!draft) return null;
      const currentPct = getZoomSliderPct(event);
      const startPct = Math.min(draft.startPct, currentPct);
      const endPct = Math.max(draft.startPct, currentPct);
      if (endPct - startPct >= 2) {
        setGanttRange({ startPct, endPct });
      }
      return null;
    });
  };

  useEffect(() => {
    loadShifts();
  }, []);

  useEffect(() => {
    if (!isFocused) return;
    loadData();
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [isFocused, analyticsDate]);

  useEffect(() => {
    if (!machines.length) return;
    const queryMachine = queryFilters.machineId
      ? machines.find((machine: any) => String(machine.machineId) === String(queryFilters.machineId))
      : null;
    setSelectedMachine((current: any) => {
      if (current) return current;
      return queryMachine || machines[0];
    });
  }, [machines, queryFilters.machineId]);

  useEffect(() => {
    if (!selectedMachine) return;
    const history = selectedMachine.workOrders || [];
    const queryWo = queryFilters.workorder
      ? history.find((wo: any) => getWorkOrderKey(wo) === String(queryFilters.workorder))
      : null;
    const active = history.find((wo: any) => wo.status === 'IN_PROGRESS');
    setSelectedWorkOrder(queryWo || active || history[history.length - 1] || selectedMachine.currentWorkOrder || null);
  }, [selectedMachine, queryFilters.workorder]);

  useEffect(() => {
    if (!selectedWorkOrder) {
      setSelectedSubOrder(null);
      return;
    }
    const querySub = queryFilters.suborder
      ? getSubOrders(selectedWorkOrder).find((sub: any) => getWorkOrderKey(sub) === String(queryFilters.suborder))
      : null;
    setSelectedSubOrder(querySub || null);
  }, [selectedWorkOrder, queryFilters.suborder]);

  useEffect(() => {
    if (!isFocused) return;
    fetchIotData();
  }, [isFocused, selectedMachine?.machineId, activeWorkOrder, analyticsDate, reportWindow.start.getTime(), reportWindow.end.getTime()]);

  useEffect(() => {
    setGanttRange(null);
    setSelectionDraft(null);
  }, [selectedMachine?.machineId, analyticsDate]);

  const loadShifts = async () => {
    try {
      const data = await DataStorage.getShifts();
      const shiftList = data.length ? data : sampleShifts;
      setShifts([...shiftList].sort((a: any, b: any) => String(a.startTime).localeCompare(String(b.startTime))));
    } catch (e) {
      setShifts(sampleShifts);
    }
  };

  const loadData = async () => {
    setLoading(true);
    const to = analyticsDate || today();
    try {
      const dashboard = await DataStorage.getIotMachineAnalytics(to);
      const machineList = dashboard.machines || [];
      if (dashboard.shifts?.length) {
        setShifts([...dashboard.shifts].sort((a: any, b: any) => String(a.startTime).localeCompare(String(b.startTime))));
      }
      setMachines(machineList);
      setSelectedMachine((current: any) => {
        if (!current) return current;
        return machineList.find((machine: any) => machine.machineId === current.machineId) || current;
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchIotData = async () => {
    if (!selectedMachine?.machineId) return;
    setLoadingIot(true);
    try {
      const start = reportWindow.start.toISOString();
      const end = reportWindow.end.toISOString();
      const dashboard = await DataStorage.getIotMachineAnalytics(analyticsDate, start, end, selectedMachine.machineId);
      const apiHourData = (dashboard.hourData || []).map((row: any) => ({
        ...row,
        sourceDate: row.sourceDate || row.productionDate || row.dateOnly || toDateOnly(row.date || row.startTimestamp || row.packet_id),
      }));
      const apiStatusData = dashboard.statusData || [];
      setHourData(apiHourData);
      setStatusData(apiStatusData);
      setStatusChartData(dashboard.chart_data || []);
      setPartCountSummary(dashboard.partCount || null);
    } catch (e) {
      setHourData([]);
      setStatusData([]);
      setStatusChartData([]);
      setPartCountSummary(null);
    } finally {
      setLoadingIot(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    await fetchIotData();
    setRefreshing(false);
  };

  const renderMachineMenu = () => (
    <View style={styles.menu}>
      <View style={styles.menuSearch}>
        <MaterialCommunityIcons name="magnify" size={18} color="#5b7773" />
        <TextInput
          style={styles.menuInput}
          placeholder="Filter machines..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholderTextColor="#7a9692"
        />
      </View>
      <ScrollView style={styles.menuList}>
        {filteredMachines.map((machine: any) => (
          <TouchableOpacity
            key={machine.machineId}
            style={[styles.menuItem, selectedMachine?.machineId === machine.machineId && styles.menuItemActive]}
            onPress={() => {
              setSelectedMachine(machine);
              setShowMachineMenu(false);
            }}
          >
            <View>
              <Text style={styles.menuItemTitle}>{machine.name || machine.machineId}</Text>
              <Text style={styles.menuItemSub}>{machine.machineId}</Text>
            </View>
            <StatusBadge variant={machine.status as any} />
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );

  const renderFilterBar = () => (
    <View style={styles.filterBar}>
      <View style={styles.filterField}>
        <Text style={styles.filterLabel}>Date</Text>
        <DatePicker value={analyticsDate} onChange={setAnalyticsDate} />
      </View>

      <View style={[styles.filterField, styles.dropdownField]}>
        <Text style={styles.filterLabel}>Work Order</Text>
        <TouchableOpacity style={styles.selectBox} onPress={() => setShowWorkOrderMenu(!showWorkOrderMenu)}>
          <Text style={styles.selectText}>{getWorkOrderLabel(selectedWorkOrder)}</Text>
          <MaterialCommunityIcons name={showWorkOrderMenu ? 'chevron-up' : 'chevron-down'} size={18} color="#315451" />
        </TouchableOpacity>
        {showWorkOrderMenu && (
          <View style={styles.workOrderMenu}>
            <ScrollView style={styles.workOrderList}>
              {workOrders.map((wo: any) => (
                <TouchableOpacity
                  key={getWorkOrderKey(wo)}
                  style={[styles.workOrderItem, getWorkOrderKey(wo) === getWorkOrderKey(selectedWorkOrder) && styles.workOrderItemActive]}
                  onPress={() => {
                    setSelectedWorkOrder(wo);
                    setSelectedSubOrder(null);
                    setShowWorkOrderMenu(false);
                  }}
                >
                  <Text style={styles.workOrderTitle}>{getWorkOrderLabel(wo)}</Text>
                  <Text style={styles.workOrderSub}>{getWorkOrderMetaText(wo, selectedMachine?.machineId)}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}
      </View>

      {subOrders.length > 0 && (
        <View style={styles.filterField}>
          <Text style={styles.filterLabel}>Suborder</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.segmentRow}>
              <TouchableOpacity
                style={[styles.segment, !selectedSubOrder && styles.segmentActive]}
                onPress={() => setSelectedSubOrder(null)}
              >
                <Text style={[styles.segmentText, !selectedSubOrder && styles.segmentTextActive]}>Main</Text>
              </TouchableOpacity>
              {subOrders.map((sub: any) => (
                <TouchableOpacity
                  key={getWorkOrderKey(sub)}
                  style={[styles.segment, getWorkOrderKey(sub) === getWorkOrderKey(selectedSubOrder) && styles.segmentActive]}
                  onPress={() => setSelectedSubOrder(sub)}
                >
                  <Text style={[styles.segmentText, getWorkOrderKey(sub) === getWorkOrderKey(selectedSubOrder) && styles.segmentTextActive]}>
                    {getWorkOrderLabel(sub)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>
      )}
    </View>
  );

  const renderHeader = () => (
    <View style={styles.header}>
      <View style={styles.headerLeft}>
        <View style={styles.brandBox}>
          <MaterialCommunityIcons name="chart-timeline-variant" size={20} color="#ffffff" />
        </View>
        <View>
          <Text style={styles.brandTitle}>IoT Analytics Hub</Text>
          <Text style={styles.brandSub}>
            {selectedMachine?.machineId || queryFilters.machineId || 'Select machine'} / {getWorkOrderLabel(activeWorkOrder)}
          </Text>
        </View>
      </View>
      <View style={styles.headerStats}>
        <View style={styles.miniStat}>
          <Text style={styles.miniValue}>{totalProduced}</Text>
          <Text style={styles.miniLabel}>PART COUNT</Text>
        </View>
        <View style={styles.miniDivider} />
        <View style={styles.miniStat}>
          <Text style={styles.miniValue}>{efficiency.toFixed(2)}%</Text>
          <Text style={styles.miniLabel}>EFFICIENCY</Text>
        </View>
      </View>
      <View style={styles.machineSelectorWrap}>
        <TouchableOpacity style={styles.machineSelector} onPress={() => setShowMachineMenu(!showMachineMenu)}>
          <View>
            <Text style={styles.selectorHint}>MACHINE ID</Text>
            <Text style={styles.selectorValue}>{selectedMachine?.name || selectedMachine?.machineId || 'Loading...'}</Text>
          </View>
          <MaterialCommunityIcons name="chevron-down" size={20} color="#7a9692" />
        </TouchableOpacity>
        {showMachineMenu && renderMachineMenu()}
      </View>
    </View>
  );

  const renderProductionCharts = () => (
    <View style={styles.chartRow}>
      <View style={styles.chartPanel}>
        <View style={styles.lutRow}>
          <Text style={styles.lutText}>LUT : {fmtDate(lutDateTime)} {formatTime(lutDateTime)}</Text>
          <Text style={styles.chartTitleInline}>Hourly Part-Count</Text>
          {/* <Text style={styles.loadingText}>{loadingIot ? 'Updating...' : usingSampleData ? 'Sample data' : 'ABC'}</Text> */}
        </View>
        <View style={styles.hourChartWrap}>
          <View style={styles.yAxis}>
            {hourlyYAxisTicks.map((tick) => (
              <Text key={tick} style={styles.yTick}>{formatCompactCount(tick)}</Text>
            ))}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hourScrollContent}>
            <View style={[styles.hourChart, { minWidth: Math.max(displayedHourlyChartData.length * 42, 96) }]}>
              <View style={styles.chartBaseline} />
              {displayedHourlyChartData.map((item, index) => {
                const barHeight = Math.max((item.partProduced / hourlyAxisMax) * 100, item.partProduced > 0 ? 8 : 0);
                const showAxis = index % 2 === 0;
                return (
                  <TouchableOpacity
                    key={`${item.date}-${item.hour}`}
                    style={styles.hourColumn}
                    onPressIn={() => setHoveredHour(item)}
                    onPressOut={() => setHoveredHour(null)}
                    // @ts-ignore
                    onMouseEnter={() => setHoveredHour(item)}
                    // @ts-ignore
                    onMouseLeave={() => setHoveredHour(null)}
                  >
                    <Text style={styles.hourValue}>{item.partProduced}</Text>
                    <View style={[styles.hourBar, { height: barHeight }]} />
                    <Text style={styles.hourLabel}>{showAxis ? item.label : ''}</Text>
                  </TouchableOpacity>
                );
              })}
              <Text style={styles.hoursLabel}>(hrs)</Text>
            </View>
          </ScrollView>
        </View>
        {hoveredHour && (
          <View pointerEvents="none" style={styles.tooltip}>
            <Text style={styles.tooltipTitle}>{hoveredHour.date} {hoveredHour.label}</Text>
            <Text style={styles.tooltipLine}>Produced: {hoveredHour.partProduced}</Text>
            {/* <Text style={styles.tooltipLine}>Part Count: {hoveredHour.rawPartProduced}</Text> */}
            {/* <Text style={styles.tooltipLine}>Parts/Cycle: {hoveredHour.partsPerCycle}</Text> */}
            {/* <Text style={styles.tooltipLine}>
              {hoveredHour.rawPartProduced} x {hoveredHour.partsPerCycle} = {hoveredHour.partProduced}
            </Text> */}
            {hoveredHour.pinCounts?.map((item: any) => {
              const pinProduced = item.count * hoveredHour.partsPerCycle;
              return (
                <Text key={item.label} style={styles.tooltipLine}>
                  {item.label}: {pinProduced}
                </Text>
              );
            })}
            <Text style={styles.tooltipLine}>OEE: {hoveredHour.oEE}%</Text>
          </View>
        )}
      </View>

      <View style={styles.chartPanel}>
        <View style={styles.lutRow}>
          <Text style={styles.lutText}>OEE</Text>
          <Text style={styles.loadingText}>{loadingIot ? 'Updating...' : ''}</Text>
        </View>
        <View style={styles.oeeLegend}>
          {oeeMetricDefs.map((metric) => (
            <View key={metric.label} style={styles.oeeLegendItem}>
              <View style={[styles.oeeLegendSwatch, { backgroundColor: metric.color }]} />
              <Text style={styles.oeeLegendText}>{metric.label}</Text>
            </View>
          ))}
        </View>
        <View style={styles.oeeHourlyWrap}>
          <View style={styles.oeeYAxis}>
            {[100, 75, 50, 25, 0].map((tick) => (
              <Text key={tick} style={styles.oeeYAxisTick}>{tick}%</Text>
            ))}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hourScrollContent}>
            <View style={[styles.oeeHourlyChart, { minWidth: Math.max(displayedHourlyChartData.length * 54, 120) }]}>
              <View style={styles.oeeBaseline} />
              {displayedHourlyChartData.map((item: any, index) => {
                const showAxis = index % 2 === 0;
                return (
                  <TouchableOpacity
                    key={`${item.date}-${item.hour}-oee`}
                    style={styles.oeeHourColumn}
                    onPressIn={() => setHoveredOeeHour(item)}
                    onPressOut={() => setHoveredOeeHour(null)}
                    // @ts-ignore
                    onMouseEnter={() => setHoveredOeeHour(item)}
                    // @ts-ignore
                    onMouseLeave={() => setHoveredOeeHour(null)}
                  >
                    <View style={styles.oeeBarGroup}>
                      {oeeMetricDefs.map((metric) => {
                        const value = Math.min(Math.max(Number(item[metric.key] ?? 0), 0), 100);
                        return (
                          <View key={metric.label} style={styles.oeeMiniBarTrack}>
                            <View style={[styles.oeeMiniBar, { height: `${value}%`, backgroundColor: metric.color } as any]} />
                          </View>
                        );
                      })}
                    </View>
                    <Text style={styles.hourLabel}>{showAxis ? item.label : ''}</Text>
                  </TouchableOpacity>
                );
              })}
              <Text style={styles.hoursLabel}>(hrs)</Text>
            </View>
          </ScrollView>
        </View>
        {hoveredOeeHour && (
          <View pointerEvents="none" style={styles.tooltip}>
            <Text style={styles.tooltipTitle}>{hoveredOeeHour.date} {hoveredOeeHour.label}</Text>
            <Text style={styles.tooltipLine}>OEE: {Number(hoveredOeeHour.oEE || 0).toFixed(2)}%</Text>
            <Text style={styles.tooltipLine}>A: {Number(hoveredOeeHour.availability || 0).toFixed(2)}%</Text>
            <Text style={styles.tooltipLine}>P: {Number(hoveredOeeHour.performance || 0).toFixed(2)}%</Text>
            <Text style={styles.tooltipLine}>Q: {Number(hoveredOeeHour.quality || 0).toFixed(2)}%</Text>
          </View>
        )}
      </View>
    </View>
  );

  const renderTimeline = () => (
    <View style={styles.reportCard}>
      <View style={styles.timelineHeader}>
        <Text style={styles.timelineTitle}>
          Today - {analyticsDate} - (Efficiency {efficiency.toFixed(2)} %)
        </Text>
        <View style={styles.zoomSelectWrap}>
          <Text style={styles.zoomHint}>{ganttRange ? 'Selected range' : 'Drag chart to zoom'}</Text>
          <TouchableOpacity
            style={styles.zoomSelect}
            onPress={() => setGanttRange(null)}
            disabled={!ganttRange}
          >
            <Text style={styles.zoomValueText}>{ganttRange ? 'Reset' : 'Full'}</Text>
            <MaterialCommunityIcons name={ganttRange ? 'backup-restore' : 'selection-drag'} size={18} color="#315451" />
          </TouchableOpacity>
        </View>
      </View>
      <View style={styles.timelineBody}>
        <View style={styles.timelineZoomContent}>
          {visibleStatusSegments.length ? (
            <View
              style={styles.timelineTrack}
              onLayout={(event) => setTimelineTrackWidth(event.nativeEvent.layout.width)}
              onStartShouldSetResponder={() => true}
              onResponderGrant={startGanttSelection}
              onResponderMove={updateGanttSelection}
              onResponderRelease={finishGanttSelection}
              onResponderTerminate={() => setSelectionDraft(null)}
            >
              {visibleStatusSegments.map((segment: any, index: number) => (
                <TouchableOpacity
                  key={`${segment.segmentStartTs}-${index}`}
                  style={[
                    styles.timelineSegment,
                    {
                      width: `${segment.width}%`,
                      backgroundColor: ganttSegmentColor(segment),
                    },
                  ]}
                  onPressIn={() => setHoveredStatus(segment)}
                  onPressOut={() => setHoveredStatus(null)}
                  // @ts-ignore
                  onMouseEnter={() => setHoveredStatus(segment)}
                  // @ts-ignore
                  onMouseLeave={() => setHoveredStatus(null)}
                />
              ))}
              {selectionOverlay && <View pointerEvents="none" style={[styles.selectionFrame, selectionOverlay as any]} />}
              {shiftMarkers.map((marker) => (
                <View key={marker.label} style={[styles.shiftMarker, { left: marker.left } as any]}>
                  <View style={styles.shiftMarkerLine} />
                  <Text style={styles.shiftMarkerText}>{marker.label}</Text>
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.noChartData}>
              <Text style={styles.noChartDataText}>No actual status data for this machine and time window</Text>
            </View>
          )}
          <View style={styles.timelineAxis}>
            {timelineTicks.map((tick) => (
              <Text key={tick} style={styles.timelineTick}>{tick}</Text>
            ))}
          </View>
          <View
            style={styles.dataZoomSlider}
            onLayout={(event) => setZoomSliderWidth(event.nativeEvent.layout.width)}
            onStartShouldSetResponder={() => true}
            onResponderGrant={startZoomSliderSelection}
            onResponderMove={updateZoomSliderSelection}
            onResponderRelease={finishZoomSliderSelection}
            onResponderTerminate={() => setSelectionDraft(null)}
          >
            <View style={styles.dataZoomTrack} />
            <View style={[styles.dataZoomWindow, zoomWindowStyle as any]}>
              <View style={styles.dataZoomHandle} />
              <View style={styles.dataZoomHandle} />
            </View>
            {selectionDraft && (
              <View
                pointerEvents="none"
                style={[
                  styles.dataZoomDraft,
                  {
                    left: `${Math.min(selectionDraft.startPct, selectionDraft.currentPct)}%`,
                    width: `${Math.abs(selectionDraft.currentPct - selectionDraft.startPct)}%`,
                  } as any,
                ]}
              />
            )}
          </View>
        </View>
      </View>
      {statusChartData.length > 0 && (
        <View style={styles.statusBreakdown}>
          {statusChartData.map((item: any) => (
            <View key={item.status} style={styles.statusBreakdownItem}>
              <View style={[styles.statusSwatch, { backgroundColor: statusColor(item.status_name) }]} />
              <View style={styles.statusBreakdownText}>
                <Text style={styles.statusBreakdownName}>{item.status_name}</Text>
                <Text style={styles.statusBreakdownDuration}>{formatDurationSeconds(item.duration)}</Text>
              </View>
              <Text style={styles.statusBreakdownPercent}>{Number(item.percent || 0).toFixed(2)}%</Text>
            </View>
          ))}
        </View>
      )}
      {hoveredStatus && (
        <View style={styles.tooltip}>
          <Text style={styles.tooltipTitle}>{hoveredStatus.fromTo || `${formatTime(new Date(hoveredStatus.segmentStartTs))} - ${formatTime(new Date(hoveredStatus.segmentEndTs))}`}</Text>
          <Text style={styles.tooltipLine}>Status: {hoveredStatus.name || 'No Data'}</Text>
          <Text style={styles.tooltipLine}>Duration: {hoveredStatus.duration}</Text>
          {hoveredStatus.partCnt !== undefined && <Text style={styles.tooltipLine}>Produced: {hoveredStatus.partCnt}</Text>}
        </View>
      )}
    </View>
  );

  const renderSummary = () => (
    <View style={styles.summaryRow}>
      {[
        ['Date', analyticsDate],
        ['Workorder', getWorkOrderLabel(selectedWorkOrder)],
        ['Suborder', selectedSubOrder ? getWorkOrderLabel(selectedSubOrder) : 'Main'],
        ['Process', getWorkOrderDetail(activeWorkOrder, selectedMachine?.machineId, ['process'])],
        ['Status', getWorkOrderDetail(activeWorkOrder, selectedMachine?.machineId, ['status', 'Status', 'stageStatus'])],
        ['Target', getWorkOrderDetail(activeWorkOrder, selectedMachine?.machineId, ['targetPartCount', 'targetQuantity', 'target'])],
        ['Shift', getWorkOrderShift(activeWorkOrder, selectedMachine?.machineId)],
        ['Machine ID', selectedMachine?.machineId || '-'],
      ].map(([label, value]) => (
        <View key={label} style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>{label}</Text>
          <Text style={styles.summaryValue}>{value}</Text>
        </View>
      ))}
    </View>
  );

  return (
    <View style={styles.root}>
      {renderHeader()}
      <ScrollView
        style={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={styles.scrollContent}
      >
        {renderFilterBar()}
        {renderSummary()}
        {selectedMachine ? (
          <>
            {renderProductionCharts()}
            {renderTimeline()}
          </>
        ) : (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="access-point-off" size={48} color="#7a9692" />
            <Text style={styles.emptyTitle}>{loading ? 'Loading analytics...' : 'No machine data found'}</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#eef3f5' },
  scroll: { flex: 1 },
  scrollContent: { padding: 14, paddingBottom: 40, gap: 16 },
  header: {
    minHeight: 72,
    backgroundColor: '#083d3a',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    gap: 16,
    zIndex: 100,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, minWidth: 220 },
  brandBox: { width: 38, height: 38, borderRadius: 8, backgroundColor: '#0d9488', alignItems: 'center', justifyContent: 'center' },
  brandTitle: { color: '#ffffff', fontSize: 16, fontWeight: '800' },
  brandSub: { color: '#7a9692', fontSize: 11, fontWeight: '600', marginTop: 2 },
  headerStats: { flexDirection: 'row', alignItems: 'center', gap: 18, flex: 1, justifyContent: 'center' },
  miniStat: { alignItems: 'center' },
  miniValue: { color: '#ffffff', fontSize: 17, fontWeight: '900' },
  miniLabel: { color: '#7a9692', fontSize: 8, fontWeight: '800', marginTop: 2 },
  miniDivider: { width: 1, height: 28, backgroundColor: '#315451' },
  machineSelectorWrap: { position: 'relative', zIndex: 200 },
  machineSelector: {
    minWidth: 230,
    backgroundColor: '#183f3c',
    borderWidth: 1,
    borderColor: '#315451',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  selectorHint: { color: '#7a9692', fontSize: 8, fontWeight: '900' },
  selectorValue: { color: '#2dd4bf', fontSize: 13, fontWeight: '800', marginTop: 2 },
  menu: {
    position: 'absolute',
    top: 56,
    right: 0,
    width: 290,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d7d0c2',
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 10,
    overflow: 'hidden',
  },
  menuSearch: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderBottomWidth: 1, borderBottomColor: '#e7e5df' },
  menuInput: { flex: 1, fontSize: 13, color: '#083d3a', outlineStyle: 'none' } as any,
  menuList: { maxHeight: 300 },
  menuItem: { padding: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#edf5f4' },
  menuItemActive: { backgroundColor: '#e6fffb' },
  menuItemTitle: { fontSize: 13, fontWeight: '800', color: '#1f2937' },
  menuItemSub: { fontSize: 11, color: '#5b7773', marginTop: 2 },
  filterBar: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#c9bdab',
    borderRadius: 4,
    padding: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    zIndex: 20,
  },
  filterField: { minWidth: 180, flex: 1, gap: 6 },
  dropdownField: { position: 'relative', zIndex: 30 },
  filterLabel: { color: '#315451', fontSize: 11, fontWeight: '800' },
  segmentRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  segment: { height: 42, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1, borderColor: '#c8dbd8', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f7fbfa' },
  segmentActive: { backgroundColor: '#0f766e', borderColor: '#0f766e' },
  segmentText: { fontSize: 13, fontWeight: '700', color: '#486966' },
  segmentTextActive: { color: '#ffffff' },
  selectBox: {
    height: 42,
    borderWidth: 1,
    borderColor: '#c8dbd8',
    borderRadius: 8,
    backgroundColor: '#f7fbfa',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectText: { color: '#083d3a', fontSize: 13, fontWeight: '700' },
  workOrderMenu: {
    position: 'absolute',
    top: 68,
    left: 0,
    right: 0,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#c8dbd8',
    elevation: 12,
    overflow: 'hidden',
  },
  workOrderList: { maxHeight: 250 },
  workOrderItem: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#edf5f4' },
  workOrderItemActive: { backgroundColor: '#ecfeff' },
  workOrderTitle: { fontSize: 13, fontWeight: '800', color: '#083d3a' },
  workOrderSub: { fontSize: 11, color: '#5b7773', marginTop: 2 },
  summaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  summaryItem: {
    flex: 1,
    minWidth: 150,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d7d0c2',
    borderRadius: 4,
    padding: 10,
  },
  summaryLabel: { fontSize: 10, color: '#5b7773', fontWeight: '800', textTransform: 'uppercase' },
  summaryValue: { fontSize: 13, color: '#1f2937', fontWeight: '800', marginTop: 4 },
  reportCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#c9bdab',
    borderRadius: 4,
    padding: 24,
    minHeight: 185,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 2,
  },
  chartRow: { flexDirection: 'row', gap: 16, alignItems: 'stretch', flexWrap: width > 900 ? 'nowrap' : 'wrap' },
  chartPanel: {
    flex: 1,
    minWidth: width > 900 ? 0 : 320,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#c9bdab',
    borderRadius: 4,
    padding: 18,
    minHeight: 220,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 2,
  },
  lutRow: { minHeight: 24, flexDirection: 'row', alignItems: 'center', gap: 12 },
  lutText: { flex: 1, color: '#315451', fontSize: 18, fontWeight: '500' },
  chartTitleInline: { flex: 1, textAlign: 'center', color: 'green', fontSize: 18, fontWeight: '500' },
  loadingText: { flex: 1, textAlign: 'right', color: '#0f766e', fontSize: 12, fontWeight: '800' },
  chartTitle: { textAlign: 'center', color: 'green', fontSize: 18, fontWeight: '500', marginBottom: 10 },
  hourChartWrap: { flexDirection: 'row', minHeight: 150 },
  yAxis: { width: 42, height: 118, justifyContent: 'space-between', alignItems: 'flex-end', paddingRight: 6 },
  yTick: { color: '#333333', fontSize: 15 },
  hourScrollContent: { flexGrow: 1 },
  hourChart: { height: 146, flexDirection: 'row', alignItems: 'flex-end', position: 'relative', paddingRight: 54 },
  chartBaseline: { position: 'absolute', left: 0, right: 28, bottom: 24, height: 1, backgroundColor: '#333333' },
  hourColumn: { width: 42, height: 140, alignItems: 'center', justifyContent: 'flex-end' },
  hourValue: { color: '#00aeb4', fontSize: 15, minHeight: 20, marginBottom: 2 },
  hourBar: { width: 34, backgroundColor: '#18b7b9', marginBottom: 6 },
  hourLabel: { color: '#333333', fontSize: 14, minHeight: 18 },
  hoursLabel: { position: 'absolute', right: 0, bottom: 20, color: '#333333', fontSize: 14 },
  oeeLegend: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 6 },
  oeeLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  oeeLegendSwatch: { width: 10, height: 10, borderRadius: 2 },
  oeeLegendText: { color: '#315451', fontSize: 11, fontWeight: '900' },
  oeeHourlyWrap: { flexDirection: 'row', minHeight: 150, marginTop: 4 },
  oeeYAxis: { width: 42, height: 118, justifyContent: 'space-between', alignItems: 'flex-end', paddingRight: 6, paddingTop: 2 },
  oeeYAxisTick: { color: '#333333', fontSize: 11, fontWeight: '700' },
  oeeHourlyChart: { height: 146, flexDirection: 'row', alignItems: 'flex-end', position: 'relative', paddingRight: 54 },
  oeeBaseline: { position: 'absolute', left: 0, right: 28, bottom: 24, height: 1, backgroundColor: '#333333' },
  oeeHourColumn: { width: 54, height: 140, alignItems: 'center', justifyContent: 'flex-end' },
  oeeBarGroup: { height: 112, flexDirection: 'row', alignItems: 'flex-end', gap: 2, marginBottom: 6 },
  oeeMiniBarTrack: { width: 8, height: 108, backgroundColor: '#e3eceb', justifyContent: 'flex-end', overflow: 'hidden' },
  oeeMiniBar: { width: '100%', borderTopLeftRadius: 2, borderTopRightRadius: 2 },
  timelineHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 4 },
  timelineTitle: { color: '#2d2d2d', fontSize: 16, fontWeight: '800' },
  zoomSelectWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, zIndex: 40 },
  zoomHint: { color: '#5b7773', fontSize: 12, fontWeight: '700' },
  zoomSelect: { minWidth: 92, height: 34, borderWidth: 1, borderColor: '#c8dbd8', borderRadius: 8, backgroundColor: '#f7fbfa', paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  zoomValueText: { color: '#315451', fontSize: 12, fontWeight: '800' },
  timelineBody: { paddingHorizontal: 32, paddingTop: 2 },
  timelineZoomContent: { paddingBottom: 1 },
  timelineTrack: { height: 46, backgroundColor: '#bfbfbf', flexDirection: 'row', marginTop: 2, position: 'relative', overflow: 'visible' },
  selectionFrame: { position: 'absolute', top: 0, bottom: 0, borderWidth: 2, borderColor: '#00877f', backgroundColor: 'rgba(14,165,233,0.18)' },
  noChartData: { height: 46, borderWidth: 1, borderColor: '#c8dbd8', backgroundColor: '#f7fbfa', alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  noChartDataText: { color: '#5b7773', fontSize: 13, fontWeight: '700' },
  timelineSegment: { height: '100%', borderRightWidth: 1, borderRightColor: 'rgba(255,255,255,0.35)' },
  shiftMarker: { position: 'absolute', top: -12, bottom: -18, width: 1, alignItems: 'center' },
  shiftMarkerLine: { width: 1, height: 70, borderLeftWidth: 1, borderStyle: 'dashed', borderColor: '#ff4b4b' },
  shiftMarkerText: { color: '#ff2222', fontSize: 15, minWidth: 160, textAlign: 'center', marginTop: -16 },
  timelineAxis: { height: 36, borderTopWidth: 1, borderTopColor: '#333333', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  timelineTick: { color: '#333333', fontSize: 15, marginTop: 6 },
  dataZoomSlider: { height: 32, justifyContent: 'center', position: 'relative', marginTop: 6 },
  dataZoomTrack: { height: 10, borderRadius: 5, backgroundColor: '#d7e6e4', borderWidth: 1, borderColor: '#c8dbd8' },
  dataZoomWindow: { position: 'absolute', height: 18, top: 7, borderRadius: 5, borderWidth: 1, borderColor: '#00877f', backgroundColor: 'rgba(14,165,233,0.22)', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dataZoomDraft: { position: 'absolute', height: 18, top: 7, borderRadius: 5, borderWidth: 1, borderColor: '#0284c7', backgroundColor: 'rgba(2,132,199,0.16)' },
  dataZoomHandle: { width: 5, height: 18, borderRadius: 2, backgroundColor: '#00877f' },
  statusBreakdown: { marginTop: 14, flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statusBreakdownItem: { minWidth: 170, flex: 1, borderWidth: 1, borderColor: '#d7e6e4', borderRadius: 6, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#f7fbfa' },
  statusSwatch: { width: 12, height: 12, borderRadius: 2 },
  statusBreakdownText: { flex: 1 },
  statusBreakdownName: { color: '#1f2937', fontSize: 13, fontWeight: '800' },
  statusBreakdownDuration: { color: '#5b7773', fontSize: 11, fontWeight: '700', marginTop: 2 },
  statusBreakdownPercent: { color: '#0f766e', fontSize: 14, fontWeight: '900' },
  tooltip: {
    position: 'absolute',
    right: 28,
    top: 18,
    backgroundColor: '#083d3a',
    borderRadius: 8,
    padding: 10,
    minWidth: 180,
    zIndex: 50,
  },
  tooltipTitle: { color: '#c8dbd8', fontSize: 11, fontWeight: '800', marginBottom: 6 },
  tooltipLine: { color: '#ffffff', fontSize: 12, fontWeight: '700', marginTop: 2 },
  emptyState: { minHeight: 280, alignItems: 'center', justifyContent: 'center', gap: 10 },
  emptyTitle: { color: '#486966', fontSize: 16, fontWeight: '800' },
});
