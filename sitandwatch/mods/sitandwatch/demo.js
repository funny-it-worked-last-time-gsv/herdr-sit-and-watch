// Demo data for screenshots. While shared "demo" is true, the panels that import their live
// data from here (instead of "herdr") show a made-up world: four spaces, their tabs and
// agents, with statuses that move on every shared "demo.tick" (screenshot-spaces bumps it
// every few seconds while demo is on). Commands aimed at made-up ids are dropped. Every mod
// that uses it has an identical copy of this file.
import * as herdr from "herdr";
import { shared, setShared } from "herdr";

export const demoOn = () => shared("demo") === true;
const tick = () => Number(shared("demo.tick") ?? 0);

// The made-up selection: shared "demo.sel" { s: space index, tabs: { [space index]: tab index } }.
const sel = () => { const v = shared("demo.sel"); return { s: Number(v?.s ?? 0), tabs: v?.tabs ?? {} }; };
const tabOf = (si) => Number(sel().tabs[si] ?? 0);

const prog = (key, name, agent) => ({
  key, name, icon: `icons/${key}.svg`, tint: key === "shell", tile: null, color: null, shell: key === "shell", agent,
});
const P = {
  claude: prog("claude", "Claude Code", true), codex: prog("codex", "Codex", true),
  gemini: prog("gemini", "Gemini", true), cursor: prog("cursor", "Cursor Agent", true),
  shell: prog("shell", "zsh", false), vite: prog("vite", "Vite", false),
};

// [space name, folder, branch, tabs: [tab name ("" = unnamed), program, title, statuses it cycles through]]
const WORLD = [
  ["acme-web", "~/Projects/acme-web", "main", [
    ["fix login", "claude", "Fixing the OAuth redirect", ["working", "working", "blocked", "working", "done", "idle"]],
    ["tests", "codex", "Adding checkout tests", ["working", "done", "idle", "working", "working"]],
    ["", "vite", "vite dev", null]]],
  ["billing-api", "~/Projects/billing-api", "feat/invoices", [
    ["migrate db", "claude", "Invoice table migration", ["blocked", "working", "working", "done", "idle", "working"]],
    ["refactor", "gemini", "Split the payments module", ["working", "working", "working", "done"]]]],
  ["docs-site", "~/Projects/docs-site", "main", [
    ["write guide", "claude", "Getting started guide", ["idle", "working", "working", "done", "idle"]],
    ["", "shell", "~/Projects/docs-site", null]]],
  ["mobile-app", "~/Projects/mobile-app", "perf", [
    ["perf pass", "cursor", "Profiling list rendering", ["working", "working", "done", "idle", "blocked"]],
    ["triage", "claude", "Sorting new issues", ["done", "idle", "idle", "working"]]]],
];

const RANK = { blocked: 4, done: 3, working: 2, idle: 1 };
const worst = (list) => list.filter(Boolean).sort((a, b) => RANK[b] - RANK[a])[0] ?? null;

// The whole made-up world for the current tick, built once per tick.
let cache = null;
function world() {
  const n = tick(), at = sel(), key = `${n}|${JSON.stringify(at)}`;
  if (cache?.key === key) return cache;
  const now = Date.now();
  const sp = [], ps = [], ags = [], terms = [];
  WORLD.forEach(([name, folder, branch, tabs], si) => {
    const sid = `demo-s${si}`;
    const tabInfos = tabs.map(([tname, pkey, title, cycle], ti) => {
      const tid = `demo-t${si}-${ti}`, pid = `demo-p${si}-${ti}`, addr = `demo-${si}-${ti}`;
      // Each tab moves through its cycle at its own pace, offset so they don't change together.
      const status = cycle ? cycle[Math.floor((n + si * 2 + ti) / (2 + ((si + ti) % 3))) % cycle.length] : null;
      const focused = si === at.s && ti === tabOf(si);
      const program = P[pkey];
      ps.push({ pane: pid, terminal: addr, tab: tid, title, cwd: folder, branch, status, app: cycle ? pkey : null,
        program, focused, zoomed: false, movable: true });
      terms.push({ address: addr, name: title, labels: { "herdr.space": sid, "herdr.tab": tid }, parent: null, status });
      if (cycle) ags.push({ address: addr, pane: pid, space: sid, space_name: name, tab: tid, tab_index: ti + 1,
        tab_name: tname || String(ti + 1), status, app: pkey, program, title, seq: si * 10 + ti, pinned: false, focused });
      return { id: tid, index: ti + 1, name: tname || String(ti + 1), named: Boolean(tname), active: ti === tabOf(si), status,
        panes: 1, zoomed: false, settled: false, settled_at: null, changed_at: now - ((n + ti) % 5) * 60000,
        working_since: status === "working" ? now - (3 + si + ti) * 60000 : null };
    });
    sp.push({ id: sid, index: si + 1, name, named: true, folder, machine: null, branch, active: si === at.s,
      status: worst(tabInfos.map((t) => t.status)), tabs: tabInfos });
  });
  cache = { key, sp, ps, ags, terms };
  return cache;
}

export const spaces = () => (demoOn() ? world().sp : herdr.spaces());
export const panes = () => (demoOn() ? world().ps : herdr.panes());
export const agents = () => (demoOn() ? world().ags : herdr.agents());
export const terminals = () => (demoOn() ? world().terms : herdr.terminals());
export const machines = () => (demoOn() ? herdr.machines().filter((m) => m.name === null) : herdr.machines());
// The selected made-up tab: its space, tab and pane as the panels see them, or null.
export function demoSelected() {
  if (!demoOn()) return null;
  const w = world(), space = w.sp.find((x) => x.active), tab = space?.tabs.find((x) => x.active);
  const pane = tab && w.ps.find((p) => p.tab === tab.id);
  return space && tab && pane ? { space, tab, pane, key: tab.id.slice("demo-t".length) } : null;
}

export const focused = () => {
  if (!demoOn()) return herdr.focused();
  const d = demoSelected();
  return { space: d.space.id, tab: d.tab.id, pane: d.pane.pane, terminal: d.pane.terminal, shown: d.pane.pane,
    agent: d.pane.app ? d.pane.terminal : null, cwd: d.space.folder };
};
export const setAgentOrder = (list) => (demoOn() ? null : herdr.setAgentOrder(list));

// Selecting a made-up space, tab, pane or agent moves the made-up selection. Other commands
// aimed at made-up ids are dropped (they'd fail with an error toast); the rest run as usual.
// Made-up ids: demo-s0, demo-t0-1, demo-p0-1, demo-0-1 (not names like "demo-session").
export function run(name, args) {
  const text = JSON.stringify(args ?? {});
  if (!demoOn() || !/"demo-[stp]?\d/.test(text)) return herdr.run(name, args);
  const tab = /"demo-[tp]?(\d+)-(\d+)"/.exec(text), space = /"demo-s(\d+)"/.exec(text);
  const now = sel();
  if (tab && /^(tab\.select|pane\.focus|agent\.focus|terminal\.show)$/.test(name)) {
    const si = Number(tab[1]);
    setShared("demo.sel", { s: si, tabs: { ...now.tabs, [si]: Number(tab[2]) } });
  } else if (space && name === "space.select") {
    setShared("demo.sel", { s: Number(space[1]), tabs: now.tabs });
  }
  return null;
}
