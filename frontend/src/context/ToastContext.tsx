import React, { createContext, useContext, useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Animated, Platform } from 'react-native';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastOptions {
  title?: string;
  message: string;
  type?: ToastType;
  duration?: number;
}

interface ToastContextData {
  showToast: (options: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextData | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastOptions | null>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(-50)).current;
  const timeoutRef = useRef<NodeJS.Timeout>();

  const nativeDriver = Platform.OS !== 'web';

  const showToast = (options: ToastOptions) => {
    setToast(options);
    fadeAnim.setValue(0);
    slideAnim.setValue(-50);
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: nativeDriver }),
      Animated.timing(slideAnim, { toValue: 0, duration: 300, useNativeDriver: nativeDriver }),
    ]).start();
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => hideToast(), options.duration || 3000);
  };

  const hideToast = () => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 0, duration: 250, useNativeDriver: nativeDriver }),
      Animated.timing(slideAnim, { toValue: -50, duration: 250, useNativeDriver: nativeDriver }),
    ]).start(() => setToast(null));
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const getBackgroundColor = (type?: ToastType) => {
    switch (type) {
      case 'success': return '#10b981'; // emerald-500
      case 'error': return '#ef4444'; // red-500
      case 'warning': return '#f59e0b'; // amber-500
      case 'info':
      default: return '#00877f'; // Wimera teal
    }
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toast && (
        <Animated.View
          style={[
            styles.toastContainer,
            { backgroundColor: getBackgroundColor(toast.type) },
            {
              opacity: fadeAnim,
              transform: Platform.OS === 'web'
                ? [{ translateX: -150 }, { translateY: slideAnim }]
                : [{ translateY: slideAnim }],
            },
          ]}
        >
          {toast.title && <Text style={styles.title}>{toast.title}</Text>}
          <Text style={styles.message}>{toast.message}</Text>
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
}

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider');
  return context;
};

const styles = StyleSheet.create({
  toastContainer: {
    position: 'absolute',
    top: Platform.OS === 'web' ? 24 : 60,
    zIndex: 9999,
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      web: {
        left: '50%',
        width: 'auto',
        minWidth: 300,
        maxWidth: 500,
      },
      default: {
        left: '5%',
        right: '5%',
        width: '90%',
      }
    }),
  } as any,
  title: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
    marginBottom: 4,
    textAlign: 'center',
  },
  message: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
});
