Scriptname COG_iWant Hidden
{Native helpers for the COG iWant compatibility pack.}

; Widgets library remap → shipped COG assets/icons path, or "".
String Function MapWidgetsLibraryIcon(String exportedRelPath) Global Native

; Resolve export path to Data-relative source (PreferSibling). "" if missing.
String Function ResolveExportedIconPath(String exportedRelPath) Global Native

Bool Function IsReady() Global Native

; Write imports/<Mod>/<Name>.json from newline-joined COG-relative paths (consecutive dupes collapsed).
String Function WriteIconPack(String sourceMod, String iconName, String cogPathsJoined) Global Native

; Status Bars colour states → RegisterGear iconColor (hex or JSON stops). Lines are "r,g,b".
String Function BuildIconColorRamp(String rgbLinesJoined) Global Native

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

; Import each state (dedupe assets). Multi-asset → .json pack; one unique asset → plain icon (no pack).
; Addons like Stress and Fear pass the same .dds for every colour state — that must stay a single icon.
String Function ImportIconPack(String sourceMod, String iconName, String[] files) Global
	If !files || files.Length < 1
		Return ""
	EndIf
	If files.Length == 1
		Return ImportIcon(sourceMod, iconName, files[0])
	EndIf
	; Papyrus requires a compile-time size for `new String[N]`.
	If files.Length > 64
		Return ""
	EndIf

	; Same export path repeated (colour/alpha states only) → one ImportIcon, no pack.
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

	; Different export paths that remap/import to one COG asset → plain icon, no pack.
	Bool allCogSame = True
	i = 1
	While i < files.Length && allCogSame
		If cogPaths[i] != cogPaths[0]
			allCogSame = False
		EndIf
		i += 1
	EndWhile
	If allCogSame
		Return cogPaths[0]
	EndIf

	String joined = ""
	i = 0
	While i < files.Length
		If i > 0
			joined += "\n"
		EndIf
		joined += cogPaths[i]
		i += 1
	EndWhile

	String packRel = WriteIconPack(sourceMod, iconName, joined)
	If packRel == ""
		Return ""
	EndIf
	; WriteIconPack returns a plain icon path when collapse leaves a single band.
	Int packLen = StringUtil.GetLength(packRel)
	If packLen >= 5 && StringUtil.Substring(packRel, packLen - 5) == ".json"
		COG_API.RegisterImportedIcon(packRel)
	EndIf
	Return packRel
EndFunction
