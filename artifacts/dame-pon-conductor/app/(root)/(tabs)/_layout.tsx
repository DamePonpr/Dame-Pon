import { Tabs } from "expo-router";
import { Image, ImageSourcePropType, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { icons } from "@/constants";
import { useColors } from "@/hooks/useColors";

const TabIcon = ({
  source,
  focused,
  colors,
}: {
  source: ImageSourcePropType;
  focused: boolean;
  colors: ReturnType<typeof useColors>;
}) => (
  <View
    style={{
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: "center",
      justifyContent: "center",
       backgroundColor: focused ? colors.secondary : "transparent",
    }}
  >
    <Image source={source} tintColor={focused ? colors.star : colors.mutedForeground} resizeMode="contain" style={{ width: 21, height: 21 }} />
  </View>
);

export default function Layout() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  return (
    <Tabs
      initialRouteName="home"
      screenOptions={{
        tabBarActiveTintColor: colors.star,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarShowLabel: true,
        tabBarLabelStyle: {
          fontFamily: "Jakarta-SemiBold",
          fontSize: 11,
          marginTop: -1,
          marginBottom: 2,
        },
        tabBarStyle: {
          backgroundColor: colors.background,
          borderTopWidth: 0,
          borderRadius: 24,
          paddingTop: 8,
          paddingBottom: insets.bottom,
          marginHorizontal: 14,
          marginBottom: Math.max(insets.bottom, 10),
          height: 72 + insets.bottom,
          overflow: "hidden",
          position: "absolute",
        },
        tabBarItemStyle: { paddingVertical: 0 },
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.foreground,
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "Home",
          tabBarLabel: "Inicio",
          headerShown: false,
          tabBarIcon: ({ focused }) => (
            <TabIcon source={icons.home} focused={focused} colors={colors} />
          ),
        }}
      />
      <Tabs.Screen
        name="rides"
        options={{
          title: "Rides",
          tabBarLabel: "Viajes",
          headerShown: false,
          tabBarIcon: ({ focused }) => (
            <TabIcon source={icons.list} focused={focused} colors={colors} />
          ),
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: "Chat",
          tabBarLabel: "Chat",
          headerShown: false,
          tabBarIcon: ({ focused }) => (
            <TabIcon source={icons.chat} focused={focused} colors={colors} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarLabel: "Perfil",
          headerShown: false,
          tabBarIcon: ({ focused }) => (
            <TabIcon source={icons.profile} focused={focused} colors={colors} />
          ),
        }}
      />
    </Tabs>
  );
}
