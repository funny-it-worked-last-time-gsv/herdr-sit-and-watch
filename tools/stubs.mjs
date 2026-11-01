// Offline stand-ins for gpui-kit, gpui-base and herdr, so the mod's code runs in plain Node.
// tools/check.mjs maps the three bare imports here with a resolve hook (nothing in the mod
// folder changes). Elements record what was asked of them; a fake clock drives timers.

// ---- fake clock -------------------------------------------------------------
// Date.now() and every cx.timer callback run off this clock, so tests can step time.
export const clock = {
  now: Date.UTC(2026, 10, 1, 12, 0, 0),
  timers: [],                       // { at, every, fn, cx }
};
const realDate = Date;
globalThis.Date = class extends realDate {
  constructor(...a) { super(...(a.length ? a : [clock.now])); }
  static now() { return clock.now; }
};
// Local hour = UTC hour here, so hour-based moods are stable on any machine.
globalThis.Date.prototype.getHours = function () { return this.getUTCHours(); };

// Advance the clock, firing due timers in time order.
export function advance(ms) {
  const end = clock.now + ms;
  for (;;) {
    const due = clock.timers.filter((t) => t.at <= end).sort((a, b) => a.at - b.at)[0];
    if (!due) break;
    clock.now = due.at;
    if (due.every) due.at += due.every; else clock.timers.splice(clock.timers.indexOf(due), 1);
    due.fn(due.cx);
  }
  clock.now = end;
}

// Seeded Math.random so pools, seeds and poke lines are the same every run.
let seed = 1;
export function reseed(n = 1) { seed = n; }
Math.random = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// In-memory localStorage.
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
};

// ---- elements ---------------------------------------------------------------
// Any method call is recorded and returns the element (so every gpui chain works), except the
// few that matter here: child/children/when/id/frames. on_* handlers are kept for tests to call.
const METHODS = {
  child(c) { if (typeof c === "string" || typeof c === "number") this.text = String(c); else if (c) this.kids.push(c); return this.proxy; },
  children(cs) { for (const c of cs ?? []) METHODS.child.call(this, c); return this.proxy; },
  when(cond, f) { return cond ? f(this.proxy) : this.proxy; },
  id(v) { this.idv = String(v); return this.proxy; },
  frames(list, ms) { this.text = String(list[0]); this.calls.push(["frames", [list, ms]]); return this.proxy; },
};
function el(kind, arg) {
  const t = { kind, arg, calls: [], kids: [], text: null, idv: null, handlers: {} };
  t.proxy = new Proxy(t, {
    get(o, k) {
      if (typeof k === "symbol" || k in o) return o[k];
      if (k in METHODS) return (...a) => METHODS[k].apply(o, a);
      return (...a) => { o.calls.push([k, a]); if (k.startsWith("on_")) o.handlers[k] = a[a.length - 1]; return o.proxy; };
    },
  });
  return t.proxy;
}

// gpui-kit
export const div = () => el("div");
export const image = (src) => el("image", src);
export const svg = (src) => el("svg", src);
export class View {}

// gpui-base
export const v_flex = () => el("div").flex().flex_col();
export const h_flex = () => el("div").flex().flex_row();

// ---- tree helpers -----------------------------------------------------------
export function walk(e, f) { if (!e || typeof e !== "object") return; f(e); for (const k of e.kids ?? []) walk(k, f); }
export function count(e) { let n = 0; walk(e, () => n++); return n; }
export const texts = (e) => { const out = []; walk(e, (x) => x.text != null && out.push(x.text)); return out; };
export const ids = (e) => { const out = []; walk(e, (x) => x.idv && out.push(x.idv)); return out; };
export const findId = (e, pred) => { let hit = null; walk(e, (x) => { if (!hit && x.idv && pred(x.idv)) hit = x; }); return hit; };

// ---- herdr ------------------------------------------------------------------
// Tests set these between renders.
export const world = {
  agents: [], props: { role: "panel" }, spaces: [], panes: [], hcLs: { terminals: [] }, hcGet: {},
  runs: [], notes: [], layout: null, shared: {}, overlays: [],
};
export const agents = () => world.agents;
export const props = () => world.props;
export const spaces = () => world.spaces;
export const panes = () => world.panes;
export const knownAgents = () => world.agents;
export const setAgentOrder = () => {};
export const run = (name, args) => { world.runs.push([name, args]); };
export const notify = (n) => { world.notes.push(n); };
export const layout = () => world.layout;
export const shared = (k) => world.shared[k];
export const setShared = (k, v) => { world.shared[k] = v; };
export const openOverlay = (spec) => { world.overlays.push(spec); return `ov${world.overlays.length}`; };
export const closeOverlay = (id) => { world.overlays = world.overlays.filter((_, i) => `ov${i + 1}` !== id); return null; };
export const nextCommand = () => new Promise(() => {});   // no commands offline
export async function hc(argv) {
  if (argv[0] === "ls") return { stdout: JSON.stringify(world.hcLs) };
  if (argv[0] === "get") return { stdout: JSON.stringify(world.hcGet[argv[1]] ?? {}) };
  return { stdout: "{}" };
}

// ---- cx ---------------------------------------------------------------------
// A context whose timers run on the fake clock and whose notify() counts re-render requests.
export function makeCx() {
  const cx = {
    notified: 0,
    notify() { cx.notified++; },
    spawn(fn) { Promise.resolve().then(() => fn(cx)).catch(() => {}); },
    stop_propagation() { cx.stopped = true; },
    new(Cls, p) { const v = new Cls(); v.init?.(p, cx); return v; },
    timer: {
      every(ms, fn) { clock.timers.push({ at: clock.now + ms, every: ms, fn, cx }); },
      after(ms, fn) { clock.timers.push({ at: clock.now + ms, every: 0, fn, cx }); },
    },
  };
  return cx;
}

// Let spawned promises (the poll) settle.
export const settle = () => new Promise((r) => setTimeout(r, 0));
