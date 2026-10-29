ScriptName COG_Example_Core extends Quest
{COG Example Core — icons + countdown ModEvent.
 COG API demo: ImportIcon (fill + hollow).
 Example plumbing: Remaining loop, COG_Example_IconsReady + COG_Example_Tick ModEvents.
 Submodules wait for IconsReady (not merely Core ESP loaded) before registering / arming tick.}

; Stable ImportIcon folder name (not a COG registry sourceMod — Core registers nothing).
String Property IconImportMod = "COG_Example" AutoReadOnly
String Property PluginFile = "COG - Example Core.esp" AutoReadOnly
String Property SourceFillPath = "Interface/exported/COG_Example/light-bulb-fill.png" AutoReadOnly
String Property SourceHollowPath = "Interface/exported/COG_Example/light-bulb-hollow.png" AutoReadOnly
; Documented import-relative paths after ImportIcon (Gears / Feed / Gizmos hard-code these).
;   Fill:   COG_Example/light-bulb-fill.png
;   Hollow: COG_Example/light-bulb-hollow.png

Int Property Remaining = 10 Auto
Bool Property LoopArmed = False Auto
Bool Property SetupBusy = False Auto
String Property IconFill = "" Auto
String Property IconHollow = "" Auto

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

; Called from COG_Example_Core_Alias on init / player load.
Function GameLoad()
	Setup()
EndFunction

Event OnUpdate()
	; === Example plumbing: tick gate ===
	If !COG_API.IsPluginLoaded(PluginFile)
		StopCountdown()
		Return
	EndIf
	TickCountdown()
EndEvent

Function Setup()
	; === Example plumbing: setup guard ===
	If SetupBusy || !COG_API.IsReady()
		Return
	EndIf
	If !COG_API.IsPluginLoaded(PluginFile)
		StopCountdown()
		Return
	EndIf
	SetupBusy = True

	; === COG API: ImportIcon (must finish before IconsReady / any tick) ===
	ImportExampleIcons()

	; === Example plumbing: icons-ready then countdown ===
	; Submodules soft-depend on this event (ESP loaded ≠ import finished).
	NotifyIconsReady()
	StartCountdown()

	SetupBusy = False
EndFunction

Function ImportExampleIcons()
	; === COG API: ImportIcon ===
	; Copy Data-relative PNGs into assets/imports/icons/COG_Example/ and index them.
	IconFill = COG_API.ImportIcon(IconImportMod, "light-bulb-fill", SourceFillPath)
	If IconFill == ""
		IconFill = "COG/cog.svg"
	EndIf
	IconHollow = COG_API.ImportIcon(IconImportMod, "light-bulb-hollow", SourceHollowPath)
	If IconHollow == ""
		IconHollow = IconFill
	EndIf
EndFunction

Function NotifyIconsReady()
	; === Example plumbing: ModEvent icons-ready ===
	; strArg = fill icon path; numArg unused (0). Safe to re-send after every Setup.
	SendModEvent("COG_Example_IconsReady", IconFill, 0.0)
EndFunction

Function StartCountdown()
	If Remaining < 0 || Remaining > 10
		Remaining = 10
	EndIf
	TickCountdown()
	If !LoopArmed
		LoopArmed = True
		RegisterForUpdate(1.0)
	EndIf
EndFunction

Function StopCountdown()
	If LoopArmed
		UnregisterForUpdate()
		LoopArmed = False
	EndIf
EndFunction

Function TickCountdown()
	; === Example plumbing: ModEvent tick ===
	; Re-broadcast IconsReady so late-loading siblings bind within one second.
	NotifyIconsReady()
	; strArg = fill icon path (Feed Notify convenience); numArg = Remaining.
	SendModEvent("COG_Example_Tick", IconFill, Remaining as Float)

	If Remaining == 0
		Remaining = 10
	Else
		Remaining -= 1
	EndIf
EndFunction
