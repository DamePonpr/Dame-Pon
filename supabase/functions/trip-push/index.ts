import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type PushAction = 'new_trip' | 'driver_accept' | 'driver_start' | 'passenger_cancel';

interface Trip {
  id: string;
  passenger_id: string;
  driver_id: string | null;
  pickup_lat: number | null;
  pickup_lng: number | null;
  pickup_address: string;
  dropoff_address: string;
  status: string;
}

function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const radius = 6371;
  const toRadians = (value: number) => value * Math.PI / 180;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authorization = request.headers.get('Authorization');
    if (!authorization?.startsWith('Bearer ')) {
      return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Supabase environment is not configured');
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const token = authorization.slice('Bearer '.length);
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
    }

    const body = await request.json() as { action?: PushAction; tripId?: string };
    if (!body.action || !body.tripId) {
      return Response.json({ error: 'action and tripId are required' }, { status: 400, headers: corsHeaders });
    }

    const { data: tripData, error: tripError } = await admin
      .from('trips')
      .select('id,passenger_id,driver_id,pickup_lat,pickup_lng,pickup_address,dropoff_address,status')
      .eq('id', body.tripId)
      .single();
    if (tripError || !tripData) {
      return Response.json({ error: 'Trip not found' }, { status: 404, headers: corsHeaders });
    }
    const trip = tripData as Trip;
    const callerId = authData.user.id;
    let recipientIds: string[] = [];
    let title = '';
    let message = '';

    if (body.action === 'new_trip') {
      if (callerId !== trip.passenger_id || trip.status !== 'buscando_conductor') {
        return Response.json({ error: 'Forbidden' }, { status: 403, headers: corsHeaders });
      }
      if (!Number.isFinite(trip.pickup_lat) || !Number.isFinite(trip.pickup_lng)) {
        return Response.json({ delivered: 0, reason: 'Pickup coordinates unavailable' }, { headers: corsHeaders });
      }
      const { data: drivers } = await admin
        .from('drivers')
        .select('id,current_lat,current_lng')
        .eq('status', 'aprobado')
        .eq('is_online', true)
        .not('current_lat', 'is', null)
        .not('current_lng', 'is', null);
      recipientIds = (drivers ?? [])
        .filter((driver) => distanceKm(
          Number(trip.pickup_lat),
          Number(trip.pickup_lng),
          Number(driver.current_lat),
          Number(driver.current_lng),
        ) <= 20)
        .map((driver) => driver.id as string);
      title = 'Nuevo viaje disponible cerca';
      message = `${trip.pickup_address} → ${trip.dropoff_address}`;
    } else if (body.action === 'driver_accept') {
      if (callerId !== trip.driver_id || trip.status !== 'aceptado') {
        return Response.json({ error: 'Forbidden' }, { status: 403, headers: corsHeaders });
      }
      recipientIds = [trip.passenger_id];
      title = '¡Tu conductor va en camino!';
      message = 'Abre Dame Pon para seguir su llegada en el mapa.';
    } else if (body.action === 'driver_start') {
      if (callerId !== trip.driver_id || trip.status !== 'en_curso') {
        return Response.json({ error: 'Forbidden' }, { status: 403, headers: corsHeaders });
      }
      recipientIds = [trip.passenger_id];
      title = 'Tu viaje comenzó';
      message = `Ya van camino a ${trip.dropoff_address}.`;
    } else if (body.action === 'passenger_cancel') {
      if (callerId !== trip.passenger_id || trip.status !== 'cancelado' || !trip.driver_id) {
        return Response.json({ error: 'Forbidden' }, { status: 403, headers: corsHeaders });
      }
      recipientIds = [trip.driver_id];
      title = 'El pasajero canceló el viaje';
      message = 'Ya puedes recibir una nueva solicitud.';
    }

    if (!recipientIds.length) {
      return Response.json({ delivered: 0 }, { headers: corsHeaders });
    }

    const { data: profiles, error: profilesError } = await admin
      .from('profiles')
      .select('id,push_token')
      .in('id', recipientIds)
      .not('push_token', 'is', null);
    if (profilesError) throw profilesError;

    const notifications = (profiles ?? [])
      .filter((profile) => typeof profile.push_token === 'string')
      .map((profile) => ({
        to: profile.push_token,
        sound: 'default',
        channelId: 'trips',
        title,
        body: message,
        data: { tripId: trip.id, action: body.action },
      }));
    if (!notifications.length) {
      return Response.json({ delivered: 0 }, { headers: corsHeaders });
    }

    const expoResponse = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(notifications),
    });
    if (!expoResponse.ok) {
      throw new Error(`Expo Push API returned ${expoResponse.status}`);
    }

    return Response.json({ delivered: notifications.length }, { headers: corsHeaders });
  } catch (error) {
    console.error('trip-push', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500, headers: corsHeaders },
    );
  }
});