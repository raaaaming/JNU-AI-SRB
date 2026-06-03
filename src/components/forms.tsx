/**
 * Reusable native form building blocks for the booking screen.
 */
import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Modal,
  FlatList,
  Pressable,
  type TextInputProps,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  Colors,
  Typography,
  Spacing,
  BorderRadius,
} from '../constants/theme';

// ── Labeled section wrapper ────────────────────────────────────────────────

export function Field({
  label,
  required,
  children,
  hint,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <View style={styles.field}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        {required ? <Text style={styles.required}>*</Text> : null}
      </View>
      {children}
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

// ── Text input ──────────────────────────────────────────────────────────────

export function TextField(props: TextInputProps) {
  return (
    <TextInput
      placeholderTextColor={Colors.textDisabled}
      {...props}
      style={[styles.input, props.style]}
    />
  );
}

// ── Stepper (number control) ─────────────────────────────────────────────────

export function Stepper({
  value,
  min,
  max,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  const dec = () => onChange(Math.max(min, value - 1));
  const inc = () => onChange(Math.min(max, value + 1));
  return (
    <View style={styles.stepper}>
      <TouchableOpacity
        style={[styles.stepperBtn, value <= min && styles.stepperBtnDisabled]}
        onPress={dec}
        disabled={value <= min}
        accessibilityLabel="감소"
      >
        <Ionicons name="remove" size={20} color={value <= min ? Colors.textDisabled : Colors.primary} />
      </TouchableOpacity>
      <Text style={styles.stepperValue}>{value}</Text>
      <TouchableOpacity
        style={[styles.stepperBtn, value >= max && styles.stepperBtnDisabled]}
        onPress={inc}
        disabled={value >= max}
        accessibilityLabel="증가"
      >
        <Ionicons name="add" size={20} color={value >= max ? Colors.textDisabled : Colors.primary} />
      </TouchableOpacity>
    </View>
  );
}

// ── Select field (opens a modal list) ────────────────────────────────────────

export interface SelectItem {
  label: string;
  value: string;
}

export function SelectField({
  value,
  items,
  placeholder = '선택하세요',
  onSelect,
}: {
  value?: string;
  items: SelectItem[];
  placeholder?: string;
  onSelect: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = items.find((i) => i.value === value);

  return (
    <>
      <TouchableOpacity
        style={styles.select}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
      >
        <Text style={[styles.selectText, !selected && styles.selectPlaceholder]}>
          {selected ? selected.label : placeholder}
        </Text>
        <Ionicons name="chevron-down" size={18} color={Colors.textSecondary} />
      </TouchableOpacity>

      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHandle} />
            <FlatList
              data={items}
              keyExtractor={(i) => i.value}
              renderItem={({ item }) => {
                const isSelected = item.value === value;
                return (
                  <TouchableOpacity
                    style={styles.modalItem}
                    onPress={() => {
                      onSelect(item.value);
                      setOpen(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.modalItemText,
                        isSelected && styles.modalItemTextSelected,
                      ]}
                    >
                      {item.label}
                    </Text>
                    {isSelected ? (
                      <Ionicons name="checkmark" size={20} color={Colors.primary} />
                    ) : null}
                  </TouchableOpacity>
                );
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  field: {
    marginBottom: Spacing.lg,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  label: {
    fontSize: Typography.fontSizeMd,
    fontWeight: Typography.fontWeightSemibold,
    color: Colors.textPrimary,
  },
  required: {
    color: Colors.error,
    marginLeft: 2,
    fontSize: Typography.fontSizeMd,
  },
  hint: {
    marginTop: Spacing.xs,
    fontSize: Typography.fontSizeXs,
    color: Colors.textSecondary,
  },

  input: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    fontSize: Typography.fontSizeMd,
    color: Colors.textPrimary,
    minHeight: 48,
  },

  // Stepper
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
  },
  stepperBtn: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperBtnDisabled: {
    backgroundColor: Colors.surfaceVariant,
  },
  stepperValue: {
    minWidth: 48,
    textAlign: 'center',
    fontSize: Typography.fontSizeLg,
    fontWeight: Typography.fontWeightSemibold,
    color: Colors.textPrimary,
  },

  // Select
  select: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    minHeight: 48,
  },
  selectText: {
    fontSize: Typography.fontSizeMd,
    color: Colors.textPrimary,
  },
  selectPlaceholder: {
    color: Colors.textDisabled,
  },

  // Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    paddingBottom: Spacing.xxl,
    maxHeight: '60%',
  },
  modalHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    marginVertical: Spacing.md,
  },
  modalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  modalItemText: {
    fontSize: Typography.fontSizeMd,
    color: Colors.textPrimary,
  },
  modalItemTextSelected: {
    color: Colors.primary,
    fontWeight: Typography.fontWeightSemibold,
  },
});
