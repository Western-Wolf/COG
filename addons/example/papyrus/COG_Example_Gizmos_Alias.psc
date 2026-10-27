ScriptName COG_Example_Gizmos_Alias extends ReferenceAlias
{Re-arms Example Gizmos on init and every player load.}

Event OnInit()
	COG_Example_Gizmos questScript = GetOwningQuest() as COG_Example_Gizmos
	If questScript
		questScript.GameLoad()
	EndIf
EndEvent

Event OnPlayerLoadGame()
	COG_Example_Gizmos questScript = GetOwningQuest() as COG_Example_Gizmos
	If questScript
		questScript.GameLoad()
	EndIf
EndEvent
