/**
 * Admin console + setup (DESIGN §5.4, §7). Passcode → HMAC session token held in
 * the store; admin action envelopes carry it as top-level `token`. The UI is
 * gated but the server enforces (AD-8). Setup creates league/draft/teams and the
 * draft order (manual + plain randomize; the animated reveal is Phase 2).
 */
import {
  DEFAULT_ROSTER_PRESET,
  type DraftSettings,
  IDP_FLEX_ELIGIBILITY,
  type RosterFormat,
  SUPERFLEX_ELIGIBILITY,
} from '@opendraft/shared';
import { useState } from 'react';
import { api, connect } from '../net.js';
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

export function AdminView() {
  const store = useLiveStore();
  const { draft, adminToken } = store;

  if (!adminToken) return <Login />;
  return (
    <div className="admin">
      <h1>Admin</h1>
      {!draft ? <Setup /> : <Controls />}
    </div>
  );
}

function Login() {
  const setAdminToken = useLiveStore((s) => s.setAdminToken);
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    try {
      const res = await api.post<{ token: string }>('/admin/session', { passcode });
      setAdminToken(res.token);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Login failed');
    }
  }

  return (
    <div className="login">
      <h1>Admin login</h1>
      <input
        type="password"
        placeholder="Passcode"
        value={passcode}
        onChange={(e) => setPasscode(e.target.value)}
      />
      <button type="button" onClick={submit}>
        Sign in
      </button>
      {error && <p className="reject">{error}</p>}
    </div>
  );
}

function Setup() {
  const store = useLiveStore();
  const [name, setName] = useState('My League');
  const [teams, setTeams] = useState(10);
  const [rounds, setRounds] = useState(15);
  const [mode, setMode] = useState<'snake' | 'linear'>('snake');
  const [timerSec, setTimerSec] = useState(90);
  const [waitingSec, setWaitingSec] = useState(8);
  const [preset, setPreset] = useState<keyof typeof ROSTER_PRESETS>('standard');
  const [poolSnapshotId, setPoolSnapshotId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createDraft() {
    setBusy(true);
    setError(null);
    try {
      const token = store.adminToken ?? undefined;
      await api.post('/leagues', { name }, token);
      const settings: DraftSettings = {
        teams,
        rounds,
        mode,
        timerSec,
        waitingSec,
        rosterFormat: ROSTER_PRESETS[preset] ?? DEFAULT_ROSTER_PRESET,
      };
      const created = await api.post<{ draftId: string }>(
        '/leagues/dev-league/drafts',
        { settings, ...(poolSnapshotId ? { poolSnapshotId } : {}) },
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

  return (
    <div className="setup">
      <h2>Create draft</h2>
      <label>
        League name <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label>
        Teams <input type="number" value={teams} onChange={(e) => setTeams(+e.target.value)} />
      </label>
      <label>
        Rounds <input type="number" value={rounds} onChange={(e) => setRounds(+e.target.value)} />
      </label>
      <label>
        Mode
        <select value={mode} onChange={(e) => setMode(e.target.value as 'snake' | 'linear')}>
          <option value="snake">Snake</option>
          <option value="linear">Linear</option>
        </select>
      </label>
      <label>
        Roster
        <select
          value={preset}
          onChange={(e) => setPreset(e.target.value as keyof typeof ROSTER_PRESETS)}
        >
          <option value="standard">Standard</option>
          <option value="superflex">Superflex</option>
          <option value="idp">IDP</option>
        </select>
      </label>
      <label>
        Pick timer (s){' '}
        <input type="number" value={timerSec} onChange={(e) => setTimerSec(+e.target.value)} />
      </label>
      <label>
        Waiting (s){' '}
        <input type="number" value={waitingSec} onChange={(e) => setWaitingSec(+e.target.value)} />
      </label>
      <label>
        Pool snapshot id{' '}
        <input
          value={poolSnapshotId}
          onChange={(e) => setPoolSnapshotId(e.target.value)}
          placeholder="e.g. 2026-07-03"
        />
      </label>
      <button type="button" disabled={busy} onClick={createDraft}>
        Create draft
      </button>
      {error && <p className="reject">{error}</p>}
    </div>
  );
}

function Controls() {
  const store = useLiveStore();
  const draft = store.draft;
  const [orderText, setOrderText] = useState('');
  const [onClock, setOnClock] = useState(1);
  if (!draft) return null;

  const setOrder = (order: number[]) => store.adminAction('SET_ORDER', { order });
  const randomize = () => {
    const order = shuffle(draft.settings.teams);
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

  return (
    <div className="controls">
      <p>
        Status: <strong>{draft.status}</strong> · version {draft.version} · pick #{draft.pointer}
      </p>

      <fieldset>
        <legend>Order (pre-start)</legend>
        <input
          value={orderText}
          onChange={(e) => setOrderText(e.target.value)}
          placeholder="1, 2, 3, …"
        />
        <button type="button" onClick={applyOrderText}>
          Set order
        </button>
        <button type="button" onClick={randomize}>
          Randomize
        </button>
      </fieldset>

      <div className="buttons">
        <button type="button" onClick={() => store.adminAction('START')}>
          Start
        </button>
        <button type="button" onClick={() => store.adminAction('PAUSE')}>
          Pause
        </button>
        <button type="button" onClick={() => store.adminAction('RESUME')}>
          Resume
        </button>
        <button type="button" onClick={() => store.adminAction('UNDO')}>
          Undo
        </button>
      </div>

      <fieldset>
        <legend>Set on the clock</legend>
        <input type="number" value={onClock} onChange={(e) => setOnClock(+e.target.value)} />
        <button
          type="button"
          onClick={() => store.adminAction('SET_ON_CLOCK', { overall: onClock })}
        >
          Jump to pick #{onClock}
        </button>
      </fieldset>
    </div>
  );
}
