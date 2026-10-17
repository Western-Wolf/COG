ScriptName COG_Builtin extends Quest
{Registers vanilla COG.Builtin sources. Live values are owned by the native refresh (RefreshLiveUnlocked / bow live percent).}

Event OnInit()
	RegisterForModEvent("COG_Ready", "OnCOGReady")
	RegisterForMenu("Loading Menu")
	Setup()
EndEvent

Event OnCOGReady(String eventName, String strArg, Float numArg, Form sender)
	Setup()
EndEvent

Event OnMenuClose(String menuName)
	If menuName == "Loading Menu"
		Utility.Wait(1.0)
		Setup()
	EndIf
EndEvent

Function Setup()
	If !COG_API.IsReady()
		Return
	EndIf

	COG_API.BeginRegister("COG.Builtin", "COG - Custom Overlay Gadgets.esp")
	COG_API.RegisterGear("COG.Builtin", "Health", "percent", "Health", "Stat", "Survival/health.svg", "", "", "#DF2020", "", "hud.health", true)
	COG_API.RegisterGear("COG.Builtin", "Stamina", "percent", "Stamina", "Stat", "Camping/hiker.svg", "", "", "#20DF20", "", "hud.stamina", true)
	COG_API.RegisterGear("COG.Builtin", "MountStamina", "percent", "Mount Stamina", "Mount", "Animals/horse-head.svg", "", "", "#20DF20", "<0.01")
	COG_API.RegisterGear("COG.Builtin", "Magicka", "percent", "Magicka", "Stat", "Magic/crystal-ball-shiny.svg", "", "", "#2020DF", "", "hud.magicka", true)
	COG_API.RegisterGear("COG.Builtin", "CarryWeight", "percent", "Carry Weight", "Stat", "Camping/backpack.svg")
	COG_API.RegisterGear("COG.Builtin", "Arrows", "count", "Arrows (Equipped)", "Equipment", "Weapons/arrows.svg", "", "", "", "<0.01", "hud.ammo", true)
	COG_API.RegisterGear("COG.Builtin", "Bolts", "count", "Bolts (Equipped)", "Equipment", "Weapons/quiver.svg", "", "", "", "<0.01", "hud.ammo", true)
	COG_API.RegisterGear("COG.Builtin", "Werewolf", "timer", "Transformation", "Werewolf", "Werewolf/wolf.svg", "", "", "#EEEEFF")
	COG_API.RegisterGear("COG.Builtin", "Bloodlust", "percent", "Vampiric Hunger", "Vampire", "Vampire/fangs.svg", "", "", "", "<0.01")
	COG_API.RegisterGear("COG.Builtin", "Oxygen", "timer", "Oxygen", "Survival", "Survival/oxygen.svg", "", "", "#44DDCC", "", "hud.oxygen", true)
	COG_API.RegisterGear("COG.Builtin", "BowDraw", "percent", "Bow Draw", "Charge", "Weapons/bow.svg", "", "", "#AA6633", "<0.01", "hud.casting", true)
	COG_API.RegisterGear("COG.Builtin", "SpellCharge", "percent", "Spell Casting", "Charge", "Magic/sparkles.svg", "", "", "#7744DD", "<0.01", "hud.casting", true)
	COG_API.RegisterGear("COG.Builtin", "WeaponCharge", "percent", "Weapon Charge", "Charge", "Actions/hand-right.svg", "", "", "", "<0.01", "hud.charge", true)
	COG_API.RegisterGear("COG.Builtin", "SecondaryWeaponCharge", "percent", "Secondary Weapon Charge", "Charge", "Actions/hand-left.svg", "", "", "", "<0.01", "hud.leftcharge", true)
	COG_API.RegisterGear("COG.Builtin", "Shout", "timer", "Shout Cooldown", "Charge", "Actions/shout.svg", "", "", "#5ba4f9", "", "hud.casting", true)
	COG_API.RegisterGear("COG.Builtin", "Howl", "timer", "Howl Cooldown", "Charge", "Werewolf/wolf-side.svg")
	; Vanilla resist AVs are already 0–100+%; scale against 100 so the meter reads as resistance %.
	COG_API.RegisterGear("COG.Builtin", "FireResist", "percent", "Fire Resistance", "Resistance", "Survival/fire.svg", "#ffffff", "#ffffff")
	COG_API.RegisterGear("COG.Builtin", "FrostResist", "percent", "Frost Resistance", "Resistance", "Weather/snowflake.svg", "#ffffff", "#ffffff")
	COG_API.RegisterGear("COG.Builtin", "ShockResist", "percent", "Shock Resistance", "Resistance", "Weather/lightning.svg", "#ffffff", "#ffffff")
	COG_API.RegisterGear("COG.Builtin", "PoisonResist", "percent", "Poison Resistance", "Resistance", "Alchemy/skull-and-bones.svg", "#ffffff", "#ffffff")
	COG_API.RegisterGear("COG.Builtin", "MagicResist", "percent", "Magic Resistance", "Resistance", "Magic/sparkles.svg", "#ffffff", "#ffffff")
	COG_API.RegisterGear("COG.Builtin", "DiseaseResist", "percent", "Disease Resistance", "Resistance", "Survival/virus.svg", "#ffffff", "#ffffff")
	COG_API.EndRegister("COG.Builtin")
EndFunction
