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
// Demo frames: the header's total ("DEMO 8/24") grows with each added demo state (ALLOWED.newDemoStates);
// everything else in a frame, his mood, level and lines included, must match.
const demoTotal = (o) => o.replace(/DEMO (\d+)\/\d+/, "DEMO $1/N");
diffMap("demo", snap.demo.states.map(demoTotal), g.demo.map((i) => demoTotal(g.obs[i])));
const chipsNow = snap.oneShots.chips.filter((c) => !ALLOWED.newChips.includes(c));
if (JSON.stringify(chipsNow) !== JSON.stringify(g.oneShots.chips)) fails.push(`dev chips: was ${g.oneShots.chips}, now ${chipsNow}`);
diffMap("fire", snap.oneShots.fire, g.oneShots.fire);
const cdNow = snap.oneShots.countdown.filter((k) => !ALLOWED.newOneShots.includes(k));
if (JSON.stringify(cdNow) !== JSON.stringify(g.oneShots.countdown)) fails.push(`countdown set: was ${g.oneShots.countdown}, now ${cdNow}`);
diffMap("natural", snap.natural, g.natural);
if (JSON.stringify(snap.error) !== JSON.stringify(g.error)) fails.push(`error wince: was ${JSON.stringify(g.error)}, now ${JSON.stringify(snap.error)}`);
// ---- behaviour checks (new features, not in the golden) ---------------------------
const petIds = (tree, name) => ids(tree).filter((x) => x.startsWith(`pet-${name}-`) && !x.endsWith("-step"));
{ // wandering: a forced trip goes out, away and back; an idle panel never wanders
  const { o, cx } = mount();
  render(o, LISTS.w1);
  o.wanderTick(cx, true);
  const t0 = render(o, LISTS.w1);
  S.advance(60);
  const t1 = render(o, LISTS.w1);
  S.advance(2000);
  const t2 = render(o, LISTS.w1);
  const x = (tree, name) => tree && (() => { let v = null; walk(tree, (e) => { if (e.idv === `pet-${name}-walk`) v = e.calls.find(([k]) => k === "left")?.[1][0]; }); return v; })();
  if (x(t0, "Buddy") !== -44 || x(t1, "Buddy") !== -120) fails.push(`wander: Buddy should slide from -44 to -120, was ${x(t0, "Buddy")} -> ${x(t1, "Buddy")}`);
  if (x(t1, "Simba") !== 210) fails.push(`wander: Simba should leave by the right (210), was ${x(t1, "Simba")}`);
  if (petIds(t2, "Buddy").length) fails.push(`wander: Buddy should be away after the walk, saw ${petIds(t2, "Buddy")}`);
  let t3 = null, t4 = null;                              // step until he's walking back, then home
  for (let i = 0; i < 90 && !t4; i++) {
    S.advance(1000);
    const t = render(o, LISTS.w1), w = o.walk.Buddy.phase;
    if (!t3 && (w === "in0" || w === "in1")) t3 = t;
    if (t3 && w === "home") t4 = t;
  }
  if (!t3 || !petIds(t3, "Buddy").includes("pet-Buddy-walk")) fails.push(`wander: Buddy should be walking back, saw ${petIds(t3, "Buddy")}`);
  if (!t4 || !petIds(t4, "Buddy").includes("pet-Buddy-sit")) fails.push(`wander: Buddy should be home, saw ${petIds(t4, "Buddy")}`);
  for (const t of [t0, t1, t2, t3, t4].filter(Boolean)) noErr(t, "wander");
}
{ // nothing happening: nobody wanders, however long
  const { o } = mount();
  render(o, LISTS.idle3);
  let moved = false;
  for (let i = 0; i < 600; i++) { S.advance(1000); render(o, LISTS.idle3); if (Object.values(o.walk ?? {}).some((w) => w.phase !== "home")) moved = true; }
  if (moved) fails.push("wander: a pet wandered with nothing happening");
}
{ // agents busy: each pet goes on its own within ten minutes and comes back
  const { o } = mount();
  render(o, LISTS.w2i1);
  const went = new Set();
  for (let i = 0; i < 600; i++) { S.advance(1000); for (const [k, w] of Object.entries(o.walk ?? {})) if (w.phase === "away") went.add(k); }
  if (went.size !== 3) fails.push(`wander: in 10 busy minutes only ${[...went]} went off`);
}

// The mod's own modules, imported at the same URLs main.js uses (so the same instances).
const R = await import(pathToFileURL(join(MOD, "rules.js")).href);
const A = await import(pathToFileURL(join(MOD, "art.js")).href);
const OPT = await import(pathToFileURL(join(MOD, "options.js")).href);
const allPetIds = (tree) => ids(tree).filter((x) => x.startsWith("pet-") && !x.endsWith("-step"));
const leftOf = (tree, id) => S.findId(tree, (x) => x === id)?.calls.find(([k]) => k === "left")?.[1][0] ?? null;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

{ // options: whatever is stored comes back complete and valid
  // Value: protects=readOptions() turning missing/broken stored options into the defaults, key by key, and setOption() merging;
  //   fails_when=a broken value leaks through (unknown floor, pets not an object, truthy non-boolean speech/chaos/dev), a pet
  //   missing from a partial pets object reads as off, unknown pet names survive, the default floor stops being slate, or
  //   setOption() replaces the stored object instead of merging; why_new=the golden only ever stores { dev: true }, nothing
  //   reads options back; seam=none; no_claim=does not check names like "toString" as a floor (they pass today, see report)
  const DEF = { floor: "slate", pets: { Buddy: true, Snowy: true, Simba: true }, speech: true, chaos: false, dev: false };
  const cases = [
    [undefined, DEF], [null, DEF], ["garbage", DEF], [42, DEF], [{}, DEF],
    [{ floor: "lava" }, DEF], [{ floor: "teal" }, { ...DEF, floor: "teal" }],
    [{ pets: "no" }, DEF], [{ pets: null }, DEF], [{ pets: { Rex: false } }, DEF],
    [{ pets: { Simba: false } }, { ...DEF, pets: { Buddy: true, Snowy: true, Simba: false } }],
    [{ speech: false }, { ...DEF, speech: false }], [{ speech: "no" }, DEF],
    [{ chaos: true }, { ...DEF, chaos: true }], [{ chaos: "true" }, DEF], [{ chaos: 1 }, DEF],
    [{ dev: true }, { ...DEF, dev: true }], [{ dev: 1 }, DEF], [{ dev: "yes" }, DEF],
  ];
  for (const [raw, want] of cases) {
    const got = R.readOptions(raw);
    if (!same(got, want)) fails.push(`options: readOptions(${JSON.stringify(raw)}) gave ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  }
  mount();
  world.shared[OPT.OPTIONS_KEY] = { floor: "teal", pets: { Buddy: false } };
  OPT.setOption({ speech: false });
  const stored = world.shared[OPT.OPTIONS_KEY];
  if (!same(stored, { ...DEF, floor: "teal", pets: { Buddy: false, Snowy: true, Simba: true }, speech: false }))
    fails.push(`options: setOption should merge into what's stored, stored ${JSON.stringify(stored)}`);
}

{ // pet reactions: who is there first, then the loudest thing wins; Snowy knocks when Simba is out
  // Value: protects=petPoses() precedence ship > meltdown > spill > knock > ovation, the empty-chair curl, Simba out at night,
  //   and the knocker rule (Snowy when Simba is out at night or switched off); fails_when=a branch is reordered (e.g. spill
  //   checked before meltdown), the curl stops winning over a ship, Simba stays at night, the can goes to a missing Simba, or
  //   ovation brings Simba back at night; why_new=pet poses are not in the golden (observe() reads only pdev ids) and the
  //   wander checks only use sit; seam=none; no_claim=does not check how the poses are drawn
  const P = (st) => R.petPoses(st);
  const want = (name, got, exp) => { if (!same(got, exp)) fails.push(`pet poses ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(exp)}`); };
  const sit = { buddy: "sit", snowy: "sit", simba: "sit" };
  want("empty chair beats a ship", P({ present: false, ship: true, knock: true }), { buddy: "curl", snowy: "curl", simba: "curl" });
  want("sitting", P({ present: true }), sit);
  want("ship beats meltdown", P({ present: true, ship: true, mood: "allBlocked", spilled: true, knock: true, ovation: true }), { ...sit, buddy: "howl" });
  want("meltdown beats spill", P({ present: true, mood: "allBlocked", spilled: true, knock: true }), { ...sit, buddy: "paw" });
  want("spill beats knock", P({ present: true, spilled: true, knock: true, ovation: true }), { ...sit, buddy: "eat" });
  want("knock beats ovation", P({ present: true, knock: true, ovation: true }), { ...sit, simba: "knock" });
  want("ovation", P({ present: true, ovation: true }), { buddy: "sit", snowy: "back", simba: "back" });
  want("night: Simba out", P({ present: true, night: true }), { ...sit, simba: "gone" });
  want("night knock: Snowy", P({ present: true, night: true, knock: true }), { buddy: "sit", snowy: "knock", simba: "gone" });
  want("night ovation: Simba stays out", P({ present: true, night: true, ovation: true }), { buddy: "sit", snowy: "back", simba: "gone" });
  want("Simba off, knock: Snowy", P({ present: true, knock: true, hide: { Simba: true } }), { ...sit, snowy: "knock" });
  want("Snowy off, knock: still Simba", P({ present: true, knock: true, hide: { Snowy: true } }), { ...sit, simba: "knock" });
}

{ // Options change the panel: floor colour, speech off, pets switched off, and a broken store falls back
  // Value: protects=panel() reading the shared options on every render: the floor colour as the panel background, speech off
  //   removing his bubble (he still reacts), a pet switched off drawing nothing (and a hidden Simba handing the knock to
  //   Snowy on the armrest), and a broken stored object rendering the defaults without an ERR panel;
  //   fails_when=the bg stays hard-coded, speech is ignored or also hides his pose, hide is applied before petPoses() loses
  //   it or not at all, or a broken value reaches FLOORS[...] and throws; why_new=the golden renders with options unset or
  //   { dev: true } only; seam=none; no_claim=does not click the dialog's pills (optionsDialog() is only checked to render)
  const at = (stored, sts = LISTS.w1, pets = undefined) => {
    const { o } = mount();
    world.shared[OPT.OPTIONS_KEY] = stored;
    if (pets) { world.shared[OPT.OPTIONS_KEY] = { ...stored, dev: true }; o.dev = { mood: null, level: null, pets }; }
    const t = render(o, sts);
    noErr(t, `options ${JSON.stringify(stored)}`);
    return t;
  };
  const bg = (t) => S.findId(t, (x) => x === "saw-panel")?.calls.find(([k]) => k === "bg")?.[1][0];
  if (bg(at(undefined)) !== "#6b7a8f") fails.push(`options: default floor should be slate #6b7a8f, was ${bg(at(undefined))}`);
  for (const [k, f] of Object.entries(R.FLOORS)) if (bg(at({ floor: k })) !== f.color) fails.push(`options: floor ${k} should paint ${f.color}, was ${bg(at({ floor: k }))}`);
  const broken = at({ floor: "lava", pets: "x", speech: "no", dev: "yes" });
  if (bg(broken) !== "#6b7a8f") fails.push(`options: a broken store should fall back to slate, was ${bg(broken)}`);
  for (const n of ["Buddy", "Snowy", "Simba"]) if (!allPetIds(broken).some((x) => x.startsWith(`pet-${n}-`))) fails.push(`options: a broken store hid ${n}`);
  if (ids(broken).some((x) => x.startsWith("saw-devstrip"))) fails.push("options: dev: \"yes\" turned developer mode on");
  const talk = at({}), quiet = at({ speech: false });
  if (!ids(talk).some((x) => x.startsWith("pdev-say-"))) fails.push("options: speech on should show his bubble");
  if (ids(quiet).some((x) => x.startsWith("pdev-say-"))) fails.push("options: speech off still shows his bubble");
  if (observe(quiet).split(" | ").slice(0, 3).join() !== observe(talk).split(" | ").slice(0, 3).join()) fails.push("options: speech off changed his pose");
  const none = at({ pets: { Buddy: false, Snowy: false, Simba: false } });
  if (allPetIds(none).length) fails.push(`options: all pets off still drew ${allPetIds(none)}`);
  const noSimba = at({ pets: { Simba: false } });
  if (allPetIds(noSimba).some((x) => x.includes("Simba")) || !allPetIds(noSimba).includes("pet-Buddy-sit") || !allPetIds(noSimba).includes("pet-Snowy-sit"))
    fails.push(`options: Simba off should leave Buddy and Snowy, saw ${allPetIds(noSimba)}`);
  const knockNoSimba = at({ pets: { Simba: false } }, LISTS.w1, "knock");
  if (leftOf(knockNoSimba, "pet-Snowy-sit") !== 56 || !ids(knockNoSimba).includes("pet-can-down"))
    fails.push(`options: Simba off, Snowy should knock from the armrest (left 56) with the can down, saw left ${leftOf(knockNoSimba, "pet-Snowy-sit")}, ${allPetIds(knockNoSimba)}`);
  const knockNone = at({ pets: { Buddy: false, Snowy: false, Simba: false } }, LISTS.w1, "knock");
  if (allPetIds(knockNone).length) fails.push(`options: with every pet off a forced knock still drew ${allPetIds(knockNone)}`);
  // The dialog itself renders from the same options (props.options opens it as an overlay).
  mount();
  world.props = { options: true }; world.shared[OPT.OPTIONS_KEY] = { floor: "navy", pets: { Snowy: false } };
  const dlg = new Office(); dlg.init(world.props, { ...makeCx(), focus_handle: () => ({}) });
  const d = dlg.render(), pillOn = (id) => S.findId(d, (x) => x === id)?.calls.find(([k]) => k === "bg")?.[1][0] === "#ffd86a";
  if (!pillOn("opt-floor-navy") || pillOn("opt-floor-slate") || pillOn("opt-pet-Snowy") || !pillOn("opt-pet-Buddy") || !pillOn("opt-speech-on"))
    fails.push("options: the dialog doesn't show the stored choices");
  world.props = { role: "panel" };
}

{ // pets in the panel: developer mode's scenes, and the real states that set them off
  // Value: protects=PET_SCENES forcing each scene through dev mode (and only while developer mode is on), plus panel()'s
  //   wiring from his real state to petPoses() (empty chair, ship, meltdown, spill, standing ovation, Simba out at night);
  //   fails_when=a scene is mis-keyed or the dev override is applied with dev mode off, or panel() feeds petPoses() the
  //   wrong field (ovation from the wrong level, night not passed, spilled not taken from stance()); why_new=no check reads
  //   pet ids outside wandering; seam=none; no_claim=does not drive the pets-<scene> command (nextCommand never resolves
  //   offline) or check where each pose is placed
  const scene = (pets, dev = true) => {
    const { o } = mount();
    render(o, LISTS.w1);
    world.shared[OPT.OPTIONS_KEY] = { dev };
    o.dev = { mood: null, level: null, pets };
    const t = render(o, LISTS.w1);
    noErr(t, `pets scene ${pets}`);
    return allPetIds(t);
  };
  const has = (name, got, need, not = []) => {
    const miss = need.filter((x) => !got.includes(x)), extra = got.filter((x) => not.some((n) => x.startsWith(n)));
    if (miss.length || extra.length) fails.push(`pets ${name}: missing ${miss}, unexpected ${extra} (saw ${got})`);
  };
  const SC = {
    asleep: [["pet-Buddy-curl", "pet-Snowy-curl", "pet-Simba-curl", "pet-Buddy-z", "pet-Snowy-z", "pet-Simba-z"], ["pet-Buddy-sit"]],
    sit: [["pet-Buddy-sit", "pet-Snowy-sit", "pet-Simba-sit"], ["pet-can-down", "pet-awoo"]],
    ovation: [["pet-Buddy-sit", "pet-Snowy-back", "pet-Simba-back"], []],
    meltdown: [["pet-Buddy-paw", "pet-Snowy-sit", "pet-Simba-sit"], []],
    ship: [["pet-Buddy-howl", "pet-awoo"], []],
    spill: [["pet-Buddy-eat", "pet-Snowy-sit", "pet-Simba-sit"], []],
    knock: [["pet-Buddy-sit", "pet-Snowy-sit", "pet-Simba-sit", "pet-can-down"], []],
    night: [["pet-Buddy-sit", "pet-Snowy-sit"], ["pet-Simba-"]],
  };
  if (!same(Object.keys(SC).sort(), Object.keys(R.PET_SCENES).sort())) fails.push(`pets: scenes are ${Object.keys(R.PET_SCENES)}, this check knows ${Object.keys(SC)}`);
  for (const [k, [need, not]] of Object.entries(SC)) has(`scene ${k}`, scene(k), need, not);
  has("scene ship with dev mode off", scene("ship", false), ["pet-Buddy-sit"], ["pet-awoo", "pet-Buddy-howl"]);
  // The real states.
  const real = (name, sts, hour, need, not, before) => {
    const { o, cx } = mount(hour);
    render(o, sts);
    before?.(o, cx);
    const t = render(o, sts);
    noErr(t, `pets ${name}`);
    has(`real ${name}`, allPetIds(t), need, not);
  };
  real("nothing running", LISTS.idle3, 12, ["pet-Buddy-curl", "pet-Snowy-curl", "pet-Simba-curl"], ["pet-Buddy-sit"]);
  real("one working", LISTS.w1, 12, ["pet-Buddy-sit", "pet-Snowy-sit", "pet-Simba-sit"], ["pet-Buddy-curl"]);
  real("ship", LISTS.w1, 12, ["pet-Buddy-howl", "pet-awoo"], [], (o, cx) => o.boom("merged", cx));
  real("all blocked", LISTS.b2, 12, ["pet-Buddy-paw"], ["pet-Buddy-eat"]);
  real("one blocked", LISTS.w1b1, 12, ["pet-Buddy-eat"], ["pet-Buddy-sit"]);
  real("level 3", LISTS.w4i1, 12, ["pet-Buddy-sit", "pet-Snowy-back", "pet-Simba-back"], []);
  real("late night", LISTS.w1, 23, ["pet-Buddy-sit", "pet-Snowy-sit"], ["pet-Simba-"]);
}

{ // the pet painter: blocks() packs a pose into overlapping rectangles that paint exactly the sprite
  // Value: protects=pack()'s layered rectangles (a colour may run under pixels a later colour paints), the shared-colour
  //   merge, flip for facing left, outlined()'s 1px "X" edge, and the cache; fails_when=a rectangle overpaints a pixel no
  //   later colour fixes, misses a pixel, paints a see-through pixel, the paint order changes, flip/outline shift the
  //   shape, or the cache hands one drawing another's rectangles; why_new=nothing compares painted pixels with the art
  //   (the budget only counts elements); seam=none (the poses are read from art.js's source text, the painter is called
  //   through the exported pet()); no_claim=says nothing about how many rectangles are used
  const src = readFileSync(join(MOD, "art.js"), "utf8");
  const POSE = new Function(`return ${src.slice(src.indexOf("const POSE = ") + 13, src.indexOf("\n};\n", src.indexOf("const POSE = ")) + 2)};`)();
  const flip = (rows) => rows.map((row) => [...row].reverse().join(""));
  const grow = (rows) => {                       // the 8-neighbour 1px edge, worked out independently
    const W = Math.max(...rows.map((r) => r.length)) + 2, H = rows.length + 2;
    const at = (x, y) => rows[y - 1]?.[x - 1] ?? ".";
    return Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => {
      if (at(x, y) !== ".") return at(x, y);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (at(x + dx, y + dy) !== ".") return "X";
      return ".";
    }).join(""));
  };
  let n = 0;
  for (const p of A.PETS) {
    const pal = p.kind === "cat" ? { O: p.coat.O, o: p.coat.o, i: p.coat.i, W: "#ffffff", K: "#2a2320", N: "#e07a8a" } : { ...p.coat };
    pal.X = "#1c1a24";
    for (const [pose, rows0] of Object.entries(POSE[p.kind] ?? {})) for (const left of [false, true]) for (const edge of [false, true]) for (const s of [1, 3]) {
      let rows = edge ? grow(rows0) : rows0;
      if (left) rows = flip(rows);
      const W = Math.max(...rows.map((r) => r.length)) * s, H = rows.length * s;
      const want = Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => pal[rows[Math.floor(y / s)][Math.floor(x / s)]] ?? null));
      const got = Array.from({ length: H }, () => Array(W).fill(null));
      const el = A.pet(p, pose, s, left, edge);
      const arg = (e, k) => e.calls.find(([c]) => c === k)?.[1][0];
      if (arg(el, "w") !== W || arg(el, "h") !== H) { fails.push(`painter ${p.name} ${pose}: box ${arg(el, "w")}x${arg(el, "h")}, want ${W}x${H}`); continue; }
      let outside = false;
      for (const k of el.kids) {
        const [x, y, w, h, c] = ["left", "top", "w", "h", "bg"].map((m) => arg(k, m));
        for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (got[yy]?.[xx] !== undefined) got[yy][xx] = c; else outside = true;
      }
      const bad = [];
      for (let y = 0; y < H && bad.length < 3; y++) for (let x = 0; x < W && bad.length < 3; x++) if (got[y][x] !== want[y][x]) bad.push(`(${x},${y}) ${got[y][x]} not ${want[y][x]}`);
      if (outside || bad.length) fails.push(`painter ${p.name} ${pose} s${s}${left ? " left" : ""}${edge ? " outlined" : ""}: ${outside ? "paints outside its box; " : ""}${bad.join(", ")}`);
      n++;
    }
  }
  if (n < 60) fails.push(`painter: only ${n} drawings checked; POSE didn't parse out of art.js`);
}

const click = (tree, id, cx, ev = "on_click") => { const e = S.findId(tree, (x) => x === id); if (!e?.handlers[ev]) return false; e.handlers[ev](ev === "on_key_down" ? { key: "escape" } : null, cx); return true; };
const optsNow = () => R.readOptions(world.shared[OPT.OPTIONS_KEY]);

{ // commands: `herdr-app do sitandwatch.<c>` reaches the newest panel's loop and does what it says
  // Value: protects=the command loop's new branches (dev and chaos toggling the shared options, options opening the dialog,
  //   wander sending every pet off, pets-<scene|auto> pinning and unpinning a scene) and the hand-off: an older panel's loop
  //   passes a command on and stops instead of acting; fails_when=a branch is dropped or mis-sliced (e.g. "pets-" sliced at
  //   the wrong index), dev/chaos write localStorage or this.m instead of the shared options, dev stops clearing the pins, or
  //   an older loop that no longer owns the commands acts on one; why_new=offline nextCommand never resolved before, so no
  //   command ever ran; seam=none (test-only queue in tools/stubs.mjs); no_claim=does not check Herdr re-dispatching the
  //   hand-off's run() back to the owner, or the fire-/mood-/level-/ship commands (unchanged on this branch)
  await S.settle();
  S.dropCommandWaiters();
  const { o: old } = mount();                          // an older panel: its loop waits first
  S.reseed(7);                                         // (mount() reseeds: a second mount would draw the same token)
  const cx = makeCx(), o = new Office();               // the newest panel owns the commands
  o.init(world.props, cx);
  await S.settle();
  const send = async (c) => { S.sendCommand(c); await S.settle(); };
  render(old, LISTS.w1); render(o, LISTS.w1);
  await send("dev");                                   // reaches the old loop first: it hands it on and stops
  if (!same(world.runs.at(-1), ["sitandwatch.dev", undefined]) || optsNow().dev) fails.push(`commands: an older loop should pass "dev" on untouched, runs ${JSON.stringify(world.runs)}, dev ${optsNow().dev}`);
  o.dev.mood = "glazed";
  await send("dev");
  if (!optsNow().dev || o.dev.mood !== null || !ids(render(o, LISTS.w1)).includes("saw-devstrip")) fails.push(`commands: "dev" should turn developer mode on and clear the pins, dev ${optsNow().dev}, mood ${o.dev.mood}`);
  await send("chaos");
  if (!optsNow().chaos || !ids(render(o, LISTS.w4i1)).some((x) => x.startsWith("pdev-conf-chaos-"))) fails.push(`commands: "chaos" should turn chaos on for the render, chaos ${optsNow().chaos}`);
  await send("chaos");
  if (optsNow().chaos) fails.push("commands: a second \"chaos\" should turn it off");
  world.overlays = [];
  await send("options");
  if (!same(world.overlays, [{ mod: "sitandwatch", kind: "dialog", width: 380, height: 470, props: { options: true } }])) fails.push(`commands: "options" should open the dialog, overlays ${JSON.stringify(world.overlays)}`);
  render(o, LISTS.w1);
  await send("pets-ship");
  if (o.dev.pets !== "ship" || !ids(render(o, LISTS.w1)).includes("pet-awoo")) fails.push(`commands: "pets-ship" should force the ship scene, pets ${o.dev.pets}`);
  await send("pets-auto");
  if (o.dev.pets !== null || ids(render(o, LISTS.w1)).includes("pet-awoo")) fails.push(`commands: "pets-auto" should unpin the scene, pets ${o.dev.pets}`);
  await send("dev");
  if (optsNow().dev) fails.push("commands: a second \"dev\" should turn developer mode off");
  render(o, LISTS.w1);
  await send("wander");
  const phases = Object.fromEntries(Object.entries(o.walk ?? {}).map(([k, w]) => [k, w.phase]));
  if (!same(phases, { Buddy: "out0", Snowy: "out0", Simba: "out0" })) fails.push(`commands: "wander" should send every pet off, ${JSON.stringify(phases)}`);
  void cx;
  S.dropCommandWaiters();
}

{ // the Options dialog and the OPTS button: clicks change the shared options; Done and Esc close it
  // Value: protects=each pill's click writing its choice (floor, a pet on/off and back, speech, chaos, dev), the panel
  //   following at once, Done and Esc closing this overlay, and the header's OPTS opening the dialog without the click
  //   reaching the header (which would start the demo); fails_when=a pill writes the wrong key or value, a pet pill sets
  //   instead of toggling, Done/Esc close nothing or the wrong overlay, or OPTS stops stopping propagation; why_new=pass 1
  //   only checked the dialog renders the stored choices; seam=none (handlers recorded by the stubs); no_claim=does not
  //   check gpui actually stops the event, only that the handler asks it to
  mount();
  world.props = { options: true, overlay: "ov1" }; world.overlays = [{ mod: "sitandwatch", kind: "dialog", props: { options: true } }];
  world.shared[OPT.OPTIONS_KEY] = undefined;
  const cx = makeCx(); cx.focus_handle = () => ({});
  const dlg = new Office(); dlg.init(world.props, cx);
  const press = (id) => { if (!click(dlg.render(), id, cx)) fails.push(`dialog: no ${id} to click`); };
  press("opt-floor-teal");
  if (optsNow().floor !== "teal") fails.push(`dialog: Deep teal should be stored, floor ${optsNow().floor}`);
  press("opt-pet-Simba");
  if (optsNow().pets.Simba !== false || !optsNow().pets.Buddy) fails.push(`dialog: Simba's pill should switch only Simba off, ${JSON.stringify(optsNow().pets)}`);
  press("opt-pet-Simba");
  if (optsNow().pets.Simba !== true) fails.push("dialog: Simba's pill again should switch Simba back on");
  press("opt-speech-off"); press("opt-chaos-on"); press("opt-dev-on");
  const want = { floor: "teal", pets: { Buddy: true, Snowy: true, Simba: true }, speech: false, chaos: true, dev: true };
  if (!same(optsNow(), want)) fails.push(`dialog: after the clicks options are ${JSON.stringify(optsNow())}`);
  press("opt-dev-off");
  if (optsNow().dev) fails.push("dialog: dev off should turn developer mode off");
  press("opt-done");
  if (world.overlays.length) fails.push(`dialog: Done should close it, overlays ${JSON.stringify(world.overlays)}`);
  world.overlays = [{ mod: "sitandwatch" }, { mod: "other" }]; world.props = { options: true, overlay: "ov1" };
  cx.stopped = false;
  if (!click(dlg.render(), "saw-options", cx, "on_key_down") || !same(world.overlays, [{ mod: "other" }]) || !cx.stopped) fails.push(`dialog: Esc should close just this overlay, overlays ${JSON.stringify(world.overlays)}`);
  // The panel follows, and its OPTS button opens the dialog without starting the demo.
  world.props = { role: "panel" };
  const { o, cx: pcx } = mount();
  world.shared[OPT.OPTIONS_KEY] = { floor: "teal" };
  const t = render(o, LISTS.w1);
  if (S.findId(t, (x) => x === "saw-panel")?.calls.find(([k]) => k === "bg")?.[1][0] !== R.FLOORS.teal.color) fails.push("dialog: the panel didn't follow the floor choice");
  world.overlays = []; pcx.stopped = false;
  click(t, "saw-opts", pcx);
  if (world.overlays[0]?.props?.options !== true || !pcx.stopped || o.demoAt != null) fails.push(`dialog: OPTS should open the dialog and stop the click, overlays ${JSON.stringify(world.overlays)}, stopped ${pcx.stopped}`);
  pcx.stopped = false; click(t, "saw-opts", pcx, "on_mouse_down");
  if (!pcx.stopped) fails.push("dialog: OPTS mouse-down should stop propagation too");
}

{ // developer mode's pets row: a chip per scene plus auto and wander, and each does what it says
  // Value: protects=the pets row (one chip per PET_SCENES key, auto, wander), a scene chip pinning that scene and lighting
  //   up, auto unpinning, and wander sending every pet off; fails_when=a chip is missing or mis-keyed, onPets is not wired
  //   to dev.pets, the chosen chip doesn't light, or wander isn't forced; why_new=no check clicked the dev strip's pet row;
  //   seam=none; no_claim=does not check the level/mood/fire rows (unchanged on this branch)
  const { o, cx } = mount();
  world.shared[OPT.OPTIONS_KEY] = { dev: true };
  o.dev.open = true;                                   // the button rows show once "buttons" is pressed
  let t = render(o, LISTS.w1);
  const chips = ids(t).filter((x) => x.startsWith("dev-pt-")).map((x) => x.slice(7));
  if (!same(chips, ["auto", ...Object.keys(R.PET_SCENES), "wander"])) fails.push(`dev pets row: chips ${chips}`);
  const lit = (tree, k) => S.findId(tree, (x) => x === `dev-pt-${k}`)?.calls.find(([c]) => c === "bg")?.[1][0] === "#ffd86a";
  if (!lit(t, "auto")) fails.push("dev pets row: auto should be lit with nothing pinned");
  click(t, "dev-pt-spill", cx);
  t = render(o, LISTS.w1);
  if (o.dev.pets !== "spill" || !lit(t, "spill") || lit(t, "auto") || !allPetIds(t).includes("pet-Buddy-eat")) fails.push(`dev pets row: spill should pin the spill scene, pets ${o.dev.pets}, saw ${allPetIds(t)}`);
  click(t, "dev-pt-auto", cx);
  t = render(o, LISTS.w1);
  if (o.dev.pets !== null || !lit(t, "auto") || allPetIds(t).includes("pet-Buddy-eat")) fails.push(`dev pets row: auto should unpin, pets ${o.dev.pets}`);
  click(t, "dev-pt-wander", cx);
  const phases = Object.values(o.walk ?? {}).map((w) => w.phase);
  if (!same(phases, ["out0", "out0", "out0"])) fails.push(`dev pets row: wander should send all three off, phases ${phases}`);
}

{ // the can: when a cat knocks it, it leaves his armrest and lands on the floor
  // Value: protects=panel() passing canDown to spectator() from the knocker's pose, so the armrest can (drawn from level 2)
  //   and the knocked can are never both drawn; fails_when=canDown is not passed or read, is computed from Simba only (so a
  //   Snowy knock with Simba off leaves the can up), or the can is dropped when no pet is there to knock it;
  //   why_new=no check looked at the armrest can; seam=none; no_claim=the real knock never happens yet (panel() passes
  //   knock: false), so only the dev knock scene reaches this
  const armCans = (tree) => { let n = 0; walk(tree, (e) => { const bg = e.calls?.find(([k]) => k === "bg")?.[1][0], w = e.calls?.find(([k]) => k === "w")?.[1][0]; if (bg === "#c0c6cf" && w === 9) n++; }); return n; };
  const at = (sts, pets, petsOn) => {
    const { o } = mount();
    world.shared[OPT.OPTIONS_KEY] = { dev: true, ...(petsOn ? { pets: petsOn } : {}) };
    o.dev = { mood: null, level: null, pets };
    const t = render(o, sts);
    noErr(t, `can ${pets}`);
    return { arm: armCans(t), down: ids(t).includes("pet-can-down") };
  };
  const want = (name, got, arm, down) => { if (got.arm !== arm || got.down !== down) fails.push(`can ${name}: armrest ${got.arm}, on the floor ${got.down}; want ${arm}, ${down}`); };
  want("level 2, sitting", at(LISTS.w2i1, "sit"), 1, false);
  want("level 2, Simba knocks", at(LISTS.w2i1, "knock"), 0, true);
  want("level 2, Simba off: Snowy knocks", at(LISTS.w2i1, "knock", { Simba: false }), 0, true);
  want("level 2, no cats: nobody knocks", at(LISTS.w2i1, "knock", { Snowy: false, Simba: false }), 1, false);
  want("level 1: no can to knock", at(LISTS.w1, "sit"), 0, false);
}

{ // chaos reaches the render, and pets stay home in the demo and go home when work stops
  // Value: protects=the chaos option feeding trackMetrics (lingering chaos confetti at level 3 with fewer than 6 working),
  //   wanderTick doing nothing while the demo runs, and a trip cut short (key cleared) when nothing is busy any more, so
  //   its pending steps can't carry it on; fails_when=chaos is read from this.m/localStorage again, the demo stops pausing
  //   wandering, or the reset leaves the trip's key so a pending "away" step still fires; why_new=the golden never sets
  //   chaos, and the wander checks never stop work mid-trip or run the demo; seam=none; no_claim=does not check chaos's
  //   faster speech period
  for (const chaos of [false, true]) {
    const { o } = mount();
    world.shared[OPT.OPTIONS_KEY] = { chaos };
    const t = render(o, LISTS.w4i1);
    if (ids(t).some((x) => x.startsWith("pdev-conf-chaos-")) !== chaos) fails.push(`chaos: option ${chaos} but chaos confetti ${!chaos}`);
  }
  let { o, cx } = mount();
  render(o, LISTS.w1);
  o.toggleDemo();
  let moved = false;
  for (let i = 0; i < 600; i++) { S.advance(1000); if (Object.values(o.walk ?? {}).some((w) => w.phase !== "home")) moved = true; }
  if (moved) fails.push("wander: a pet wandered during the demo");
  ({ o, cx } = mount());
  render(o, LISTS.w1);
  o.wanderTick(cx, true);
  S.advance(60);
  render(o, LISTS.idle3);
  o.wanderTick(cx);
  const cut = Object.values(o.walk).map((w) => w.phase + "/" + w.key);
  S.advance(5000);
  const after = Object.values(o.walk).map((w) => w.phase);
  const t = render(o, LISTS.idle3);
  if (!same(cut, ["home/null", "home/null", "home/null"]) || !same(after, ["home", "home", "home"]) || !allPetIds(t).includes("pet-Buddy-curl"))
    fails.push(`wander: stopping work mid-trip should send them home for good, at once ${cut}, later ${after}, saw ${allPetIds(t)}`);
}

// ---- desks in last-active order, old ones under cobwebs ----------------------------
{
  // Value: protects=desks sorted most-recently-active first (busy = now, else when they entered their status, from hc),
  // ties keeping their order, and the cobweb levels (1h one web, 8h covered) from rules.js and as drawn;
  // fails_when=the sort flips, ties reshuffle, a threshold moves, idle desks stop asking hc, or webs land on busy desks;
  // why_new=nothing else checks desk order or cobwebs; seam=none;
  // no_claim=Herdr's real status_ms values and svg tinting (stubbed hc, recorded svg elements)
  const R = await import(pathToFileURL(join(MOD, "rules.js")).href);
  const order = (list, last) => R.byLastActive(list.map((address) => ({ address })), last).map((a) => a.address).join(",");
  if (order(["a", "b", "c"], { a: 1, b: 3, c: 2 }) !== "b,c,a") fails.push(`desks: byLastActive should put b,c,a, got ${order(["a", "b", "c"], { a: 1, b: 3, c: 2 })}`);
  if (order(["a", "b", "c", "d"], { a: 5, b: 5, c: 9, d: 5 }) !== "c,a,b,d") fails.push("desks: byLastActive should keep tied desks in their order");
  if (order(["a", "b"], {}) !== "a,b") fails.push("desks: unknown times should keep the order");
  const lv = [0, 59 * MIN, 60 * MIN, 8 * 60 * MIN - 1, 8 * 60 * MIN].map(R.cobwebLevel).join("");
  if (lv !== "00112") fails.push(`desks: cobweb levels at 0, 59m, 1h, 8h-1ms, 8h should be 0,0,1,1,2, got ${lv.split("").join(",")}`);

  // Live: hc says a1 went done 10h ago, a2 idle 2h ago, a3 idle 5 minutes ago; a0 is working.
  const { o } = mount();
  const sts = ["working", "done", "idle", "idle"], ago = [0, 10 * 60 * MIN, 2 * 60 * MIN, 5 * MIN];
  world.hcLs = { terminals: sts.map((status, i) => ({ address: `a${i}`, state: "live", status, name: `t${i}` })) };
  world.hcGet = Object.fromEntries(sts.map((st, i) => [`a${i}`, { status: { state: st }, status_ms: clock.now - ago[i] }]));
  S.advance(10000); await S.settle(); await S.settle();
  const asked = new Set(Object.keys(o.m.hcSince));
  if (!["a1", "a2", "a3"].every((a) => asked.has(a))) fails.push(`desks: the poll should ask hc about idle and done agents too, asked ${[...asked]}`);
  const t = render(o, sts);
  const desks = ids(t).filter((x) => /^pd-a\d$/.test(x)).join(",");
  if (desks !== "pd-a0,pd-a3,pd-a2,pd-a1") fails.push(`desks: order should be working, then 5m, 2h, 10h ago, got ${desks}`);
  const webs = (a) => ids(t).filter((x) => x.startsWith(`pw-${a}-`)).sort().join(",");
  if (webs("a0") || webs("a3")) fails.push(`desks: busy or recent desks should have no cobwebs, got ${webs("a0")} ${webs("a3")}`);
  if (webs("a2") !== "pw-a2-1") fails.push(`desks: a desk idle 2h should have one web, got ${webs("a2") || "none"}`);
  if (webs("a1") !== "pw-a1-1,pw-a1-2,pw-a1-3,pw-a1-dust") fails.push(`desks: a desk idle 10h should be covered, got ${webs("a1") || "none"}`);
  noErr(t, "desks");

  // Developer mode's desk age: every desk not busy looks 8h old; a busy one stays clean.
  world.shared["sitandwatch.options"] = { dev: true };
  o.dev.desks = "8h"; o.dev.open = true;   // the rows show with the buttons open
  const t8 = render(o, sts);
  const covered = ["a1", "a2", "a3"].filter((a) => ids(t8).includes(`pw-${a}-dust`)).length;
  if (covered !== 3 || ids(t8).some((x) => x.startsWith("pw-a0-"))) fails.push(`desks: dev 8h should cover the 3 idle desks and not the busy one, covered ${covered}`);
  if (!ids(t8).includes("dev-dk-8h")) fails.push("desks: the dev strip should have the desks row");
  world.shared["sitandwatch.options"] = { dev: false };     // like the pet scenes: only while dev mode is on
  if (ids(render(o, sts)).includes("pw-a3-dust")) fails.push("desks: the dev desk age should be ignored with developer mode off");

  // The demo's "Old agents" state shows both levels.
  const { o: d } = mount();
  d.demoAt = clock.now;
  let td = null;                                         // find the state by its label, not its position
  for (let i = 0; i < 40 && !td; i++) { clock.now = d.demoAt + i * 5000; const t = render(d, []); if (texts(t).some((x) => x.includes("Old agents"))) td = t; }
  if (!td) { fails.push("desks: no \"Old agents\" demo state"); td = render(d, []); }
  const demoWebs = ids(td).filter((x) => x.startsWith("pw-"));
  if (!demoWebs.some((x) => x.endsWith("-dust")) || !demoWebs.some((x) => /^pw-demo-[23]-1$/.test(x))) fails.push(`desks: the "Old agents" demo state should show a web and a covered desk, got ${demoWebs}`);
  noErr(td, "desks demo");
}

// ---- the power bar ---------------------------------------------------------------
{
  // Value: protects=the session meter: +1 a second per working agent, -0.25 idle down to 0, POWER! once at 1200 then empty,
  // waiting while a ship plays, counted only by the owning copy from the live agents (not the demo's), kept an hour;
  // fails_when=the maths, the reset, the owner gate, the live list, the ship hold or the reload store breaks;
  // why_new=nothing else reads the meter; seam=none; no_claim=Herdr's real localStorage and timers (stubbed, fake clock)
  const R = await import(pathToFileURL(join(MOD, "rules.js")).href);
  const st = (p, w, h) => JSON.stringify(R.powerStep(p, w, h));
  if (st(10, 3) !== '{"power":13,"fire":false}') fails.push(`power: 3 working should add 3, got ${st(10, 3)}`);
  if (st(10, 0) !== '{"power":9.75,"fire":false}' || st(0.1, 0) !== '{"power":0,"fire":false}') fails.push("power: idle should drain 0.25 a second, never below 0");
  if (st(1199, 1) !== '{"power":0,"fire":true}') fails.push(`power: reaching 1200 should fire once and empty, got ${st(1199, 1)}`);
  if (st(1199, 1, true) !== '{"power":1200,"fire":false}') fails.push(`power: a ship playing should hold it full, got ${st(1199, 1, true)}`);
  if (st(NaN, 1) !== '{"power":1,"fire":false}') fails.push("power: a broken meter should restart from 0");
  const now = clock.now;
  if (R.loadPower("600", String(now - 59 * MIN), now) !== 600 || R.loadPower("600", String(now - 61 * MIN), now) !== 0 || R.loadPower("x", String(now), now) !== 0 || R.loadPower("9999", String(now), now) !== 1200)
    fails.push("power: a saved meter is kept an hour, clamped, and a broken one is 0");

  // Live: two working agents charge 2 a second, from agents() even while the demo is showing.
  const { o } = mount();
  render(o, ["idle", "idle", "idle"]);                   // what's on screen: nobody working
  world.agents = agentsOf(["working", "working", "idle"]);   // the live agents, unseen while the demo shows
  o.demoAt = clock.now;
  S.advance(10000);
  if (o.m.power !== 20) fails.push(`power: 10s of 2 working (demo showing) should be 20, got ${o.m.power}`);
  o.demoAt = null;
  // A copy that isn't the owner doesn't count.
  localStorage.setItem("commands-owner", "someone-else");
  S.advance(5000);
  if (o.m.power !== 20) fails.push(`power: a copy that doesn't own the commands shouldn't count, got ${o.m.power}`);
  const { o: f, cx: fcx } = mount();
  render(f, ["working"]);
  // Saved on a step change, loaded by the next copy.
  f.m.power = 59; S.advance(1000);
  if (localStorage.getItem("power") !== "60") fails.push(`power: a new step should be saved, saved ${localStorage.getItem("power")}`);
  // Full: POWER! for 4 ticks, level 3 even with an agent blocked, pets awake; the bar empties.
  f.m.power = 1199; S.advance(1000);
  const tp = render(f, ["working", "blocked"]);
  const head = ids(tp).find((x) => x.startsWith("pdev-head-")) ?? "";
  if (f.m.powerUp !== 4 || f.m.power !== 0 || !head.startsWith("pdev-head-3-power")) fails.push(`power: full should fire POWER! at level 3 and empty, got powerUp=${f.m.powerUp} power=${f.m.power} ${head}`);
  if (!texts(tp).includes("POWER!")) fails.push("power: he should say POWER!");
  if (!ids(tp).includes("pdev-body-3-false")) fails.push(`power: POWER! should stand him up, not sad, with an agent blocked; got ${ids(tp).find((x) => x.startsWith("pdev-body-"))}`);
  let glow = false; walk(tp, (e) => { if (e.calls.some(([k, a]) => k === "bg" && a[0] === "#ff5a5a44")) glow = true; });
  if (!glow) fails.push("power: the corner should glow at level 3 during POWER!");
  if (!ids(tp).some((x) => /^pet-(Buddy|Snowy|Simba)-sit$/.test(x)) || ids(tp).some((x) => /-(curl|paw|eat|back)$/.test(x))) fails.push("power: the pets should be awake and staring");
  noErr(tp, "power");
  // Waits for a ship explosion.
  f.m.powerUp = 0; f.m.power = 1199; f.boom("merged", fcx); S.advance(1000);
  if (f.m.power !== 1200 || f.m.powerUp) fails.push(`power: during a ship it should wait full, got power=${f.m.power} powerUp=${f.m.powerUp}`);
  S.advance(3000);
  if (!(f.m.powerUp > 0) || f.m.power > 1) fails.push(`power: after the ship it should fire (then charge on), got powerUp=${f.m.powerUp} power=${f.m.power}`);
  // The bar: 20 steps across 40px.
  f.m.power = 600;
  const fill = (t) => { let w = null; walk(t, (e) => { if (e.idv === "saw-power-fill") w = e.calls.find(([k]) => k === "w")?.[1][0]; }); return w; };
  if (fill(render(f, ["working"])) !== 20) fails.push(`power: half full should draw 20px of 40, got ${fill(render(f, ["working"]))}`);
}

const budget = g.budget.max + BUDGET_HEADROOM, over = snap.demo.counts.map((n, i) => [i + 1, n]).filter(([, n]) => n > budget);
for (const [i, n] of over) fails.push(`demo state ${i}: ${n} elements, budget ${budget}`);

console.log(`${nMoods} mood cases, ${Object.keys(snap.pins).length} pins, ${snap.demo.states.length} demo frames; largest render ${Math.max(...snap.demo.counts)} elements (budget ${budget}); ${ms}ms`);
if (fails.length) { console.error(`FAIL (${fails.length})\n` + fails.slice(0, 40).join("\n")); process.exit(1); }
console.log("PASS");
void walk;
