ScriptName COG_Example extends Quest
{Example COG API demo: count/percent/timer gears + Gear Updated / Push Updated gizmos. Loops 10→0.}

String Property SourceMod = "COG_Example" AutoReadOnly
String Property PluginFile = "COG - Example.esp" AutoReadOnly
; Data-relative source outside COG asset trees — ImportIcon copies it into imports/.
String Property SourceIconPath = "Interface/exported/COG_Example/example.svg" AutoReadOnly

Int Property CountReceipt = 0 Auto
Int Property PercentReceipt = 0 Auto
Int Property TimerReceipt = 0 Auto
Int Property GizmoGearReceipt = 0 Auto
Int Property GizmoPushReceipt = 0 Auto
Int Property Remaining = 10 Auto
Bool Property LoopArmed = False Auto
Bool Property SetupBusy = False Auto
String Property IconPath = "" Auto

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

; Called from COG_Example_Alias on init / player load when the quest already started in a save.
Function GameLoad()
	Setup()
EndFunction

Event OnUpdate()
	COGUpdate()
EndEvent

Function Setup()

	; IsReady: true once COG's SKSE plugin and Prisma view are up. Register only after this.
	; SetupBusy: OnInit / COG_Ready / Loading Menu close can overlap; avoid stacked batches.
	If SetupBusy || !COG_API.IsReady()
		Return
	EndIf
	SetupBusy = True

	COGRegisterExamples()
	StartCountdown()

	SetupBusy = False

EndFunction

Function COGRegisterExamples()

	; ImportIcon: copy/convert a Data-relative file into assets/imports/icons/, index it,
	; and return the imports-relative path (e.g. "COG_Example/example.svg").
	; Still register gears if import fails so Update* receipts stay valid after load.
	IconPath = COG_API.ImportIcon(SourceMod, "example", SourceIconPath)
	If IconPath == ""
		IconPath = "COG/cog.svg"
	EndIf

	; BeginRegister: open a registration batch for this sourceMod (gears + gizmo types);
	; binds PluginFile so COG can prune when the plugin is unloaded.
	COG_API.BeginRegister(SourceMod, PluginFile)

	; RegisterGear: create/update a live source. Returns a session receipt for Update*.
	; Args: sourceMod, varName, type (count|percent|timer), displayName, category, icon
	; [, iconColor, legacyEndColor, barColor, ...]. Colours are optional — omit them (as on Count /
	; Timer) for theme icon/bar, or pass #RRGGBB / JSON stops. Two plain hexes (icon + legacyEnd)
	; still build a 0%/100% icon ramp (compat with older start/end callers).
	; Same sourceMod+varName on a later call replaces the receipt (safe after every load).
	CountReceipt = COG_API.RegisterGear(SourceMod, "count", "count", "Example Count", "Example", IconPath)
	; Percent: icon lerps red→green; barColor tints the meter.
	PercentReceipt = COG_API.RegisterGear(SourceMod, "percent", "percent", "Example Percent", "Example", IconPath, "#DF2020", "#20DF20", "#C4A35A")
	TimerReceipt = COG_API.RegisterGear(SourceMod, "timer", "timer", "Example Timer", "Example", IconPath)

	; settingsSchemaJson: editor fields for placed gizmo instances (kinds: string|int|float|bool|enum|color).
	String schema = "[{\"key\":\"zeroColor\",\"kind\":\"color\",\"label\":\"Zero colour\",\"default\":\"#DF2020\"},{\"key\":\"tenColor\",\"kind\":\"color\",\"label\":\"Ten colour\",\"default\":\"#20DF20\"}]"

	; Peer gizmos: same countdown, different live-data paths (sourceFor vs UpdateGizmo).
	; RegisterGizmo returns a session receipt (Unregister drops the type). Same Begin/End batch as gears.
	GizmoGearReceipt = COG_API.RegisterGizmo(SourceMod, "xmp-gearupdated", "Example (Gear Updated)", IconPath, 100.0, 100.0, "Example/example.js", schema)
	GizmoPushReceipt = COG_API.RegisterGizmo(SourceMod, "xmp-pushupdated", "Example (Push Updated)", IconPath, 100.0, 100.0, "Example/example_push.js", schema)

	; EndRegister: finish the batch; prunes gears / gizmo types for this mod whose
	; varNames / typeIds were not re-registered this session (additive batches keep prior).
	COG_API.EndRegister(SourceMod)

EndFunction

Function StartCountdown()
	If Remaining < 0 || Remaining > 10
		Remaining = 10
	EndIf
	COGUpdate()
	If !LoopArmed
		LoopArmed = True
		RegisterForUpdate(1.0)
	EndIf
EndFunction

Function COGUpdate()

	; UpdateCount: set the integer value for a count-type receipt (no maximum).
	If CountReceipt != 0
		COG_API.UpdateCount(CountReceipt, Remaining)
	EndIf

	; UpdatePercent: set current/maximum for a percent-type receipt (meter fills current/max).
	If PercentReceipt != 0
		COG_API.UpdatePercent(PercentReceipt, Remaining as Float, 10.0)
	EndIf

	; UpdateTimer: set remaining seconds for a timer-type receipt (UI treats it as a countdown).
	If TimerReceipt != 0
		COG_API.UpdateTimer(TimerReceipt, Remaining as Float)
	EndIf

	; UpdateGizmo: push opaque JSON to every placed instance of that type (receipt from RegisterGizmo).
	; Example (Push Updated) reads livePayload.remaining in its view script.
	If GizmoPushReceipt != 0
		String payload = "{\"remaining\":" + (Remaining as String) + "}"
		COG_API.UpdateGizmo(GizmoPushReceipt, payload)
	EndIf

	If Remaining == 0
		; Notify: toast on a play-visible Feed with Notifications on (colour + optional icon).
		; No-op (logged) if no matching Feed. Icon path: shipped assets/icons/ or registered import.
		COG_API.Notify("Example countdown finished", "#E8D2A0", IconPath)
		Remaining = 10
	Else
		Remaining -= 1
	EndIf

EndFunction
