import { Feather } from "@expo/vector-icons";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";

const Chat = () => {
  const colors = useColors();
  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.heading, { color: colors.foreground }]}>Conversaciones</Text>
        <View style={styles.empty}>
          <View style={[styles.iconCircle, { backgroundColor: colors.secondary }]}>
            <Feather name="message-circle" size={48} color={colors.primary} />
          </View>
          <Text style={[styles.title, { color: colors.foreground }]}>
            Aún no tienes mensajes
          </Text>
          <Text style={[styles.description, { color: colors.mutedForeground }]}>
            El chat con tu conductor o pasajero aparecerá aquí durante un viaje activo.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

export default Chat;

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 20 },
  content: { flexGrow: 1 },
  heading: { fontFamily: "Jakarta-Bold", fontSize: 26, marginBottom: 18 },
  empty: { alignItems: "center", flex: 1, justifyContent: "center", minHeight: 360 },
  iconCircle: { alignItems: "center", borderRadius: 48, height: 96, justifyContent: "center", width: 96 },
  title: { fontFamily: "Jakarta-Bold", fontSize: 24, marginTop: 18, textAlign: "center" },
  description: { fontFamily: "Jakarta", fontSize: 15, lineHeight: 22, marginTop: 10, paddingHorizontal: 28, textAlign: "center" },
});
