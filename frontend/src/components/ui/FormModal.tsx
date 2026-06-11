import React, { ReactNode } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  ScrollView,
  StyleSheet,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';

interface FormModalProps {
  visible: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  onSave: () => void;
  saveLabel?: string;
  children: ReactNode;
  saveDisabled?: boolean;
  maxWidth?: number;
  noScroll?: boolean;
  hideCancel?: boolean;
}

export function FormModal({
  visible,
  title,
  subtitle,
  onClose,
  onSave,
  saveLabel = 'Save',
  children,
  saveDisabled = false,
  maxWidth,
  noScroll = false,
  hideCancel = false,
}: FormModalProps) {
  if (Platform.OS === 'web') {
    // Web: render as side panel / centered modal overlay
    if (!visible) return null;
    return (
      <View style={styles.webOverlay}>
        <View style={styles.webBackdrop} />
        <View style={[styles.webPanel, maxWidth ? { maxWidth } : null]}>
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.title}>{title}</Text>
              {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>
          {noScroll ? (
            <View style={[styles.body, { gap: 12 }]}>
              {children}
            </View>
          ) : (
            <ScrollView style={styles.body} contentContainerStyle={{ gap: 12 }}>
              {children}
            </ScrollView>
          )}
          <View style={styles.footer}>
            {!hideCancel && (
              <TouchableOpacity style={styles.cancelBtn} onPress={onClose} activeOpacity={0.8}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.saveBtn, saveDisabled && styles.saveBtnDisabled]}
              onPress={onSave}
              disabled={saveDisabled}
              activeOpacity={0.8}
            >
              <Text style={styles.saveBtnText}>{saveLabel}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  // Native: Modal
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={styles.nativeOverlay} />
        <View style={styles.nativePanel}>
          <View style={styles.dragHandle} />
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.title}>{title}</Text>
              {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>
          {noScroll ? (
            <View style={[styles.body, { gap: 12, paddingBottom: 40 }]}>
              {children}
            </View>
          ) : (
            <ScrollView style={styles.body} contentContainerStyle={{ gap: 12, paddingBottom: 40 }}>
              {children}
            </ScrollView>
          )}
          <View style={styles.footer}>
            {!hideCancel && (
              <TouchableOpacity style={styles.cancelBtn} onPress={onClose} activeOpacity={0.8}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.saveBtn, saveDisabled && styles.saveBtnDisabled]}
              onPress={onSave}
              disabled={saveDisabled}
              activeOpacity={0.8}
            >
              <Text style={styles.saveBtnText}>{saveLabel}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// Reusable form field wrapper
export function FormField({ label, required, children, style, containerStyle }: { label: string; required?: boolean; children: ReactNode; style?: any; containerStyle?: any }) {
  return (
    <View style={[formStyles.field, containerStyle, style]}>
      <Text style={formStyles.label}>
        {label}
        {required && <Text style={formStyles.required}> *</Text>}
      </Text>
      {children}
    </View>
  );
}

export const inputStyle = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderColor: '#c8dbd8',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 14,
    color: '#083d3a',
    backgroundColor: '#f7fbfa',
  } as any,
});

const formStyles = StyleSheet.create({
  field: {
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: '800',
    color: '#315451',
  },
  required: {
    color: '#dc2626',
  },
});

const styles = StyleSheet.create({
  // Web overlay
  webOverlay: {
    position: 'absolute' as any,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
    justifyContent: 'center',
    alignItems: 'center',
  },
  webBackdrop: {
    position: 'absolute' as any,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(15,23,42,0.4)',
  },
  webPanel: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    width: '100%',
    maxWidth: 560,
    maxHeight: '90%' as any,
    boxShadow: '0px 24px 60px rgba(8, 61, 58, 0.22)',
    zIndex: 1001,
    overflow: 'hidden',
  },
  // Native panel
  nativeOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.4)',
  },
  nativePanel: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    maxHeight: '90%' as any,
  },
  dragHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#d7e6e4',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 4,
  },
  // Shared
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#edf5f4',
    backgroundColor: '#f7fbfa',
  },
  headerText: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: '900',
    color: '#083d3a',
  },
  subtitle: {
    fontSize: 13,
    color: '#5b7773',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#e8f8f6',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  closeBtnText: {
    fontSize: 13,
    color: '#5b7773',
    fontWeight: '700',
  },
  body: {
    paddingHorizontal: 20,
    paddingTop: 10,
    flexShrink: 1,
  },
  footer: {
    flexDirection: 'row',
    gap: 10,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#edf5f4',
    backgroundColor: '#ffffff',
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 11,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#c8dbd8',
    backgroundColor: '#f7fbfa',
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#486966',
  },
  saveBtn: {
    flex: 2,
    paddingVertical: 12,
    borderRadius: 11,
    alignItems: 'center',
    backgroundColor: '#00877f',
    boxShadow: '0px 8px 18px rgba(0, 135, 127, 0.22)',
  },
  saveBtnDisabled: {
    backgroundColor: '#8de0d9',
  },
  saveBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
  },
});
