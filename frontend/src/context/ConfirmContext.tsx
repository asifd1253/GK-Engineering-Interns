import React, { createContext, useContext, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Platform } from 'react-native';

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isDestructive?: boolean;
  onConfirm: () => void | Promise<void>;
}

interface ConfirmContextData {
  showConfirm: (options: ConfirmOptions) => void;
  hideConfirm: () => void;
}

const ConfirmContext = createContext<ConfirmContextData | undefined>(undefined);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const [loading, setLoading] = useState(false);

  const showConfirm = (opts: ConfirmOptions) => setOptions(opts);
  const hideConfirm = () => {
    if (!loading) setOptions(null);
  };

  const handleConfirm = async () => {
    if (!options) return;
    setLoading(true);
    try {
      await options.onConfirm();
    } finally {
      setLoading(false);
      setOptions(null);
    }
  };

  return (
    <ConfirmContext.Provider value={{ showConfirm, hideConfirm }}>
      {children}
      {options && (
        <Modal transparent visible={true} animationType="fade" onRequestClose={hideConfirm}>
          <View style={styles.overlay}>
            <View style={styles.dialog}>
              <Text style={styles.title}>{options.title}</Text>
              <Text style={styles.message}>{options.message}</Text>
              
              <View style={styles.buttonRow}>
                <TouchableOpacity style={[styles.button, styles.cancelBtn]} onPress={hideConfirm} disabled={loading}>
                  <Text style={styles.cancelBtnText}>{options.cancelLabel || 'Cancel'}</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.button, options.isDestructive ? styles.destructiveBtn : styles.primaryBtn]} 
                  onPress={handleConfirm}
                  disabled={loading}
                >
                  <Text style={styles.confirmBtnText}>
                    {loading ? 'Processing...' : (options.confirmLabel || 'Confirm')}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </ConfirmContext.Provider>
  );
}

export const useConfirm = () => {
  const context = useContext(ConfirmContext);
  if (!context) throw new Error('useConfirm must be used within ConfirmProvider');
  return context;
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    ...(Platform.OS === 'web' && { backdropFilter: 'blur(4px)' } as any),
  },
  dialog: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 15,
    elevation: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#083d3a',
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    color: '#486966',
    lineHeight: 20,
    marginBottom: 24,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  button: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 80,
  },
  cancelBtn: {
    backgroundColor: '#edf5f4',
  },
  cancelBtnText: {
    color: '#486966',
    fontWeight: '600',
    fontSize: 14,
  },
  primaryBtn: {
    backgroundColor: '#00877f',
  },
  destructiveBtn: {
    backgroundColor: '#ef4444',
  },
  confirmBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  }
});
