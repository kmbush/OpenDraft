# Running a Draft with OpenDraft

A commissioner's end-to-end guide to running your league's draft. This covers how to **use** OpenDraft —
setup, going live, the live draft, mid-draft fixes, and the recap. For architecture see
[`DESIGN.md`](DESIGN.md); for deploying to AWS see [`../infra/README.md`](../infra/README.md); to run it
locally with no AWS see [`../tools/dev-server/README.md`](../tools/dev-server/README.md).

## The three screens

OpenDraft is one app with four routes. As commissioner you drive three of them:

| Route | Who uses it | What it is |
|---|---|---|
| `/admin` | You (passcode) | The commissioner console: setup + live controls |
| `/board` | The room (TV) | The big-screen show: on-the-clock, clock, announcements |
| `/station` | The table (laptop) | Where picks are made |
| `/export` | You, after | The final board + PDF |

All screens stay in sync automatically. A refresh or a dropped-and-reconnected laptop recovers on its own —
no state is lost. The console has one-click links to open the Station, Board, and Export in new tabs.

---

## 1. Setup (the admin console)

Go to `/admin` and sign in with the league passcode. You land on **New draft**, a single form. Everything
below has sensible defaults, so you can accept them and hit **Create draft**, or tune each part.

### League & format

- **League name** — shows on the board, station, and export.
- **Teams** — 1–32. The team editor below grows/shrinks to match.
- **Rounds** — total rounds; `teams × rounds` = total picks.
- **Draft order** — **Snake** (order reverses every even round) or **Linear** (same order every round).
- **Pick timer (seconds)** — each team's clock. Default 90.
- **Waiting window (seconds)** — the "the pick is in" announcement window between picks, during which
  stations are locked. Default 10.
- **Go-live countdown (seconds)** — the "DRAFT IS LIVE IN…" hype countdown shown after you hit Start,
  before the first pick clock. Default 30; set `0` to skip straight to the first pick.
- **Player pool** — the snapshot id to draft from. Use **`bundled`** for the shipped pool, or a dated
  snapshot id. The form checks it live and shows the player count; if it can't load, you'll see a warning
  (stations would have nothing to draft).
- **Show bye weeks** — toggles each player's bye week on the station.

### Roster format

Start from a **preset**, then fine-tune any slot with the −/+ steppers:

| Preset | Shape |
|---|---|
| **Standard** | 1 QB, 2 RB, 2 WR, 1 TE, 1 K, 1 DEF, 1 FLEX, 6 bench |
| **Superflex** | Standard + 1 SUPERFLEX |
| **IDP** | Standard + 1 DL, 1 LB, 1 DB, 1 IDP FLEX |
| **2-QB** | Standard with 2 QB |

The editor groups slots into **Starters** (QB/RB/WR/TE/K/DEF), **Flex** (FLEX = RB/WR/TE, SUPERFLEX =
QB/RB/WR/TE, IDP FLEX = DL/LB/DB), **IDP starters** (DL/LB/DB, optional), and **Bench**. The header shows a
running total (starters · bench · total). A slot set to 0 is simply omitted.

Your roster shape does two things beyond counting slots: the **station only offers positions your roster can
hold** (a standard league hides DL/LB/DB), and it sets **per-position caps** so a timer auto-pick can't hand
a team, say, a 4th QB.

### League branding

- **Accent color** — pick from the palette; it themes the board, station, admin, and export.
- **Logo** — paste a URL, or upload a small image (PNG/SVG, under 40 KB, stored inline for now). Shows on
  the board and export.

The league name from the top of the form rides along with the branding.

### Teams

One row per team: a **color swatch** (click to repick from the palette), a **name**, and an **optional
owner**. Colors carry each team's identity across the board, station, rosters, and export. Blank names fall
back to "Team N".

When everything looks right, hit **Create draft**. The console switches to live **Controls**.

---

## 2. Draft order

In Controls, before you start, set the order one of three ways:

- **Run The Reveal 🎬** — the animated **envelope draft lottery**. The order is rolled and committed, then
  the **board** plays a 30-second "THE REVEAL BEGINS IN…" countdown and unveils each pick as a flipping
  envelope, ending on the #1 overall pick with confetti. It's **blind to everyone, including you** — the
  console shows only "The Reveal is playing on the board…" so the room finds out together. Start unlocks the
  moment the show finishes; **Skip to result** ends it early.
- **Randomize** — instantly shuffles the order (no show).
- **Set order manually** — type slots like `1, 2, 3, …` and hit **Set order**.

The current order shows as color-coded team chips. You can re-set it any time until you Start.

---

## 3. Go live

Hit **Start**. If your go-live countdown is above 0, the board shows a full-screen **"DRAFT IS LIVE IN
0:30"** countdown with the first team highlighted, building anticipation. Impatient? **Go now** jumps
straight to the first pick clock. (With the countdown set to 0, Start goes live immediately.)

---

## 4. The live draft

Two screens run the show.

### The station (the drafting laptop)

The station always picks for **whoever is on the clock** — it isn't tied to one team. A colored hero banner
reads **"Picking for: <team>"** with the round, pick number, and a live clock (it turns red under 10s).

- **Roster** (left) — the on-clock team's picks laid into labeled slots (QB, FLEX, BN, …), filling as they
  draft. A just-made pick appears instantly (pending) and settles when confirmed.
- **Available players** (right) — grouped by position, alphabetical within each group, showing NFL team and
  bye week. **No ranking or ADP anywhere.** Narrow it with the **position-filter pills** (All + each
  position your roster uses) or the **search box** (by name or team).
- **Draft** — click a player's **Draft** button, confirm in the dialog, and the pick is made. Draft buttons
  are disabled unless that team is genuinely on the clock.

If the clock hits **zero**, OpenDraft **auto-picks a random *legal* player** for that team (respecting your
roster's position caps) and the draft moves on. Auto-picks are flagged on the board and recent-picks list.

Because stations aren't team-bound, the common setup is **one shared laptop** passed around the table — but
any number of clients can connect, including a remote player opening `/station` on their own device to make
their pick.

### The board (the TV)

A full-screen broadcast stage:

- **On the clock** — the current team in big type with a **countdown ring** in their color (it escalates to
  amber under 30s, red under 10s).
- **On deck** — the next few teams.
- **Recent picks** — a live rail of the latest selections (player, NFL team, drafting team; auto-picks
  marked).
- **The announcement** — after every pick, a locked takeover plays the beats: **"THE PICK IS IN"** → a held
  beat → **the pick announced** (player, position, NFL team, with confetti) → **"ON THE CLOCK: <next
  team>"**. **Stations are locked for this whole window** — nobody can draft until the board calls the next
  team. Its length is your waiting-window setting.

The top strip shows round, overall pick, and a Live / Paused / Offline indicator.

---

## 5. Admin controls (mid-draft)

The console's status card and Rosters board let you fix anything without disturbing the draft:

- **Pause / Resume** — freeze the clock (the station and board both show "paused") and pick back up where
  you left off.
- **Undo last pick** — roll back the most recent pick; the player returns to the pool and that team goes
  back on the clock. Repeatable.
- **Rewind the draft** — jump back to any earlier pick. Everything from that pick onward is removed and that
  team goes back on the clock. Pick from the list or type a pick number; you'll get a confirmation showing
  how many picks it removes.
- **Undraft a player** — hover a player chip in the **Rosters** board and click the **✕** to return just
  that player to the pool. The team keeps its other picks; nothing is renumbered.
- **Reassign a pick** — **drag a player chip from one team's column to another** to move that pick between
  teams.

Every control confirms destructive actions, and the server validates each one, so a mistake is always
recoverable. If an action is rejected (e.g. a stale click), the console shows why.

### After it completes

When the last pick is in, the board celebrates and the status flips to **COMPLETE**. A **Start a new draft**
button appears in the console: it returns you to the setup form **pre-filled from this league** (teams,
format, branding, pool) so re-running next year is one click plus Create. The finished draft stays saved and
exportable.

---

## 6. After the draft

Open **Export board** (`/export`) from the console, or the link on the board's completion screen.

- A **print-ready board grid**: columns are teams in draft order, rows are rounds, each cell the player that
  team took that round (with position color and NFL team). Your league name, logo, and accent theme carry
  through.
- **Download PDF** — opens the browser's print dialog; choose **Save as PDF** and **landscape** for the best
  result.

The export is a standalone page you can open any time for a completed draft.
</content>
