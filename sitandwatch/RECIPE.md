# Sit & Watch

A pixel-art sidebar panel for the Herdr app. Every agent is a little robot at a desk, and below
them a developer sits in a red velvet armchair in the corner, watching them work. The more agents
are working, the more worked up he gets: from an empty chair when nothing is running, through
popcorn and a foam finger, to a standing ovation with confetti. He sobs when an agent needs you and
sets off a party popper when one finishes.

![Sit & Watch](preview.png)

## What you see

One mod, `sitandwatch`, drawn as a narrow panel (made for a sidebar about 260–560px wide). Pixel text
is `PxPlus IBM VGA 8x16` (shipped in `mods/sitandwatch/fonts/`). Nothing is rounded. The panel is a
flex column, top to bottom, on the floor colour from Options (`FLOORS` in `rules.js`: slate
`#6b7a8f` by default; tan `#e2a465`, deep teal `#3e6668`, sage `#95a88a`, night navy `#2e3a55`):

1. **Header**, 23px, `#8796b0` with a 3px `#7a4a28` bottom border: `N/M AT IT` (12px, `#fff8e1`,
   working agents over all agents, running sub-agents counted in both) on the left, then a gap, the
   42×8 power bar (`#2b2f3a`, 1px `#7a4a28` frame, `#ffd86a` fill), `OPTS`, `DEMO` (10px, `#dfe6f0`)
   and `_` (minimise). In the demo it grows to 30px, turns `#6b3f1f` and reads
   `DEMO i/27  <state>` (10px) with `STOP` in `#ffd86a`. Developer mode adds its strip below.
2. **Desks**, filling the remaining height, `overflow_hidden`, 6px top padding: one 84×68 tile per
   agent (68px tall to fit its name) in a centred wrapping row, in last-active order. A tile holds a 32×20 `#2b2f3a`
   monitor (28×16 screen), a 6×3 stand, a 52px desk (`#f0dcb0` top 6px, `#d4b27c` front 4px, one
   element) and a robot at scale 1.5 seen from behind, with its name under the chair (10px,
   `deskName()`). On top, when they apply: the waiting time on a finished agent's screen (`12m`),
   cobwebs on an old desk, and a `2/5` sub-agent tag by the monitor.
   - Screen colours: working `#1f4d3a` with three `#7ee0a0` 2px code lines growing and shrinking;
     blocked `#a8322a` with a blinking `!`; done `#24406e`; idle `#36404c`.
   - **Robot**, 16×20 art pixels, about 12 plain rectangles: shoulders in the agent's colour
     (`claude #d97757`, `codex #2f3640`, `gemini #4f7dc9`, ... otherwise a random shirt colour
     fixed by the address), a `#3d4454` chair back, `#2b2f3a` stem and base, a `#9aa3b0` head with
     a `#c4ccd8` top edge, `#e0b040` ear bolts, a `#6e7684` jaw, a `#5a606c` neck and antenna. The
     antenna tip is green `#5ee08a` and blinking while working, red `#e05a5a` otherwise, grey when
     done (head lowered 3px).
3. **Corner**, `devH + 26`px tall, background a glow that warms with the level (`#ffb06a10`,
   `#ffb06a22`, `#ff8a6a30`, `#ff5a5a44`). Centred in it: a 10px `#5e1420` rug, a floor lamp
   (3px `#3a3a3a` pole, 17×13 `#d97a3a` shade) and the **developer in the armchair**, 26×30 art
   pixels at scale 3, 16px from the top.
   - **Armchair**: back `#8a1f2e` with a 2px `#5e1420` border and five `#d9b25a` buttons, arms with
     `#a8323f` tops, seat, `#4a2a14` legs.
   - **Developer**, front view: brown hair `#3a2618`, skin `#f1c9a5`, grey `#6a6f7a` shirt, navy
     `#2f3a5a` trousers, black shoes, a red-and-white `#c9302c`/`#f4f4f0` scarf round his neck, a
     striped popcorn bucket on his lap. A speech bubble (white, 2px `#3b2a1c` border, 12px text, in a 38-art-pixel frame, 116px at the sidebar's scale: long lines wrap there, short ones shrink to fit)
     sits above his right shoulder.
   - **The pets** (see Pets below): Buddy left of the chair, Snowy and Simba right of it, or all
     three curled on the empty chair.
4. **Minimised**, the whole panel is a 30px strip (`N/M AT IT`, power bar, his face, `+`) or, docked
   left or right, a 40px rail (face, count, vertical bar, `+`).

## How it behaves

The **level** comes from how many agents are working: 0 none, 1 one, 2 two or three, 3 four or
more (or every agent, with at least two). The reactions stack:

| Level | He does | He says |
| --- | --- | --- |
| 0 | Nothing: the chair is empty and the pets have it (curled up), his popcorn on the floor. | |
| 1 | Bobs slowly, feeds himself popcorn, waves a yellow foam finger, taps a foot, eyebrows creep up, scarf flaps. | `ooh`, `nice`, `go on` |
| 2 | Leans in clapping, eyes wide, brows high, cheeks flushed, sweat drops, bounces. | `look at 'em go`, `go on son!`, `ooh yes` |
| 3 | Standing ovation out of the chair: eyes bulging, jaw dropped, head thrown back, foam finger and fist pumping, popcorn flying, confetti, shaking. | `SHIP IT!`, `!!!`, `MORE AGENTS`, `YES LADS` |

The faces at levels 1–3 follow the escalating chair-reaction meme: brows creeping up, eyes
widening, eyes bulging with the head thrown back.

- **An agent finishes** (working → done): a party popper and a burst of confetti for 3s, `POP!`,
  `GET IN!`, `SHIPPED!`.
- **Something ships** (`herdr-app do sitandwatch.ship`, sent by the Claude Code hook in `hooks/`
  after `git push`, `gh pr merge` or a production `vercel` deploy): a full explosion for about 2.6s.
  A white flash, a fireball of three growing squares (`#c9302c`, `#f08a4a`, `#ffd86a`), 16 bits of
  debris flung outward and a `KABOOM!` caption. He jumps to a standing ovation: `KABOOM!`,
  `IT'S LIVE!`, `LEGENDS`.
### Moods

On top of the level, `resolveMood(m, level)` in `rules.js` picks one dominant mood, first match
wins, and `spectator()` draws that one pose and speech set. `m` comes from `trackMetrics()` in
`main.js` (or a demo state):

| Mood | When | He does | Says |
| --- | --- | --- | --- |
| `power` | the power bar filled (`powerUp`, 4 ticks; see The power bar) | level 3 stand, never sad, the pets all staring | `POWER!`, `FULL POWER` |
| `burst` | 3 finishes within 60s (6 ticks) | level 3 pose, both arms pumping at 150ms, 14 more confetti | `they're flying!`, `yes lads` |
| `streak` | the same agent's 3rd finish within 10 min (4 ticks) | level 3 pose, extra confetti, gold arrow at that desk | streak pool |
| `error` | an agent we showed exited with code > 0 (4 ticks) | hands on head, eyes squeezed, grimace, sweat, popcorn spilled, small shake | `oh no`, `that's not good` |
| `collapse` | 2+ working dropped to none (5 ticks) | see below | `ahh`, `job done` |
| `finish` | working to done (3 ticks) | the fist pump below | `GET IN!` |
| `prOpened` | `sitandwatch.pr-<n>` or `pr` from the ship hook (4 ticks) | seated; a scorecard on a stick in his left hand (`PR` and `#<n>`, bobbing), clear of the bubble | `PR #<n>!`, then the pr pool |
| `pushOff` | `sitandwatch.push` from the ship hook (3 ticks) | seated; right arm out, a paper plane flying up and right off it; `GO` on the foam finger | push pool |
| `allBlocked` | 2+ blocked and none working | face down (hair over the face), two tears, popcorn all over the rug | meltdown pool |
| `multiBlocked` | 2+ blocked | both hands up, head whipping left and right | `which one?!`, `too many` |
| `pointAtBlocked` | one blocked 2+ min | half out of the chair, foam finger up reading `THAT`, red arrow at that desk | `THAT one`, `<tab>!` |
| `areYouSure` | every 3rd newly blocked agent, instead of the phone (4 ticks) | calm, seated; `Are you sure?` bubble over that desk | `Yes` |
| `blocked` | one blocked | the phone, then the blocked pose below | |
| `welcome` | a new desk (3 ticks; not in the first 15s) | a nod, `hi` on the finger, green arrow at the new desk | `welcome`, `hi <tab>` |
| `slumped` / `glazedHard` / `glazed` | longest working 60 / 30 / 10+ min | glazed, below; pillow from 30, lids lower at 60 | `I have a life too`, `hmm`, `still going...` |
| `fourthWall` | agents working, no focus change or header click for 5 min | wide eyes, one brow up, eating slowly | `you still watching?` |
| `longIdle` | nothing working or blocked for 10 min | back in the chair asleep: lids shut, chin down, a still `z Z` | an idle line for 30s in every 3 min, else silent |
| `lateNight` | 10pm to 6am, someone working | level pose | `still at it?` |
| `howMany` | 10+ agents seen since the panel started | eyes darting | `how many are there?` |
| `normal` | otherwise | level pose | level lines |

- **Lines** live in `lines.js`, one pool per state (levels 1 to 3, finish, blocked, ship, streak,
  meltdown, idle, poke; and the pets' `cat`, `beagle`, `asleep`). `pool(name, seed)` shuffles a pool with the session's seed and puts the
  original line first, and `frames()` cycles it natively. The pixel font has no curly quotes.
- **Chaos** at level 3 when 6+ are working, or always after `herdr-app do sitandwatch.chaos`
  (an option, kept in Herdr's shared state; see Options): 12 more confetti at 1.8× the period, lines every 500ms, a bigger
  head throw.
- **Can** on the right armrest from level 2. **Tint**: the scarf and foam finger stripe move 35%
  toward the shirt colour of whoever has the most working agents.
- **Level-up**: reaching level 3 warms the corner glow for 2 ticks. **Linger**: 3 confetti bits
  drift for a second after the party popper ends.
- **Click him**: 2 ticks of a line from the poke pool, his head turned a pixel. A click counts as you
  being around. A transparent target sits on top of the drawing so the pixels can't swallow it.
- **Nightcap** (blue with a white bobble) whenever it's 10pm to 6am and he's in the chair.
- **Provider flavour**, in the `normal` mood only, from `program.key` (or hc's `agent`): more than
  half Claude, a slow nod; more than half Codex, a side-eye; two or more kinds, `the whole team's in`
  joins the lines.
- **Ship**: 24 bits of debris (32 and 1.5× for the first of the session, with `FIRST ONE!`), and a
  banner that fades after 2s. The hook sends `sitandwatch.ship-merged` (gh pr merge),
  `ship-deployed` (vercel) or `ship-pushed` (git push), shown as `PR MERGED`, `DEPLOYED`, `IT'S LIVE`.
- **Where the numbers come from**: Herdr's agent list has no start times or errors. Every 10s the
  panel runs `hc ls --all --json` (finished terminals carry `exit_code`) and `hc get <t> --json` for
  each working or blocked one (`status_ms` is when it entered that status, so durations survive a
  reload). Until hc has answered, it uses the time it saw the status change itself. Context use isn't
  reported anywhere, so there's no "getting full" mood.

### One-shot details

- **An agent finishes** also gives a fist pump for 3 ticks: right fist up for two, the popcorn
  bucket tipped right (the top half stepped a pixel over) with kernels flying further each tick,
  `GET IN!`, and `LIVE` on the foam finger.
- **An agent becomes blocked**: a 4-tick phone call. A grey 2×3 phone in his left hand, its screen
  flashing white on the second tick, gone on the last. `they need me?!`, `noooo`, `on my way...`.
  It plays once per newly blocked agent, then the plain blocked pose below takes over.
- **Glazed**: he calms to the level 1 pose with every loop stopped, half-closed eyes, the body
  sliding down over 3s (2px, 3px, 4px for the three depths). Lines change every 8s.
- **Two or more agents were working and now none are** (collapse): 5 ticks. A 1px lift, the drop
  back into the chair with the cushion giving, eyes shut for a tick, a half smile. `ahh`, `job done`.
  Then the empty chair.
- **Foam finger** words: `ooh` at level 1, `SHIP`/`LADS` at level 3, `LIVE` during a party or ship,
  `THAT` and `hi` for their moods.
  Level 2 has no finger (he's clapping).
- **An agent is blocked**: the mood drops to at most level 1, a sad mouth, a tear, the popcorn
  spilled on the floor, `wah wah`, `they need me?!`, `noooo`.
- **Clicking a desk** focuses that agent (`agent.focus`).
- **Demo**: clicking the header, or `herdr-app do sitandwatch.demo`, plays `STORY` in `main.js` on a
  loop (`demoMode: "story"`): 11 captioned scenes, each a `DEMO_STATES`-style row plus its length in
  ms (about 52s in all): quiet (the empty chair), work starts, another joins (welcome), sub-agents
  spawn (0/2), ramping up (0/5), sub-agents finish (2/5, fist pump), all done (5/5, burst), shipped (PR
  MERGED, one still working so he stays), winding down, dozing, asleep. `sceneAt()` picks the scene.
  Each fake desk takes the tab, space, program and title of the real agent at that place, so it is
  named like the live panel (screenshot mode included), else `bot N`. Again (`demo`) to stop.
- **The tour**: `demo-<n>` (`demoMode: "tour"`) opens the 27 labelled `DEMO_STATES`, 5s each: the three
  levels, finished, blocked, shipped, one per mood, the empty chair, then power, cobwebs and
  sub-agents (1-based; out of range is ignored). The GIFs in `media/` were recorded from it:
  `demo-<n>`, then `herdr-app shot` about ten times a second for 4.5s, each frame cropped to the panel.
- **Busy desks**: a working screen shows two lines of 8px text cycling with `frames()`, tool names
  (`#7ec8e3`) over details (`#7ee0a0`), from `logFrames()` rotated per desk (texture, not real output).
  `talker()` gives one working desk at a time a 7s turn, shown for the first 3.5s, a bubble
  (`psay-<address>`, white, 1px ink border, 10px) over its monitor saying `sayText()`: its terminal
  title without the status glyph (through `tabLabel`, so screenshot mode renames it), up to 20
  characters cut at a word, or a made-up task from `DEMO_TASKS`. The 1s timer re-renders when a turn
  starts or ends.
- **Developer mode**: `herdr-app do sitandwatch.dev` (remembered) shows a strip under the header with
  the mood, level, counts and durations it's picked from, and the live one-shots. Its `buttons` chip
  opens rows to force a level, pin a mood (one-shots still take over while they run) or fire any
  one-shot as the real event would. Commands do the same: `level-<0..3|real>`, `mood-<name|auto>`,
  `fire-<event>`.
- Every motion is a native `loop` or `frames`; nothing animates when nothing is happening.
- No keys and no hovers: it takes no keys, so there is no `keys.json` to merge.

## Built from

- `mods/sitandwatch/mod.json`: `{ "place": "none", "size": 300, "title": "Sit & Watch" }`. Herdr doesn't
  dock it; the install puts it in the bottom-left corner unless the person asks otherwise: a block
  `{ "id": "sitandwatch", "type": "block", "content": { "mod": "sitandwatch" }, "size": { "px": 300 } }`
  in the layout's `sidebar` column, just before `sidebar-footer` (clone a shipped layout first).
- `mods/sitandwatch/panel.js`: the panel (`panel(list, party, opts)`), desks, the dev strip, the strip and rail.
- `mods/sitandwatch/rules.js`: every decision, no imports: `devLevel`, `resolveMood`, `effectiveMood`, the
  `ONE_SHOT` table and `startOneShot`, `petPoses`, options, the power meter, desk order and cobwebs,
  `findBlock` for minimise, `planHeight` for the height option, the waiting times (`trackWaiting`), the
  sub-agents (`parseSubCommand`, `pruneSubs`, `subDesks`, `foldSubs`), the can and the popcorn.
- `mods/sitandwatch/options.js`: the Options dialog.
- `mods/sitandwatch/lines.js`: what he and the pets say, `pool()` and `pickLine()`.
- `mods/sitandwatch/names.js` and `privacy.js`: every drawn name, through screenshot mode's renames.
- `mods/sitandwatch/art.js`: sprites as rows of palette letters (`sprite(rows, palette, s)` draws one
  `div` per colour run), `bot()` from plain rectangles, `spectator(level, s, id, { panic, party, ship, mood, fx, ... })`,
  `explosion()`.
- `mods/sitandwatch/main.js`: one view, its job picked by `props().role`: `panel` (the default), or
  `office`, `rail` and `pane` for a full-width office layout like the one it is based on (the
  office draws the same developer in the bottom-left corner).
- The list is `agents()` plus background helpers (`hc run --bg`), which are not in `agents()`:
  `hc(["ls", "--all", "--json"])` every 10s in a `cx.spawn`, live terminals with a status, merged by
  address. The same poll finds crashes and asks `hc get` for status times. A 1s timer advances the
  demo, ends the party and counts down the one-shots.
- Commands through `nextCommand()`: `demo`, `demo-<n>`, `dev`, `chaos`, `options`, `min`, `wander`,
  `ship` and `ship-<kind>`, `fire-<event>`, `mood-<name|auto>`, `level-<n|real>`, `pets-<scene|auto>`,
  `desks-<1h|8h|real>`, `height-<px|layout>`, and `sub-start-<terminal>-<id>` / `sub-stop-...` from the sub-agent hook. Calls `agents()`,
  `hc` (`ls`, `get`), `run("agent.focus")`, `layout()` and `run("layout.resize")` (minimise and height),
  `notify()`, and `shared`/`setShared`/`openOverlay` for Options.
  No network, no `exec`, no files outside its folder.
- Based on [zuccs/herdr-office-layout](https://github.com/zuccs/herdr-office-layout) (MIT): its
  `art.js` helpers, palette, font and office view.

## Pets

- `PETS` in `art.js`: `{ name, kind, coat }`, Buddy (beagle: `B #7a4a24` brown, `T #d9a25a` tan,
  `W #f4f0e6` white, `K #2a2320` nose and eyes), Snowy (cat, white `#f4f0e6`) and Simba (cat,
  orange `#e0913a` / `#b86a24`), inner ears `#f2b8c0`. Recolour the coats to make them
  look like your own pets; the names are also ids (Options, `petPoses`, `HOME`/`EXIT`), so a rename touches all of them.
- Drawn as rows of palette letters (`POSE` in `art.js`) at the corner's scale 3, packed by
  `blocks()`/`pack()` into a few layered rectangles (cached), so a pet costs a handful of divs.
  Cat: `sit` 10×12 and `back` 11×12 (the tail sticks out past the 9-wide body), `curl` 12×6 (knocks use `sit` raised onto the armrest or chair back).
  Beagle: `sit`, `paw`, `howl` 12×13, `eat` 14×6, `curl` 16×6. Curled and eating pets get a 1px
  outline so they read against the chair and the floor.
- Placement (`HOME`): Buddy at -44, Snowy at 100, Simba at 132 (x from the chair's left), feet on
  the rug; curled on the empty chair: Snowy on the back, Buddy on the seat, Simba on the armrest.
- `petPoses()` in `rules.js`, the loudest moment wins:

  | When | Buddy | Snowy | Simba |
  | --- | --- | --- | --- |
  | Empty chair | curl (seat) | curl (back) | curl (armrest) |
  | Something ships | howl (`AWOO`) | sit | sit |
  | POWER! | sit, awake | sit, awake | sit, awake |
  | Meltdown (all blocked) | paw over eyes | sit | sit |
  | Popcorn spilled | eat | sit | sit |
  | Can knock (10+ min at level 2+) | sit | sit | knock (back, once the pillow's there) |
  | Standing ovation | sit | back | back |
  | After 10pm | as above | knocks instead of Simba | gone |
  | Otherwise | sit | sit | sit |

  A pet switched off in Options is not drawn (Snowy knocks if Simba is off).

## Pets wandering

- `wanderTick(cx, force)` in `main.js`, on the 1s timer: each pet has its own clock (next trip in
  3-7 min, away 25-75s), and only while an agent is working or blocked; otherwise they're home
  (asleep on the chair), so nothing moves when nothing is happening.
- Two-stage, like `boom()`: phase `out0` draws the pet at its spot with id `pet-<name>-walk`, 60ms
  later `out1` at the edge (Buddy -120, cats 210) and `transition("left", 1800ms)` slides it; `away`
  draws nothing; `in0`/`in1` slide it back; `home` hands back to the normal `pet-<name>-sit`. A
  `loop("top")` bob on an inner div makes the steps. Each trip has a key so a stale timer can't
  move a pet that's already on its next trip.
- Only a pet sitting or with its back turned wanders; a reaction (howl, paw, eat, knock) keeps it put.
- Dev: `wander` in the pets row, or `herdr-app do sitandwatch.wander`, sends them all off now.

## The can, the popcorn, clicking a pet

- The can: `canKnock(longestWorkingMs, level)` (over 10 min, level 2+) makes `petPoses` give the knocker
  (Simba; Snowy at night or with Simba off) `knock` on the right armrest, or `knockBack` on the chair back
  once the pillow has the armrest (glazed 30 min+). `panel()` reports what it drew (`onDrawn`); the 1s
  tick starts the push only once a knocking cat is drawn: `canStage` 0 (paw on the can), 800ms later 1
  (the can on the floor, `pet-can-down`, and gone from the armrest). A louder pose (POWER!, a ship, the
  meltdown, the spill) hides the knock and resets it; it replays after.
- The popcorn: while his popcorn is spilled (`stance().spilled`), `spillTicks` counts up; `pileSize()` is
  2 under 30 ticks, 1 under 60, then 0. Both his spill under the chair and Buddy's kernels shrink.
- Clicking a pet: each pet has its own click (after his poke target, so a pet asleep on the chair can
  be clicked; it stops propagation). `pokePet()`: the `petPoke` one-shot (2 ticks) and `m.petSay`
  `{ name, line }`, a line from `lines.js` `cat` / `beagle`, or `asleep` while it's curled up; a bubble
  `"<name>: <line>"` over the pet. Dev: the `petPoke` and `canKnock` (20s) fire chips.

## The power bar

- Header, between the count and OPTS: a 42x8 frame (`#2b2f3a`, 1px `#7a4a28`) with a `#ffd86a` fill in
  20 steps (`powerShown()`).
- `m.power` in agent-seconds, 0..1200 (`POWER_FULL`). `powerTick()` on the 1s timer: only the copy whose
  token is the `OWNER` in localStorage counts (a stale copy after a reload would count twice), from
  `agents()` plus background helpers (not the list on screen: the demo shows fakes). `powerStep()`:
  +1 per working agent, -0.25 with nothing working, never below 0; at 1200 it fires the `powerUp`
  one-shot (4 ticks, takes over) and empties, unless a ship explosion is playing: then it waits, full.
- `powerUp`: mood `power` (first in `resolveMood`), level 3, his level-3 stand, "POWER!", never sad;
  the pets all sit staring (just below a ship in `petPoses`).
- Saved to localStorage (`power`, `powerAt`) on each step change; `loadPower()` ignores it after an hour.
- Dev: `power N/1200` in the strip; the `power` fire chip (or `herdr-app do sitandwatch.fire-power`).
  Demo: the bar follows each state's level; state 25 "Power full: POWER!".

## Minimise

- `_` at the right of the header (own `on_mouse_down` and `on_click`, both `stop_propagation`, so the
  header's demo toggle never fires), or `herdr-app do sitandwatch.min`. Handled by the copy clicked; one
  action per 1s tick (`minBusy`), so a double click is one.
- `findBlock(layout())` in `rules.js`: the blocks whose content is this mod as the panel (`props.role`
  absent or `"panel"`, not office/rail/pane). None, two ("which one?"), no `id`, or a `min` over the target:
  a `notify()` toast each (`MIN_TROUBLE`), no resize. The parent's type picks the axis: a column gives a
  30px strip, a row a 40px rail. `run("layout.resize", { id, px })`; the old `size` (`{px}` or `{weight}`)
  is kept in localStorage `min` and restored on `+`. A resize that comes back `{ error }` toasts and undoes
  the flag.
- Checked in Herdr 0.1.11: `layout.resize` shrinks the block; the layout file keeps its configured size,
  but `layout()` at run time reports the new one. So once a second while minimised, `minCheck()` notes what
  `layout()` says after a 3s guard, and if it later reads >= 139px (dragged open, another layout) the full
  panel comes back. A `layout()` that keeps reporting the configured size never clears it.
- Strip: count, power bar, `miniFace()` (his 12x7 face at scale 2, brows and mouth by level, sad when
  someone needs you), `+`. Rail: face, count, vertical power bar, `+`. Dev: `min <axis> seen <px>` and
  `block <id> <axis> <size>` in the strip.

## Desks: last-active order and cobwebs

- Every poll asks `hc get` for each live agent's `status_ms`: busy ones every time, the rest once
  per status (when they stopped). On render each agent's last-active time is now when it's working or
  blocked, else that `status_ms` (or when this panel saw the change); `byLastActive()` in `rules.js`
  sorts most recent first, ties keeping their order, so busy desks don't shuffle.
- `cobwebLevel(idleMs)`: 1 after an hour (a web in the monitor's top-left corner), 2 after 8 hours (webs on
  both monitor corners and under the desk, and a dusty `#c8ccd477` screen). Each web is one tinted
  `svg("mods/sitandwatch/cobweb.svg")` (`cobweb-r.svg` mirrored), `#e6e9ef`, so they cost one div each.
- A finished agent you haven't answered shows `sinceLabel(idleMs)` on its screen, 10px `#cfe0ff`:
  `<1m`, `12m`, `3h`, `2d`. Herdr turns `done` into `idle` as soon as you look, so `trackWaiting()` in
  `rules.js` keeps `{ address: when it finished }`: set on `done` (from `status_ms`), kept through `idle`,
  cleared once it's working or blocked again (you answered) or gone. Saved in localStorage (`waiting`), so
  a restart keeps it. A waiting desk's last-active time is when it finished, so its order and cobwebs
  count from then too. One element; the 15s re-render keeps it current.
- Each desk is labelled under its chair (`pn-<address>`, 10px, ink, light when focused; rows are 68px
  to fit it): `deskName()` in `names.js`, the tab's name unless it's only Herdr's number, else the
  space's name (the project), else the program's, else the terminal; 15 characters. The desk's top and
  front are one element (`border_b`), which pays for the label in the element budget.
- Dev: the `desks` row (`real`, `1h`, `8h`), or `herdr-app do sitandwatch.desks-<1h|8h|real>`, pretends every
  desk not busy is that old; only while developer mode is on. Demo state 26 "Old agents: cobwebs".

## Claude Code sub-agents

- `hooks/sitandwatch-subagents.py`, on Claude Code's `SubagentStart` and `SubagentStop`, runs
  `herdr-app do sitandwatch.sub-start-<terminal>-<agent id>` (or `sub-stop-`): the terminal from
  `HC_TERMINAL_ID`, ids cut to letters and digits. Anything missing, it sends nothing; every error is
  swallowed. Herdr's `herdr-app ls` lists `sub_agents` per terminal, but mods can't read it.
- `parseSubCommand()` reads them; `this.subs = { id: { parent, at, doneAt } }` (a stop for an unknown
  id leaves a hidden tombstone, see below). `pruneSubs()` treats a parent's sub-agents as one batch: kept while any runs, all
  dropped 8s (`SUB_DONE_MS`) after the last stops; one never stopped (Esc, a killed session) goes after an
  hour (`SUB_TTL_MS`; real ones run well past 15 minutes). Kept in localStorage (`subs`, written only by
  the copy that owns the commands) across reloads, so a stop for one running before still lands. A stop
  for an id never seen leaves a hidden tombstone for 30s (`SUB_TOMB_MS`, outside any batch), so a start
  handed on late between panel copies makes no ghost.
- `subDesks()` turns them into agents (`<parent>~<id>`, working or done) for everything that reads
  agents: the metrics (welcome, finish, level), the power bar. Then `foldSubs()` takes them off the
  desks and gives the parent's desk `subs: { done, total, running }`, drawn as `psub-<address>`: a
  `#2b2f3a` tag by the monitor reading `2/5`, `#ffd86a` while any run, `#9fe0a0` when all are done.
  `headcount()` counts running ones in the header and his level; a mark on a sub-agent (`deskOf()`)
  points at its parent's desk; a desk with any running counts as active.
- Dev: the `subagent` fire button starts a pretend one on the first desk for 15s. Demo state 27.

## Screenshot mode

- `privacy.js` is the screenshot mode mods' own file, copied in unchanged (each of its mods carries the
  same copy): it reads Herdr's shared `privacy` state, `{ on, hidden, phrases: [{ text, alias }] }`.
- `names.js` puts every drawn name through it: `spaceLabel()`, `tabName()`, `tabLabel()` and
  `deskName()`. Hidden and on: an aliased phrase is swapped in, else the stand-in (`Space N`, the
  program's name for a tab); a space hidden by hand hides its tabs' names too; a terminal with no tab
  or space still gets aliases. Off or not installed: names as they are. Used by the desk labels, the
  name he calls out, and in the office view the space signs, desk names, the hover card and the rail.

## Options

- `options.js`: the Options dialog, opened from OPTS in the header (its own `on_mouse_down` /
  `on_click` stop propagation, so the header's demo toggle doesn't fire) or
  `herdr-app do sitandwatch.options`, as `openOverlay({ mod: "sitandwatch", kind: "dialog", width: 380,
  height: 610, props: { options: true } })`. With `props().options` the view skips the panel's timers
  and draws the dialog: height (`HEIGHTS` in `rules.js`: 240/300/400/500, or `layout`), floor (`FLOORS` in `rules.js`, slate `#6b7a8f` by default), pets on/off,
  speech bubbles on/off, activity bubbles on/off, chaos and developer mode.
- Stored in `shared("sitandwatch.options")`, read through `readOptions()` (any missing or broken value
  falls back to the default). Shared rather than `localStorage`, which is per copy: the dialog is a
  copy of its own.
- Height: `heightTick()` in `main.js`, once a second in the copy that owns the commands, asks
  `planHeight()` in `rules.js`, which keeps `localStorage "height"` = `{ id, h, from }` (the height set
  and the block's size before). A new choice resizes once (`layout.resize { id, px }`; a layout `min`
  above the strip is fine up to the height chosen). The same choice leaves a drag of the sidebar line
  alone, except on a copy's first tick with the block back at `from` (Herdr restarted): set again.
  `layout` resizes back to `from` (or weight 1). Never while minimised; just after a restore, while Herdr
  may still read the block strip-sized, `from` is the size the restore went back to (`restoredFrom`). A
  late refusal only counts if nothing was set after it. Each copy plans from its own minimise state. A docked (row), missing,
  ambiguous or too-small block says why once (`HEIGHT_TROUBLE`); a refused resize says so once and
  is retried 30s later. `height-<240|300|400|500|layout>` sets the option; anything else is ignored.
  For a drag handle, the layout's `sidebar` column needs `"resizable": true`.

## Watch out

- Herdr cuts a render off ("This view could not be re-rendered ... interrupted") when it runs too
  long. Draw the robots with a dozen rectangles, not `sprite()`: at one `div` per colour run, seven
  sprite robots and the developer were enough to hit it. Several animated developers in one view
  hit it too, so the demo shows one state at a time.
- Don't call `terminals()` during render: it can be slow (remote machines) and gets the render cut
  off. Poll `hc ls --json` off the render path.
- Don't lay the panel out from a measured height (`on_size_change` + `cx.notify()`): Herdr's error
  banner changes the height, which re-renders, which removes the banner, and round it goes. Use
  flex: fixed header, `flex_1` desks, fixed-height corner.
- `loop` always swings there and back, so it can't play a one-time burst. The explosion renders
  squashed (stage 0), then 60ms later blown out (stage 1) with the same ids, and `transition()`
  animates the change once.
- The one-shots count down in ticks of the 1s timer, which re-renders while one runs and every 15s
  otherwise, so the minute-based moods catch up. Their edges (finish, newly blocked, busy to none,
  new desk, focus change) are found in render against the previous statuses, like the party popper.
- The demo toggles: `herdr-app do sitandwatch.demo` while it runs stops it, and a mod reload (any
  file in the folder changing) stops it too. Look at the header (brown with `STOP` means on) before
  recording it.
- A reload, or Herdr rebuilding the view, leaves the old `nextCommand()` loop waiting alongside the
  new one, and its `cx` keeps working, so it takes commands and changes a view nobody sees. Each
  panel build writes a token to `localStorage` when it starts, and a loop whose token isn't the
  latest hands the command on with `run("sitandwatch.<command>")` and stops. Builds from before this
  fix can only be cleared by restarting the window.
- Don't call `setShared()` from `init`: it re-renders every mod, and a re-render that rebuilds views
  runs `init` again.
- `herdr-app shot` saves the last frame the window drew. With the Mac locked or the display asleep
  nothing is drawn, so shots go stale. Keep it awake (`caffeinate -u`) while recording.
- `loop` periods must be at least 100ms. Loops need a stable `.id()`; put the level in the id so
  they restart at the new speed when it changes.
- `herdr-app check` renders the default role, the panel, with no agents: it can't show levels 1–3.
  Use the demo.
- Claude Code's own subagents (its Agent tool) run inside one terminal, so they don't get desks;
  with the sub-agent hook they show as a `2/5` tag on their session's desk instead.
- More than about two rows of desks are hidden behind the corner in a short panel.

## Done when

- With the mod in a sidebar and no agent working, the chair is empty.
- Starting an agent brings the developer in with popcorn and a foam finger; four working agents
  get a standing ovation with confetti.
- An agent asking for permission turns its screen red and makes him cry `wah wah` over spilled
  popcorn; an agent finishing sets off the party popper.
- `herdr-app do sitandwatch.demo` cycles all 27 states with labels, and `herdr-app status` reports no
  errors throughout.
- Clicking a desk focuses that agent.
- Every desk shows its name; with screenshot mode on, the renamed and hidden ones show its aliases and stand-ins.
- A finished agent keeps its waiting time on screen after you look at it, until it works again.
- With the sub-agent hook, a Claude Code session running five sub-agents, two finished, reads `2/5` on its
  desk and the header counts the three still running.
- `herdr-app do sitandwatch.ship`, or a `git push` from Claude Code with the hook installed, sets off
  the explosion, which clears by itself.

## Ship hook

All three hooks run on Python 3.7 or later: each starts with `from __future__ import annotations`, so
its `str | None` return types aren't evaluated (they'd need 3.10, and a pyenv or system `python3` is
often older).

`hooks/sitandwatch-ship.py` is a Claude Code `PostToolUse` hook. Copy it to `~/.claude/hooks/` and
add to `~/.claude/settings.json`:

```json
"PostToolUse": [
  { "matcher": "Bash", "hooks": [{ "type": "command", "command": "~/.claude/hooks/sitandwatch-ship.py", "async": true, "timeout": 10 }] }
]
```

The same hook sends the smaller events: a push to any other branch sends `sitandwatch.push`, and
`gh pr create` sends `sitandwatch.pr-<n>` with the number from the PR URL in its output
(`tool_response`), or `sitandwatch.pr` without one. One command, one event, the biggest: PR merged >
deployed > pushed to main > PR opened > branch pushed (opening a PR usually pushes its branch first).
The panel takes `pr-<n>` only with 1 to 6 digits.

`is_ship()` in the script decides what counts as shipping: `gh pr merge` (PR MERGED), a production
`vercel` deploy (DEPLOYED), and a `git push` that updates the main branch (IT'S LIVE). Main is `main`,
`master`, or the branch `origin/HEAD` points to. Pushing a feature branch, say to open a PR, isn't
shipping. `git_push()` reads each step like the shell (quotes kept together), skips git's own options
(`-c`, and `-C <dir>`, which moves the folder) and needs `git` to be the command, not an `echo`.
`push_targets()` finds the branches a push updates: the named ones (`main`, `HEAD:main`,
`refs/heads/main`), else the current branch (`git symbolic-ref`, in the session's `cwd` from the hook
input, moved by any `cd <dir>` step earlier in the command). A dry run, a delete (`--delete`, `:main`)
or tags alone update nothing.

## Activity hook

`hooks/sitandwatch-activity.py` is a Claude Code `PreToolUse` hook (async). `describe()` turns the
tool call into a phrase, a plain verb or the tool's own name first: Read → `Read <file name>`, Edit/Write → `Edit <file name>`, Bash → `<program [subcommand]>` (no verb: `git push`, `npm test`) of its first step that isn't setup (`cd`, `pushd`, `popd`, `export`, `set`, `source`, a bare `VAR=value`; steps split on `&&`, `||`, `;`, newlines), so `cd ~/proj && git diff` is `git diff`
(leading `VAR=value` skipped, a path cut to its name, no other arguments: they can hold secrets), Grep → `Grep <pattern>`, Glob → `Glob <pattern>`, Task/Agent → `> <description>`,
WebSearch → `Search <query>`, WebFetch → `Read the web`, TodoWrite → `Plan`, an MCP tool → `Use <service>`
(`mcp__claude_ai_Gmail__search_threads` → `Use Gmail`), else the tool name. The panel's `sayText()` keeps
an act's leading `>` (it drops only a title's status glyph). `phrase()` keeps
printable ASCII on one line, at most 20 characters (cut at a word, `...`; mid-word if a word cut would
leave only the verb, as in `Read a-very-long-...`). It sends `herdr-app do
sitandwatch.act-<HC_TERMINAL_ID>-<phrase in base64url, no padding>`; outside Herdr, or for another
event, nothing.

Keeping secrets off the screen:

- **At most 20 characters**, what a bubble can show (`sayText()`), cut at a word. What can't be shown
  never leaves the hook: not in `herdr-app`'s arguments (other accounts can see those in `ps`), not in
  the cache. A long key in a pattern goes with the cut word.
- **`redact()`** turns secret-shaped words in typed text (the Grep/Glob pattern, the web query, a
  sub-agent's description) into `***`: a known key prefix (`SECRET_PREFIX`: `sk-`, `ghp_`, `xox?-`,
  `AKIA`, `eyJ`, `AIza`, `-----BEGIN` and others), or 6+ characters mixing letters with digits, which
  catches short passwords like `hunter2` that fit in 20 characters. It costs the odd `sha256`.
  All-letter passwords still show. File names aren't redacted: they're names, not contents.
- **A subcommand only for `SUBCOMMANDS`** (git, npm, gh, docker, cargo and the like), and only if it's
  letters and dashes. Otherwise the second word is an argument: `printf <token>` shows `printf`,
  `cd <client-folder>` shows `cd`.
- **Off switch**: with the "Activity bubbles" option off, `enabled()` reads it from Herdr's
  `shared.json` (`HERDR_APP_HOME`, default `~/.config/herdr-app`) and the hook sends nothing. If it
  can't read the file, it counts as on.

Install:

```json
"PreToolUse": [{ "hooks": [{ "type": "command", "command": "~/.claude/hooks/sitandwatch-activity.py", "async": true, "timeout": 10 }] }]
```

In the mod, `parseActCommand()` decodes it (refusing anything not letters/digits/`-`/`_`, over 80, or
not printable ASCII once decoded) into `this.acts[terminal] = { text, at }`. A desk's bubble says
`freshAct()` (under `ACT_FRESH_MS`, a minute) before its title, both through `tabLabel` (screenshot
mode) and `sayText()` (20 characters). With the "Activity bubbles" option off (`options().activity`, or
`herdr-app do sitandwatch.activity` to toggle), acts are ignored and every bubble is the title.

Repeats are cheap. Each send costs a `herdr-app` process and about 7.5ms of Herdr's own dispatch, and a busy
session repeats itself ("Read main.js" three times), so:

- The hook skips a command identical to the one it last sent from that terminal under `REPEAT_S`
  (30s, inside `ACT_FRESH_MS`, so a desk doing the same thing never goes stale). It remembers the last send
  in `~/.cache/sitandwatch/sitandwatch-act-<terminal>` (`SITANDWATCH_ACT_DIR` overrides it, for the
  checks). The folder is created 0700 and must be a real folder the user owns. The file is opened 0600
  with `O_NOFOLLOW`, so a link planted at its path is refused and its target left alone. Not the temp
  folder: without `TMPDIR` that's the shared `/tmp`. Any trouble with the cache means it sends.
- The panel redraws for an act only when `actChanged()` says the bubble changes: new text, or the
  same text after the old one went stale. A repeat still refreshes its time. The command loop's own
  redraw skips `act-` commands for this.

## Sub-agent hook

`hooks/sitandwatch-subagents.py` is a Claude Code `SubagentStart`/`SubagentStop` hook. Copy it to
`~/.claude/hooks/` and add to `~/.claude/settings.json`:

```json
"SubagentStart": [{ "hooks": [{ "type": "command", "command": "~/.claude/hooks/sitandwatch-subagents.py", "async": true, "timeout": 10 }] }],
"SubagentStop": [{ "hooks": [{ "type": "command", "command": "~/.claude/hooks/sitandwatch-subagents.py", "async": true, "timeout": 10 }] }]
```
