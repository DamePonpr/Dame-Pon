export interface Municipality {
  id: string;
  nombre: string;
  centro_lat: number;
  centro_lng: number;
}

export interface DriverCoordinates {
  latitude: number | null;
  longitude: number | null;
}

export interface MunicipalityTrip {
  municipio_origen: string | null;
  pickup_lat: number | null;
  pickup_lng: number | null;
}

const EARTH_RADIUS_KM = 6371;

export function distanceKm(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
) {
  const latitudeDelta = ((to.latitude - from.latitude) * Math.PI) / 180;
  const longitudeDelta = ((to.longitude - from.longitude) * Math.PI) / 180;
  const fromLatitude = (from.latitude * Math.PI) / 180;
  const toLatitude = (to.latitude * Math.PI) / 180;
  const haversine = (
    Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(fromLatitude) * Math.cos(toLatitude) * Math.sin(longitudeDelta / 2) ** 2
  );
  return EARTH_RADIUS_KM * 2 * Math.asin(Math.sqrt(haversine));
}

export function nearestMunicipality(
  point: { latitude: number; longitude: number },
  municipalities: Municipality[],
) {
  return municipalities.reduce<Municipality | null>((nearest, municipality) => {
    if (!nearest) return municipality;
    const distance = distanceKm(point, { latitude: municipality.centro_lat, longitude: municipality.centro_lng });
    const nearestDistance = distanceKm(point, { latitude: nearest.centro_lat, longitude: nearest.centro_lng });
    return distance < nearestDistance ? municipality : nearest;
  }, null);
}

export function tripDistanceFromDriver(trip: MunicipalityTrip, driverLocation: DriverCoordinates) {
  if (
    !Number.isFinite(driverLocation.latitude)
    || !Number.isFinite(driverLocation.longitude)
    || !Number.isFinite(trip.pickup_lat)
    || !Number.isFinite(trip.pickup_lng)
  ) {
    return Number.POSITIVE_INFINITY;
  }

  return distanceKm(
    { latitude: Number(driverLocation.latitude), longitude: Number(driverLocation.longitude) },
    { latitude: Number(trip.pickup_lat), longitude: Number(trip.pickup_lng) },
  );
}

export function isTripInActiveMunicipality(trip: Trip, activeMunicipality: string | null | undefined) {
  return Boolean(activeMunicipality && trip.municipio_origen === activeMunicipality);
}

export function sortTripsForDriver(
  trips: MunicipalityTrip[],
  activeMunicipality: string | null | undefined,
  driverLocation: DriverCoordinates,
) {
  return trips
    .map((trip, index) => ({
      trip,
      index,
      local: isTripInActiveMunicipality(trip, activeMunicipality),
      distance: tripDistanceFromDriver(trip, driverLocation),
    }))
    .sort((left, right) => (
      Number(right.local) - Number(left.local)
      || left.distance - right.distance
      || left.index - right.index
    ))
    .map(({ trip }) => trip);
}

export type MunicipalityDecision = 'return' | 'stay';

export function municipalityAfterDecision(
  decision: MunicipalityDecision,
  baseMunicipality: string,
  destinationMunicipality: string,
) {
  return decision === 'return' ? baseMunicipality : destinationMunicipality;
}