Scriptname iWant_Widgets extends Quest
{COG compatibility stub — no-op Scaleform widgets API.}

Int Function loadWidget(String filename, Int xpos = 10000, Int ypos = 10000, Bool visible = False)
	Return -1
EndFunction

Int Function loadLibraryWidget(String filename, Int xpos = 10000, Int ypos = 10000, Bool visible = False)
	Return -1
EndFunction

Int Function loadText(String displayString, String font = "$EverywhereFont", Int size = 24, Int xpos = 10000, Int ypos = 10000, Bool visible = False)
	Return -1
EndFunction

Int Function loadMeter(Int xpos = 10000, Int ypos = 10000, Bool visible = False)
	Return -1
EndFunction

Function destroy(Int id)
EndFunction

Function setVisible(Int id, Int visible = 1)
EndFunction

Function setPos(Int id, Int xpos, Int ypos)
EndFunction

Function setSize(Int id, Int h, Int w)
EndFunction

Function setRGB(Int id, Int r, Int g, Int b)
EndFunction

Function setTransparency(Int id, Int a)
EndFunction

Function doTransition(Int id, Int targetValue, Int frames = 60, String targetAttribute = "alpha", String easingClass = "none", String easingMethod = "none", Int delay = 0)
EndFunction

Function triggerReset()
	SendModEvent("iWantWidgetsReset")
EndFunction

Bool Function isReady()
	Return True
EndFunction
