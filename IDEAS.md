# Ideas

Easter eggs and effects not built yet. Each one, when built, gets a check in `tools/check.mjs` that fails
without it. Date and time eggs must not fire on the golden's fake clock date.

## Easter eggs

- **Recursion.** A desk whose tab or space is named `sitandwatch`: he turns to the camera. "is that... me?" Buddy looks too.
- **Friday deploy.** Ship hook fires on a Friday after 4pm: banner reads `ON A FRIDAY?!`, he's half out of the chair, Buddy covers his eyes.
- **Clicked too much.** Ten clicks in five seconds: he turns the armchair to face the wall. "I'm not here." Back after 30s or the next real event.
- **31 October** (the mod's first day): cobwebs on every desk, pumpkin-headed robots.
- **1 April.** He sits at a desk, a robot takes the armchair and the popcorn.
- **December.** Santa hat for the scarf, a white floor.
- **3am.** Agents working between 3 and 4am: all pets asleep on him. "go to bed"
- **Gold chair.** The power bar fills three times in one session.
- **Pet bow.** Click Buddy, Snowy, Simba in order: they bow together.
- **Lonely.** All pets off in Options: he holds a framed photo of them. "where'd everyone go?"
- **Snowy, five clicks.** She pushes the foam finger off the armrest.
- **Back from minimised after an hour.** Asleep with the popcorn bucket on his head. "oh. you're back."
- **Ignored 30 minutes while agents work.** He phones you (the phone pose, facing the camera).
- **A desk named `prod`.** He sweats while it works, Buddy won't look at it.
- **Old desk wakes.** An 8-hour cobweb desk starts working: the robot sneezes, dust cloud, screen clears.
- **Same agent crashes three times.** Sign: `0 DAYS SINCE LAST INCIDENT`, resetting each crash.
- **Combo.** A PR merges while the power bar is full: one bigger explosion, `COMBO` banner.

Not possible as stated: reacting to `git push --force`. The activity hook sends only the program and
subcommand, so flags never reach the mod.

## Zoom-style effects

The renderer has no scale transform. Zooms redraw pixel art at a larger scale, as the bird flying at the
camera does (`art.js`, `more.zoom`).

- **Dramatic zoom.** On "they need me?!", step in on his face (scale 3, 5, 8), hold, snap back.
- **Stare at the camera.** An agent loops on the same error: he turns and stares at you, silent.
- **Zoom to the culprit.** On a crash, slide to the guilty desk with a red vignette, pan back.
- **Reactions.** Pixel hearts, thumbs up and party bursts float up from the chair and fade: one kind each for finish, merge and POWER!.
- **Raise hand.** A blocked agent's robot raises a yellow hand over its desk.
- **"You're on mute."** Clicked while speech bubbles are off: red bar, crossed-out mic, he mouths words.
- **Frozen frame.** Herdr idle a long time: he freezes mid-chew, `connection unstable` with a spinner, unfreezes on input.
- **Virtual background.** Nothing running: the wall fades to a beach, flickers back when an agent starts.
