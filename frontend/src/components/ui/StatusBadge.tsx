import React from 'react';
import { View, Text } from 'react-native';

type BadgeVariant =
  | 'not_started'
  | 'in_progress'
  | 'completed'
  | 'approved'
  | 'rejected'
  | 'rework'
  | 'good'
  | 'pending'
  | 'admin'
  | 'storekeeper'
  | 'pdc'
  | 'qi'
  | 'fqi';

interface StatusBadgeProps {
  variant: BadgeVariant | string;
  label?: string;
}

const BADGE_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  pending:      { bg: '#d9f3f0', text: '#006b65', label: 'Pending' },
  qi_submitted: { bg: '#fef3c7', text: '#92400e', label: 'QI Submitted' },
  not_started:  { bg: '#edf5f4', text: '#486966', label: 'Not Started' },
  in_progress:  { bg: '#fef3c7', text: '#92400e', label: 'In Progress' },
  completed:    { bg: '#d9f3f0', text: '#006b65', label: 'Completed' },
  approved:     { bg: '#d9f3f0', text: '#006b65', label: 'Approved' },
  rejected:     { bg: '#fee2e2', text: '#991b1b', label: 'Rejected' },
  rework:       { bg: '#fff7ed', text: '#9a3412', label: 'Rework' },
  good:         { bg: '#d9f3f0', text: '#006b65', label: 'Good' },
  pending_approval: { bg: '#fee2e2', text: '#991b1b', label: 'Pending Approval' },
  pdc_verified:     { bg: '#e8f8f6', text: '#006b65', label: 'Verified' },
};

export function StatusBadge({ variant, label }: StatusBadgeProps) {
  const normalizedVariant = (variant || '').toLowerCase();
  const style = BADGE_STYLES[normalizedVariant] ?? { bg: '#edf5f4', text: '#486966', label: variant };
  const displayLabel = label ?? style.label;

  return (
    <View
      style={{
        backgroundColor: style.bg,
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderWidth: 1,
        borderColor: `${style.text}22`,
      }}
    >
      <Text
        style={{
          color: style.text,
          fontSize: 11,
          fontWeight: '900',
          letterSpacing: 0.5,
          textTransform: 'uppercase',
        }}
      >
        {displayLabel}
      </Text>
    </View>
  );
}
