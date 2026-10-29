ScriptName COG_API Hidden
{Public Papyrus API for Custom Overlay Gadgets. Receipts last for the SKSE session only.}

; True when COG is not mid-load (Loading Menu / PreLoadGame). False while that gate is armed.
; Prefer COG_Ready for setup; use IsReady to skip work during load or poll until settle.
Bool Function IsReady() Global Native

; True when pluginFile is in the active load order (full or light / ESL-flagged .esp).
; Use before Register / Notify loops so a disabled ESP with loose scripts still installed cannot keep ticking.
Bool Function IsPluginLoaded(String pluginFile) Global Native

; --- UI hide (session only) ---
; Hides all COG play HUD (gears / gauges / gizmos) as if visibility were "none".
; When General → "Toggle also hides Flash HUD" is on (default), also soft-hides Flash
; menus (HUD Menu, TrueHUD, MiniMap, STB widgets, BTPS, …) via _root._alpha.
; Editor preview still works while the COG editor is open. Not persisted across loads.
Function SetUiHidden(Bool hidden) Global Native
Bool Function IsUiHidden() Global Native
Function ToggleUiHidden() Global Native

; --- Registration batch (gears + gizmo types) ---
; Call BeginRegister(sourceMod, pluginFile) before RegisterGear / RegisterGizmo, EndRegister when complete.
; pluginFile is optional (e.g. "MyMod.esp"). If omitted, COG tries to sniff the caller's owning plugin.
; EndRegister prunes gears / gizmo types for that mod whose varNames / typeIds are not currently
; registered (additive batches keep prior entries). Without EndRegister, missing names are never
; auto-removed (open / additive batches).
; Absent senders: plugin-bound mods are pruned when the plugin is not loaded; unbound mods use a two-strike rule.
Function BeginRegister(String sourceMod, String pluginFile = "") Global Native
Function EndRegister(String sourceMod) Global Native

; --- Gears (live variables) ---
; type: "percent" | "count" | "timer"
; category: grouping for the editor filter, e.g. "Base Game"
; icon: path relative to the overlay icons folder, e.g. "Survival/health.svg" or "Weapons/bow.svg". Pass "" for none.
; iconColor: optional icon tint — #RRGGBB, or JSON stops [{"pct":0,"color":"#fff"},{"pct":100,"color":"#f00"}] (lerp between).
;   Empty = General backup icon. Legacy: pass a second #hex in legacyEndColor for a 0%/100% pair (old start/end callers).
; barColor: optional bar fill — same hex-or-JSON-stops shape. Empty = General backup bar.
; hideAt: optional hide rule. Percent: 0–1 ratio e.g. "<0.3", or explicit percent e.g. ">99%". Count: raw number e.g. "<1". Timer: seconds e.g. "<30". Empty = never hide from this.
; HUDLinkedElement: optional Scaleform target to soft-hide while this variable is shown on a visible group or bound to a visible gauge.
;   Aliases: hud.health, hud.stamina, hud.magicka, hud.ammo (vanilla equipped ammo), hud.oxygen (Oxygen Meter 2), hud.casting (Casting Bar),
;   hud.charge (right / two-hand enchantment meter), hud.leftcharge (left-hand enchantment meter).
;   hud.casting is shared by Bow Draw, Spell Casting, and Shout Cooldown — any exposed gear keeps Casting Bar hidden.
;   Or a menu name (oxygenMeter2, CastingBar), or "HUD Menu|HUDMovieBaseInstance.Health".
;   Missing menus/clips are ignored (soft dependency).
; HUDHideDuplicate: when true, hide HUDLinkedElement while this source is exposed. Pass every RegisterGear; default false.
; Re-registering the same sourceMod+varName returns the existing receipt.
Int Function RegisterGear(String sourceMod, String varName, String type, String displayName, String category, String icon, String iconColor = "", String legacyEndColor = "", String barColor = "", String hideAt = "", String HUDLinkedElement = "", Bool HUDHideDuplicate = false) Global Native

Function UpdatePercent(Int receipt, Float current, Float maximum) Global Native
; Same as UpdatePercent, but finds the source by sourceMod+varName (useful when a receipt may have drifted).
Function UpdatePercentByKey(String sourceMod, String varName, Float current, Float maximum) Global Native
Function UpdateCount(Int receipt, Int value) Global Native
Function UpdateTimer(Int receipt, Float remainingSeconds) Global Native
; Drop a gear or gizmo type by session receipt (from RegisterGear / RegisterGizmo).
Function Unregister(Int receipt) Global Native

; Copy/convert sourcePath (Data-relative, e.g. "Interface/exported/MyMod/icon.dds") into
; assets/imports/icons/, index it, and return the imports-relative path (e.g. "MyMod/icon.png").
; "" on failure. Prefer this over RegisterImportedIcon for files outside COG's asset trees.
String Function ImportIcon(String sourceMod, String iconName, String sourcePath) Global Native

; Record a path already under assets/imports/icons/ in COG's import index (no copy).
; Prefer ImportIcon when the file still lives outside that tree.
Bool Function RegisterImportedIcon(String iconPath) Global Native

; Remaining seconds of player breath while drowning. 0 when not underwater / Waterbreathing (inactive).
Float Function GetPlayerBreathRemaining() Global Native
Float Function GetPlayerBreathMaximum() Global Native

; 0-1 bow nock/draw charge. 0 when not drawing.
Float Function GetPlayerBowDraw() Global Native
; 0-1 spell charge on the hand currently charging. 0 when not charging (instant spells ignored).
Float Function GetPlayerSpellCharge() Global Native
; 0-1 enchantment charge on the primary hand (right / two-handed weapon or staff). 0 when unequipped or unenchanted.
Float Function GetPlayerWeaponCharge() Global Native
; 0-1 enchantment charge on the secondary hand (left). 0 when unequipped or unenchanted.
Float Function GetPlayerSecondaryWeaponCharge() Global Native
; Remaining shout recovery seconds. 0 when ready or in werewolf form.
Float Function GetPlayerShoutRemaining() Global Native
; Remaining werewolf howl recovery seconds. 0 when ready or not in werewolf form.
Float Function GetPlayerHowlRemaining() Global Native

; Vanilla vampirism stage 0-4 (PlayerVampireQuest.VampireStatus). 0 = not a vampire.
Int Function GetPlayerVampireStage() Global Native

; Count of equipped arrow ammo while a bow is out. 0 otherwise.
Int Function GetPlayerArrowCount() Global Native
; Count of equipped bolt ammo while a crossbow is out. 0 otherwise.
Int Function GetPlayerBoltCount() Global Native

; Migration Code for Transition from v1.01 or earlier to v1.1:
; Prefer COG_Feed_API.Notify (supports source + meter + receipt). This shell forwards message/colour/icon only.
; Push a toast into a visible Feed gizmo with notifications enabled (text + optional #RRGGBB + optional COG icon path).
; No-op when no matching feed is on-screen. Prefer this (or SkyUILib) over Debug.Notification
; when you want coloured toasts that COG can own while a feed is active.
; asIcon is a path under assets/icons/ or a registered import under assets/imports/icons/
; (e.g. "Actions/speak.svg" or "COG_Example/light-bulb-fill.png"); ignored unless the Feed has Show icons on.
Function Notify(String asMessage, String asColor = "#FFFFFF", String asIcon = "") Global Native

; --- Custom gizmo types ---
; RegisterGizmo registers a gallery type (not a placed instance). Players place instances from the editor.
; COG owns transform (x, y, width, height, rotation, visibility). Your viewScript owns drawing via gizmo.settings.
; viewScript: path under PrismaUI/views/, e.g. "MyMod/compass.js" (loaded as ../MyMod/compass.js from COG).
; settingsSchemaJson: JSON array of editor fields, e.g.
;   [{"key":"textColor","kind":"color","label":"Text","default":"#e8d2a0"}]
; kinds: string | int | float | bool | enum | color. enum needs "options":[...].
; Use the same BeginRegister / EndRegister batch as gears. Returns a session receipt (0 on failure).
; typeIds starting with "cog-" are reserved for COG. Prefer a short mod prefix (e.g. xmp-, mymod-).
; Type catalog is persisted and loaded before gizmo instances. Missing instance fields fall back to
; this type record (defaultVisibility / defaultWidth/Height / settingsSchema defaults), then universal defaults.
; defaultVisibility: "hud" | "ui" | "none" (default "hud").
Int Function RegisterGizmo(String sourceMod, String typeId, String displayName, String galleryIcon, Float defaultWidth, Float defaultHeight, String viewScript, String settingsSchemaJson = "[]", String defaultVisibility = "hud") Global Native
; Push live JSON to every placed instance of the gizmo type for this RegisterGizmo receipt.
; Stashed on the type (session-only) so delete/recreate and late placements still get it.
; Your view script reads gizmo.livePayload (or livePayloadJson) in update().
Function UpdateGizmo(Int receipt, String payloadJson) Global Native
; Type-owned data folder under SKSE/Plugins/COG, relative path e.g. "gizmos/cog-feed" or "gizmos/mymod-compass".
; COG creates the folder if missing (also on RegisterGizmo). Build subpaths in your own code
; (translations, icon maps, …), e.g. GizmoStorage(typeId) + "/translations".
; View scripts: window.CogGizmoStorage(typeId) returns the same relative string.
String Function GizmoStorage(String typeId) Global Native
