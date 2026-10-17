#pragma once

namespace CogLive
{
	void BindBowDrawTracking();
	void ReadPlayerBreath(float& remaining, float& maximum);
	/** Mount stamina pool while riding; 0/1 when not mounted (pairs with hideAt on Mount Stamina gear). */
	void ReadMountStamina(float& current, float& maximum);
	float PlayerBowDraw();
	float PlayerSpellCharge();
	// Enchantment charge 0-1 for the primary (right / two-hand) or secondary (left) hand.
	// 0 when that hand has no depleting enchanted weapon/staff.
	float PlayerWeaponCharge(bool secondary);
	float PlayerShoutRemaining();
	float PlayerHowlRemaining();
	bool PlayerIsWerewolf();
	bool PlayerIsVampireLord();
	/** Werewolf or Vampire Lord beast form — shout meter / shout cooldown stay hidden. */
	bool PlayerInBeastForm();
	void PlayerActorPercent(RE::ActorValue av, float& current, float& maximum);
	float BeastSecondsLeft(RE::FormID raceId, const char* raceFile, RE::FormID backTimeId, const char* backFile);
	int VampireStage();
	int PlayerEquippedArrowCount();
	int PlayerEquippedBoltCount();
	void WriteShoutMeterSnapshotJson(std::ostream& o);
}
