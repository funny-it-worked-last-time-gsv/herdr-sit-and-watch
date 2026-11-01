// What he says. Each pool is shuffled once per session (seeded) and cycled with frames(), so the
// order varies between sessions without a re-render per line. Straight quotes only: the pixel
// font has no curly ones.

export const LINES = {
  // empty chair: only heard when he's back and dozing after a long quiet spell
  idle: [
    "where is everyone", "just me and the popcorn", "any minute now", "still here", "the calm before",
    "popcorn's getting cold", "patience", "just waiting", "any minute",
    "the silence is loud", "any minute now lads", "I miss the chaos", "popcorn's going stale",
    "where did everyone go", "lovely quiet",
    "they will return", "I can feel it", "the agents are thinking", "quiet is temporary",
    "popcorn tax still unpaid", "I didn't open this window for silence", "they better come back cooking",
    "this chair remembers better days", "the desks are judging me", "I should have started more",
    "one of them is about to appear and I will lose my mind", "the popcorn is watching me back",
    "I am one prompt away from chaos", "they left me with the pets again", "absolute ghost town (temporary)"
  ],
  level1: [
    "ooh", "aha!", "nice", "lovely stuff", "go on", "mmm", "cooking", "quiet but lethal", "there we go",
    "keep going", "interesting", "I see you", "early days", "one down", "solid start", "not bad",
    "warming up", "let's see it", "hmm yes", "is he... cooking", "dangerous energy", "quiet violence",
    "I see the vision", "that's a choice", "oh we're doing this", "back of the net", "that's a result",
    "quiet competence", "I'm not saying it's good, but it's good", "early doors", "he's having a go",
    "decent start, that", "I like what I'm seeing",
    "oh we're starting", "one little agent and I'm already invested", "don't you dare stop now",
    "this is how it begins", "I can already feel the ovation", "quiet cooking is still cooking",
    "I have seen this movie and it ends in confetti", "early but dangerous", "one is enough to get me sat",
    "the first one always hits different", "I am not normal about this", "keep going I am already unwell",
    "this single agent has ruined my afternoon in the best way", "I will be thinking about this for hours",
    "one prompt and my heart rate is up", "they don't know what they've started", "I am locked in already"
  ],
  level2: [
    "look at 'em go", "go on son!", "ooh yes", "OH HE'S COOKING", "LOOK AT THAT", "GO ON MY SON",
    "THEY'RE LOCKED IN", "beautiful", "more of that", "yes lads", "keep it coming", "I'm sat",
    "this is good", "absolute scenes", "cooking with gas", "that's the one", "don't stop", "proper job",
    "I like this", "go on then", "lovely stuff", "they're at it", "big fan of this", "get in early",
    "yes please", "more please", "this is the stuff", "locked in", "quality", "I'm invested",
    "THEY'RE UNHINGED", "I am vibrating", "do not stop them", "this is illegal levels of good",
    "I'm not well", "the lads have entered the chat", "I need a doctor", "absolute scenes already",
    "someone stop them (don't)", "I'm feral", "lovely jubbly", "the lads are at it", "more of that please",
    "quality from the lads", "I'm a big fan of this",
    "TWO of them I am not okay", "the desks are talking to each other", "this is getting dangerous",
    "I have abandoned all other tabs", "my soul has left my body and is in the chair",
    "they are cooking in stereo", "I will defend these two agents with my life",
    "the popcorn is secondary now", "I am making noises I cannot explain", "this is the good timeline",
    "do not touch me I am watching", "two agents and I am already planning the ovation",
    "they understood the assignment on the first try", "I am not well (complimentary)", "the can is shaking",
    "I have forgotten what I was supposed to be doing",
    "this is better than most films I have seen this year", "keep going I am emotionally available"
  ],
  level3: [
    "SHIP IT!", "SHIP IT SHIP IT SHIP IT", "YES LADS", "ABSOLUTE CINEMA", "I'M GOING TO CRY",
    "MORE AGENTS", "!!!", "THE FUTURE IS NOW", "they understood the assignment", "this is what we do",
    "peak", "legendary behaviour", "I cannot believe this", "absolute chaos (complimentary)",
    "the lads are cooking", "full send", "we are so back", "this is cinema", "I love this timeline",
    "more of this forever", "standing ovation behaviour", "they get it", "peak performance", "I'm shaking",
    "this is the good stuff", "don't you dare stop", "yes yes yes", "absolute scenes", "the work is working",
    "I am unwell (in a good way)", "BACK OF THE NET!", "I AM GOING FERAL", "THE AGENTS ARE FREE",
    "I CANNOT BE NORMAL ABOUT THIS", "WE ARE SO UNWELL", "MORE MORE MORE", "I WILL DIE IN THIS CHAIR",
    "THIS IS NOT A DRILL", "THE TIMELINE IS WINNING", "I HAVE SEEN GOD", "ABSOLUTELY FERAL BEHAVIOUR",
    "I NEED TO LIE DOWN (I WON'T)", "THEY'RE COOKING WITH NUCLEAR", "I AM THE PROBLEM NOW",
    "YES YES YES YES", "THE WORK IS FERAL", "I LOVE YOU AGENTS", "THE LADS HAVE COOKED",
    "DON'T YOU DARE STOP", "MORE AGENTS PLEASE",
    "I HAVE LEFT THE CHAT", "MY HEART CANNOT TAKE THIS", "FOUR OF THEM I AM ASCENDING",
    "the confetti is justified", "I will never recover from this", "this is the reason I have agents",
    "I am making the face of a man who has seen god", "SHIP IT AND THEN SHIP MORE",
    "I am going to need a minute after this", "the pets have given up on me",
    "I am not normal about shipping", "this is better than sex and I will die on that hill",
    "I have transcended"
  ],
  finish: [
    "GET IN!", "GET IN THE BIN (affectionate)", "SENT", "ABSOLUTELY SENT", "THAT'S THE ONE", "POP!",
    "SHIPPED!", "yes lad", "beautiful", "we take those", "clean", "proper", "get in son",
    "that's what I like to see", "one for the books", "yes please", "more of that", "delicious",
    "chef's kiss", "we love to see it", "absolute win", "done and dusted", "perfect", "I am so back",
    "GET IN YOU BEAUTIFUL BASTARD", "SENT TO THE MOON", "THAT'S ILLEGAL", "I'M SCREAMING",
    "CHEF'S KISS WITH VIOLENCE", "YES YOU ABSOLUTE WEAPON", "POP OFF", "THE BIN IS FULL",
    "BACK OF THE NET", "CLEAN AS A WHISTLE", "PROPER", "ONE FOR THE BOOKS",
    "THEY DID IT AND I AM UNWELL", "POP GOES THE AGENT",
    "I will be thinking about this for the rest of the day", "clean as a whistle and I am crying",
    "this is why I stay in the chair", "GET IN YOU BEAUTIFUL ROBOT", "the popcorn has been launched",
    "I am making the noise again", "one finished and my soul left my body"
  ],
  blocked: [
    "wah wah", "they need me?!", "noooo", "not again", "I trusted you", "human required", "oh no", "why",
    "come on", "really", "need the adult", "help", "wah", "I'm needed", "classic", "of course",
    "right now?", "I'm coming", "hold on", "one sec", "don't cry", "we got this", "it's fine",
    "deep breath", "I got you", "I trusted the robots", "betrayal", "I am in pieces",
    "why would you do this to me", "I need a lie down", "this is a personal attack", "wah wah wah",
    "I can't do this alone",
    "NOT NOW I WAS WATCHING", "I was having a moment", "the adult is required (tragically)",
    "I will be there in one second and I am already devastated",
    "they need the human and the human is unwell", "wah wah wah I trusted the robots",
    "this is the worst possible timing", "I was so happy"
  ],
  ship: [
    "KABOOM!", "IT'S LIVE!", "LEGENDS", "THE FUTURE IS NOW", "absolute cinema", "we did it",
    "live and dangerous", "full send", "it's out", "the people can have it", "legendary", "peak",
    "that's a wrap", "mission complete", "we ship", "the work is done", "absolute scenes", "yes lads",
    "history", "this is the one", "beautiful chaos", "I am so proud", "more of this", "the timeline wins",
    "KABOOM YOU BEAUTIFUL MANIACS", "IT'S LIVE AND I'M UNWELL", "THE TIMELINE HAS WON",
    "I AM CRYING REAL TEARS", "HISTORY JUST HAPPENED", "MORE OF THIS FOREVER",
    "KABOOM I HAVE LEFT MY BODY", "IT'S LIVE AND I AM NOT OKAY", "THE EXPLOSION WAS JUSTIFIED",
    "I will be talking about this for weeks", "SHIPPED INTO THE VOID AND I AM CRYING",
    "this is the peak of my entire existence", "KABOOM AND THEN MORE KABOOM"
  ],
  streak: [
    "HE'S ON FIRE", "don't stop him", "this one gets it", "again!", "serial winner", "he cannot miss",
    "HE CANNOT BE STOPPED", "SERIAL KILLER ENERGY (COMPLIMENTARY)", "LEAVE HIM ALONE HE'S COOKING",
    "THIS ONE IS DANGEROUS", "leave him alone",
    "THIS ONE IS UNWELL IN THE BEST WAY", "three in a row and I am ascending",
    "he is cooking and I am the one who is done for"
  ],
  meltdown: [
    "WHY DO I EVEN HAVE AGENTS", "this is fine", "everyone needs me", "chaos", "I need a minute",
    "absolute scenes (not complimentary)", "I AM HAVING A BREAKDOWN", "EVERYONE NEEDS ME AND I AM ONE MAN",
    "THIS IS FINE (IT IS NOT)", "I WANT TO GO HOME", "ABSOLUTE CARNAGE", "I AM NOT EQUIPPED FOR THIS",
    "I can't do this", "right, that's it",
    "I HAVE MADE A TERRIBLE MISTAKE", "THEY ALL NEED ME AND I AM FACE DOWN", "this is the opposite of cinema",
    "I will never recover from the simultaneous need"
  ],
  // the pets, when clicked (asleep: curled on the empty chair)
  cat: [
    "...", "pathetic", "feed me", "he's not even working", "I could do his job", "unbelievable", "sigh",
    "that's my chair", "do something", "embarrassing",
    "he is making the noise again", "I have seen enough"
  ],
  beagle: [
    "walk?", "*sigh*", "he's not even working", "snack?", "is it dinner", "I believe in the robots",
    "can I have the popcorn", "boof", "he could at least type",
    "the humans are unwell", "popcorn tax"
  ],
  asleep: [
    "zzz", "five more minutes", "mmf", "not now", "it's my chair now",
    "leave me", "I was here first"
  ],
  // a branch pushed, a PR opened (the ship hook)
  push: [
    "pushed!", "off it goes", "whoosh", "up it goes", "safe on the remote", "sent upstairs",
    "there it goes", "backed up"
  ],
  pr: [
    "PR's up!", "review time", "eyes on this one", "fresh PR", "who's reviewing?", "open for business",
    "ready for a look", "be gentle"
  ],
  // clicking him
  poke: [
    "you seeing this?", "the work is working", "I'm sat", "shh, I'm watching", "best seat in the house",
    "don't block my view", "this is my show", "pass the popcorn", "aha!",
    "do not interrupt the cinema", "I am busy being unwell", "pass the popcorn or leave",
    "this is my show now", "I have no idea what they're doing and I love it",
    "do not speak to me I am in it", "I am having a religious experience", "touch the chair and perish"
  ]
};

// The original lines go first so a fresh session still opens with his old voice.
const FIRST = { level1: "ooh", level2: "go on son!", level3: "SHIP IT!", finish: "GET IN!", blocked: "wah wah", ship: "KABOOM!", push: "pushed!", pr: "PR's up!" };

export function pool(name, seed = 0) {
  const list = LINES[name] ?? [];
  const out = list.slice();
  let s = (seed ^ (name.length * 2654435761)) >>> 0;
  for (let i = out.length - 1; i > 0; i--) {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  const first = FIRST[name];
  return first ? [first, ...out.filter((x) => x !== first)] : out;
}

export const pickLine = (name, n) => { const l = LINES[name] ?? [""]; return l[((n % l.length) + l.length) % l.length]; };
