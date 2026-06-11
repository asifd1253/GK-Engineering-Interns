import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  FlatList,
  StyleSheet,
  Pressable,
  TextInput,
  Dimensions,
  Platform
} from 'react-native';

interface SelectProps {
  label?: string;
  value?: string;
  options: { label: string; value: string }[];
  onSelect?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  inline?: boolean;
  multiple?: boolean;
  valueArray?: string[];
  onSelectMultiple?: (values: string[]) => void;
}

export function Select({ label, value, options, onSelect, placeholder = 'Select an option', disabled = false, inline = false, multiple = false, valueArray = [], onSelectMultiple }: SelectProps) {
  const [visible, setVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [dropdownLayout, setDropdownLayout] = useState({ top: 0, left: 0, width: 0, maxHeight: 300, openUpward: false });
  const triggerRef = useRef<any>(null);
  const dropdownRef = useRef<any>(null);

  const selectedOption = options.find(o => o.value === value);

  const filteredOptions = (options || []).filter(o =>
    (o.label || '').toLowerCase().includes((searchQuery || '').toLowerCase()) ||
    (o.value || '').toLowerCase().includes((searchQuery || '').toLowerCase())
  );

  // Close dropdown when the page scrolls (stale position), but not when the
  // dropdown's own FlatList scrolls — otherwise items beyond 6 can't be reached.
  useEffect(() => {
    if (!visible || Platform.OS !== 'web') return;
    const close = (e: Event) => {
      const target = e.target as Node;
      if (dropdownRef.current && dropdownRef.current.contains && dropdownRef.current.contains(target)) return;
      setVisible(false);
    };
    window.addEventListener('scroll', close, true);
    return () => window.removeEventListener('scroll', close, true);
  }, [visible]);

  const computeLayout = () => {
    if (Platform.OS === 'web') {
      try {
        const node = triggerRef.current as any;
        if (node && node.getBoundingClientRect) {
          const rect = node.getBoundingClientRect();
          const DROPDOWN_MAX = 300;
          const MARGIN = 8;
          const spaceBelow = window.innerHeight - rect.bottom - MARGIN;
          const spaceAbove = rect.top - MARGIN;

          const openUpward = spaceBelow < 160 && spaceAbove > spaceBelow;
          const maxHeight = openUpward
            ? Math.min(DROPDOWN_MAX, Math.max(100, spaceAbove))
            : Math.min(DROPDOWN_MAX, Math.max(100, spaceBelow));
          const top = openUpward
            ? Math.max(MARGIN, rect.top - maxHeight - 2)
            : rect.bottom + 2;

          return { top, left: rect.left, width: rect.width, maxHeight, openUpward };
        }
      } catch (e) {}
    }
    return null;
  };

  const handleOpen = () => {
    if (disabled) return;
    if (inline) {
      setVisible(!visible);
      return;
    }
    if (visible) {
      setVisible(false);
      return;
    }

    if (Platform.OS === 'web') {
      const layout = computeLayout();
      if (layout) {
        setDropdownLayout(layout);
        setSearchQuery('');
        setVisible(true);
        return;
      }
    }

    triggerRef.current?.measureInWindow((x: number, y: number, width: number, height: number) => {
      const windowHeight = Dimensions.get('window').height;
      const DROPDOWN_MAX = 300;
      const MARGIN = 8;
      const spaceBelow = windowHeight - (y + height) - MARGIN;
      const spaceAbove = y - MARGIN;

      const openUpward = spaceBelow < 160 && spaceAbove > spaceBelow;
      const maxHeight = openUpward
        ? Math.min(DROPDOWN_MAX, Math.max(100, spaceAbove))
        : Math.min(DROPDOWN_MAX, Math.max(100, spaceBelow));
      const top = openUpward ? Math.max(MARGIN, y - maxHeight - 2) : y + height + 2;

      setDropdownLayout({ top, left: x, width, maxHeight, openUpward });
      setSearchQuery('');
      setVisible(true);
    });
  };

  const renderOptions = () => (
    <View style={{ flex: 1 }}>
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholderTextColor="#7a9692"
          autoFocus={Platform.OS === 'web'}
        />
      </View>
      <FlatList
        data={filteredOptions}
        keyExtractor={(item) => item.value}
        scrollEnabled={true}
        keyboardShouldPersistTaps="handled"
        style={{ maxHeight: 250 }}
        ListEmptyComponent={<Text style={{ padding: 16, color: '#7a9692', textAlign: 'center' }}>No options found</Text>}
        renderItem={({ item }) => {
          const isSelected = multiple ? valueArray.includes(item.value) : item.value === value;
          return (
            <TouchableOpacity
              style={[styles.option, isSelected && styles.optionSelected, inline && styles.optionInline]}
              onPress={() => {
                if (multiple) {
                  const newValues = isSelected 
                    ? valueArray.filter(v => v !== item.value)
                    : [...valueArray, item.value];
                  onSelectMultiple?.(newValues);
                } else {
                  onSelect?.(item.value);
                  setVisible(false);
                }
              }}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={[styles.optionText, isSelected && styles.optionTextSelected]}>
                  {item.label}
                </Text>
                {multiple && isSelected && <Text style={styles.checkMark}>✓</Text>}
              </View>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );

  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}
      <TouchableOpacity
        ref={triggerRef}
        style={[styles.trigger, disabled && styles.disabled, inline && visible && styles.triggerActive]}
        onPress={handleOpen}
        activeOpacity={0.7}
      >
        <Text style={[styles.triggerText, !selectedOption && (!valueArray || valueArray.length === 0) && styles.placeholder]} numberOfLines={1}>
          {multiple 
            ? (valueArray.length > 0 ? `${valueArray.length} Selected (${options.filter(o => valueArray.includes(o.value)).map(o => o.label).join(', ')})` : placeholder)
            : (selectedOption ? selectedOption.label : placeholder)
          }
        </Text>
        <Text style={styles.arrow}>{visible ? '▲' : '▼'}</Text>
      </TouchableOpacity>

      {inline && visible && (
        <View style={styles.inlineList}>
          {renderOptions()}
        </View>
      )}

      {!inline && (
        <Modal
          visible={visible}
          transparent
          animationType="none"
          onRequestClose={() => setVisible(false)}
        >
          <Pressable style={styles.overlay} onPress={() => setVisible(false)}>
            <View ref={dropdownRef} style={[styles.dropdownContent, { top: dropdownLayout.top, left: dropdownLayout.left, width: dropdownLayout.width, maxHeight: dropdownLayout.maxHeight }]}>
              {renderOptions()}
            </View>
          </Pressable>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', gap: 4 },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 2,
  },
  trigger: {
    height: 44,
    borderWidth: 1,
    borderColor: '#c8dbd8',
    borderRadius: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f7fbfa',
  },
  disabled: { backgroundColor: '#edf5f4', borderColor: '#d7e6e4' },
  triggerText: { fontSize: 14, color: '#083d3a' },
  placeholder: { color: '#7a9692' },
  arrow: { fontSize: 10, color: '#5b7773' },
  triggerActive: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0, borderColor: '#00877f', backgroundColor: '#ffffff' },
  inlineList: {
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: '#00877f',
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    backgroundColor: '#fff',
  },
  optionInline: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  overlay: {
    flex: 1,
  },
  dropdownContent: {
    position: 'absolute',
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d7e6e4',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
    overflow: 'hidden',
    zIndex: 2000,
    boxShadow: '0px 18px 40px rgba(8, 61, 58, 0.16)' as any,
  },
  searchContainer: {
    padding: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#edf5f4',
    backgroundColor: '#f7fbfa',
  },
  searchInput: {
    height: 40,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#c8dbd8',
    borderRadius: 10,
    paddingHorizontal: 10,
    color: '#183f3c',
  },
  option: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f7fbfa',
  },
  optionSelected: { backgroundColor: '#e8f8f6' },
  optionText: { fontSize: 14, color: '#486966' },
  optionTextSelected: { color: '#00877f', fontWeight: '600' },
  checkMark: { color: '#00877f', fontWeight: '900' },
});
