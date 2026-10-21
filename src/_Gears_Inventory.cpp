#include "pch.h"
#include "_Gears_Inventory.h"
#include "_Core_Registry.h"
#include "_UI_CogUi.h"
#include "_API_Core.h"

#include "RE/C/ContainerMenu.h"
#include "RE/S/SendHUDMessage.h"
#include "RE/T/TESObjectCONT.h"

#include <algorithm>
#include <cctype>
#include <chrono>
#include <cstring>
#include <iomanip>
#include <mutex>
#include <sstream>
#include <string>
#include <unordered_set>
#include <utility>
#include <vector>

namespace
{
	std::string Lower(std::string s)
	{
		std::transform(s.begin(), s.end(), s.begin(), [](unsigned char c) {
			return static_cast<char>(std::tolower(c));
		});
		return s;
	}

	std::string KeyOf(const std::string& mod, const std::string& name)
	{
		return Lower(mod) + "\x1F" + Lower(name);
	}

	std::string FormVarName(RE::FormID formId)
	{
		std::ostringstream o;
		o << std::hex << std::uppercase << std::setfill('0') << std::setw(8) << formId;
		return o.str();
	}

	RE::FormID ParseFormVarName(const std::string& name)
	{
		try {
			return static_cast<RE::FormID>(std::stoul(name, nullptr, 16));
		} catch (...) {
			return 0;
		}
	}

	std::string FileStem(const std::string& id)
	{
		std::string s;
		s.reserve(id.size());
		for (unsigned char c : id) {
			if (std::isalnum(c) || c == '-' || c == '_') {
				s += static_cast<char>(c);
			} else {
				s += '_';
			}
		}
		return s.empty() ? "item" : s;
	}

	bool AppearanceEmpty(const CogGearAppearance& a)
	{
		return a.displayName.empty() && a.icon.empty() && a.iconColor.empty() && a.barColor.empty() &&
			   a.hideAt.empty();
	}

	void ReturnPickerContainerToPlayer(RE::TESObjectREFR* container)
	{
		auto* player = RE::PlayerCharacter::GetSingleton();
		if (!player || !container) {
			return;
		}
		for (const auto& [item, count] : container->GetInventoryCounts()) {
			if (item && count > 0) {
				player->AddObjectToContainer(item, nullptr, static_cast<std::int32_t>(count), nullptr);
			}
		}
		container->Disable();
		container->SetDelete(true);
	}

	const RE::TESFile* FindCogPluginFile(RE::TESDataHandler* data)
	{
		if (!data) {
			return nullptr;
		}
		if (auto* file = data->LookupLoadedLightModByName(kCogPluginFile)) {
			return file;
		}
		if (auto* file = data->LookupLoadedModByName(kCogPluginFile)) {
			return file;
		}
		return data->LookupModByName(kCogPluginFile);
	}

	RE::FormID LocalFormIdFromPlugin(const RE::TESFile* file, RE::FormID localId)
	{
		if (!file || file->compileIndex == 0xFF) {
			return 0;
		}
		RE::FormID formId = static_cast<RE::FormID>(file->compileIndex << 24);
		formId += static_cast<RE::FormID>(file->smallFileCompileIndex << 12);
		formId += localId;
		return formId;
	}

	RE::TESBoundObject* FindBoundObjectByPluginLocal(
		RE::TESDataHandler* data,
		const char* plugin,
		std::uint32_t localIdRaw)
	{
		if (!data || !plugin) {
			return nullptr;
		}
		const auto localId = static_cast<RE::FormID>(localIdRaw);
		if (auto* obj = data->LookupForm<RE::TESBoundObject>(localId, plugin)) {
			return obj;
		}
		if (auto* file = data->LookupLoadedModByName(plugin)) {
			const auto formId = LocalFormIdFromPlugin(file, localId);
			if (formId != 0) {
				if (auto* obj = RE::TESForm::LookupByID<RE::TESBoundObject>(formId)) {
					return obj;
				}
			}
		}
		return RE::TESForm::LookupByID<RE::TESBoundObject>(localId);
	}

	std::string BuiltinInventoryVarNameForPreset(
		RE::TESDataHandler* data,
		const CogBuiltinInventoryPreset& preset)
	{
		auto* obj = FindBoundObjectByPluginLocal(data, preset.plugin, preset.localId);
		if (!obj) {
			return {};
		}
		return FormVarName(obj->GetFormID());
	}

	RE::TESObjectCONT* FindPickerContainerBase(RE::TESDataHandler* data)
	{
		if (auto* cont = RE::TESForm::LookupByEditorID<RE::TESObjectCONT>(kInventoryPickerContainerEditorId)) {
			return cont;
		}
		if (!data) {
			return nullptr;
		}

		if (auto* cont = data->LookupForm<RE::TESObjectCONT>(kInventoryPickerContainerLocalId, kCogPluginFile)) {
			return cont;
		}

		const auto* plugin = FindCogPluginFile(data);
		const auto formId = LocalFormIdFromPlugin(plugin, kInventoryPickerContainerLocalId);
		if (formId != 0) {
			if (auto* form = RE::TESForm::LookupByID(formId)) {
				if (form->Is(RE::FormType::Container)) {
					return static_cast<RE::TESObjectCONT*>(form);
				}
			}
		}

		for (auto* cont : data->GetFormArray<RE::TESObjectCONT>()) {
			if (!cont) {
				continue;
			}
			const char* editorId = cont->GetFormEditorID();
			if (editorId && std::strcmp(editorId, kInventoryPickerContainerEditorId) == 0) {
				return cont;
			}
			const auto* file = cont->GetFile(0);
			if (!file) {
				continue;
			}
			const auto fileName = file->GetFilename();
			if (fileName.empty() || _stricmp(fileName.data(), kCogPluginFile) != 0) {
				continue;
			}
			if (cont->GetFormID() == formId || formId == 0) {
				return cont;
			}
		}
		return nullptr;
	}

	bool OpenContainerMenuForRef(RE::PlayerCharacter* player, RE::TESObjectREFR* refr)
	{
		auto* ui = RE::UI::GetSingleton();
		if (!player || !refr || !ui) {
			return false;
		}
		refr->ActivateRef(player, 0, nullptr, 0, false);
		if (ui->IsMenuOpen(RE::ContainerMenu::MENU_NAME)) {
			return true;
		}
		RE::ContainerMenu::OpenMenu(refr, RE::ContainerMenu::ContainerMode::kLoot);
		if (ui->IsMenuOpen(RE::ContainerMenu::MENU_NAME)) {
			return true;
		}
		refr->ActivateRef(player, 0, nullptr, 0, true);
		return ui->IsMenuOpen(RE::ContainerMenu::MENU_NAME);
	}

	struct PickerState
	{
		bool open = false;
		bool pending = false;
		bool tryQueued = false;
		std::chrono::steady_clock::time_point deadline{};
		RE::ObjectRefHandle container;
	};

	PickerState g_picker;

	void CancelPicker(RE::TESObjectREFR* container = nullptr)
	{
		g_picker.open = false;
		g_picker.pending = false;
		g_picker.tryQueued = false;
		g_picker.deadline = {};
		g_picker.container = {};
		if (container) {
			container->Disable();
			container->SetDelete(true);
		}
	}

	void TryOpenDeferred();

	void ScheduleTry()
	{
		if (!g_picker.pending || g_picker.tryQueued) {
			return;
		}
		g_picker.tryQueued = true;
		const auto attempt = []() { TryOpenDeferred(); };
		if (auto* tasks = SKSE::GetTaskInterface()) {
			tasks->AddTask(attempt);
		} else {
			attempt();
		}
	}

	void TryOpenDeferred()
	{
		g_picker.tryQueued = false;
		if (!g_picker.pending) {
			return;
		}
		if (std::chrono::steady_clock::now() > g_picker.deadline) {
			const auto reason = CogUi::DescribeGameplayMenuBlock();
			CancelPicker();
			logger::warn(
				"Inventory gear picker: timed out waiting for menus to close ({})",
				reason.empty() ? "unknown" : reason);
			return;
		}

		if (!CogUi::CanOpenGameplayMenu()) {
			ScheduleTry();
			return;
		}

		CogUi::DismissEditorForGameMenu();

		auto* player = RE::PlayerCharacter::GetSingleton();
		auto* data = RE::TESDataHandler::GetSingleton();
		if (!player || !data) {
			CancelPicker();
			logger::warn("Inventory gear picker: player or data handler unavailable");
			return;
		}

		auto* contBase = FindPickerContainerBase(data);
		if (!contBase) {
			CancelPicker();
			const bool loaded = CogCaller::IsPluginLoaded(kCogPluginFile);
			logger::warn(
				"Inventory gear picker: {} not found ({} loaded={})",
				kInventoryPickerContainerEditorId,
				kCogPluginFile,
				loaded);
			return;
		}

		const auto refr = player->PlaceObjectAtMe(contBase, true);
		if (!refr) {
			CancelPicker();
			logger::warn("Inventory gear picker: failed to place container");
			return;
		}

		g_picker.pending = false;
		g_picker.tryQueued = false;
		g_picker.deadline = {};
		g_picker.open = true;
		g_picker.container = refr->GetHandle();

		OpenContainerMenuForRef(player, refr.get());

		auto* ui = RE::UI::GetSingleton();
		if (ui && ui->IsMenuOpen(RE::ContainerMenu::MENU_NAME)) {
			logger::info("Inventory gear picker: container menu opened");
		} else {
			logger::info("Inventory gear picker: container menu open requested");
		}
	}
}

void CogInventory::OpenPicker()
{
	if (g_picker.open || g_picker.pending) {
		return;
	}
	g_picker.pending = true;
	g_picker.tryQueued = false;
	g_picker.deadline = std::chrono::steady_clock::now() + std::chrono::seconds(3);

	logger::info("Inventory gear picker requested");
	CogUi::DismissEditorForGameMenu();
	ScheduleTry();
}

void CogInventory::OnPickerMenuClosed()
{
	if (!g_picker.pending) {
		return;
	}
	ScheduleTry();
}

void CogInventory::OnContainerClosed()
{
	if (!g_picker.open) {
		return;
	}

	const auto finish = []() { CogInventory::FinishContainerClosed(); };
	if (auto* tasks = SKSE::GetTaskInterface()) {
		tasks->AddTask(finish);
	} else {
		finish();
	}
}

void CogInventory::FinishContainerClosed()
{
	RE::TESObjectREFR* container = nullptr;
	std::vector<std::pair<std::string, std::string>> newGears;

	{
		auto& reg = CogRegistry::Get();
		std::lock_guard lock(reg._mutex);
		if (!g_picker.open) {
			return;
		}
		g_picker.open = false;
		g_picker.pending = false;
		g_picker.tryQueued = false;
		g_picker.deadline = {};
		const auto containerPtr = g_picker.container.get();
		g_picker.container = {};
		container = containerPtr.get();
		if (!container) {
			logger::warn("Inventory gear picker: container ref lost on close");
			return;
		}

		std::unordered_set<RE::FormID> seen;
		for (const auto& [item, count] : container->GetInventoryCounts()) {
			if (!item || count <= 0) {
				continue;
			}
			const auto formId = item->GetFormID();
			if (!seen.insert(formId).second) {
				continue;
			}
			const auto varName = FormVarName(formId);
			if (reg._index.contains(KeyOf(kInventoryGearMod, varName))) {
				continue;
			}
			const char* name = item->GetName();
			newGears.emplace_back(varName, name ? std::string(name) : varName);
		}
	}

	ReturnPickerContainerToPlayer(container);

	if (!newGears.empty()) {
		logger::info("Inventory gear picker: registering {} new gear(s)", newGears.size());
		auto& reg = CogRegistry::Get();
		reg.BeginRegister(kInventoryGearMod, kCogPluginFile);
		for (const auto& [varName, display] : newGears) {
			reg.Register(
				kInventoryGearMod,
				varName,
				"count",
				display,
				"Inventory",
				"Treasure/bag.svg",
				{},
				{},
				{},
				{},
				{},
				false);
		}
		reg.EndRegister(kInventoryGearMod);

		std::string hudMsg;
		if (newGears.size() == 1) {
			hudMsg = "Inventory gear created: " + newGears.front().second;
		} else {
			hudMsg = std::to_string(newGears.size()) + " inventory gears created";
		}
		RE::SendHUDMessage::ShowHUDMessage(hudMsg.c_str());
	} else {
		logger::info("Inventory gear picker: closed with no new items");
	}

	CogRegistry::Get().MarkLayoutDirty();
	CogRegistry::Get().PushToUi();
}

void CogInventory::RemoveGear(std::string_view varName)
{
	if (varName.empty()) {
		return;
	}
	const std::string name{ varName };
	std::int32_t receipt = 0;
	{
		auto& reg = CogRegistry::Get();
		std::lock_guard lock(reg._mutex);
		const auto it = reg._index.find(KeyOf(kInventoryGearMod, name));
		if (it == reg._index.end()) {
			return;
		}
		const auto* src = reg.FindByReceipt(it->second);
		if (!src || src->mod != kInventoryGearMod) {
			return;
		}
		for (const auto& gear : reg._gears) {
			if (gear.mod == kInventoryGearMod && gear.name == name && gear.locked) {
				return;
			}
		}
		receipt = it->second;
	}
	auto& reg = CogRegistry::Get();
	reg.Unregister(receipt);
	reg.MarkLayoutDirty();
}

void CogInventory::RegisterFromSaved()
{
	std::vector<CogGear> inventoryGears;
	{
		auto& reg = CogRegistry::Get();
		std::lock_guard lock(reg._mutex);
		for (const auto& gear : reg._gears) {
			if (gear.mod == kInventoryGearMod) {
				inventoryGears.push_back(gear);
			}
		}
	}
	if (inventoryGears.empty()) {
		return;
	}

	auto* data = RE::TESDataHandler::GetSingleton();
	auto& reg = CogRegistry::Get();
	reg.BeginRegister(kInventoryGearMod, kCogPluginFile);
	for (const auto& gear : inventoryGears) {
		std::string display = !gear.settings.displayName.empty() ? gear.settings.displayName : gear.defaults.displayName;
		std::string icon = !gear.settings.icon.empty() ? gear.settings.icon : gear.defaults.icon;
		if (icon.empty()) {
			icon = "Treasure/bag.svg";
		}
		if (display.empty() && data) {
			const auto formId = ParseFormVarName(gear.name);
			if (formId != 0) {
				if (auto* item = data->LookupForm<RE::TESBoundObject>(formId, "")) {
					const char* itemName = item->GetName();
					if (itemName) {
						display = itemName;
					}
				}
			}
		}
		if (display.empty()) {
			display = gear.name;
		}
		reg.Register(
			kInventoryGearMod,
			gear.name,
			"count",
			display,
			"Inventory",
			icon,
			gear.settings.iconColor.empty() ? gear.defaults.iconColor : gear.settings.iconColor,
			"",
			gear.settings.barColor.empty() ? gear.defaults.barColor : gear.settings.barColor,
			gear.settings.hideAt.empty() ? gear.defaults.hideAt : gear.settings.hideAt,
			{},
			false);
	}
	reg.EndRegister(kInventoryGearMod);
}

void CogInventory::EnsureBuiltinsUnlocked(CogRegistry& reg)
{
	auto* data = RE::TESDataHandler::GetSingleton();
	std::vector<std::string> builtinVarNames;
	builtinVarNames.reserve(std::size(kBuiltinInventoryPresets));

	for (const auto& preset : kBuiltinInventoryPresets) {
		const auto varName = BuiltinInventoryVarNameForPreset(data, preset);
		if (varName.empty()) {
			logger::warn(
				"Builtin inventory gear: form not found ({}:{:08X} — {})",
				preset.plugin,
				preset.localId,
				preset.display);
			continue;
		}
		builtinVarNames.push_back(varName);

		CogGearAppearance appearance;
		appearance.displayName = preset.display;
		appearance.icon = preset.icon;

		CogGear* target = nullptr;
		for (auto& gear : reg._gears) {
			if (gear.mod == kInventoryGearMod && gear.name == varName) {
				target = &gear;
				break;
			}
		}

		if (!target) {
			CogGear gear;
			gear.id = FileStem(std::string(kInventoryGearMod) + "_" + varName);
			gear.mod = kInventoryGearMod;
			gear.name = varName;
			gear.enabled = true;
			gear.locked = true;
			gear.defaults = appearance;
			gear.settings = appearance;
			reg._gears.push_back(std::move(gear));
		} else {
			target->locked = true;
			target->defaults = appearance;
			if (AppearanceEmpty(target->settings)) {
				target->settings = appearance;
			}
		}
	}

	std::vector<CogGear> builtins;
	builtins.reserve(builtinVarNames.size());
	for (const auto& varName : builtinVarNames) {
		const auto it = std::find_if(reg._gears.begin(), reg._gears.end(), [&](const CogGear& g) {
			return g.mod == kInventoryGearMod && g.name == varName;
		});
		if (it != reg._gears.end()) {
			builtins.push_back(*it);
			reg._gears.erase(it);
		}
	}
	const auto firstInv = std::find_if(reg._gears.begin(), reg._gears.end(), [](const CogGear& g) {
		return g.mod == kInventoryGearMod;
	});
	reg._gears.insert(firstInv, builtins.begin(), builtins.end());
}

void CogInventory::RefreshCountsUnlocked(CogRegistry& reg)
{
	auto* player = RE::PlayerCharacter::GetSingleton();
	if (!player) {
		return;
	}
	for (const auto& gear : reg._gears) {
		if (gear.mod != kInventoryGearMod) {
			continue;
		}
		const auto formId = ParseFormVarName(gear.name);
		if (formId == 0) {
			continue;
		}
		const auto idxIt = reg._index.find(KeyOf(kInventoryGearMod, gear.name));
		if (idxIt == reg._index.end()) {
			continue;
		}
		auto* src = reg.FindByReceipt(idxIt->second);
		if (!src || src->type != CogVarType::Count) {
			continue;
		}
		std::int32_t total = 0;
		const auto counts = player->GetInventoryCounts([formId](RE::TESBoundObject& obj) {
			return obj.GetFormID() == formId;
		});
		for (const auto& [item, count] : counts) {
			if (item && count > 0) {
				total += static_cast<std::int32_t>(count);
			}
		}
		src->value = static_cast<double>((std::max)(0, total));
	}
}
