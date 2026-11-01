import { View, div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { agents, hc, nextCommand, spaces, panes, props, run, setAgentOrder, knownAgents, layout, notify } from "herdr";
import { options, setOption, optionsDialog, openOptions } from "./options.js";
import { ink, WALL, SLOT_W, SLOT_H, SCREEN, CATS, RUGS, r, icon, txt, hash, rng, pick, look, deskLook, clutter, seated, standing, cat, room, spectator, DEV_W, DEV_H, PETS, WALK_MS } from "./art.js";
import { LINES } from "./lines.js";
import { panel } from "./panel.js";
import { spaceLabel, tabLabel, tabName } from "./names.js";
import { spaceName, tabText } from "./privacy.js";
import { ONE_SHOTS, CHIP_KEY, startOneShot, devLevel, byLastActive, DESK_AGES, powerStep, powerShown, loadPower, POWER_FULL, findBlock, keepMin, shouldClearMin, MIN_GUARD_MS, MIN_TROUBLE, canKnock, pileSize, parseSubCommand, pruneSubs, subDesks, foldSubs, trackWaiting } from "./rules.js";
import { pickLine } from "./lines.js";

// A pixel-art office: every agent is a little worker at a desk, and each space gets its own
// group of desks on a rug. Idle workers wander, and everyone (the cat too) keeps to the walkways:
// the corridor along the wall, the aisle behind each row of desks, and the lanes past both ends
// of the rows and between the groups.
const wood = "#8a5530";
const DEMO = [["working", "fix login"], ["blocked", "migrate db"], ["done", "write tests"], ["idle", "docs"], ["working", "refactor api"], ["idle", "triage"], ["idle", "lunch"], ["done", "ship it"], ["working", "perf pass"], ["idle", "standup"], ["blocked", "deploy"], ["idle", "coffee"]]
  .map(([status, tab_name], i) => {
    const space_name = i < 5 ? "web" : i < 9 ? "api" : "infra";
    return { address: `demo${i}`, status, tab_name, space: space_name, space_name, title: "", program: null, focused: i === 0 };
  });
const MIN = 60 * 1000;
const W1 = ["working", "idle", "idle", "idle", "idle", "idle"];
const left = (n, t) => Math.max(0, n - t);
// Panel demo: one state at a time (several animated spectators at once is too slow for one render).
const DEMO_STATES = [
  ["Level 1: one agent working", ["working", "idle", "idle", "idle", "idle", "idle"], false],
  ["Level 2: two or three working", ["working", "working", "working", "idle", "idle", "idle"], false],
  ["Level 3: four+ (or all) working", ["working", "working", "working", "working", "working", "done"], false],
  ["Agent finished: party popper", ["working", "done", "idle", "idle", "idle", "idle"], true],
  ["Agent blocked: wah wah", ["working", "working", "blocked", "idle", "idle", "idle"], false],
  ["PR merged: KABOOM", ["done", "done", "idle", "idle", "idle", "idle"], false, true],
  // m(tick) overrides the metrics the mood is picked from, for that second of the state
  ["Working 30+ min: glazed over", W1, false, false, () => ({ longestWorkingMs: 35 * MIN })],
  ["Finish: fist pump", ["working", "done", "idle", "idle", "idle", "idle"], true, false, (t) => ({ fx: { finishPump: left(3, t) } })],
  ["Blocked: phone", ["working", "blocked", "idle", "idle", "idle", "idle"], false, false, (t) => ({ fx: { blockedPhone: left(4, t) } })],
  ["All done: collapse", ["done", "done", "done", "idle", "idle", "idle"], false, false, (t) => ({ fx: { collapse: left(5, t) } })],
  ["Two blocked: which one?!", ["working", "blocked", "blocked", "idle", "idle", "idle"], false, false],
  ["Blocked 2+ min: THAT one", ["working", "blocked", "idle", "idle", "idle", "idle"], false, false,
    () => ({ longestBlockedMs: 3 * MIN, longestBlockedAddr: "demo-1" })],
  ["3 done in a minute: burst", ["done", "done", "done", "working", "idle", "idle"], true, false, (t) => ({ fx: { burstDance: left(6, t) } })],
  ["Agent crashed: oh no", W1, false, false, (t) => ({ fx: { errorWince: left(4, t) } })],
  ["New agent: welcome", W1, false, false, (t) => ({ fx: { newAgentWelcome: left(3, t) }, welcomeAddr: "demo-5" })],
  ["After 10pm: nightcap", W1, false, false, () => ({ hour: 23 })],
  ["Ignored 5+ min: fourth wall", W1, false, false, () => ({ userIdleMs: 6 * MIN })],
  ["10+ agents seen: how many?", ["working", "working", "idle", "idle", "idle", "idle"], false, false, () => ({ seen: 12 })],
  ["All blocked: meltdown", ["blocked", "blocked", "blocked", "idle", "idle", "idle"], false, false],
  ["Same agent x3: streak", ["done", "working", "working", "idle", "idle", "idle"], true, false,
    (t) => ({ fx: { streak: left(4, t) }, streakAddr: "demo-0" })],
  ["6+ working: chaos", ["working", "working", "working", "working", "working", "working"], false, false,
    (t) => ({ fx: { levelUp: left(2, t) } })],
  ["Blocked: Are you sure? Yes", ["working", "blocked", "idle", "idle", "idle", "idle"], false, false,
    (t) => ({ fx: { areYouSure: left(4, t) }, aysAddr: "demo-1" })],
  ["Quiet 10+ min: dozing", ["idle", "idle", "idle", "idle", "idle", "idle"], false, false, () => ({ idleMs: 11 * MIN, idleTalk: true })],
  ["Nothing running: empty chair", ["idle", "idle", "idle", "idle", "idle", "idle"], false],
  // desks idle 2h (a cobweb) and 10h (covered); the 7th element is the ms each desk has been idle
  ["Power full: POWER!", ["working", "working", "working", "working", "idle", "idle"], false, false, (t) => ({ fx: { powerUp: left(4, t) } })],
  ["Old agents: cobwebs", ["working", "done", "idle", "idle", "idle", "idle"], false, false, null, [0, 30 * MIN, 2 * 60 * MIN, 2 * 60 * MIN, 10 * 60 * MIN, 10 * 60 * MIN]],
  // the 8th element: sub-agents on a desk, { desk index: [done, total] }
  ["Sub-agents: 2/5 on one desk", ["working", "idle", "idle", "done", "idle", "idle"], false, false, null, [0, 0, 0, 4 * MIN, 0, 0], { 0: [2, 5] }],
];
const OWNER = "commands-owner"; // localStorage key: which panel build takes commands
const BANNERS = { merged: "PR MERGED", deployed: "DEPLOYED", pushed: "IT'S LIVE" };
const POKES = 8;
const SHIP_MS = 2600; // how long the explosion stays on screen
const DEMO_MS = 5000;
const THOUGHTS = ["?", "!", "♪", "♥", "...", "☼", "$", "#"];
const SPOTS = ["cooler", "cooler", "shelfL", "shelfR", "window", "door", "plant", "floor", "floor", "chat", "chat"];
const WALK = 0.11, CAT_WALK = 0.07; // px per ms
const busy = (a) => a.status === "working" || a.status === "blocked";

const GAP = 60; // the walkway between two spaces' desks, in slot units
const DVD = ["#e05a8a", "#5ab0e0", "#e0c040", "#7ee0a0", "#c08ae0", "#f08a4a"];

// Two rows of desks (more only when two would get too small), one group of columns per space,
// sized to fit. The scale snaps to whole half pixels per art pixel (s), so desks and workers
// grow together and stay crisp.
function fit(groups, w, h) {
  let best;
  for (let rows = 2; rows <= 6; rows++) {
    const cols = groups.map((n) => Math.max(groups.length > 1 ? 1 : 3, Math.ceil(n / rows)));
    const units = cols.reduce((a, b) => a + b, 0) * SLOT_W + (groups.length - 1) * GAP;
    const k = Math.min(1, (w - 200) / units, (h - WALL) / (rows * SLOT_H + 40));
    if (!best || k > best.k + 0.08) best = { k, cols, rows };
  }
  const s = Math.max(1, Math.floor(best.k * 6) / 2);
  return { ...best, k: s / 3, s };
}

// The room (wall, floor, furniture) is half of everything drawn, and changes only with the size,
// the minute and the door: a retained view of its own, rebuilt only then.
class Room extends View {
  init(p) { this.p = p; }
  update(p) { this.p = p; }
  render() {
    const { w, h, seed, at, door } = this.p;
    return div().absolute().left(0).top(0).w(w).h(h).children(room(w, h, { seed, now: new Date(at), doorOpen: door }));
  }
}

// Which view a copy draws: "panel" (default, the sidebar), "office" (full-width room), "rail", "pane".
const roleOf = (p) => p?.role ?? "panel";

export default class Office extends View {
  init(_p, cx) {
    // Opened as the Options dialog: just that, none of the panel's timers.
    if (props()?.options) { this.handle = cx.focus_handle(); return; }
    this.size = { width: 1200, height: 420 };
    this.seed = Math.floor(Math.random() * 2 ** 31);
    this.trips = {};     // address → { phase: enter|going|there|back, path, i, until, spot, hurry }
    this.thoughts = {};  // address → { sym, until }
    this.seats = {};     // address → { x, y, row }
    this.geo = null;
    this.known = null;
    this.door = 0;
    this.hover = null;
    this.minute = -1;
    this.n = 0;
    this.cat = { coat: pick(rng(this.seed), CATS), path: null, i: 0, until: 0, left: false };
    this.list = [];
    if (roleOf(props()) === "panel") {
      // Background helpers (hc run --bg) aren't in agents(). Ask hc for them off the render path:
      // reading terminals() during render can stall on a slow remote machine and get the render cut off.
      this.helpers = [];
      const poll = (cx) => cx.spawn(async () => {
        try {
          const out = await hc(["ls", "--all", "--json"]);
          const all = JSON.parse(out.stdout).terminals ?? [];
          const ts = all.filter((t) => t.state === "live");
          const next = ts.filter((t) => t.status)
            .map((t) => ({ address: t.address, status: t.status, tab_name: t.name ?? t.address, program: null, app: t.agent ?? null, focused: false }));
          const m = this.m;
          // An agent we were showing that has since exited with a non-zero code: wince.
          const fin = all.filter((t) => t.state === "finished");
          if (m.finishedSeen && fin.some((t) => !m.finishedSeen.has(t.address) && m.seen.has(t.address) && (t.exit_code ?? 0) > 0)) {
            startOneShot(m, "errorWince");
            cx.notify();
          }
          m.finishedSeen = new Set(fin.map((t) => t.address));
          // When each busy agent entered its status, from hc: survives reloads, unlike our own stamps.
          // Busy ones every poll (how long they've been at it); the rest once per status (when they
          // stopped: the desks' last-active order and their cobwebs).
          for (const t of ts.filter((t) => t.status && (t.status === "working" || t.status === "blocked" || m.hcSince[t.address]?.status !== t.status))) {
            try {
              const g = JSON.parse((await hc(["get", t.address, "--json"])).stdout);
              if (g.status_ms) m.hcSince[t.address] = { status: g.status?.state ?? t.status, at: g.status_ms };
            } catch {}
          }
          const key = JSON.stringify(next);
          const partyOver = this.partyUntil && Date.now() > this.partyUntil;
          if (partyOver) this.partyUntil = 0;
          this.polled = true;
          if (key !== this.helpersKey || partyOver) { this.helpersKey = key; this.helpers = next; cx.notify(); }
        } catch {}
      });
      // What the mood is picked from (see trackMetrics); one-shots count down in ticks of the 1s timer.
      this.m = {
        local: {}, hcSince: {}, finishes: [], seen: new Set(), finishedSeen: null, prevAddrs: null,
        prevWorking: 0, welcomeAddr: null, lastUser: Date.now(), lastFocus: undefined, bornAt: Date.now(), ships: 0,
        seed: this.seed, lastBusy: Date.now(), byAddr: {}, streakAddr: null, blocks: 0, aysAddr: null,
        prevLevel: 0, pokeLine: "",
        // the power bar: kept across reloads (a mod reload is any file save), forgotten after an hour
        power: (() => { try { return loadPower(localStorage.getItem("power"), localStorage.getItem("powerAt"), Date.now()); } catch { return 0; } })(),
        ...Object.fromEntries(ONE_SHOTS.map((k) => [k, 0])),
      };
      poll(cx);
      cx.timer.every(10000, poll);
      // demo: `herdr-app do sitandwatch.demo` or a click on the header toggles it
      this.demoAt = null;
      // Re-render while a one-shot runs, and every 15s anyway so the time-based moods (glazed,
      // blocked too long, ignored, late night) catch up. Nothing loops unless a mood draws it.
      let ticks = 0;
      cx.timer.every(1000, (cx) => {
        const partyOver = this.partyUntil && Date.now() > this.partyUntil;
        if (partyOver) this.partyUntil = 0;
        let changed = false;
        for (const k of ONE_SHOTS) if (this.m[k] > 0) { this.m[k]--; changed = true; }
        if (partyOver) startOneShot(this.m, "linger", 1);   // a second of confetti still drifting down
        this.wanderTick(cx);
        if (this.powerTick(token)) changed = true;
        this.minBusy = false;
        if (this.minCheck()) changed = true;
        if (this.knockTick(cx)) changed = true;
        const kept = pruneSubs(this.subs, Date.now());       // finished sub-agents leave, forgotten ones too
        if (Object.keys(kept).length !== Object.keys(this.subs).length) { this.subs = kept; changed = true; }
        if (this.demoAt != null || partyOver || changed || ++ticks % 15 === 0) cx.notify();
      });
      // `herdr-app do sitandwatch.ship` (sent by the Claude Code hook after a push) sets off the explosion:
      // stage 0 draws it squashed, stage 1 a moment later lets transition() blow it out, then it clears.
      this.ship = null;
      // developer mode: `herdr-app do sitandwatch.dev`, remembered across restarts
      // Claude Code sub-agents, from the hook: { [agent id]: { parent, at, doneAt } }
      this.subs = {};
      // minimised: { id, axis, saved (the size to restore), at, seen (what layout() said after) }, per copy
      const savedMin = (() => { try { return JSON.parse(localStorage.getItem("min") ?? "null"); } catch { return null; } })();
      this.min = keepMin(savedMin, (() => { try { return findBlock(layout()); } catch { return null; } })());
      if (savedMin && !this.min) try { localStorage.removeItem("min"); } catch {}
      // developer mode's pins; whether it's on is an option (shared, so the Options dialog sees it)
      this.dev = { mood: null, level: null };
      // A reload or a rebuilt view leaves the old loop below waiting too, and its cx keeps working,
      // so it would take commands and change a view nobody sees. The newest panel claims the
      // commands; an older loop that gets one hands it on and stops. localStorage, not setShared:
      // setting shared state re-renders every mod, and doing that from init loops the window.
      const token = Math.random().toString(36).slice(2);
      try { localStorage.setItem(OWNER, token); } catch {}
      cx.spawn(async (cx) => {
        for (;;) {
          const c = await nextCommand();
          let mine = false;
          try { mine = localStorage.getItem(OWNER) === token; cx.notify(); } catch { mine = false; }
          if (!mine) { try { run(`sitandwatch.${c}`); } catch {} return; }
          // One bad command never ends the loop: the hook's events and every later command still land.
          try {
          if (c === "demo") { this.toggleDemo(); cx.notify(); }
          // demo-<n>: the demo at state n (1-based), e.g. for recording one state
          const dn = /^demo-(\d+)$/.exec(c);
          if (dn && +dn[1] >= 1 && +dn[1] <= DEMO_STATES.length) { this.demoAt = Date.now() - (+dn[1] - 1) * DEMO_MS; cx.notify(); }
          if (c === "dev") { this.dev = { mood: null, level: null }; setOption({ dev: !options().dev }); cx.notify(); }
          // `herdr-app do sitandwatch.chaos` turns chaos mode on for good (or off again)
          if (c === "chaos") { setOption({ chaos: !options().chaos }); cx.notify(); }
          if (c === "options") openOptions();
          if (c === "wander") this.wanderTick(cx, true);
          if (c === "min") this.minimise(cx);
          // sub-start-<terminal>-<id> / sub-stop-...: a Claude Code sub-agent (the subagents hook)
          const sub = parseSubCommand(c);
          if (sub) this.subEvent(sub, cx);
          // desks-<1h|8h|real>: pretend every desk not busy has been idle that long (cobwebs)
          if (c.startsWith("desks-")) { const v = c.slice(6); this.dev.desks = DESK_AGES[v] ? v : null; cx.notify(); }
          // ship, ship-merged, ship-deployed: the hook says what shipped, for the banner
          if (c === "ship" || c.startsWith("ship-")) this.boom(c.slice(5), cx);
          // developer mode from the command line too: fire-<event>, mood-<name|auto>, level-<0..3|real>
          if (c.startsWith("fire-")) this.fire(c.slice(5), cx);
          if (c.startsWith("mood-")) { const v = c.slice(5); this.dev.mood = v === "auto" ? null : v; cx.notify(); }
          if (c.startsWith("level-")) { const v = c.slice(6); this.dev.level = v === "real" ? null : Number(v); cx.notify(); }
          // pets-<scene|auto>: force the pets into a scene (see PET_SCENES in rules.js)
          if (c.startsWith("pets-")) { const v = c.slice(5); this.dev.pets = v === "auto" ? null : v; cx.notify(); }
          } catch (e) { console.log("sitandwatch: command failed:", c, e?.message ?? e); }
        }
      });
    }
    if (roleOf(props()) !== "office") return;
    this.roomView = cx.new(Room, this.roomProps());
    cx.timer.every(250, (cx) => { this.syncRoom(); if (this.tick()) cx.notify(); });
  }

  // Minimise: shrink this panel's own block to a strip (in a column) or a rail (in a row), and back to
  // the size it had. Handled by the copy that was clicked; one click per tick (a double click is one).
  // Anything that stops it shows a toast; nothing fails silently.
  minimise(cx) {
    if (this.minBusy) return;
    this.minBusy = true;
    const trouble = (why, detail) => {
      try { notify({ title: "Sit & Watch", body: MIN_TROUBLE[why] + (detail ? `: ${detail}` : ""), level: "warning" }); } catch {}
      console.log("sitandwatch minimise:", why, detail ?? "");
    };
    const resize = (args, onFail) => {
      try {
        const res = run("layout.resize", args);
        const bad = (r) => { if (r && typeof r === "object" && r.error) { onFail(); trouble("failed", r.error); cx.notify(); } };
        if (res && typeof res.then === "function") res.then(bad, (e) => { onFail(); trouble("failed", e?.message ?? String(e)); cx.notify(); });
        else bad(res);
      } catch (e) { onFail(); trouble("failed", e?.message ?? String(e)); }
    };
    if (this.min) {                                          // back to the size it had
      const was = this.min;
      this.setMin(null);
      resize({ id: was.id, ...(was.saved ?? { weight: 1 }) }, () => this.setMin(was));
    } else {
      let b;
      try { b = findBlock(layout()); } catch (e) { return trouble("none", e?.message); }
      if (!b.ok) return trouble(b.reason, b.min ? `min ${b.min}` : "");
      const min = { id: b.id, axis: b.axis, saved: b.size, at: Date.now(), seen: null };
      this.setMin(min);
      resize({ id: b.id, px: b.target }, () => this.setMin(null));
    }
    cx.notify();
  }
  setMin(v) { this.min = v; try { localStorage.setItem("min", JSON.stringify(v)); } catch {} }

  // Once a second while minimised: if the block reads big again (dragged open, another layout), draw the
  // full panel. Compared with what layout() said just after shrinking, so a layout() that keeps reporting
  // the configured size never clears it. Returns whether that changed anything.
  minCheck() {
    if (!this.min) return false;
    const now = Date.now();
    if (now - this.min.at <= MIN_GUARD_MS) return false;
    let px;
    try { px = findBlock(layout()).size?.px; } catch { return false; }
    if (this.min.seen == null) { this.setMin({ ...this.min, seen: px ?? null }); return false; }
    if (px !== this.min.seen && shouldClearMin(px, this.min.at, now)) { this.setMin(null); return true; }
    return false;
  }

  // Once a second: the can's push and the popcorn pile, from what the last render drew (panel() reports
  // it through onDrawn). The push starts only once a knocking cat is on screen (not hidden behind a
  // louder pose): stage 0 the cat's paw on the can, 800ms later stage 1 the can on the floor. While his
  // popcorn is on the floor, Buddy eats it: the pile shrinks over a minute. Returns whether to redraw.
  knockTick(cx) {
    const m = this.m, drawn = this.drawn ?? {};
    let changed = false;
    if (!drawn.knocking) { if (m.canStage != null) { m.canStage = null; changed = true; } }
    else if (m.canStage == null) {
      m.canStage = 0; changed = true;
      const key = (this.knockKey = Math.random());
      cx.timer.after(800, (cx) => { if (this.knockKey === key && m.canStage === 0) { m.canStage = 1; cx.notify(); } });
    }
    const before = pileSize(m.spillTicks ?? 0);
    m.spillTicks = drawn.spilled ? (m.spillTicks ?? 0) + 1 : 0;
    return changed || pileSize(m.spillTicks) !== before;
  }

  // A sub-agent started or stopped. A stop for one never seen is ignored; a start for one already
  // running just keeps it.
  subEvent({ verb, parent, id }, cx) {
    const now = Date.now();
    if (verb === "start") this.subs[id] ??= { parent, at: now };
    else if (this.subs[id] && !this.subs[id].doneAt) this.subs[id].doneAt = now;
    cx.notify();
  }

  // A pet was clicked (or the dev petPoke fired): its bubble for two ticks, a line from its pool
  // ("asleep" while it's curled on the chair).
  pokePet(name, cx) {
    const p = PETS.find((x) => x.name === name) ?? PETS[Math.floor(Math.random() * PETS.length)];
    const pose = this.drawn?.poses?.[p.name.toLowerCase()];
    const pool = pose === "curl" ? LINES.asleep : LINES[p.kind] ?? LINES.cat;
    this.m.petSay = { name: p.name, line: pool[Math.floor(Math.random() * pool.length)] };   // (m.petPoke is its tick count)
    startOneShot(this.m, "petPoke");
    this.m.lastUser = Date.now();
    cx.notify();
  }

  // The power bar, once a second. Only the copy that owns the commands counts (a stale copy left by a
  // reload would count twice); from the live agents, not the list on screen (the demo shows fakes).
  // Returns whether the drawn bar changed.
  powerTick(token) {
    try { if (localStorage.getItem(OWNER) !== token) return false; } catch { return false; }
    const seen = new Set(), base = [...agents(), ...(this.helpers ?? [])].filter((a) => !seen.has(a.address) && seen.add(a.address));
    const live = [...base, ...subDesks(this.subs ?? {}, base)];
    const working = live.filter((a) => a.status === "working").length;
    const before = powerShown(this.m.power);
    const { power, fire } = powerStep(this.m.power, working, this.ship != null);
    this.m.power = power;
    if (fire) startOneShot(this.m, "powerUp");
    if (powerShown(power) === before && !fire) return false;
    try { localStorage.setItem("power", String(power)); localStorage.setItem("powerAt", String(Date.now())); } catch {}
    return true;
  }

  // Now and then a pet gets up, walks off the edge, and comes back a while later: each on its own
  // clock, only while an agent is working or blocked (asleep on the chair otherwise, so nothing
  // moves when nothing is happening). Two-stage like boom(): drawn at the start, then 60ms later
  // at the end with transition("left") sliding it there. force: all of them, now (dev mode).
  wanderTick(cx, force = false) {
    const now = Date.now(), W = (this.walk ??= {});
    const active = this.demoAt == null && this.list.some((a) => a.status === "working" || a.status === "blocked");
    const later = (min, span) => now + min + Math.floor(Math.random() * span);
    const step = (name, key, phase, ms, then) => cx.timer.after(ms, (cx) => {
      if (W[name]?.key !== key) return;                   // a newer trip took over
      W[name].phase = phase; then?.(W[name]); cx.notify();
    });
    for (const { name } of PETS) {
      const w = (W[name] ??= { phase: "home", next: later(3 * MIN, 4 * MIN) });
      if (!active) { if (w.phase !== "home") Object.assign(w, { phase: "home", key: null }); continue; }
      if (w.phase === "home" && (force || now >= w.next)) {
        const key = Object.assign(w, { phase: "out0", key: Math.random() }).key;
        step(name, key, "out1", 60);
        step(name, key, "away", WALK_MS + 100, (w) => { w.back = later(25 * 1000, 50 * 1000); });
        cx.notify();
      } else if (w.phase === "away" && now >= w.back) {
        const key = Object.assign(w, { phase: "in0", key: Math.random() }).key;
        step(name, key, "in1", 60);
        step(name, key, "home", WALK_MS + 100, (w) => { w.next = later(3 * MIN, 4 * MIN); });
        cx.notify();
      }
    }
  }

  // The ship explosion. kind: "merged", "deployed" or "pushed" (the default), for the banner.
  boom(kind, cx) {
    const key = Date.now();
    this.m.ships++;
    this.ship = { key, stage: 0, first: this.m.ships === 1, banner: BANNERS[kind] ?? BANNERS.pushed };
    cx.notify();
    cx.timer.after(60, (cx) => { if (this.ship?.key === key) { this.ship.stage = 1; cx.notify(); } });
    cx.timer.after(SHIP_MS, (cx) => { if (this.ship?.key === key) { this.ship = null; cx.notify(); } });
  }

  // Developer mode's "fire" buttons: start a one-shot exactly as the real event would.
  fire(ev, cx) {
    const m = this.m, first = this.list[0]?.address ?? null;
    if (ev === "petPoke") return this.pokePet(null, cx);
    if (ev === "canKnock") { m.knockUntil = Date.now() + 20000; cx.notify(); return; }
    if (ev === "subagent") {                                 // a pretend sub-agent on the first desk, for 15s
      const parent = this.list.find((a) => !a.sub)?.address;
      if (!parent) return;
      const id = `dev${Date.now() % 100000}`;
      this.subEvent({ verb: "start", parent, id }, cx);
      cx.timer.after(15000, (cx) => this.subEvent({ verb: "stop", parent, id }, cx));
      return;
    }
    if (Object.hasOwn(CHIP_KEY, ev)) startOneShot(m, CHIP_KEY[ev]);   // own keys only: fire-toString is no event
    if (ev === "finish") this.partyUntil = Date.now() + 3000;
    if (ev === "streak") m.streakAddr = first;
    if (ev === "welcome") m.welcomeAddr = first;
    if (ev === "yes?") m.aysAddr = first;
    if (ev === "poke") m.pokeLine = pickLine("poke", Math.floor(Math.random() * POKES));
    if (ev === "chaos") setOption({ chaos: !options().chaos });
    if (ev === "pushed" || ev === "merged" || ev === "deployed") return this.boom(ev, cx);
    cx.notify();
  }

  // Run on every panel render: durations, edges against the previous statuses, the one-shots they
  // start. Returns what resolveMood() in rules.js reads.
  trackMetrics(list, prev, first) {
    const m = this.m, now = Date.now();
    // When each agent entered its status: hc's status_ms when it agrees, else when we saw it change.
    const local = {};
    for (const a of list) local[a.address] = m.local[a.address]?.status === a.status ? m.local[a.address] : { status: a.status, at: now };
    m.local = local;
    const since = (a) => (m.hcSince[a.address]?.status === a.status ? m.hcSince[a.address].at : null) ?? local[a.address].at;
    const working = list.filter((a) => a.status === "working"), blocked = list.filter((a) => a.status === "blocked");
    const longestWorkingMs = Math.max(0, ...working.map((a) => now - since(a)));
    let longestBlockedMs = 0, longestBlockedAddr = null;
    for (const a of blocked) if (now - since(a) > longestBlockedMs) { longestBlockedMs = now - since(a); longestBlockedAddr = a.address; }

    const done = list.filter((a) => prev[a.address] === "working" && a.status === "done");
    const finished = done.length > 0;
    if (finished) { startOneShot(m, "finishPump"); m.finishes.push(now); }
    // the same agent finishing three times in ten minutes is a streak
    for (const a of done) {
      const ts = (m.byAddr[a.address] ?? []).filter((t) => now - t < 10 * MIN).concat(now);
      m.byAddr[a.address] = ts;
      if (ts.length >= 3) { startOneShot(m, "streak"); m.streakAddr = a.address; }
    }
    if (working.length || finished) m.lastBusy = now;
    const level = devLevel(list);
    if (level === 3 && m.prevLevel < 3) startOneShot(m, "levelUp");
    m.prevLevel = level;
    m.finishes = m.finishes.filter((t) => now - t < MIN);
    if (finished && m.finishes.length >= 3 && !m.burstDance) startOneShot(m, "burstDance");
    const newBlock = first ? null : list.find((a) => a.status === "blocked" && prev[a.address] !== "blocked");
    if (newBlock) {
      // every third new block, the meme instead of the phone: "Are you sure?" "Yes"
      if (++m.blocks % 3 === 0) { startOneShot(m, "areYouSure"); m.aysAddr = newBlock.address; }
      else startOneShot(m, "blockedPhone");
    }
    if (m.prevWorking >= 2 && working.length === 0) startOneShot(m, "collapse");
    m.prevWorking = working.length;
    // A desk that wasn't there before. Skip the first 15s: background helpers arrive with the first poll.
    if (m.prevAddrs && now - m.bornAt > 15000) {
      const fresh = list.find((a) => !m.prevAddrs.has(a.address));
      if (fresh) { startOneShot(m, "newAgentWelcome"); m.welcomeAddr = fresh.address; }
    }
    m.prevAddrs = new Set(list.map((a) => a.address));
    for (const a of list) if (!a.sub) m.seen.add(a.address);   // sub-agents aren't more agents seen ("how many?")
    // Switching agents counts as the user being around (header clicks count too).
    const focus = list.find((a) => a.focused)?.address ?? null;
    if (focus !== m.lastFocus) { m.lastFocus = focus; m.lastUser = now; }

    return {
      working: working.length, blocked: blocked.length, longestWorkingMs, longestBlockedMs, longestBlockedAddr,
      welcomeAddr: m.welcomeAddr, userIdleMs: now - m.lastUser, hour: new Date().getHours(), seen: m.seen.size,
      idleMs: working.length ? 0 : now - m.lastBusy, streakAddr: m.streakAddr, aysAddr: m.aysAddr,
      seed: m.seed, chaos: options().chaos, pokeLine: m.pokeLine,
      fx: Object.fromEntries(ONE_SHOTS.map((k) => [k, m[k]])),
    };
  }

  toggleDemo() { this.demoAt = this.demoAt == null ? Date.now() : null; }

  roomProps() {
    const { width: w, height: h } = this.size;
    return { w, h, seed: this.seed, at: Math.floor(Date.now() / 60000) * 60000, door: this.door > Date.now() };
  }

  syncRoom() {
    const p = this.roomProps(), key = JSON.stringify(p);
    if (key !== this.roomKey) { this.roomKey = key; this.roomView.set_props(p); }
  }

  // ---- walkways -------------------------------------------------------------
  // A place is { r, x }: r = -1 is the corridor along the wall, r ≥ 0 the aisle behind desk row r.
  // A seat adds { seat: y }: one step up from its row's aisle.

  laneY(row, off = 0) { const g = this.geo; return off + (row < 0 ? g.topY : g.top + row * g.sh + Math.round(128 * g.k)); }

  // Everyone keeps to their own line in a walkway (off), so passers-by don't merge.
  path(from, to, speed = WALK, off = 0) {
    const g = this.geo, pts = [];
    const add = (x, y, row) => pts.push({ x: Math.round(x), y: Math.round(y), r: row });
    if (from.seat != null) add(from.x, this.laneY(from.r, off), from.r);
    if (from.r !== to.r) {
      const side = [...g.lanes].sort((a, b) => Math.abs(from.x - a) + Math.abs(to.x - a) - Math.abs(from.x - b) - Math.abs(to.x - b))[0];
      add(side, this.laneY(from.r, off), from.r);
      add(side, this.laneY(to.r, off), to.r);
    }
    add(to.x, this.laneY(to.r, off), to.r);
    if (to.seat != null) add(to.x, to.seat, to.r);
    let prev = { x: from.x, y: from.seat ?? this.laneY(from.r) };
    for (const p of pts) {
      p.ms = Math.max(16, Math.round(Math.hypot(p.x - prev.x, p.y - prev.y) / speed));
      p.facing = p.y > prev.y ? "front" : p.y < prev.y ? "back" : "front";
      p.left = p.x < prev.x;
      prev = p;
    }
    return pts;
  }

  off(addr) { return ((hash(addr) % 5) - 2) * Math.round(4 * this.geo.k); }

  // Someone (or the cat) is standing at, or heading for, the spot p: wait a moment.
  crowded(self, p) {
    const near = (q) => q && Math.abs(q.x - p.x) < 12 * this.geo.s && Math.abs(q.y - p.y) < 8 * this.geo.s;
    if (self !== "cat" && near(this.cat.path?.[this.cat.i])) return true;
    return Object.entries(this.trips).some(([addr, t]) => addr !== self && t.phase !== "enter" && near(t.path[t.i]));
  }

  seatPlace(addr) { const s = this.seats[addr]; return s && { r: s.row, x: s.x, seat: s.y }; }

  spotPlace(sp) {
    const { width: w } = this.size, g = this.geo, mid = Math.round(w / 2);
    const wall = { cooler: w - 150, shelfL: mid - 250, shelfR: mid + 200, window: w - 320, door: mid - 24 }[sp.key];
    if (wall != null) return { r: -1, x: Math.round(wall + sp.jx) };
    if (sp.key === "chat" && this.seats[sp.other]) { const o = this.seats[sp.other]; return { r: o.row, x: o.x + Math.round(30 * g.k) }; }
    if (sp.key === "plant") return { r: g.rows - 1, x: Math.max(g.rightX, w - 150) };
    return { r: Math.floor(sp.fy * (g.rows + 1)) - 1, x: Math.round(8 + sp.fx * (w - 70)) };
  }

  // Four times a second: walkers turn corners. About once a second: who gets up, thoughts, the cat.
  tick() {
    if (!this.geo) return false;
    const now = Date.now(), slow = this.n++ % 4 === 0;
    let changed = false;
    const minute = new Date().getMinutes();
    if (minute !== this.minute) { this.minute = minute; changed = true; }
    for (const a of this.list) {
      const t = this.trips[a.address];
      if (t) {
        if (busy(a) && t.phase === "there") this.headBack(a, t, t.path[t.i], now), changed = true;
        else if (busy(a) && t.phase === "going") t.hurry = true;
        if (now < t.until) continue;
        changed = true;
        if (t.i < t.path.length - 1 && !(t.hurry && t.phase === "going")) {
          if ((t.wait ?? 0) < 6 && this.crowded(a.address, t.path[t.i + 1])) { t.wait = (t.wait ?? 0) + 1; t.until = now + 250; continue; }
          t.wait = 0; t.i++; t.until = now + t.path[t.i].ms; continue;
        }
        const at = t.path[t.i];
        if (t.phase === "going" && !t.hurry) Object.assign(t, { phase: "there", until: now + 3000 + Math.random() * 8000 });
        else if (t.phase === "back") delete this.trips[a.address];
        else this.headBack(a, t, at, now);
      } else if (slow && !busy(a) && Math.random() < (a.status === "done" ? 0.015 : 0.035) * (this.demo ? 4 : 1)) {
        const others = this.list.filter((o) => o.address !== a.address && !this.trips[o.address]);
        let key = SPOTS[Math.floor(Math.random() * SPOTS.length)];
        if (key === "chat" && !others.length) key = "floor";
        const spot = { key, other: key === "chat" ? others[Math.floor(Math.random() * others.length)].address : null,
          jx: Math.random() * 30 - 15, fx: Math.random(), fy: Math.random() };
        const path = this.path(this.seatPlace(a.address), this.spotPlace(spot), WALK, this.off(a.address));
        this.trips[a.address] = { phase: "going", spot, path, i: 0, until: now + path[0].ms };
        changed = true;
      } else if (slow && !this.thoughts[a.address] && Math.random() < (busy(a) ? 0.006 : 0.025)) {
        this.thoughts[a.address] = { sym: THOUGHTS[Math.floor(Math.random() * THOUGHTS.length)], until: now + 2500 + Math.random() * 3000 };
        changed = true;
      }
    }
    for (const [k, t] of Object.entries(this.thoughts)) if (now >= t.until) { delete this.thoughts[k]; changed = true; }
    changed = this.moveCat(now) || changed;
    if (this.door && now >= this.door) { this.door = 0; changed = true; }
    return changed;
  }

  headBack(a, t, at, now) {
    const path = this.path({ r: at.r, x: at.x }, this.seatPlace(a.address), WALK, this.off(a.address));
    Object.assign(t, { phase: "back", path, i: 0, until: now + path[0].ms, hurry: false });
  }

  moveCat(now) {
    const c = this.cat, g = this.geo;
    if (now < c.until) return false;
    if (c.path && c.i < c.path.length - 1) {
      if ((c.wait ?? 0) < 8 && this.crowded("cat", c.path[c.i + 1])) { c.wait = (c.wait ?? 0) + 1; c.until = now + 250; return false; }
      c.wait = 0; c.i++; c.until = now + c.path[c.i].ms; c.left = c.path[c.i].left; return true; }
    const at = c.path?.[c.i] ?? { r: -1, x: Math.round(this.size.width / 3) };
    if (c.path && !c.resting) { c.resting = true; c.until = now + (Math.random() < 0.4 ? 8000 + Math.random() * 15000 : 1000 + Math.random() * 3000); return false; }
    const to = { r: Math.floor(Math.random() * (g.rows + 1)) - 1, x: Math.round(8 + Math.random() * (this.size.width - 60)) };
    c.path = this.path({ r: at.r, x: at.x }, to, CAT_WALK, Math.round((Math.random() * 16 - 8) * g.k));
    Object.assign(c, { i: 0, until: now + c.path[0].ms, left: c.path[0].left, resting: false });
    return true;
  }

  // ---- drawing --------------------------------------------------------------

  desk(a, i, x, y, k, night, space) {
    const q = (v) => Math.round(v * k), R2 = (x, y, w, h, c) => r(q(x), q(y), q(w), q(h), c);
    const dl = deskLook(i, this.seed), status = a?.status;
    const lit = a && (a.focused || night);
    const el = div().absolute().left(x).top(y).w(q(SLOT_W)).h(q(130))
      .child(R2(52, 0, 66, 44, "#2b2f3a").child(a ? this.screen(a, k) : R2(6, 5, 54, 34, "#1c2028")))
      .child(R2(80, 44, 10, 6, "#2b2f3a")).child(R2(70, 50, 30, 3, "#2b2f3a"))
      .child(R2(24, 52, 122, 12, "#f0dcb0")).child(R2(24, 64, 122, 20, "#d4b27c")).child(R2(24, 64, 122, 3, "#b48a52"))
      .child(R2(28, 84, 8, 18, "#b48a52")).child(R2(134, 84, 8, 18, "#b48a52"))
      .child(R2(66, 54, 38, 6, "#e7e9ee")).child(R2(110, 44, 9, 10, dl.mug))
      // lamp
      .child(R2(30, 50, 14, 3, "#3a3a3a")).child(R2(35, 32, 3, 18, "#3a3a3a")).child(R2(28, 26, 18, 8, dl.lamp))
      .when(lit, (e) => e.child(R2(26, 34, 22, 18, "#ffe9a055")).child(R2(31, 34, 12, 3, "#fff3b0")))
      .children(clutter(dl.clutter, R2))
      .child(R2(150, 58, 16, 40, dl.tower ? "#d9dce3" : "#3a3f4a").child(R2(3, 6, 8, 2, "#555")).child(R2(5, 26, 4, 4, status === "working" ? "#5ee08a" : "#777")));
    if (status === "working") el.child(txt("~", Math.max(8, q(12)), "#ffffff99").absolute().left(q(110)).top(q(30)).id(`steam-${i}`).frames(["", "~", "≈", "~"], 450));
    if (!a) {
      el.child(R2(70, 78, 30, 26, "#3d4454")).child(R2(83, 104, 4, 8, "#2b2f3a")).child(R2(72, 112, 26, 4, "#2b2f3a"));
      if (this.demo) return el;
      return el.id(`empty-${i}`).cursor_pointer().on_mouse_down("left", (_e, cx) => cx.stop_propagation())
        .on_click((_e, cx) => cx.spawn(async () => {
          const ag = (await knownAgents()).find((x) => x.installed);
          run("tab.new", { ...(space ? { space } : {}), ...(ag ? { argv: ag.run } : {}) });
        }));
    }
    return el.id(`desk-${a.address}`).cursor_pointer()
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click(() => !this.demo && run("agent.focus", { terminal: a.address }))
      .on_hover((hov, cx) => {
        // Only a real change redraws: a redraw re-reports hover, and notifying again would loop.
        const next = hov ? a.address : this.hover === a.address ? null : this.hover;
        if (next !== this.hover) { this.hover = next; cx.notify(); }
      });
  }

  label(a, x, y, k) {
    const q = (v) => Math.round(v * k);
    return h_flex().absolute().left(x).top(y + q(130)).w(q(SLOT_W)).justify_center().gap(q(6)).items_center()
      .child(icon(a.program, q(14))).child(txt(tabName(a).slice(0, 16), Math.max(8, q(12)), a.focused ? "#fff8e1" : ink));
  }

  screen(a, k) {
    const q = (v) => Math.round(v * k);
    const s = r(q(6), q(5), q(54), q(34), SCREEN[a.status] ?? SCREEN.idle);
    if (a.status === "working")
      return s.children([0, 1, 2, 3].map((i) => r(q(5), q(5 + i * 7), q(10), Math.max(1, q(3)), "#7ee0a0")
        .id(`code-${a.address}-${i}`).loop("width", { from: q(6), to: q(40 - i * 6), period: 600 + ((i * 337) % 700) + (a.address.length * 53) % 300 })));
    if (a.status === "blocked") {
      const fs = Math.max(8, q(12)), roomy = q(34) >= 2 * fs + 2;
      return s.flex().items_center().justify_center().child(v_flex().items_center().id(`need-${a.address}`).loop("opacity", { from: 0.25, to: 1, period: 700 })
        .children(roomy ? [txt("NEEDS", fs, "#fff8e1"), txt("YOU", fs, "#fff8e1")] : [txt("!", fs, "#fff8e1")]));
    }
    if (a.status === "done") return s.flex().items_center().justify_center().child(txt("OK", Math.max(8, q(16)), "#bfe0ff"));
    // Idle: a screensaver logo bouncing off the edges.
    const R = rng(hash(a.address)), lw = Math.max(14, q(24)), lh = Math.max(8, q(12)), fs = Math.max(8, q(10));
    return s.child(div().absolute().top(0).w(lw).h(q(34)).id(`dvd-x-${a.address}`)
      .loop("left", { from: 0, to: q(54) - lw, period: 3600 + Math.floor(R() * 2400), easing: "linear" })
      .child(div().absolute().left(0).w(lw).h(lh).bg(pick(R, DVD)).flex().items_center().justify_center().id(`dvd-y-${a.address}`)
        .loop("top", { from: 0, to: q(34) - lh, period: 2200 + Math.floor(R() * 1600), easing: "linear" })
        .child(txt("DVD", fs, "#36404c"))));
  }

  // The worker, at their seat or out walking. Each leg of a walk animates natively.
  worker(a, k, s) {
    const lk = look(a), t = this.trips[a.address], id = `w-${a.address}`, seat = this.seats[a.address];
    let pos = seat, ms = 16, body;
    if (!t) {
      body = seated(lk, s, a.status === "done").id(`${id}-sit`);
      if (a.status === "working") body.loop("top", { from: 0, to: -Math.max(1, Math.round(s * 0.7)), period: lk.bob });
      if (a.status === "blocked") body.loop("top", { from: 0, to: -4 * s, period: 700 });
    } else {
      const p = t.path[t.i], there = t.phase === "there", enter = t.phase === "enter";
      pos = p;
      ms = enter ? 16 : p.ms;
      const wall = t.spot.key in { cooler: 1, shelfL: 1, shelfR: 1, window: 1, door: 1 };
      const facing = enter ? "front" : there ? (wall ? "back" : "front") : p.facing;
      const item = there && t.spot.key === "cooler" ? "cup" : there && t.spot.key.startsWith("shelf") ? "book" : null;
      body = standing(lk, s, facing, !there && !enter, item, id);
    }
    const th = this.thoughts[a.address];
    const chatting = t?.phase === "there" && t.spot.key === "chat";
    return div().id(id).absolute().left(pos.x).top(pos.y).w(16 * s).h(20 * s)
      .transition("left", { duration: ms, easing: "linear" }).transition("top", { duration: ms, easing: "linear" })
      .cursor_pointer().on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click(() => !this.demo && run("agent.focus", { terminal: a.address }))
      .child(body)
      .when(!t && a.status === "done", (e) => e.child(txt("z", 16, "#24406e").absolute().left(14 * s).top(-2 * s).id(`${id}-z`).frames(["z", "zZ", "zZz", ""], 500)))
      .when(chatting, (e) => e.child(bubble(txt(".", 12, ink).id(`${id}-chat`).frames([".", "..", "..."], 400)).left(10 * s).top(-6 * s)))
      .when(!!th && !chatting, (e) => e.child(bubble(txt(th.sym, 12, ink)).left(11 * s).top(-6 * s)));
  }

  // You, in the corner chair. The more agents are working, the more worked up you get.
  dev(list, w, h) {
    const working = list.filter((a) => a.status === "working").length;
    const level = !working ? 0 : working >= 4 || (working === list.length && working >= 2) ? 3 : working >= 2 ? 2 : 1;
    const panic = list.some((a) => a.status === "blocked");
    const ds = Math.max(2, Math.min(4, Math.floor((h - WALL) / (DEV_H * 2.2))));
    const x = Math.round((220 - DEV_W * ds) / 2), y = h - DEV_H * ds - 18;
    return div().absolute().left(x).top(y).w(DEV_W * ds).h(DEV_H * ds)
      // a rug and a floor lamp to make the corner his
      .child(r(-14, DEV_H * ds - 10, DEV_W * ds + 28, 20, "#5e1420").border(2).border_color("#3d0c14"))
      .child(r(DEV_W * ds + 10, -10, 4, DEV_H * ds + 10, "#3a3a3a")).child(r(DEV_W * ds + 2, -24, 20, 16, "#d97a3a"))
      .child(r(DEV_W * ds - 6, -8, 36, 40, level ? "#ffb06a22" : "#ffb06a11"))
      .child(spectator(level, ds, "dev", panic).absolute().left(0).top(0));
  }

  render() {
    const p = props() ?? {}, role = roleOf(p);
    if (p.options) return optionsDialog(this.handle);
    this.demo = !!p.demo;
    if (role === "pane") {
      const pane = panes().find((x) => x.pane === p.pane);
      const st = pane?.status;
      return h_flex().size_full().px(10).gap(8).items_center().bg("#c99a62")
        .child(icon(pane?.program)).child(txt(pane?.program?.name ?? "Terminal", 12, ink))
        .child(div().flex_1())
        .child(txt(st === "blocked" ? "NEEDS YOU" : (st ?? "").toUpperCase(), 12, st === "blocked" ? "#a8322a" : ink));
    }
    if (role === "panel") {
      let list = p.demo ? DEMO : agents();
      if (!p.demo) {
        const seen = new Set(list.map((a) => a.address));
        const extra = (this.helpers ?? []).filter((t) => !seen.has(t.address));
        list = [...list, ...extra];
      }
      if (!p.demo) list = [...list, ...subDesks(this.subs ?? {}, list)];   // sub-agents count like any agent
      const now = Date.now();
      const toggle = (cx) => { this.m.lastUser = Date.now(); this.toggleDemo(); cx.notify(); };
      // clicking him: he turns and says something for two ticks
      const poke = (cx) => {
        this.m.lastUser = Date.now();
        startOneShot(this.m, "poke");
        this.m.pokeLine = pickLine("poke", Math.floor(Math.random() * POKES));
        cx.notify();
      };
      if (this.demoAt != null) {
        const t = now - this.demoAt, i = Math.floor(t / DEMO_MS) % DEMO_STATES.length, [label, sts, party, ship, mAt, ages, subs] = DEMO_STATES[i];
        // The 1s timer re-renders the demo: squashed for the first second, blown out until 3s, then gone.
        const into = t % DEMO_MS, stage = !ship || into >= 3000 ? null : into < 1000 ? 0 : 1;
        const fake = sts.map((status, j) => ({ address: `demo-${j}`, status, tab_name: `bot ${j + 1}`, program: null, focused: false,
          ...(subs?.[j] ? { subs: { done: subs[j][0], total: subs[j][1], running: subs[j][1] - subs[j][0] } } : {}) }));
        const count = (st) => sts.filter((x) => x === st).length;
        const m = { working: count("working"), blocked: count("blocked"), longestWorkingMs: 0, longestBlockedMs: 0, longestBlockedAddr: null,
          welcomeAddr: null, userIdleMs: 0, hour: 12, seen: sts.length, idleMs: 0, seed: this.seed, fx: {},
          ...(mAt?.(Math.floor(into / 1000)) ?? {}) };
        m.fx = { ...m.fx, poke: this.m.poke };
        m.pokeLine = this.m.pokeLine;
        const idle = Object.fromEntries(fake.map((a, j) => [a.address, ages?.[j] ?? 0]));
        const power = [0, 0.2, 0.5, 0.9][devLevel(fake)] * POWER_FULL;   // the demo's bar follows its level
        return panel(fake, party, { label: `DEMO ${i + 1}/${DEMO_STATES.length}  ${label}`, toggle, ship: stage, shipKey: Math.floor(t / DEMO_MS), m, banner: BANNERS.merged, onDev: poke, idle, power });
      }
      // An agent going working -> done sets off the party popper for 3s; the 1s timer clears it.
      const prev = this.prevStatus ?? {};
      if (list.some((a) => prev[a.address] === "working" && a.status === "done")) this.partyUntil = now + 3000;
      const m = this.trackMetrics(list, prev, !this.prevStatus);
      this.prevStatus = Object.fromEntries(list.map((a) => [a.address, a.status]));
      list = foldSubs(list);                                 // sub-agents: a 2/5 badge on their parent's desk
      // Desks in last-active order: busy agents are active now; the rest since they entered their
      // status (hc's status_ms when it agrees, else when this panel saw the change). idle: ms since.
      const lastActive = {}, idle = {};
      const statusAt = (a) => (this.m.hcSince[a.address]?.status === a.status ? this.m.hcSince[a.address].at : null) ?? this.m.local[a.address]?.at ?? now;
      // Finished and not answered yet, looked at or not: since when (kept across restarts).
      this.waiting ??= (() => { try { return JSON.parse(localStorage.getItem("waiting") ?? "{}") ?? {}; } catch { return {}; } })();
      const waiting = trackWaiting(this.waiting, list, statusAt, !this.polled);   // helpers come with the first poll
      if (JSON.stringify(waiting) !== JSON.stringify(this.waiting)) { this.waiting = waiting; try { localStorage.setItem("waiting", JSON.stringify(waiting)); } catch {} }
      list = list.map((a) => (waiting[a.address] != null ? { ...a, waiting: true } : a));
      for (const a of list) {
        const busy = a.status === "working" || a.status === "blocked" || a.subs?.running > 0;
        lastActive[a.address] = busy ? now : waiting[a.address] ?? statusAt(a);
        idle[a.address] = busy ? 0 : options().dev && this.dev.desks ? DESK_AGES[this.dev.desks] : now - lastActive[a.address];
      }
      list = byLastActive(list, lastActive);
      this.list = list;
      const d = this.dev;
      const dev = options().dev ? {
        mood: d.mood, level: d.level, open: d.open,
        onOpen: (cx) => { d.open = !d.open; cx.notify(); },
        onMood: (v, cx) => { d.mood = v; cx.notify(); },
        onLevel: (v, cx) => { d.level = v; cx.notify(); },
        onFire: (v, cx) => this.fire(v, cx),
        pets: d.pets, onPets: (v, cx) => { d.pets = v; cx.notify(); },
        onWander: (cx) => this.wanderTick(cx, true),
        desks: d.desks, onDesks: (v, cx) => { d.desks = v; cx.notify(); },
        block: (() => { try { const b = findBlock(layout()); return b.ok ? `${b.id} ${b.axis} ${JSON.stringify(b.size)}` : `no block (${b.reason})`; } catch { return "no layout()"; } })(),
        min: this.min ? `${this.min.axis} seen ${this.min.seen ?? "-"}` : "off",
      } : null;
      const walk = Object.fromEntries(Object.entries(this.walk ?? {}).filter(([, w]) => w.phase !== "home").map(([k, w]) => [k, w.phase]));
      try { return panel(list, (this.partyUntil ?? 0) > now, { toggle, ship: this.ship?.stage ?? null, shipKey: this.ship?.key, firstShip: this.ship?.first, banner: this.ship?.banner, m, onDev: poke, dev, walk, idle, power: this.m.power,
        min: this.min?.axis ?? null, onMin: (cx) => this.minimise(cx),
        knock: canKnock(m.longestWorkingMs, devLevel(list)) || (this.m.knockUntil ?? 0) > now, canStage: this.m.canStage,
        pile: pileSize(this.m.spillTicks ?? 0), petPoke: this.m.petSay, onPet: (name, cx) => this.pokePet(name, cx),
        onDrawn: (d) => { this.drawn = d; } }); }
      catch (e) { return div().p(8).bg("#fff").child(txt(`ERR ${e?.message ?? e}`, 12, "#a8322a")); }
    }
    if (role === "rail") {
      const s = spaces().find((s) => s.active), tab = s?.tabs.find((t) => t.active);
      return h_flex().size_full().bg(wood).px(16).items_center()
        .child(txt(`${s ? spaceName(s) : ""} / ${tab ? tabText(tab.id, tab.name, "Tab") : ""}`, 12, "#fff1d6"));
    }
    // props.demo fills the desks with sample workers in every state (for previews).
    const list = p.demo ? DEMO : agents();
    if (!p.demo) setAgentOrder(list.map((a) => a.address));
    this.list = list;

    const { width: w, height: h } = this.size, now = new Date(), hour = now.getHours();
    const night = hour >= 19 || hour < 6;
    // Agents come in space order: one group of desks per space.
    const groups = [];
    for (const a of list) {
      const g = groups.at(-1);
      if (g && g.space === a.space) g.agents.push(a);
      else groups.push({ space: a.space, name: spaceLabel(a), agents: [a] });
    }
    if (!groups.length) groups.push({ space: null, name: "", agents: [] });
    // A rug colour per space, fixed by its id, never the same as the group beside it.
    groups.forEach((g, gi) => {
      g.rug = hash(g.space ?? g.name) % RUGS.length;
      if (gi && g.rug === groups[gi - 1].rug) g.rug = (g.rug + 1) % RUGS.length;
    });
    // The corner chair takes the left edge: desks fit in what's left.
    const CHAIR_W = 220;
    const { k, s, cols, rows } = fit(groups.map((g) => g.agents.length), w - CHAIR_W, h);
    const sw = Math.round(SLOT_W * k), sh = Math.round(SLOT_H * k), gap = Math.round(GAP * k), q = (v) => Math.round(v * k);
    const width = cols.reduce((a, b) => a + b, 0) * sw + (groups.length - 1) * gap;
    const top = WALL + q(40), lanes = [];
    const desks = []; // { a, x, y, row, space }
    let x0 = CHAIR_W + Math.round((w - CHAIR_W - width) / 2);
    groups.forEach((g, gi) => {
      Object.assign(g, { x: x0, w: cols[gi] * sw });
      for (let j = 0; j < cols[gi] * rows; j++)
        desks.push({ a: g.agents[j], x: x0 + (j % cols[gi]) * sw, y: top + Math.floor(j / cols[gi]) * sh, row: Math.floor(j / cols[gi]), space: g.space });
      x0 += g.w + gap;
      if (gi < groups.length - 1) lanes.push(x0 - gap + Math.round((gap - 16 * s) / 2));
    });
    const left = groups[0].x, right = left + width;
    const leftX = Math.max(4, left - 16 * s - 6), rightX = Math.min(w - 16 * s - 4, right + 6);
    this.geo = { k, s, sh, top, rows, topY: WALL - 40, leftX, rightX, lanes: [leftX, ...lanes, rightX] };
    const taken = desks.filter((d) => d.a);

    // Newcomers walk in through the door.
    const ts = Date.now();
    for (const d of taken) {
      const a = d.a;
      this.seats[a.address] = { x: d.x + q(61), y: d.y + q(50), row: d.row };
      if (this.known && !this.known.has(a.address)) {
        const door = this.spotPlace({ key: "door", jx: 0 });
        const path = [{ x: door.x, y: this.laneY(-1), r: -1, ms: 16 }, ...this.path(door, this.seatPlace(a.address), WALK, this.off(a.address))];
        this.trips[a.address] = { phase: "enter", spot: { key: "door" }, path, i: 0, until: ts + 700 };
        this.door = ts + 4000;
      }
    }
    this.known = new Set(list.map((a) => a.address));
    for (const key of Object.keys(this.trips)) if (!this.known.has(key)) delete this.trips[key];
    for (const t of Object.values(this.trips)) if (t.phase === "enter" && ts >= t.until) t.phase = "back";

    const c = this.cat, cp = c.path?.[c.i] ?? { x: Math.round(w / 3), y: this.geo.topY, ms: 16 };
    const hd = taken.find((d) => d.a.address === this.hover), hovered = hd?.a;
    return div().id("office-root").relative().size_full().overflow_hidden().bg("#e2a465")
      .on_size_change((size, cx) => { this.size = size; this.syncRoom(); cx.notify(); })
      .child(this.roomView)
      .children(groups.filter((g) => g.name).map((g) => {
        const [col, edge] = RUGS[g.rug], rw = g.w + q(16), rh = rows * sh + q(4);
        return r(g.x - q(8), top - q(8), rw, rh, col).border(3).border_color(edge)
          .child(r(q(6), q(6), rw - q(12) - 6, rh - q(12) - 6, col).border(1).border_color(`${edge}aa`));
      }))
      .children(desks.map((d, i) => this.desk(d.a, i, d.x, d.y, k, night, d.space)))
      .children(taken.map((d) => this.label(d.a, d.x, d.y, k)))
      .children(groups.filter((g) => g.name).map((g) => {
        const edge = RUGS[g.rug][1], ts = Math.max(8, q(16));
        return div().absolute().left(g.x - q(8)).top(top - q(8) - ts - 8).px(8).py(4).bg(edge)
          .child(txt(g.name.slice(0, 20), ts, "#fff8e1"));
      }))
      .child(div().id("cat").absolute().left(cp.x).top(cp.y + Math.round(30 * k))
        .transition("left", { duration: cp.ms, easing: "linear" }).transition("top", { duration: cp.ms, easing: "linear" })
        .child(cat(c.coat, s, c.left)))
      .children(list.map((a) => this.worker(a, k, s)))
      .child(this.dev(list, w, h))
      .when(night, (e) => e.child(r(0, 0, w, h, "#0b123650")))
      .when(hour >= 17 && hour < 19, (e) => e.child(r(0, 0, w, h, "#f2a65a1a")))
      .when(!!hovered, (e) => {
        const x = Math.min(hd.x + sw - 10, w - 200);
        return e.child(v_flex().absolute().left(x).top(hd.y).w(180).p(8).gap(4).bg("#fff27a").border(2).border_color("#d8c440")
          .child(txt(tabName(hovered), 12, ink).truncate())
          .child(txt(spaceLabel(hovered), 12, "#6b5a4a").truncate())
          .when(!!hovered.title, (e) => e.child(txt(tabLabel(hovered, hovered.title, ""), 12, "#6b5a4a").truncate()))
          .child(txt(hovered.status.toUpperCase(), 12, hovered.status === "blocked" ? "#a8322a" : ink)));
      })
      .child(v_flex().absolute().left(16).top(14).gap(4).p(8).bg("#fbfbf6").border(3).border_color("#6b3f1f")
        .child(txt("SIT AND WATCH", 16)).child(txt(`${list.filter((a) => a.status === "working").length} of ${list.length} at it, you watching`, 12, "#6b5a4a")));
  }
}

const bubble = (content) => div().absolute().px(4).py(2).bg("#ffffff").border(2).border_color(ink).child(content);
