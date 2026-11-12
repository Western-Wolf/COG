ScriptName COG_Example_Feed extends Quest
{COG Example Feed — two toasts when the Core countdown hits 0.
 COG API demo: COG_Feed_Ready → Begin/EndRegister + RegisterSource; Notify (registered + empty source).
 Example plumbing: wait for icons + Feed ready, then ModEvent tick.}

String Property SourceMod = "COG_Example_Feed" AutoReadOnly
String Property PluginFile = "COG - Example Feed.esp" AutoReadOnly
String Property CorePluginFile = "COG - Example Core.esp" AutoReadOnly
; Registered Feed source id (no cog- prefix). Settings HTML customizes colour + icon.
String Property SourceId = "xmp-countdown" AutoReadOnly
; Fallback if tick strArg is empty (Core should pass fill path).
String Property IconFill = "COG_Example/light-bulb-fill.png" AutoReadOnly

Int Property SourceReceipt = 0 Auto
Bool Property SetupBusy = False Auto
Bool Property IconsListenerArmed = False Auto
Bool Property FeedListenerArmed = False Auto
Bool Property TickArmed = False Auto
Bool Property BoundToIcons = False Auto
Bool Property SourcesRegistered = False Auto

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
	TryRegisterSources()
EndEvent

; === COG API: COG_Feed_Ready ===
Event OnFeedReady(String eventName, String strArg, Float numArg, Form sender)
	TryRegisterSources()
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
	TryRegisterSources()
	Int remaining = numArg as Int
	If remaining != 0
		Return
	EndIf

	String icon = strArg
	If icon == ""
		icon = IconFill
	EndIf

	; === COG API: Notify (registered source) ===
	; Colour token → settings.sources.xmp-countdown.textColor on each Feed.
	; Empty asIcon → that source's settings icon (API icon would win if non-empty).
	COG_Feed_API.Notify("[Example Source] Registered source toast", SourceId + ".textColor", "", SourceId)

	; === COG API: Notify (no source → Notifications) ===
	; Omit / "" asSource lands in Notifications when that module is enabled.
	COG_Feed_API.Notify("[Notifications] Unregistered toast (empty asSource)", "#C4A35A", icon, "")
EndEvent

Function Setup()
	; === Example plumbing: setup guard ===
	If SetupBusy || !COG_API.IsReady()
		Return
	EndIf
	If !COG_API.IsPluginLoaded(PluginFile)
		SourceReceipt = 0
		SourcesRegistered = False
		BoundToIcons = False
		Return
	EndIf
	If !COG_API.IsPluginLoaded(CorePluginFile)
		SourceReceipt = 0
		SourcesRegistered = False
		BoundToIcons = False
		Return
	EndIf
	SetupBusy = True
	BoundToIcons = False
	SourcesRegistered = False
	SourceReceipt = 0
	ArmIconsReadyListener()
	ArmFeedReadyListener()
	ArmTickListener()
	SetupBusy = False
	TryRegisterSources()
EndFunction

Function ArmIconsReadyListener()
	; === Example plumbing: ModEvent register (icons) ===
	If !IconsListenerArmed
		RegisterForModEvent("COG_Example_IconsReady", "OnIconsReady")
		IconsListenerArmed = True
	EndIf
EndFunction

Function ArmFeedReadyListener()
	; === COG API: ModEvent register (Feed ready) ===
	If !FeedListenerArmed
		RegisterForModEvent("COG_Feed_Ready", "OnFeedReady")
		FeedListenerArmed = True
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

Function TryRegisterSources()
	If SourcesRegistered || SetupBusy
		Return
	EndIf
	If !COG_API.IsPluginLoaded(PluginFile) || !COG_API.IsPluginLoaded(CorePluginFile)
		Return
	EndIf
	; === COG API: IsFeedReady gate ===
	If !COG_Feed_API.IsFeedReady()
		Return
	EndIf
	SetupBusy = True
	RegisterSources()
	SourcesRegistered = True
	SetupBusy = False
EndFunction

Function RegisterSources()
	; === COG API: BeginRegister / RegisterSource / EndRegister ===
	; Settings HTML is Data-relative; COG copies into gizmoTypes/cog-feed/sources/<id>.html.
	String settingsHtml = "PrismaUI/views/Example/feed_source_settings.html"
	String colourVars = "[\"textColor\"]"

	; Optional: ensure rules/packs folder exists (settings HTML is separate).
	Debug.Trace("COG Example Feed storage: " + COG_Feed_API.SourceStorage(SourceId))

	COG_Feed_API.BeginRegister(SourceMod, PluginFile)
	SourceReceipt = COG_Feed_API.RegisterSource(SourceMod, SourceId, "Example Source", settingsHtml, colourVars, "[]")
	COG_Feed_API.EndRegister(SourceMod)
EndFunction
