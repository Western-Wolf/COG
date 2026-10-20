Scriptname COG_iWant Hidden
{Native helpers for the COG iWant compatibility pack.}

; Widgets library remap → shipped COG assets/icons path, or "".
String Function MapWidgetsLibraryIcon(String exportedRelPath) Global Native

; Resolve export path to Data-relative source (PreferSibling). "" if missing.
String Function ResolveExportedIconPath(String exportedRelPath) Global Native

Bool Function IsReady() Global Native

; Status Bars colour states → RegisterGear iconColor (hex or JSON stops). Lines are "r,g,b".
String Function BuildIconColorRamp(String rgbLinesJoined) Global Native

; Status Bars icon paths (newline-joined) → RegisterGear icon (plain path or JSON stops).
; Consecutive duplicate paths collapse; percents match setIconStatus / BuildIconColorRamp.
String Function BuildIconAssetRamp(String cogPathsJoined) Global Native

; Remap library icons, otherwise resolve under Interface/exported/ and ImportIcon via COG core.
String Function ImportIcon(String sourceMod, String iconName, String exportedRelPath) Global
	String mapped = MapWidgetsLibraryIcon(exportedRelPath)
	If mapped != ""
		Return mapped
	EndIf
	String dataRel = ResolveExportedIconPath(exportedRelPath)
	If dataRel == ""
		Return ""
	EndIf
	Return COG_API.ImportIcon(sourceMod, iconName, dataRel)
EndFunction

; Import Status Bars state files into a gear icon value (plain path or multi-stop JSON on the gear).
; Colour ramps stay separate via BuildIconColorRamp.
String Function ImportIconPack(String sourceMod, String iconName, String[] files) Global
	If !files || files.Length < 1
		Return ""
	EndIf
	If files.Length == 1
		Return ImportIcon(sourceMod, iconName, files[0])
	EndIf
	If files.Length > 64
		Return ""
	EndIf

	Bool allFilesSame = True
	Int i = 1
	While i < files.Length && allFilesSame
		If files[i] != files[0]
			allFilesSame = False
		EndIf
		i += 1
	EndWhile
	If allFilesSame
		Return ImportIcon(sourceMod, iconName, files[0])
	EndIf

	String[] cogPaths = new String[64]
	i = 0
	While i < files.Length
		String exported = files[i]
		String found = ""
		Int j = 0
		While j < i && found == ""
			If files[j] == exported
				found = cogPaths[j]
			EndIf
			j += 1
		EndWhile
		If found != ""
			cogPaths[i] = found
		Else
			cogPaths[i] = ImportIcon(sourceMod, iconName + "_" + i, exported)
		EndIf
		If cogPaths[i] == ""
			Return ""
		EndIf
		i += 1
	EndWhile

	String joined = ""
	i = 0
	While i < files.Length
		If i > 0
			joined += "\n"
		EndIf
		joined += cogPaths[i]
		i += 1
	EndWhile
	Return BuildIconAssetRamp(joined)
EndFunction
