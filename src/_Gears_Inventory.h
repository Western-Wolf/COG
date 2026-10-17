#pragma once

#include <cstdint>
#include <string>
#include <string_view>

class CogRegistry;

inline constexpr const char* kInventoryGearMod = "COG.Inventory";
inline constexpr const char* kInventoryPickerContainerEditorId = "COG_InventoryGearPicker";
inline constexpr RE::FormID kInventoryPickerContainerLocalId = 0x00000801;

/** Locked default inventory gears (Skyrim.esm forms the picker can't receive). */
struct CogBuiltinInventoryPreset
{
	const char* plugin;
	std::uint32_t localId;
	const char* display;
	const char* icon;
};

inline constexpr CogBuiltinInventoryPreset kBuiltinInventoryPresets[] = {
	{ "Skyrim.esm", 0x0009DFBB, "Stones of Barenziah", "Treasure/crystal.svg" },
};

// COG.Inventory gears: picker session, count refresh, locked builtins, create/remove/hydrate.
// Shared Register / Begin–EndRegister / entity maps stay on CogRegistry.
namespace CogInventory
{
	void OpenPicker();
	void OnContainerClosed();
	void OnPickerMenuClosed();
	void RemoveGear(std::string_view varName);
	void RegisterFromSaved();

	// Caller holds CogRegistry::_mutex.
	void EnsureBuiltinsUnlocked(CogRegistry& reg);
	void RefreshCountsUnlocked(CogRegistry& reg);

	// Internal — ContainerMenu close path (friended by CogRegistry).
	void FinishContainerClosed();
}
