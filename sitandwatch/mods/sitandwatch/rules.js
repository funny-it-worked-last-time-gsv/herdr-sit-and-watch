// Every decision about his mood and the one-shot events, in one place and with no imports, so
// main.js, panel.js and art.js ask here instead of each keeping its own copy of a rule.
// tools/check.mjs holds a golden snapshot of these decisions; change a rule on purpose and
// re-capture it (`node tools/check.mjs --capture`, see CLAUDE.md).

export const MIN = 60 * 1000;
export const LONG_IDLE = 10 * MIN;

// ---- one-shot events ------------------------------------------------------------
// A one-shot counts down in ticks of the 1s timer. One row per event, in dev-chip order:
// chip is its developer-mode button, ticks how long it lasts unless the trigger says otherwise,
// takesOver whether it beats a mood pinned in developer mode (the cosmetic ones don't).
export const ONE_SHOT = {
  finishPump: { chip: "finish", ticks: 3, takesOver: true },
  blockedPhone: { chip: "phone", ticks: 4, takesOver: true },
  areYouSure: { chip: "yes?", ticks: 4, takesOver: true },
  collapse: { chip: "collapse", ticks: 5, takesOver: true },
  burstDance: { chip: "burst", ticks: 6, takesOver: true },
  streak: { chip: "streak", ticks: 4, takesOver: true },
  errorWince: { chip: "error", ticks: 4, takesOver: true },
  newAgentWelcome: { chip: "welcome", ticks: 3, takesOver: true },
  levelUp: { chip: "levelUp", ticks: 2, takesOver: false },
  linger: { chip: "linger", ticks: 2, takesOver: false },
  poke: { chip: "poke", ticks: 2, takesOver: false },
  powerUp: { chip: "power", ticks: 4, takesOver: true },
  petPoke: { chip: "petPoke", ticks: 2, takesOver: false },   // a pet was clicked: its bubble
};
export const ONE_SHOTS = Object.keys(ONE_SHOT);
export const TAKES_OVER = ONE_SHOTS.filter((k) => ONE_SHOT[k].takesOver);
// Dev "fire" buttons: every one-shot, then the events that aren't one-shots.
export const DEV_FIRE = [...ONE_SHOTS.map((k) => ONE_SHOT[k].chip), "chaos", "pushed", "merged", "deployed", "canKnock", "subagent"];
export const CHIP_KEY = Object.fromEntries(ONE_SHOTS.map((k) => [ONE_SHOT[k].chip, k]));

// Start a one-shot. Every start goes through here; a trigger that lasts a different time from
// the table passes its own ticks (the confetti still drifting after a party: 1).
export function startOneShot(m, key, ticks = ONE_SHOT[key].ticks) { m[key] = ticks; }

// ---- level and mood -------------------------------------------------------------
// How worked up he is: 0 nobody working, 1 one, 2 two or three, 3 four or more (or all of them).
// Working agents and all agents, counting a desk's running sub-agents (a.subs, from foldSubs) as more of each.
export function headcount(list) {
  const extra = list.reduce((n, a) => n + (a.subs?.running ?? 0), 0);
  return { working: list.filter((a) => a.status === "working").length + extra, total: list.length + extra };
}
export function devLevel(list) {
  const { working, total } = headcount(list);
  return !working ? 0 : working >= 4 || (working === total && working >= 2) ? 3 : working >= 2 ? 2 : 1;
}

export const isNight = (h) => h >= 22 || h < 6;

// One dominant mood from everything the panel knows; first match wins. m comes from main.js
// (trackMetrics) or a demo state: counts, durations in ms, ticks left of each one-shot in m.fx.
export function resolveMood(m, level) {
  const fx = m.fx ?? {};
  if (fx.powerUp > 0) return "power";                    // the power bar filled: POWER!
  if (fx.burstDance > 0) return "burst";
  if (fx.streak > 0) return "streak";
  if (fx.errorWince > 0) return "error";
  if (fx.collapse > 0) return "collapse";
  if (fx.finishPump > 0) return "finish";
  if (m.blocked >= 2 && m.working === 0) return "allBlocked";
  if (m.blocked >= 2) return "multiBlocked";
  if (m.blocked >= 1 && m.longestBlockedMs > 2 * MIN) return "pointAtBlocked";
  if (fx.areYouSure > 0) return "areYouSure";
  if (fx.blockedPhone > 0 || m.blocked === 1) return "blocked";
  if (fx.newAgentWelcome > 0) return "welcome";
  if (m.longestWorkingMs > 60 * MIN) return "slumped";
  if (m.longestWorkingMs > 30 * MIN) return "glazedHard";
  if (m.longestWorkingMs > 10 * MIN) return "glazed";
  if (m.userIdleMs > 5 * MIN && m.working > 0) return "fourthWall";
  if (m.working === 0 && m.blocked === 0 && m.idleMs > LONG_IDLE) return "longIdle";
  if (level > 0 && isNight(m.hour)) return "lateNight";
  if (m.seen >= 10 && level > 0) return "howMany";
  return "normal";
}

// The level and mood actually shown. A ship explosion forces level 3 and the normal mood; in
// developer mode a pinned level wins, and a pinned mood wins unless a one-shot that takes over
// is running (fired or real).
export function effectiveMood(list, m, dev, ship) {
  const level = ship != null || (m?.fx?.powerUp ?? 0) > 0 ? 3 : dev?.level ?? devLevel(list);
  const busyOneShot = TAKES_OVER.some((k) => (m?.fx?.[k] ?? 0) > 0);
  const mood = ship != null || !m ? "normal" : dev?.mood && !busyOneShot ? dev.mood : resolveMood(m, level);
  return { level, mood };
}

// ---- the pets ---------------------------------------------------------------------
// One pose for each of Buddy (the beagle), Snowy (first cat) and Simba (second cat).
// st: { present (he's in the chair), ship (an explosion is running), mood, spilled (his popcorn
// is on the floor), knock (his can is due off the armrest), ovation (he's standing), night }.
// Whether a pet is there at all comes first: at night Simba is out, and Snowy does the knocking.
// Then the loudest thing wins: ship > meltdown > spill > knock > ovation > disappointed.
export function petPoses(st) {
  if (!st.present) return { buddy: "curl", snowy: "curl", simba: "curl" };
  const out = { buddy: "sit", snowy: "sit", simba: st.night ? "gone" : "sit" };
  // Simba out (night) or switched off in Options: Snowy knocks instead.
  const knocker = st.night || st.hide?.Simba ? "snowy" : "simba";
  if (st.ship) out.buddy = "howl";
  else if (st.mood === "power") { /* POWER!: all awake and staring at him */ }
  else if (st.mood === "allBlocked") out.buddy = "paw";
  else if (st.spilled) out.buddy = "eat";
  else if (st.knock) out[knocker] = st.pillow ? "knockBack" : "knock";   // the pillow has the armrest: up on the chair back
  else if (st.ovation) { out.snowy = "back"; if (out.simba !== "gone") out.simba = "back"; }
  return out;
}

// Developer mode's pet scenes: each forces the state that would show it.
export const PET_SCENES = {
  asleep: { present: false },
  sit: { present: true },
  ovation: { present: true, ovation: true },
  meltdown: { present: true, mood: "allBlocked" },
  ship: { present: true, ship: true },
  spill: { present: true, spilled: true },
  knock: { present: true, knock: true },
  night: { present: true, night: true },
};

// ---- options (the Options dialog; shared state "sitandwatch.options") ------------
// Floors: colours behind the desks and the corner. Slate is cool against his warm armchair and
// the orange and tan pets, so they stand out.
export const FLOORS = {
  slate: { name: "Slate", color: "#6b7a8f" },
  tan: { name: "Tan (classic)", color: "#e2a465" },
  teal: { name: "Deep teal", color: "#3e6668" },
  sage: { name: "Sage", color: "#95a88a" },
  navy: { name: "Night navy", color: "#2e3a55" },
};
// Panel heights the Options dialog offers (px); null leaves the block the size the layout gives it.
export const HEIGHTS = [240, 300, 400, 500];
export const DEFAULT_OPTIONS = { height: null, floor: "slate", pets: { Buddy: true, Snowy: true, Simba: true }, speech: true, chaos: false, dev: false };

// Whatever is stored, as a complete, valid options object (unknown or broken values fall back).
export function readOptions(raw) {
  const o = raw && typeof raw === "object" ? raw : {};
  const pets = o.pets && typeof o.pets === "object" ? o.pets : {};
  return {
    height: HEIGHTS.includes(o.height) ? o.height : null,
    floor: Object.hasOwn(FLOORS, o.floor) ? o.floor : DEFAULT_OPTIONS.floor,   // own keys only: not "toString"
    pets: Object.fromEntries(Object.keys(DEFAULT_OPTIONS.pets).map((k) => [k, pets[k] !== false])),
    speech: o.speech !== false,
    chaos: o.chaos === true,
    dev: o.dev === true,
  };
}

// ---- desks in last-active order, the old ones under cobwebs ------------------------
// lastActive: { [address]: ms } from main.js (now for an agent that's working or blocked, else when it
// entered its current status). Most recent first; ties keep their order, so busy desks stay put.
export function byLastActive(list, lastActive) {
  return list.map((a, i) => [a, i])
    .sort(([a, i], [b, j]) => (lastActive[b.address] ?? 0) - (lastActive[a.address] ?? 0) || i - j)
    .map(([a]) => a);
}
// How cobwebbed a desk is after this long without its agent working: 1 hour one web, 8 hours covered.
export const COBWEB_MS = [60 * MIN, 8 * 60 * MIN];
export const cobwebLevel = (idleMs) => (idleMs >= COBWEB_MS[1] ? 2 : idleMs >= COBWEB_MS[0] ? 1 : 0);
// Developer mode's desk ages: pretend every desk not working or blocked has been idle this long.
export const DESK_AGES = { "1h": COBWEB_MS[0], "8h": COBWEB_MS[1] };

// ---- the power bar: a session meter ---------------------------------------------
// Agent-seconds: each working agent adds one a second; with nothing working it drains a quarter a
// second. Full (20 agent-minutes) fires the powerUp one-shot and empties, unless something must
// play first (a ship explosion): then it waits, full. Shown in 20 steps; kept an hour across reloads.
export const POWER_FULL = 1200, POWER_STEPS = 20, POWER_DRAIN = 0.25, POWER_KEEP_MS = 60 * MIN;
export function powerStep(power, working, hold = false) {
  let p = Number.isFinite(power) ? power : 0;
  // Full already: held while a ship plays (no drain), then fires as soon as the hold ends, working or not.
  if (p >= POWER_FULL) return hold ? { power: POWER_FULL, fire: false } : { power: 0, fire: true };
  p = working > 0 ? p + working : Math.max(0, p - POWER_DRAIN);
  if (p < POWER_FULL) return { power: p, fire: false };
  return hold ? { power: POWER_FULL, fire: false } : { power: 0, fire: true };
}
export const powerShown = (power) => Math.floor((Math.min(Math.max(power, 0), POWER_FULL) / POWER_FULL) * POWER_STEPS);
// A saved meter, if it's a number and not stale.
export function loadPower(saved, savedAt, now) {
  const p = Number(saved), at = Number(savedAt);
  return Number.isFinite(p) && Number.isFinite(at) && now - at <= POWER_KEEP_MS ? Math.min(Math.max(p, 0), POWER_FULL) : 0;
}

// ---- minimise: shrink this panel's own layout block to a strip (in a column) or a rail (in a row) ----
export const MIN_STRIP = 30, MIN_RAIL = 40, MIN_OPEN = 139, MIN_GUARD_MS = 3000;
// This panel's block in a layout tree: blocks showing this mod as the panel (not its office, rail or
// pane views). ok, or why not: "none", "ambiguous" (two panels: which one is this?), "noid", or "min"
// (the block's own min is bigger than the strip). axis: the parent's direction, which resize follows.
export function findBlock(tree) {
  const found = [];
  const walk = (n, parent) => {
    if (!n || typeof n !== "object") return;
    const c = n.content;
    if (c?.mod === "sitandwatch" && (c.props?.role ?? "panel") === "panel") found.push({ n, parent });
    for (const k of n.children ?? []) walk(k, n);
  };
  walk(tree, null);
  if (!found.length) return { ok: false, reason: "none" };
  if (found.length > 1) return { ok: false, reason: "ambiguous" };
  const { n, parent } = found[0];
  if (!n.id) return { ok: false, reason: "noid" };
  const axis = parent?.type === "row" ? "row" : "column";
  const target = axis === "row" ? MIN_RAIL : MIN_STRIP;
  // too big a min stops minimising only; the height setting can still use the block (axis, size, min)
  if ((n.min ?? 0) > target) return { ok: false, reason: "min", id: n.id, min: n.min, axis, size: n.size ?? null };
  return { ok: true, id: n.id, axis, target, size: n.size ?? null };
}
// Minimised, and the block now reads big again (dragged open, another layout): show the full panel.
// Not in the first moments after shrinking, while Herdr catches up.
export const shouldClearMin = (sizePx, minAt, now) => now - minAt > MIN_GUARD_MS && Number.isFinite(sizePx) && sizePx >= MIN_OPEN;
// The height from Options, planned once a second. saved (localStorage "height"): { id, h, from } — the
// height last set on block id, and the size the block had before (to hand back on "layout"). first: this
// copy's first tick (a restart or a reload). Returns { resize: size | null, saved, warn: reason | null }.
// - "layout" after a chosen height: the block goes back to its size from before.
// - A new choice: set it (a layout min above the strip is fine, up to the height chosen).
// - The same choice: nothing, so a drag of the sidebar line stands; except on a first tick with the block
//   back at its size from before (Herdr restarted and the layout put it back): set it again.
const sameSize = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
export function planHeight({ height, saved, b, minimised, first }) {
  const keep = { resize: null, saved: saved ?? null, warn: null };
  if (minimised) return keep;
  const found = !!b && (b.ok || b.reason === "min");
  if (!height) {
    if (saved && found && b.id === saved.id && !sameSize(b.size, saved.from)) return { resize: saved.from ?? { weight: 1 }, saved: null, warn: null };
    return { resize: null, saved: null, warn: null };
  }
  if (!found) return { ...keep, warn: b?.reason ?? "none" };
  if (b.axis !== "column") return { ...keep, warn: "row" };
  if ((b.min ?? 0) > height) return { ...keep, warn: "small" };
  if (!saved || saved.id !== b.id || saved.h !== height) {
    const from = saved?.id === b.id ? saved.from : b.size ?? null;
    return { resize: b.size?.px === height ? null : { px: height }, saved: { id: b.id, h: height, from }, warn: null };
  }
  if (first && b.size?.px !== height && sameSize(b.size, saved.from)) return { ...keep, resize: { px: height } };
  return keep;
}
// A saved strip only comes back where it belongs: the same block on the same axis, still strip-sized
// (another layout reusing the id, or a Herdr restart that put the block back to full size, drop it).
// Forgotten only on positive evidence: a different block or axis, or a px size that's open; with no
// readable layout or no px size it's kept, and minCheck clears it later if the block reads open.
// A strip saved under MIN_GUARD_MS ago is kept too: Herdr may not have shrunk the block yet.
export function keepMin(min, b, now = Infinity) {
  if (!min || !b?.ok || now - (min.at ?? 0) <= MIN_GUARD_MS) return min ?? null;
  if (b.id !== min.id || b.axis !== min.axis) return null;
  return Number.isFinite(b.size?.px) && b.size.px >= MIN_OPEN ? null : min;
}
// The toasts for each reason minimising can't happen.
export const MIN_TROUBLE = {
  none: "Can't find my block in this layout",
  ambiguous: "Two Sit & Watch panels: give each block an id",
  noid: "Give my block an id in your layout",
  min: "Herdr won't shrink me: lower my block's min to 30",
  failed: "Herdr refused to resize me",
};
// And for the height setting (none, ambiguous and noid as above).
export const HEIGHT_TROUBLE = {
  none: MIN_TROUBLE.none, ambiguous: MIN_TROUBLE.ambiguous, noid: MIN_TROUBLE.noid,
  row: "Height only works in the sidebar: I'm docked in a row",
  small: "My block's min is bigger than that height",
  failed: "Herdr refused to set my height",
};

// ---- the can and the popcorn -----------------------------------------------------
// His can goes off the armrest once an agent has worked over 10 minutes with two or more at it (the
// can is only there from level 2); it stays down while that holds.
export const KNOCK_AFTER = 10 * MIN;
export const canKnock = (longestWorkingMs, level) => longestWorkingMs > KNOCK_AFTER && level >= 2;
// Spilled popcorn shrinks while Buddy eats it: 2 full (under 30s), 1 half (under 60s), 0 crumbs.
export const pileSize = (ticks) => (ticks < 30 ? 2 : ticks < 60 ? 1 : 0);
// How long a finished agent has waited for you, on its desk: "<1m", "12m", "3h", "2d".
// Agents waiting on you: { [address]: when it finished }. Set when one goes done, kept while it's
// done or idle (Herdr turns done into idle as soon as you look, but you haven't answered yet),
// cleared once it works or asks again, or leaves. atOf(a): when it entered done. keepMissing: also
// keep entries whose agent isn't listed (before the first hc poll background helpers aren't listed
// yet; they haven't left). Returns the new map.
export function trackWaiting(waiting, list, atOf, keepMissing = false) {
  const out = {};
  if (keepMissing) for (const [k, at] of Object.entries(waiting)) if (!list.some((a) => a.address === k)) out[k] = at;
  for (const a of list) {
    // the earlier of what's stored and when it entered done: hc's real time can arrive after a provisional one
    if (a.status === "done") out[a.address] = Math.min(waiting[a.address] ?? Infinity, atOf(a));
    else if (a.status === "idle" && waiting[a.address] != null) out[a.address] = waiting[a.address];
  }
  return out;
}
export function sinceLabel(ms) {
  const m = Math.floor(Math.max(0, ms) / MIN);
  if (m < 1) return "<1m";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`;
}

// ---- Claude Code sub-agents (the Agent tool) ----------------------------------------
// They run inside their session, not as Herdr terminals, so a Claude Code hook tells the panel
// (sitandwatch/hooks/sitandwatch-subagents.py): sub-start / sub-stop with the session's terminal and the
// sub-agent's id. subs: { [id]: { parent, at, doneAt } }. Each gets a desk after its parent's, working
// until it stops, done for a few seconds after (the finish), then gone; one never stopped goes after an hour.
export const SUB_DONE_MS = 8000, SUB_TTL_MS = 60 * MIN;
export function parseSubCommand(c) {
  const m = /^sub-(start|stop)-([A-Za-z0-9]+)-([A-Za-z0-9]+)$/.exec(c ?? "");
  return m ? { verb: m[1], parent: m[2], id: m[3] } : null;
}
// A parent's sub-agents are one batch: kept while any is running, then all dropped SUB_DONE_MS after
// the last one stopped (so the badge counts up to 5/5 before it goes). One never stopped is dropped
// after SUB_TTL_MS. Returns the kept subs.
export function pruneSubs(subs, now) {
  const live = (s) => !s.doneAt && now - s.at < SUB_TTL_MS, batch = {};
  for (const s of Object.values(subs)) {
    const b = (batch[s.parent] ??= { running: false, last: 0 });
    if (live(s)) b.running = true;
    if (s.doneAt) b.last = Math.max(b.last, s.doneAt);
  }
  return Object.fromEntries(Object.entries(subs).filter(([, s]) => (s.doneAt ? batch[s.parent].running || now - batch[s.parent].last < SUB_DONE_MS : live(s))));
}
// The sub-agents as agents (working, or done once stopped), so the welcome, the finish, the power bar
// and his metrics see them like any agent. Their address is `<parent>~<id>`; foldSubs puts them back.
// Only those whose session has a desk: one whose parent isn't listed (closed, or a terminal id that
// doesn't match) counts for nothing until it shows up or is dropped.
export function subDesks(subs, list) {
  return Object.entries(subs).filter(([, s]) => list.some((a) => a.address === s.parent)).map(([id, s]) => {
    const parent = list.find((a) => a.address === s.parent);
    return { address: `${s.parent}~${id.slice(0, 8)}`, status: s.doneAt ? "done" : "working", parent: s.parent, sub: true,
      tab_name: parent?.tab_name ?? "sub", app: parent?.app ?? null, program: parent?.program ?? null, focused: false };
  });
}
// For drawing: no desk of their own. Each parent's desk gets subs: { done, total, running } (the 2/5
// badge); sub-agents whose parent has no desk are left out.
export function foldSubs(list) {
  const subs = list.filter((a) => a.sub);
  return list.filter((a) => !a.sub).map((a) => {
    const mine = subs.filter((s) => s.parent === a.address);
    if (!mine.length) return a;
    const done = mine.filter((s) => s.status === "done").length;
    return { ...a, subs: { done, total: mine.length, running: mine.length - done } };
  });
}
// A desk address for a mark: a sub-agent's is its parent's.
export const deskOf = (addr) => (addr == null ? addr : String(addr).split("~")[0]);
