/**
 * The league's metadata (name + theme) for branding (AD-10). Read-only, cached
 * indefinitely, and resilient: a missing league (setup not run yet) just yields
 * `undefined` so callers fall back to the OpenDraft/amber default. The leagueId
 * comes from the live draft once synced, else the self-hosted default.
 */
import type { LeagueMeta } from '@opendraft/shared';
import { useQuery } from '@tanstack/react-query';
import { LEAGUE_ID, api } from '../net.js';
import { useLiveStore } from '../store/store.js';

export function useLeague(): LeagueMeta | undefined {
  const leagueId = useLiveStore((s) => s.draft?.leagueId) ?? LEAGUE_ID;
  return useQuery({
    queryKey: ['league', leagueId],
    queryFn: () => api.get<LeagueMeta>(`/leagues/${leagueId}`),
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  }).data;
}
