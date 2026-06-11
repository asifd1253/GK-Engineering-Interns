import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
} from 'react-native';

export interface Column<T> {
  key: keyof T | string;
  header: string;
  width?: number;
  minWidth?: number;
  render?: (item: T) => React.ReactNode;
  searchable?: boolean;
  align?: 'left' | 'center' | 'right';
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  keyExtractor: (item: T) => string;
  emptyMessage?: string;
  defaultPageSize?: number;
  rowStyle?: (item: T) => any;
}

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export function DataTable<T>({
  data,
  columns,
  keyExtractor,
  emptyMessage = 'No records found.',
  defaultPageSize = 10,
  rowStyle,
}: DataTableProps<T>) {
  const [search, setSearch] = useState('');
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const [page, setPage] = useState(1);
  const [showSizeMenu, setShowSizeMenu] = useState(false);

  // Filter data by search
  const filtered = useMemo(() => {
    if (!search.trim()) return data;
    const q = search.toLowerCase();
    return data.filter((item) =>
      columns
        .filter((c) => c.searchable !== false)
        .some((c) => {
          const val = (item as any)[c.key];
          return val != null && String(val).toLowerCase().includes(q);
        })
    );
  }, [data, search, columns]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const startIdx = (safePage - 1) * pageSize;
  const pageData = filtered.slice(startIdx, startIdx + pageSize);

  const goTo = (p: number) => setPage(Math.max(1, Math.min(p, totalPages)));

  const handleSearchChange = (text: string) => {
    setSearch(text);
    setPage(1);
  };

  const handleSizeChange = (size: number) => {
    setPageSize(size);
    setPage(1);
    setShowSizeMenu(false);
  };

  const renderPageNumbers = () => {
    const pages: number[] = [];
    const maxButtons = 5;
    let start = Math.max(1, safePage - 2);
    let end = Math.min(totalPages, start + maxButtons - 1);
    if (end - start < maxButtons - 1) start = Math.max(1, end - maxButtons + 1);
    for (let i = start; i <= end; i++) pages.push(i);

    return pages.map((p) => (
      <TouchableOpacity
        key={p}
        style={[styles.pageBtn, p === safePage && styles.pageBtnActive]}
        onPress={() => goTo(p)}
      >
        <Text style={[styles.pageBtnText, p === safePage && styles.pageBtnTextActive]}>{p}</Text>
      </TouchableOpacity>
    ));
  };

  const rangeStart = filtered.length === 0 ? 0 : startIdx + 1;
  const rangeEnd = Math.min(startIdx + pageSize, filtered.length);

  return (
    <View style={styles.container}>
      {/* Toolbar */}
      <View style={styles.toolbar}>
        {/* Show N entries */}
        <View style={styles.sizeRow}>
          <Text style={styles.toolbarLabel}>Show</Text>
          <TouchableOpacity
            style={styles.sizeDropdown}
            onPress={() => setShowSizeMenu(!showSizeMenu)}
            activeOpacity={0.8}
          >
            <Text style={styles.sizeDropdownText}>{pageSize}</Text>
            <Text style={styles.sizeDropdownCaret}>▾</Text>
          </TouchableOpacity>
          <Text style={styles.toolbarLabel}>entries</Text>
          {showSizeMenu && (
            <View style={styles.sizeMenu}>
              {PAGE_SIZE_OPTIONS.map((s) => (
                <TouchableOpacity
                  key={s}
                  style={[styles.sizeMenuItem, s === pageSize && styles.sizeMenuItemActive]}
                  onPress={() => handleSizeChange(s)}
                >
                  <Text
                    style={[styles.sizeMenuItemText, s === pageSize && styles.sizeMenuItemTextActive]}
                  >
                    {s}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Search */}
        <View style={styles.searchRow}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search..."
            placeholderTextColor="#7a9692"
            value={search}
            onChangeText={handleSearchChange}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => handleSearchChange('')} style={styles.clearBtn}>
              <Text style={styles.clearBtnText}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.recordPill}>
          <Text style={styles.recordPillValue}>{filtered.length}</Text>
          <Text style={styles.recordPillLabel}>records</Text>
        </View>
      </View>

      {/* Table — both web and native use a horizontal ScrollView to avoid clipping */}
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={Platform.OS === 'web'}
        contentContainerStyle={{ minWidth: '100%' }}
      >
        <View style={{ minWidth: '100%' }}>
          {/* Header Row */}
          <View style={styles.headerRow}>
            {columns.map((col) => (
              <View
                key={String(col.key)}
                style={[
                  styles.headerCell,
                  col.width ? { width: col.width } : (col.minWidth ? { minWidth: col.minWidth, flex: 1 } : { flex: 1, minWidth: 100 }),
                  { alignItems: col.align === 'center' ? 'center' : col.align === 'right' ? 'flex-end' : 'flex-start' }
                ]}
              >
                <Text style={[styles.headerText, { textAlign: col.align || 'left' }]}>{col.header}</Text>
              </View>
            ))}
          </View>

          {/* Data Rows */}
          {pageData.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>{emptyMessage}</Text>
            </View>
          ) : (
            pageData.map((item, rowIdx) => (
              <View
                key={keyExtractor(item)}
                style={[
                  styles.dataRow, 
                  rowIdx % 2 === 1 && styles.dataRowAlt,
                  rowStyle ? rowStyle(item) : {}
                ]}
              >
                {columns.map((col) => (
                  <View
                    key={String(col.key)}
                    style={[
                      styles.dataCell,
                      col.width ? { width: col.width } : (col.minWidth ? { minWidth: col.minWidth, flex: 1 } : { flex: 1, minWidth: 100 }),
                      { alignItems: col.align === 'center' ? 'center' : col.align === 'right' ? 'flex-end' : 'flex-start' }
                    ]}
                  >
                    {col.render ? (
                      col.render(item)
                    ) : (
                      <Text 
                        style={[styles.dataCellText, { textAlign: col.align || 'left' }]} 
                        numberOfLines={2}
                      >
                        {String((item as any)[col.key] ?? '—')}
                      </Text>
                    )}
                  </View>
                ))}
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerInfo}>
          {filtered.length === 0
            ? 'No entries'
            : `Showing ${rangeStart}–${rangeEnd} of ${filtered.length} entries${
                data.length !== filtered.length ? ` (filtered from ${data.length} total)` : ''
              }`}
        </Text>
        <View style={styles.pagination}>
          <TouchableOpacity
            style={[styles.pageBtn, safePage === 1 && styles.pageBtnDisabled]}
            onPress={() => goTo(safePage - 1)}
            disabled={safePage === 1}
          >
            <Text style={styles.pageBtnText}>‹ Prev</Text>
          </TouchableOpacity>
          {renderPageNumbers()}
          <TouchableOpacity
            style={[styles.pageBtn, safePage === totalPages && styles.pageBtnDisabled]}
            onPress={() => goTo(safePage + 1)}
            disabled={safePage === totalPages}
          >
            <Text style={styles.pageBtnText}>Next ›</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#d7e6e4',
    overflow: Platform.OS === 'web' ? 'visible' : 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#183f3c',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
      },
      android: {
        elevation: 6,
      },
      web: {
        boxShadow: '0 14px 34px rgba(8, 61, 58, 0.08)',
      }
    }),
    width: '100%',
  },
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#edf5f4',
    flexWrap: 'wrap',
    backgroundColor: '#f7fbfa',
    gap: 12,
    zIndex: 100,
  },
  toolbarLabel: {
    fontSize: 13,
    color: '#5b7773',
    fontWeight: '600',
    marginHorizontal: 4,
  },
  sizeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
    zIndex: 20,
  },
  sizeDropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d7e6e4',
    borderRadius: 9,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: '#ffffff',
  },
  sizeDropdownText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#083d3a',
    marginRight: 4,
  },
  sizeDropdownCaret: {
    fontSize: 11,
    color: '#5b7773',
  },
  sizeMenu: {
    position: 'absolute',
    top: 38,
    left: 40,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d7e6e4',
    zIndex: 1000,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
      },
      android: {
        elevation: 10,
      },
      web: {
        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
      }
    }),
  },
  sizeMenuItem: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    minWidth: 80,
  },
  sizeMenuItemActive: {
    backgroundColor: '#e8f8f6',
  },
  sizeMenuItemText: {
    fontSize: 13,
    color: '#486966',
  },
  sizeMenuItemTextActive: {
    color: '#00877f',
    fontWeight: '700',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d7e6e4',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#ffffff',
    minWidth: 240,
    flex: 1,
    maxWidth: 400,
  },
  searchIcon: {
    fontSize: 14,
    marginRight: 8,
    opacity: 0.6,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#083d3a',
    fontWeight: '500',
    ...Platform.select({
      web: { outlineStyle: 'none' } as any,
    }),
  },
  clearBtn: {
    padding: 4,
    backgroundColor: '#d7e6e4',
    borderRadius: 10,
    marginLeft: 4,
  },
  clearBtnText: {
    fontSize: 10,
    color: '#5b7773',
    fontWeight: 'bold',
  },
  recordPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    backgroundColor: '#e8f8f6',
    borderWidth: 1,
    borderColor: '#a9e4df',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  recordPillValue: {
    color: '#00877f',
    fontSize: 13,
    fontWeight: '900',
  },
  recordPillLabel: {
    color: '#486966',
    fontSize: 12,
    fontWeight: '800',
  },
  headerRow: {
    flexDirection: 'row',
    backgroundColor: '#083d3a',
    paddingVertical: 12,
    minWidth: '100%',
  },
  headerCell: {
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  headerText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#f7fbfa',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  dataRow: {
    flexDirection: 'row',
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: '#edf5f4',
    alignItems: 'center',
    minWidth: '100%',
    backgroundColor: '#ffffff',
  },
  dataRowAlt: {
    backgroundColor: '#f7fbfa',
  },
  dataCell: {
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  dataCellText: {
    fontSize: 13,
    color: '#315451',
    fontWeight: '500',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    backgroundColor: '#ffffff',
    minWidth: '100%',
  },
  emptyText: {
    fontSize: 14,
    color: '#7a9692',
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#edf5f4',
    backgroundColor: '#ffffff',
    flexWrap: 'wrap',
    gap: 12,
  },
  footerInfo: {
    fontSize: 12,
    color: '#5b7773',
    fontWeight: '600',
  },
  pagination: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  pageBtn: {
    borderWidth: 1,
    borderColor: '#d7e6e4',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#ffffff',
  },
  pageBtnActive: {
    backgroundColor: '#00877f',
    borderColor: '#00877f',
  },
  pageBtnDisabled: {
    opacity: 0.4,
    backgroundColor: '#edf5f4',
  },
  pageBtnText: {
    fontSize: 12,
    color: '#486966',
    fontWeight: '700',
  },
  pageBtnTextActive: {
    color: '#ffffff',
  },
});
