import { create } from "zustand";
import type { LocationValue, MarkerData } from "../types/type";

interface LocationState {
  userLocation: LocationValue | null;
  destinationLocation: LocationValue | null;
  userLatitude: number | null;
  userLongitude: number | null;
  userAddress: string | null;
  destinationLatitude: number | null;
  destinationLongitude: number | null;
  destinationAddress: string | null;
  setUserLocation: (location: LocationValue) => void;
  setDestinationLocation: (location: LocationValue) => void;
}

export const useLocationStore = create<LocationState>((set) => ({
  userLocation: null,
  destinationLocation: null,
  userLatitude: null,
  userLongitude: null,
  userAddress: null,
  destinationLatitude: null,
  destinationLongitude: null,
  destinationAddress: null,
  setUserLocation: (location) =>
    set({
      userLocation: location,
      userLatitude: location.latitude,
      userLongitude: location.longitude,
      userAddress: location.address,
    }),
  setDestinationLocation: (location) =>
    set({
      destinationLocation: location,
      destinationLatitude: location.latitude,
      destinationLongitude: location.longitude,
      destinationAddress: location.address,
    }),
}));

interface DriverState {
  drivers: MarkerData[];
  selectedDriver: string | null;
  setDrivers: (drivers: MarkerData[]) => void;
  setSelectedDriver: (driverId: string) => void;
  clearSelectedDriver: () => void;
}

export const useDriverStore = create<DriverState>((set) => ({
  drivers: [],
  selectedDriver: null,
  setDrivers: (drivers) => set({ drivers }),
  setSelectedDriver: (selectedDriver) => set({ selectedDriver }),
  clearSelectedDriver: () => set({ selectedDriver: null }),
}));