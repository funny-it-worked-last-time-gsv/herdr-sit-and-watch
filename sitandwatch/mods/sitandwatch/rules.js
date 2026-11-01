// Every decision about his mood and the one-shot events, in one place and with no imports, so
// main.js, panel.js and art.js ask here instead of each keeping its own copy of a rule.
// tools/check.mjs holds a golden snapshot of these decisions; change a rule on purpose and
// re-capture it (see RECIPE.md).

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
};
export const ONE_SHOTS = Object.keys(ONE_SHOT);
export const TAKES_OVER = ONE_SHOTS.filter((k) => ONE_SHOT[k].takesOver);
// Dev "fire" buttons: every one-shot, then the events that aren't one-shots.
export const DEV_FIRE = [...ONE_SHOTS.map((k) => ONE_SHOT[k].chip), "chaos", "pushed", "merged", "deployed"];
export const CHIP_KEY = Object.fromEntries(ONE_SHOTS.map((k) => [ONE_SHOT[k].chip, k]));

// Start a one-shot. Every start goes through here; a trigger that lasts a different time from
// the table passes its own ticks (the confetti still drifting after a party: 1).
export function startOneShot(m, key, ticks = ONE_SHOT[key].ticks) { m[key] = ticks; }

// ---- level and mood -------------------------------------------------------------
// How worked up he is: 0 nobody working, 1 one, 2 two or three, 3 four or more (or all of them).
export function devLevel(list) {
  const working = list.filter((a) => a.status === "working").length;
  return !working ? 0 : working >= 4 || (working === list.length && working >= 2) ? 3 : working >= 2 ? 2 : 1;
}

export const isNight = (h) => h >= 22 || h < 6;

// One dominant mood from everything the panel knows; first match wins. m comes from main.js
// (trackMetrics) or a demo state: counts, durations in ms, ticks left of each one-shot in m.fx.
export function resolveMood(m, level) {
  const fx = m.fx ?? {};
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
  const level = ship != null ? 3 : dev?.level ?? devLevel(list);
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
  else if (st.mood === "allBlocked") out.buddy = "paw";
  else if (st.spilled) out.buddy = "eat";
  else if (st.knock) out[knocker] = "knock";
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
export const DEFAULT_OPTIONS = { floor: "slate", pets: { Buddy: true, Snowy: true, Simba: true }, speech: true, chaos: false, dev: false };

// Whatever is stored, as a complete, valid options object (unknown or broken values fall back).
export function readOptions(raw) {
  const o = raw && typeof raw === "object" ? raw : {};
  const pets = o.pets && typeof o.pets === "object" ? o.pets : {};
  return {
    floor: FLOORS[o.floor] ? o.floor : DEFAULT_OPTIONS.floor,
    pets: Object.fromEntries(Object.keys(DEFAULT_OPTIONS.pets).map((k) => [k, pets[k] !== false])),
    speech: o.speech !== false,
    chaos: o.chaos === true,
    dev: o.dev === true,
  };
}
