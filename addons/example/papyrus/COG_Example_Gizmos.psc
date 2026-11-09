ScriptName COG_Example_Gizmos extends Quest
{COG Example Gizmos — gear-backed + push-updated types.
 COG API demo: Begin/EndRegister, RegisterGizmo, GizmoStorage, UpdateGizmo.
 Example plumbing: wait for COG_Example_IconsReady; soft-gate gear-backed on Gears ESP; ModEvent tick.}

String Property SourceMod = "COG_Example_Gizmos" AutoReadOnly
String Property PluginFile = "COG - Example Gizmos.esp" AutoReadOnly
String Property CorePluginFile = "COG - Example Core.esp" AutoReadOnly
String Property GearsPluginFile = "COG - Example Gears.esp" AutoReadOnly
; Paths from Core ImportIcon (do not ImportIcon here).
String Property IconFill = "COG_Example/light-bulb-fill.png" AutoReadOnly
String Property IconHollow = "COG_Example/light-bulb-hollow.png" AutoReadOnly

Int Property GizmoGearReceipt = 0 Auto
Int Property GizmoPushReceipt = 0 Auto
Bool Property SetupBusy = False Auto
Bool Property IconsListenerArmed = False Auto
Bool Property TickArmed = False Auto
Bool Property BoundToIcons = False Auto

Event OnInit()
	RegisterForModEvent("COG_Ready", "OnCOGReady")
	RegisterForMenu("Loading Menu")
	Setup()
EndEvent

Event OnCOGReady(String eventName, String strArg, Float numArg, Form sender)
	Setup()
EndEvent

Event OnMenuClose(String menuName)
	If menuName == "Loading Menu"
		Utility.Wait(1.0)
		Setup()
	EndIf
EndEvent

Function GameLoad()
	Setup()
EndFunction

; === Example plumbing: icons-ready (import finished) ===
Event OnIconsReady(String eventName, String strArg, Float numArg, Form sender)
	BindAfterIconsReady()
EndEvent

; === Example plumbing: ModEvent receive ===
Event OnExampleTick(String eventName, String strArg, Float numArg, Form sender)
	If !COG_API.IsPluginLoaded(PluginFile) || !COG_API.IsPluginLoaded(CorePluginFile)
		Return
	EndIf
	If !BoundToIcons
		BindAfterIconsReady()
	EndIf
	If !BoundToIcons
		Return
	EndIf
	Int remaining = numArg as Int
	; === COG API: UpdateGizmo (push path only) ===
	If GizmoPushReceipt != 0
		String payload = "{\"remaining\":" + (remaining as String) + "}"
		COG_API.UpdateGizmo(GizmoPushReceipt, payload)
	EndIf
EndEvent

Function Setup()
	; === Example plumbing: setup guard ===
	If SetupBusy || !COG_API.IsReady()
		Return
	EndIf
	If !COG_API.IsPluginLoaded(PluginFile)
		GizmoGearReceipt = 0
		GizmoPushReceipt = 0
		BoundToIcons = False
		Return
	EndIf
	If !COG_API.IsPluginLoaded(CorePluginFile)
		GizmoGearReceipt = 0
		GizmoPushReceipt = 0
		BoundToIcons = False
		Return
	EndIf
	SetupBusy = True
	BoundToIcons = False
	ArmIconsReadyListener()
	ArmTickListener()
	SetupBusy = False
EndFunction

Function ArmIconsReadyListener()
	; === Example plumbing: ModEvent register (icons) ===
	If !IconsListenerArmed
		RegisterForModEvent("COG_Example_IconsReady", "OnIconsReady")
		IconsListenerArmed = True
	EndIf
EndFunction

Function ArmTickListener()
	; === Example plumbing: ModEvent register (tick) ===
	If !TickArmed
		RegisterForModEvent("COG_Example_Tick", "OnExampleTick")
		TickArmed = True
	EndIf
EndFunction

Function BindAfterIconsReady()
	If BoundToIcons || SetupBusy
		Return
	EndIf
	If !COG_API.IsPluginLoaded(PluginFile) || !COG_API.IsPluginLoaded(CorePluginFile)
		GizmoGearReceipt = 0
		GizmoPushReceipt = 0
		BoundToIcons = False
		Return
	EndIf
	SetupBusy = True
	RegisterGizmos()
	BoundToIcons = True
	SetupBusy = False
EndFunction

Function RegisterGizmos()
	; === COG API: HTML settings + storage + RegisterGizmo ===
	; Settings HTML is Data-relative; COG copies each path into gizmoTypes/<typeId>/settings.html.
	; Gear-updated: primary path beside the view scripts.
	; Push-updated: secondary folder (same markup) so import-from-elsewhere is covered.
	; Translation tags resolve from gizmoTypes/<typeId>/translations/_COG.json.
	String settingsHtmlPrimary = "PrismaUI/views/Example/gear_settings.html"
	String settingsHtmlSecondary = "PrismaUI/views/Example/settings/gear_settings.html"

	; Ensure per-type data folders exist (translations ship under gizmoTypes/<typeId>/translations/).
	; Return value is the relative path under SKSE/Plugins/COG (e.g. gizmoTypes/xmp-gearupdated).
	Debug.Trace("COG Example Gizmos storage: " + COG_API.GizmoStorage("xmp-gearupdated"))
	Debug.Trace("COG Example Gizmos storage: " + COG_API.GizmoStorage("xmp-pushupdated"))

	COG_API.BeginRegister(SourceMod, PluginFile)

	; === Example plumbing: soft dependency on Gears ESP ===
	; Gear-backed type reads COG_Example_Gears / count via sourceFor — only register when Gears is loaded.
	Bool gearsLoaded = COG_API.IsPluginLoaded(GearsPluginFile)
	If gearsLoaded
		; === COG API: RegisterGizmo (gear-backed, fill icon, HUD visibility) ===
		; Display name is short; hud / fill / sourceFor are documented in this comment only.
		GizmoGearReceipt = COG_API.RegisterGizmo(SourceMod, "xmp-gearupdated", "Example (Gear Updated)", IconFill, 100.0, 100.0, "Example/example.js", settingsHtmlPrimary, "hud")
	Else
		GizmoGearReceipt = 0
	EndIf

	; === COG API: RegisterGizmo (push-updated, hollow icon, UI visibility) ===
	; Display name is short; ui / hollow / UpdateGizmo are documented in this comment only.
	GizmoPushReceipt = COG_API.RegisterGizmo(SourceMod, "xmp-pushupdated", "Example (Push Updated)", IconHollow, 100.0, 100.0, "Example/example_push.js", settingsHtmlSecondary, "ui")

	; EndRegister omit-prunes xmp-gearupdated when Gears is absent this session.
	COG_API.EndRegister(SourceMod)
EndFunction
