# COG — iWant Integration

Drop-in stubs so mods written for **iWant Widgets** / **iWant Status Bars** can talk to COG instead of Scaleform.

## Load order / mutual exclusion

1. **Require COG** at runtime (`COG - Custom Overlay Gadgets.esp` + Prisma UI, SKSE, Address Library). The stub plugins do **not** list COG as a TES4 master — they only call `COG_API` from Papyrus.
2. **Disable** the real **iWant Widgets** / **iWant Widgets NG** and **iWant Status Bars** plugins and scripts (this pack ships replacement `iWant Widgets.esl` + `iWant Status Bars.esp` and matching Papyrus stubs).
3. **Enable** this pack (`COG - iWant Integration`).
4. **Keep** original Widgets / icon packs for **custom** assets under `Interface/exported/...` when an addon ships its own icons. The shared **iWant Widgets library** filenames (`chickenleg.dds`, `thermometer-*.dds`, etc.) are remapped to COG shipped SVGs inside `COG_iWant.ImportIcon` — you do **not** need Widgets enabled for those. Unknown / missing icons fall back to `COG/cog.svg` (restored on disk by the SKSE plugin if deleted).
5. Enable consumer addons as usual (e.g. **iWant Status Bars - Stress and Fear addon**). They listen for `iWantStatusBarsReady` and call `loadIcon` / `setIconStatus` on the stub quest.

Do **not** run real Status Bars alongside this pack — same EditorIDs / script names will conflict.

## What this pack provides

| Piece | Role |
|-------|------|
| `iWant Widgets.esl` | Start-game quest + `iWant_Widgets` no-op API (`triggerReset` still fires `iWantWidgetsReset`) |
| `iWant Status Bars.esp` | Start-game quest + player alias; bridges `loadIcon` → `COG_API` percent gears |
| `COG_iWant.dll` | Remap / resolve export paths; real files go through `COG_API.ImportIcon` |

## Notes

- Stub plugins are flagged ESL (`HeaderFlag.Small`). Status Bars is **`.esp` flagged Small** so it can still be moved in load order; Widgets is a true **`.esl`** placeholder. If StartGameEnabled quests do not start, generate SEQ with the CK or xEdit for those plugin names.
- Status Bars fires `iWantStatusBarsReady` after a short delay on init / player load (alias script).
- `loadIcon` waits for `COG_API.IsReady()`, then `COG_iWant.ImportIconPack`: imports each state file (Widgets library stems → shipped COG SVGs; otherwise `Interface/exported/...` via PreferSibling + **`COG_API.ImportIcon`**). If every state uses the same file (or remaps to one asset) — e.g. Stress and Fear’s five colour levels on one `stress.dds` — the gear gets that **plain icon** (no `.json` pack). Distinct assets become a multi-icon `.json` under `assets/imports/icons/<Mod>/<Name>.json` (consecutive duplicate paths collapsed into `{ pct, path }` stops, aligned with `setIconStatus` percents). **Colours** from every `loadIcon` r/g/b state become the gear’s `iconColor` ramp (hex if all equal; otherwise JSON stops at the same percents), via `COG_iWant.BuildIconColorRamp`. Registers a COG percent gear (category **iWant Integration**, `hideAt <0.01`); `setIconStatus` still maps onto `UpdatePercent` (0.1%…100%). Empty or missing icons become `COG/cog.svg`.
- On player load the bridge clears its saved icon slots so consumers re-`loadIcon` and COG re-registers sources for the session (COG sources are not save-persisted). Returning `-2` (already loaded) still refreshes the COG `Register` call.
- Icon picker catalog = live scan of `assets/icons/` + `assets/imports/icons/` (each snapshot), including `.json` packs; `SKSE/Plugins/COG/imported-icons.json` records import paths for bridges.
- Put imported gears on a COG group; optional **Fill from Hidden** matches iWant-style soft appear:
  - `alpha` — fade opacity
  - `up` / `down` — greyscale icon fills with colour (GIF/WebP keep native colours when icon ends are blank)
  - `alphaUp` / `alphaDown` — same fill with trough-opacity greyscale

## Smoke test (Stress & Fear)

1. Disable real iWant Widgets + Status Bars; enable COG + this pack + Stress and Fear + its iWant addon.
2. Keep Widgets (or another pack) enabled **only** for `Interface/exported/.../stress.dds` assets if needed.
3. Load a save → Stress gear should register; stress level should drive the meter; near “no stress” it should hide via `hideAt`.
