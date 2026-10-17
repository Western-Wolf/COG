# COG — Example API

Papyrus-only reference pack that exercises the public **COG_API** surface: gears (count / percent / timer), `ImportIcon` from outside COG’s asset trees, two peer custom gizmo types (gear-backed vs `UpdateGizmo`), live `Update*`, and `Notify`.

## Load order

1. **Require COG** at runtime (`COG - Custom Overlay Gadgets.esp` + Prisma UI, SKSE, Address Library). This pack’s plugin does **not** list COG as a TES4 master — it only calls `COG_API` from Papyrus.
2. **Enable** this pack (`COG - Example API`).
3. Plugin is **esp-as-ESL** (`HeaderFlag.Small`) — it does not consume a full load-order slot.

If the StartGameEnabled quest does not start, generate SEQ with the CK or xEdit for `COG - Example.esp`.

## What this pack does

| Piece | Role |
|-------|------|
| `COG - Example.esp` | Start-game quest running `COG_Example` |
| `COG_Example.psc` / `.pex` | Imports icon, registers three Example gears + two peer gizmos; loops 10→0 each second |
| `PrismaUI/views/Example/example.js` | **Example (Gear Updated)** (`xmp-gearupdated`): paints via `sourceFor` + `UpdateCount` |
| `PrismaUI/views/Example/example_push.js` | **Example (Push Updated)** (`xmp-pushupdated`): paints via `gizmo.livePayload` + `UpdateGizmo` |
| `Interface/exported/COG_Example/example.svg` | Source icon **outside** COG assets — `ImportIcon` copies it into `assets/imports/icons/` |

On ready (`COG_Ready` / init / after Loading Menu):

1. `ImportIcon("COG_Example", "example", "Interface/exported/COG_Example/example.svg")` → `"COG_Example/example.svg"`
2. Registers **Example Count**, **Example Percent**, **Example Timer** (category **Example**)
3. Registers gizmo types **xmp-gearupdated** and **xmp-pushupdated** under source mod `COG_Example` (gallery **Mod-added**)
4. Every 1s pushes `UpdateCount` / `UpdatePercent` / `UpdateTimer` / `UpdateGizmo`; at **0** calls `Notify` then resets to **10**

Menus pause `Utility.Wait` / update ticks while open.

## Smoke test

1. Enable COG + this pack; load a save.
2. Confirm `PrismaUI/views/COG/assets/imports/icons/COG_Example/example.svg` appears after load (written by ImportIcon).
3. Open the editor (default **F3**) → **Gears**: sources under category **Example** should appear; add them to a group if you want meters on the HUD.
4. **Gizmos** gallery → **Mod-added Gizmos** → place **Example (Gear Updated)** and **Example (Push Updated)**. Both icons should shift colour as the count moves 10→0 (edit **Zero colour** / **Ten colour** on each gizmo).
5. Place a **Feed** with **Notifications** turned **on** (and leave the Feed visible / not `none`). When the countdown hits 0 you should see “Example countdown finished”. If Notifications are off, COG logs `COG_API.Notify dropped` and shows nothing — that is intentional.

## Build / deploy

```text
xmake build COG_Example
```

Deploys to `G:\Games\Skyrim\MO2 Instances\Mod - COG\mods\COG - Example API`. Compile `papyrus/COG_Example.psc` to `papyrus/pex/COG_Example.pex` (needs `COG_API.psc` on the import path) before or after first deploy so `Scripts\COG_Example.pex` is present.
