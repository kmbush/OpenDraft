/**
 * Admin console + setup (DESIGN §5.4, §7). Passcode → HMAC session token held in
 * the store; admin action envelopes carry it as top-level `token`. The UI is
 * gated but the server enforces (AD-8). Setup creates league/draft/teams and the
 * draft order; the pool defaults to a working snapshot and shows its player count
 * so a created draft is always draftable.
 */
import { roundForOverall } from '@opendraft/engine';
import {
  DEFAULT_ROSTER_PRESET,
  type DraftSettings,
  IDP_FLEX_ELIGIBILITY,
  type Pick,
  type Player,
  type Position,
  type RosterFormat,
  SUPERFLEX_ELIGIBILITY,
} from '@opendraft/shared';
import {
  CheckCircle2,
  Clapperboard,
  Clock,
  ExternalLink,
  FileDown,
  GripVertical,
  History,
  Loader2,
  Lock,
  MonitorPlay,
  Palette,
  Pause,
  Play,
  Rocket,
  RotateCcw,
  Shuffle,
  SkipForward,
  Tv,
  Users,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../components/ui/card.js';
import { Input } from '../components/ui/input.js';
import { Select } from '../components/ui/select.js';
import { Separator } from '../components/ui/separator.js';
import { fetchPoolCount, indexPlayers, usePool } from '../hooks/usePool.js';
import { useTicker } from '../hooks/useTicker.js';
import { formatClock, remainingMs } from '../lib/clock.js';
import { cn } from '../lib/cn.js';
import { POSITION_COLOR } from '../lib/positions.js';
import { TEAM_COLORS, teamColor, teamColorForSlot } from '../lib/teams.js';
import { ACCENT_PALETTE, DEFAULT_ACCENT } from '../lib/theme.js';
import { LEAGUE_ID, api, connect } from '../net.js';
import { useLiveStore } from '../store/store.js';

const ROSTER_PRESETS: Record<string, RosterFormat> = {
  standard: DEFAULT_ROSTER_PRESET,
  superflex: {
    ...DEFAULT_ROSTER_PRESET,
    flex: [
      ...DEFAULT_ROSTER_PRESET.flex,
      { kind: 'SUPERFLEX', eligible: [...SUPERFLEX_ELIGIBILITY], count: 1 },
    ],
    positionMax: { ...DEFAULT_ROSTER_PRESET.positionMax, QB: 6 },
  },
  idp: {
    ...DEFAULT_ROSTER_PRESET,
    starters: { ...DEFAULT_ROSTER_PRESET.starters, DL: 1, LB: 1, DB: 1 },
    flex: [
      ...DEFAULT_ROSTER_PRESET.flex,
      { kind: 'IDP_FLEX', eligible: [...IDP_FLEX_ELIGIBILITY], count: 1 },
    ],
    positionMax: { ...DEFAULT_ROSTER_PRESET.positionMax, DL: 6, LB: 6, DB: 6 },
  },
};

function shuffle(n: number): number[] {
  const slots = Array.from({ length: n }, (_, i) => i + 1);
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [slots[i], slots[j]] = [slots[j] as number, slots[i] as number];
  }
  return slots;
}

const LINK_BUTTON =
  'inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90';

export function AdminView() {
  const { draft, adminToken } = useLiveStore();
  if (!adminToken) return <Login />;
  return draft ? <Controls /> : <Setup />;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the control is passed as children
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium">{label}</span>
      {children}
    </label>
  );
}

function Login() {
  const setAdminToken = useLiveStore((s) => s.setAdminToken);
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ token: string }>('/admin/session', { passcode });
      setAdminToken(res.token);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Login failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Lock className="h-6 w-6 text-primary" />
          </div>
          <CardTitle>Admin sign in</CardTitle>
          <CardDescription>Enter the league passcode to run the draft.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="Passcode">
            <Input
              type="password"
              placeholder="••••••••"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
            />
          </Field>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Button className="w-full" disabled={busy || !passcode} onClick={submit}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Sign in
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

/** Editable identity for one team in the setup form (name/color/owner). */
interface TeamConfig {
  name: string;
  color: string;
  ownerLabel: string;
}

/** Max inline-logo size — kept small since it rides in the league META item. */
const MAX_LOGO_BYTES = 40_000;

/** Read a small image file to a capped data-URL (S3 upload is AD-10, deferred). */
function readLogoFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (file.size > MAX_LOGO_BYTES) {
      reject(new Error('Logo must be under 40 KB — try a smaller image.'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Couldn't read that image."));
    reader.readAsDataURL(file);
  });
}

const newTeamConfig = (slot: number): TeamConfig => ({
  name: '',
  color: teamColorForSlot(slot),
  ownerLabel: '',
});

/** Grow/shrink the config list to `n`, preserving existing rows and their edits. */
const resizeTeamConfigs = (rows: TeamConfig[], n: number): TeamConfig[] =>
  Array.from({ length: n }, (_, i) => rows[i] ?? newTeamConfig(i + 1));

/** One compact row: slot, color swatch (click to repick), name, optional owner. */
function TeamRow({
  slot,
  config,
  onChange,
}: {
  slot: number;
  config: TeamConfig;
  onChange: (patch: Partial<TeamConfig>) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold tabular-nums text-muted-foreground">
        {slot}
      </span>
      <div className="relative shrink-0">
        <button
          type="button"
          aria-label={`Team ${slot} color`}
          onClick={() => setPickerOpen((o) => !o)}
          className="h-9 w-9 rounded-md border border-border shadow-sm transition-transform hover:scale-105"
          style={{ backgroundColor: config.color }}
        />
        {pickerOpen && (
          <>
            <button
              type="button"
              aria-label="Close color picker"
              className="fixed inset-0 z-10 cursor-default"
              onClick={() => setPickerOpen(false)}
            />
            <div className="absolute left-0 top-11 z-20 grid grid-cols-8 gap-1.5 rounded-lg border border-border bg-card p-2 shadow-lg">
              {TEAM_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Use ${c}`}
                  onClick={() => {
                    onChange({ color: c });
                    setPickerOpen(false);
                  }}
                  className={cn(
                    'h-6 w-6 rounded-md transition-transform hover:scale-110',
                    c === config.color && 'ring-2 ring-foreground ring-offset-2 ring-offset-card',
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </>
        )}
      </div>
      <Input
        value={config.name}
        placeholder={`Team ${slot}`}
        onChange={(e) => onChange({ name: e.target.value })}
        className="flex-1"
      />
      <Input
        value={config.ownerLabel}
        placeholder="Owner (optional)"
        onChange={(e) => onChange({ ownerLabel: e.target.value })}
        className="flex-1"
      />
    </div>
  );
}

function Setup() {
  const store = useLiveStore();
  const [name, setName] = useState('My League');
  const [teams, setTeams] = useState(10);
  const [teamRows, setTeamRows] = useState<TeamConfig[]>(() => resizeTeamConfigs([], 10));
  const [rounds, setRounds] = useState(15);
  const [mode, setMode] = useState<'snake' | 'linear'>('snake');
  const [timerSec, setTimerSec] = useState(90);
  const [waitingSec, setWaitingSec] = useState(8);
  const [goLiveCountdownSec, setGoLiveCountdownSec] = useState(30);
  const [preset, setPreset] = useState<keyof typeof ROSTER_PRESETS>('standard');
  const [poolSnapshotId, setPoolSnapshotId] = useState('bundled');
  const [poolCount, setPoolCount] = useState<number | null>(null);
  const [poolChecking, setPoolChecking] = useState(false);
  const [accent, setAccent] = useState(DEFAULT_ACCENT);
  const [logoUrl, setLogoUrl] = useState('');
  const [logoData, setLogoData] = useState('');
  const [logoError, setLogoError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A file upload (data-URL) takes precedence over a typed URL.
  const logo = logoData || logoUrl.trim();

  async function onLogoFile(file: File | undefined) {
    if (!file) return;
    setLogoError(null);
    try {
      setLogoData(await readLogoFile(file));
    } catch (e) {
      setLogoError(e instanceof Error ? e.message : 'Invalid image');
    }
  }

  // Keep the team editor length in lock-step with the team count (1–32).
  useEffect(() => {
    const n = Number.isFinite(teams) ? Math.max(1, Math.min(Math.floor(teams), 32)) : 1;
    setTeamRows((rows) => (rows.length === n ? rows : resizeTeamConfigs(rows, n)));
  }, [teams]);

  const patchTeam = (i: number, patch: Partial<TeamConfig>) =>
    setTeamRows((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  // Verify the pool as the id changes, so the admin sees the player count.
  useEffect(() => {
    const id = poolSnapshotId.trim();
    if (!id) {
      setPoolCount(null);
      return;
    }
    let active = true;
    setPoolChecking(true);
    fetchPoolCount(id)
      .then((count) => active && setPoolCount(count))
      .catch(() => active && setPoolCount(0))
      .finally(() => active && setPoolChecking(false));
    return () => {
      active = false;
    };
  }, [poolSnapshotId]);

  async function createDraft() {
    setBusy(true);
    setError(null);
    try {
      const token = store.adminToken ?? undefined;
      const theme = { colors: { accent }, ...(logo ? { logo } : {}) };
      await api.post('/leagues', { name, theme }, token);
      const settings: DraftSettings = {
        teams: teamRows.length,
        rounds,
        mode,
        timerSec,
        waitingSec,
        goLiveCountdownSec,
        rosterFormat: ROSTER_PRESETS[preset] ?? DEFAULT_ROSTER_PRESET,
      };
      const teamsPayload = teamRows.map((r, i) => ({
        name: r.name.trim() || `Team ${i + 1}`,
        color: r.color,
        ...(r.ownerLabel.trim() ? { ownerLabel: r.ownerLabel.trim() } : {}),
      }));
      const id = poolSnapshotId.trim();
      const created = await api.post<{ draftId: string }>(
        `/leagues/${LEAGUE_ID}/drafts`,
        { settings, teams: teamsPayload, ...(id ? { poolSnapshotId: id } : {}) },
        token,
      );
      localStorage.setItem('opendraft.draftId', created.draftId);
      store.setDraftId(created.draftId);
      connect(created.draftId, 'admin');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create failed');
    } finally {
      setBusy(false);
    }
  }

  const hasPool = poolCount !== null && poolCount > 0;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">New draft</h1>
        <p className="text-muted-foreground">Configure the format, then start the draft.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>League &amp; format</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="League name">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Teams">
              <Input type="number" value={teams} onChange={(e) => setTeams(+e.target.value)} />
            </Field>
            <Field label="Rounds">
              <Input type="number" value={rounds} onChange={(e) => setRounds(+e.target.value)} />
            </Field>
            <Field label="Draft order">
              <Select value={mode} onChange={(e) => setMode(e.target.value as 'snake' | 'linear')}>
                <option value="snake">Snake</option>
                <option value="linear">Linear</option>
              </Select>
            </Field>
            <Field label="Roster preset">
              <Select
                value={preset}
                onChange={(e) => setPreset(e.target.value as keyof typeof ROSTER_PRESETS)}
              >
                <option value="standard">Standard</option>
                <option value="superflex">Superflex</option>
                <option value="idp">IDP</option>
              </Select>
            </Field>
            <Field label="Pick timer (seconds)">
              <Input
                type="number"
                value={timerSec}
                onChange={(e) => setTimerSec(+e.target.value)}
              />
            </Field>
            <Field label="Waiting window (seconds)">
              <Input
                type="number"
                value={waitingSec}
                onChange={(e) => setWaitingSec(+e.target.value)}
              />
            </Field>
            <Field label="Go-live countdown (seconds)">
              <Input
                type="number"
                min={0}
                value={goLiveCountdownSec}
                onChange={(e) => setGoLiveCountdownSec(Math.max(0, +e.target.value))}
              />
            </Field>
          </div>

          <Separator />

          <Field label="Player pool">
            <Input
              value={poolSnapshotId}
              onChange={(e) => setPoolSnapshotId(e.target.value)}
              placeholder="e.g. bundled or 2026-07-03"
            />
          </Field>
          {poolChecking ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Checking pool…
            </p>
          ) : hasPool ? (
            <p className="flex items-center gap-2 text-sm text-emerald-600">
              <CheckCircle2 className="h-4 w-4" /> Pool: {poolCount} players loaded
            </p>
          ) : (
            <Alert variant="warning">
              <AlertTitle>No pool loaded</AlertTitle>
              <AlertDescription>
                Stations will have no players to draft. Enter a valid pool id (try{' '}
                <code>bundled</code>).
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Palette className="h-4 w-4" /> League branding
          </CardTitle>
          <CardDescription>
            Sets the accent and logo across the board, station, admin, and export. The league name
            above rides along.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="Accent color">
            <div className="flex flex-wrap gap-2">
              {ACCENT_PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Use ${c}`}
                  onClick={() => setAccent(c)}
                  className={cn(
                    'h-9 w-9 rounded-md border border-border shadow-sm transition-transform hover:scale-105',
                    c === accent && 'ring-2 ring-foreground ring-offset-2 ring-offset-card',
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </Field>
          <Field label="Logo URL (optional)">
            <Input
              value={logoUrl}
              onChange={(e) => {
                setLogoUrl(e.target.value);
                setLogoData('');
                setLogoError(null);
              }}
              placeholder="https://…"
            />
          </Field>
          <div className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium">…or upload a small image</span>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => onLogoFile(e.target.files?.[0])}
              className="text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground"
            />
            <p className="text-xs text-muted-foreground">
              PNG or SVG, under 40 KB — stored inline for now (S3 hosting is deferred).
            </p>
          </div>
          {logoError && (
            <Alert variant="destructive">
              <AlertDescription>{logoError}</AlertDescription>
            </Alert>
          )}
          {logo && (
            <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/40 p-3">
              <img
                src={logo}
                alt="Logo preview"
                className="h-10 w-auto max-w-[160px] object-contain"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setLogoUrl('');
                  setLogoData('');
                }}
              >
                Remove
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4" /> Teams
          </CardTitle>
          <CardDescription>
            Name each team, pick its color, and add an optional owner. Colors carry the team's
            identity across the board, station, and rosters.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-h-[22rem] space-y-2 overflow-y-auto pr-1">
            {teamRows.map((config, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: rows are a fixed-length positional list
              <TeamRow key={i} slot={i + 1} config={config} onChange={(p) => patchTeam(i, p)} />
            ))}
          </div>
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Button size="lg" disabled={busy} onClick={createDraft} className="w-full">
        {busy && <Loader2 className="h-4 w-4 animate-spin" />} Create draft
      </Button>
    </div>
  );
}

/** A confirm request raised by a destructive control (remove / rewind). */
interface Confirmation {
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
}

/** Small modal for confirming destructive admin actions (screenshot-friendly). */
function ConfirmDialog({ req, onClose }: { req: Confirmation; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Cancel"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-black/40"
      />
      <Card className="relative w-full max-w-md shadow-lg" role="alertdialog" aria-modal="true">
        <CardHeader>
          <CardTitle className="text-base">{req.title}</CardTitle>
          <CardDescription>{req.description}</CardDescription>
        </CardHeader>
        <CardContent className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              req.onConfirm();
              onClose();
            }}
          >
            {req.confirmLabel}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

/** Position-color chip (category cue only, never a value signal — CONVENTIONS §5). */
function PositionChip({ position }: { position: Position }) {
  const c = POSITION_COLOR[position];
  return (
    <span
      className="inline-flex h-5 w-8 shrink-0 items-center justify-center rounded font-bold uppercase leading-none tracking-wide"
      style={{ color: c, backgroundColor: `${c}1a`, boxShadow: `inset 0 0 0 1px ${c}55` }}
    >
      {position}
    </span>
  );
}

/** A single stat in the status console. */
function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          'mt-0.5 text-lg font-black tabular-nums tracking-tight',
          accent && 'text-accent',
        )}
      >
        {value}
      </div>
    </div>
  );
}

/** A draggable player chip in a team column; drag to another column to reassign. */
function PlayerChip({
  pick,
  name,
  onDragStart,
  onDragEnd,
  onRemove,
}: {
  pick: Pick;
  name: string;
  onDragStart: () => void;
  onDragEnd: () => void;
  onRemove: () => void;
}) {
  return (
    <li
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className="group flex cursor-grab items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5 text-sm shadow-sm transition-colors hover:border-accent/60 hover:bg-accent/5 active:cursor-grabbing"
      title="Drag to another team to reassign"
    >
      <GripVertical className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <PositionChip position={pick.position} />
      <span className="min-w-0 flex-1 truncate font-medium">{name}</span>
      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">#{pick.overall}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Undraft ${name}`}
        className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
      >
        <X className="h-4 w-4" />
      </button>
    </li>
  );
}

/** One team's column in the rosters board — a drop target for reassignment. */
function TeamColumn({
  name,
  color,
  ownerLabel,
  picks,
  nameOf,
  onClock,
  isDropTarget,
  isDragging,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragStartPick,
  onDragEndPick,
  onRemovePick,
}: {
  name: string;
  color: string;
  ownerLabel?: string;
  picks: Pick[];
  nameOf: (id: string) => string;
  onClock: boolean;
  isDropTarget: boolean;
  isDragging: boolean;
  onDragOver: () => void;
  onDragLeave: () => void;
  onDrop: () => void;
  onDragStartPick: (pick: Pick) => void;
  onDragEndPick: () => void;
  onRemovePick: (pick: Pick) => void;
}) {
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        onDragOver();
      }}
      onDragLeave={onDragLeave}
      onDrop={(e) => {
        e.preventDefault();
        onDrop();
      }}
      style={{ borderLeftColor: color, borderLeftWidth: 3 }}
      className={cn(
        'flex flex-col rounded-xl border bg-card transition-colors',
        isDropTarget ? 'border-accent ring-2 ring-accent/60' : 'border-border',
        onClock && !isDropTarget && 'border-accent/50',
      )}
    >
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <span
          className="h-3 w-3 shrink-0 rounded-full ring-2 ring-inset ring-black/10"
          style={{ backgroundColor: color }}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold leading-tight">{name}</div>
          {ownerLabel && (
            <div className="truncate text-[11px] leading-tight text-muted-foreground">
              {ownerLabel}
            </div>
          )}
        </div>
        {onClock && <Badge variant="accent">On clock</Badge>}
        <Badge variant="secondary">{picks.length}</Badge>
      </div>
      <ul className="flex-1 space-y-1.5 p-2">
        {picks.length === 0 ? (
          <li
            className={cn(
              'rounded-md border border-dashed border-border px-2 py-6 text-center text-xs text-muted-foreground',
              isDragging && 'border-accent/60 text-accent',
            )}
          >
            {isDragging ? 'Drop to reassign here' : 'No picks yet'}
          </li>
        ) : (
          picks.map((pick) => (
            <PlayerChip
              key={pick.overall}
              pick={pick}
              name={nameOf(pick.playerId)}
              onDragStart={() => onDragStartPick(pick)}
              onDragEnd={onDragEndPick}
              onRemove={() => onRemovePick(pick)}
            />
          ))
        )}
      </ul>
    </div>
  );
}

function Controls() {
  const store = useLiveStore();
  const draft = store.draft;
  const draftId = store.draftId;
  const pool = usePool(draft?.poolSnapshotId);
  const now = useTicker();
  const [orderText, setOrderText] = useState('');
  const [rewindText, setRewindText] = useState('');
  const [dragOverSlot, setDragOverSlot] = useState<number | null>(null);
  const [draggingOverall, setDraggingOverall] = useState<number | null>(null);
  const [confirm, setConfirm] = useState<Confirmation | null>(null);

  const byId = useMemo(() => indexPlayers(pool.players), [pool.players]);
  if (!draft) return null;

  const nameOf = (id: string): string => {
    const p: Player | undefined = byId.get(id);
    return p ? `${p.firstName} ${p.lastName}` : id;
  };

  const { teams, rounds } = draft.settings;
  const totalPicks = teams * rounds;
  const suffix = draftId ? `?draft=${draftId}` : '';
  const preStart = draft.status === 'SETUP' || draft.status === 'ORDER_SET';
  const revealing = draft.status === 'REVEALING';
  const starting = draft.status === 'STARTING';
  const live = draft.status === 'ON_CLOCK' || draft.status === 'PICK_IN';
  const onClockSlot = store.onClockTeamSlot();
  const round = draft.pointer >= 1 ? roundForOverall(draft.pointer, teams) : 0;
  const remaining = remainingMs(draft.pickDeadline, store.serverOffsetMs, now);
  const startingRemaining = remainingMs(draft.liveAt, store.serverOffsetMs, now);
  const orderedPicks = [...draft.picks].sort((a, b) => a.overall - b.overall);
  const lastOverall = orderedPicks.at(-1)?.overall ?? 0;

  const picksByTeam = new Map<number, Pick[]>();
  for (const t of draft.teams) picksByTeam.set(t.slot, []);
  for (const p of orderedPicks) picksByTeam.get(p.teamSlot)?.push(p);

  const setOrder = (order: number[]) => store.adminAction('SET_ORDER', { order });
  const randomize = () => {
    const order = shuffle(teams);
    setOrderText(order.join(', '));
    setOrder(order);
  };
  const applyOrderText = () => {
    const order = orderText
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n));
    if (order.length) setOrder(order);
  };

  const handleDrop = (slot: number) => {
    if (draggingOverall !== null) {
      store.adminAction('REASSIGN_PICK', { overall: draggingOverall, teamSlot: slot });
    }
    setDragOverSlot(null);
    setDraggingOverall(null);
  };

  const confirmRemove = (pick: Pick) =>
    setConfirm({
      title: `Undraft ${nameOf(pick.playerId)}?`,
      description: (
        <>
          Removes pick <strong>#{pick.overall}</strong> and returns the player to the pool. The team
          keeps its remaining picks; nothing is renumbered.
        </>
      ),
      confirmLabel: 'Undraft',
      onConfirm: () => store.adminAction('REMOVE_PICK', { overall: pick.overall }),
    });

  const confirmRewind = (overall: number) => {
    const count = orderedPicks.filter((p) => p.overall >= overall).length;
    const team = draft.teams.find(
      (t) => t.slot === orderedPicks.find((p) => p.overall === overall)?.teamSlot,
    );
    setConfirm({
      title: `Rewind to pick #${overall}?`,
      description: (
        <>
          This removes <strong>{count}</strong> pick{count === 1 ? '' : 's'} (#{overall}–#
          {lastOverall}) and puts {team ? team.name : `pick #${overall}`} back on the clock.
        </>
      ),
      confirmLabel: `Rewind to #${overall}`,
      onConfirm: () => store.adminAction('REWIND_TO', { overall }),
    });
  };

  const applyRewindText = () => {
    const n = Number(rewindText.trim());
    if (Number.isInteger(n) && n >= 1 && n <= lastOverall) confirmRewind(n);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Commissioner console</h1>
          <p className="text-sm text-muted-foreground">
            {teams} teams · {rounds} rounds · {draft.settings.mode} · {draft.settings.timerSec}s
            clock
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`/station${suffix}`} target="_blank" rel="noreferrer" className={LINK_BUTTON}>
            <MonitorPlay className="h-4 w-4" /> Station <ExternalLink className="h-3.5 w-3.5" />
          </a>
          <a href={`/board${suffix}`} target="_blank" rel="noreferrer" className={LINK_BUTTON}>
            <Tv className="h-4 w-4" /> Board <ExternalLink className="h-3.5 w-3.5" />
          </a>
          <a href={`/export${suffix}`} target="_blank" rel="noreferrer" className={LINK_BUTTON}>
            <FileDown className="h-4 w-4" /> Export board <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>

      {store.lastReject && (
        <Alert variant="destructive">
          <X className="h-4 w-4 shrink-0" />
          <div className="flex-1">
            <AlertTitle>Action rejected · {store.lastReject.code}</AlertTitle>
            <AlertDescription>{store.lastReject.message}</AlertDescription>
          </div>
        </Alert>
      )}

      {/* Status + quick controls */}
      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
            <div className="flex items-center gap-2">
              <Badge variant={live ? 'accent' : 'secondary'}>{draft.status}</Badge>
              <span className="text-xs text-muted-foreground">v{draft.version}</span>
            </div>
            <Stat label="Round" value={round ? `${round} / ${rounds}` : '—'} />
            <Stat
              label="Overall"
              value={draft.pointer ? `#${draft.pointer} / ${totalPicks}` : '—'}
            />
            <Stat
              label="On the clock"
              value={
                onClockSlot
                  ? (draft.teams.find((t) => t.slot === onClockSlot)?.name ?? `Team ${onClockSlot}`)
                  : '—'
              }
              accent
            />
            {live && (
              <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-1.5">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-lg font-black tabular-nums">{formatClock(remaining)}</span>
              </div>
            )}
            {starting && (
              <div className="flex items-center gap-2 rounded-lg bg-accent/10 px-3 py-1.5 text-accent">
                <Rocket className="h-4 w-4" />
                <span className="text-sm font-bold uppercase tracking-wide">Starting in</span>
                <span className="text-lg font-black tabular-nums">
                  {formatClock(startingRemaining)}
                </span>
              </div>
            )}
          </div>
          <Separator />
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => store.adminAction('START')}
              disabled={draft.status !== 'ORDER_SET'}
            >
              <Play className="h-4 w-4" /> Start
            </Button>
            {starting && (
              <Button onClick={() => store.adminAction('GO_LIVE')}>
                <Rocket className="h-4 w-4" /> Go now
              </Button>
            )}
            <Button variant="outline" onClick={() => store.adminAction('PAUSE')} disabled={!live}>
              <Pause className="h-4 w-4" /> Pause
            </Button>
            <Button
              variant="outline"
              onClick={() => store.adminAction('RESUME')}
              disabled={draft.status !== 'PAUSED'}
            >
              <Play className="h-4 w-4" /> Resume
            </Button>
            <Button
              variant="destructive"
              onClick={() => store.adminAction('UNDO')}
              disabled={draft.picks.length === 0}
            >
              <RotateCcw className="h-4 w-4" /> Undo last pick
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* The Reveal is playing — stay blind: never show the order here (DESIGN). */}
      {revealing && (
        <Card className="border-accent/50 bg-accent/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Clapperboard className="h-5 w-5 text-accent" /> The Reveal is playing on the board…
            </CardTitle>
            <CardDescription>
              The order has been rolled and is unveiling on the big board — kept hidden here so the
              room finds out together. Start unlocks the moment the show finishes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => store.adminAction('REVEAL_DONE')}>
              <SkipForward className="h-4 w-4" /> Skip to result
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Draft order (pre-start) */}
      {preStart && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Draft order</CardTitle>
            <CardDescription>
              Run the reveal show, or set / randomize the order manually before starting.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              size="lg"
              className="w-full"
              onClick={() => store.adminAction('START_REVEAL', { game: 'envelopes' })}
            >
              <Clapperboard className="h-5 w-5" /> Run The Reveal 🎬
            </Button>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={orderText}
                onChange={(e) => setOrderText(e.target.value)}
                placeholder="1, 2, 3, …"
                className="max-w-xs"
              />
              <Button variant="outline" onClick={applyOrderText}>
                Set order
              </Button>
              <Button variant="outline" onClick={randomize}>
                <Shuffle className="h-4 w-4" /> Randomize
              </Button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {draft.order.map((slot, i) => {
                const team = draft.teams.find((t) => t.slot === slot);
                return (
                  <Badge key={slot} variant="outline" className="gap-1.5 tabular-nums">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: teamColor(team) }}
                      aria-hidden
                    />
                    {i + 1}. {team?.name ?? `Team ${slot}`}
                  </Badge>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Rosters board with drag-and-drop */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-lg font-bold tracking-tight">
            <Users className="h-5 w-5 text-accent" /> Rosters
          </h2>
          <p className="text-xs text-muted-foreground">
            Drag a player to another team to reassign · hover a player to undraft
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {draft.teams.map((team) => (
            <TeamColumn
              key={team.slot}
              name={team.name}
              color={teamColor(team)}
              ownerLabel={team.ownerLabel}
              picks={picksByTeam.get(team.slot) ?? []}
              nameOf={nameOf}
              onClock={team.slot === onClockSlot}
              isDropTarget={dragOverSlot === team.slot}
              isDragging={draggingOverall !== null}
              onDragOver={() => setDragOverSlot(team.slot)}
              onDragLeave={() => setDragOverSlot((s) => (s === team.slot ? null : s))}
              onDrop={() => handleDrop(team.slot)}
              onDragStartPick={(pick) => setDraggingOverall(pick.overall)}
              onDragEndPick={() => {
                setDraggingOverall(null);
                setDragOverSlot(null);
              }}
              onRemovePick={confirmRemove}
            />
          ))}
        </div>
      </section>

      {/* Rewind */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4" /> Rewind the draft
          </CardTitle>
          <CardDescription>
            Go back to an earlier pick — every pick from there on is removed and that team goes back
            on the clock.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="number"
              value={rewindText}
              onChange={(e) => setRewindText(e.target.value)}
              placeholder="pick #"
              className="max-w-[8rem]"
            />
            <Button
              variant="outline"
              onClick={applyRewindText}
              disabled={orderedPicks.length === 0}
            >
              Rewind to pick…
            </Button>
          </div>
          {orderedPicks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No picks yet — nothing to rewind.</p>
          ) : (
            <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
              {[...orderedPicks].reverse().map((pick) => (
                <button
                  key={pick.overall}
                  type="button"
                  onClick={() => confirmRewind(pick.overall)}
                  className="group flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-destructive/5"
                >
                  <span className="w-10 shrink-0 text-xs font-bold tabular-nums text-muted-foreground">
                    #{pick.overall}
                  </span>
                  <PositionChip position={pick.position} />
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {nameOf(pick.playerId)}
                  </span>
                  <span className="hidden shrink-0 truncate text-xs text-muted-foreground sm:block">
                    {draft.teams.find((t) => t.slot === pick.teamSlot)?.name}
                  </span>
                  <span className="shrink-0 text-xs font-medium text-destructive opacity-0 transition-opacity group-hover:opacity-100">
                    Rewind here
                  </span>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {confirm && <ConfirmDialog req={confirm} onClose={() => setConfirm(null)} />}
    </div>
  );
}
