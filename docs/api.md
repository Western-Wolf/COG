# Receiver and layout

**Vocabulary:** 

**Custom Overlay Gadgets** is the product. 
A **Gear** is one registered tracker (appearance + placement). 
**Gadgets** are HUD elements. that display something, usually a Gear ot series of Gears.
**Groups**, **Gauges**, and **Gizmos** are kinds of Gadget. 
- A Group is specialized to show multiple Gears in minimal space.
- A Gauge is designed to show a single Gear in a more customizable manner.
- A Gizmo is anything else. These are advanced Gadgets that may incorporate multiple Gears, or no Gears at all, in order to fulfill a specific purpose. 

## Variable types (what mods register)

Mods register a **named variable**. The menu lists it by `name` + `category` + `type`. A HUD gear appears **only if the user adds that variable as a gear**, except that newly seen third-party sources are offered onto the Default Group once. Sources from `COG.Builtin` are never auto-placed — add them yourself.

| Type key | Papyrus `type` string | Value | Typical use |
|----------|----------------------|-------|-------------|
| Percent | `percent` | current + maximum (percent derived) | Health, meters, needs |
| Count | `count` | integer | Gold, arrows, quest items |
| Timer | `timer` | remaining **real seconds** (≥0). `0` = inactive / hide. Duration is latched from the highest remaining seen so a bar / percentage can be shown | Werewolf / Oxygen countdown |

**Tamrielic date/time is not a Gear.** The clock **Gizmo** reads live calendar + celestial data from the UI snapshot (`gameTime`). Gear `type` is only `percent` / `count` / `timer` (unknown strings fall back to percent).

Aliases accepted: `percentage` → percent, `counter` → count, `timer update` / `countdown` → timer.

## Receipts

1. `RegisterGear(sourceMod, varName, type, displayName, category, icon, startColor, endColor, barColor, hideAt, HUDLinkedElement, HUDHideDuplicate)` → **receipt** (`int`, `0` on failure). Trailing args after `icon` are optional.
   - `icon` is a path **relative to** the overlay icons folder (`PrismaUI/views/COG/assets/icons/`), e.g. `Survival/health.svg` or `Weapons/bow.svg`. Pass `""` when there is no default icon.
   - `startColor` / `endColor` are optional icon colours (`#RRGGBB` or `#RGB`). Behaviour depends on icon format:
     - **SVG / PNG (and other non-GIF/WebP):** both empty = General theme icon colours (default white). One set = solid. Both set = lerp from start at **0%** to end at **100%** (same idea as iWant Themes). Counts with both colours use the end colour (or Neutral icon mode).
     - **GIF / WebP:** both empty = keep the file’s **native** colours (theme white is not applied). Both set = solid tint, lerped 0%→100%. One set = crossfade native ↔ that colour across the meter (only 0% set: tint→native; only 100% set: native→tint). Extension decides the path (static `.webp` still uses these rules).
   - `barColor` is an optional bar fill. Empty = the general fill colour.
   - `hideAt` hides a gear when its live value matches a comparison, e.g. `"<0.3"` or `">99"`. Empty = do not hide from this rule.
     - **percent:** threshold is a 0–1 ratio (e.g. `">0.99"`), or an explicit trailing `%` (`">99%"` → `">0.99"`). Compared to the meter ratio (`value` / 100).
     - **count:** threshold is a raw count (any ≥ 0). Compared to the integer count. Example: `"<1"` hides when empty.
     - **timer:** threshold is remaining **seconds** (any ≥ 0). Compared to `UpdateTimer` remaining time. Timer `0` still hides on its own via inactive-timer rules.
     - The editor exposes Below/Above + a **Threshold** field (0–100 for percent; unrestricted for count/timer). Group **Fill from Hidden** (`style.fillFromHidden`) can soften the reveal for percent/timer gears.
   - Every successful `RegisterGear` writes or updates a definition under `SKSE/Plugins/COG/gears/`. First create copies appearance into both `defaults` and `settings`. Later re-registers overwrite **`defaults` only** (user `settings`, group membership, `enabled`, and layout order stay). Builtin sources stay unplaced until the user adds them on the Groups tab; newly seen third-party sources are still offered onto the Default Group once.
   - `HUDLinkedElement` names a Scaleform HUD target to soft-hide while this variable is **exposed** (enabled gear in a visible group, or a visible gauge bound to that gear). `hideAt` does not clear exposure. Aliases: `hud.health`, `hud.stamina`, `hud.magicka`, `hud.ammo` (vanilla equipped ammo / `ArrowInfoInstance`), `hud.oxygen` (Oxygen Meter 2 menu `oxygenMeter2`), `hud.casting` (Casting Bar menu `CastingBar`), `hud.charge` (right / two-hand `RightChargeMeterAnim`), `hud.leftcharge` (left `LeftChargeMeterAnim`), `hud.compass` (`CompassShoutMeterHolder` — compass + shout), `hud.enemyHealth`, `hud.stealth`, `hud.crosshair`, `hud.activate` (rollover name / info / button / gray bar), `hud.subtitles`, `hud.tutorials`, `hud.questUpdates` (`QuestUpdateBaseInstance`), `hud.notifications` (`MessagesBlock` — also the Feed Notifications divert key), `hud.currentLocation` (`LocationLockBase` — also the Feed Current Location divert key), `hud.inventory` (TrueHUD Recent Loot — soft dependency). You may also pass a raw menu name or `HUD Menu|HUDMovieBaseInstance.Health`. Missing menus/clips are ignored (soft dependency — no install required). RegisterGear seeds these into gear `defaults` / `settings`; Edit Gears can change them (Reset restores RegisterGear defaults).
   - `HUDHideDuplicate` (`Bool`, default `false`) turns that soft-hide on. Pass it explicitly on every `RegisterGear` if you rely on it.
2. Same `sourceMod` + `varName` on a later `RegisterGear` **replaces** the old receipt (safe to call after every load). Empty optional string fields leave the previous values in place; `HUDHideDuplicate` is always taken from the call.
3. Wrap each registration batch with `BeginRegister(sourceMod, pluginFile="")` … `EndRegister(sourceMod)`. The same batch may include `RegisterGizmo` calls.
   - Optional `pluginFile` (e.g. `"MyMod.esp"`) binds the sender to a load-order plugin. If omitted, COG sniffs the caller's owning plugin from the Papyrus stack (skipping `COG_API` and known bridge stubs such as `iWant Status Bars.esp`, so consumer addons bind correctly through the iWant bridge).
   - `EndRegister` discards gears / gizmo types for that mod whose `varName`s / `typeId`s are **not** in the live set. A later batch that only adds more entries keeps the earlier ones. Discarded gears also remove matching **group membership** and **gauges** bound to that `sourceMod`/`varName` (logged). Discarded types cull placed gizmos of those types (logged).
   - Skipping `EndRegister` means missing **varNames** / **typeIds** are never auto-pruned.
   - **Absent senders:** if a plugin is bound and that plugin is not loaded, all of that mod's gears (and bound gauges / group slots) are removed immediately, and that mod's custom **gizmo types** plus placed gizmos of those types are discarded. If no plugin can be bound, COG uses a two-strike rule (absent across two sessions after load grace) before removing.
4. Push values with `UpdatePercent(receipt, current, maximum)` / `UpdateCount` / `UpdateTimer`.
5. `Unregister(receipt)` drops a gear **or** a gizmo type (same session receipt from `RegisterGear` / `RegisterGizmo`). For gears, bound gauges / group slots are removed; for types, placed instances of that type are culled.
6. Receipts live in the SKSE plugin for the **session**, not in the save. Re-register after load. Listen for mod event `COG_Ready`.

Stable identity for user layout JSON is `sourceMod` + `varName`, never the receipt. Sender plugin bindings and strike counts live in `SKSE/Plugins/COG/senders.json`.

## Papyrus (`COG_API`)

```psc
Bool Function IsReady() Global Native
Function SetUiHidden(Bool hidden) Global Native
Bool Function IsUiHidden() Global Native
Function ToggleUiHidden() Global Native
Function BeginRegister(String sourceMod, String pluginFile = "") Global Native
Function EndRegister(String sourceMod) Global Native
Int Function RegisterGear(String sourceMod, String varName, String type, String displayName, String category, String icon, String startColor = "", String endColor = "", String barColor = "", String hideAt = "", String HUDLinkedElement = "", Bool HUDHideDuplicate = false) Global Native
Int Function RegisterGizmo(String sourceMod, String typeId, String displayName, String galleryIcon, Float defaultWidth, Float defaultHeight, String viewScript, String settingsSchemaJson = "[]", String defaultVisibility = "hud") Global Native
Function UpdatePercent(Int receipt, Float current, Float maximum) Global Native
Function UpdateCount(Int receipt, Int value) Global Native
Function UpdateTimer(Int receipt, Float remainingSeconds) Global Native
Function Unregister(Int receipt) Global Native
Float Function GetPlayerBreathRemaining() Global Native
Float Function GetPlayerBreathMaximum() Global Native
Float Function GetPlayerBowDraw() Global Native
Float Function GetPlayerSpellCharge() Global Native
Float Function GetPlayerWeaponCharge() Global Native
Float Function GetPlayerSecondaryWeaponCharge() Global Native
Float Function GetPlayerShoutRemaining() Global Native
Float Function GetPlayerHowlRemaining() Global Native
Int Function GetPlayerVampireStage() Global Native
Int Function GetPlayerArrowCount() Global Native
Int Function GetPlayerBoltCount() Global Native
Function Notify(String asMessage, String asColor = "#FFFFFF", String asIcon = "") Global Native
Function UpdateGizmo(Int receipt, String payloadJson) Global Native
```

`SetUiHidden` / `ToggleUiHidden` / `IsUiHidden` are **session-only** clear-view controls (photos / immersion), **not** a mode that restores vanilla Flash. When hidden, all COG play HUD (gears, gauges, gizmos) is treated like visibility `none` (editor preview still works while the COG editor is open). Gear HUD links, Feed soft-hides, and Suppressor entries are **unchanged** — suppressed clips stay suppressed. If General → **Toggle also hides Flash HUD** is on (default), whole Flash menus are additionally soft-hidden via `_root._alpha` — the same set Ultimate Immersion Toggle uses (`HUD Menu`, `TrueHUD`, `MiniMapMenu`, STB widgets, BTPS, …). Soft dependency: missing menus are ignored. Players can also bind an optional General **Toggle UI** hotkey (click clears when set; click again to bind). The hotkey only fires in free gameplay with menus closed — not in the console, COG editor, search fields, or other open menus. Papyrus `Set`/`Toggle` still work anytime.

`Notify` enqueues into a visible **feed** gizmo with the Notifications section on (optional `#RRGGBB`, optional COG icon path under `assets/icons/` or a registered import under `assets/imports/icons/`). It is a no-op when no matching feed is on-screen. **API / caller icon wins:** a non-empty `asIcon` is never replaced by `gizmos/feed/notifications/*.txt` rules. While notifications are shown, `hud.notifications` soft-hides vanilla `MessagesBlock` and SkyUILib `ShowNotification` / `ShowNotificationIcon` paths are diverted for text + colour (Scaleform icon frames are ignored; diverted toasts with no API icon may resolve from notification rules, else the Feed default icon when Show icons is on).

**Inline Scaleform markup** (also on diverted HUD / SkyUILib toasts): `<font color='#RRGGBB'>` / `#AARRGGBB` (alpha dropped) sets mod colour when no valid explicit colour was passed — font tags are stripped. `<b>`, `<i>`, and `<u>` are rendered as bold / italic / underline. Other tags are stripped. A valid explicit `asColor` / SkyUILib colour arg wins over inline `<font color>`.

### Custom gizmo types

Register a **gizmo product** (not a gear variable). The user places instances from the Gizmos gallery; COG owns transform (`x` / `y` / `width` / `height` / `rotation` / `posAnchor`) and root `visibility`. Your mod owns type settings meaning and drawing via a view script (`gizmo.settings` + `gizmo.livePayload`). Whether to expose `visibility` in your editor is optional (it is not in default COG chrome).

1. On `COG_Ready`: `BeginRegister(sourceMod, pluginFile="")` → `RegisterGear(...)` / `RegisterGizmo(...)` → `EndRegister(sourceMod)`. One batch covers both catalogs.
2. `RegisterGizmo` returns a session **receipt** (`0` on failure). It registers a **type** (gallery product); players place instances. `Unregister(receipt)` drops that type and culls placed instances of it.
3. `viewScript` is a path under `PrismaUI/views/` (e.g. `MyMod/compass.js`). COG loads it as `../MyMod/compass.js` from the COG overlay. The script should call:

```js
window.CogRegisterGizmoRenderer("my-compass", {
  mount(host, gizmo) { /* build DOM under host */ },
  update(host, gizmo) { /* apply gizmo.settings + gizmo.livePayload */ },
  unmount(host) { /* optional cleanup */ }
});
```

Builtin types (`cog-clock`, `cog-shout-meter`, `cog-feed`, `cog-suppressor`) use the **same registry** with richer hooks so routing stays one path: `create()` (instance defaults), `ensure`, `build` / `layout` / `paint`, `fillEditor` (and optional `layoutBox` / `fontSizePx`). Schema still describes expressible scalar fields for snapshots/tools; complex defaults (e.g. clock `displayLines`, suppressor key arrays) stay in `create()`.

4. `settingsSchemaJson` is a JSON array of fields (`string` | `int` | `float` | `bool` | `enum` | `color`). Values persist per instance under `settings`. Missing keys on an instance are filled from the type schema `default`, then from ensure/create universal defaults.
5. Types are written under `gizmoTypes/<typeId>.json` and loaded **before** `gizmos/` so instance fallbacks can use the type record (including `defaultVisibility` / size). Builtins are always re-seeded from code after disk load.
6. `UpdateGizmo(receipt, payloadJson)` pushes live JSON to **every placed instance** of the type for that `RegisterGizmo` receipt (`gizmo.livePayload` in the view). Payload is stashed on the type for the session (not persisted), so delete/recreate and late placements still receive the last push.
7. Any `typeId` starting with `cog-` is reserved for COG. Prefer a short mod prefix for your own types (e.g. `xmp-gearupdated`, `mymod-compass`) so two authors do not collide.
8. Omit a `typeId` from the live set and call `EndRegister` to drop it (same as gears), or use `Unregister(receipt)` / absent-sender. Until `EndRegister`, placed gizmos are **not** deleted merely because their type has not re-registered yet this session (same patience as gear JSON while waiting for `RegisterGear`).

Register for `COG_Ready` (ModEvent) after each load, then `BeginRegister` → `RegisterGear` / `RegisterGizmo` → `EndRegister`, then `Update*` on a poll (or when the value actually changes).

## Builtin sender (`COG - Custom Overlay Gadgets.esp`, ESL-flagged)

Separate light plugin. Papyrus **registers** vanilla `COG.Builtin` sources on load (same `BeginRegister` / `RegisterGear` / `EndRegister` path third-party mods use). **Live values** for those builtins are owned by the native refresh (`RefreshLiveUnlocked`, plus frame-rate bow `PushLivePercent` while drawing) — not by a Papyrus poll. Third-party mods still push their own variables with `Update*`.

| Name | Category | Type | Source | Default icon |
|------|----------|------|--------|----------------|
| Health | Stat | percent | player health % | `Survival/health.svg`; bar `#DF2020`; hides vanilla `hud.health` when exposed |
| Stamina | Stat | percent | player stamina % | `Camping/hiker.svg`; bar `#20DF20`; hides vanilla `hud.stamina` when exposed |
| Mount Stamina | Mount | percent | ridden mount `Stamina` AV while `IsOnMount`; hidden on foot (`hideAt` `<0.01`) | `Animals/horse-head.svg`; bar `#20DF20` (same as Stamina) |
| Magicka | Stat | percent | player magicka % | `Magic/crystal-ball-shiny.svg`; bar `#2020DF`; hides vanilla `hud.magicka` when exposed |
| Carry Weight | Stat | percent | inventory weight / carry weight | `Camping/backpack.svg` |
| Arrows (Equipped) | Equipment | count | equipped arrow ammo while a bow is out | `Weapons/arrows.svg`; hideAt `<0.01`; hides vanilla `hud.ammo` when exposed |
| Bolts (Equipped) | Equipment | count | equipped bolt ammo while a crossbow is out | `Weapons/quiver.svg`; hideAt `<0.01`; hides vanilla `hud.ammo` when exposed |
| Transformation | Werewolf | timer | `PlayerWerewolfShiftBackTime` vs `GameDaysPassed` while beast race (`varName` `Werewolf`) | `Werewolf/wolf.svg`; bar `#EEEEFF` |
| Vampiric Hunger | Vampire | percent | vanilla vampirism stage 1–4 / 4 (`PlayerVampireQuest.VampireStatus`); hidden when not a vampire (`varName` `Bloodlust`) | `Vampire/fangs.svg`; hideAt `<0.01` |
| Oxygen | Survival | timer | remaining breath while the head is underwater; hidden on land and with Waterbreathing | `Survival/oxygen.svg`; bar `#44DDCC`; hides `hud.oxygen` / `oxygenMeter2` if that mod’s menu exists |
| Bow Draw | Charge | percent | bow nock/draw charge (0 when not drawing; crossbows ignored) | `Weapons/bow.svg`; bar `#AA6633`; hideAt `<0.01`; hides `hud.casting` / `CastingBar` if present (**shared** with Spell Casting / Shout Cooldown) |
| Spell Casting | Charge | percent | left/right hand spell charge (0 when not charging) | `Magic/sparkles.svg`; bar `#7744DD`; hideAt `<0.01`; hides `hud.casting` / `CastingBar` if present (**shared** with Bow Draw / Shout Cooldown) |
| Weapon Charge | Charge | percent | enchantment charge on the primary hand (right-hand one-hander, or two-handed weapon / bow / staff); live `RightItemCharge` AV | `Actions/hand-right.svg`; hideAt `<0.01`; hides vanilla `hud.charge` when exposed |
| Secondary Weapon Charge | Charge | percent | enchantment charge on the secondary (left) hand; live `LeftItemCharge` AV | `Actions/hand-left.svg`; hideAt `<0.01`; hides vanilla `hud.leftcharge` when exposed |
| Shout Cooldown | Charge | timer | shout voice recovery remaining (depletes like Oxygen; 0 when ready); hidden in werewolf / vampire lord form (`varName` `Shout`) | `Actions/shout.svg`; bar `#5ba4f9` (same secondary as Shout Meter gizmo); hides `hud.casting` / `CastingBar` if present (**shared** with Bow Draw / Spell Casting) |
| Howl Cooldown | Charge | timer | werewolf howl voice recovery remaining; only while beast race (`varName` `Howl`) | `Werewolf/wolf-side.svg` |
| Fire Resistance | Resistance | percent | `FireResist` AV / 100 (can exceed 100%) | `Survival/fire.svg`; icon ends `#ffffff` / `#ffffff` |
| Frost Resistance | Resistance | percent | `FrostResist` AV / 100 | `Weather/snowflake.svg`; icon ends `#ffffff` / `#ffffff` |
| Shock Resistance | Resistance | percent | `ElectricResist` AV / 100 (`varName` `ShockResist`) | `Weather/lightning.svg`; icon ends `#ffffff` / `#ffffff` |
| Poison Resistance | Resistance | percent | `PoisonResist` AV / 100 | `Alchemy/skull-and-bones.svg`; icon ends `#ffffff` / `#ffffff` |
| Magic Resistance | Resistance | percent | `MagicResist` AV / 100 | `Magic/sparkles.svg`; icon ends `#ffffff` / `#ffffff` |
| Disease Resistance | Resistance | percent | `DiseaseResist` AV / 100 | `Survival/virus.svg`; icon ends `#ffffff` / `#ffffff` |

`sourceMod` for the builtin sender is `COG.Builtin`. `varName` is a stable id (`Health`, `Werewolf`, …). Icons stay white unless a sender sets `startColor` / `endColor`. Unset `barColor` uses the general fill colour.

**Inventory gears (`COG.Inventory`)** — created from the Gears tab **Create Inventory Gear** section (or pre-installed). Each gear tracks one item form by count from the player inventory (`varName` is the 8-digit hex form id). **Septims** ships as a normal gear JSON under `config/gears/` (`Gold001` / `Treasure/bag-of-coin.svg`, deletable). **Stones of Barenziah** is ensured in C++ and locked (quest items can’t be placed in the picker). Locked inventory gears cannot be deleted.

### Icon folders

Icons live under `PrismaUI/views/COG/assets/icons/`. Each subfolder becomes a picker section.

The editor lists icons **live from disk** (each snapshot rescans `assets/icons/` plus `assets/imports/icons/`). Drop files into any subfolder under `assets/icons/` and they appear in the picker after the next UI refresh. **`ImportIcon(sourceMod, iconName, sourcePath)`** copies/converts a Data-relative source into `assets/imports/icons/<mod>/`, indexes it, and returns the imports-relative path (preferred for files outside COG asset trees). **`RegisterImportedIcon`** only indexes a path already under that imports tree. Fonts ship or drop under `assets/fonts/` (flat — no subfolders); there is no Papyrus font-import API yet. `assets/imports/fonts/` exists only for parity with icons and may be used later if there is demand.

| Folder | Contents |
|--------|----------|
| `Actions` | Shout, speak, wait, sleep, hand-left / hand-right (weapon charge) |
| `Alchemy` | Potions, skull, skull-and-bones, water drops |
| `Animals` | Cow, dog, deer, goat, horse, husky (and head variants) |
| `Armour` | Helms, gauntlets, greaves, boots, breastplate (male/female) |
| `Camping` | Tent, campfire, backpack, hiker, axe, firewood, map, compass |
| `Celestial` | Moons (moonphase-*), moon-and-stars, star, sun |
| `Clothing` | Hats, hoods, robes, shirts, shoes, cloaks, apron, dresses |
| `Crafting` | Ingot, ore, leather, anvil, hammer |
| `Food and Drink` | Produce, meat, poultry, bread, cheese, soup, drinks, cutlery |
| `Frames` | Solid circle, square, rectangle, triangle, pentagon, hexagon, octagon — Frame gauge silhouettes |
| `Pictures` | Knotwork artwork for Frame picture mode (`picture-01` …) |
| `Jewellery` | Rings, amulets, necklaces, coronet, crown |
| `Magic` | Crystal balls, pentacles, sparkles, wand |
| `Restraints` | Handcuffs, rope |
| `Scribe` | Books, scrolls, quills, inkwell, list |
| `Seasons` | Seasonal markers |
| `Survival` | Health, oxygen, fire, bacteria, virus, hearts |
| `Treasure` | Bags, coins, gems, key, chests, treasure map |
| `Vampire` | Fangs |
| `Weapons` | Swords, bows, arrows, quivers, shields, staves, hammers, axes |
| `Weather` | Rainclouds, clouds, lightning, cloud-lightning, cloud-lightning-rain, snowflake, umbrella |
| `Temperature` | Thermometer empty / quarter / half / threequarter / full |
| `Werewolf` | Wolf icons |
| `Endcaps` | Meter / celestial endcap art (any SVG under `icons/Endcaps/`) |

Shipped icons are mostly SVG masks (tint with icon colours). **GIF** and **WebP** keep authored pixels when colours are blank and support animation; see Register `startColor` / `endColor` above.

Meter endcap art lives under `PrismaUI/views/COG/assets/icons/Endcaps/` (same catalog as other icons).

## Files (not the save)

COG loads `Data/SKSE/Plugins/COG/` at startup. Each group and each gauge is its own JSON file. The Prisma editor writes these in-game.

**MO2 packaging:** `groups/default.json` is **not** shipped with the mod — it is created on first load (so the write lands in Overwrite and survives reinstall). A blank `seen.json` (`{"keys":[]}`) **is** shipped in the mod folder (deploy refreshes it). Runtime updates rewrite that shipped file in the mod directory; it does **not** land in Overwrite. A clean reinstall therefore wipes `seen.json` and can re-offer imported gears that are not already placed in a group / shipped as premade gear JSON.

```
SKSE/Plugins/COG/
  general.json
  seen.json
  senders.json
  imported-icons.json
  groups/default.json
  groups/<id>.json
  gears/<id>.json
  gauges/<id>.json
  gizmos/<id>.json
  gizmos/feed/notifications/_COG.txt
  gizmos/feed/notifications/<Override>.txt
  gizmos/feed/inventory/_COG.txt
  gizmos/feed/inventory/<Override>.txt
  gizmos/feed/location/_COG.txt
  gizmos/feed/location/<Override>.txt
  gizmos/feed/effects/_COG.txt
  gizmos/feed/effects/<Override>.txt
  gizmos/feed/skills/_COG.txt
  gizmos/feed/skills/<Override>.txt
```

### Feed icon registries (`gizmos/feed/<section>/*.txt`)

All five feed sections share one **IconRegistry** grammar. Hand-edited text (not JSON). Loaded at startup after config. **Last wins:** files A→Z and lines top→bottom; identical LHS replaced by later files/lines. `_COG.txt` ships first / lowest file precedence. Deploy always refreshes each section’s `_COG.txt` only (never other `*.txt` overrides).

**Shared base** (every section): kinds `name`, `form`; ops `equals` / `notequals` / `contains` / `notcontains`. Needles are backtick-delimited; matching is case-insensitive; spaces inside backticks matter. Multiple ops on one line are ANDed (same kind). Icon paths are relative to `PrismaUI/views/COG/assets/icons/` (lowercased on load).

```
# comment
name equals `Chef's Hat` = Clothing/hat-chef.svg
name contains `wine` = Food and Drink/bottle.svg
form equals `Skyrim.esm:0001397D` = Weapons/broadsword.svg
```

Unknown kinds for a section are skipped with a warning (e.g. an `av` rule under `inventory/` does not apply).

| Section | Folder | Extra kinds | Resolve fallback |
|---------|--------|-------------|------------------|
| Notifications | `feed/notifications/` | (base only) | gizmo `notificationIcon` when Show icons is on |
| Inventory | `feed/inventory/` | `keyword`, `formtype`, `weapontype`, `armortype`, `armorslot` | gizmo Default Icon → `Treasure/bag.svg` |
| Location | `feed/location/` | `kind` (`discovery` / `current`) | gizmo discovery / current icons |
| Active effects | `feed/effects/` | `keyword`, `formtype`, `av`, `archetype` | gizmo `effectIcon` → `Magic/sparkles.svg` |
| Skills | `feed/skills/` | (base only) | gizmo `skillIcon` (level-up / Level Progress use `levelIcon`) |

**Notifications — priority (API icon always wins):**

1. Non-empty icon from `Notify` / divert caller — **disk rules never override**
2. Else matching `notifications/*.txt` rule (`name` = translated toast text)
3. Else feed gizmo Notification Defaults icon when Show icons is on

**Breaking:** older `name Foo = path` lines (no operator / backticks) are invalid; use `name equals \`Foo\` = path`.

**Inventory extras** (candidates from the item):

| Kind | Candidates | Notes |
|------|------------|--------|
| `keyword` | keyword EditorIDs | e.g. `WeapTypeSword` |
| `formtype` | engine 4-char code | `weap`, `armo`, `alch`, … |
| `weapontype` | `WEAPON_TYPE` | `onehandsword`, `bow`, … |
| `armortype` | light/heavy/clothing | `lightarmor`, `heavyarmor`, `clothing` |
| `armorslot` | biped slots | `head`, `body`, `hands`, `shield`, … |

**Effects:** `form` matches the magic effect (MGEF), not the spell. Extras: `av` (primary/secondary AV + school), `archetype` (`GetArchetypeAsString()`).

**Location:** `name` = translated place text; `kind equals \`discovery\`` / `kind equals \`current\``. Empty resolve → UI keeps gizmo discovery/current defaults.

**Skills:** `name` candidates include HUD banner text, ActorValue string (e.g. `OneHanded`), and localized AV name.

### `general.json`

```json
{
  "showDefaultGroup": true,
  "editorKey": "F3",
  "fillColor": "#c4a35a",
  "borderColor": "#e8d2a0",
  "iconStartColor": "#ffffff",
  "iconEndColor": "#ffffff",
  "neutralIconMode": "white",
  "gadgetFont": "Roboto",
  "logLevel": "info"
}
```

Default Group visibility lives here (on by default). The Default Group cannot be deleted. `editorKey` is the keyboard key that opens and closes the Prisma editor (click the hint in the top-right to rebind, or edit this field). `fillColor` and `borderColor` are the defaults used when a gear’s `settings` do not set its own; bars use fill, and border is used when the bar trough is on. `iconStartColor` / `iconEndColor` tint **SVG/PNG-style** icons that do not set their own `startColor` / `endColor` in gear settings: the icon colour lerps from start at 0% to end at 100% for percent/timer gears. Default icon tint is white. **GIF/WebP** icons ignore these theme defaults when both gear/group icon ends are blank — they stay native. `neutralIconMode` paints count icons (no meter progress): `white` (default, always `#ffffff`), `bar`, `border`, `icon0`, `icon50`, or `icon100`, using the same colour cascade as other icon paints for that gear. `gadgetFont` is the family name for HUD gadget text (file stem from `PrismaUI/views/COG/assets/fonts/`, default `Roboto`). The shout meter keeps Dragon Script regardless. Drop additional `.ttf` / `.otf` files in that folder to make them selectable. `logLevel` is `"info"` (default), `"debug"`, or `"trace"` — applied at load and rewritten on every config save from the in-memory value; edit with the game closed (not shown in the editor UI).

### Group file (`groups/<id>.json`)

A group is a **line**. Gears sit along it from the start (`x` / `y`, 0–1 of the screen). `rotation` is degrees (`0` is left-to-right). `gearSize` (pixels, default 50) is the icon square. With the icon off, that value is the gear **height** and text can be as wide as it needs. `stack` is `right`, `left`, `above`, or `below` (default `below`): label and amount (bar and/or number) stack vertically, and this chooses which side of the icon they sit on. Beside the icon they match its height; above or below they match its width. `spacing` (pixels, default 25) is the gap between gears. Line length comes from those gears.

```json
{
  "id": "default",
  "name": "Default Group",
  "locked": true,
  "visible": true,
  "x": 0.1,
  "y": 0.1,
  "rotation": 0,
  "gearSize": 50,
  "spacing": 25,
  "stack": "below",
  "style": {
    "showLabel": false,
    "showIcon": true,
    "showNumber": true,
    "barTrough": true,
    "fillFromHidden": "",
    "numberFormat": "barPercent",
    "useGroupColors": false,
    "startColor": "",
    "endColor": "",
    "barColor": "",
    "borderColor": "",
    "neutralIconMode": "white"
  },
  "gearIds": ["COG_Builtin_Health"]
}
```

`numberFormat` is the amount display for percent and timer gears: `bar`, `barPercent`, `barTotal`, `percent`, or `total` (default `barPercent`). Percentage is `72%`. Total is `180/250` for percent sources and remaining time (`1:20`) for timers. Bar + number overlays the value on the bar. `barTrough` (default on for new groups) draws a background behind the fill and uses the border colour (group border when group colours are on, otherwise General). Count gears always show their number.

`fillFromHidden` (empty/`""` by default = off) softens each gear’s `hideAt` on percent/timer sources. Values: `""` | `alpha` | `up` | `down` | `alphaUp` | `alphaDown`.

- `alpha` — opacity ramps from 0 at the hide threshold toward full visibility at the opposite end of the meter (e.g. hide `>0.999` fades in toward 0%; hide `<0.01` fades in toward 100%). At full hide the gear is still removed from layout.
- `up` / `down` — icon stays in layout as greyscale and fills with the current icon colour from the bottom (`up`) or top (`down`). A thin soft seam at the fill frontier is ~50% fill colour / ~50% greyscale.
- `alphaUp` / `alphaDown` — same directional fill, but the unfilled greyscale uses bar-trough opacity (~0.55).

**Fill colour by icon format (Up/Down/combos):** SVG/PNG-style icons use the same flat tint rules as normal display (theme fallback when ends are blank). GIF/WebP use native colours when both ends are blank; both ends set → tint lerp; one end set → native↔tint blend (see Register colours above). The greyscale trough is always a filtered copy of the icon (animation continues on GIF/WebP).

Counts keep hard hide. Inactive timers still hard-hide.

**Group colours:** `useGroupColors` (off by default) makes gears on the line use the group’s `startColor` / `endColor` / `barColor` / `borderColor` / `neutralIconMode`. Empty group colour fields fall back to General defaults for SVG/PNG-style icons and bars; for GIF/WebP icon ends, empty still means **native** (not theme white). Gears with `exemptFromGroupColors` keep their own settings and General’s `neutralIconMode` instead. Groups still own layout and group style; per-gear appearance stays in each gear file.

### Gear file (`gears/<id>.json`)

One file per registered tracker (`mod` + `name`). This file is the source of truth for **gear appearance and behavior** only (`enabled`, `defaults`, `settings`, `exemptFromGroupColors`). **Group membership is not stored here** — it lives in `groups/<id>.json` → `gearIds`.

```json
{
  "id": "COG_Builtin_Health",
  "mod": "COG.Builtin",
  "name": "Health",
  "enabled": true,
  "exemptFromGroupColors": false,
  "defaults": {
    "display": "Health",
    "icon": "Survival/health.svg",
    "startColor": "",
    "endColor": "",
    "barColor": "#DF2020",
    "hideAt": "",
    "hudLinkedElement": "hud.health",
    "hudHideDuplicate": true
  },
  "settings": {
    "display": "Health",
    "icon": "Survival/health.svg",
    "startColor": "",
    "endColor": "",
    "barColor": "#DF2020",
    "hideAt": "",
    "hudLinkedElement": "hud.health",
    "hudHideDuplicate": true
  }
}
```

- **`defaults`** — last Register appearance; used by Edit Gears → Reset.
- **`settings`** — what the HUD renders when group colours are off, or when this gear is exempt; editable in the Gears tab. `startColor` / `endColor` follow the Register colour rules (SVG/PNG vs GIF/WebP). `hideAt` is the hide rule (percent = ratio, count = raw value, timer = seconds); group `fillFromHidden` can soften it for percent/timer gears. `hudLinkedElement` / `hudHideDuplicate` are the same Register HUD suppression fields; soft-hide uses the gear’s effective settings (Reset restores Register defaults). Shared aliases (e.g. `hud.casting`) still hide one target if any exposed linked gear asks for it.
- **`exemptFromGroupColors`** — when the parent group has `useGroupColors`, keep this gear on its own settings instead.
- **Placement** — add or remove gears on the Groups tab; order within a line is the order of `gearIds` in that group file.
- Dropping a tracker (`Unregister`, `EndRegister` prune, missing plugin, two-strike) deletes that gear’s JSON, removes it from groups, and discards gauges bound to that gear (logged).
- Dropping a custom gizmo type (`Unregister` on its receipt, `EndRegister` prune, missing plugin, or two-strike) deletes placed gizmos of that mod/type (logged). Until `EndRegister` / absent-sender, gizmos are kept across load while waiting for types to re-register (same patience as gear JSON).

Stable identity remains `sourceMod` + `varName` (`mod` / `name` here), never the session receipt.

### Gauges

Each file under `gauges/<id>.json` is one gauge. Shared fields: `type` (`meter` | `frame`), `gearMod` / `gearName`, `x` / `y` (0–1 **top-left** of the layout box; rotation is still around the box center), `posAnchor` (`tlc` = top-left of visible content), `rotation`, `width` / `height` (px), `visible`, `locked`.

**Meter** (`type: "meter"`): `shape` (`bar` | `arc`, default `bar`), `showIcon`, `showLabel`, and `showNumber` (`none` | `left` | `right` | `centered` | `up` | `down`), `iconColorMode` (`border` | `keep` | `bar` | `label` — default `border`; uses gauge border colour, gear icon colours, bar fill, or label colour), `labelColorMode` (`border` | `keep` | `bar` | `icon` — default `border`), `numberColorMode` (same options as label colour; default `border`), `numberAsPercent` (bool), `fontSize` (px for title/number; `0` or omitted = auto from icon/band size, same as clock gizmos). When icon and label share the same placement, the label sits farther from the gauge than the icon. Label text alignment: on bars, left/right placements use inverse alignment (text flows away from the bar); on arcs and for up/down/centered, alignment matches placement (center for up/down/centered). Arc labels are width/height capped to the available hollow and scale/wrap like group gear titles. Meter shape fields (both `bar` and `arc`): `borderColor`, `borderThickness` (% of band height), `troughOpacity` (%), `endCapMode` (`border` | `endcap`, default `border` — extend side borders, or endcap art; legacy `icon` normalizes to `endcap`), `endCap` (icon path; Endcaps-folder picker with optional See all Icons; defaults to the first catalogued Endcaps file alphabetically, or empty), `endCapOverlap` (% of width hidden under each cap; endcap mode only), `fillDirection` (`left` | `right` | `center`). For `shape: bar`, width is the bar length and height is band thickness. For `shape: arc`, width is the semicircle diameter (left-to-right span) and height is the radial band thickness — the arc is a half-circle bar with the same trough, fill, borders, endcaps, and sheen as a flat bar. On arcs, `left`/`right` share the hollow between the endcaps: the icon pins to the chosen side, and a left or right label fills the remaining width of that hollow (so text can stay larger). `up` is above the peak and `down` is below the baseline.

**Frame** (`type: "frame"`): decorative bezel + bound gear. Frame-level: `frameShape` (Shape picker; path under `Frames/`, default `Frames/circle.svg`; Frames-folder picker with optional See all Icons), `frameFillColor` / `frameBorderColor` (blank = transparent; new frames seed stock General border `#e8d2a0` / fill `#c4a35a` as copied hex, not live-linked), `frameBorderThickness` (% of min(width,height), default `5`), `insideSize` (% scale of gear/picture content inside the border plate, default `65`; pictures stay fully visible and are clipped only by the frame shape), `displayMode` (`gear` | `picture`), `alwaysVisible` (default `true` — stay shown when vanilla HUD is off or the gear would soft-hide), `rotation` (rotates **bezel only**). Gear mode: Icon / Title / Number each take a vertical slot `none` | `top` | `middle` | `bottom` (`showIcon` / `showLabel` / `showNumber`; defaults Title `top`, Icon `middle`, Number `bottom`; duplicate slots are cleared — priority Icon → Number → Title). `showNumber` gates whether the number (and mini-bar) appear; `numberFormat` defaults to `barPercent` (same as groups) and `barTrough` defaults on for frames; `numberFormat` (`bar` | `barPercent` | `barTotal` | `percent` | `total`) only controls presentation when the number slot is on. Off items are omitted; the visible stack is centered in the plate and Top/Middle/Bottom only order siblings relative to each other (`barTrough`, `fontSize` also apply). Content stays upright. Picture mode: `pictureIcon` (default = alphabetically first under `Pictures/`; Pictures-folder picker with optional See all Icons), `pictureDirection` (`out` | `in` | `up` | `down` | `left` | `right`, default `out`; frame-local, ignores picture angle), `pictureRotation` (artwork only), `pictureEmpty` / `pictureFull` / `pictureFade` (defaults black / white / stock General fill `#c4a35a`; each field is independent — blank fill/border = transparent, blank fade restores the stock fade default; none live-track General or each other; progress uses a soft fade frontier with a light glow). Bound gear is value-only for progress; timers snap full briefly then drain; fade straddles the frontier.

### Gizmos

Each file under `gizmos/<id>.json` is one gizmo.

**Root (universal):** `id`, `name`, `type`, `sourceMod`, `x` / `y` (0–1 **top-left** of the layout box; rotation around the box center), `posAnchor` (`tlc` = top-left of visible content), `rotation`, `width` / `height` (px), `visibility`, `settings` (object). Runtime-only: `livePayload` (not persisted).

**`visibility`:** `none` | `hud` | `ui`. Omitted / unknown → `hud`. Editor labels: **HUD Visible** / **UI Visible**.

| Mode | Editor label | Behavior |
|------|--------------|----------|
| `none` | None | Mounted only while the COG editor is focused (preview) |
| `hud` | HUD Visible | Default for most gizmos — mounted when the vanilla Heads-Up Display is shown |
| `ui` | UI Visible | Also mounted while menus soft-hide the HUD (inventory, map, dialogue, load, …) |

Create defaults: **suppressor** writes `none`, **feed** writes `ui` (stay visible in menus), others write/omit `hud`. Type authors may expose a Visibility control; it is not automatic chrome.

**Type fields** live under nested `settings` (same contract as custom schema gizmos).

- **`clock`** — `fontSize`, `textAlign`, `displayMode`, `displayLines`, `timeFormat`, colours, `borderThickness`, `endCapMode` / `endCap` / `endCapOverlap` on the celestial arc, etc.
- **`shout-meter`** — `fontSize`, `textAlign`, `drainOrigin`, `wordsMode`, primary/secondary colours, trough opacity.
- **`feed`** — combined toast stack for **notifications**, **inventory**, **location**, **active effects**, and/or **skills** (section toggles `showNotifications` / `showInventory` / `showLocation` / `showActiveEffects` / `showSkills`, all off by default). Timing/backdrop: `maxVisible` (default 15), `stackOrigin` (default `top`), `textAlign` (default `left`), `iconPlacement` (`left`/`right`, default `left`), `durationMs` / `fadeMs`, `backdropColor` / `backdropOpacity` / `backdropDirection` (default `down`), size 400×400. Gallery icon `Scribe/list.svg`. Menu stay uses root `visibility: "ui"` (UI Visible; not Inventory always-visible). **Progress Bar** (shared): `barColor` (default `#c4a35a`, same as General backup bar), `progressBarWidth` (default 20), `numberFormat` (default `barTotal` — bar and value). **Notification defaults:** `textColor`, `notificationIcon` (default `Actions/speak.svg`), `showNotificationIcons` (default on). **Notification overrides:** `allowModNotificationIcon` / `allowModNotificationColor` (default on). `suppressInventory` (default **on**) only when Inventory is off — diverts inventory-style toasts into Notifications (activators often fire those). **Inventory:** tracks real item add/remove; soft-hides `hud.inventory` (TrueHUD Recent Loot); starves inventory-style notification toasts (Feed-owned); fixed line layout (item name then `(±total)`); `icon`, `showInventoryIcons` (default on), `addColor` / `removeColor` / `stolenColor`. **Location:** `showLocationDiscovery` / `showCurrentLocation`; Current Location soft-hides `hud.currentLocation`; Discovery diverts from `hud.questUpdates` (no separate suppress key); `showLocationIcons` (default on); discovery/current icons/colours. **Active effects:** one row per EffectSetting (MGEF); when several instances share a type the longest remaining timer wins; `effectsMinSec` / `effectsMaxSec`, `showEffectIcons` (default on) / `showEffectText` / `showEffectTimer`, `effectIcon`, `effectsColor`, `suppressTransformEffects`. **Skills:** diverts center skill / level-up banners from `hud.questUpdates` (no separate suppress key); `showSkillIcons` (default on), `skillIcon`, `levelIcon`, `showLevelProgress` (default on). Shared icon rules for all five sections under `SKSE/Plugins/COG/gizmos/feed/` (see **Feed icon registries**). Does not block the Level Up Menu.
- **`suppressor`** — red stop marker in the editor only when `visibility` is `none` (default). Soft-hide lists in settings: `alwaysHide`, `neverHide` (exempt wins). Feed Notifications soft-hides `hud.notifications` (`MessagesBlock`) and diverts toasts; Feed Current Location soft-hides `hud.currentLocation` (`LocationLockBase`) and diverts; Feed Location Discovery and Skills divert those banners from `hud.questUpdates` (`QuestUpdateBaseInstance`) with no separate suppress keys; Feed Inventory tracks item changes, soft-hides `hud.inventory` (TrueHUD Recent Loot; soft dependency), and starves inventory-style `hud.notifications` toasts (Feed-owned). Suppressions help tab winning order: Suppressor > other Gizmos > Gauges > Groups. Gallery icon `Actions/stop.svg`, default size 100×100.

## UI split

- **HUD groups** — lines of gears, shown whenever the vanilla HUD is shown (hidden in dialogue, menus, and when the HUD is toggled off). The line graphic is editor-only. Opening a group on the Groups tab raises that line above the editor so it can be dragged; closing it sends it back behind the panel.
- **HUD gauges** — single-gear indicators (meters and frames), independent of groups. Opening a gauge on the Gauges tab raises it above the editor for drag / rotate / resize.
- **Editor** — bound key (default F3) focus only: General, Gears, Groups, Gauges, Gizmos. Centered ~60em panel. Edit appearance (and reset to Register defaults) on the Gears tab; add and position gears on the Groups tab; add gauges on the Gauges tab. Rebind by clicking the key in the top-right, or by setting `editorKey` in `general.json`.
