import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { run } from "herdr";
import { ink, SCREEN, r, txt, look, bot, spectator, explosion, DEV_W, DEV_H } from "./art.js";

// Sidebar version: a small grid of desks (one per agent) and the dev in the corner chair below,
// getting more worked up the more agents are working.
export function devLevel(list) {
  const working = list.filter((a) => a.status === "working").length;
  return !working ? 0 : working >= 4 || (working === list.length && working >= 2) ? 3 : working >= 2 ? 2 : 1;
}

function desk(a, x, y, sw, rh) {
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
    .when(rh >= 60, (e) => e.child(div().absolute().left(0).top(rh - 12).w(sw).flex().justify_center()
      .child(txt((a.tab_name ?? "").slice(0, 12), 10, a.focused ? "#fff8e1" : ink))));
}

export function panel(list, party = false, opts = {}) {
  const sw = 84, rh = 56, ds = 3;
  const ship = opts.ship ?? null;                     // null, or the explosion's stage (0, 1)
  const level = ship != null ? 3 : devLevel(list), panic = list.some((a) => a.status === "blocked");
  const working = list.filter((a) => a.status === "working").length;
  const devW = DEV_W * ds, devH = DEV_H * ds, cornerH = devH + 26;
  const glow = ["#ffb06a10", "#ffb06a22", "#ff8a6a30", "#ff5a5a44"][level];
  // Nothing here depends on the panel's measured size: flex does all the fitting,
  // so resizing the column never needs a re-render.
  return v_flex().id("saw-panel").size_full().overflow_hidden().bg("#e2a465")
    // header: click toggles the demo; in the demo it says which state you're looking at
    .child(h_flex().id("saw-head").h(opts.label ? 30 : 23).w_full().flex_none().px(8).gap(6).items_center().cursor_pointer()
      .bg(opts.label ? "#6b3f1f" : "#8796b0").border_b(3).border_color("#7a4a28")
      .when(!!opts.toggle, (e) => e.on_click((_e, cx) => opts.toggle(cx)))
      .child(txt(opts.label ?? `${working}/${list.length} AT IT`, opts.label ? 10 : 12, "#fff8e1"))
      .child(div().flex_1())
      .child(txt(opts.label ? "STOP" : "DEMO", 10, opts.label ? "#ffd86a" : "#dfe6f0")))
    .child(div().id("saw-desks").flex().flex_wrap().justify_center().content_start().flex_1().w_full().overflow_hidden().pt(6)
      .children(list.map((a) => desk(a, 0, 0, sw, rh))))
    .child(div().flex().justify_center().w_full().h(cornerH).flex_none().bg(glow)
      .child(div().relative().w(devW).h(cornerH)
        .child(r(-12, cornerH - 16, devW + 24, 10, "#5e1420"))
        .child(r(devW + 10, 16, 3, devH - 6, "#3a3a3a")).child(r(devW + 3, 4, 17, 13, "#d97a3a"))
        .child(spectator(level, ds, "pdev", { panic, party, ship: ship != null }).absolute().left(0).top(16))
        .when(ship != null, (e) => e.child(explosion(ship, devW / 2, cornerH / 2, `boom-${opts.shipKey ?? 0}`)))));
}
