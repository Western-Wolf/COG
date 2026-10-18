#include "pch.h"
#include "_API_Gears.h"
#include "_API_Core.h"
#include "_Core_Registry.h"
#include "_Gears_LiveStats.h"

namespace
{
	std::int32_t RegisterGear(
		RE::StaticFunctionTag*,
		std::string sourceMod,
		std::string varName,
		std::string type,
		std::string displayName,
		std::string category,
		std::string icon,
		std::string iconColor,
		std::string legacyEndColor,
		std::string barColor,
		std::string hideAt,
		std::string hudLinkedElement,
		bool hudHideDuplicate)
	{
		const auto receipt = CogRegistry::Get().Register(
			std::move(sourceMod),
			std::move(varName),
			std::move(type),
			std::move(displayName),
			std::move(category),
			std::move(icon),
			std::move(iconColor),
			std::move(legacyEndColor),
			std::move(barColor),
			std::move(hideAt),
			std::move(hudLinkedElement),
			hudHideDuplicate);
		CogRegistry::Get().MarkLayoutDirty();
		CogRegistry::Get().PushToUi();
		return receipt;
	}

	void UpdatePercent(RE::StaticFunctionTag*, std::int32_t receipt, float current, float maximum)
	{
		CogRegistry::Get().UpdatePercent(receipt, current, maximum);
	}

	void UpdatePercentByKey(
		RE::StaticFunctionTag*,
		std::string sourceMod,
		std::string varName,
		float current,
		float maximum)
	{
		CogRegistry::Get().UpdatePercentByKey(std::move(sourceMod), std::move(varName), current, maximum);
	}

	void UpdateCount(RE::StaticFunctionTag*, std::int32_t receipt, std::int32_t value)
	{
		CogRegistry::Get().UpdateCount(receipt, value);
	}

	void UpdateTimer(RE::StaticFunctionTag*, std::int32_t receipt, float remainingSeconds)
	{
		CogRegistry::Get().UpdateTimer(receipt, remainingSeconds);
	}

	void Unregister(RE::StaticFunctionTag*, std::int32_t receipt)
	{
		CogRegistry::Get().Unregister(receipt);
		CogRegistry::Get().MarkLayoutDirty();
		CogRegistry::Get().PushToUi();
	}

	void BeginRegister(
		RE::BSScript::IVirtualMachine* vm,
		RE::VMStackID stackID,
		RE::StaticFunctionTag*,
		std::string sourceMod,
		std::string pluginFile)
	{
		auto sniffed = CogCaller::SniffCallerPlugin(vm, stackID);
		CogRegistry::Get().BeginRegister(std::move(sourceMod), std::move(pluginFile), std::move(sniffed));
	}

	void EndRegister(RE::StaticFunctionTag*, std::string sourceMod)
	{
		CogRegistry::Get().EndRegister(std::move(sourceMod));
		CogRegistry::Get().MarkLayoutDirty();
		CogRegistry::Get().PushToUi();
	}

	float GetPlayerBreathRemaining(RE::StaticFunctionTag*)
	{
		float remaining = 0.0f;
		float maximum = 0.0f;
		CogLive::ReadPlayerBreath(remaining, maximum);
		return remaining;
	}

	float GetPlayerBreathMaximum(RE::StaticFunctionTag*)
	{
		float remaining = 0.0f;
		float maximum = 0.0f;
		CogLive::ReadPlayerBreath(remaining, maximum);
		return maximum;
	}

	float GetPlayerBowDraw(RE::StaticFunctionTag*)
	{
		return CogLive::PlayerBowDraw();
	}

	float GetPlayerSpellCharge(RE::StaticFunctionTag*)
	{
		return CogLive::PlayerSpellCharge();
	}

	float GetPlayerWeaponCharge(RE::StaticFunctionTag*)
	{
		return CogLive::PlayerWeaponCharge(false);
	}

	float GetPlayerSecondaryWeaponCharge(RE::StaticFunctionTag*)
	{
		return CogLive::PlayerWeaponCharge(true);
	}

	float GetPlayerShoutRemaining(RE::StaticFunctionTag*)
	{
		return CogLive::PlayerShoutRemaining();
	}

	float GetPlayerHowlRemaining(RE::StaticFunctionTag*)
	{
		return CogLive::PlayerHowlRemaining();
	}

	std::int32_t GetPlayerVampireStage(RE::StaticFunctionTag*)
	{
		return CogLive::VampireStage();
	}

	std::int32_t GetPlayerArrowCount(RE::StaticFunctionTag*)
	{
		return CogLive::PlayerEquippedArrowCount();
	}

	std::int32_t GetPlayerBoltCount(RE::StaticFunctionTag*)
	{
		return CogLive::PlayerEquippedBoltCount();
	}

	bool RegisterImportedIcon(RE::StaticFunctionTag*, std::string iconPath)
	{
		return CogRegistry::Get().RegisterImportedIcon(std::move(iconPath));
	}

	std::string ImportIcon(
		RE::StaticFunctionTag*,
		std::string sourceMod,
		std::string iconName,
		std::string sourcePath)
	{
		return CogRegistry::Get().ImportIcon(
			std::move(sourceMod),
			std::move(iconName),
			std::move(sourcePath));
	}
}

bool CogApiGears::Bind(RE::BSScript::IVirtualMachine* vm)
{
	if (!vm) {
		return false;
	}
	vm->RegisterFunction("RegisterGear", "COG_API", RegisterGear);
	vm->RegisterFunction("BeginRegister", "COG_API", BeginRegister);
	vm->RegisterFunction("EndRegister", "COG_API", EndRegister);
	vm->RegisterFunction("UpdatePercent", "COG_API", UpdatePercent);
	vm->RegisterFunction("UpdatePercentByKey", "COG_API", UpdatePercentByKey);
	vm->RegisterFunction("UpdateCount", "COG_API", UpdateCount);
	vm->RegisterFunction("UpdateTimer", "COG_API", UpdateTimer);
	vm->RegisterFunction("Unregister", "COG_API", Unregister);
	vm->RegisterFunction("ImportIcon", "COG_API", ImportIcon);
	vm->RegisterFunction("RegisterImportedIcon", "COG_API", RegisterImportedIcon);
	vm->RegisterFunction("GetPlayerBreathRemaining", "COG_API", GetPlayerBreathRemaining);
	vm->RegisterFunction("GetPlayerBreathMaximum", "COG_API", GetPlayerBreathMaximum);
	vm->RegisterFunction("GetPlayerBowDraw", "COG_API", GetPlayerBowDraw);
	vm->RegisterFunction("GetPlayerSpellCharge", "COG_API", GetPlayerSpellCharge);
	vm->RegisterFunction("GetPlayerWeaponCharge", "COG_API", GetPlayerWeaponCharge);
	vm->RegisterFunction("GetPlayerSecondaryWeaponCharge", "COG_API", GetPlayerSecondaryWeaponCharge);
	vm->RegisterFunction("GetPlayerShoutRemaining", "COG_API", GetPlayerShoutRemaining);
	vm->RegisterFunction("GetPlayerHowlRemaining", "COG_API", GetPlayerHowlRemaining);
	vm->RegisterFunction("GetPlayerVampireStage", "COG_API", GetPlayerVampireStage);
	vm->RegisterFunction("GetPlayerArrowCount", "COG_API", GetPlayerArrowCount);
	vm->RegisterFunction("GetPlayerBoltCount", "COG_API", GetPlayerBoltCount);
	return true;
}
