// Every name this mod draws, through screenshot mode's renames. Screenshot mode (the screenshot-*
// mods) keeps them in shared state "privacy"; privacy.js is its own file, copied in unchanged (its
// mods each carry the same copy, and so does this one). Without screenshot mode, or with it off,
// every name shows as it is.
import { spaces } from "herdr";
import { spaceName, tabText, privacyOn, matches, aliased } from "./privacy.js";

// A text with no space or tab to go by (a terminal's own name): aliased when it holds a phrase, else the fallback.
const loose = (text, fallback) => (privacyOn() && matches(text) ? aliased(text) ?? fallback : text);

// An agent's space name: aliased, or "Space N" when it's hidden.
export function spaceLabel(a) {
  const w = a.space ? spaces().find((x) => x.id === a.space) : null;
  return w ? spaceName(w) : loose(a.space_name ?? "", "Space");
}
// Text belonging to an agent's tab (its name, the terminal's title): aliased, else the fallback, when hidden.
export const tabLabel = (a, text, fallback) => loose(a.tab ? tabText(a.tab, text, fallback) : text, fallback);
// A tab's own name: when hidden and it can't be aliased, the program's name stands in (as screenshot mode does).
export const tabName = (a) => tabLabel(a, a.tab_name ?? "", a.program?.name || "Agent");

// A desk's label: its tab's name when it was given one (Herdr numbers them "1", "2"...), else its
// space's (the project), else the program's, else the terminal. 15 characters fit.
const named = (t) => (t && !/^\d+$/.test(t) ? t : null);
export function deskName(a) {
  const tab = named(a.tab_name) && tabLabel(a, a.tab_name, null);
  return String(tab || spaceLabel(a) || a.program?.name || a.address || "").slice(0, 15);
}
