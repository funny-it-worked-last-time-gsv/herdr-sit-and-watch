import { div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { run } from "herdr";
import { ink, SCREEN, r, txt, look, bot, spectator, stance, pets, explosion, miniFace, DEV_W, DEV_H } from "./art.js";
import { DEV_FIRE, effectiveMood, isNight, petPoses, PET_SCENES, FLOORS, cobwebLevel, DESK_AGES, POWER_FULL, POWER_STEPS, powerShown } from "./rules.js";
import { options, openOptions } from "./options.js";

// ---- developer mode -------------------------------------------------------
// `herdr-app do sitandwatch.dev` shows a strip under the header: the numbers the mood is picked
// from, and buttons to force a level, pin a lasting mood or fire any one-shot event.
const DEV_MOODS = ["auto", "normal", "glazed", "glazedHard", "slumped", "multiBlocked", "pointAtBlocked", "allBlocked",
  "fourthWall", "longIdle", "lateNight", "howMany"];

function chip(label, on, onClick, key) {
  return div().id(`dev-${key}`).px(3).bg(on ? "#ffd86a" : "#4a5263").cursor_pointer()
    .on_click((_e, cx) => onClick(cx)).child(txt(label, 10, on ? ink : "#fff8e1"));
}

function devStrip(dev, mood, level, m, power = 0) {
  const min = (ms) => `${Math.floor((ms ?? 0) / 60000)}m`;
  const live = Object.entries(m?.fx ?? {}).filter(([, v]) => v > 0).map(([k, v]) => `${k} ${v}`).join("  ");
  const row = (chips) => h_flex().flex_wrap().gap(3).children(chips);
  return v_flex().id("saw-devstrip").w_full().flex_none().px(6).py(4).gap(3).bg("#2b2f3a")
    .child(h_flex().gap(6).child(txt(`${mood}  L${level}  ${m?.working ?? 0} working  ${m?.blocked ?? 0} blocked`, 10, "#7ee0a0"))
      .child(div().flex_1()).child(chip(dev.open ? "hide" : "buttons", false, (cx) => dev.onOpen(cx), "open")))
    .child(txt(`longest work ${min(m?.longestWorkingMs)}  blocked ${min(m?.longestBlockedMs)}  quiet ${min(m?.idleMs)}`, 10, "#9aa3b0"))
    .child(txt(`you away ${min(m?.userIdleMs)}  seen ${m?.seen ?? 0}  power ${Math.round(power)}/${POWER_FULL}  ${m?.chaos ? "CHAOS" : ""}`, 10, "#9aa3b0"))
    .when(!!dev.block, (e) => e.child(txt(`min ${dev.min}  block ${dev.block}`, 10, "#9aa3b0")))
    .when(!!live, (e) => e.child(txt(live, 10, "#ffd86a")))
    .when(dev.open, (e) => e.child(row([txt("level", 10, "#9aa3b0"), chip("real", dev.level == null, (cx) => dev.onLevel(null, cx), "lv-real"),
      ...[0, 1, 2, 3].map((n) => chip(String(n), dev.level === n, (cx) => dev.onLevel(n, cx), `lv-${n}`))]))
    .child(row([txt("mood", 10, "#9aa3b0"), ...DEV_MOODS.map((k) => chip(k, (dev.mood ?? "auto") === k, (cx) => dev.onMood(k === "auto" ? null : k, cx), `md-${k}`))]))
    .child(row([txt("fire", 10, "#9aa3b0"), ...DEV_FIRE.map((k) => chip(k, false, (cx) => dev.onFire(k, cx), `fx-${k}`))]))
    .child(row([txt("pets", 10, "#9aa3b0"), ...["auto", ...Object.keys(PET_SCENES)].map((k) =>
      chip(k, (dev.pets ?? "auto") === k, (cx) => dev.onPets(k === "auto" ? null : k, cx), `pt-${k}`)),
      chip("wander", false, (cx) => dev.onWander(cx), "pt-wander")]))
    .child(row([txt("desks", 10, "#9aa3b0"), ...["real", ...Object.keys(DESK_AGES)].map((k) =>
      chip(k, (dev.desks ?? "real") === k, (cx) => dev.onDesks?.(k === "real" ? null : k, cx), `dk-${k}`))])));
}


// Sidebar version: a small grid of desks (one per agent) and the dev in the corner chair below,
// getting more worked up the more agents are working. The level and mood come from rules.js.

// Which agents are in: "claude" or "codex" when they're most of them, "mixed" for two or more kinds.
function provider(list) {
  const kinds = list.map((a) => a.program?.key ?? a.app ?? null).filter(Boolean)
    .map((k) => (/claude/.test(k) ? "claude" : /codex/.test(k) ? "codex" : k));
  if (!kinds.length) return null;
  const n = (k) => kinds.filter((x) => x === k).length;
  if (n("claude") > kinds.length / 2) return "claude";
  if (n("codex") > kinds.length / 2) return "codex";
  return new Set(kinds).size >= 2 ? "mixed" : null;
}

// The colour of whoever's doing most of the working, for tinting his scarf and finger.
function dominantTint(list) {
  const counts = {};
  for (const a of list.filter((a) => a.status === "working")) { const c = look(a).shirt; counts[c] = (counts[c] ?? 0) + 1; }
  return Object.entries(counts).sort((x, y) => y[1] - x[1])[0]?.[0] ?? null;
}

// A bouncing arrow beside a desk's monitor: red for "THAT one", green for a new desk, gold for a streak.
function arrow(sw, kind, addr) {
  const c = kind === "welcome" ? "#3fa86a" : kind === "streak" ? "#e0b040" : "#c9302c", x = Math.round(sw / 2) - 28;
  return div().absolute().left(x).top(8).w(6).h(6).id(`pa-${addr}-${kind}`)
    .child(r(0, 0, 2, 6, c)).child(r(2, 1, 2, 4, c)).child(r(4, 2, 2, 2, c))
    .loop("left", { from: x - 3, to: x, period: 400 });
}

// Cobwebs on a desk left alone: 1, a web in the monitor's top-left corner; 2, covered: webs on both
// corners and under the desk, and a dusty screen. One tinted svg each (cheap for Herdr's render).
const WEB = "#e6e9ef";
const web = (x, y, size, right, id) => div().absolute().left(x).top(y).id(id)
  .child(svg(`mods/sitandwatch/${right ? "cobweb-r" : "cobweb"}.svg`).size(size).text_color(WEB));
function cobwebs(sw, level, addr) {
  if (!level) return [];
  const mx = Math.round(sw / 2) - 16;                        // monitor's left edge
  const out = [web(mx - 1, 3, 13, false, `pw-${addr}-1`)];
  if (level >= 2) out.push(
    r(mx + 2, 6, 28, 16, "#c8ccd477").id(`pw-${addr}-dust`),   // dust on the screen
    web(mx + 20, 3, 13, true, `pw-${addr}-2`),
    web(Math.round(sw / 2) + 14, 37, 11, false, `pw-${addr}-3`));
  return out;
}

function desk(a, x, y, sw, rh, mark = null, idleMs = 0) {
  const scr = r(Math.round(sw / 2) - 16, 4, 32, 20, "#2b2f3a").child(r(2, 2, 28, 16, SCREEN[a.status] ?? SCREEN.idle)
    .when(a.status === "working", (e) => e.children([0, 1, 2].map((i) => r(4, 4 + i * 4, 6, 2, "#7ee0a0")
      .id(`pc-${a.address}-${i}`).loop("width", { from: 4, to: 20 - i * 4, period: 500 + i * 230 }))))
    .when(a.status === "blocked", (e) => e.child(txt("!", 12, "#fff8e1").absolute().left(11).top(2).id(`pb-${a.address}`).loop("opacity", { from: 0.2, to: 1, period: 600 }))));
  const body = bot(look(a), 1.5, a.status === "done", a.status === "working", `pb-${a.address}`).id(`ps-${a.address}`);
  if (a.status === "working") body.loop("top", { from: 0, to: -1, period: 320 });
  if (a.status === "blocked") body.loop("top", { from: 0, to: -5, period: 600 });
  return div().id(`pd-${a.address}`).relative().flex_none().w(sw).h(rh).cursor_pointer()
    .on_click(() => run("agent.focus", { terminal: a.address }))
    .child(scr)
    .child(r(Math.round(sw / 2) - 3, 24, 6, 3, "#2b2f3a"))
    .child(r(Math.round(sw / 2) - 26, 27, 52, 6, "#f0dcb0")).child(r(Math.round(sw / 2) - 26, 33, 52, 4, "#d4b27c"))
    .child(div().absolute().left(Math.round(sw / 2) - 12).top(28).child(body))
    .children(cobwebs(sw, cobwebLevel(idleMs), a.address))
    .when(!!mark && mark !== "areYouSure", (e) => e.child(arrow(sw, mark, a.address)))
    // the meme: the agent asks, he answers from the chair
    .when(mark === "areYouSure", (e) => e.child(div().absolute().left(0).top(0).w(sw).flex().justify_center()
      .child(div().px(3).bg("#ffffff").border(1).border_color(ink).child(txt("Are you sure?", 10, ink)))))
    .when(rh >= 60, (e) => e.child(div().absolute().left(0).top(rh - 12).w(sw).flex().justify_center()
      .child(txt((a.tab_name ?? "").slice(0, 12), 10, a.focused ? "#fff8e1" : ink))));
}

// The minimise button: its own mouse-down and click, so the header's demo toggle never fires.
function minButton(label, onMin) {
  return div().id("saw-min").px(3).cursor_pointer()
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .on_click((_e, cx) => { cx.stop_propagation(); onMin(cx); })
    .child(txt(label, 10, "#fff8e1"));
}
const powerBar = (power, vertical) => {
  const n = Math.round((40 * powerShown(power)) / POWER_STEPS);
  return vertical
    ? div().id("saw-power").w(8).h(42).flex_none().bg("#2b2f3a").border(1).border_color("#7a4a28").child(r(0, 40 - n, 6, n, "#ffd86a").id("saw-power-fill"))
    : div().id("saw-power").w(42).h(8).flex_none().bg("#2b2f3a").border(1).border_color("#7a4a28").child(r(0, 0, n, 6, "#ffd86a").id("saw-power-fill"));
};
// Minimised: a strip (in a column: 30px tall) or a rail (in a row: 40px wide) with the count, the
// power bar, his face and the button to bring the panel back.
function minimised(axis, list, level, mood, sad, opts) {
  const working = list.filter((a) => a.status === "working").length;
  const face = miniFace(level, mood, sad, 2);
  if (axis === "row") return v_flex().id("saw-rail").size_full().overflow_hidden().bg("#8796b0").py(6).gap(6).items_center()
    .child(face).child(txt(`${working}`, 10, "#fff8e1")).child(powerBar(opts.power ?? 0, true)).child(div().flex_1()).child(minButton("+", opts.onMin));
  return h_flex().id("saw-strip").size_full().overflow_hidden().bg("#8796b0").px(8).gap(6).items_center()
    .child(txt(`${working}/${list.length} AT IT`, 12, "#fff8e1")).child(div().flex_1())
    .child(powerBar(opts.power ?? 0, false)).child(face).child(minButton("+", opts.onMin));
}

export function panel(list, party = false, opts = {}) {
  const sw = 84, rh = 56, ds = 3;
  const ship = opts.ship ?? null;                     // null, or the explosion's stage (0, 1)
  const m = opts.m ?? null;
  const dev = opts.dev ?? null;
  const { level, mood } = effectiveMood(list, m, dev, ship);
  const panic = list.some((a) => a.status === "blocked");
  if (opts.min) return minimised(opts.min, list, level, mood, panic && mood !== "power", opts);
  const working = list.filter((a) => a.status === "working").length;
  const devW = DEV_W * ds, devH = DEV_H * ds, cornerH = devH + 26;
  const markAddr = mood === "pointAtBlocked" ? m.longestBlockedAddr : mood === "welcome" ? m.welcomeAddr
    : mood === "streak" ? m.streakAddr : mood === "areYouSure" ? m.aysAddr : null;
  const name = list.find((a) => a.address === markAddr)?.tab_name ?? "";
  const levelUp = (m?.fx?.levelUp ?? 0) > 0;          // a warm flash on reaching level 3
  const glow = levelUp ? "#ffd27a77" : ["#ffb06a10", "#ffb06a22", "#ff8a6a30", "#ff5a5a44"][level];
  const o = options();
  // Everything spectator() draws him from; pets() reads whether he's in the chair from the same.
  const him = {
    speech: o.speech,
    panic, party, ship: ship != null, firstShip: !!opts.firstShip, mood, fx: m?.fx, name,
    provider: provider(list), night: isNight(m?.hour ?? new Date().getHours()) || mood === "lateNight",
    seed: m?.seed ?? 0, chaos: !!m?.chaos || (m?.working ?? 0) >= 6, tint: dominantTint(list),
    linger: (m?.fx?.linger ?? 0) > 0, poke: m?.fx?.poke ?? 0, pokeLine: m?.pokeLine ?? "",
    idleTalk: m?.idleTalk ?? Math.floor(Date.now() / 30000) % 6 === 0, idleN: Math.floor(Date.now() / 180000),
  };
  // The pets react to what he's doing; developer mode can force a scene; Options can send one away.
  const st = stance(level, him);
  const hide = Object.fromEntries(Object.entries(o.pets).map(([k, on]) => [k, !on]));
  const real = { present: st.present, ship: ship != null, mood, spilled: st.spilled, knock: !!opts.knock, pillow: st.depth >= 2, ovation: st.L === 3, night: him.night };
  const poses = petPoses({ ...(dev?.pets ? PET_SCENES[dev.pets] : real), hide });
  for (const [k, name] of [["buddy", "Buddy"], ["snowy", "Snowy"], ["simba", "Simba"]]) if (hide[name]) poses[k] = "gone";
  // The knock plays in two stages once it's actually drawn (main.js starts the second); tell main.js what
  // was drawn: whether a cat is knocking, and whether his popcorn is on the floor (the pile shrinks).
  const knocking = [poses.snowy, poses.simba].some((p) => p === "knock" || p === "knockBack");
  const canDown = knocking && (opts.canStage === 1 || dev?.pets === "knock");
  opts.onDrawn?.({ knocking, spilled: st.spilled, poses });
  const petMore = { onPet: opts.onPet, poke: (m?.fx?.petPoke ?? 0) > 0 ? opts.petPoke : null, canDown, pile: opts.pile ?? 2 };
  // Nothing here depends on the panel's measured size: flex does all the fitting,
  // so resizing the column never needs a re-render.
  return v_flex().id("saw-panel").size_full().overflow_hidden().bg(FLOORS[o.floor].color)
    // header: click toggles the demo; in the demo it says which state you're looking at
    .child(h_flex().id("saw-head").h(opts.label ? 30 : 23).w_full().flex_none().px(8).gap(6).items_center().cursor_pointer()
      .bg(opts.label ? "#6b3f1f" : "#8796b0").border_b(3).border_color("#7a4a28")
      .when(!!opts.toggle, (e) => e.on_click((_e, cx) => opts.toggle(cx)))
      .child(txt(opts.label ?? `${working}/${list.length} AT IT`, opts.label ? 10 : 12, "#fff8e1"))
      .child(div().flex_1())
      // the power bar: fills with working-agent seconds, POWER! when full
      .child(powerBar(opts.power ?? 0, false))
      // the Options dialog; its own click, so it doesn't start the demo
      .child(div().id("saw-opts").px(3).cursor_pointer()
        .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
        .on_click((_e, cx) => { cx.stop_propagation(); openOptions(); })
        .child(txt("OPTS", 10, "#dfe6f0")))
      .child(txt(opts.label ? "STOP" : "DEMO", 10, opts.label ? "#ffd86a" : "#dfe6f0"))
      .when(!!opts.onMin, (e) => e.child(minButton("_", opts.onMin))))
    .when(!!dev, (e) => e.child(devStrip(dev, mood, level, m, opts.power ?? 0)))
    .child(div().id("saw-desks").flex().flex_wrap().justify_center().content_start().flex_1().w_full().overflow_hidden().pt(6)
      .children(list.map((a) => desk(a, 0, 0, sw, rh, a.address === markAddr ? mood : null, opts.idle?.[a.address] ?? 0))))
    .child(div().flex().justify_center().w_full().h(cornerH).flex_none().bg(glow)
      .child(div().relative().w(devW).h(cornerH)
        .child(r(-12, cornerH - 16, devW + 24, 10, "#5e1420"))
        .child(r(devW + 10, 16, 3, devH - 6, "#3a3a3a")).child(r(devW + 3, 4, 17, 13, "#d97a3a"))
        .child(spectator(level, ds, "pdev", { ...him, canDown, pile: opts.pile ?? 2 }).absolute().left(0).top(16))
        // clicking him: on top of his drawing, so the pixels can't swallow it
        .child(div().id("saw-dev").absolute().left(0).top(16).w(devW).h(devH).cursor_pointer()
          .when(!!opts.onDev, (e) => e.on_click((_e, cx) => opts.onDev(cx))))
        // Buddy, Snowy and Simba: asleep on the chair when he's not in it, else reacting to him; above his
        // click target, so a pet asleep on the chair can be clicked too
        .children(pets(poses, cornerH, ds, "pet", opts.walk ?? {}, petMore))
        .when(ship != null, (e) => e.child(explosion(ship, devW / 2, cornerH / 2, `boom-${opts.shipKey ?? 0}`, !!opts.firstShip, opts.banner)))));
}
