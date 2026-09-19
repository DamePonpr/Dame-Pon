import { Tabs } from "expo-router";
import { Image, ImageSourcePropType, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { icons } from "@/constants";
import { useColors } from "@/hooks/useColors";

const TabIcon = ({
  source,
  focused,
}: {
  source: ImageSourcePropType;
  focused: boolean;
}) => (
  <View
    style={{
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: focused ? "#17304D" : "transparent",
    }}
  >
    <Image source={source} tintColor={focused ? "#F6C453" : "#FFFFFF"} resizeMode="contain" style={{ width: 21, height: 21 }} />
  </View>
);

export default function Layout() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  return (
    <Tabs
      initialRouteName="home"
      screenOptions={{
        tabBarActiveTintColor: "#F6C453",
        tabBarInactiveTintColor: "rgba(255,255,255,0.70)",
        tabBarShowLabel: true,
        tabBarLabelStyle: {
          fontFamily: "Jakarta-SemiBold",
          fontSize: 11,
          marginTop: -1,
          marginBottom: 2,
        },
        tabBarStyle: {
          backgroundColor: "#081321",
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
            <TabIcon source={icons.home} focused={focused} />
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
            <TabIcon source={icons.list} focused={focused} />
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
            <TabIcon source={icons.chat} focused={focused} />
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
            <TabIcon source={icons.profile} focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}
