# herdr-sit-and-watch

The Sit & Watch mod for the Herdr app: `sitandwatch/mods/sitandwatch/` is the mod, `sitandwatch/RECIPE.md`
the brief to rebuild it, `README.md` what people see. `tools/` is offline tooling and never ships with the mod.

## Testing

Run both before shipping:

```sh
node tools/check.mjs                                  # offline: Node 22.15+, no Herdr needed
herdr-app check sitandwatch/mods/sitandwatch          # Herdr's own loader (needs Herdr installed)
```

- `tools/check.mjs` runs the mod in plain Node (a resolve hook maps `gpui-kit`, `gpui-base` and `herdr` to
  `tools/stubs.mjs`, with a fake clock). It fails on any change to his recorded decisions (the golden in
  `tools/golden.json`, captured from 9e52cc0), on an `ERR` panel, on a render over the element budget, and
  on the pet-wandering rules.
- A deliberate change to a mood rule or a one-shot event: re-capture the golden with
  `node tools/check.mjs --capture` from a commit (it refuses uncommitted mod changes), and say why in the
  commit.
- New behaviour gets a check in `tools/check.mjs` that fails without it (try reverting the rule once).
