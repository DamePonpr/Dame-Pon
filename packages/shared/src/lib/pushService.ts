import { supabase } from '@/lib/supabase';

export type TripPushAction =
  | 'new_trip'
  | 'driver_accept'
  | 'driver_start'
  | 'passenger_cancel';

export async function sendTripPush(action: TripPushAction, tripId: string) {
  const { error } = await supabase.functions.invoke('trip-push', {
    body: { action, tripId },
  });
  if (error) {
    console.error('[Dame Pon] trip-push:', {
      action,
      tripId,
      message: error.message,
    });
  }
}