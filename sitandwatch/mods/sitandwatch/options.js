// The Options dialog: this mod opened as an overlay with props { options: true }.
// `herdr-app do sitandwatch.options`, or OPTS in the panel header. Choices are saved in shared
// state ("sitandwatch.options"), which every copy of the mod reads, so the panel follows at once.
import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { shared, setShared, openOverlay, closeOverlay, props } from "herdr";
import { ink, txt, PETS } from "./art.js";
import { FLOORS, HEIGHTS, readOptions } from "./rules.js";

export const OPTIONS_KEY = "sitandwatch.options";
export const options = () => readOptions(shared(OPTIONS_KEY));
export function setOption(change) { setShared(OPTIONS_KEY, { ...options(), ...change }); }
export const openOptions = () => openOverlay({ mod: "sitandwatch", kind: "dialog", width: 380, height: 540, props: { options: true } });

const PANEL = "#2b2f3a", LABEL = "#9aa3b0", TEXT = "#fff8e1";

// A pill that's yellow when chosen.
function pill(id, label, on, onClick, swatch) {
  return h_flex().id(`opt-${id}`).h(22).px(6).gap(5).items_center().bg(on ? "#ffd86a" : "#4a5263").cursor_pointer()
    .on_click((_e, cx) => { onClick(); cx.notify(); })
    .when(!!swatch, (e) => e.child(div().size(10).bg(swatch).border(1).border_color(ink)))
    .child(txt(label, 10, on ? ink : TEXT));
}
const section = (title, note, items) => v_flex().gap(5)
  .child(txt(title, 12, TEXT))
  .when(!!note, (e) => e.child(txt(note, 10, LABEL)))
  .child(h_flex().flex_wrap().gap(4).children(items));

export function optionsDialog(handle) {
  const o = options();
  const close = () => closeOverlay(props().overlay);
  const onOff = (id, key, value) => [pill(`${id}-on`, "on", value, () => setOption({ [key]: true })), pill(`${id}-off`, "off", !value, () => setOption({ [key]: false }))];
  return v_flex().id("saw-options").track_focus(handle)
    .on_key_down((e, cx) => { if (e.key === "escape") { close(); cx.stop_propagation(); } })
    .size_full().p(16).gap(14).bg(PANEL)
    .child(h_flex().items_center().child(div().flex_1().child(txt("Sit & Watch options", 16, TEXT))).child(txt("Esc", 10, LABEL)))
    .child(section("Height", "The panel's height in the sidebar (or drag the line above it).",
      [pill("height-layout", "layout", !o.height, () => setOption({ height: null })),
        ...HEIGHTS.map((h) => pill(`height-${h}`, `${h}`, o.height === h, () => setOption({ height: h })))]))
    .child(section("Floor", "Behind the desks and the armchair.",
      Object.entries(FLOORS).map(([k, f]) => pill(`floor-${k}`, f.name, o.floor === k, () => setOption({ floor: k }), f.color))))
    .child(section("Pets", "Who lives in the corner (their coats: PETS in art.js).",
      PETS.map((p) => pill(`pet-${p.name}`, p.name, o.pets[p.name], () => setOption({ pets: { ...o.pets, [p.name]: !o.pets[p.name] } })))))
    .child(section("Speech bubbles", "What he says. Off: he still reacts, silently.", onOff("speech", "speech", o.speech)))
    .child(section("Chaos mode", "Lingering confetti and faster everything, for good.", onOff("chaos", "chaos", o.chaos)))
    .child(section("Developer mode", "The strip of numbers and buttons under the header.", onOff("dev", "dev", o.dev)))
    .child(div().flex_1())
    .child(h_flex().justify_end().child(h_flex().id("opt-done").h(26).px(14).items_center().bg("#ffd86a").cursor_pointer()
      .on_click(() => close()).child(txt("Done", 12, ink))));
}
