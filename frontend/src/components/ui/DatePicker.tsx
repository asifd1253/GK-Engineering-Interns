import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Platform,
  StyleSheet,
  Modal,
} from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { fmtDate } from '../../utils/storage';

interface DatePickerProps {
  value: string;               // ISO date string "YYYY-MM-DD"
  onChange: (date: string) => void;
  placeholder?: string;
  label?: string;
  minDate?: string;            // ISO date string "YYYY-MM-DD"
  maxDate?: string;            // ISO date string "YYYY-MM-DD"
}

function toDate(iso: string): Date {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? new Date() : d;
}

function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ─── Web ─────────────────────────────────────────────────────────────────────
let _dpIdCounter = 0;

function applyMinMax(id: string, min?: string, max?: string) {
  if (typeof document === 'undefined') return;
  const el = document.getElementById(id) as HTMLInputElement | null;
  if (!el) return;
  if (min) el.setAttribute('min', min); else el.removeAttribute('min');
  if (max) el.setAttribute('max', max); else el.removeAttribute('max');
}

function WebDatePicker({ value, onChange, placeholder, minDate, maxDate }: DatePickerProps) {
  const inputId = useRef(`dp-${++_dpIdCounter}`).current;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const displayLabel = value ? fmtDate(value) : placeholder || 'Select date';

  useEffect(() => {
    applyMinMax(inputId, minDate, maxDate);
  }, [inputId, minDate, maxDate]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const d = e.target.value;
    if (!d) { onChange(''); return; }
    if (minDate && d < minDate) { onChange(minDate); return; }
    if (maxDate && d > maxDate) { onChange(maxDate); return; }
    onChange(d);
  };

  const openPicker = () => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    if (typeof input.showPicker === 'function') {
      input.showPicker();
    } else {
      input.click();
    }
  };

  return (
    <TouchableOpacity style={webStyles.wrapper} activeOpacity={0.85} onPress={openPicker}>
      <Text style={[webStyles.displayText, !value && webStyles.placeholder]} pointerEvents="none">{displayLabel}</Text>
      <input
        ref={inputRef}
        id={inputId}
        type="date"
        value={value || ''}
        min={minDate || ''}
        max={maxDate || ''}
        onChange={handleChange}
        onFocus={() => applyMinMax(inputId, minDate, maxDate)}
        placeholder={placeholder || 'Select date'}
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          width: '100%',
          height: '100%',
          border: 'none',
          outline: 'none',
          background: 'transparent',
          fontSize: 14,
          color: 'transparent',
          fontFamily: 'inherit',
          cursor: 'pointer',
          opacity: 0,
          zIndex: 2,
        }}
      />
    </TouchableOpacity>
  );
}

const webStyles = StyleSheet.create({
  wrapper: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#c8dbd8',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#f7fbfa',
    gap: 8,
    overflow: 'hidden',
  },
  icon: {
    fontSize: 16,
  },
  displayText: {
    flex: 1,
    fontSize: 14,
    color: '#083d3a',
    fontWeight: '500',
  },
  placeholder: {
    color: '#7a9692',
  },
});

// ─── Native (Android / iOS / Tablet) ─────────────────────────────────────────
function NativeDatePicker({ value, onChange, placeholder, minDate, maxDate }: DatePickerProps) {
  const [show, setShow] = useState(false);
  const currentDate = toDate(value);
  const minimumDate = minDate ? new Date(minDate) : undefined;
  const maximumDate = maxDate ? new Date(maxDate) : undefined;

  const displayLabel = value
    ? fmtDate(currentDate)
    : placeholder || 'Select date';

  const handleChange = (_event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === 'android') {
      setShow(false);
      if (selected) onChange(toISO(selected));
    } else {
      // iOS — keep open, update live
      if (selected) onChange(toISO(selected));
    }
  };

  const handleConfirmIOS = () => setShow(false);

  return (
    <>
      {/* Trigger Button */}
      <TouchableOpacity style={nativeStyles.trigger} onPress={() => setShow(true)} activeOpacity={0.8}>
        <Text style={nativeStyles.icon}>📅</Text>
        <Text style={[nativeStyles.label, !value && nativeStyles.placeholder]}>
          {displayLabel}
        </Text>
        <Text style={nativeStyles.caret}>▾</Text>
      </TouchableOpacity>

      {/* Android: inline picker shown directly */}
      {Platform.OS === 'android' && show && (
        <DateTimePicker
          value={currentDate}
          mode="date"
          display="default"
          onChange={handleChange}
          minimumDate={minimumDate}
          maximumDate={maximumDate}
        />
      )}

      {/* iOS: full-screen modal with picker */}
      {Platform.OS === 'ios' && (
        <Modal visible={show} transparent animationType="slide" onRequestClose={() => setShow(false)}>
          <TouchableOpacity
            style={nativeStyles.backdrop}
            activeOpacity={1}
            onPress={() => setShow(false)}
          />
          <View style={nativeStyles.iosSheet}>
            <View style={nativeStyles.iosSheetHeader}>
              <Text style={nativeStyles.iosSheetTitle}>Select Date</Text>
              <TouchableOpacity onPress={handleConfirmIOS} style={nativeStyles.doneBtn}>
                <Text style={nativeStyles.doneBtnText}>Done</Text>
              </TouchableOpacity>
            </View>
            <DateTimePicker
              value={currentDate}
              mode="date"
              display="spinner"
              onChange={handleChange}
              style={{ height: 200 }}
              minimumDate={minimumDate}
              maximumDate={maximumDate}
            />
          </View>
        </Modal>
      )}
    </>
  );
}

const nativeStyles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#c8dbd8',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    backgroundColor: '#f7fbfa',
    gap: 8,
  },
  icon: { fontSize: 16 },
  label: {
    flex: 1,
    fontSize: 14,
    color: '#083d3a',
    fontWeight: '500',
  },
  placeholder: { color: '#7a9692' },
  caret: { fontSize: 12, color: '#5b7773' },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.4)',
  },
  iosSheet: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 34,
  },
  iosSheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#edf5f4',
  },
  iosSheetTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#083d3a',
  },
  doneBtn: {
    backgroundColor: '#00877f',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 7,
  },
  doneBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
});

// ─── Exported Component ───────────────────────────────────────────────────────
export function DatePicker(props: DatePickerProps) {
  if (Platform.OS === 'web') {
    return <WebDatePicker {...props} />;
  }
  return <NativeDatePicker {...props} />;
}
