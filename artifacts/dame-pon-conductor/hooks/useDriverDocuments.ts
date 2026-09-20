import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@workspace/dame-pon-shared/lib/supabase';
import {
  getDriverDocumentReview,
  reviewIsComplete,
  uploadDriverDocument,
  type DriverDocumentKind,
  type DriverDocumentReview,
} from '../lib/driverDocuments';

export function useDriverDocuments(userId: string | undefined) {
  const [review, setReview] = useState<DriverDocumentReview | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const refreshInFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (!userId || refreshInFlight.current) return;
    refreshInFlight.current = true;
    try {
      const result = await getDriverDocumentReview(userId);
      if (result.error) setError(result.error);
      else setReview(result.data);
    } finally {
      refreshInFlight.current = false;
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    void refresh();
    const channel = supabase
      .channel(`driver-document-review:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drivers', filter: `id=eq.${userId}` }, () => void refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_documents', filter: `driver_id=eq.${userId}` }, () => void refresh())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [refresh, userId]);

  const upload = useCallback(async (kind: DriverDocumentKind, uri: string, mimeType?: string) => {
    if (!userId) return false;
    setUploading(true);
    setError('');
    const result = await uploadDriverDocument(userId, kind, uri, mimeType);
    setUploading(false);
    if (result.error) {
      setError(result.error);
      return false;
    }
    await refresh();
    return true;
  }, [refresh, userId]);

  return useMemo(() => ({
    review,
    loading,
    uploading,
    error,
    refresh,
    upload,
    isFullyApproved: reviewIsComplete(review),
  }), [error, loading, refresh, review, upload, uploading]);
}