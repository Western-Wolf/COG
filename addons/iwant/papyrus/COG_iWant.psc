Scriptname COG_iWant Hidden
{Native helpers for the COG iWant compatibility pack.}

; Widgets library remap → shipped COG assets/icons path, or "".
String Function MapWidgetsLibraryIcon(String exportedRelPath) Global Native

; Resolve export path to Data-relative source (PreferSibling). "" if missing.
String Function ResolveExportedIconPath(String exportedRelPath) Global Native

Bool Function IsReady() Global Native

; Write imports/<Mod>/<Name>.json from newline-joined COG-relative paths (consecutive dupes collapsed).
String Function WriteIconPack(String sourceMod, String iconName, String cogPathsJoined) Global Native

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

; Import each state (dedupe assets), write a multi-icon pack, return pack rel path (or single icon if one file).
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

	String[] cogPaths = new String[64]
	Int i = 0
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

	String packRel = WriteIconPack(sourceMod, iconName, joined)
	If packRel == ""
		Return ""
	EndIf
	COG_API.RegisterImportedIcon(packRel)
	Return packRel
EndFunction
