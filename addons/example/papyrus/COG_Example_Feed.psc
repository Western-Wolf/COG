ScriptName COG_Example_Feed extends Quest
{COG Example Feed — toast when the Core countdown hits 0.
 COG API demo: COG_Feed_API.Notify (source + icon).
 Example plumbing: wait for COG_Example_IconsReady, then ModEvent tick.}

String Property SourceMod = "COG_Example_Feed" AutoReadOnly
String Property PluginFile = "COG - Example Feed.esp" AutoReadOnly
String Property CorePluginFile = "COG - Example Core.esp" AutoReadOnly
; Fallback if tick strArg is empty (Core should pass fill path).
String Property IconFill = "COG_Example/light-bulb-fill.png" AutoReadOnly

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
	If remaining != 0
		Return
	EndIf

	; === COG API: Notify ===
	; Toast on a play-visible Feed with Notifications on. Source is this module's id.
	String icon = strArg
	If icon == ""
		icon = IconFill
	EndIf
	COG_Feed_API.Notify("Example countdown finished", "#E8D2A0", icon, SourceMod)
EndEvent

Function Setup()
	; === Example plumbing: setup guard ===
	If SetupBusy || !COG_API.IsReady()
		Return
	EndIf
	If !COG_API.IsPluginLoaded(PluginFile)
		BoundToIcons = False
		Return
	EndIf
	If !COG_API.IsPluginLoaded(CorePluginFile)
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
		BoundToIcons = False
		Return
	EndIf
	BoundToIcons = True
EndFunction
