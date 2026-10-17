Scriptname COG_iWant Hidden
{Native helpers for the COG iWant compatibility pack.}

; Widgets library remap → shipped COG assets/icons path, or "".
String Function MapWidgetsLibraryIcon(String exportedRelPath) Global Native

; Resolve export path to Data-relative source (PreferSibling). "" if missing.
String Function ResolveExportedIconPath(String exportedRelPath) Global Native

Bool Function IsReady() Global Native

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
