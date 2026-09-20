import { router } from "expo-router";
import { useRef, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Swiper from "react-native-swiper";

import CustomButton from "@workspace/dame-pon-shared/components/CustomButton";
import { BrandLogo } from "@workspace/dame-pon-shared/components/BrandLogo";
import { onboarding } from "@workspace/dame-pon-shared/constants";
import { useColors } from "@workspace/dame-pon-shared/hooks/useColors";

const Home = () => {
  const colors = useColors();
  const swiperRef = useRef<Swiper>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const isLastSlide = activeIndex === onboarding.length - 1;

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
      <TouchableOpacity
        onPress={() => {
          router.replace("/(auth)/sign-up");
        }}
        style={styles.skip}
      >
        <Text style={[styles.skipText, { color: colors.foreground }]}>Saltar</Text>
      </TouchableOpacity>

      <Swiper
        ref={swiperRef}
        loop={false}
        dot={<View style={[styles.dot, { backgroundColor: colors.border }]} />}
        activeDot={<View style={[styles.dot, { backgroundColor: colors.star }]} />}
        onIndexChanged={(index) => setActiveIndex(index)}
      >
        {onboarding.map((item) => (
          <View key={item.id} style={styles.slide}>
              <BrandLogo role="pasajero" style={styles.logo} />
            <View style={styles.titleWrap}>
              <Text style={[styles.title, { color: colors.foreground }]}>
                {item.title}
              </Text>
            </View>
            <Text style={[styles.description, { color: colors.mutedForeground }]}>
              {item.description}
            </Text>
          </View>
        ))}
      </Swiper>

      <CustomButton
        title={isLastSlide ? "Empezar" : "Siguiente"}
        onPress={() =>
          isLastSlide
            ? router.replace("/(auth)/sign-up")
            : swiperRef.current?.scrollBy(1)
        }
        style={styles.button}
      />
    </SafeAreaView>
  );
};

export default Home;

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: "center", justifyContent: "space-between" },
  skip: { alignItems: "flex-end", padding: 20, width: "100%" },
  skipText: { fontFamily: "Jakarta-Bold", fontSize: 15 },
  dot: { borderRadius: 999, height: 4, marginHorizontal: 4, width: 32 },
  slide: { alignItems: "center", justifyContent: "center", padding: 20 },
  logo: { height: 220, width: 220 },
  titleWrap: { alignItems: "center", marginTop: 28, width: "100%" },
  title: { fontFamily: "Jakarta-Bold", fontSize: 28, lineHeight: 36, marginHorizontal: 20, maxWidth: 330, textAlign: "center" },
  description: { fontFamily: "Jakarta-SemiBold", fontSize: 15, lineHeight: 22, marginHorizontal: 24, marginTop: 12, maxWidth: 330, textAlign: "center" },
  button: { marginBottom: 20, marginTop: 18, width: "92%" },
});
