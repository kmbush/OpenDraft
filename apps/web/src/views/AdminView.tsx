/**
 * Admin console + setup (DESIGN §5.4, §7). Passcode → HMAC session token held in
 * the store; admin action envelopes carry it as top-level `token`. The UI is
 * gated but the server enforces (AD-8). Setup creates league/draft/teams and the
 * draft order; the pool defaults to a working snapshot and shows its player count
 * so a created draft is always draftable.
 */
import { roundForOverall } from '@opendraft/engine';
import {
  type DraftSettings,
  IDP_POSITIONS,
  OFFENSE_POSITIONS,
  type Pick,
  type Position,
} from '@opendraft/shared';
import {
  CheckCircle2,
  Clapperboard,
  Clock,
  ExternalLink,
  FileDown,
  FilePlus2,
  GripVertical,
  History,
  Loader2,
  Lock,
  Minus,
  MonitorPlay,
  Palette,
  Pause,
  Play,
  Plus,
  Rocket,
  RotateCcw,
  Shuffle,
  SkipForward,
  Tv,
  Users,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { PositionBadge } from '../components/position-badge.js';
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
import { Modal } from '../components/ui/modal.js';
import { Select } from '../components/ui/select.js';
import { Separator } from '../components/ui/separator.js';
import { useLeague } from '../hooks/useLeague.js';
import { fetchPoolCount, indexPlayers, playerName, usePool } from '../hooks/usePool.js';
import { useTicker } from '../hooks/useTicker.js';
import { formatClock, remainingMs } from '../lib/clock.js';
import { cn } from '../lib/cn.js';
import { POSITION_COLOR } from '../lib/positions.js';
import { ROSTER_PRESETS, type RosterSpec, buildRosterFormat } from '../lib/roster.js';
import {
  DEFAULT_SETUP_SEED,
  type SetupSeed,
  type TeamConfig,
  draftToSetupSeed,
  resizeTeamConfigs,
} from '../lib/setupSeed.js';
import { TEAM_COLORS, teamColor } from '../lib/teams.js';
import { ACCENT_PALETTE } from '../lib/theme.js';
import { LEAGUE_ID, api, connect, disconnect } from '../net.js';
import { useLiveStore } from '../store/store.js';

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
  // Carries a finished draft's config across the Controls → Setup switch so the
  // next draft's form is pre-filled (null = first-run defaults).
  const [seed, setSeed] = useState<SetupSeed | null>(null);
  if (!adminToken) return <Login />;
  return draft ? <Controls onNewDraft={setSeed} /> : <Setup seed={seed ?? DEFAULT_SETUP_SEED} />;
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

/** A compact −/value/+ counter used across the roster editor. */
function Stepper({
  label,
  value,
  onChange,
  color,
  min = 0,
  max = 9,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  color?: string;
  min?: number;
  max?: number;
}) {
  const set = (v: number) => onChange(Math.max(min, Math.min(max, v)));
  return (
    <div className="flex items-center justify-between rounded-md border border-border bg-card px-2.5 py-1.5">
      <span className="flex items-center gap-1.5 text-sm font-medium">
        {color && (
          <span className="h-3.5 w-1 rounded-full" style={{ backgroundColor: color }} aria-hidden />
        )}
        {label}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label={`Decrease ${label}`}
          onClick={() => set(value - 1)}
          disabled={value <= min}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted disabled:opacity-30"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <span className="w-6 text-center text-sm font-bold tabular-nums">{value}</span>
        <button
          type="button"
          aria-label={`Increase ${label}`}
          onClick={() => set(value + 1)}
          disabled={value >= max}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted disabled:opacity-30"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

/** Full roster editor: preset buttons prefill steppers for starters, flex, and bench. */
function RosterEditor({
  spec,
  onChange,
}: {
  spec: RosterSpec;
  onChange: (spec: RosterSpec) => void;
}) {
  const setStarter = (pos: Position, v: number) =>
    onChange({ ...spec, starters: { ...spec.starters, [pos]: v } });
  const format = buildRosterFormat(spec);
  const starterCount = Object.values(format.starters).reduce((n, c) => n + (c ?? 0), 0);
  const flexCount = format.flex.reduce((n, f) => n + f.count, 0);
  const total = starterCount + flexCount + spec.bench;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-4 w-4" /> Roster format
        </CardTitle>
        <CardDescription>
          Start from a preset, then tune each slot. {starterCount + flexCount} starters ·{' '}
          {spec.bench} bench · {total} total.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {ROSTER_PRESETS.map((p) => (
            <Button key={p.key} variant="outline" size="sm" onClick={() => onChange(p.spec)}>
              {p.label}
            </Button>
          ))}
        </div>

        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Starters
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {OFFENSE_POSITIONS.map((pos) => (
              <Stepper
                key={pos}
                label={pos}
                color={POSITION_COLOR[pos]}
                value={spec.starters[pos]}
                onChange={(v) => setStarter(pos, v)}
              />
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Flex
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Stepper
              label="FLEX"
              value={spec.flex}
              onChange={(v) => onChange({ ...spec, flex: v })}
            />
            <Stepper
              label="SUPERFLEX"
              value={spec.superflex}
              onChange={(v) => onChange({ ...spec, superflex: v })}
            />
            <Stepper
              label="IDP FLEX"
              value={spec.idpFlex}
              onChange={(v) => onChange({ ...spec, idpFlex: v })}
            />
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            IDP starters <span className="normal-case opacity-70">(optional)</span>
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {IDP_POSITIONS.map((pos) => (
              <Stepper
                key={pos}
                label={pos}
                color={POSITION_COLOR[pos]}
                value={spec.starters[pos]}
                onChange={(v) => setStarter(pos, v)}
              />
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Stepper
            label="Bench (BN)"
            value={spec.bench}
            onChange={(v) => onChange({ ...spec, bench: v })}
            max={20}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function Setup({ seed }: { seed: SetupSeed }) {
  const store = useLiveStore();
  const [name, setName] = useState(seed.name);
  const [teams, setTeams] = useState(seed.teams);
  const [teamRows, setTeamRows] = useState<TeamConfig[]>(seed.teamRows);
  const [rounds, setRounds] = useState(seed.rounds);
  const [mode, setMode] = useState<'snake' | 'linear'>(seed.mode);
  const [timerSec, setTimerSec] = useState(seed.timerSec);
  const [waitingSec, setWaitingSec] = useState(seed.waitingSec);
  const [goLiveCountdownSec, setGoLiveCountdownSec] = useState(seed.goLiveCountdownSec);
  const [showByeWeeks, setShowByeWeeks] = useState(seed.showByeWeeks);
  const [roster, setRoster] = useState<RosterSpec>(seed.roster);
  const [poolSnapshotId, setPoolSnapshotId] = useState(seed.poolSnapshotId);
  const [poolCount, setPoolCount] = useState<number | null>(null);
  const [poolChecking, setPoolChecking] = useState(false);
  const [accent, setAccent] = useState(seed.accent);
  const [logoUrl, setLogoUrl] = useState(seed.logoUrl);
  const [logoData, setLogoData] = useState(seed.logoData);
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
        showByeWeeks,
        rosterFormat: buildRosterFormat(roster),
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

          <label className="flex cursor-pointer items-center gap-2.5 text-sm">
            <input
              type="checkbox"
              checked={showByeWeeks}
              onChange={(e) => setShowByeWeeks(e.target.checked)}
              className="h-4 w-4 rounded border-border accent-accent"
            />
            <span>
              <span className="font-medium">Show bye weeks</span>
              <span className="ml-1 text-muted-foreground">
                — display each player's bye on the station.
              </span>
            </span>
          </label>
        </CardContent>
      </Card>

      <RosterEditor spec={roster} onChange={setRoster} />

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
    <Modal onClose={onClose}>
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
    </Modal>
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
      <PositionBadge position={pick.position} className="h-5 w-8 shrink-0 rounded" />
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

function Controls({ onNewDraft }: { onNewDraft: (seed: SetupSeed) => void }) {
  const store = useLiveStore();
  const draft = store.draft;
  const draftId = store.draftId;
  const league = useLeague();
  const pool = usePool(draft?.poolSnapshotId);
  const now = useTicker();
  const [orderText, setOrderText] = useState('');
  const [rewindText, setRewindText] = useState('');
  const [dragOverSlot, setDragOverSlot] = useState<number | null>(null);
  const [draggingOverall, setDraggingOverall] = useState<number | null>(null);
  const [confirm, setConfirm] = useState<Confirmation | null>(null);

  const byId = useMemo(() => indexPlayers(pool.players), [pool.players]);
  if (!draft) return null;

  const nameOf = (id: string): string => playerName(byId, id);

  const { teams, rounds } = draft.settings;
  const totalPicks = teams * rounds;
  const suffix = draftId ? `?draft=${draftId}` : '';
  const preStart = draft.status === 'SETUP' || draft.status === 'ORDER_SET';
  const complete = draft.status === 'COMPLETE';
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

  // Back to Setup for the next draft: snapshot this draft's config as the form
  // seed, tear the WS down so the old (finished) draft can't bleed in, drop the
  // mirror + saved draftId, and keep the admin signed in. The old draft is
  // untouched — still viewable/exportable at /export?draft=<oldId>.
  const startNewDraft = () => {
    const nextSeed = draftToSetupSeed(draft, league);
    disconnect();
    localStorage.removeItem('opendraft.draftId');
    store.resetDraft();
    onNewDraft(nextSeed);
  };

  const confirmNewDraft = () =>
    setConfirm({
      title: 'Start a new draft?',
      description: 'The finished draft stays saved and exportable; this returns you to setup.',
      confirmLabel: 'Start a new draft',
      onConfirm: startNewDraft,
    });

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
          {complete && (
            <Button onClick={confirmNewDraft}>
              <FilePlus2 className="h-4 w-4" /> Start a new draft
            </Button>
          )}
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
                  <PositionBadge position={pick.position} className="h-5 w-8 shrink-0 rounded" />
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
