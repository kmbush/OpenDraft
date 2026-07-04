/**
 * DynamoDB single-table key helpers (DESIGN §4, CONVENTIONS §3). Every key is
 * league-scoped (§7) — there is no way to build an unscoped key here. Overall
 * pick numbers are zero-padded so PICK range queries sort correctly.
 */

export const pk = (leagueId: string): string => `LEAGUE#${leagueId}`;

export const metaSk = (): string => 'META';
export const draftSk = (draftId: string): string => `DRAFT#${draftId}`;
export const teamSk = (draftId: string, slot: number): string => `DRAFT#${draftId}#TEAM#${slot}`;
export const pickSk = (draftId: string, overall: number): string =>
  `DRAFT#${draftId}#PICK#${String(overall).padStart(4, '0')}`;
export const connSk = (connectionId: string): string => `CONN#${connectionId}`;
export const authSk = (): string => 'AUTH#PASSCODE_ATTEMPTS';

/** SK prefix for a full-draft range query (draft item + teams + picks). */
export const draftPrefix = (draftId: string): string => `DRAFT#${draftId}`;
/** SK prefix that matches only this draft's PICK items. */
export const pickPrefix = (draftId: string): string => `DRAFT#${draftId}#PICK#`;
/** SK prefix that matches only this draft's TEAM items. */
export const teamPrefix = (draftId: string): string => `DRAFT#${draftId}#TEAM#`;
