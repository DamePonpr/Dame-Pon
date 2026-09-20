import React, { useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { icons } from "../constants";
import type { GoogleInputProps, LocationValue } from "../types/type";
import { useColors } from "../hooks/useColors";

const PUERTO_RICO_BBOX = "-67.3,17.8,-65.2,18.6";

interface PhotonFeature {
  properties?: { name?: string; city?: string; state?: string; country?: string };
  geometry?: { coordinates?: [number, number] };
}

function featureToLocation(feature: PhotonFeature): LocationValue | null {
  const coordinates = feature.geometry?.coordinates;
  if (!coordinates || coordinates.length < 2) return null;
  const properties = feature.properties ?? {};
  const address = [properties.name, properties.city, properties.state]
    .filter(Boolean)
    .join(", ");
  return { longitude: coordinates[0], latitude: coordinates[1], address: address || "Puerto Rico" };
}

export default function GoogleTextInput({ icon, initialLocation, containerStyle, textInputBackgroundColor, handlePress }: GoogleInputProps) {
  const colors = useColors();
  const [query, setQuery] = useState(initialLocation ?? "");
  const [results, setResults] = useState<LocationValue[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => setQuery(initialLocation ?? ""), [initialLocation]);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 3 || trimmed === initialLocation) {
      setResults([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(
          `https://photon.komoot.io/api/?q=${encodeURIComponent(`${trimmed}, Puerto Rico`)}&limit=5&bbox=${PUERTO_RICO_BBOX}`,
          { headers: { Accept: "application/json" }, signal: controller.signal },
        );
        const json = (await response.json()) as { features?: PhotonFeature[] };
        setResults((json.features ?? []).map(featureToLocation).filter((value): value is LocationValue => Boolean(value)));
      } catch {
        if (!controller.signal.aborted) setResults([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 350);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [initialLocation, query]);

  return (
    <View style={[styles.wrapper, { backgroundColor: textInputBackgroundColor ?? colors.card, borderColor: colors.border }, containerStyle]}>
      <View style={styles.inputRow}>
        <Image source={icon ?? icons.search} style={styles.icon} resizeMode="contain" />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={initialLocation ?? "¿A dónde vas?"}
          placeholderTextColor={colors.mutedForeground}
          style={[styles.input, { color: colors.foreground }]}
          accessibilityLabel="Buscar ubicación en Puerto Rico"
        />
        {loading ? <ActivityIndicator size="small" color={colors.primary} /> : null}
      </View>
      {results.length > 0 ? (
        <ScrollView style={[styles.results, { backgroundColor: colors.card }]} keyboardShouldPersistTaps="handled">
          {results.map((location, index) => (
            <Pressable
              key={`${location.address}-${index}`}
              onPress={() => {
                setQuery(location.address);
                setResults([]);
                handlePress(location);
              }}
              style={[styles.result, { borderTopColor: colors.border }]}
            >
              <Text style={{ color: colors.foreground, fontFamily: "Jakarta-Medium" }}>{location.address}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { borderWidth: 1, borderRadius: 16, overflow: "hidden", zIndex: 20 },
  inputRow: { minHeight: 56, flexDirection: "row", alignItems: "center", paddingHorizontal: 16 },
  icon: { width: 22, height: 22, marginRight: 10 },
  input: { flex: 1, fontFamily: "Jakarta-Medium", fontSize: 15 },
  results: { maxHeight: 220 },
  result: { paddingHorizontal: 16, paddingVertical: 14, borderTopWidth: StyleSheet.hairlineWidth },
});