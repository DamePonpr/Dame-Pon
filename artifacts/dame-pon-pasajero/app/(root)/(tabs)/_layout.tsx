import { Tabs } from "expo-router";
import { Image, ImageSourcePropType, Platform, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { icons } from "@workspace/dame-pon-shared/constants";
import { useColors } from "@workspace/dame-pon-shared/hooks/useColors";

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
  const webTabBar = Platform.OS === "web";
  const bottomInset = webTabBar ? 0 : insets.bottom;
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
           lineHeight: 14,
           marginTop: 0,
           marginBottom: 0,
        },
        tabBarStyle: {
          backgroundColor: colors.background,
          borderTopWidth: 0,
          borderRadius: 24,
           paddingTop: 6,
           paddingBottom: bottomInset,
          marginHorizontal: 14,
           marginBottom: 0,
           height: webTabBar ? 84 : 58 + bottomInset,
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
