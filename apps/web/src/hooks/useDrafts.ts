/**
 * Every draft this league has run — the admin hub's index.
 *
 * This is the answer to the one real durability hole in the product: a draft was
 * always safe in DynamoDB, but its id lived only in the creating browser's
 * `localStorage`, so a dead laptop or cleared site data made a perfectly intact
 * draft unreachable through the UI. Nothing here recovers data; it recovers the
 * *pointer* to it.
 *
 * Not cached indefinitely like the league metadata: the list changes whenever a
 * draft is created or ends, and the hub is exactly where you look after one of
 * those happened.
 */
import type { DraftSummary } from '@opendraft/shared';
import { useQuery } from '@tanstack/react-query';
import { LEAGUE_ID, api } from '../net.js';
import { useLiveStore } from '../store/store.js';

export interface DraftsQuery {
  drafts: DraftSummary[];
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useDrafts(): DraftsQuery {
  // Admin-only on the server: the list hands out draft ids, and a draft id is the
  // capability to view or pick in that draft. The token is in memory only, so the
  // query simply doesn't run until there is one.
  const token = useLiveStore((s) => s.adminToken);

  const query = useQuery({
    queryKey: ['drafts', LEAGUE_ID, token],
    queryFn: () => api.get<{ drafts: DraftSummary[] }>(`/leagues/${LEAGUE_ID}/drafts`, token ?? ''),
    enabled: Boolean(token),
    staleTime: 15_000,
    retry: false,
  });

  return {
    drafts: query.data?.drafts ?? [],
    // `isLoading` is false for a disabled query, which would render "no drafts"
    // to an admin whose token simply hasn't landed yet.
    loading: query.isLoading || (Boolean(token) && !query.data && !query.error),
    error: query.error,
    refetch: () => void query.refetch(),
  };
}
