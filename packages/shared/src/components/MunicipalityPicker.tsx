import { Feather } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ImageSourcePropType,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getMunicipalities } from '@/lib/rideService';
import type { Municipality } from '@/lib/municipality';
import { useColors } from '@/hooks/useColors';
import { typography } from '@/constants/designSystem';

interface MunicipalityPickerProps {
  value?: string | null;
  label?: string;
  placeholder?: string;
  icon?: ImageSourcePropType;
  compact?: boolean;
  municipalities?: Municipality[];
  onSelect: (municipality: Municipality) => void;
}

function normalize(value: string) {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

export function MunicipalityPicker({
  value,
  label,
  placeholder = 'Selecciona un municipio',
  icon,
  compact = false,
  municipalities: providedMunicipalities,
  onSelect,
}: MunicipalityPickerProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(false);
  const [query, setQuery] = useState('');
  const [municipalities, setMunicipalities] = useState<Municipality[]>(providedMunicipalities ?? []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setMunicipalities(providedMunicipalities ?? []);
  }, [providedMunicipalities]);

  useEffect(() => {
    if (!visible || providedMunicipalities) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    void getMunicipalities().then((result) => {
      if (cancelled) return;
      if (result.error) setError(result.error);
      setMunicipalities(result.data ?? []);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [providedMunicipalities, visible]);

  const filtered = useMemo(() => {
    const normalizedQuery = normalize(query.trim());
    if (!normalizedQuery) return municipalities;
    return municipalities.filter((municipality) => normalize(municipality.nombre).includes(normalizedQuery));
  }, [municipalities, query]);

  function open() {
    setQuery('');
    setVisible(true);
  }

  return (
    <>
      {label ? <Text style={[styles.label, { color: colors.foreground }]}>{label}</Text> : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label ?? 'Seleccionar municipio'}
        onPress={open}
        style={({ pressed }) => [
          compact ? styles.compactTrigger : styles.trigger,
          { backgroundColor: colors.card, borderColor: colors.border },
          pressed && { opacity: 0.78 },
        ]}
      >
        {icon ? <Image source={icon} tintColor={colors.primary} style={styles.icon} /> : <Feather name="map-pin" size={18} color={colors.primary} />}
        <Text style={[styles.value, { color: value ? colors.foreground : colors.mutedForeground }]} numberOfLines={1}>
          {value || placeholder}
        </Text>
        <Feather name="chevron-down" size={18} color={colors.mutedForeground} />
      </Pressable>

      <Modal visible={visible} animationType="slide" transparent onRequestClose={() => setVisible(false)}>
        <View style={[styles.modalRoot, { backgroundColor: 'rgba(8,19,33,0.42)' }]}>
          <View style={[styles.sheet, { backgroundColor: colors.background, paddingBottom: insets.bottom + 18 }]}>
            <View style={styles.sheetHeader}>
              <View style={styles.sheetTitleWrap}>
                <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Elige tu municipio</Text>
                <Text style={[styles.sheetSubtitle, { color: colors.mutedForeground }]}>Busca en el catálogo de Dame Pon.</Text>
              </View>
              <Pressable
                accessibilityLabel="Cerrar municipios"
                onPress={() => setVisible(false)}
                style={[styles.closeButton, { backgroundColor: colors.secondary }]}
              >
                <Feather name="x" size={20} color={colors.foreground} />
              </Pressable>
            </View>
            <View style={[styles.searchBox, { backgroundColor: colors.input, borderColor: colors.border }]}>
              <Feather name="search" size={18} color={colors.mutedForeground} />
              <TextInput
                autoFocus
                placeholder="Buscar municipio"
                placeholderTextColor={colors.mutedForeground}
                value={query}
                onChangeText={setQuery}
                style={[styles.searchInput, { color: colors.foreground }]}
                returnKeyType="search"
              />
            </View>
            {loading ? (
              <View style={styles.state}>
                <ActivityIndicator color={colors.primary} />
                <Text style={[styles.stateText, { color: colors.mutedForeground }]}>Cargando municipios…</Text>
              </View>
            ) : error ? (
              <View style={styles.state}>
                <Feather name="alert-circle" size={22} color={colors.destructive} />
                <Text style={[styles.stateText, { color: colors.destructive }]}>{error}</Text>
              </View>
            ) : (
              <FlatList
                data={filtered}
                keyExtractor={(municipality) => municipality.id}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.list}
                renderItem={({ item }) => (
                  <Pressable
                    onPress={() => {
                      onSelect(item);
                      setVisible(false);
                    }}
                    style={({ pressed }) => [
                      styles.option,
                      { borderBottomColor: colors.border },
                      pressed && { backgroundColor: colors.secondary },
                    ]}
                  >
                    <View style={[styles.optionIcon, { backgroundColor: colors.secondary }]}>
                      <Feather name="map-pin" size={17} color={colors.primary} />
                    </View>
                    <Text style={[styles.optionText, { color: colors.foreground }]}>{item.nombre}</Text>
                    {item.nombre === value ? <Feather name="check" size={19} color={colors.star} /> : null}
                  </Pressable>
                )}
                ListEmptyComponent={
                  <View style={styles.state}>
                    <Text style={[styles.stateText, { color: colors.mutedForeground }]}>No encontramos ese municipio.</Text>
                  </View>
                }
              />
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  label: { fontFamily: typography.family.semibold, fontSize: 14, marginBottom: 8, marginTop: 4 },
  trigger: { alignItems: 'center', borderRadius: 14, borderWidth: 1, flexDirection: 'row', gap: 10, minHeight: 52, paddingHorizontal: 14 },
  compactTrigger: { alignItems: 'center', borderRadius: 14, borderWidth: 1, flexDirection: 'row', gap: 8, minHeight: 46, paddingHorizontal: 12 },
  icon: { height: 18, width: 18 },
  value: { flex: 1, fontFamily: typography.family.regular, fontSize: 14 },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 26, borderTopRightRadius: 26, maxHeight: '88%', paddingHorizontal: 20, paddingTop: 18 },
  sheetHeader: { alignItems: 'center', flexDirection: 'row', gap: 12, justifyContent: 'space-between', marginBottom: 16 },
  sheetTitleWrap: { flex: 1, gap: 4 },
  sheetTitle: { fontFamily: typography.family.bold, fontSize: 22 },
  sheetSubtitle: { fontFamily: typography.family.regular, fontSize: 13 },
  closeButton: { alignItems: 'center', borderRadius: 14, height: 42, justifyContent: 'center', width: 42 },
  searchBox: { alignItems: 'center', borderRadius: 14, borderWidth: 1, flexDirection: 'row', gap: 9, minHeight: 50, paddingHorizontal: 14 },
  searchInput: { flex: 1, fontFamily: typography.family.regular, fontSize: 15 },
  list: { paddingBottom: 20, paddingTop: 8 },
  option: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', gap: 11, minHeight: 58, paddingHorizontal: 4 },
  optionIcon: { alignItems: 'center', borderRadius: 11, height: 34, justifyContent: 'center', width: 34 },
  optionText: { flex: 1, fontFamily: typography.family.semibold, fontSize: 15 },
  state: { alignItems: 'center', gap: 10, justifyContent: 'center', minHeight: 130, paddingHorizontal: 16 },
  stateText: { fontFamily: typography.family.regular, fontSize: 13, lineHeight: 19, textAlign: 'center' },
});