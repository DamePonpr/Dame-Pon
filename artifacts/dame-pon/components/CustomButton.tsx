import React from "react";
import { ActivityIndicator, Image, Pressable, Text, View } from "react-native";
import type { ButtonProps } from "@/types/type";
import { useColors } from "@/hooks/useColors";

export function CustomButton({
  title,
  onPress,
  bgVariant = "primary",
  textVariant = "default",
  IconLeft,
  IconRight,
  disabled,
  loading,
  className: _className,
  style: _style,
  ...props
}: ButtonProps) {
  const colors = useColors();
  const backgroundColor = {
    primary: colors.primary,
    secondary: colors.secondary,
    danger: colors.destructive,
    outline: "transparent",
    success: colors.primary,
  }[bgVariant];
  const textColor = {
    primary: colors.primaryForeground,
    default: colors.primaryForeground,
    secondary: colors.foreground,
    danger: "#FFFFFF",
    success: "#FFFFFF",
  }[textVariant];

  return (
    <Pressable
      {...props}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 54,
        borderRadius: 16,
        borderWidth: bgVariant === "outline" ? 1 : 0,
        borderColor: colors.border,
        backgroundColor,
        opacity: disabled || loading ? 0.5 : pressed ? 0.82 : 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 20,
      })}
    >
      {loading ? <ActivityIndicator color={textColor} /> : null}
      {!loading && IconLeft ? <IconLeft /> : null}
      {!loading ? <Text style={{ color: textColor, fontFamily: "Jakarta-SemiBold", fontSize: 16 }}>{title}</Text> : null}
      {!loading && IconRight ? <IconRight /> : null}
    </Pressable>
  );
}

export const AppButton = CustomButton;
export default CustomButton;