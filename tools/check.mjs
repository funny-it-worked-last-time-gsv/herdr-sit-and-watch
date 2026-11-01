// Offline checks for the Sit & Watch mod. No Herdr needed.
//
//   node tools/check.mjs            run the checks against tools/golden.json
//   node tools/check.mjs --capture  record tools/golden.json from the code as it is now
//
// gpui-kit, gpui-base and herdr are mapped to tools/stubs.mjs by a resolve hook, so nothing in
// the mod folder changes and nothing from tools/ ships with it. The golden is captured from the
// code before a refactor; afterwards every recorded decision must come out the same, apart from
// the differences listed in ALLOWED.
import { registerHooks } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const STUBS = pathToFileURL(join(here, "stubs.mjs")).href;
const MOD = join(here, "..", "sitandwatch", "mods", "sitandwatch");
const GOLDEN = join(here, "golden.json");
if (typeof registerHooks !== "function") { console.error("check.mjs needs Node 22.15+ (module.registerHooks)"); process.exit(2); }
registerHooks({
  resolve(spec, ctx, next) {
    if (spec === "gpui-kit" || spec === "gpui-base" || spec === "herdr") return { url: STUBS, shortCircuit: true };
    return next(spec, ctx);
  },
});

const S = await import(STUBS);
const { default: Office } = await import(pathToFileURL(join(MOD, "main.js")).href);
const { clock, world, makeCx, reseed, texts, ids, count, walk } = S;

// Intended differences from the golden (new features), and the element budget headroom.
const ALLOWED = { newChips: ["power", "petPoke", "canKnock"], newOneShots: ["powerUp", "petPoke"], newDemoStates: 1 };
const BUDGET_HEADROOM = 60;

// ---- harness ----------------------------------------------------------------
const H = 3600 * 1000, MIN = 60 * 1000;
const atHour = (h) => Date.UTC(2026, 10, 1, h, 0, 0);
// Move the clock without firing timers (their schedule moves with it).
function jump(ms) { clock.now += ms; for (const t of clock.timers) t.at += ms; }

function mount(hour = 12) {
  clock.now = atHour(hour); clock.timers.length = 0; reseed(1);
  localStorage.clear();
  world.props = { role: "panel" }; world.agents = []; world.runs = []; world.notes = [];
  world.hcLs = { terminals: [] }; world.hcGet = {}; world.shared = {}; world.overlays = [];
  const cx = makeCx(), o = new Office();
  o.init(world.props, cx);
  return { o, cx };
}
const agentsOf = (sts, focus = -1) => sts.map((status, i) => ({ address: `a${i}`, status, tab_name: `t${i}`, program: null, app: null, focused: i === focus }));
function render(o, sts, focus) { world.agents = agentsOf(sts, focus); return o.render(); }

// What was decided for him, read from the ids spectator() gives its parts, plus the header count.
function observe(tree) {
  const all = ids(tree);
  const pick = (pre) => all.find((x) => x.startsWith(pre)) ?? null;
  const label = texts(tree).find((t) => /AT IT$|^DEMO \d/.test(t)) ?? null;
  return [pick("pdev-head-"), pick("pdev-body-"), pick("pdev-shake-"), pick("pdev-say-"), label].join(" | ");
}
const errs = [];
function noErr(tree, where) { for (const t of texts(tree)) if (t.startsWith("ERR ")) errs.push(`${where}: ${t}`); }

// ---- the recorded decisions -------------------------------------------------
const LISTS = {
  none: [], idle3: ["idle", "idle", "idle"], w1: ["working"], w1i1: ["working", "idle"],
  w2i1: ["working", "working", "idle"], w3i1: ["working", "working", "working", "idle"],
  w4i1: ["working", "working", "working", "working", "idle"], wAll2: ["working", "working"],
  w6: Array(6).fill("working"), b1: ["blocked"], w1b1: ["working", "blocked"], b2: ["blocked", "blocked"],
  w1b2: ["working", "blocked", "blocked"], done1: ["done", "idle"],
};
const WAITS = { "0": 0, "3m": 3 * MIN, "6m": 6 * MIN, "10m+": 10 * MIN + 1000, "11m": 11 * MIN, "30m+": 30 * MIN + 1000, "60m+": 60 * MIN + 1000 };
const FX = ["finishPump", "blockedPhone", "collapse", "newAgentWelcome", "errorWince", "burstDance", "streak", "areYouSure", "levelUp", "linger", "poke"];

function moodCase(list, wait, away, hour, seen, fx, party) {
  const { o } = mount(hour);
  const sts = LISTS[list];
  const extras = seen ? Array(Math.max(0, 10 - sts.length)).fill("idle") : [];
  render(o, [...sts, ...extras]);
  jump(WAITS[wait]);
  if (fx) { o.m[fx] = 2; o.m.streakAddr = o.m.aysAddr = o.m.welcomeAddr = "a0"; o.m.pokeLine = "poke!"; }
  if (party) o.partyUntil = clock.now + 3000;
  const tree = render(o, sts, away ? -1 : 0);
  noErr(tree, `mood ${list}/${wait}`);
  return observe(tree);
}

function captureMoods() {
  const out = {};
  for (const list of Object.keys(LISTS)) for (const wait of Object.keys(WAITS)) for (const away of [true, false])
    for (const hour of [12, 22, 5]) for (const seen of [false, true]) {
      for (const fx of [null, ...FX]) out[[list, wait, away, hour, seen, fx ?? "-", 0].join(",")] = moodCase(list, wait, away, hour, seen, fx, false);
      out[[list, wait, away, hour, seen, "-", 1].join(",")] = moodCase(list, wait, away, hour, seen, null, true);
    }
  return out;
}

// Developer mode: a pinned mood wins unless a takeover one-shot runs; a pinned level overrides.
const DEV_MOODS = ["normal", "glazed", "glazedHard", "slumped", "multiBlocked", "pointAtBlocked", "allBlocked", "fourthWall", "longIdle", "lateNight", "howMany"];
function capturePins() {
  const out = {};
  for (const list of ["w1", "w2i1", "w1b1", "none"]) for (const mood of [null, ...DEV_MOODS])
    for (const fx of [null, "levelUp", "finishPump", "poke", "areYouSure"]) for (const level of [null, 0, 3]) {
      const { o } = mount();
      render(o, LISTS[list]);
      world.shared["sitandwatch.options"] = { dev: true };   // developer mode is an option now
      o.dev = { mood, level, open: false };
      if (fx) { o.m[fx] = 2; o.m.aysAddr = "a0"; o.m.pokeLine = "poke!"; }
      const tree = render(o, LISTS[list]);
      noErr(tree, `pin ${list}/${mood}`);
      out[[list, mood ?? "auto", fx ?? "-", level ?? "real"].join(",")] = observe(tree);
    }
  return out;
}

// Ship: forces level 3 and the normal mood while the explosion runs, stage 0 then 1.
function captureShips() {
  const out = {};
  for (const list of ["none", "w1", "b2", "w1b1"]) for (const kind of ["pushed", "merged", "deployed"]) {
    const { o, cx } = mount();
    render(o, LISTS[list]);
    o.boom(kind, cx);
    const t0 = render(o, LISTS[list]);
    S.advance(60);
    const t1 = render(o, LISTS[list]);
    noErr(t0, "ship"); noErr(t1, "ship");
    out[`${list},${kind}`] = [observe(t0), observe(t1), texts(t1).filter((t) => /LIVE|MERGED|DEPLOYED|BOOM/.test(t)).join("/")];
  }
  return out;
}

// The demo, through the real Office path: each state at each second.
function captureDemo() {
  const out = [], counts = [];
  const { o } = mount();
  o.demoAt = clock.now;
  for (let i = 0; i < 24; i++) for (let sec = 0; sec < 5; sec++) {
    clock.now = o.demoAt + i * 5000 + sec * 1000;
    const tree = render(o, []);
    noErr(tree, `demo ${i}`);
    out.push(observe(tree));
    if (sec === 0) counts.push(count(tree));
  }
  return { states: out, counts };
}

// The one-shot lists, by behaviour: the dev chips, what each fire sets, what the 1s timer counts down.
function oneShotState(o) { return Object.fromEntries(FX.map((k) => [k, o.m[k]]).filter(([, v]) => v)); }
function captureOneShots() {
  const { o } = mount();
  render(o, LISTS.w1);
  world.shared["sitandwatch.options"] = { dev: true };
  o.dev = { mood: null, level: null, open: true };
  const chips = ids(render(o, LISTS.w1)).filter((x) => x.startsWith("dev-fx-")).map((x) => x.slice(7));
  const fire = {};
  for (const ev of chips) {
    const { o, cx } = mount();
    render(o, LISTS.w1);
    const before = clock.now;
    o.fire(ev, cx);
    fire[ev] = { fx: oneShotState(o), party: o.partyUntil ? o.partyUntil - before : 0, ship: o.ship?.banner ?? null,
      addr: [o.m.streakAddr, o.m.welcomeAddr, o.m.aysAddr].join("/"), chaos: world.shared["sitandwatch.options"]?.chaos === true };   // chaos is an option now
  }
  const { o: c } = mount();
  render(c, LISTS.w1);
  for (const k of FX) c.m[k] = 2;
  S.advance(1000);
  const countdown = FX.filter((k) => c.m[k] === 1).sort();
  return { chips, fire, countdown };
}

// Natural triggers: the one-shots real events start, and how long for.
function captureNatural() {
  const out = {};
  const step = (o, sts, ms = 1000) => { jump(ms); render(o, sts); return oneShotState(o); };
  let { o } = mount();
  render(o, ["working", "idle"]);
  out.finish = [step(o, ["done", "idle"]), o.partyUntil - clock.now];
  ({ o } = mount());
  render(o, ["working", "working", "working", "idle"]);
  step(o, ["done", "working", "working", "idle"]); step(o, ["done", "done", "working", "idle"]);
  out.burst = step(o, ["done", "done", "done", "idle"]);
  ({ o } = mount());
  render(o, ["working"]);
  for (let i = 0; i < 3; i++) { step(o, ["working"], 60000); out[`streak${i}`] = step(o, ["done"]); }
  out.streakAddr = o.m.streakAddr;
  ({ o } = mount());
  render(o, ["working", "idle", "idle", "idle"]);
  out.block1 = step(o, ["working", "blocked", "idle", "idle"]);
  out.block2 = step(o, ["working", "blocked", "blocked", "idle"], 10000);
  out.block3 = step(o, ["working", "blocked", "blocked", "blocked"], 10000);
  out.aysAddr = o.m.aysAddr;
  ({ o } = mount());
  render(o, ["working", "working"]);
  out.collapse = step(o, ["idle", "idle"]);
  ({ o } = mount());
  render(o, ["working", "idle", "idle", "idle"]);
  out.levelUp = step(o, ["working", "working", "working", "working"]);
  ({ o } = mount());
  render(o, ["working"]);
  jump(20000);
  out.welcome = step(o, ["working", "idle"]);
  out.welcomeAddr = o.m.welcomeAddr;
  ({ o } = mount());
  render(o, ["working"]);
  o.partyUntil = clock.now + 500;
  for (const k of FX) o.m[k] = 0;
  S.advance(1000);
  out.linger = oneShotState(o);
  return out;
}

async function captureError() {
  const { o } = mount();
  render(o, ["working"]);
  world.hcLs = { terminals: [{ address: "a0", state: "finished", exit_code: 0 }] };
  S.advance(10000); await S.settle();
  world.hcLs = { terminals: [{ address: "a0", state: "finished", exit_code: 0 }, { address: "a1", state: "finished", exit_code: 1 }] };
  render(o, ["working", "idle"]);
  S.advance(10000); await S.settle();
  return oneShotState(o);
}

// ---- run ----------------------------------------------------------------------
const t0 = performance.now();
const snap = {
  moods: captureMoods(), pins: capturePins(), ships: captureShips(), demo: captureDemo(),
  oneShots: captureOneShots(), natural: captureNatural(), error: await captureError(),
};
const ms = Math.round(performance.now() - t0);
const nMoods = Object.keys(snap.moods).length;

if (process.argv.includes("--capture")) {
  const commit = execSync("git log -1 --format=%h -- ../sitandwatch", { cwd: here }).toString().trim();   // the mod as captured
  const dirty = execSync("git status --porcelain -- ../sitandwatch", { cwd: here }).toString().trim();
  if (dirty) { console.error("refusing to capture: the mod has uncommitted changes; the golden must come from a commit"); process.exit(1); }
  // Each distinct outcome is stored once; cases point at it by index.
  const obs = [], at = new Map();
  const ref = (v) => { const k = JSON.stringify(v); if (!at.has(k)) { at.set(k, obs.length); obs.push(v); } return at.get(k); };
  const refs = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, ref(v)]));
  const golden = { commit, captured: new Date().toISOString(), budget: { max: Math.max(...snap.demo.counts) },
    obs, moods: refs(snap.moods), pins: refs(snap.pins), ships: refs(snap.ships), demo: snap.demo.states.map(ref),
    oneShots: snap.oneShots, natural: snap.natural, error: snap.error };
  writeFileSync(GOLDEN, JSON.stringify(golden, null, 1));
  console.log(`captured golden from ${commit}: ${nMoods} mood cases, ${Object.keys(snap.pins).length} pins, ${snap.demo.states.length} demo frames, element budget base ${golden.budget.max} (${ms}ms)`);
  if (errs.length) { console.error(`ERR panels while capturing:\n${errs.slice(0, 10).join("\n")}`); process.exit(1); }
  process.exit(0);
}

const g = JSON.parse(readFileSync(GOLDEN, "utf8"));
const fails = errs.map((e) => `ERR panel: ${e}`);   // first: a swallowed render error matters most
const diffMap = (name, a, b) => { for (const k of Object.keys(b)) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) fails.push(`${name} ${k}: was ${JSON.stringify(b[k])}, now ${JSON.stringify(a[k])}`); };
const deref = (o) => Object.fromEntries(Object.entries(o).map(([k, i]) => [k, g.obs[i]]));
diffMap("mood", snap.moods, deref(g.moods));
diffMap("pin", snap.pins, deref(g.pins));
diffMap("ship", snap.ships, deref(g.ships));
diffMap("demo", snap.demo.states, g.demo.map((i) => g.obs[i]));
const chipsNow = snap.oneShots.chips.filter((c) => !ALLOWED.newChips.includes(c));
if (JSON.stringify(chipsNow) !== JSON.stringify(g.oneShots.chips)) fails.push(`dev chips: was ${g.oneShots.chips}, now ${chipsNow}`);
diffMap("fire", snap.oneShots.fire, g.oneShots.fire);
const cdNow = snap.oneShots.countdown.filter((k) => !ALLOWED.newOneShots.includes(k));
if (JSON.stringify(cdNow) !== JSON.stringify(g.oneShots.countdown)) fails.push(`countdown set: was ${g.oneShots.countdown}, now ${cdNow}`);
diffMap("natural", snap.natural, g.natural);
if (JSON.stringify(snap.error) !== JSON.stringify(g.error)) fails.push(`error wince: was ${JSON.stringify(g.error)}, now ${JSON.stringify(snap.error)}`);
const budget = g.budget.max + BUDGET_HEADROOM, over = snap.demo.counts.map((n, i) => [i + 1, n]).filter(([, n]) => n > budget);
for (const [i, n] of over) fails.push(`demo state ${i}: ${n} elements, budget ${budget}`);

console.log(`${nMoods} mood cases, ${Object.keys(snap.pins).length} pins, ${snap.demo.states.length} demo frames; largest render ${Math.max(...snap.demo.counts)} elements (budget ${budget}); ${ms}ms`);
if (fails.length) { console.error(`FAIL (${fails.length})\n` + fails.slice(0, 40).join("\n")); process.exit(1); }
console.log("PASS");
void walk;
