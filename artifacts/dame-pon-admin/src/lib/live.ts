import { POLL_MS, errorStatus, isAuthError } from '@/lib/admin';

export function liveQuery() {
  return {
    refetchInterval: (q: { state: { error: unknown } }) => (isAuthError(q.state.error) ? false : POLL_MS),
    refetchOnWindowFocus: true,
    retry: (count: number, e: unknown) => !isAuthError(e) && errorStatus(e) !== 404 && count < 2,
  } as const;
}
