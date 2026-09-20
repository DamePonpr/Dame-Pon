import React from "react";
import { useLocationStore } from "@/store";
import { LiveRideMap } from "@/components/LiveRideMap";

export default function Map() {
  const { userLocation, destinationLocation } = useLocationStore();
  return (
    <LiveRideMap
      passengerLocation={userLocation}
      pickupLocation={userLocation}
      driverLocation={null}
      driverVehicleColor={null}
    />
  );
}