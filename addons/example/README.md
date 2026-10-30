# COG Example API (split pack)

Papyrus-only reference for public `COG_API` / `COG_Feed_API` usage. Four **esp-as-ESL** plugins (Small flag). Soft dependencies only — no Example→Example masters.

| ESP | Role |
|-----|------|
| `COG - Example Core.esp` | `ImportIcon` (fill + hollow lightbulbs) **first**, then `COG_Example_IconsReady`, then 10→0 countdown + `COG_Example_Tick` |
| `COG - Example Gears.esp` | Registers count / percent / timer; updates from the tick |
| `COG - Example Feed.esp` | `COG_Feed_API.Notify` when Remaining hits 0 |
| `COG - Example Gizmos.esp` | Two gizmo types; gear-backed only if Gears is loaded |

**FOMOD:** install step **Example Core** (check it, then Next) unlocks step **Example Modules** (Gears / Feed / Gizmos). Always enable Core before the others in the load order.

## Script layout (API vs plumbing)

Each quest script uses section banners:

- `; === Example plumbing: … ===` — ModEvent send/receive, `IsPluginLoaded` gates, countdown
- `; === COG API: … ===` — `ImportIcon`, `BeginRegister` / `Register*` / `EndRegister`, `Update*`, `Notify`, `GizmoStorage`

Copy the **COG API** blocks into your mod; plumbing is Example-pack-specific.

## Icons (Core-first)

Core imports:

- `Interface/exported/COG_Example/light-bulb-fill.png` → `COG_Example/light-bulb-fill.png`
- `Interface/exported/COG_Example/light-bulb-hollow.png` → `COG_Example/light-bulb-hollow.png`

Import finishes **before** `COG_Example_IconsReady` and any tick. Gears / Feed / Gizmos **do not** call `ImportIcon`; they use those paths.

**Soft-dep:** `IsPluginLoaded("COG - Example Core.esp")` only means the plugin is in the load order. Submodules **bind** (register gears/gizmos, accept ticks) on `COG_Example_IconsReady` — after import — with a tick bootstrap if that event was missed.

## ModEvent contract

```
SendModEvent("COG_Example_IconsReady", IconFillPath, 0.0)
SendModEvent("COG_Example_Tick", IconFillPath, Remaining as Float)
```

- **IconsReady** — `strArg` = fill icon path; fired after every successful Core import and again each countdown tick (late joiners).
- **Tick** — `strArg` = fill icon path (Feed Notify convenience); `numArg` = remaining count (0…10).

## Gears demo matrix

| Gear | Demonstrates |
|------|----------------|
| **Count** | Solid icon tint, blank bar, `hideAt` `<1` |
| **Percent** | Icon asset stops every 10% (fill/hollow), blank icon tint, 3-stop bar (green→gold→red) |
| **Timer** | 3-stop icon tint, solid bar |

**Translation override:** Example Gears ships `SKSE/Plugins/COG/translations/Example.json` with `name:Example` (category) plus `name:Example Count` / `Percent` / `Timer` (`en-CA` + `fr-CA`). COG loads all `translations/*.json` A→Z last-wins, so this file rides beside Core’s `_COG.json` and demonstrates author overrides without editing the main catalog. Enable **Update stock titles on translation** (or recreate gears) if an older English `displayName` is already on disk.

## Gizmos

| Type | Demonstrates |
|------|----------------|
| `xmp-gearupdated` | `sourceFor("COG_Example_Gears","count")`, fill icon, `defaultVisibility` **hud**, soft-gated on Gears ESP |
| `xmp-pushupdated` | `UpdateGizmo` payload, hollow icon, `defaultVisibility` **ui** |

Both: schema colours + **Show Count** (digit beside icon, same size/colour). Schema `labelTag`s (`cog-zero-colour`, `cog-ten-colour`, `cog-show-count`) resolve from each type’s `SKSE/Plugins/COG/gizmoTypes/<typeId>/translations/_COG.json` (not the global COG catalog). Editor also exposes Visibility (same control as builtin gizmos).

## Smoke

1. Core only — icons import; no gears/toasts/gizmos.
2. Core + Gears — three gears animate with the matrix above; Count hides at 0.
3. Core + Feed — toast when countdown hits 0 (needs a visible Feed with Notifications).
4. Core + Gizmos (no Gears) — only Example (Push Updated); Example (Gear Updated) absent.
5. Core + Gears + Gizmos — both types; gear-backed follows count.

## Build

```text
powershell -NoProfile -ExecutionPolicy Bypass -File tools\release.ps1
```

Or `xmake build COG_Example` after compiling the eight Example `.psc` files into `papyrus/pex/`.
