ScriptName COG_Example_Gears extends Quest
{COG Example Gears — count / percent / timer demo matrix.
 COG API demo: Begin/EndRegister, RegisterGear (icon stops, colour stops, hideAt), Update*.
 Example plumbing: wait for Core ESP, ModEvent COG_Example_Tick receiver.}

String Property SourceMod = "COG_Example_Gears" AutoReadOnly
String Property PluginFile = "COG - Example Gears.esp" AutoReadOnly
String Property CorePluginFile = "COG - Example Core.esp" AutoReadOnly
; Paths from Core ImportIcon (do not ImportIcon here).
String Property IconFill = "COG_Example/light-bulb-fill.png" AutoReadOnly
String Property IconHollow = "COG_Example/light-bulb-hollow.png" AutoReadOnly

Int Property CountReceipt = 0 Auto
Int Property PercentReceipt = 0 Auto
Int Property TimerReceipt = 0 Auto
Bool Property SetupBusy = False Auto
Bool Property TickArmed = False Auto

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

; === Example plumbing: ModEvent receive ===
Event OnExampleTick(String eventName, String strArg, Float numArg, Form sender)
	If !COG_API.IsPluginLoaded(PluginFile) || !COG_API.IsPluginLoaded(CorePluginFile)
		Return
	EndIf
	Int remaining = numArg as Int
	ApplyLive(remaining)
EndEvent

Function Setup()
	; === Example plumbing: setup guard (Core must be loaded — icons already imported) ===
	If SetupBusy || !COG_API.IsReady()
		Return
	EndIf
	If !COG_API.IsPluginLoaded(PluginFile) || !COG_API.IsPluginLoaded(CorePluginFile)
		ClearReceipts()
		Return
	EndIf
	SetupBusy = True

	RegisterGears()
	ArmTickListener()

	SetupBusy = False
EndFunction

Function ArmTickListener()
	; === Example plumbing: ModEvent register ===
	If !TickArmed
		RegisterForModEvent("COG_Example_Tick", "OnExampleTick")
		TickArmed = True
	EndIf
EndFunction

Function ClearReceipts()
	CountReceipt = 0
	PercentReceipt = 0
	TimerReceipt = 0
EndFunction

Function RegisterGears()
	; === COG API: BeginRegister / RegisterGear / EndRegister ===
	; Three-stop colour ramp (green → gold → red) shared by Timer icon + Percent bar.
	String ramp3 = "[{\"pct\":0,\"color\":\"#20DF20\"},{\"pct\":50,\"color\":\"#E8D2A0\"},{\"pct\":100,\"color\":\"#DF2020\"}]"

	; Percent icon stops @10% (fill/hollow alternate). Matches each Core tick (Remaining/10).
	String iconStops = "["
	iconStops += "{\"pct\":0,\"path\":\"" + IconFill + "\"},"
	iconStops += "{\"pct\":10,\"path\":\"" + IconHollow + "\"},"
	iconStops += "{\"pct\":20,\"path\":\"" + IconFill + "\"},"
	iconStops += "{\"pct\":30,\"path\":\"" + IconHollow + "\"},"
	iconStops += "{\"pct\":40,\"path\":\"" + IconFill + "\"},"
	iconStops += "{\"pct\":50,\"path\":\"" + IconHollow + "\"},"
	iconStops += "{\"pct\":60,\"path\":\"" + IconFill + "\"},"
	iconStops += "{\"pct\":70,\"path\":\"" + IconHollow + "\"},"
	iconStops += "{\"pct\":80,\"path\":\"" + IconFill + "\"},"
	iconStops += "{\"pct\":90,\"path\":\"" + IconHollow + "\"},"
	iconStops += "{\"pct\":100,\"path\":\"" + IconFill + "\"}"
	iconStops += "]"

	COG_API.BeginRegister(SourceMod, PluginFile)

	; Order: Percent → Timer → Count so a non-hiding gear anchors the group line when Count hideAt fires.
	; Percent — icon asset stops every 10%, blank icon tint, 3-stop bar colours.
	PercentReceipt = COG_API.RegisterGear(SourceMod, "percent", "percent", "Example Percent", "Example", iconStops, "", "", ramp3)

	; Timer — 3-stop icon tint, single solid bar colour.
	TimerReceipt = COG_API.RegisterGear(SourceMod, "timer", "timer", "Example Timer", "Example", IconFill, ramp3, "", "#C4A35A")

	; Count — solid icon tint, blank bar, hide when value < 1 (countdown empty).
	CountReceipt = COG_API.RegisterGear(SourceMod, "count", "count", "Example Count", "Example", IconHollow, "#E8D2A0", "", "", "<1")

	COG_API.EndRegister(SourceMod)
EndFunction

Function ApplyLive(Int remaining)
	; === COG API: Update* ===
	If CountReceipt != 0
		COG_API.UpdateCount(CountReceipt, remaining)
	EndIf
	If PercentReceipt != 0
		COG_API.UpdatePercent(PercentReceipt, remaining as Float, 10.0)
	EndIf
	If TimerReceipt != 0
		COG_API.UpdateTimer(TimerReceipt, remaining as Float)
	EndIf
EndFunction
