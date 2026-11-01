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
const { LINES } = await import(pathToFileURL(join(MOD, "lines.js")).href);
const LINES_OF = (k) => LINES[k] ?? [];
const { clock, world, makeCx, reseed, texts, ids, count, walk, sendCommand } = S;

// Intended differences from the golden (new features), and the element budget headroom.
const ALLOWED = { newChips: [], newOneShots: [], newDemoStates: 0 };   // since the golden's commit (013b547): none yet
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
  world.hcLs = { terminals: [] }; world.hcGet = {}; world.shared = {}; world.overlays = []; world.layout = null; world.runResult = null;
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
const FX = ["finishPump", "blockedPhone", "collapse", "newAgentWelcome", "errorWince", "burstDance", "streak", "areYouSure", "levelUp", "linger", "poke", "pushOff", "prOpened"];

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
  // every state the demo has (its header says how many), so the budget and ERR checks see them all
  const total = Number(/^DEMO \d+\/(\d+)/.exec(texts(render(o, [])).find((t) => /^DEMO \d/.test(t)) ?? "")?.[1] ?? 0);
  for (let i = 0; i < total; i++) for (let sec = 0; sec < 5; sec++) {
    clock.now = o.demoAt + i * 5000 + sec * 1000;
    const tree = render(o, []);
    noErr(tree, `demo ${i}`);
    out.push(observe(tree));
    if (sec === 0) counts.push(count(tree));
  }
  return { states: out, counts, total };
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
const fails = [];
// ERR panels are collected at the end (below): the behaviour checks' noErr calls come after this line.
const diffMap = (name, a, b) => { for (const k of Object.keys(b)) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) fails.push(`${name} ${k}: was ${JSON.stringify(b[k])}, now ${JSON.stringify(a[k])}`); };
const deref = (o) => Object.fromEntries(Object.entries(o).map(([k, i]) => [k, g.obs[i]]));
diffMap("mood", snap.moods, deref(g.moods));
diffMap("pin", snap.pins, deref(g.pins));
diffMap("ship", snap.ships, deref(g.ships));
// Demo frames: the header's total ("DEMO 8/24") grows with each added demo state (ALLOWED.newDemoStates);
// everything else in a frame, his mood, level and lines included, must match.
// The golden's frames must match the first frames now; the states added since are budget- and ERR-checked (captureDemo)
// but not compared, and their number must be exactly ALLOWED.newDemoStates.
const demoTotal = (o) => o.replace(/DEMO (\d+)\/\d+/, "DEMO $1/N");
diffMap("demo", snap.demo.states.slice(0, g.demo.length).map(demoTotal), g.demo.map((i) => demoTotal(g.obs[i])));
if (snap.demo.total !== g.demo.length / 5 + ALLOWED.newDemoStates) fails.push(`demo: ${snap.demo.total} states, want the golden's ${g.demo.length / 5} + ${ALLOWED.newDemoStates} allowed`);
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
  const DEF = { height: null, floor: "slate", pets: { Buddy: true, Snowy: true, Simba: true }, speech: true, activity: true, chaos: false, dev: false };
  const cases = [
    [undefined, DEF], [null, DEF], ["garbage", DEF], [42, DEF], [{}, DEF],
    [{ floor: "lava" }, DEF], [{ floor: "teal" }, { ...DEF, floor: "teal" }],
    [{ pets: "no" }, DEF], [{ pets: null }, DEF], [{ pets: { Rex: false } }, DEF],
    [{ pets: { Simba: false } }, { ...DEF, pets: { Buddy: true, Snowy: true, Simba: false } }],
    [{ speech: false }, { ...DEF, speech: false }], [{ speech: "no" }, DEF],
    [{ activity: false }, { ...DEF, activity: false }], [{ activity: "no" }, DEF], [{ activity: 0 }, DEF],
    [{ chaos: true }, { ...DEF, chaos: true }], [{ chaos: "true" }, DEF], [{ chaos: 1 }, DEF],
    [{ dev: true }, { ...DEF, dev: true }], [{ dev: 1 }, DEF], [{ dev: "yes" }, DEF],
    [{ height: 400 }, { ...DEF, height: 400 }], [{ height: 401 }, DEF], [{ height: "400" }, DEF], [{ height: 0 }, DEF],
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
  if (!same(world.overlays, [{ mod: "sitandwatch", kind: "dialog", width: 380, height: 610, props: { options: true } }])) fails.push(`commands: "options" should open the dialog, overlays ${JSON.stringify(world.overlays)}`);
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
  press("opt-speech-off"); press("opt-activity-off"); press("opt-chaos-on"); press("opt-dev-on"); press("opt-height-400");
  const want = { height: 400, floor: "teal", pets: { Buddy: true, Snowy: true, Simba: true }, speech: false, activity: false, chaos: true, dev: true };
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

// ---- minimise -----------------------------------------------------------------------
{
  // Value: protects=minimise: finding this panel's block (panel role only, refusing when ambiguous, no id, or min too big),
  // shrinking to a 30px strip in a column or a 40px rail in a row, restoring the saved size, a toast for every failure,
  // one action per double click, the dragged-open check, and the button not starting the demo;
  // fails_when=any of those rules breaks; why_new=no other check touches layout() or layout.resize; seam=none;
  // no_claim=Herdr's real layout engine and toasts (fake layout()/run/notify; checked live once by hand)
  const R = await import(pathToFileURL(join(MOD, "rules.js")).href);
  const blk = (extra = {}) => ({ id: "sitandwatch", type: "block", content: { mod: "sitandwatch" }, size: { px: 300 }, ...extra });
  const tree = (kids, type = "column") => ({ id: "root", type: "row", children: [{ id: "sidebar", type, children: kids }] });
  const fb = (t) => JSON.stringify(R.findBlock(t));
  if (fb(tree([blk()])) !== JSON.stringify({ ok: true, id: "sitandwatch", axis: "column", target: 30, size: { px: 300 } })) fails.push(`min: a column block should shrink to a 30px strip, got ${fb(tree([blk()]))}`);
  if (R.findBlock(tree([blk()], "row")).target !== 40) fails.push("min: a row block should shrink to a 40px rail");
  if (R.findBlock(tree([blk(), { id: "office", content: { mod: "sitandwatch", props: { role: "office" } } }])).ok !== true) fails.push("min: the office view shouldn't count as a panel");
  const why = (t) => R.findBlock(t).reason;
  if (why(tree([])) !== "none" || why(tree([blk(), blk({ id: "two" })])) !== "ambiguous" || why(tree([blk({ id: undefined })])) !== "noid" || why(tree([blk({ min: 220 })])) !== "min")
    fails.push(`min: refusals should be none/ambiguous/noid/min, got ${[why(tree([])), why(tree([blk(), blk({ id: "two" })])), why(tree([blk({ id: undefined })])), why(tree([blk({ min: 220 })]))]}`);
  if (R.shouldClearMin(250, 0, 2000) || !R.shouldClearMin(250, 0, 4000) || R.shouldClearMin(100, 0, 4000)) fails.push("min: dragged open is >= 139px after the 3s guard");

  // Live in a column: the button shrinks to the strip, a double click is one action, the strip shows count/bar/face.
  S.dropCommandWaiters();                                // earlier mounts' loops would take the command
  const { o, cx } = mount();
  world.layout = tree([blk()]);
  const t0 = render(o, ["working", "idle"]);
  let btn = null; walk(t0, (e) => { if (e.idv === "saw-min") btn = e; });
  if (!btn?.handlers.on_mouse_down || !btn.handlers.on_click) fails.push("min: the _ button should handle its own mouse-down and click");
  const c1 = makeCx(); btn?.handlers.on_click?.({}, c1); btn?.handlers.on_click?.({}, makeCx());
  const resizes = () => world.runs.filter(([n]) => n === "layout.resize");
  if (!c1.stopped) fails.push("min: the _ click should stop propagation (no demo)");
  if (JSON.stringify(resizes()) !== JSON.stringify([["layout.resize", { id: "sitandwatch", px: 30 }]])) fails.push(`min: one click should resize once to 30px, got ${JSON.stringify(resizes())}`);
  const ts = render(o, ["working", "idle"]);
  if (!ids(ts).includes("saw-strip") || ids(ts).includes("saw-panel") || !texts(ts).includes("1/2 AT IT") || !ids(ts).some((x) => x.startsWith("mini-face-")))
    fails.push("min: minimised in a column should draw the strip with the count and his face");
  // Restore: the saved size goes back.
  S.advance(1000);
  sendCommand("min"); await S.settle();
  if (JSON.stringify(resizes().at(-1)) !== JSON.stringify(["layout.resize", { id: "sitandwatch", px: 300 }]) || o.min) fails.push(`min: restore should resize back to 300px, got ${JSON.stringify(resizes().at(-1))}`);
  // Dragged open: shrink, Herdr reports 30, then 250 -> the full panel again.
  S.advance(1000); o.minimise(cx); world.layout = tree([blk({ size: { px: 30 } })]);
  S.advance(4000);
  if (!o.min || o.min.seen !== 30) fails.push(`min: it should note the size Herdr reports after shrinking, got ${JSON.stringify(o.min)}`);
  world.layout = tree([blk({ size: { px: 250 } })]); S.advance(1000);
  if (o.min) fails.push("min: dragged open to 250px should clear minimised");
  // A layout() that keeps saying the configured size never clears it.
  world.layout = tree([blk()]); o.minimise(cx); S.advance(6000);
  if (!o.min) fails.push("min: a layout() that always reports 300px shouldn't clear minimised");
  o.setMin(null);

  // Failures: a toast each, nothing left half-done.
  const { o: f, cx: fcx } = mount();
  const tryMin = (t, result) => { world.notes = []; world.runs = []; world.layout = t; world.runResult = result ?? null; f.minBusy = false; f.minimise(fcx); return world.notes.map((n) => n.body).join(" | "); };
  render(f, ["working"]);
  if (!tryMin(tree([blk({ min: 220 })])).includes("lower my block's min") || f.min || world.runs.length) fails.push("min: a block min over 30 should toast and not resize");
  if (!tryMin(tree([blk(), blk({ id: "two" })])).includes("Two Sit & Watch panels")) fails.push("min: two panels should toast");
  if (!tryMin(null).includes("Can't find my block")) fails.push("min: no block should toast");
  if (!tryMin(tree([blk()]), () => ({ error: "no node" })).includes("Herdr refused") || f.min) fails.push(`min: a refused resize should toast and stay unminimised, min=${JSON.stringify(f.min)}`);

  // In a row: a rail.
  const { o: w, cx: wcx } = mount();
  world.layout = tree([blk()], "row"); world.runs = [];
  render(w, ["working"]); w.minimise(wcx);
  const tr = render(w, ["working"]);
  if (!ids(tr).includes("saw-rail") || JSON.stringify(world.runs.at(-1)) !== JSON.stringify(["layout.resize", { id: "sitandwatch", px: 40 }])) fails.push("min: docked in a row it should be a 40px rail");
  for (const t of [ts, tr]) noErr(t, "min");
}

{ // Value: protects=readOptions() taking only real floor names (own keys), not Object.prototype ones; fails_when=the lookup
  // goes back to FLOORS[o.floor]; why_new=the options block found it but couldn't change rules.js; seam=none; no_claim=none beyond protects
  const R = await import(pathToFileURL(join(MOD, "rules.js")).href);
  for (const bad of ["toString", "constructor", "__proto__", "hasOwnProperty"]) if (R.readOptions({ floor: bad }).floor !== "slate") fails.push(`options: floor "${bad}" should fall back to slate`);
}

{ // Value: protects=a finished agent's desk showing how long it's waited ("<1m", "12m", "3h", "2d"), from when it finished
  // (hc's status_ms), and only on done desks; fails_when=the label goes, shows on working/idle desks, or the units slip;
  // why_new=nothing else reads the done label; seam=none; no_claim=Herdr's real status_ms (stubbed hc)
  const R = await import(pathToFileURL(join(MOD, "rules.js")).href);
  const lab = [0, 59999, MIN, 59 * MIN, 60 * MIN, 23 * 60 * MIN + 59 * MIN, 24 * 60 * MIN, 50 * 60 * MIN].map(R.sinceLabel).join(",");
  if (lab !== "<1m,<1m,1m,59m,1h,23h,1d,2d") fails.push(`done label: got ${lab}`);
  S.dropCommandWaiters();
  const { o } = mount();
  const sts = ["working", "done", "idle", "done"], ago = [0, 12 * MIN, 3 * 60 * MIN, 30 * 1000];
  world.hcLs = { terminals: sts.map((status, i) => ({ address: `a${i}`, state: "live", status, name: `t${i}` })) };
  world.hcGet = Object.fromEntries(sts.map((st, i) => [`a${i}`, { status: { state: st }, status_ms: clock.now - ago[i] }]));
  S.advance(10000); await S.settle(); await S.settle();
  const t = render(o, sts);
  const label = (a) => { let v = null; walk(t, (e) => { if (e.idv === `pt-${a}`) v = e.text; }); return v; };
  if (label("a1") !== "12m" || label("a3") !== "<1m") fails.push(`done label: done 12m and 30s ago should read 12m and <1m, got ${label("a1")} ${label("a3")}`);
  if (label("a0") != null || label("a2") != null) fails.push("done label: only done desks get one");
  noErr(t, "done label");

  // Looked at but not answered: Herdr turns done into idle, the label stays (still counting from when it finished),
  // across a restart too; it goes once the agent works again, and a plain idle never gets one.
  const R2 = R.trackWaiting({ a: 5, b: 6 }, [{ address: "a", status: "idle" }, { address: "b", status: "working" }, { address: "c", status: "done" }, { address: "d", status: "idle" }], () => 9);
  if (JSON.stringify(R2) !== '{"a":5,"c":9}') fails.push(`waiting: kept through idle, cleared by work, set on done, got ${JSON.stringify(R2)}`);
  const at = (o, sts2, a) => { const t2 = render(o, sts2); let v = null; walk(t2, (e) => { if (e.idv === `pt-${a}`) v = e.text; }); return v; };
  S.advance(3 * MIN);
  world.hcGet.a1 = { status: { state: "idle" }, status_ms: clock.now };    // you looked: done -> idle, just now
  const seen = ["working", "idle", "idle", "done"];
  world.hcLs = { terminals: seen.map((status, i) => ({ address: `a${i}`, state: "live", status, name: `t${i}` })) };
  S.advance(10000); await S.settle(); await S.settle();
  if (at(o, seen, "a1") !== "15m") fails.push(`waiting: looked at but not answered should keep counting from the finish (15m), got ${at(o, seen, "a1")}`);
  const o2 = new Office(); o2.init(world.props, makeCx());                // a restart keeps it
  if (at(o2, seen, "a1") !== "15m") fails.push(`waiting: should survive a restart, got ${at(o2, seen, "a1")}`);
  at(o, ["working", "working", "idle", "done"], "a1");
  if (at(o, seen, "a1") != null) fails.push("waiting: once it works again (you answered) the label should go");
}

// ---- the can, the popcorn, clicking a pet ------------------------------------------
{
  // Value: protects=the real can-knock (10+ min of work at level 2+), its two stages only once a knocking cat is drawn (not
  // under POWER!), the chair back when the pillow has the armrest, the popcorn pile shrinking over a minute, and a clicked
  // pet's named bubble (asleep lines when curled), above his click target; fails_when=any of those rules breaks;
  // why_new=nothing else drives these; seam=none; no_claim=Herdr's real click routing (recorded handlers, fake clock)
  const R = await import(pathToFileURL(join(MOD, "rules.js")).href);
  if (R.canKnock(10 * MIN, 2) || !R.canKnock(10 * MIN + 1, 2) || R.canKnock(11 * MIN, 1)) fails.push("can: knock after 10 min of work, from level 2");
  if ([0, 29, 30, 59, 60].map(R.pileSize).join("") !== "22110") fails.push(`popcorn: pile 2 under 30 ticks, 1 under 60, then 0, got ${[0, 29, 30, 59, 60].map(R.pileSize)}`);
  const leftOf = (t, id) => { let x = null; walk(t, (e) => { if (e.idv === id) x = e.calls.find(([k]) => k === "left")?.[1][0]; }); return x; };

  // Two at it for 11 minutes: Simba knocks (stage 0: can still up), 800ms later it's down.
  const { o } = mount();
  render(o, ["working", "working", "idle"]); jump(11 * MIN);
  let t = render(o, ["working", "working", "idle"]);
  if (!ids(t).includes("pet-Simba-sit") || ids(t).includes("pet-can-down") || leftOf(t, "pet-Simba-sit") !== 56) fails.push(`can: after 11 min Simba should be up on the armrest, can not yet down; at ${leftOf(t, "pet-Simba-sit")}`);
  S.advance(1000); if (o.m.canStage !== 0) fails.push(`can: the push should start once the knock is drawn, stage=${o.m.canStage}`);
  S.advance(800); t = render(o, ["working", "working", "idle"]);
  if (o.m.canStage !== 1 || !ids(t).includes("pet-can-down")) fails.push(`can: 800ms later the can should be on the floor, stage=${o.m.canStage}`);
  // POWER! hides the knock: the push resets and replays after.
  o.m.powerUp = 4; t = render(o, ["working", "working", "idle"]); S.advance(1000);
  if (o.m.canStage != null || ids(t).includes("pet-can-down")) fails.push(`can: under POWER! the knock isn't drawn and resets, stage=${o.m.canStage}`);
  // 30+ min: the pillow has the armrest, so the knocker is on the chair back.
  o.m.powerUp = 0; jump(20 * MIN); t = render(o, ["working", "working", "idle"]);
  if (leftOf(t, "pet-Simba-sit") !== 26) fails.push(`can: with the pillow the knocker should be on the chair back (26), got ${leftOf(t, "pet-Simba-sit")}`);
  // Level 1: no can, no knock.
  t = render(o, ["working", "idle", "idle"]); S.advance(1000);
  if (o.m.canStage != null || ids(t).includes("pet-can-down")) fails.push("can: below level 2 there's no knock");
  noErr(t, "can");

  // Value: protects=the developer-mode `canKnock` and `power` buttons doing what the real events do: canKnock knocks the can
  //   now (no 10 minutes needed) for 20s, power fires POWER! at level 3; fails_when=fire("canKnock") stops setting the
  //   20s window or the knock ignores it, or the power chip stops starting the powerUp one-shot; why_new=the golden only
  //   records the one-shot lists the chips start, never the knock window or the pose; seam=none (o.fire is what the
  //   chip's click calls); no_claim=the chip buttons' own click wiring (the dev strip block covers that)
  const { o: k, cx: kcx } = mount();
  render(k, ["working", "working", "idle"]);
  k.fire("canKnock", kcx); t = render(k, ["working", "working", "idle"]);
  if (leftOf(t, "pet-Simba-sit") !== 56) fails.push(`dev chips: canKnock should put Simba on the armrest at once, at ${leftOf(t, "pet-Simba-sit")}`);
  S.advance(1000); S.advance(800); t = render(k, ["working", "working", "idle"]);
  if (!ids(t).includes("pet-can-down")) fails.push("dev chips: canKnock should knock the can down");
  S.advance(20000); t = render(k, ["working", "working", "idle"]);
  if (leftOf(t, "pet-Simba-sit") === 56) fails.push("dev chips: canKnock's knock should end after 20s");
  k.fire("power", kcx); t = render(k, ["working", "idle", "idle"]);
  if (!(k.m.powerUp > 0) || !ids(t).some((x) => x.startsWith("pdev-head-3-power"))) fails.push(`dev chips: power should fire POWER! at level 3, got powerUp=${k.m.powerUp} ${ids(t).find((x) => x.startsWith("pdev-head-"))}`);
  noErr(t, "dev chips");

  // Popcorn: an agent blocked spills it; Buddy eats it down over a minute.
  const { o: p } = mount();
  // Buddy's kernels sit left of the chair (x < 10), his spill under it; count them apart.
  const kernels = (tr) => { let buddy = 0, his = 0; walk(tr, (e) => { if (e.calls.some(([k, a]) => k === "bg" && a[0] === "#fff6c8")) { const x = e.calls.find(([k]) => k === "left")?.[1][0] ?? 99; if (x < 10) buddy++; else his++; } }); return [buddy, his]; };
  render(p, ["working", "blocked"]); S.advance(1000);
  const full = kernels(render(p, ["working", "blocked"]));
  for (let i = 0; i < 35; i++) { S.advance(1000); render(p, ["working", "blocked"]); }
  const half = kernels(render(p, ["working", "blocked"]));
  for (let i = 0; i < 30; i++) { S.advance(1000); render(p, ["working", "blocked"]); }
  const crumbs = kernels(render(p, ["working", "blocked"]));
  for (const i of [0, 1]) if (!(full[i] > half[i] && half[i] > crumbs[i] && crumbs[i] > 0)) fails.push(`popcorn: ${i ? "his spill" : "Buddy's pile"} should shrink, ${full[i]} > ${half[i]} > ${crumbs[i]} > 0`);
  render(p, ["working", "idle"]); S.advance(1000);
  if (p.m.spillTicks !== 0) fails.push("popcorn: cleared up when nothing's spilled");

  // Clicking a pet: its bubble, named, for two ticks; stops before his poke; asleep lines when curled.
  const { o: c } = mount();
  const handler = (tr, id) => { let h = null; walk(tr, (e) => { if (e.idv === id) h = e.handlers.on_click; }); return h; };
  let tc = render(c, ["working"]);
  const ccx = makeCx(); handler(tc, "pet-Buddy-sit")?.({}, ccx);
  tc = render(c, ["working"]);
  const bubble = texts(tc).find((x) => x.startsWith("Buddy: ")) ?? "";
  if (!ccx.stopped || !ids(tc).includes("pet-say-Buddy") || !LINES_OF("beagle").includes(bubble.slice(7))) fails.push(`pets: clicking Buddy should show "Buddy: <a beagle line>" and stop the click, got "${bubble}"`);
  if (c.m.poke) fails.push("pets: clicking a pet shouldn't poke him");
  S.advance(2000); if (ids(render(c, ["working"])).includes("pet-say-Buddy")) fails.push("pets: the bubble should go after two ticks");
  tc = render(c, ["idle"]); handler(tc, "pet-Snowy-curl")?.({}, makeCx());
  const sleepy = texts(render(c, ["idle"])).find((x) => x.startsWith("Snowy: ")) ?? "";
  if (!LINES_OF("asleep").includes(sleepy.slice(7))) fails.push(`pets: a sleeping pet should answer with an asleep line, got "${sleepy}"`);
  c.fire("petPoke", makeCx());
  if (!(c.m.petSay?.name && c.m.petSay?.line) || !(c.m.petPoke > 0)) fails.push("pets: the dev petPoke chip should poke a pet");
  noErr(tc, "pet click");
}

// ---- desk names ----------------------------------------------------------------------
{
  // Value: protects=every desk is labelled under its chair (through screenshot mode's renames when it's on) with its tab's name if given (Herdr's numbers don't count), else
  // its space's, else the program's, else the terminal,
  // cut to 15 characters; fails_when=labels vanish (the old row-height gate hid them) or the fallback breaks; why_new=desks
  // had no visible name; seam=none; no_claim=how the text looks in Herdr
  const P = await import(pathToFileURL(join(MOD, "names.js")).href);
  const names = [{ tab_name: "build", space_name: "proj" }, { tab_name: "2", space_name: "football-shares-frontend" },
    { tab_name: "", program: { name: "Claude Code" } }, { address: "t9" }].map(P.deskName);
  if (JSON.stringify(names) !== '["build","football-shares","Claude Code","t9"]') fails.push(`names: a given tab name, else the space, else program, else terminal, 15 characters, got ${JSON.stringify(names)}`);
  const { o } = mount();
  const t = render(o, ["working", "idle", "done"]);
  const shown = ["a0", "a1", "a2"].map((a) => { let v = null; walk(t, (e) => { if (e.idv === `pn-${a}`) v = e.text; }); return v; });
  if (shown.join(",") !== "t0,t1,t2") fails.push(`names: every desk should show its name, got ${shown}`);

  // Screenshot mode's renames (shared "privacy"): an aliased phrase is swapped, a hidden name without an alias gets the
  // stand-in ("Space N", the program's name for a tab), and with the mode off or absent every name shows as it is.
  world.spaces = [{ id: "s1", name: "topstrike", folder: "", machine: null, tabs: [{ id: "b1", name: "1" }] },
    { id: "s2", name: "acme-secret", folder: "", machine: null, tabs: [{ id: "b2", name: "acme deploy" }] },
    { id: "s3", name: "open", folder: "", machine: null, tabs: [{ id: "b3", name: "topstrike api" }] }];
  const live = [{ address: "x1", space: "s1", space_name: "topstrike", tab: "b1", tab_name: "1", status: "working", program: { name: "Claude Code" }, focused: false },
    { address: "x2", space: "s2", space_name: "acme-secret", tab: "b2", tab_name: "acme deploy", status: "idle", program: { name: "Claude Code" }, focused: false },
    { address: "x3", space: "s3", space_name: "open", tab: "b3", tab_name: "topstrike api", status: "idle", program: { name: "Codex" }, focused: false }];
  const privacy = { on: true, hidden: [], phrases: [{ text: "topstrike", alias: "alt" }, { text: "acme", alias: "" }] };
  const labels = () => { world.agents = live; const t = o.render(); return live.map((a) => { let v = null; walk(t, (e) => { if (e.idv === `pn-${a.address}`) v = e.text; }); return v; }).join(","); };
  world.shared.privacy = privacy;
  if (labels() !== "alt,Space 2,alt api") fails.push(`names: screenshot mode on should show its renames, got ${labels()}`);
  if (P.tabName(live[1]) !== "Claude Code" || P.spaceLabel(live[0]) !== "alt") fails.push(`names: a hidden tab with no alias shows the program, got ${P.tabName(live[1])} / ${P.spaceLabel(live[0])}`);
  const loose = [P.tabName({ address: "t7", tab_name: "topstrike box" }), P.tabName({ address: "t8", tab_name: "acme box", program: { name: "zsh" } }), P.spaceLabel({ space_name: "acme-x" })].join(",");
  if (loose !== "alt box,zsh,Space") fails.push(`names: a terminal with no tab or space (a helper) still gets the renames, got ${loose}`);
  world.shared.privacy = { ...privacy, hidden: ["space:s3"] };
  if (labels().split(",")[2] !== "Space 3") fails.push(`names: a space hidden by hand hides its tabs' names too, got ${labels()}`);
  world.shared.privacy = { ...privacy, on: false };
  if (labels() !== "topstrike,acme deploy,topstrike api") fails.push(`names: screenshot mode off should show the real names, got ${labels()}`);
  delete world.shared.privacy;
  if (labels() !== "topstrike,acme deploy,topstrike api") fails.push(`names: without screenshot mode the real names show, got ${labels()}`);
  world.spaces = [];
}

// ---- demo-<n> ----------------------------------------------------------------------
{
  // Value: protects=`demo-<n>` opens the demo at state n (for recording one state; out of range is ignored) and the
  // sub-agents demo state draws its 2/5; fails_when=the command or the state breaks; why_new=nothing else jumps the demo;
  // seam=none; no_claim=Herdr's real timing
  await S.settle(); S.dropCommandWaiters();             // earlier mounts' loops start waiting on the first await: let them, then drop them
  const { o } = mount();
  const send = async (c) => { S.sendCommand(c); await S.settle(); };
  await send("demo-99");
  if (o.demoAt != null) fails.push("demo-n: out of range should be ignored");
  await send("demo-27"); jump(1000);
  const t = render(o, []);
  const head = texts(t).find((x) => /^DEMO \d/.test(x)) ?? "";
  let badge = null; walk(t, (e) => { if (e.idv === "psub-demo-0") walk(e, (k) => { if (k.text != null) badge = k.text; }); });
  if (!head.startsWith("DEMO 27/") || !head.includes("Sub-agents") || badge !== "2/5") fails.push(`demo-n: demo-27 should show the sub-agents state with 2/5, got "${head}" ${badge}`);
  await send("demo-2"); jump(1000);
  const head2 = texts(render(o, [])).find((x) => /^DEMO \d/.test(x)) ?? "";
  if (!head2.startsWith("DEMO 2/")) fails.push(`demo-n: demo-2 should jump back to state 2, got "${head2}"`);
}

// ---- Claude Code sub-agents ----------------------------------------------------------
{
  // Value: protects=sub-agents from the hook: no desk of their own but a done/total badge on the parent's desk (2/5), counted
  // in the header and as working (level, power bar), welcomed, done when stopped (the finish), the batch kept until the last
  // one stops then gone 8s later, dropped after an hour without a stop, and the hook script sending sub-start/sub-stop with
  // the terminal and agent id; fails_when=any of those breaks; why_new=nothing else knows about sub-agents; seam=none;
  // no_claim=Claude Code really firing the hooks (sample stdin)
  const R = await import(pathToFileURL(join(MOD, "rules.js")).href);
  if (JSON.stringify(R.parseSubCommand("sub-start-t8-abc123")) !== '{"verb":"start","parent":"t8","id":"abc123"}' || R.parseSubCommand("sub-start-t8") || R.parseSubCommand("sub-go-t8-x") || R.parseSubCommand("sub-stop-t8-a b"))
    fails.push("subs: sub-start/stop-<terminal>-<id> parse, anything else doesn't");
  // p: one still running keeps its finished sibling; q: all done, last at 1000 -> gone by 9000; r: last done at 8000 -> kept
  const kept = Object.keys(R.pruneSubs({ a: { parent: "p", at: 0 }, b: { parent: "p", at: 0, doneAt: 10 }, c: { parent: "q", at: 0, doneAt: 1000 },
    d: { parent: "r", at: 0, doneAt: 100 }, e: { parent: "r", at: 0, doneAt: 8000 } }, 9000)).join("");
  if (kept !== "abde") fails.push(`subs: prune keeps a batch while any runs and until 8s after its last stop, got ${kept}`);
  if (Object.keys(R.pruneSubs({ a: { parent: "p", at: 0 }, b: { parent: "p", at: 0, doneAt: 10 } }, 60 * MIN)).length) fails.push("subs: one never stopped should go after an hour, and not hold its batch");
  const folded = R.foldSubs([{ address: "x" }, { address: "y~1", sub: true, parent: "y", status: "done" }, { address: "y" }, { address: "y~2", sub: true, parent: "y", status: "working" }, { address: "z~1", sub: true, parent: "z", status: "working" }]);
  if (JSON.stringify(folded) !== '[{"address":"x"},{"address":"y","subs":{"done":1,"total":2,"running":1}}]') fails.push(`subs: fold puts them on the parent's desk, got ${JSON.stringify(folded)}`);
  if (JSON.stringify(R.headcount(folded)) !== '{"working":1,"total":3}') fails.push(`subs: running sub-agents count in the headcount, got ${JSON.stringify(R.headcount(folded))}`);

  S.dropCommandWaiters();
  const { o } = mount();
  render(o, ["idle", "idle"]); jump(20000); render(o, ["idle", "idle"]);
  const send = async (c) => { S.sendCommand(c); await S.settle(); };
  const badge = (t) => { let s = null; walk(t, (e) => { if (e.idv === "psub-a0") walk(e, (k) => { if (k.text != null) s = k.text; }); }); return s; };
  await send("sub-start-a0-aaa111"); await send("sub-start-a0-bbb222");
  let t = render(o, ["idle", "idle"]);
  const desks = ids(t).filter((x) => /^pd-/.test(x)).join(",");
  if (desks !== "pd-a0,pd-a1") fails.push(`subs: sub-agents get no desk of their own, got ${desks}`);
  if (badge(t) !== "0/2") fails.push(`subs: a0's desk should say 0/2, got ${badge(t)}`);
  if (!texts(t).some((x) => x === "2/4 AT IT")) fails.push(`subs: the header should count them, got ${texts(t).find((x) => / AT IT$/.test(x))}`);
  if (!ids(t).some((x) => x.startsWith("pdev-head-2-"))) fails.push(`subs: two working sub-agents should put him at level 2, got ${ids(t).find((x) => x.startsWith("pdev-head-"))}`);
  if (!(o.m.newAgentWelcome > 0)) fails.push("subs: a new sub-agent should get the welcome");
  if (!ids(t).includes("pa-a0-welcome")) fails.push(`subs: the welcome should point at the parent's desk, got ${ids(t).filter((x) => x.startsWith("pa-"))}`);
  const p0 = o.m.power; S.advance(1000);
  if (o.m.power - p0 !== 2) fails.push(`subs: two sub-agents working should charge the bar 2 a second, got ${o.m.power - p0}`);
  await send("sub-stop-a0-aaa111");
  for (const k of ["finishPump", "poke"]) o.m[k] = 0;
  render(o, ["idle", "idle"]); t = render(o, ["idle", "idle"]);
  if (badge(t) !== "1/2" || !(o.m.finishPump > 0)) fails.push(`subs: one stopped should read 1/2 and set off the finish, got ${badge(t)} pump=${o.m.finishPump}`);
  S.advance(9000); t = render(o, ["idle", "idle"]);
  if (badge(t) !== "1/2") fails.push(`subs: a finished one stays counted while its sibling runs, got ${badge(t)}`);
  await send("sub-stop-a0-bbb222"); t = render(o, ["idle", "idle"]);
  if (badge(t) !== "2/2") fails.push(`subs: all stopped should read 2/2, got ${badge(t)}`);
  S.advance(9000); t = render(o, ["idle", "idle"]);
  if (badge(t) != null) fails.push("subs: the badge should go 8s after the last one stops");
  // A stop for one never seen: a hidden tombstone (no badge, nothing counted), so a late start is no ghost.
  await send("sub-stop-a0-zzz999"); t = render(o, ["idle", "idle"]);
  if (!o.subs.zzz999?.tomb || badge(t) != null) fails.push(`subs: a stop for an unknown sub-agent should leave only a hidden tombstone, got ${JSON.stringify(o.subs.zzz999)} badge ${badge(t)}`);
  await send("sub-start-a0-zzz999"); t = render(o, ["idle", "idle"]);
  if (badge(t) != null || o.subs.zzz999?.doneAt == null) fails.push("subs: a start arriving after its stop shouldn't make a working ghost");
  S.advance(31000);
  if (o.subs.zzz999) fails.push("subs: a tombstone should go 30s later");
  // Running sub-agents survive a reload, so their stop still lands.
  await send("sub-start-a0-ccc333");
  // A stop that never comes: forgotten after an hour (real ones run well past 15 minutes, so not sooner).
  jump(30 * MIN); S.advance(1000); t = render(o, ["idle", "idle"]);
  if (badge(t) == null) fails.push("subs: a running sub-agent should still show at 30 minutes");
  jump(31 * MIN); S.advance(1000); t = render(o, ["idle", "idle"]);
  if (badge(t) != null) fails.push("subs: a sub-agent never stopped should go after an hour");
  await send("sub-start-a1-ddd444"); t = render(o, ["idle", "idle"]);
  if (ids(t).filter((x) => /^pd-/.test(x)).join(",") !== "pd-a1,pd-a0") fails.push("subs: a desk with sub-agents running counts as active (moves to the front)");
  // (last: the new copy takes the commands) Running sub-agents survive a reload, so their stop still lands.
  const r2 = new Office(); r2.init(world.props, makeCx());
  if (!r2.subs.ddd444 || r2.subs.ddd444.doneAt) fails.push(`subs: a running sub-agent should survive a reload, got ${JSON.stringify(r2.subs)}`);
  noErr(t, "subs");

  // The hook script: sample stdin in, the command to a stand-in herdr-app out.
  const { mkdtempSync, writeFileSync: wf, readFileSync: rf, chmodSync, existsSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { spawnSync } = await import("node:child_process");
  const dir = mkdtempSync(join(tmpdir(), "saw-hook-")), out = join(dir, "sent");
  wf(join(dir, "herdr-app"), `#!/bin/sh\necho "$@" >> "${out}"\n`); chmodSync(join(dir, "herdr-app"), 0o755);
  const hook = join(here, "..", "sitandwatch", "hooks", "sitandwatch-subagents.py");
  const runHook = (data, term) => spawnSync("python3", [hook], { input: JSON.stringify(data), env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, HC_TERMINAL_ID: term ?? "" } });
  runHook({ hook_event_name: "SubagentStart", agent_id: "a1b2-c3", agent_type: "general-purpose" }, "t8");
  runHook({ hook_event_name: "SubagentStop", agent_id: "a1b2-c3" }, "t8");
  runHook({ hook_event_name: "SubagentStart", agent_id: "x" }, "");          // not in Herdr: nothing
  runHook({ hook_event_name: "Stop", agent_id: "x" }, "t8");                 // another event: nothing
  const r = runHook("not json", "t8");
  const sent = existsSync(out) ? rf(out, "utf8").trim().split("\n") : [];
  if (JSON.stringify(sent) !== JSON.stringify(["do sitandwatch.sub-start-t8-a1b2c3", "do sitandwatch.sub-stop-t8-a1b2c3"]) || r.status !== 0)
    fails.push(`subs: the hook should send exactly the start and stop, quietly ignoring the rest, sent ${JSON.stringify(sent)} exit ${r.status}`);
  rmSync(dir, { recursive: true, force: true });
}

// ---- the ship hook: what counts as shipping ---------------------------------------------------
{
  // Value: protects=the PostToolUse ship hook sending ship-merged/-deployed/-pushed for gh pr merge, vercel --prod and
  //   a git push that updates the main branch, anywhere in a compound command, the biggest kind winning; a feature-branch
  //   push sending the smaller "push" and gh pr create "pr-<number>" (from the URL in its output); a delete, tags alone
  //   or a dry run (git push -n/--dry-run/-fn) sending nothing, while a `grep -n`
  //   elsewhere in the command doesn't cancel a real push; git's own options (-c, -C) and a `cd` step read like the shell;
  //   fails_when=a ship is missed, a feature-branch push or a dry run explodes, or an unrelated -n hides a push; why_new=no check covered the hook, and the
  //   old whole-command -n test missed real pushes; seam=none (a stand-in herdr-app on PATH); no_claim=Claude Code firing
  //   PostToolUse in a real session
  const { mkdtempSync, writeFileSync: wf, readFileSync: rf, chmodSync, existsSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { spawnSync } = await import("node:child_process");
  const dir = mkdtempSync(join(tmpdir(), "saw-ship-")), out = join(dir, "sent");
  wf(join(dir, "herdr-app"), `#!/bin/sh\necho "$@" >> "${out}"\n`); chmodSync(join(dir, "herdr-app"), 0o755);
  const hook = join(here, "..", "sitandwatch", "hooks", "sitandwatch-ship.py");
  // Two throwaway repos: one on main, one on a feature branch. A push only ships when it updates main
  // (or master, or origin/HEAD's branch); pushing a feature branch, say to open a PR, doesn't.
  const onMain = join(dir, "onmain"), onFeature = join(dir, "onfeature");
  spawnSync("git", ["init", "-q", "-b", "main", onMain]); spawnSync("git", ["init", "-q", "-b", "feature", onFeature]);
  const cases = [
    ["git push -u origin feature", onMain, "push"],                       // a feature branch: the small push, not live
    ["git push -u origin HEAD", onFeature, "push"], ["git push", onFeature, "push"],
    ["git push", onMain, "ship-pushed"], ["git push -u origin HEAD", onMain, "ship-pushed"],
    ["git push origin main", onFeature, "ship-pushed"], ["git push origin HEAD:main", onFeature, "ship-pushed"],
    [`cd ${onMain} && git push`, onFeature, "ship-pushed"], [`git -C ${onMain} push`, onFeature, "ship-pushed"],
    ["git -c credential.helper= -c credential.helper='!gh auth git-credential' push -q origin main 2>&1 | tail -1", onFeature, "ship-pushed"],
    ["git push origin --delete main", onMain, null], ["git push origin :main", onMain, null], ["git push --tags", onMain, null],
    ["gh pr view 7 && gh pr merge 7 --rebase --delete-branch | tail -1", onFeature, "ship-merged"],
    ["gh pr create --base main", onMain, "pr"],                            // no URL in the output: no number
    // a PR whose body talks about merging and pushing: the body is quoted text, not commands
    ["gh pr create --base main --title t --body \"$(cat <<'EOF'\nOnly a push to main ships.\ngh pr merge 5 merges; git push origin main pushes.\n| a | vercel --prod |\nEOF\n)\"", onMain, "pr-12", { stdout: "https://github.com/o/r/pull/12\n" }],
    ['echo "gh pr merge 5"', onMain, null], ['echo "a; git push origin main"', onMain, null],
    // here-documents are data: a commit message's apostrophes ("isn't") aren't quotes, and its lines aren't commands
    ["git commit -F - <<'EOF'\nthis isn't a merge: gh pr merge 5\nEOF\ngit push -q origin feature 2>&1 | tail -1; true", onMain, "push"],
    ["gh pr create --body \"$(cat <<'EOF'\nany push said \"IT'S LIVE\"\ngh pr merge at a line start\nEOF\n)\"", onMain, "pr"],
    ["cat <<< 'x'\ngit push origin main", onFeature, "ship-pushed"],                 // <<< is a here-string, not a heredoc
    ["npx vercel --prod", onMain, "ship-deployed"],
    ["git push -u origin feature 2>&1 | tail -1; gh pr create --fill", onMain, "pr-11", { stdout: "https://github.com/o/r/pull/11\n" }],   // the PR beats its push
    ["git status | grep -n x && git push", onMain, "ship-pushed"],
    ["git push && vercel --prod", onFeature, "ship-deployed"],
    ["git push -n", onMain, null], ["git push --dry-run origin", onMain, null], ["git push -fn origin main", onMain, null],
    ["git log -n 3", onMain, null], ["git log --grep push", onMain, null], ["echo git push", onMain, null], ["echo git pushx", onMain, null], ["vercel", onMain, null],
  ];
  const got = cases.map(([command, cwd, , tool_response]) => {
    rmSync(out, { force: true });
    spawnSync("python3", [hook], { input: JSON.stringify({ hook_event_name: "PostToolUse", tool_name: "Bash", tool_input: { command }, cwd, ...(tool_response ? { tool_response } : {}) }), env: { ...process.env, PATH: `${dir}:${process.env.PATH}` } });
    return existsSync(out) ? rf(out, "utf8").trim().replace(/^do sitandwatch\./, "") : null;
  });
  cases.forEach(([command, cwd, want], k) => { if (got[k] !== want) fails.push(`ship hook: "${command}" in ${cwd === onMain ? "main" : "feature"} should send ${want}, got ${got[k]}`); });
  rmSync(dir, { recursive: true, force: true });
}

// ---- the smaller events: a branch pushed, a PR opened ----------------------------------------------
{
  // Value: protects=`sitandwatch.push` and `sitandwatch.pr-<n>` (from the ship hook) starting their one-shots: a paper
  //   plane and "pushed!"-style lines for a push, a scorecard reading PR #<n> and "PR #<n>!" for a new PR; a bad number
  //   ignored; fails_when=the commands stop starting them, the number stops reaching the card, or junk gets through;
  //   why_new=new feature; seam=none; no_claim=Claude Code firing the hook (checked live)
  await S.settle(); S.dropCommandWaiters();
  const { o } = mount();
  const send = async (c) => { S.sendCommand(c); await S.settle(); await S.settle(); };
  world.agents = [{ address: "t8", status: "working", tab_name: "build", title: "x", program: null, focused: false }];
  const texts = (t) => { const v = []; walk(t, (k) => { if (k.text != null) v.push(k.text); }); return v; };
  const has = (t, idv) => { let f = false; walk(t, (k) => { if (k.idv === idv) f = true; }); return f; };
  await send("push");
  let t = o.render();
  if (o.m.pushOff !== 3 || !has(t, "pdev-plane")) fails.push(`events: "push" should start the push (3 ticks, a paper plane), got ${o.m.pushOff} plane=${has(t, "pdev-plane")}`);
  await send("pr-11");
  t = o.render();
  if (o.m.prOpened !== 4 || o.m.prNum !== "11" || !has(t, "pdev-card")) fails.push(`events: "pr-11" should start the PR (4 ticks, #11, a scorecard), got ${o.m.prOpened} #${o.m.prNum} card=${has(t, "pdev-card")}`);
  if (!texts(t).includes("#11") || !texts(t).includes("PR #11!")) fails.push(`events: the card and his line should say #11 / PR #11!, got ${JSON.stringify(texts(t).filter((x) => /PR|#/.test(x)))}`);
  o.m.prOpened = 0; o.m.prNum = null;
  await send("pr-abc"); await send("pr-1234567");
  if (o.m.prOpened || o.m.prNum) fails.push(`events: "pr-abc" and a 7-digit number should be ignored, got ${o.m.prOpened} #${o.m.prNum}`);
  await send("pr");
  t = o.render();
  if (o.m.prOpened !== 4 || o.m.prNum !== null || !texts(t).includes("PR")) fails.push(`events: "pr" alone should start the PR with no number, got ${o.m.prOpened} #${o.m.prNum}`);
  world.agents = [];
}

// ---- real activity: the PreToolUse hook → the desk's bubble ------------------------------------------
{
  // Value: protects=the activity hook turning tool calls into short phrases (Edit/Read <file>, a command's program,
  //   Grep/Glob <pattern>, "> " for a sub-agent, Use <MCP service>; a command shows only its program and subcommand, never assignments, paths or
  //   arguments that could hold secrets), sent base64url with the terminal and decoded by the panel; a desk's bubble saying
  //   its fresh activity (under a minute) through screenshot mode, else its title; malformed or non-ASCII commands
  //   refused; fails_when=the hook's phrase, encoding or event filter changes, the panel stops decoding, a stale act still
  //   shows, or a renamed project leaks; why_new=new feature; seam=none (a stand-in herdr-app on PATH, as for the
  //   sub-agent hook); no_claim=Claude Code firing PreToolUse in a real session (checked live)
  const R = await import(pathToFileURL(join(MOD, "rules.js")).href);
  const { mkdtempSync, writeFileSync: wf, readFileSync: rf, chmodSync, existsSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { spawnSync } = await import("node:child_process");
  const dir = mkdtempSync(join(tmpdir(), "saw-act-")), out = join(dir, "sent");
  wf(join(dir, "herdr-app"), `#!/bin/sh\necho "$@" >> "${out}"\n`); chmodSync(join(dir, "herdr-app"), 0o755);
  const hook = join(here, "..", "sitandwatch", "hooks", "sitandwatch-activity.py");
  const run = (data, term = "t8") => spawnSync("python3", [hook], { input: typeof data === "string" ? data : JSON.stringify(data), env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, HC_TERMINAL_ID: term, SITANDWATCH_ACT_DIR: dir, HERDR_APP_HOME: dir } });
  const pre = (tool_name, tool_input) => ({ hook_event_name: "PreToolUse", tool_name, tool_input });
  run(pre("Edit", { file_path: "/home/x/proj/src/main.js" }));
  run(pre("Bash", { command: "npm   test --  --watch=false extra" }));   // program and subcommand only
  run(pre("Read", { file_path: "/a/README.md" }));
  run(pre("Grep", { pattern: "useAuth" }));
  run(pre("Task", { description: "Review the diff" }));
  run(pre("Bash", { command: "API_KEY=sk-secret SP=/tmp/x /usr/bin/curl -H 'Authorization: Bearer abc' https://x" }));
  run(pre("Edit", { file_path: "/a/b.js" }), "");                 // not in Herdr: nothing
  run({ hook_event_name: "PostToolUse", tool_name: "Edit" });     // another event: nothing
  const bad = run("not json");
  const sent = existsSync(out) ? rf(out, "utf8").trim().split("\n") : [];
  const decoded = sent.map((l) => R.parseActCommand(l.replace(/^do sitandwatch\./, "")));
  const texts6 = decoded.map((d) => d && `${d.term}:${d.text}`);
  const want = ["t8:Edit main.js", "t8:npm test", "t8:Read README.md", "t8:Grep useAuth", "t8:> Review the diff", "t8:curl"];
  if (JSON.stringify(texts6) !== JSON.stringify(want) || bad.status !== 0) fails.push(`act: the hook should send these phrases and nothing else, got ${JSON.stringify(texts6)} exit ${bad.status}`);
  if (sent.some((l) => !/^do sitandwatch\.act-t8-[A-Za-z0-9_-]+$/.test(l))) fails.push(`act: commands should be letters, digits, - and _ only, got ${JSON.stringify(sent)}`);
  // Repeats: the same phrase again within 30s isn't sent (it costs a process and Herdr's dispatch);
  // another phrase is, and so is the same one once the last send is 30s old.
  const count = () => (existsSync(out) ? rf(out, "utf8").trim().split("\n").length : 0);
  const c0 = count();
  run(pre("Read", { file_path: "/a/README.md" }));                 // the last phrase sent above was "curl"
  run(pre("Read", { file_path: "/a/README.md" }));                 // a repeat: skipped
  const c1 = count();
  const cache = join(dir, "sitandwatch-act-t8"), [, last] = rf(cache, "utf8").split("\t");
  wf(cache, `${Date.now() / 1000 - 31}\t${last}`);                 // that send is now 31s old
  run(pre("Read", { file_path: "/a/README.md" }));
  const c2 = count();
  if (!(c1 === c0 + 1 && c2 === c1 + 1))
    fails.push(`act: the hook should skip a repeat under 30s and send it after, sent +${c1 - c0} then +${c2 - c1}`);
  // The cache is owner-only and never written through a link: a link planted at its path (as another
  // account could in a shared folder) leaves its target alone, and the phrase is still sent.
  const { statSync, symlinkSync, unlinkSync } = await import("node:fs");
  if ((statSync(cache).mode & 0o077) !== 0) fails.push(`act: the hook's cache should be owner-only, got ${(statSync(cache).mode & 0o777).toString(8)}`);
  const victim = join(dir, "victim");
  wf(victim, "precious"); unlinkSync(cache); symlinkSync(victim, cache);
  const c3 = count();
  run(pre("Read", { file_path: "/a/other.md" }));
  if (rf(victim, "utf8") !== "precious") fails.push(`act: the hook wrote through a link planted at its cache, the target now holds ${JSON.stringify(rf(victim, "utf8"))}`);
  if (count() !== c3 + 1) fails.push(`act: with a link at its cache the hook should still send, sent +${count() - c3}`);
  // Secrets stay off the screen: the hook sends at most the 20 characters a bubble can show (cut at a
  // word), secret-shaped words in typed text (keys, tokens, passwords mixing letters and digits) become
  // ***, and a command's second word shows only for programs with subcommands (`git push`, not
  // `printf <token>` or `cd <client-folder>`).
  const phraseOf = (data) => {
    const r = spawnSync("python3", ["-c", "import sys,json,importlib.util as u; s=u.spec_from_file_location('h', sys.argv[1]); m=u.module_from_spec(s); s.loader.exec_module(m); d=json.loads(sys.argv[2]); print(m.phrase(m.describe(d[0], d[1])))", hook, JSON.stringify(data)]);
    return r.stdout.toString().trim();
  };
  const secretCases = [
    [["Grep", { pattern: "sk-proj-Ab3dEf9GhIjKlMnOpQrSt" }], "Grep ***"],
    [["Grep", { pattern: "AKIAIOSFODNN7EXAMPLE" }], "Grep ***"],
    [["Grep", { pattern: "hunter2" }], "Grep ***"],
    [["Grep", { pattern: "p4ssw0rd!" }], "Grep ***"],
    [["WebSearch", { query: "is eyJhbGciOiJIUzI1NiJ9 valid" }], "Search is *** valid"],
    [["Bash", { command: "printf ghp-abcdefghijklmnop | gh auth login" }], "printf"],
    [["Bash", { command: "cd client-acme-secret && npm test" }], "npm test"],          // setup steps (cd, export, VAR=) skipped
    [["Bash", { command: "cd ~/proj && git diff --stat a b | tail -3; echo done" }], "git diff"],
    [["Bash", { command: "S=/x; export Y=1; pushd $S && python3 run.py" }], "python3"],
    [["Bash", { command: "cd /tmp" }], "cd"],                                          // all setup: the first of it
    [["Bash", { command: "git push -u origin main" }], "git push"],
    [["Grep", { pattern: "useAuth" }], "Grep useAuth"],
    [["Read", { file_path: "/a/a-very-long-file-name.md" }], "Read a-very-long-..."],   // mid-word: a word cut would leave only "Read"
    [["Task", { description: "Review the diff and fix it" }], "> Review the diff..."],     // a word ending right at the limit stays whole
    [["Glob", { pattern: "**/*.ts" }], "Glob **/*.ts"],
    [["TodoWrite", {}], "Plan"],
    [["WebFetch", { url: "https://example.com/private" }], "Read the web"],
    [["mcp__claude_ai_Gmail__search_threads", {}], "Use Gmail"],
    [["mcp__plugin_vercel_vercel__list_projects", {}], "Use vercel"],
  ];
  for (const [data, want] of secretCases) {
    const got = phraseOf(data);
    if (got !== want) fails.push(`act: ${JSON.stringify(data)} should send ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
    if (got.length > 20) fails.push(`act: phrases should be at most 20 characters, got ${JSON.stringify(got)}`);
  }
  // Off (the Options dialog, saved in Herdr's shared state): the hook sends nothing at all.
  wf(join(dir, "shared.json"), JSON.stringify({ "sitandwatch.options": { activity: false } }));
  const c5 = count();
  run(pre("Edit", { file_path: "/a/off.js" }));
  if (count() !== c5) fails.push(`act: with activity bubbles off the hook should send nothing, sent +${count() - c5}`);
  unlinkSync(join(dir, "shared.json"));
  rmSync(dir, { recursive: true, force: true });
  // The panel refuses anything malformed.
  const refused = ["act-t8-", "act-t8-!!", "act--aGk", "act-t8-" + Buffer.from("tab\there").toString("base64url"), "act-t8-" + "a".repeat(81)].map(R.parseActCommand);
  if (refused.some(Boolean)) fails.push(`act: malformed or non-ASCII act commands should be refused, got ${JSON.stringify(refused)}`);
  // The bubble: fresh activity first (renamed by screenshot mode), the title after a minute.
  await S.settle(); S.dropCommandWaiters();
  const { o, cx } = mount();
  const send = async (c) => { S.sendCommand(c); await S.settle(); await S.settle(); };
  world.shared.privacy = { on: true, hidden: [], phrases: [{ text: "secretproj", alias: "proj" }] };
  const agent = () => [{ address: "t8", status: "working", tab_name: "build", title: "✳ Fix the login bug", program: null, focused: false }];
  clock.now = Math.ceil(clock.now / 7000) * 7000 + 500;
  await send("act-t8-" + Buffer.from("Edit secretproj.js").toString("base64url"));
  world.agents = agent(); let t = o.render();
  const bubble = () => { let v = null; walk(t, (e) => { if (e.idv === "psay-t8") walk(e, (k) => { if (k.text != null) v = k.text; }); }); return v; };
  if (bubble() !== "Edit proj.js") fails.push(`act: the bubble should say the fresh activity, renamed by screenshot mode, got ${bubble()}`);
  clock.now += 63000; clock.now = Math.ceil(clock.now / 7000) * 7000 + 500; world.agents = agent(); t = o.render();
  if (bubble() !== "Fix the login bug") fails.push(`act: after a minute the bubble should go back to the title, got ${bubble()}`);
  // A sub-agent's "> " stays on the bubble (only a title's leading glyph, like ✳, is dropped).
  await send("act-t8-" + Buffer.from("> Review the diff").toString("base64url"));
  world.agents = agent(); t = o.render();
  if (bubble() !== "> Review the diff") fails.push(`act: a sub-agent's bubble should keep its "> ", got ${bubble()}`);
  // Redraws: an act that repeats the bubble's text only refreshes its time; new text, or the same
  // text once the old one went stale, redraws. Each redraw is the whole panel, and a busy session
  // repeats itself a lot.
  const actOf = (s) => "act-t8-" + Buffer.from(s).toString("base64url");
  const n0 = cx.notified; await send(actOf("Read a.js"));
  const n1 = cx.notified; await send(actOf("Read a.js"));
  const n2 = cx.notified; await send(actOf("Read b.js"));
  const n3 = cx.notified; clock.now += 61000; await send(actOf("Read b.js"));
  const n4 = cx.notified;
  if (!(n1 > n0 && n2 === n1 && n3 > n2 && n4 > n3))
    fails.push(`act: only a changed or revived bubble should redraw (new, repeat, new, stale repeat), got +${n1 - n0} +${n2 - n1} +${n3 - n2} +${n4 - n3}`);
  if (o.acts?.t8?.text !== "Read b.js") fails.push(`act: a repeat should still be recorded, got ${JSON.stringify(o.acts?.t8)}`);
  // Activity bubbles off: the bubble is the title again, a new act is ignored without a redraw, and
  // `herdr-app do sitandwatch.activity` turns them off and on.
  await send("activity");
  if (OPT.options().activity !== false) fails.push(`act: "activity" should turn the bubbles off, got ${OPT.options().activity}`);
  clock.now = Math.ceil(clock.now / 7000) * 7000 + 500;
  const n5 = cx.notified; await send(actOf("Read c.js"));
  world.agents = agent(); t = o.render();
  if (bubble() !== "Fix the login bug") fails.push(`act: with activity bubbles off the bubble should be the title, got ${bubble()}`);
  if (o.acts?.t8?.text === "Read c.js") fails.push("act: with activity bubbles off an act should be ignored");
  if (cx.notified !== n5) fails.push(`act: with activity bubbles off an act shouldn't redraw, got +${cx.notified - n5}`);
  await send("activity");
  if (OPT.options().activity !== true) fails.push(`act: "activity" again should turn the bubbles back on, got ${OPT.options().activity}`);
  delete world.shared.privacy; world.agents = [];
}

// ---- minimise: refusals on the way back, async and thrown refusals, a restart ------------
{
  // Value: protects=minimise undoing itself whenever Herdr refuses: a refused restore puts the strip back (still
  //   minimised, saved, with a toast), a resize that rejects later or throws leaves it unminimised with a toast, a block
  //   with no id says so without resizing, and the minimised state comes back after a restart (localStorage "min") only
  //   while its block is still strip-sized (review fix: another layout or a full-size block forgets it);
  //   fails_when=restore's onFail stops calling setMin(was) (full panel drawn in a 30px block), the promise rejection or
  //   the catch stop undoing or toasting, or init stops reading "min"; why_new=the minimise block only refuses a shrink
  //   with a synchronous { error }, never a restore, a rejected promise, a throw or a restart; seam=none (world.runResult
  //   already exists); no_claim=whether Herdr's real layout.resize returns a promise
  const blk = (extra = {}) => ({ id: "sitandwatch", type: "block", content: { mod: "sitandwatch" }, size: { px: 300 }, ...extra });
  const tree = (kids) => ({ id: "root", type: "row", children: [{ id: "sidebar", type: "column", children: kids }] });
  S.dropCommandWaiters();
  const { o, cx } = mount();
  world.layout = tree([blk()]);
  render(o, ["working"]);
  o.minimise(cx);
  world.layout = tree([blk({ size: { px: 30 } })]);                 // Herdr shrank the block
  const o2 = new Office(); o2.init(world.props, makeCx());           // a restart: the strip is remembered
  if (o2.min?.id !== "sitandwatch" || o2.min?.axis !== "column") fails.push(`min: a restart should keep it minimised, got ${JSON.stringify(o2.min)}`);
  // Review fix: a layout whose block is full size (another layout reusing the id, or Herdr put it back) forgets the strip.
  world.layout = tree([blk()]);
  const o5 = new Office(); o5.init(world.props, makeCx());           // a reload right after minimising: block not shrunk yet
  if (o5.min?.id !== "sitandwatch") fails.push(`min: a reload within 3s of minimising should keep the strip, got ${JSON.stringify(o5.min)}`);
  jump(4000);
  const o3 = new Office(); o3.init(world.props, makeCx());
  let kept3 = "x"; try { kept3 = localStorage.getItem("min"); } catch {}
  if (o3.min || kept3 != null) fails.push(`min: a full-size block after a restart should forget the strip, got min=${JSON.stringify(o3.min)} saved=${kept3}`);
  world.layout = tree([blk({ size: { px: 30 } })]); o.setMin({ id: "sitandwatch", axis: "column", saved: { px: 300 }, at: 0, seen: 30 });
  const again = (result) => { world.notes = []; world.runResult = result; o.minBusy = false; o.minimise(cx); return world.notes.map((n) => n.body).join(" | "); };
  const toast = again(() => ({ error: "busy" }));                       // restore refused: still a strip
  let saved = null; try { saved = JSON.parse(localStorage.getItem("min")); } catch {}
  if (o.min?.id !== "sitandwatch" || saved?.id !== "sitandwatch" || !toast.includes("Herdr refused to resize me: busy")) fails.push(`min: a refused restore should stay minimised (and saved) with a toast, min=${JSON.stringify(o.min)} toast="${toast}"`);
  o.setMin(null);
  again(() => Promise.reject(new Error("later"))); await S.settle();   // shrink refused later
  const late = world.notes.map((n) => n.body).join(" | ");
  if (o.min || !late.includes("Herdr refused to resize me: later")) fails.push(`min: a resize that rejects should undo and toast, min=${JSON.stringify(o.min)} toast="${late}"`);
  const threw = again(() => { throw new Error("boom"); });
  if (o.min || !threw.includes("Herdr refused to resize me: boom")) fails.push(`min: a resize that throws should undo and toast, min=${JSON.stringify(o.min)} toast="${threw}"`);
  world.layout = tree([blk({ id: undefined })]); world.runs = [];
  const noid = again(null);
  if (o.min || world.runs.length || !noid.includes("Give my block an id")) fails.push(`min: a block with no id should toast and not resize, toast="${noid}"`);
  world.runResult = null;
}

// ---- review fixes: held-full meter, orphan sub-agents, waiting before the first poll, restore with no size ----
{
  // Value: protects=a full meter held during a ship staying full with nothing working (POWER! after the ship, not lost),
  //   sub-agents counting only once their session has a desk (no hour of phantom charge), waiting times surviving until
  //   the first hc poll (background helpers aren't listed before it), and restoring a block that had no size to weight 1;
  //   fails_when=powerStep drains a held meter, subDesks keeps orphans, trackWaiting drops unlisted entries before the
  //   poll, or restore sends anything but {id, weight: 1}; why_new=the /ship review found each one untested; seam=none;
  //   no_claim=Herdr's real timing of the first hc poll. Also the red team's two: a throwing command ending the loop,
  //   and sub-agents counting toward "how many?!".
  const R = await import(pathToFileURL(join(MOD, "rules.js")).href);
  if (JSON.stringify(R.powerStep(1200, 0, true)) !== '{"power":1200,"fire":false}') fails.push(`fixes: a held-full meter should stay full with nothing working, got ${JSON.stringify(R.powerStep(1200, 0, true))}`);
  if (R.subDesks({ x: { parent: "gone", at: 0 } }, [{ address: "a0" }]).length) fails.push("fixes: a sub-agent whose session has no desk shouldn't count");
  const kept = JSON.stringify(R.trackWaiting({ h1: 5 }, [], () => 9, true)), dropped = JSON.stringify(R.trackWaiting({ h1: 5 }, [], () => 9));
  if (kept !== '{"h1":5}' || dropped !== "{}") fails.push(`fixes: before the first poll unlisted waiters stay, after it they go, got ${kept} ${dropped}`);

  S.dropCommandWaiters();
  const { o, cx } = mount();
  render(o, ["idle"]);
  o.subEvent({ verb: "start", parent: "gone", id: "orph1" }, cx);
  const p0 = o.m.power; S.advance(1000);
  if (o.m.power > p0) fails.push("fixes: an orphan sub-agent shouldn't charge the bar");
  // A helper waiting since before a restart: kept until the first poll, which doesn't list it.
  localStorage.setItem("waiting", JSON.stringify({ h9: clock.now - 5 * MIN }));
  const o2 = new Office(); o2.init(world.props, makeCx());
  world.agents = []; o2.render();
  if (o2.waiting?.h9 == null) fails.push("fixes: a helper's waiting time should survive the first render after a restart");
  world.hcLs = { terminals: [] }; S.advance(10000); await S.settle(); await S.settle(); o2.render();
  if (o2.waiting?.h9 != null) fails.push("fixes: once the poll says it's gone, its waiting time should go");
  // Restore a block that had no size: weight 1.
  const { o: m, cx: mcx } = mount();
  world.layout = { id: "root", type: "row", children: [{ id: "sidebar", type: "column", children: [{ id: "sitandwatch", type: "block", content: { mod: "sitandwatch" } }] }] };
  render(m, ["idle"]); m.minimise(mcx); m.minBusy = false; world.runs = []; m.minimise(mcx);
  const back = world.runs.find(([n]) => n === "layout.resize")?.[1];
  if (JSON.stringify(back) !== '{"id":"sitandwatch","weight":1}' || m.min) fails.push(`fixes: restoring a block with no size should resize it to weight 1, got ${JSON.stringify(back)} min=${JSON.stringify(m.min)}`);
  world.layout = null;

  // Red team: a bad command (an inherited name like fire-toString) must not end the command loop, and sub-agents
  // aren't more agents seen (ten of them mustn't make "how many?!" his mood for good).
  await S.settle(); S.dropCommandWaiters();             // earlier mounts' loops start on the first await: drop them after
  const { o: c } = mount();
  render(c, ["working"]);
  const send = async (cmd) => { S.sendCommand(cmd); await S.settle(); await S.settle(); };
  try { c.fire("toString", makeCx()); } catch (e) { fails.push(`fixes: fire("toString") should be no event, it threw ${e?.message}`); }
  world.overlays = null;                                   // makes openOverlay throw: a command that fails
  await send("options"); world.overlays = []; await send("demo-2");
  if (c.demoAt == null) fails.push("fixes: after a command that throws the loop should still take commands (demo-2 did nothing)");
  c.demoAt = null;
  for (let i = 0; i < 12; i++) { await send(`sub-start-a0-many${i}`); render(c, ["working"]); }
  if (c.m.seen.size !== 1) fails.push(`fixes: sub-agents shouldn't count as agents seen, seen=${c.m.seen.size}`);
  // A closed channel (nextCommand resolving to nothing) stops the loop instead of spinning on errors.
  world.notes = []; await send(undefined); await send("demo-3");
  if (c.demoAt != null) fails.push("fixes: after the channel closes (a non-string command) the loop should stop");

  // Pass 2: POWER! fires as soon as the hold ends, working or not; keepMin forgets only on positive evidence;
  // a failing hc poll still counts as the first poll.
  if (JSON.stringify(R.powerStep(1200, 0, false)) !== '{"power":0,"fire":true}') fails.push(`fixes: a full meter whose hold ended should fire POWER!, got ${JSON.stringify(R.powerStep(1200, 0, false))}`);
  const mn = { id: "sitandwatch", axis: "column", saved: { px: 300 } }, blkOf = (size, id = "sitandwatch", axis = "column") => ({ ok: true, id, axis, size });
  const km = [R.keepMin(mn, { ok: false, reason: "none" }), R.keepMin(mn, null), R.keepMin(mn, blkOf({ weight: 1 })), R.keepMin(mn, blkOf({ px: 30 })),
    R.keepMin(mn, blkOf({ px: 300 })), R.keepMin(mn, blkOf({ px: 30 }, "other")), R.keepMin(mn, blkOf({ px: 40 }, "sitandwatch", "row"))].map((x) => (x ? "keep" : "drop")).join(",");
  if (km !== "keep,keep,keep,keep,drop,drop,drop") fails.push(`fixes: keepMin should keep unless it sees an open block, another id or axis, got ${km}`);
  // A reload within MIN_GUARD_MS of minimising: the block may still read open; keep the strip.
  const fresh = { ...mn, at: 10000 };
  const kg = [R.keepMin(fresh, blkOf({ px: 300 }), 12000), R.keepMin(fresh, blkOf({ px: 300 }), 14000)].map((x) => (x ? "keep" : "drop")).join(",");
  if (kg !== "keep,drop") fails.push(`fixes: keepMin should keep a strip saved under 3s ago, got ${kg}`);
  // A provisional finish time (seen before hc's status time arrived) gives way to hc's earlier one, never a later one.
  const tw = [R.trackWaiting({ a: 100 }, [{ address: "a", status: "done" }], () => 50), R.trackWaiting({ a: 100 }, [{ address: "a", status: "done" }], () => 200)];
  if (JSON.stringify(tw) !== '[{"a":50},{"a":100}]') fails.push(`fixes: a done agent should keep the earliest finish time it learns, got ${JSON.stringify(tw)}`);
  // A failed poll isn't proof a helper left (Codex): one failure keeps its waiting time, three in a row (hc broken) drop it.
  S.dropCommandWaiters();                                    // nothing left over from the loops above
  localStorage.setItem("waiting", JSON.stringify({ h8: clock.now - 5 * MIN }));
  const o4 = new Office(); o4.init(world.props, makeCx());
  world.agents = []; world.hcLs = undefined;                         // hc answers garbage: the poll fails
  await S.settle(); await S.settle(); o4.render();
  if (o4.waiting?.h8 == null) fails.push(`fixes: one failed poll shouldn't drop a helper's waiting time, got ${JSON.stringify(o4.waiting)}`);
  S.advance(20000); await S.settle(); await S.settle(); o4.render();
  if (o4.waiting == null || o4.waiting.h8 != null) fails.push(`fixes: three failed polls in a row should let unlisted waiters go, got ${JSON.stringify(o4.waiting)} fails=${o4.pollFails}`);
  world.hcLs = { terminals: [] };
}

// ---- height: the Options setting and height-<px> ---------------------------------------------
{
  // Value: protects=planHeight(): a new choice resizes once (a layout min up to that height is fine), the same choice
  //   leaves a drag alone except on a first tick with the block back at its old size (Herdr restarted), "layout" hands the
  //   old size back, a docked/missing/too-small block says why, nothing while minimised; and heightTick: a typo ignored,
  //   a refusal toasts once and retries after 30s; fails_when=any of those rules breaks; why_new=new feature, rebuilt after
  //   the ship's adversarial review; seam=none (world.layout/runs/notes exist); no_claim=Herdr keeping px across a restart
  const R = await import(pathToFileURL(join(MOD, "rules.js")).href);
  const b = (px, extra = {}) => ({ ok: true, id: "sitandwatch", axis: "column", size: px == null ? null : { px }, ...extra });
  const P = (height, saved, blk, first = false, minimised = false) => R.planHeight({ height, saved, b: blk, minimised, first });
  const sv = { id: "sitandwatch", h: 400, from: { px: 300 } };
  const show = (p) => `${JSON.stringify(p.resize)}|${p.saved ? p.saved.h + "<" + JSON.stringify(p.saved.from) : "-"}|${p.warn ?? ""}`;
  const plans = [
    P(400, null, b(300)),                                           // new choice
    P(400, sv, b(400)),                                             // already set
    P(400, sv, b(350)),                                             // dragged: leave it
    P(400, sv, b(350), true),                                       // reload after a drag: leave it
    P(400, sv, b(300), true),                                       // restart: back at 300, set again
    P(400, sv, b(300), false),                                      // not a first tick: leave it
    P(null, sv, b(400)),                                            // layout: back to 300
    P(null, { ...sv, from: null }, b(400)),                         // layout, no old size: weight 1
    P(null, null, b(400)),                                          // layout, nothing set: nothing
    P(500, sv, b(400)),                                             // a new choice keeps the first old size
    P(400, null, { ok: false, reason: "min", id: "sitandwatch", min: 220, axis: "column", size: { px: 300 } }),   // min 220 is fine for 400
    P(200, null, { ok: false, reason: "min", id: "sitandwatch", min: 220, axis: "column", size: { px: 300 } }),   // too small
    P(400, null, b(300, { axis: "row" })),                          // docked
    P(400, null, { ok: false, reason: "ambiguous" }),               // two panels
    P(500, sv, b(30), false, true),                                 // minimised, a new choice: nothing yet
  ].map(show);
  const want = ['{"px":400}|400<{"px":300}|', 'null|400<{"px":300}|', 'null|400<{"px":300}|', 'null|400<{"px":300}|', '{"px":400}|400<{"px":300}|',
    'null|400<{"px":300}|', '{"px":300}|-|', '{"weight":1}|-|', 'null|-|', '{"px":500}|500<{"px":300}|', '{"px":400}|400<{"px":300}|',
    'null|-|small', 'null|-|row', 'null|-|ambiguous', 'null|400<{"px":300}|'];
  plans.forEach((p, n) => { if (p !== want[n]) fails.push(`height: plan case ${n + 1} should be ${want[n]}, got ${p}`); });

  S.dropCommandWaiters();
  const { o } = mount();
  const lay = (px, extra = {}) => ({ id: "root", type: "row", children: [{ id: "sidebar", type: "column", children: [{ id: "sitandwatch", type: "block", content: { mod: "sitandwatch" }, size: { px }, ...extra }] }] });
  world.layout = lay(300); render(o, ["idle"]);
  const send = async (c) => { S.sendCommand(c); await S.settle(); await S.settle(); };
  const sized = () => world.runs.filter(([n]) => n === "layout.resize").map(([, a]) => JSON.stringify(a));
  world.runs = []; await send("height-400"); S.advance(1000);
  if (JSON.stringify(sized()) !== JSON.stringify(['{"id":"sitandwatch","px":400}'])) fails.push(`height: height-400 should resize to 400 once, got ${sized()}`);
  world.layout = lay(400); S.advance(3000);
  if (sized().length !== 1) fails.push(`height: it shouldn't resize again, got ${sized()}`);
  await send("height-350"); if (R.readOptions(world.shared["sitandwatch.options"]).height !== 400) fails.push("height: height-350 (not offered) should be ignored");
  // Refused: one toast, a retry 30s later.
  world.runs = []; world.notes = []; world.runResult = () => ({ error: "no room" });
  await send("height-500"); S.advance(1000); S.advance(5000);
  const notes = world.notes.filter((n) => /Herdr refused to set my height: no room/.test(n.body)).length;
  if (sized().length !== 1 || notes !== 1) fails.push(`height: a refusal should toast once and not retry at once, resizes ${sized().length} toasts ${notes}`);
  world.runResult = null; S.advance(30000);
  if (sized().length !== 2) fails.push(`height: a refused height should be retried after 30s, resizes ${sized().length}`);
  // Docked in a row: says so once.
  world.notes = []; world.layout = { id: "root", type: "row", children: [{ id: "sitandwatch", type: "block", content: { mod: "sitandwatch" }, size: { px: 300 } }] };
  await send("height-240"); S.advance(3000);
  if (world.notes.filter((n) => /docked in a row/.test(n.body)).length !== 1) fails.push(`height: a docked panel should say once why height does nothing, ${JSON.stringify(world.notes)}`);
  world.layout = null; world.runs = [];
}

// ---- a knocking cat stays put, mid-wander or not --------------------------------------------
{
  // Value: protects=a cat knocking the can staying drawn on the armrest (or chair back) while a wander trip has it away;
  //   fails_when=the knock's sit pose follows the walk state again (the cat vanishes while the can still falls);
  //   why_new=Codex's structured review reproduced it; seam=none (pets() takes the walk map); no_claim=the timing in Herdr
  const poses = { buddy: "sit", snowy: "sit", simba: "knock" };
  const t = S.div().children(A.pets(poses, 116, 3, "pet", { Simba: "away", Snowy: "away" }));
  const there = ids(t);
  if (!there.includes("pet-Simba-sit")) fails.push("knock: a knocking Simba should stay drawn while a wander has him away");
  if (there.includes("pet-Snowy-sit")) fails.push("knock: a sitting Snowy who's away should still go");
  const tb = S.div().children(A.pets({ ...poses, simba: "knockBack" }, 116, 3, "pet", { Simba: "away" }));
  if (!ids(tb).includes("pet-Simba-sit")) fails.push("knock: a knockBack Simba should stay drawn too");
}

// ---- ship run 2 review fixes ----------------------------------------------------------------
{
  // Value: protects=a fresh finish time after done→working→done between polls; just after a restore the restore size (not the strip) as "the size before", forgotten once it reads open; a restart's re-apply not spent on a strip reading; a restart's height re-apply retried after a
  //   refusal; a refused "layout" restore rolled back and retried; a new choice not held up by an old refusal's wait; a late
  //   refusal not undoing a newer choice;  keepMin trusting the size seen
  //   after the shrink (reverted: only an open block drops it); only the owning copy saving sub-agents; fails_when=any of those rules is reverted;
  //   why_new=found by the ship's batched specialist and red team (run 2); seam=none; no_claim=Herdr's real resize timing
  const R = await import(pathToFileURL(join(MOD, "rules.js")).href);
  const mn = { id: "sitandwatch", axis: "column", saved: { px: 300 }, at: 0, seen: 300 }, blk = (px) => ({ ok: true, id: "sitandwatch", axis: "column", size: { px } });
  if (R.keepMin({ ...mn, seen: 30 }, blk(300), 1e9)) fails.push("fixes2: keepMin should drop a strip whose block reads open (not what was seen)");
  const strip = R.planHeight({ height: 400, saved: null, b: blk(30), minimised: false, first: false, restoredFrom: { px: 300 } });
  if (JSON.stringify(strip.saved?.from) !== '{"px":300}') fails.push(`fixes2: just restored, a strip-sized reading should take the restore's size as the size before, got ${JSON.stringify(strip)}`);
  const small = R.planHeight({ height: 400, saved: null, b: blk(120), minimised: false, first: false });
  if (JSON.stringify(small.resize) !== '{"px":400}') fails.push(`fixes2: a small but open block (dragged) should still take a height, got ${JSON.stringify(small)}`);

  // done → working → done between two polls: the second finish is fresh, not the first one hc gave.
  S.dropCommandWaiters();
  const { o } = mount();
  const t1 = clock.now - 5 * 60 * MIN;
  world.hcLs = { terminals: [{ address: "a0", state: "live", status: "done", name: "t0" }] };
  world.hcGet = { a0: { status: { state: "done" }, status_ms: t1 } };
  render(o, ["done"]); S.advance(10000); await S.settle(); await S.settle(); render(o, ["done"]);
  if (o.waiting?.a0 !== t1) fails.push(`fixes2: the first finish should come from hc, got ${o.waiting?.a0} want ${t1}`);
  jump(2000); render(o, ["working"]); jump(3000); render(o, ["done"]);
  if (!(o.waiting?.a0 > t1 + 60 * MIN)) fails.push(`fixes2: a second finish between polls should be fresh, got ${o.waiting?.a0} (first was ${t1})`);
  world.hcLs = { terminals: [] }; world.hcGet = {};

  // A tombstone doesn't stretch a finished batch: its own clock (30s), not the batch's.
  const pt = R.pruneSubs({ d1: { parent: "p", at: 0, doneAt: 100 }, t1: { parent: "p", at: 7000, doneAt: 7000, tomb: true } }, 9000);
  if (Object.keys(pt).join() !== "t1") fails.push(`fixes2: a tombstone shouldn't keep a finished batch on screen, kept ${Object.keys(pt)}`);
  // Only the copy that owns the commands writes sub-agents down (an old copy's stale map mustn't overwrite them).
  localStorage.removeItem("subs");
  const other = new Office(); other.init(world.props, makeCx());      // the newest copy owns the commands now
  o.subEvent({ verb: "start", parent: "a0", id: "stale1" }, makeCx());
  if (localStorage.getItem("subs")?.includes("stale1")) fails.push("fixes2: a copy that doesn't own the commands shouldn't save sub-agents");
  other.subEvent({ verb: "start", parent: "a0", id: "own1" }, makeCx());
  if (!localStorage.getItem("subs")?.includes("own1")) fails.push("fixes2: the owning copy should save sub-agents");

  // Height: a restart's re-apply refused, then retried.
  const lay = (px) => ({ id: "root", type: "row", children: [{ id: "sidebar", type: "column", children: [{ id: "sitandwatch", type: "block", content: { mod: "sitandwatch" }, size: { px } }] }] });
  const sized = () => world.runs.filter(([n]) => n === "layout.resize").map(([, a]) => JSON.stringify(a));
  const OPTKEY = "sitandwatch.options";
  S.dropCommandWaiters();
  const { o: h } = mount();
  world.layout = lay(300); world.shared[OPTKEY] = { height: 400 };
  localStorage.setItem("height", JSON.stringify({ id: "sitandwatch", h: 400, from: { px: 300 } }));
  const h2 = new Office(); h2.init(world.props, makeCx());              // a restart: the block is back at 300
  world.runs = []; world.notes = []; world.runResult = () => ({ error: "busy" }); S.advance(1000);
  world.runResult = null; S.advance(31000);
  if (JSON.stringify(sized()) !== JSON.stringify(['{"id":"sitandwatch","px":400}', '{"id":"sitandwatch","px":400}'])) fails.push(`fixes2: a refused re-apply after a restart should be retried, got ${sized()}`);
  // A restart whose first tick can't read the layout yet still re-applies once it can.
  localStorage.setItem("height", JSON.stringify({ id: "sitandwatch", h: 400, from: { px: 300 } }));
  world.layout = null; const h3 = new Office(); h3.init(world.props, makeCx()); world.runs = []; S.advance(1000);
  world.layout = lay(300); S.advance(1000);
  if (!sized().includes('{"id":"sitandwatch","px":400}')) fails.push(`fixes2: a restart's re-apply should wait for a readable layout, got ${sized()}`);
  // "layout" refused: rolled back, retried.
  world.layout = lay(400); world.runs = []; world.runResult = () => ({ error: "busy" });
  world.shared[OPTKEY] = { height: null }; S.advance(1000);
  let hs = null; try { hs = JSON.parse(localStorage.getItem("height")); } catch {}
  if (hs?.h !== 400) fails.push(`fixes2: a refused "layout" should keep what was set (to retry), got ${JSON.stringify(hs)}`);
  world.runResult = null; S.advance(31000);
  if (!sized().includes('{"id":"sitandwatch","px":300}')) fails.push(`fixes2: a refused "layout" should be retried and give 300 back, got ${sized()}`);
  // A new choice right after a refusal isn't held up.
  world.layout = lay(300); localStorage.removeItem("height"); world.runs = []; world.runResult = () => ({ error: "busy" });
  world.shared[OPTKEY] = { height: 500 }; S.advance(1000); world.runResult = null;
  world.shared[OPTKEY] = { height: 240 }; S.advance(1000);
  if (!sized().includes('{"id":"sitandwatch","px":240}')) fails.push(`fixes2: a new choice after a refusal should go at once, got ${sized()}`);
  // A late refusal doesn't undo a newer choice.
  world.layout = lay(240); localStorage.removeItem("height"); world.runs = [];
  let reject; world.runResult = () => new Promise((_, rj) => { reject = rj; });
  world.shared[OPTKEY] = { height: 400 }; S.advance(1000);
  world.runResult = null; world.layout = lay(400); world.shared[OPTKEY] = { height: 300 }; S.advance(1000);   // (500 is still waiting out its refusal above)
  reject?.(new Error("late")); await S.settle(); await S.settle();
  let hl = null; try { hl = JSON.parse(localStorage.getItem("height")); } catch {}
  if (hl?.h !== 300) fails.push(`fixes2: a late refusal shouldn't undo a newer choice, height=${JSON.stringify(hl)}`);
  // A choice that needs no resize still cancels an older pending refusal.
  world.layout = lay(300); localStorage.removeItem("height"); world.runs = [];
  let rejectB; world.runResult = () => new Promise((_, rj) => { rejectB = rj; });
  world.shared["sitandwatch.options"] = { height: 400 }; S.advance(1000);
  world.runResult = null; world.layout = lay(240); world.shared["sitandwatch.options"] = { height: 240 }; S.advance(1000);   // dragged to 240, then chose 240 (500 is still waiting out a refusal above)
  rejectB?.(new Error("late")); await S.settle(); await S.settle();
  let hb = null; try { hb = JSON.parse(localStorage.getItem("height")); } catch {}
  if (hb?.h !== 240 || hb?.from?.px !== 300) fails.push(`fixes2: a no-resize choice should outlive an older refusal, height=${JSON.stringify(hb)}`);
    // ABA: 400 refused late, after 300 then 400 again went through: the newer 400 (and its old size) stay.
  world.layout = lay(250); localStorage.removeItem("height"); world.runs = [];
  let rejectA; world.runResult = () => new Promise((_, rj) => { rejectA = rj; });
  world.shared[OPTKEY] = { height: 400 }; S.advance(1000);
  world.runResult = null; world.shared[OPTKEY] = { height: 300 }; S.advance(1000);
  world.layout = lay(300); world.shared[OPTKEY] = { height: 400 }; S.advance(1000);
  rejectA?.(new Error("late")); await S.settle(); await S.settle();
  let ha = null; try { ha = JSON.parse(localStorage.getItem("height")); } catch {}
  if (ha?.h !== 400 || ha?.from?.px !== 250) fails.push(`fixes2: an old refusal shouldn't roll back a newer identical choice, height=${JSON.stringify(ha)}`);
  // Just after a restore ("+"), a strip-sized reading: a new choice keeps the restore's size as "the size before".
  localStorage.setItem("height", JSON.stringify({ id: "sitandwatch", h: 400, from: { px: 300 } }));
  world.layout = lay(300); world.shared[OPTKEY] = { height: 400 };
  const h4 = new Office(); h4.init(world.props, makeCx());
  h4.setMin({ id: "sitandwatch", axis: "column", saved: { px: 300 }, at: clock.now - 10000, seen: 30 }); h4.minBusy = false;
  localStorage.removeItem("height"); world.shared[OPTKEY] = { height: null };
  world.layout = lay(30); world.runs = []; h4.minimise(makeCx()); world.runs = []; S.advance(1000);   // a real restore ("+"); Herdr still reads 30
  world.shared[OPTKEY] = { height: 400 }; S.advance(1000);                                           // then a height is chosen
  if (!sized().includes('{"id":"sitandwatch","px":400}')) fails.push(`fixes2: after a restore the chosen height should apply, got ${sized()}`);
  let hr = null; try { hr = JSON.parse(localStorage.getItem("height")); } catch {}
  if (hr?.from?.px !== 300) fails.push(`fixes2: a restore read as a strip should keep the restore's size as the size before, got ${JSON.stringify(hr)}`);
  // A restart that starts minimised: the re-apply isn't spent on the strip reading after "+", only once it reads open.
  localStorage.setItem("height", JSON.stringify({ id: "sitandwatch", h: 400, from: { px: 300 } }));
  localStorage.setItem("min", JSON.stringify({ id: "sitandwatch", axis: "column", saved: { px: 300 }, at: clock.now - 10000, seen: 30 }));
  world.layout = lay(30); world.shared[OPTKEY] = { height: 400 };
  const h5 = new Office(); h5.init(world.props, makeCx()); h5.minBusy = false; h5.minimise(makeCx()); world.runs = []; S.advance(1000);
  world.layout = lay(300); S.advance(1000);
  if (!sized().includes('{"id":"sitandwatch","px":400}')) fails.push(`fixes2: a restart's re-apply should wait out the strip reading after "+", got ${sized()}`);
  if (h5.restoredFrom != null) fails.push("fixes2: once the block reads open, the restore size should be forgotten");
  world.layout = null; world.runs = []; world.shared[OPTKEY] = {};
}

// ---- the demo story, real names in the demo, busy desks -----------------------------------------
{
  // Value: protects=DEMO playing the story (quiet → work → sub-agents ramp → finish → PR merged → winding down → dozing →
  //   asleep) on a loop while demo-<n> keeps the labelled tour; demo desks named after the real agents (else "bot N");
  //   a working screen's log (two cycling lines); one working desk at a time saying its terminal title (or a made-up task),
  //   through screenshot mode; fails_when=DEMO plays the tour, a scene is skipped or out of order, the names stay "bot N",
  //   the log or the bubble goes, two desks talk at once, or a title shows unrenamed; why_new=new feature; seam=none;
  //   no_claim=how it looks in Herdr (checked live)
  const R = await import(pathToFileURL(join(MOD, "rules.js")).href);
  const headOf = (t) => texts(t).find((x) => /^DEMO \d/.test(x)) ?? "";
  S.dropCommandWaiters();
  const { o } = mount();
  world.agents = [{ address: "r0", status: "working", tab_name: "build", title: "✳ Fix the login bug", program: null, focused: false }];
  o.render(); o.toggleDemo();
  const at = (ms) => { clock.now = o.demoAt + ms; world.agents = [{ address: "r0", status: "working", tab_name: "build", title: "✳ Fix the login bug", program: null, focused: false }]; return o.render(); };
  const heads = [0, 5000, 9000, 13000, 17000, 22000, 26000, 31000, 36000, 40000, 46000].map((ms) => headOf(at(ms)).replace(/^DEMO (\d+)\/11 .*$/, "$1")).join(",");
  if (heads !== "1,2,3,4,5,6,7,8,9,10,11") fails.push(`story: DEMO should play the 11 scenes in order, got ${heads}`);
  if (!headOf(at(52000)).startsWith("DEMO 1/11")) fails.push("story: it should loop back to the start");
  let t = at(18000);
  let badge = null; walk(t, (e) => { if (e.idv === "psub-demo-0") walk(e, (k) => { if (k.text != null) badge = k.text; }); });
  if (badge !== "0/5") fails.push(`story: the ramp-up scene should show 0/5 sub-agents, got ${badge}`);
  t = at(31500);
  if (!ids(t).some((x) => x.startsWith("pdev-") && /boom|explo|ship/i.test(x)) && !texts(t).some((x) => /PR MERGED/.test(x))) fails.push("story: the shipped scene should set off the explosion");
  t = at(47000);
  if (!ids(t).some((x) => x.startsWith("pet-") && x.endsWith("-curl"))) fails.push("story: the last scene should have the pets curled on the empty chair");
  // Real names: desk 0 is "build" (the real agent there), the rest "bot N".
  t = at(1000);
  const nm = (a) => { let v = null; walk(t, (e) => { if (e.idv === `pn-${a}`) v = e.text; }); return v; };
  if (nm("demo-0") !== "build" || nm("demo-1") !== "bot 2") fails.push(`story: demo desks should take the real agents' names, got ${nm("demo-0")} ${nm("demo-1")}`);
  o.toggleDemo();
  // demo-<n> still opens the tour.
  await S.settle(); S.dropCommandWaiters();
  const { o: tour } = mount();
  const send = async (c) => { S.sendCommand(c); await S.settle(); await S.settle(); };
  await send("demo-3"); jump(500);
  if (!headOf(render(tour, [])).startsWith("DEMO 3/27")) fails.push(`story: demo-3 should open the 27-state tour, got "${headOf(render(tour, []))}"`);
  tour.demoAt = null;

  // Busy desks: rules.
  if (R.talker([{ address: "a", status: "idle" }], 1000) !== null) fails.push("busy: nobody working should mean nobody talks");
  const two = [{ address: "a", status: "working" }, { address: "b", status: "working" }, { address: "c", status: "idle" }];
  const turns = [0, 3600, 7000, 14000].map((ms) => R.talker(two, ms)).join(",");
  if (turns !== "a,,b,a") fails.push(`busy: working desks should take 7s turns, shown for 3.5s, got ${turns}`);
  const says = [R.sayText("✳ Fix the login bug", 0), R.sayText("", 1), R.sayText("✳ Ship the sub-agent hook and docs", 0)];
  if (JSON.stringify(says) !== JSON.stringify(["Fix the login bug", R.DEMO_TASKS[1], "Ship the sub-agent…"])) fails.push(`busy: sayText should strip the glyph, fill in a task and cut at a word, got ${JSON.stringify(says)}`);
  // Busy desks: live render, with screenshot mode renaming the title.
  const { o: live } = mount();
  world.shared.privacy = { on: true, hidden: [], phrases: [{ text: "login", alias: "auth" }] };
  clock.now = Math.ceil(clock.now / 7000) * 7000 + 500;
  world.agents = [{ address: "w0", status: "working", tab_name: "build", title: "✳ Fix the login bug", program: null, focused: false }];
  t = live.render();
  let said = null; walk(t, (e) => { if (e.idv === "psay-w0") walk(e, (k) => { if (k.text != null) said = k.text; }); });
  if (said !== "Fix the auth bug") fails.push(`busy: a working desk should say its title, renamed by screenshot mode, got ${said}`);
  const logEl = S.findId(t, (x) => x === "pc-w0-0");
  if (!logEl || !logEl.calls.some(([k]) => k === "frames")) fails.push("busy: a working screen should run a log (cycling text)");
  clock.now += 4000; t = live.render();
  if (ids(t).includes("psay-w0")) fails.push("busy: the bubble should go after 3.5s");
  delete world.shared.privacy; world.agents = [];
}

// ---- the power bar: a terminal both in agents() and in hc's list counts once ---------------
{
  // Value: protects=powerTick() and the panel list taking each address once when a terminal is both in agents() and in the
  //   hc poll (helpers), plus a real background helper charging and getting its desk; fails_when=the seen-set dedupe goes
  //   from powerTick (the bar charges twice per agent and POWER! fires early) or from render (a desk drawn twice), or
  //   helpers stop counting; why_new=the power block's hcLs is always empty, so helpers never reach the meter; seam=none;
  //   no_claim=Herdr's real overlap between agents() and hc ls
  S.dropCommandWaiters();
  const { o } = mount();
  world.agents = agentsOf(["working", "idle"]);
  world.hcLs = { terminals: [{ address: "a0", state: "live", status: "working", name: "t0" }, { address: "h1", state: "live", status: "working", name: "bg" }] };
  await S.settle(); await S.settle(); await S.settle();
  if (o.helpers.length !== 2) fails.push(`power: the poll should have read both hc terminals, got ${o.helpers.length}`);
  const p0 = o.m.power; S.advance(1000);
  if (o.m.power - p0 !== 2) fails.push(`power: a0 (in both lists) and helper h1 working should charge 2 a second, got ${o.m.power - p0}`);
  const desks = ids(o.render()).filter((x) => /^pd-/.test(x)).sort().join(",");
  if (desks !== "pd-a0,pd-a1,pd-h1") fails.push(`power: each terminal should get one desk, got ${desks}`);
}

// ---- sub-agents: a repeated start, the dev chip ----------------------------------------
{
  // Value: protects=subEvent() keeping a sub-agent's first start (a repeated start doesn't restart its hour or revive it),
  //   a repeated stop keeping the first stop time, and the dev "subagent" chip putting a pretend one on the first desk that
  //   stops after 15s and goes 8s later (nothing without a desk); fails_when=start overwrites (= instead of ??=), a stop
  //   re-stamps doneAt, the chip's parent/timer breaks or it adds one with no desk to hang it on; why_new=the sub-agents
  //   block never repeats a start or a stop and never fires the chip; seam=none; no_claim=whether Claude Code ever sends a
  //   start twice
  S.dropCommandWaiters();
  const { o, cx } = mount();
  render(o, ["idle", "idle"]);
  o.subEvent({ verb: "start", parent: "a0", id: "r1" }, cx);
  const at0 = o.subs.r1.at;
  jump(50 * MIN); o.subEvent({ verb: "start", parent: "a0", id: "r1" }, cx);
  if (o.subs.r1.at !== at0) fails.push("subs: a repeated start should keep the first start's time");
  jump(11 * MIN); S.advance(1000);
  if (o.subs.r1) fails.push("subs: a repeated start shouldn't restart the hour (dropped 1h after the first start)");
  o.subEvent({ verb: "start", parent: "a0", id: "r2" }, cx); o.subEvent({ verb: "start", parent: "a0", id: "r3" }, cx);
  o.subEvent({ verb: "stop", parent: "a0", id: "r2" }, cx);
  const done0 = o.subs.r2.doneAt; jump(5000);
  o.subEvent({ verb: "stop", parent: "a0", id: "r2" }, cx);
  if (o.subs.r2.doneAt !== done0) fails.push("subs: a repeated stop should keep the first stop's time");
  o.subs = {};

  render(o, ["idle", "idle"]);
  o.fire("subagent", cx);
  const devs = Object.entries(o.subs);
  if (devs.length !== 1 || devs[0][1].parent !== o.list[0].address || devs[0][1].doneAt) fails.push(`subs: the dev chip should start one sub-agent on the first desk, got ${JSON.stringify(o.subs)}`);
  S.advance(15000);
  if (!(devs[0]?.[1].doneAt > 0) || !o.subs[devs[0]?.[0]]) fails.push("subs: the dev sub-agent should stop after 15s and stay a moment");
  S.advance(9000);
  if (Object.keys(o.subs).length) fails.push("subs: the dev sub-agent should be gone 8s after it stops");
  const { o: e, cx: ecx } = mount();
  render(e, []); e.fire("subagent", ecx);
  if (Object.keys(e.subs).length) fails.push("subs: the dev chip with no desks should do nothing");
}

// ---- height: heightTick's wiring (minimised, "layout", a restart) and late refusals -------------
{
  // Value: protects=heightTick() feeding planHeight the live state: nothing resized while minimised (a new choice must not
  //   blow the strip open), `height-layout` handing the old size back and forgetting the saved height, and a restart (a
  //   new copy's first tick, block back at its old size) setting the chosen height again; fails_when=minimised stops being
  //   passed (!!this.min), the "layout" word stops being accepted, or `first` is never true; why_new=the height block
  //   proves those rules in planHeight() alone, and through main.js only a new choice, a typo, a sync refusal and a row;
  //   seam=none; no_claim=Herdr keeping px across a real restart
  await S.settle(); S.dropCommandWaiters();
  const { o } = mount();
  const lay = (px) => ({ id: "root", type: "row", children: [{ id: "sidebar", type: "column", children: [{ id: "sitandwatch", type: "block", content: { mod: "sitandwatch" }, size: { px } }] }] });
  const send = async (c) => { S.sendCommand(c); await S.settle(); await S.settle(); };
  const sized = () => world.runs.filter(([n]) => n === "layout.resize").map(([, a]) => JSON.stringify(a));
  world.layout = lay(300); render(o, ["idle"]);
  await send("height-400"); S.advance(1000); world.layout = lay(400);
  // Minimised: a new choice waits, the strip stays a strip.
  o.setMin({ id: "sitandwatch", axis: "column", saved: { px: 400 }, at: clock.now, seen: 30 }); world.layout = lay(30);
  world.runs = []; await send("height-500"); S.advance(3000);
  if (sized().length) fails.push(`height: a new height while minimised should wait, got ${sized()}`);
  await send("height-400"); o.setMin(null); try { localStorage.removeItem("min"); } catch {}
  world.layout = lay(400); S.advance(1000);
  // "layout": back to the size from before, nothing remembered.
  world.runs = []; await send("height-layout"); S.advance(1000);
  let kept = "x"; try { kept = localStorage.getItem("height"); } catch {}
  if (JSON.stringify(sized()) !== '["{\\"id\\":\\"sitandwatch\\",\\"px\\":300}"]' || kept != null || OPT.options().height != null) fails.push(`height: height-layout should hand back 300 and forget, got ${sized()} saved=${kept} option=${OPT.options().height}`);
  // A restart: the chosen 400 is remembered, Herdr put the block back to 300; the new copy's first tick sets it again.
  world.layout = lay(300); await send("height-400"); S.advance(1000);
  world.layout = lay(400); S.advance(1000); world.layout = lay(300); world.runs = [];
  const o2 = new Office(); o2.init(world.props, makeCx()); S.advance(1000);
  if (JSON.stringify(sized()) !== '["{\\"id\\":\\"sitandwatch\\",\\"px\\":400}"]') fails.push(`height: after a restart the chosen height should be set again, got ${sized()}`);
  world.layout = null; world.runs = [];
}
{
  // Value: protects=heightTick() treating a later refusal like a sync one: a promise that rejects, one that resolves to
  //   { error }, and a throw each toast "Herdr refused to set my height" once and forget the new height so it's retried in 30s;
  //   fails_when=the .then handlers or the catch stop calling refused() (silent failure, never retried); why_new=the height
  //   block only refuses with a synchronous { error }; seam=none (world.runResult exists); no_claim=whether Herdr's real
  //   layout.resize returns a promise
  await S.settle(); S.dropCommandWaiters();
  const { o } = mount();
  const lay = { id: "root", type: "row", children: [{ id: "sidebar", type: "column", children: [{ id: "sitandwatch", type: "block", content: { mod: "sitandwatch" }, size: { px: 300 } }] }] };
  const send = async (c) => { S.sendCommand(c); await S.settle(); await S.settle(); };
  world.layout = lay; render(o, ["idle"]);
  const refusals = (why) => world.notes.filter((n) => n.body === `Herdr refused to set my height: ${why}`).length;
  const cases = [["400", () => Promise.reject(new Error("later"))], ["500", () => Promise.resolve({ error: "full" })], ["240", () => { throw new Error("boom"); }]];
  for (const [h, result] of cases) {
    world.notes = []; world.runs = []; world.runResult = result;
    await send(`height-${h}`); S.advance(1000); await S.settle(); await S.settle(); S.advance(5000);
    const why = { 400: "later", 500: "full", 240: "boom" }[h];
    let saved = null; try { saved = JSON.parse(localStorage.getItem("height") ?? "null"); } catch {}
    if (refusals(why) !== 1 || saved?.h === +h) fails.push(`height: a ${why} refusal should toast once and forget the height, toasts ${refusals(why)} saved=${JSON.stringify(saved)}`);
    world.runResult = null; world.runs = []; S.advance(30000);
    if (!world.runs.some(([n, a]) => n === "layout.resize" && a.px === +h)) fails.push(`height: after a ${why} refusal ${h} should be retried in 30s`);
  }
  world.layout = null; world.runs = [];
}

fails.unshift(...errs.map((e) => `ERR panel: ${e}`));   // first: a swallowed render error matters most
const budget = g.budget.max + BUDGET_HEADROOM, over = snap.demo.counts.map((n, i) => [i + 1, n]).filter(([, n]) => n > budget);
for (const [i, n] of over) fails.push(`demo state ${i}: ${n} elements, budget ${budget}`);

console.log(`${nMoods} mood cases, ${Object.keys(snap.pins).length} pins, ${snap.demo.states.length} demo frames; largest render ${Math.max(...snap.demo.counts)} elements (budget ${budget}); ${ms}ms`);
if (fails.length) { console.error(`FAIL (${fails.length})\n` + fails.slice(0, 40).join("\n")); process.exit(1); }
console.log("PASS");
void walk;
