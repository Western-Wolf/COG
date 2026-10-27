ScriptName COG_Example_Gears_Alias extends ReferenceAlias
{Re-arms Example Gears on init and every player load.}

Event OnInit()
	COG_Example_Gears questScript = GetOwningQuest() as COG_Example_Gears
	If questScript
		questScript.GameLoad()
	EndIf
EndEvent

Event OnPlayerLoadGame()
	COG_Example_Gears questScript = GetOwningQuest() as COG_Example_Gears
	If questScript
		questScript.GameLoad()
	EndIf
EndEvent
