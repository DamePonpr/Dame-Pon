import type { SupabaseClient } from '@supabase/supabase-js';

export function subscribeToDriverDocumentReview(
  client: SupabaseClient,
  uid: string,
  onChange: () => void,
) {
  const channel = client
    .channel(`driver-document-review:${uid}:${Date.now()}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'drivers', filter: `id=eq.${uid}` },
      () => void onChange(),
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'driver_documents', filter: `driver_id=eq.${uid}` },
      () => void onChange(),
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') void onChange();
    });

  return () => {
    void client.removeChannel(channel);
  };
}