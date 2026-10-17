ScriptName COG_Example_Alias extends ReferenceAlias
{Re-arms Example registration on init and every player load (OnInit alone is not enough after the quest is already started in a save).}

Event OnInit()
	COG_Example questScript = GetOwningQuest() as COG_Example
	If questScript
		questScript.GameLoad()
	EndIf
EndEvent

Event OnPlayerLoadGame()
	COG_Example questScript = GetOwningQuest() as COG_Example
	If questScript
		questScript.GameLoad()
	EndIf
EndEvent
