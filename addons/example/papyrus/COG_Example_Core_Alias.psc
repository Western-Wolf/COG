ScriptName COG_Example_Core_Alias extends ReferenceAlias
{Re-arms Example Core on init and every player load.}

Event OnInit()
	COG_Example_Core questScript = GetOwningQuest() as COG_Example_Core
	If questScript
		questScript.GameLoad()
	EndIf
EndEvent

Event OnPlayerLoadGame()
	COG_Example_Core questScript = GetOwningQuest() as COG_Example_Core
	If questScript
		questScript.GameLoad()
	EndIf
EndEvent
