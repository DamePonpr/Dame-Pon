import type { ImageSourcePropType, StyleProp, TextInputProps, TouchableOpacityProps, ViewStyle } from "react-native";
import type { TripHistoryItem } from "@/lib/rideService";

export interface LocationValue {
  latitude: number;
  longitude: number;
  address: string;
}

export interface GoogleInputProps {
  icon?: ImageSourcePropType;
  initialLocation?: string;
  containerStyle?: StyleProp<ViewStyle>;
  textInputBackgroundColor?: string;
  handlePress: (location: LocationValue) => void;
}

export interface ButtonProps extends TouchableOpacityProps {
  title: string;
  bgVariant?: "primary" | "secondary" | "danger" | "outline" | "success";
  textVariant?: "primary" | "default" | "secondary" | "danger" | "success";
  IconLeft?: React.ComponentType<any>;
  IconRight?: React.ComponentType<any>;
  loading?: boolean;
}

export interface InputFieldProps extends TextInputProps {
  label: string;
  icon?: ImageSourcePropType;
  labelStyle?: string;
  containerStyle?: string;
  inputStyle?: string;
  iconStyle?: string;
}

export interface PaymentProps {
  fullName?: string;
  email?: string;
  amount?: string | number;
  driverId?: string | number | null;
  rideTime?: number;
}

export interface Ride extends TripHistoryItem {}

export interface Driver {
  id: string;
  status?: string;
  is_online?: boolean;
  current_lat?: number | null;
  current_lng?: number | null;
  first_name?: string;
  last_name?: string;
  profile_image_url?: string | null;
  car_seats?: number;
  rating?: number;
}

export interface MarkerData {
  id: string;
  latitude: number;
  longitude: number;
  title: string;
  profile_image_url?: string | null;
  car_image_url?: string | null;
  car_seats?: number;
  rating?: number;
  first_name?: string;
  last_name?: string;
  time?: number;
  price?: string;
}