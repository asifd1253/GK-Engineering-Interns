import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  actionIcon?: string;
  onAction?: () => void;
  actionCancel?: boolean;
}

export function PageHeader({
  title,
  subtitle,
  actionLabel,
  actionIcon,
  onAction,
  actionCancel = false,
}: PageHeaderProps) {
  return (
    <View style={styles.container}>
      <View style={styles.accentBar} />
      <View style={styles.textGroup}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {actionLabel && onAction && (
        <TouchableOpacity
          style={[styles.button, actionCancel && styles.buttonCancel]}
          onPress={onAction}
          activeOpacity={0.8}
        >
          {actionIcon ? <Text style={styles.buttonIcon}>{actionIcon}</Text> : null}
          <Text style={[styles.buttonLabel, actionCancel && styles.buttonLabelCancel]}>
            {actionLabel}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 18,
    paddingLeft: 22,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#d7e6e4',
    boxShadow: '0px 12px 30px rgba(8, 61, 58, 0.08)',
    elevation: 3,
    flexWrap: 'wrap',
    gap: 12,
    position: 'relative',
    overflow: 'hidden',
  },
  accentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 5,
    backgroundColor: '#00877f',
  },
  textGroup: {
    flex: 1,
    minWidth: 200,
  },
  title: {
    fontSize: 21,
    fontWeight: '900',
    color: '#083d3a',
  },
  subtitle: {
    fontSize: 13,
    color: '#5b7773',
    marginTop: 4,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#00877f',
    borderRadius: 9,
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 6,
    boxShadow: '0px 8px 18px rgba(0, 135, 127, 0.22)',
  },
  buttonCancel: {
    backgroundColor: '#edf5f4',
    borderWidth: 1,
    borderColor: '#c8dbd8',
  },
  buttonIcon: {
    fontSize: 14,
    color: '#ffffff',
  },
  buttonLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
  },
  buttonLabelCancel: {
    color: '#486966',
  },
});
