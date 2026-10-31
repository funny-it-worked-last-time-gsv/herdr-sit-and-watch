import { div, image, svg } from "gpui-kit";

// Pixel art for the office: sprites are rows of palette letters, "." is see-through.
export const PX = "PxPlus IBM VGA 8x16";
export const ink = "#3b2a1c";
export const WALL = 150;

export const r = (x, y, w, h, c) => div().absolute().left(x).top(y).w(w).h(h).bg(c);
export const icon = (p, s = 16) => p?.icon ? (p.tint ? svg(p.icon).text_color(p.color ?? ink) : image(p.icon)).size(s) : div().size(s);
export const txt = (s, size = 16, c = ink) => div().font_family(PX).text_size(size).line_height(`${size}px`).text_color(c).child(s);

export const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
export const rng = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
export const pick = (R, list) => list[Math.floor(R() * list.length)];

// One div per horizontal run of a colour.
export function sprite(rows, pal, s) {
  const out = [];
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length;) {
      let e = x;
      while (e < row.length && row[e] === row[x]) e++;
      if (pal[row[x]]) out.push(r(x * s, y * s, (e - x) * s, s, pal[row[x]]));
      x = e;
    }
  });
  return div().relative().w(rows[0].length * s).h(rows.length * s).children(out);
}

// ---- people ---------------------------------------------------------------

export const HAIR = ["#3a2618", "#c98b3c", "#151515", "#8a3b1f", "#e6c76a", "#5b5b66", "#d8d8d8", "#6b2fa0"];
export const SKIN = ["#f1c9a5", "#e0ac84", "#c68a5e", "#9a6440", "#6e4429", "#f5d7c0"];
export const SHIRT = ["#4f7dc9", "#c9504f", "#5aa064", "#d79a3a", "#8a62b8", "#3f9aa6", "#e07a9a", "#7a8a3a"];
export const STYLES = ["short", "long", "bun", "bald", "spiky"];
const KIND = { claude: "#d97757", codex: "#2f3640", gemini: "#4f7dc9", opencode: "#8a62b8", pi: "#e58fb6", grok: "#5b5b66", hermes: "#d79a3a", cursor: "#3f9aa6", copilot: "#24292f" };

// Everything random about a worker, fixed by their address so they look the same every render.
export function look(a) {
  const R = rng(hash(a.address));
  const kind = `${a.app ?? ""} ${a.program?.name ?? ""}`.toLowerCase();
  const shirt = Object.entries(KIND).find(([k]) => kind.includes(k))?.[1];
  return {
    hair: pick(R, HAIR), skin: pick(R, SKIN), style: pick(R, STYLES), glasses: R() < 0.3,
    shirt: shirt ?? pick(R, SHIRT), bob: 280 + Math.floor(R() * 220), book: pick(R, ["#7a2f2f", "#2f5a7a", "#3f6b3a", "#8a6a2a"]),
  };
}

const BACK = {
  short: ["................", ".....HHHHHH.....", "....HHHHHHHH....", "...HHHHHHHHHH...", "...HHHHHHHHHH...", "...SHHHHHHHHS...", "....HHHHHHHH....", ".....SSSSSS....."],
  long: ["................", ".....HHHHHH.....", "....HHHHHHHH....", "...HHHHHHHHHH...", "...HHHHHHHHHH...", "...HHHHHHHHHH...", "...HHHHHHHHHH...", "....HHHHHHHH...."],
  bun: ["......HHHH......", ".....HHHHHH.....", "....HHHHHHHH....", "...HHHHHHHHHH...", "...HHHHHHHHHH...", "...SHHHHHHHHS...", "....HHHHHHHH....", ".....SSSSSS....."],
  bald: ["................", ".....SSSSSS.....", "....SSSSSSSS....", "...SSSSSSSSSS...", "...HSSSSSSSSH...", "...SHHHHHHHHS...", "....HHHHHHHH....", ".....SSSSSS....."],
  spiky: ["....H.H.H.H.....", "....HHHHHHHH....", "...HHHHHHHHHH...", "...HHHHHHHHHH...", "...HHHHHHHHHH...", "...SHHHHHHHHS...", "....HHHHHHHH....", ".....SSSSSS....."],
};
const SEATED = ["..TTTTTTTTTTTT..", ".TTTTTTTTTTTTTT.", ".TTccccccccccTT.", ".STCCCCCCCCCCTS.", "..SCCCCCCCCCCS..", "...CCCCCCCCCC...", "...CCCCCCCCCC...", "...CCCCCCCCCC...", "...CCCCCCCCCC...", ".......KK.......", ".......KK.......", "....KKKKKKKK...."];
const FRONT = {
  short: ["...HHHHHH...", "..HHHHHHHH..", "..HSSSSSSH..", "..SSESSESS..", "..SSSSSSSS..", "...SSmmSS...", "....SSSS...."],
  long: ["...HHHHHH...", "..HHHHHHHH..", "..HSSSSSSH..", "..HSESSESH..", "..HSSSSSSH..", "..HSSmmSSH..", "..H.SSSS.H.."],
  bun: ["....HHHH....", "...HHHHHH...", "..HSSSSSSH..", "..SSESSESS..", "..SSSSSSSS..", "...SSmmSS...", "....SSSS...."],
  bald: ["...SSSSSS...", "..SSSSSSSS..", "..HSSSSSSH..", "..SSESSESS..", "..SSSSSSSS..", "...SSmmSS...", "....SSSS...."],
  spiky: ["..H.H.H.H...", "..HHHHHHHH..", "..HSSSSSSH..", "..SSESSESS..", "..SSSSSSSS..", "...SSmmSS...", "....SSSS...."],
};
const STAND = [".TTTTTTTTTT.", "TTTTTTTTTTTT", "STTTTTTTTTTS", "STTTTTTTTTTS", "S.TTTTTTTT.S", "..PPPPPPPP.."];

const palette = (lk) => ({ H: lk.hair, S: lk.skin, E: "#1b1b1b", m: "#a0522d", G: "#222222", T: lk.shirt, C: "#3d4454", c: "#525b6e", K: "#2b2f3a", P: "#3b4252" });

// Seated at the desk, seen from behind. 16×20 art pixels.
export function seated(lk, s, sleeping) {
  const pal = palette(lk);
  return div().relative().w(16 * s).h(20 * s)
    .child(sprite(SEATED, pal, s).absolute().left(0).top(8 * s))
    .child(sprite(BACK[lk.style], pal, s).absolute().left(0).top(sleeping ? 3 * s : 0));
}

// Standing, facing you ("front") or the wall ("back"), legs swinging while walking. 16×17.
export function standing(lk, s, facing, walking, item, id) {
  const pal = palette(lk);
  let head = facing === "front" ? FRONT[lk.style] : BACK[lk.style].map((row) => row.slice(2, 14));
  if (facing === "front" && lk.glasses) head = head.map((row, i) => (i === 3 ? row.slice(0, 2) + "SGEGGEGS" + row.slice(10) : row));
  const leg = (x, from, to) => {
    const el = r(2 * s + x * s, 13 * s, 2 * s, 4 * s, "#2b2f3a").id(`${id}-leg${x}`);
    return walking ? el.loop("height", { from: from * s, to: to * s, period: 360, easing: "linear" }) : el;
  };
  return div().relative().w(16 * s).h(17 * s)
    .child(leg(3, 4, 2)).child(leg(7, 2, 4))
    .child(sprite(STAND, pal, s).absolute().left(2 * s).top(7 * s))
    .child(sprite(head, pal, s).absolute().left(2 * s).top(0))
    .when(item === "cup", (e) => e.child(r(13 * s, 9 * s, 2 * s, 3 * s, "#f4f4f0")))
    .when(item === "book", (e) => e.child(r(12 * s, 8 * s, 3 * s, 4 * s, lk.book)));
}

const CAT = [".......O.O", ".......OOO", "O......OEO", "O..OOOOOOO", ".OOOOOOOO.", "..OOOOOOO.", "..O.O..O.O"];
export const CATS = ["#e0913a", "#5b5b66", "#2a2a2a", "#f4f0e6", "#a0704a"];
export const cat = (coat, s, left) => sprite(left ? CAT.map((row) => [...row].reverse().join("")) : CAT, { O: coat, E: "#7bd389" }, s);

// ---- the room -------------------------------------------------------------

function shelf(x, R) {
  const books = ["#7a2f2f", "#2f5a7a", "#3f6b3a", "#8a6a2a", "#5a3a7a", "#2f2f2f", "#a14a2a", "#c9a23a"];
  return r(x, 30, 70, 110, "#9c6436").border(3).border_color("#6b3f1f")
    .children([8, 38].map((y) => r(4, y, 56, 3, "#6b3f1f")))
    .children([0, 1].flatMap((row) => Array.from({ length: 7 }, (_, i) => {
      const tall = 16 + Math.floor(R() * 7);
      return R() < 0.12 ? null : r(5 + i * 8, row * 30 + 30 - tall + 6, 6, tall, pick(R, books));
    }).filter(Boolean)))
    .child(r(4, 70, 26, 30, "#b77a45").border(2).border_color("#6b3f1f"))
    .child(r(34, 70, 26, 30, "#b77a45").border(2).border_color("#6b3f1f"));
}

function clock(x, y, now) {
  // 48px face with hour marks; long black minute hand, short red hour hand.
  const face = r(x, y, 48, 48, "#f4f4f0").border(3).border_color("#5a5a66");
  const c = 19, marks = Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * 2 * Math.PI, big = i % 3 === 0, d = big ? 16 : 17, sz = big ? 4 : 2;
    return r(c + 1 + Math.round(Math.sin(a) * d) - sz / 2, c + 1 - Math.round(Math.cos(a) * d) - sz / 2, sz, sz, big ? "#333" : "#9a9aa6");
  });
  const hand = (turns, len, sz, col) => Array.from({ length: len }, (_, i) => {
    const a = turns * 2 * Math.PI;
    return r(c + Math.round(Math.sin(a) * (i + 1)), c + -Math.round(Math.cos(a) * (i + 1)), sz, sz, col);
  });
  const m = now.getMinutes(), h = (now.getHours() % 12) + m / 60;
  return face.children(marks).children(hand(h / 12, 9, 3, "#a8322a")).children(hand(m / 60, 14, 2, "#222")).child(r(c - 1, c - 1, 4, 4, "#222"));
}

function window_(x, hour) {
  const night = hour >= 19 || hour < 6, dusk = hour >= 17 && hour < 19;
  const sky = night ? "#1d2547" : dusk ? "#f2a65a" : "#8fd0f5";
  const el = r(x, 26, 90, 76, "#f4f4f0").border(4).border_color("#6b3f1f").child(r(2, 2, 78, 64, sky));
  if (dusk) el.child(r(2, 40, 78, 26, "#e0705a")).child(r(52, 30, 14, 10, "#ffd86a"));
  else if (night) el.child(r(56, 10, 10, 10, "#f4f0c8")).children([[12, 14], [30, 8], [22, 40], [44, 30], [66, 48]].map(([a, b]) => r(a, b, 2, 2, "#f4f0c8")));
  else el.child(r(10, 14, 26, 8, "#ffffff")).child(r(16, 10, 14, 6, "#ffffff")).child(r(52, 34, 20, 6, "#ffffff"));
  return el.child(r(40, 2, 4, 64, "#f4f4f0")).child(r(2, 32, 78, 4, "#f4f4f0"));
}

export function room(w, h, { seed, now, doorOpen }) {
  const R = rng(seed);
  const planks = [];
  for (let y = WALL + 14, row = 0; y < h; y += 22, row++) {
    planks.push(r(0, y, w, 2, "#c98a4f"));
    const off = Math.floor(R() * 80);
    for (let x = off - 80; x < w; x += 80) planks.push(r(x, y - 20, 2, 20, "#c98a4f"));
  }
  // a few knots and scuffs on the floor
  const knots = Array.from({ length: Math.floor(w * (h - WALL) / 40000) }, () => r(Math.floor(R() * w), WALL + 20 + Math.floor(R() * (h - WALL - 20)), 4, 2, "#cf9055"));
  const mid = Math.round(w / 2), hour = now.getHours();
  return [
    r(0, 0, w, WALL, "#c3cfe0"),
    r(0, 0, w, 6, "#9aa9bf"),
    r(0, 80, w, WALL - 80, "#8796b0"),
    r(0, 80, w, 4, "#6e7c96"),
    r(0, WALL - 10, w, 10, "#7a4a28"),
    r(0, WALL, w, h - WALL, "#e2a465"),
    ...planks, ...knots,
    // door: opens while someone arrives
    r(mid - 40, 22, 80, WALL - 22, "#6b3f1f"),
    doorOpen
      ? r(mid - 34, 28, 68, WALL - 28, "#2b1a10").child(r(0, 0, 14, WALL - 28, "#a8643a")).child(r(14, WALL - 40, 54, 12, "#c47d4a"))
      : r(mid - 34, 28, 68, WALL - 28, "#a8643a").child(r(10, 10, 48, 30, "#c47d4a").border(2).border_color("#7a4426")).child(r(56, 62, 6, 6, "#f0c860")),
    shelf(mid - 260, R), shelf(mid + 190, R),
    clock(mid - 165, 34, now),
    r(mid + 90, 36, 26, 32, "#fbfbf6").border(2).border_color("#9a9a9a").children([6, 12, 18, 24].map((y) => r(4, y, 8 + Math.floor(R() * 8), 2, "#777"))),
    window_(w - 340, hour),
    r(w - 200, 40, 50, 60, "#d9b25a").border(4).border_color("#6b3f1f")
      .child(r(0, 0, 42, 52, "#8fc6e8")).child(r(0, 28, 42, 24, "#5aa064")).child(r(18, 18, 6, 22, "#7a4a28")).child(r(12, 10, 18, 14, "#3f7a3a")),
    // water cooler
    r(w - 107, 56, 30, 34, "#7fb8e8").border(3).border_color("#4a86c0"),
    r(w - 112, 90, 40, 60, "#d8dce4").border(3).border_color("#8a90a0").child(r(10, 10, 12, 6, "#4a86c0")),
    // plant
    ...[[30, 0, 10, 60], [10, 14, 22, 12], [40, 8, 24, 12], [4, 34, 26, 12], [42, 30, 24, 12], [22, 24, 26, 10]]
      .map(([x, y, ww, hh]) => r(w - 100 + x, h - 136 + y, ww, hh, y % 2 ? "#4f8a3a" : "#3c7030")),
    r(w - 87, h - 70, 44, 36, "#b0563a").border(3).border_color("#7a3020"),
  ];
}

// ---- desks ----------------------------------------------------------------

export const SLOT_W = 170, SLOT_H = 190;
// Each space (project) gets a rug under its desks.
export const RUGS = [["#7d93b8", "#5c7298"], ["#8fae7c", "#6a8a58"], ["#c08a94", "#9a6470"], ["#9a88bd", "#76649a"], ["#6fa8a8", "#4f8686"], ["#b89a6a", "#94764a"]];

export const SCREEN = { working: "#1f4d3a", blocked: "#a8322a", done: "#24406e", idle: "#36404c", unknown: "#36404c" };

// Desk clutter, fixed per desk.
export function deskLook(i, seed) {
  const R = rng(hash(`desk${i}`) ^ seed);
  return {
    mug: pick(R, ["#c94a3a", "#f4f4f0", "#4a86c0", "#e6c76a", "#5aa064"]),
    lamp: pick(R, ["#2f6b4f", "#a8322a", "#2f5a7a", "#d79a3a"]),
    clutter: pick(R, ["papers", "plant", "photo", "duck", "none", "papers", "cactus"]),
    tower: R() < 0.5,
  };
}

export function clutter(kind, R2) {
  switch (kind) {
    case "papers": return [R2(124, 46, 18, 6, "#fbfbf6"), R2(126, 43, 16, 4, "#f0f0e6")];
    case "plant": return [R2(128, 42, 10, 10, "#b0563a"), R2(126, 32, 6, 10, "#4f8a3a"), R2(134, 30, 6, 12, "#3c7030")];
    case "cactus": return [R2(128, 44, 10, 8, "#d79a3a"), R2(131, 30, 4, 14, "#5aa064"), R2(127, 34, 4, 3, "#5aa064"), R2(135, 36, 4, 3, "#5aa064")];
    case "photo": return [R2(126, 36, 14, 14, "#6b3f1f"), R2(128, 38, 10, 10, "#8fc6e8"), R2(128, 44, 10, 4, "#5aa064")];
    case "duck": return [R2(128, 42, 10, 8, "#f0d040"), R2(134, 38, 6, 6, "#f0d040"), R2(140, 40, 3, 2, "#e07a2a")];
    default: return [];
  }
}

// ---- the dev in the corner chair ------------------------------------------
// Front view, 26×28 art pixels. level 0 (nothing running) to 3 (everyone working).
export const DEV_W = 26, DEV_H = 30;
const DEV = { hair: "#3a2618", skin: "#f1c9a5", shirt: "#6a6f7a", pants: "#2f3a5a", shoe: "#222222" };
const CHAIR = { a: "#8a1f2e", d: "#5e1420", l: "#a8323f", b: "#d9b25a", wood: "#4a2a14" };

// opts: { panic: an agent is blocked, party: an agent just finished, ship: something was pushed,
//   firstShip: it's the first push this session, mood: "normal" or one picked by resolveMood() in
//   panel.js, fx: ticks left of each one-shot { finishPump, blockedPhone, collapse, newAgentWelcome,
//   errorWince, burstDance }, provider: "claude" | "codex" | "mixed" | null, night: wear the
//   nightcap, name: the tab the mood is about (the long-blocked or the new desk) }.
// A bare boolean means panic.
export function spectator(level, s, id, opts) {
  const o = typeof opts === "object" && opts ? opts : { panic: !!opts };
  const { panic = false, party = false, ship = false, firstShip = false, mood = "normal", fx = {}, provider = null, night = false, name = "" } = o;
  const { finishPump = 0, blockedPhone = 0, collapse = 0 } = fx;
  const R = (x, y, w, h, c) => r(x * s, y * s, w * s, h * s, c);
  const depth = { glazed: 1, glazedHard: 2, slumped: 3 }[mood] ?? 0, gl = depth > 0;
  // mood narrowed to the pose actually drawn
  const mode = mood === "finish" ? "pump" : mood === "blocked" && blockedPhone ? "phone" : gl ? "glazed" : mood;
  const L = mode === "burst" ? 3
    : mode === "collapse" || mode === "error" ? 0
    : gl || mode === "multiBlocked" || mode === "pointAtBlocked" ? 1
    : panic ? Math.min(level, 1) : level;                // a blocked agent kills the mood
  const sad = panic && mode !== "collapse" && mode !== "burst";
  const pumpUp = mode === "pump" && finishPump >= 2;    // fist in the air for the first two ticks
  const phoneK = mode === "phone" ? 4 - blockedPhone : -1; // 0 phone out, 1 screen flashes, 2 still out, 3 gone
  const up = L === 3 ? 6 : mode === "pointAtBlocked" ? 2 : 0; // standing ovation, or half out of the chair to point
  const sk = DEV.skin, sh = DEV.shirt, dark = "#1b1b1b";
  const flavour = mode === "normal" && !sad && !party && !ship ? provider : null;

  // ---- head
  const face = ["...HHHHHH...", "..HHHHHHHH..", "..HSSSSSSH..", "..SSESSESS..", "..SSSSSSSS..", "...SSSSSS...", "....SSSS...."];
  const lid = (frac) => [4, 7].map((x) => r(x * s, 3 * s, s, Math.max(1, Math.round(frac * s)), "#d9a982"));
  const wide = (dx = 0, idp) => {  // eye whites with pupils dx pixels off centre
    const pupils = div().absolute().left(0).top(0).size_full().child(R(4 + dx, 3, 1, 1, dark)).child(R(7 + dx, 3, 1, 1, dark));
    if (idp) pupils.id(idp).loop("left", { from: -s, to: s, period: 1400 });
    return [R(3, 3, 2, 1, "#ffffff"), R(7, 3, 2, 1, "#ffffff"), pupils];
  };
  const mouth = mode === "collapse" && collapse === 1 ? [R(5, 5, 2, 1, "#a0522d"), R(7, 4, 1, 1, "#a0522d")] // satisfied half smile
    : mode === "error" ? [R(4, 5, 4, 1, "#4a1010"), R(5, 5, 2, 1, "#ffffff")]                                // grimace
    : sad ? [R(5, 5, 2, 1, "#4a1010"), R(4, 6, 1, 1, "#4a1010"), R(7, 6, 1, 1, "#4a1010")]
    : [R(5, 5, 2, L === 0 ? 1 : Math.max(1, L), L === 0 ? "#a0522d" : "#4a1010")];
  const headTop = -up + (L === 1 || L === 2 ? 1 : 0);
  const head = div().absolute().left(7 * s).top(headTop * s).w(12 * s).h(7 * s).id(`${id}-head-${L}-${mode}-${flavour}`)
    .child(sprite(face, { H: DEV.hair, S: sk, E: dark }, s))
    .children(mouth)
    .when(gl, (e) => e.children(lid(depth === 3 ? 0.75 : 0.5)))
    .when(mode === "collapse" && collapse === 2, (e) => e.children(lid(1)))
    .when(mode === "error", (e) => e.children(lid(1)).child(R(3, 2, 2, 1, DEV.hair)).child(R(7, 2, 2, 1, DEV.hair)))
    .when(mode === "howMany", (e) => e.children(wide(0, `${id}-look`)))
    .when(mode === "fourthWall", (e) => e.children(wide(0)).child(R(3, 1, 2, 1, DEV.hair)).child(R(7, 2, 2, 1, DEV.hair)))
    .when(flavour === "codex", (e) => e.children(wide(1)))                                        // side-eye
    .when(L >= 2 && !sad, (e) => e.child(R(2, 4, 2, 1, "#e07a7a")).child(R(8, 4, 2, 1, "#e07a7a")))
    // the escalating chair-reaction meme: brows creep up (1), eyes widen (2), eyes bulge and brows hit the hairline (3)
    .when(L === 1 && !sad && mode !== "fourthWall", (e) => e.child(R(3, 2, 2, 1, DEV.hair)).child(R(6, 2, 2, 1, DEV.hair)))
    .when(L === 2 && !sad, (e) => e.child(R(3, 1, 2, 1, DEV.hair)).child(R(6, 1, 2, 1, DEV.hair))
      .child(R(3, 3, 2, 1, "#ffffff")).child(R(6, 3, 2, 1, "#ffffff")).child(R(4, 3, 1, 1, dark)).child(R(6, 3, 1, 1, dark)))
    .when(L >= 3, (e) => e.child(R(3, 0, 2, 1, DEV.hair)).child(R(7, 0, 2, 1, DEV.hair))
      .child(R(2, 2, 3, 3, "#ffffff")).child(R(7, 2, 3, 3, "#ffffff")).child(R(3, 3, 1, 1, dark)).child(R(8, 3, 1, 1, dark))
      .child(R(4, 5, 4, 2, "#4a1010")))
    .when(night, (e) => e.child(R(2, -2, 8, 2, "#4f7dc9")).child(R(3, -3, 6, 1, "#4f7dc9")).child(R(2, 0, 8, 1, "#f4f4f0"))
      .child(R(9, -2, 2, 3, "#4f7dc9")).child(R(10, 1, 1, 1, "#ffffff")))                            // nightcap
    .when(sad, (e) => e.child(R(3, 4, 1, 2, "#7fc4ff").id(`${id}-tear`).loop("top", { from: 4 * s, to: 7 * s, period: 900, easing: "linear" })));
  if (L >= 3) head.loop("top", { from: (-up) * s, to: (-up - 2) * s, period: 300 });
  else if (mode === "multiBlocked") head.loop("left", { from: 5 * s, to: 9 * s, period: 300, easing: "linear" }); // which desk?!
  else if (mode === "welcome" || flavour === "claude") head.loop("top", { from: headTop * s, to: (headTop + 1) * s, period: mode === "welcome" ? 500 : 1600 }); // a nod

  // scarf: round the neck, the loose end flaps harder the busier it gets
  const calm = gl || mode === "error";
  const scarfEnd = R(15, 9 - up, 2, 4, "#c9302c").id(`${id}-scarf-${L}-${calm}`);
  if (L >= 1 && !calm) scarfEnd.loop("height", { from: 3 * s, to: 6 * s, period: [0, 1200, 500, 180][L], easing: "linear" });
  const scarf = [R(8, 7 - up, 10, 2, "#c9302c"), R(10, 7 - up, 2, 2, "#f4f4f0"), R(14, 7 - up, 2, 2, "#f4f4f0"), scarfEnd];

  const parts = [
    R(8, 7 - up, 10, 10, sh),                                            // torso
    R(9, 17 - up, 3, 7 + up, DEV.pants), R(14, 17 - up, 3, 7 + up, DEV.pants), // legs
    R(8, 24, 4, 2, DEV.shoe),
    R(14, 24, 4, 2, DEV.shoe).id(`${id}-foot-${L}-${calm}`).when(L >= 1 && !calm, (e) => e.loop("top", { from: 24 * s, to: 23 * s, period: [0, 900, 400, 160][L] })),
    head, ...scarf,
  ];

  // ---- popcorn on the lap, unless he's standing, it's spilled or his hands are busy
  const spilled = sad || mode === "error";
  const bucket = (x, y, h) => R(x, y, 6, h, "#f4f4f0").child(R(1, 0, 1, h, "#c9302c")).child(R(3, 0, 1, h, "#c9302c")).child(R(5, 0, 1, h, "#c9302c"));
  if (!spilled && L < 3 && mode !== "multiBlocked") {
    if (pumpUp) {
      // tipped right: the top half steps over a pixel and up, kernels fly further each tick
      const far = finishPump === 3 ? 0 : 4;
      parts.push(bucket(10, 16, 3), bucket(11, 14, 2), R(12, 13, 6, 1, "#fff2b0"),
        ...[[18, 11], [20, 9], [19, 13], [22, 11]].map(([x, y], i) => R(x + far + (i % 2) * far / 2, y - far / 2, 1, 1, "#fff6c8")));
    } else parts.push(bucket(10, 14, 5), R(10, 13, 6, 1, "#fff2b0"));
  }

  // ---- hands
  const handsUp = mode === "multiBlocked", onHead = mode === "error";
  if (handsUp) parts.push(R(4, -2, 3, 3, sk), R(4, 1, 2, 8, sh), R(19, -2, 3, 3, sk), R(20, 1, 2, 8, sh));
  else if (onHead) parts.push(R(5, 2, 2, 7, sh), R(5, 0, 3, 3, sk), R(19, 2, 2, 7, sh), R(18, 0, 3, 3, sk));
  else {
    // right hand: feeding (0-1), clapping (2), fist pump (3)
    if (pumpUp) parts.push(R(18, -4 - up, 3, 3, sk), R(18, -1 - up, 3, 8 + up, sh));   // fist in the air
    else if (L <= 1) {
      const feed = R(16, 14, 3, 5, sh).child(R(0, 3, 3, 2, sk)).id(`${id}-feed-${L}-${sad}-${mode}`);
      if (L === 1 && !sad && !gl && mode !== "pointAtBlocked")
        feed.loop("top", { from: 14 * s, to: 6 * s, period: mode === "fourthWall" ? 4000 : 2200 });
      parts.push(feed);
    }
    if (L === 2) {
      parts.push(R(6, 9, 3, 4, sh), R(17, 9, 3, 4, sh));
      parts.push(R(9, 11, 3, 3, sk).id(`${id}-clapL`).loop("left", { from: 8 * s, to: 11 * s, period: 260 }));
      parts.push(R(14, 11, 3, 3, sk).id(`${id}-clapR`).loop("left", { from: 15 * s, to: 12 * s, period: 260 }));
    }
    // left hand: the foam finger, with a word on it
    const phoneOut = phoneK >= 0 && phoneK <= 2;
    const finger = (L === 1 || L === 3 || mode === "welcome") && L !== 2 && !phoneOut;
    if (finger) {
      const word = mode === "pointAtBlocked" ? ["THAT"] : mode === "welcome" ? ["hi"] : party || ship ? ["LIVE"] : L === 3 ? ["SHIP", "LADS"] : ["ooh"];
      const fs = Math.max(6, Math.round(s * 8 / 3));
      const high = L === 3 || mode === "pointAtBlocked";
      const top = high ? -10 - up : -4;
      const foam = div().absolute().left(2 * s).top(top * s).w(6 * s).h(14 * s).id(`${id}-foam-${L}-${mode}`)
        .child(R(1, 0, 2, 5, "#e0b040")).child(R(0, 4, 6, 5, "#e0b040")).child(R(1, 5, 4, 1, "#c9302c"))
        .child(div().absolute().left(0).top(6 * s).w(6 * s).flex().justify_center()
          .child(txt(word[0], fs, "#7a2a10").id(`${id}-foamword-${word.join()}`).frames(word, 700)))
        .child(R(2, 9, 3, 5, sh));
      if (!gl && mode !== "pointAtBlocked")
        foam.loop("top", { from: top * s, to: (top - (high ? 4 : 2)) * s, period: mode === "burst" ? 150 : L === 3 ? 200 : 900 });
      parts.push(foam);
    } else if (L !== 2) {
      parts.push(R(5, 9, 3, 6, sh), R(4, 14, 4, 2, sk));                            // resting on the armrest
      // blocked: a phone in that hand, its screen lighting up once
      if (phoneOut) parts.push(R(5, 11, 2, 3, "#8a8f99").child(R(0.5, 0.5, 1, 2, phoneK === 1 ? "#ffffff" : "#2b2f3a")));
    }
    if (L === 3 && !pumpUp) parts.push(div().absolute().left(18 * s).top((-4 - up) * s).w(3 * s).h(10 * s).id(`${id}-pump-${mode}`)
      .child(R(0, 0, 3, 3, sk)).child(R(0, 3, 3, 7, sh)).loop("top", { from: (-4 - up) * s, to: (-8 - up) * s, period: mode === "burst" ? 150 : 240 }));
  }

  // ---- body: bob by level; glazed slides down over 3s; collapse lifts, drops, settles
  const body = div().absolute().left(0).top(0).w(DEV_W * s).h(DEV_H * s).id(`${id}-body-${L}-${sad}`).children(parts);
  if (gl) body.top((1 + depth) * s).transition("top", { duration: 3000, easing: "ease-in" });
  else if (mode === "collapse") body.top((collapse >= 4 ? -1 : collapse === 3 ? 1 : 0) * s);
  else if (L === 1 && !sad && mode !== "pointAtBlocked") body.loop("top", { from: 0, to: -s, period: 1400 });
  else if (L === 2) body.loop("top", { from: 0, to: -2 * s, period: 520 });
  else if (L === 3) body.loop("top", { from: 0, to: -3 * s, period: 240 });
  const shaker = div().absolute().left(0).top(0).w(DEV_W * s).h(DEV_H * s).id(`${id}-shake-${L}-${mode}`).child(body);
  if (L === 3) shaker.loop("left", { from: -s, to: s, period: 100, easing: "linear" });
  else if (mode === "error") shaker.loop("left", { from: -s / 2, to: s / 2, period: 120, easing: "linear" }); // wince

  const sweat = (x, period) => R(x, 2, 1, 2, "#7fc4ff").id(`${id}-sweat${x}-${L}`).loop("top", { from: 2 * s, to: 9 * s, period, easing: "linear" });
  const COLORS = ["#e05a8a", "#5ab0e0", "#e0c040", "#7ee0a0", "#c08ae0", "#f08a4a"];
  const confetti = (n, tag) => Array.from({ length: n }, (_, i) => R(1 + ((i * 7) % 24), -8, 1, 1, COLORS[i % COLORS.length])
    .id(`${id}-conf-${tag}-${i}`).loop("top", { from: (-10 - (i % 3) * 3) * s, to: (20 + (i % 4) * 2) * s, period: 900 + (i * 137) % 600, easing: "linear" }));

  // ---- speech
  const nm = (name ?? "").slice(0, 10);
  const levelLines = [["...", "zzz", "*yawn*"], ["ooh", "nice", "go on"], ["look at 'em go", "go on son!", "ooh yes"], ["SHIP IT!", "!!!", "MORE AGENTS", "YES LADS"]][L];
  const lines = ship ? (firstShip ? ["FIRST ONE!", "KABOOM!", "IT'S LIVE!"] : ["KABOOM!", "IT'S LIVE!", "LEGENDS"])
    : mode === "burst" ? ["they're flying!", "yes lads"]
    : mode === "error" ? ["oh no", "that's not good"]
    : mode === "collapse" ? [collapse >= 3 ? "ahh" : "job done"]
    : mode === "pump" ? ["GET IN!"]
    : mode === "multiBlocked" ? ["which one?!", "too many"]
    : mode === "pointAtBlocked" ? (nm ? ["THAT one", `${nm}!`] : ["THAT one"])
    : mode === "phone" ? [blockedPhone > 2 ? "they need me?!" : blockedPhone > 1 ? "noooo" : "on my way..."]
    : mode === "welcome" ? (nm ? ["welcome", `hi ${nm}`] : ["welcome"])
    : depth === 3 ? ["I have a life too", "zzz", "still going..."]
    : depth === 2 ? ["I have a life too", "hmm"]
    : gl ? ["still going...", "hmm", "you good?"]
    : sad ? ["wah wah", "they need me?!", "noooo"]
    : party ? ["POP!", "GET IN!", "SHIPPED!"]
    : mode === "fourthWall" ? ["you still watching?", "..."]
    : mode === "lateNight" ? ["still at it?", ...levelLines]
    : mode === "howMany" ? ["how many are there?", ...levelLines]
    : flavour === "mixed" ? [...levelLines, "the whole team's in"]
    : levelLines;
  const period = gl ? 8000 : mode === "fourthWall" || mode === "lateNight" || mode === "howMany" ? 3000
    : sad ? 1200 : party || ship || mode === "burst" || mode === "error" ? 600 : [2400, 1600, 900, 450][L];
  const red = (sad && mode !== "pointAtBlocked") || mode === "error";
  const say = div().absolute().left(16 * s).top((-9 - up) * s).px(4).py(2).bg("#ffffff").border(2).border_color(ink)
    .child(txt(lines[0], 12, red ? "#a8322a" : ink).id(`${id}-say-${L}-${mode}-${party}-${ship}-${lines.join("|")}`).frames(lines, period));

  const chair = () => div().relative().w(DEV_W * s).h(DEV_H * s)
    .child(R(2, 3, 22, 16, CHAIR.a).border(2).border_color(CHAIR.d))
    .children([[7, 6], [13, 6], [19, 6], [10, 10], [16, 10]].map(([x, y]) => R(x, y, 1, 1, CHAIR.b)))
    .child(R(0, 10, 5, 13, CHAIR.a).border(2).border_color(CHAIR.d)).child(R(21, 10, 5, 13, CHAIR.a).border(2).border_color(CHAIR.d))
    .child(R(0, 9, 5, 2, CHAIR.l)).child(R(21, 9, 5, 2, CHAIR.l))
    .child(R(4, 17, 18, 6, CHAIR.a)).child(R(4, 22, 18, 4, CHAIR.d))
    .child(R(1, 23, 2, 4, CHAIR.wood)).child(R(23, 23, 2, 4, CHAIR.wood)).child(R(5, 26, 2, 3, CHAIR.wood)).child(R(19, 26, 2, 3, CHAIR.wood));

  // Nothing happening: he's not there. Just the chair, a dent in the cushion and his popcorn.
  const present = L > 0 || panic || party || ship || ["collapse", "error", "welcome"].includes(mode);
  if (!present) return chair()
    .child(R(7, 17, 12, 1, CHAIR.d))
    .child(R(10, 14, 6, 5, "#f4f4f0").child(R(1, 0, 1, 5, "#c9302c")).child(R(3, 0, 1, 5, "#c9302c")).child(R(5, 0, 1, 5, "#c9302c")))
    .child(R(10, 13, 6, 1, "#fff2b0"));

  return chair()
    .when(depth >= 2, (e) => e.child(R(21, 7, 5, 2, "#dfe6f0")).child(R(22, 7, 3, 1, "#ffffff")))   // pillow on the armrest
    .when(mode === "collapse" && collapse === 3, (e) => e.child(R(4, 17, 18, 1, CHAIR.d)))            // the cushion gives
    .child(shaker)
    // spilled popcorn when an agent is blocked or one crashed
    .when(spilled, (e) => e.child(R(19, 26, 5, 3, "#f4f4f0")).child(R(20, 26, 1, 3, "#c9302c")).child(R(22, 26, 1, 3, "#c9302c"))
      .children([[14, 28], [16, 29], [24, 28], [12, 29], [26, 29]].map(([x, y]) => R(x, y, 1, 1, "#fff6c8"))))
    .when(L >= 2 || mode === "error", (e) => e.child(sweat(6, 900)).child(sweat(19, 1300)))
    .when(L >= 3, (e) => e.child(sweat(3, 600)).child(sweat(22, 700))
      .children([0, 1, 2].map((i) => R(8 + i * 4, 10, 1, 1, "#fff6c8").id(`${id}-pop${i}`).loop("top", { from: 12 * s, to: (-4 - i * 3) * s, period: 500 + i * 130 })))
      .children(confetti(8, "cheer")))
    .when(mode === "burst", (e) => e.children(confetti(14, "burst")))
    // party popper: an agent just finished
    .when(party && !sad, (e) => e.child(R(22, 12, 3, 4, "#e0b040").child(R(0, 0, 3, 1, "#c9302c")))
      .child(txt("*", 12, "#c9302c").absolute().left(24 * s).top(6 * s).id(`${id}-popper`).frames(["*", "\\*/", "*"], 200))
      .children(confetti(12, "party")))
    .child(say);
}

// ---- bots: the panel's workers, seen from behind like seated() ------------
// Plain rectangles, not sprite(): a sprite is one div per colour run, and a few dozen of those per
// desk made the sidebar's render run long enough for Herdr to cut it off.
export function bot(lk, s, sleeping, working, id) {
  const R = (x, y, w, h, c) => r(x * s, y * s, w * s, h * s, c);
  const t = sleeping ? 3 : 0;
  const tip = R(7.5, t, 1, 1, sleeping ? "#555" : working ? "#5ee08a" : "#e05a5a").id(`${id}-tip`);
  if (working) tip.loop("opacity", { from: 0.2, to: 1, period: 400 });
  return div().relative().w(16 * s).h(20 * s)
    .child(R(1, 8, 14, 3, lk.shirt))                                   // shoulders
    .child(R(3, 10, 10, 7, "#3d4454")).child(R(4, 11, 8, 1, "#525b6e")) // chair back
    .child(R(7, 17, 2, 2, "#2b2f3a")).child(R(4, 19, 8, 1, "#2b2f3a"))  // stem and base
    .child(R(4, 2 + t, 8, 5, "#9aa3b0")).child(R(4, 2 + t, 8, 1, "#c4ccd8")) // head
    .child(R(3, 4 + t, 1, 1, "#e0b040")).child(R(12, 4 + t, 1, 1, "#e0b040")) // ear bolts
    .child(R(5, 6 + t, 6, 1, "#6e7684")).child(R(6, 7 + t, 4, 1, "#5a606c")) // jaw, neck
    .child(R(7.75, 1 + t, 0.5, 1, "#5a606c"))
    .child(tip);
}

// ---- the ship explosion ---------------------------------------------------
// stage 0 draws everything squashed at (cx, cy); stage 1 draws it blown out. The same ids in both
// renders let transition() animate the change natively, so it plays once instead of looping.
const BOOM = ["#ffd86a", "#f08a4a", "#c9302c", "#fff8e1", "#3a3a3a", "#e05a8a"];
export function explosion(stage, cx, cy, id = "boom", big = false) {
  const out = stage >= 1, k = big ? 1.5 : 1, n = big ? 24 : 16;
  const tr = (e, ms, delay = 0) => ["left", "top", "width", "height"]
    .reduce((el, p) => el.transition(p, { duration: ms, delay, easing: "ease-out" }), e);
  const fade = (e, delay, ms = 600) => e.transition("opacity", { duration: ms, delay, easing: "ease-in" });
  // fireball: three nested squares that grow, then fade
  const ball = (size, c, i) => {
    const z = out ? Math.round(size * k) : 4;
    return fade(tr(r(cx - z / 2, cy - z / 2, z, z, c), 420 + i * 60), 700 + i * 120).opacity(out ? 0 : 1).id(`${id}-ball${i}`);
  };
  // debris: chunks flung outward in a ring, falling a little as they go
  const debris = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2, d = (90 + ((i * 37) % 60)) * k, z = 3 + (i % 3) * 2;
    const x = out ? cx + Math.cos(a) * d : cx, y = out ? cy + Math.sin(a) * d * 0.8 + 30 : cy;
    return fade(tr(r(x, y, z, z, BOOM[i % BOOM.length]), 900), 900, 700).opacity(out ? 0 : 1).id(`${id}-deb${i}`);
  });
  return div().absolute().left(0).top(0).size_full()
    // white flash over everything, gone in a blink
    .child(fade(r(-600, -1200, 2000, 2000, "#fff8e1"), 0, 350).opacity(out ? 0 : 0.85).id(`${id}-flash`))
    .child(ball(110, "#c9302c", 0)).child(ball(78, "#f08a4a", 1)).child(ball(44, "#ffd86a", 2))
    .children(debris)
    .child(fade(txt("KABOOM!", 16, "#c9302c").absolute().left(cx - 28).top(cy - 70), 1600, 500).opacity(out ? 0 : 1)
      .id(`${id}-word`));
}
