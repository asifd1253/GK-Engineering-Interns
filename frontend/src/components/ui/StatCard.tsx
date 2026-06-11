import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: string;
  iconBg: string;
  iconColor: string;
  trend?: { value: string; up: boolean };
  subtitle?: string;
}

export function StatCard({ label, value, icon, iconBg, iconColor, trend, subtitle }: StatCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={[styles.iconBox, { backgroundColor: iconBg }]}>
          <Text style={[styles.icon, { color: iconColor }]}>{icon}</Text>
        </View>
        {trend && (
          <View style={[styles.trendBadge, { backgroundColor: trend.up ? '#dcfce7' : '#fee2e2' }]}>
            <Text style={[styles.trendText, { color: trend.up ? '#16a34a' : '#dc2626' }]}>
              {trend.up ? '↑' : '↓'} {trend.value}
            </Text>
          </View>
        )}
      </View>
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
      {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#d7e6e4',
    boxShadow: '0px 12px 28px rgba(8, 61, 58, 0.08)',
    elevation: 3,
    flex: 1,
    minWidth: 160,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    fontSize: 20,
  },
  trendBadge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  trendText: {
    fontSize: 11,
    fontWeight: '700',
  },
  value: {
    fontSize: 26,
    fontWeight: '900',
    color: '#083d3a',
    marginBottom: 4,
  },
  label: {
    fontSize: 13,
    color: '#5b7773',
    fontWeight: '600',
  },
  subtitle: {
    fontSize: 11,
    color: '#7a9692',
    marginTop: 4,
  },
});
