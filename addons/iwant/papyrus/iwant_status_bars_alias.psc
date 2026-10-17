Scriptname iwant_status_bars_alias extends ReferenceAlias
{Fires Status Bars GameLoad on init and player load.}

Event OnInit()
	iWant_Status_Bars bars = GetOwningQuest() as iWant_Status_Bars
	If bars
		bars.GameLoad()
	EndIf
EndEvent

Event OnPlayerLoadGame()
	iWant_Status_Bars bars = GetOwningQuest() as iWant_Status_Bars
	If bars
		bars.GameLoad()
	EndIf
EndEvent
