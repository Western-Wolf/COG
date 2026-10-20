Scriptname iWant_Status_Bars extends Quest
{COG bridge stub for iWant Status Bars consumers (e.g. Stress).}

Int Property TOTAL_ICONS = 64 Auto

String[] iconSourceMod
String[] iconFriendlyName
Int[] iconReceipt
Int[] iconStateCount
Bool[] iconInUse
Bool _ready = False
Bool _feedRegistered = False

; Last Seed continuous attributes (FormIDs via GetFormFromFile; soft dependency).
String LS_MOD = "LastSeed.esp"
String LS_WIDGET_MOD = "iWant Last Seed Widgets"
Int LS_HUNGER = 0x0029CD
Int LS_HUNGER_MAX = 0x0102A9
Int LS_THIRST = 0x0029CE
Int LS_THIRST_MAX = 0x0102AA
Int LS_FATIGUE = 0x0029CF
Int LS_FATIGUE_MAX = 0x0102A8
Int LS_VITALITY = 0x004FC4
Int LS_VITALITY_MAX = 0x0102AB

Event OnInit()
	_ensureArrays()
	_boot()
EndEvent

Function GameLoad()
	; Quest vars persist in the save. COG sources do not — clear bridge slots so
	; consumers re-call loadIcon and we re-Register into this session.
	_resetBridgeSlots()
	; RegisterForSingleUpdate does not persist; always re-arm the continuous feed.
	_feedRegistered = False
	_boot()
EndFunction

Function _boot()
	; Pulse Ready a couple of times — consumers re-register ModEvents on load and can
	; miss a single early send (alias OnPlayerLoadGame order is undefined).
	; Keep this short: each Ready makes Frostfall/Last Seed call loadIcon for every
	; meter; more pulses caused post-load value flicker (re-register fighting the feed).
	Int n = 0
	While n < 2
		Utility.Wait(1.0)
		SendModEvent("iWantStatusBarsReady")
		n += 1
	EndWhile
	; Always (re)arm — _feedRegistered may be true from a prior session while the
	; update timer is not.
	_feedRegistered = True
	RegisterForSingleUpdate(1.0)
EndFunction

Event OnUpdate()
	_feedLastSeedContinuous()
	RegisterForSingleUpdate(1.0)
EndEvent

; Push continuous Last Seed need ratios (same basis as the LS MCM overview %).
; Discrete setIconStatus alone stays near 0% until a level band is crossed.
Function _feedLastSeedContinuous()
	If !COG_API.IsReady()
		Return
	EndIf
	If Game.GetModByName(LS_MOD) == 255
		Return
	EndIf
	_pushLsPair("Hunger", LS_HUNGER, LS_HUNGER_MAX)
	_pushLsPair("Thirst", LS_THIRST, LS_THIRST_MAX)
	_pushLsPair("Fatigue", LS_FATIGUE, LS_FATIGUE_MAX)
	_pushLsPair("Vitality", LS_VITALITY, LS_VITALITY_MAX)
EndFunction

Function _pushLsPair(String varName, Int formCur, Int formMax)
	GlobalVariable curG = Game.GetFormFromFile(formCur, LS_MOD) as GlobalVariable
	GlobalVariable maxG = Game.GetFormFromFile(formMax, LS_MOD) as GlobalVariable
	If !curG || !maxG
		Return
	EndIf
	Float maximum = maxG.GetValue()
	If maximum <= 0.0
		Return
	EndIf
	COG_API.UpdatePercentByKey(LS_WIDGET_MOD, varName, curG.GetValue(), maximum)
EndFunction

Function _ensureArrays()
	If iconInUse && iconInUse.Length == TOTAL_ICONS
		Return
	EndIf
	iconSourceMod = Utility.CreateStringArray(TOTAL_ICONS)
	iconFriendlyName = Utility.CreateStringArray(TOTAL_ICONS)
	iconReceipt = Utility.CreateIntArray(TOTAL_ICONS)
	iconStateCount = Utility.CreateIntArray(TOTAL_ICONS)
	iconInUse = Utility.CreateBoolArray(TOTAL_ICONS)
EndFunction

Function _resetBridgeSlots()
	_ensureArrays()
	Int i = 0
	While i < TOTAL_ICONS
		iconInUse[i] = False
		iconSourceMod[i] = ""
		iconFriendlyName[i] = ""
		iconReceipt[i] = 0
		iconStateCount[i] = 0
		i += 1
	EndWhile
EndFunction

Bool Function isReady()
	Return _ready || COG_API.IsReady()
EndFunction

Bool Function _waitForCog()
	Int i = 0
	While i < 100
		If COG_API.IsReady()
			_ready = True
			Return True
		EndIf
		Utility.Wait(0.1)
		i += 1
	EndWhile
	Return False
EndFunction

Int Function _findIcon(String sourceMod, String name)
	Int i = 0
	While i < TOTAL_ICONS
		If iconInUse[i] && iconSourceMod[i] == sourceMod && iconFriendlyName[i] == name
			Return i
		EndIf
		i += 1
	EndWhile
	Return -1
EndFunction

Int Function _nextFree()
	Int i = 0
	While i < TOTAL_ICONS
		If !iconInUse[i]
			Return i
		EndIf
		i += 1
	EndWhile
	Return -1
EndFunction

String Function _toHex(Int r, Int g, Int b)
	Return "#" + _byteHex(r) + _byteHex(g) + _byteHex(b)
EndFunction

String Function _byteHex(Int v)
	If v < 0
		v = 0
	ElseIf v > 255
		v = 255
	EndIf
	String hex = "0123456789ABCDEF"
	Int hi = v / 16
	Int lo = v - (hi * 16)
	Return StringUtil.GetNthChar(hex, hi) + StringUtil.GetNthChar(hex, lo)
EndFunction

Float Function _statusToPercent(Int status, Int stateCount)
	Int denom = stateCount - 1
	If denom < 1
		denom = 1
	EndIf
	Return 0.1 + (status As Float) * (99.9 / (denom As Float))
EndFunction

; Import + COG Register; returns receipt or 0 on failure.
Int Function _registerWithCog(String sourceMod, String asIconName, String[] files, Int[] r, Int[] g, Int[] b)
	If !files || files.Length < 1
		Return 0
	EndIf
	Int last = files.Length - 1
	If last < 0
		last = 0
	EndIf

	String displayName = asIconName
	; Multi-state → gear icon stops (JSON when assets differ); one unique/collapsed file → plain path.
	String iconPath = COG_iWant.ImportIconPack(sourceMod, asIconName, files)
	If iconPath == ""
		iconPath = COG_iWant.ImportIcon(sourceMod, asIconName, files[last])
	EndIf
	; Every Status Bars colour step → iconColor ramp (separate from icon asset stops).
	String iconColor = "#FFFFFF"
	If r && g && b && r.Length > 0
		Int n = r.Length
		If g.Length < n
			n = g.Length
		EndIf
		If b.Length < n
			n = b.Length
		EndIf
		If files && files.Length < n
			n = files.Length
		EndIf
		If n < 1
			n = 1
		EndIf
		String rgbLines = ""
		Int ci = 0
		While ci < n
			If ci > 0
				rgbLines += "\n"
			EndIf
			rgbLines += (r[ci] As String) + "," + (g[ci] As String) + "," + (b[ci] As String)
			ci += 1
		EndWhile
		String built = COG_iWant.BuildIconColorRamp(rgbLines)
		If built != ""
			iconColor = built
		EndIf
	EndIf

	; ImportIcon / ImportIconPack already index imports; remapped library paths need no RegisterImportedIcon.

	COG_API.BeginRegister(sourceMod, "")
	; Category is fixed so all bridge gears group together; mod stays as sourceMod.
	Int receipt = COG_API.RegisterGear(sourceMod, asIconName, "percent", displayName, "iWant Integration", iconPath, iconColor, "", "", "<0.01", "", false)
	; Do not EndRegister here — consumers load icons one-at-a-time; EndRegister would prune siblings.
	; Do not seed UpdatePercent(0.1) here — Ready re-pulses / loadIcon refreshes would fight the
	; Last Seed continuous feed and Frostfall setIconStatus and flicker every meter after load.
	Return receipt
EndFunction

Int Function loadIcon(String sourceMod, String asIconName, String[] stateNames, String[] files, Int[] r, Int[] g, Int[] b, Int[] a, Bool redraw = True)
	_ensureArrays()
	If !_waitForCog()
		Return -1
	EndIf

	Int existing = _findIcon(sourceMod, asIconName)
	If existing != -1
		; Already bridged this session — keep receipt/value. Re-Import/Register on every
		; Ready pulse was resetting meters (and fighting the continuous feed).
		If files && files.Length > 0
			iconStateCount[existing] = files.Length
		EndIf
		Return -2
	EndIf

	Int id = _nextFree()
	If id < 0
		Return -1
	EndIf

	Int receipt = _registerWithCog(sourceMod, asIconName, files, r, g, b)
	If receipt == 0
		Return -1
	EndIf

	iconInUse[id] = True
	iconSourceMod[id] = sourceMod
	iconFriendlyName[id] = asIconName
	iconReceipt[id] = receipt
	iconStateCount[id] = files.Length
	Return id
EndFunction

Function releaseIcon(String sourceMod, String name)
	_ensureArrays()
	Int id = _findIcon(sourceMod, name)
	If id < 0
		Return
	EndIf
	If iconReceipt[id] != 0
		COG_API.Unregister(iconReceipt[id])
	EndIf
	iconInUse[id] = False
	iconSourceMod[id] = ""
	iconFriendlyName[id] = ""
	iconReceipt[id] = 0
	iconStateCount[id] = 0
EndFunction

Function setIconStatus(String sourceMod, String name, Int status)
	; Last Seed widgets: continuous attribute feed owns the meter (MCM-matching %).
	; Discrete levels alone stay ~0% for a long time inside the first band.
	If sourceMod == LS_WIDGET_MOD && Game.GetModByName(LS_MOD) != 255
		Return
	EndIf
	_ensureArrays()
	Int id = _findIcon(sourceMod, name)
	If id < 0
		Return
	EndIf
	Float pct = _statusToPercent(status, iconStateCount[id])
	If iconReceipt[id] != 0
		COG_API.UpdatePercent(iconReceipt[id], pct, 100.0)
	EndIf
	; Prefer key lookup so a drifted receipt still updates a live source this session.
	COG_API.UpdatePercentByKey(sourceMod, name, pct, 100.0)
EndFunction
