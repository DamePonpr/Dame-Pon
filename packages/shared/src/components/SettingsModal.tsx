import React from 'react';
import { Feather } from '@expo/vector-icons';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useThemePreference, type ThemePreference } from '@/context/ThemeContext';

const options: Array<{ value: ThemePreference; label: string; description: string; icon: keyof typeof Feather.glyphMap }> = [
  { value: 'system', label: 'Automático', description: 'Sigue la apariencia de tu dispositivo', icon: 'smartphone' },
  { value: 'light', label: 'Claro', description: 'Usa el tema claro siempre', icon: 'sun' },
  { value: 'dark', label: 'Oscuro', description: 'Reduce el brillo por la noche', icon: 'moon' },
];

export function SettingsModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { preference, setPreference } = useThemePreference();

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.screen, { backgroundColor: colors.background, paddingBottom: insets.bottom }]}>
        <View style={[styles.header, { paddingTop: insets.top + 12, borderBottomColor: colors.border }]}>
          <View>
            <Text style={[styles.title, { color: colors.foreground }]}>Configuración</Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Personaliza cómo ves Dame Pon.</Text>
          </View>
          <Pressable
            accessibilityLabel="Cerrar configuración"
            onPress={onClose}
            style={({ pressed }) => [styles.closeButton, { backgroundColor: colors.secondary }, pressed && { opacity: 0.7 }]}
          >
            <Feather name="x" size={21} color={colors.primary} />
          </Pressable>
        </View>

        <View style={styles.content}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>APARIENCIA</Text>
          <View style={[styles.optionsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {options.map((option, index) => {
              const selected = preference === option.value;
              return (
                <Pressable
                  key={option.value}
                  testID={`theme-option-${option.value}`}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => void setPreference(option.value)}
                  style={({ pressed }) => [
                    styles.option,
                    index > 0 && { borderTopWidth: 1, borderTopColor: colors.border },
                    pressed && { opacity: 0.78 },
                  ]}
                >
                  <View style={[styles.optionIcon, { backgroundColor: selected ? colors.secondary : colors.muted }]}>
                    <Feather name={option.icon} size={18} color={colors.primary} />
                  </View>
                  <View style={styles.optionCopy}>
                    <Text style={[styles.optionLabel, { color: colors.foreground }]}>{option.label}</Text>
                    <Text style={[styles.optionDescription, { color: colors.mutedForeground }]}>{option.description}</Text>
                  </View>
                  <Feather name={selected ? 'check-circle' : 'circle'} size={21} color={selected ? colors.primary : colors.mutedForeground} />
                </Pressable>
              );
            })}
          </View>
          <Text style={[styles.helper, { color: colors.mutedForeground }]}>
            La selección se guarda automáticamente y se mantiene cuando vuelvas a abrir la app.
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { paddingHorizontal: 22, paddingBottom: 16, borderBottomWidth: 1, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  title: { fontFamily: 'Inter_700Bold', fontSize: 28, letterSpacing: -0.7 },
  subtitle: { fontFamily: 'Inter_400Regular', fontSize: 14, marginTop: 5 },
  closeButton: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 22, gap: 13 },
  sectionLabel: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.2 },
  optionsCard: { borderWidth: 1, borderRadius: 20, overflow: 'hidden' },
  option: { minHeight: 76, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', gap: 12 },
  optionIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  optionCopy: { flex: 1, gap: 3 },
  optionLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  optionDescription: { fontFamily: 'Inter_400Regular', fontSize: 12 },
  helper: { fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18, paddingHorizontal: 4 },
});