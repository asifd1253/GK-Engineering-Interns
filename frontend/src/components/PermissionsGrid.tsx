import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Platform } from 'react-native';
import { RolePermissions } from '../types';

export interface ModuleDef {
  key: string;
  label: string;
  actions: string[];
}

interface PermissionsGridProps {
  permissions: Partial<RolePermissions> | Record<string, any>;
  moduleDefs: ModuleDef[];
  onChange: (permissions: RolePermissions) => void;
  title?: string;
  subtitle?: string;
  readOnly?: boolean;
  disabledActions?: Record<string, string[]>;
}

const CATEGORIES = [
  { label: 'All', key: 'all' },
  { label: 'Operations', key: 'ops', modules: ['dashboard', 'analytics', 'reports'] },
  { label: 'Supply Chain', key: 'supply', modules: ['inventory', 'schedules'] },
  { label: 'Production', key: 'prod', modules: ['workorders', 'pipeline', 'quality'] },
  { label: 'System', key: 'system', modules: ['configuration', 'clients'] },
];

function resolvePerms(raw: any, actions: string[]): string[] {
  if (typeof raw === 'boolean') return raw ? [...actions] : [];
  if (Array.isArray(raw)) return raw;
  return [];
}

export function PermissionsGrid({ permissions, moduleDefs, onChange, title, subtitle, readOnly, disabledActions = {} }: PermissionsGridProps) {
  const [activeCategory, setActiveCategory] = useState('all');
  const perms = permissions as Record<string, any>;
  const isActionDisabled = (mod: string, action: string) => disabledActions[mod]?.includes(action) ?? false;

  const handleToggle = (mod: string, action: string) => {
    if (readOnly || isActionDisabled(mod, action)) return;
    const modDef = moduleDefs.find(m => m.key === mod);
    const current = resolvePerms(perms[mod], modDef?.actions ?? []);
    const next = current.includes(action)
      ? current.filter((a: string) => a !== action)
      : [...current, action];
    onChange({ ...permissions, [mod]: next } as RolePermissions);
  };

  const handleToggleModule = (mod: string, all: boolean) => {
    if (readOnly) return;
    const modDef = moduleDefs.find(m => m.key === mod);
    const enabledActions = (modDef?.actions ?? []).filter(action => !isActionDisabled(mod, action));
    onChange({ ...permissions, [mod]: all && modDef ? enabledActions : [] } as RolePermissions);
  };

  const filteredModules = moduleDefs.filter(mod => {
    if (activeCategory === 'all') return true;
    const cat = CATEGORIES.find(c => c.key === activeCategory);
    return cat?.modules?.includes(mod.key);
  });

  return (
    <View style={[styles.container, readOnly && styles.containerReadOnly]}>
      <View style={styles.headerSection}>
        <View style={{ flex: 1 }}>
          {title && <Text style={styles.title}>{title}</Text>}
          {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
        </View>
        {readOnly && (
          <View style={styles.readOnlyBadge}>
            <Text style={styles.readOnlyBadgeText}>Read-only</Text>
          </View>
        )}
      </View>

      <View style={styles.tabContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabScroll}>
          {CATEGORIES.map(cat => (
            <TouchableOpacity
              key={cat.key}
              style={[styles.tab, activeCategory === cat.key && styles.tabActive]}
              onPress={() => setActiveCategory(cat.key)}
            >
              <Text style={[styles.tabText, activeCategory === cat.key && styles.tabTextActive]}>{cat.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <View style={styles.gridBody}>
        {filteredModules.map((mod, idx) => {
          const currentPerms = resolvePerms(perms[mod.key], mod.actions);
          const enabledActions = mod.actions.filter(action => !isActionDisabled(mod.key, action));
          const isFull = enabledActions.length > 0 && enabledActions.every(action => currentPerms.includes(action));

          return (
            <View key={mod.key} style={[styles.moduleRow, idx === filteredModules.length - 1 && { borderBottomWidth: 0 }]}>
              <View style={styles.moduleHeader}>
                <View style={styles.moduleInfo}>
                  <Text style={styles.moduleLabel}>{mod.label}</Text>
                  <Text style={styles.moduleKey}>{mod.key}</Text>
                </View>
                {!readOnly && (
                  <View style={styles.moduleQuickActions}>
                    <TouchableOpacity
                      style={[styles.quickBtn, isFull && styles.quickBtnActive]}
                      onPress={() => handleToggleModule(mod.key, !isFull)}
                    >
                      <Text style={[styles.quickBtnText, isFull && styles.quickBtnTextActive]}>
                        {isFull ? 'Clear All' : 'Select All'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              <View style={styles.actionsContainer}>
                {mod.actions.map(action => {
                  const disabled = isActionDisabled(mod.key, action);
                  const active = !disabled && currentPerms.includes(action);
                  const isView = action.toLowerCase().includes('view');
                  const isDelete = action.toLowerCase().includes('delete');

                  if (readOnly) {
                    return (
                      <View
                        key={action}
                        style={[
                          styles.actionChip,
                          active && styles.actionChipActive,
                          active && isView && styles.viewChipActive,
                          active && isDelete && styles.deleteChipActive,
                          !active && styles.actionChipDisabled,
                        ]}
                      >
                        <View style={[styles.indicator, active && styles.indicatorActive, !active && styles.indicatorDisabled]} />
                        <Text style={[styles.actionText, active && styles.actionTextActive, !active && styles.actionTextDisabled]}>
                          {action.replace('_', ' ')}
                        </Text>
                      </View>
                    );
                  }

                  return (
                    <TouchableOpacity
                      key={action}
                      style={[
                        styles.actionChip,
                        active && styles.actionChipActive,
                        active && isView && styles.viewChipActive,
                        active && isDelete && styles.deleteChipActive,
                        disabled && styles.actionChipDisabled,
                      ]}
                      disabled={disabled}
                      onPress={() => handleToggle(mod.key, action)}
                    >
                      <View style={[styles.indicator, active && styles.indicatorActive, disabled && styles.indicatorDisabled]} />
                      <Text style={[styles.actionText, active && styles.actionTextActive, disabled && styles.actionTextDisabled]}>
                        {action.replace('_', ' ')}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          );
        })}
        {filteredModules.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No modules in this category</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 20,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#edf5f4',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 12,
      },
      android: {
        elevation: 4,
      },
      web: {
        boxShadow: '0 16px 36px rgba(8, 61, 58, 0.08)',
      }
    }),
    overflow: 'hidden',
  },
  headerSection: {
    padding: 20,
    backgroundColor: '#f7fbfa',
    borderBottomWidth: 1,
    borderBottomColor: '#edf5f4',
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#083d3a',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 13,
    color: '#5b7773',
    marginTop: 4,
  },
  tabContainer: {
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#edf5f4',
  },
  tabScroll: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    marginRight: 8,
    backgroundColor: '#f7fbfa',
    borderWidth: 1,
    borderColor: '#d7e6e4',
  },
  tabActive: {
    backgroundColor: '#00877f',
    borderColor: '#00877f',
    boxShadow: '0px 8px 18px rgba(0, 135, 127, 0.18)',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#5b7773',
  },
  tabTextActive: {
    color: '#ffffff',
  },
  gridBody: {
    padding: 4,
  },
  moduleRow: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f7fbfa',
  },
  moduleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  moduleInfo: {
    flex: 1,
  },
  moduleLabel: {
    fontSize: 15,
    fontWeight: '900',
    color: '#315451',
  },
  moduleKey: {
    fontSize: 10,
    color: '#7a9692',
    textTransform: 'uppercase',
    marginTop: 2,
    fontWeight: '600',
  },
  moduleQuickActions: {
    flexDirection: 'row',
  },
  quickBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#edf5f4',
  },
  quickBtnActive: {
    backgroundColor: '#fee2e2',
  },
  quickBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#486966',
  },
  quickBtnTextActive: {
    color: '#ef4444',
  },
  actionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  actionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d7e6e4',
  },
  actionChipActive: {
    backgroundColor: '#e8f8f6',
    borderColor: '#a9e4df',
  },
  viewChipActive: {
    backgroundColor: '#f0fdf4',
    borderColor: '#bbf7d0',
  },
  deleteChipActive: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
  },
  indicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#c8dbd8',
    marginRight: 8,
  },
  indicatorActive: {
    backgroundColor: '#00877f',
  },
  actionText: {
    fontSize: 12,
    color: '#486966',
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  actionTextActive: {
    color: '#006b65',
    fontWeight: '700',
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    color: '#7a9692',
    fontSize: 14,
  },
  containerReadOnly: {
    borderColor: '#d7e6e4',
    backgroundColor: '#f7fbfa',
  },
  readOnlyBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: '#edf5f4',
    borderWidth: 1,
    borderColor: '#d7e6e4',
    alignSelf: 'flex-start',
  },
  readOnlyBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#7a9692',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  actionChipDisabled: {
    backgroundColor: '#f7fbfa',
    borderColor: '#edf5f4',
    opacity: 0.6,
  },
  indicatorDisabled: {
    backgroundColor: '#d7e6e4',
  },
  actionTextDisabled: {
    color: '#7a9692',
  },
});

