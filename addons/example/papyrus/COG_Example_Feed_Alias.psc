ScriptName COG_Example_Feed_Alias extends ReferenceAlias
{Re-arms Example Feed on init and every player load.}

Event OnInit()
	COG_Example_Feed questScript = GetOwningQuest() as COG_Example_Feed
	If questScript
		questScript.GameLoad()
	EndIf
EndEvent

Event OnPlayerLoadGame()
	COG_Example_Feed questScript = GetOwningQuest() as COG_Example_Feed
	If questScript
		questScript.GameLoad()
	EndIf
EndEvent
