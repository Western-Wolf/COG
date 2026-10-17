#include "pch.h"
#include "_Gizmo_Feed_Inventory.h"
#include "_Gizmo_Feed_UtilityIconRegistry.h"
#include "_Gizmo_Feed_UtilityStrings.h"
#include "_Gizmo_Feed.h"
#include "_Core_Registry.h"

#include "RE/B/BGSBipedObjectForm.h"
#include "RE/E/ExtraTextDisplayData.h"
#include "RE/E/ExtraUniqueID.h"
#include "RE/F/FormTypes.h"
#include "RE/I/InventoryEntryData.h"
#include "RE/T/TESAmmo.h"
#include "RE/T/TESObjectARMO.h"
#include "RE/T/TESObjectWEAP.h"

#include <chrono>
#include <cmath>
#include <deque>
#include <filesystem>
#include <mutex>
#include <sstream>
#include <vector>

#include <spdlog/spdlog.h>

namespace
{
	constexpr std::size_t kRingCap = 32;
	// Player alchemy use invokes the remove path twice in-engine; collapse exact dupes.
	constexpr auto kContainerDedupWindow = std::chrono::milliseconds(100);

	using Slot = RE::BIPED_MODEL::BipedObjectSlot;
	using ArmorType = RE::BIPED_MODEL::ArmorType;

	std::mutex g_iconMutex;
	CogFeed::IconRegistry::Store g_iconStore;

	std::filesystem::path InventoryIconRulesDir()
	{
		return std::filesystem::current_path() / "Data" / "SKSE" / "Plugins" / "COG" / "gizmos" / "feed" /
			   "inventory";
	}

	const char* WeaponTypeName(RE::WEAPON_TYPE wt)
	{
		using WT = RE::WEAPON_TYPE;
		switch (wt) {
		case WT::kOneHandSword:
			return "onehandsword";
		case WT::kOneHandDagger:
			return "onehanddagger";
		case WT::kOneHandAxe:
			return "onehandaxe";
		case WT::kOneHandMace:
			return "onehandmace";
		case WT::kTwoHandSword:
			return "twohandsword";
		case WT::kTwoHandAxe:
			return "twohandaxe";
		case WT::kBow:
			return "bow";
		case WT::kStaff:
			return "staff";
		case WT::kCrossbow:
			return "crossbow";
		default:
			return nullptr;
		}
	}

	const char* ArmorTypeName(ArmorType t)
	{
		switch (t) {
		case ArmorType::kLightArmor:
			return "lightarmor";
		case ArmorType::kHeavyArmor:
			return "heavyarmor";
		case ArmorType::kClothing:
			return "clothing";
		default:
			return nullptr;
		}
	}

	const char* SlotName(Slot s)
	{
		switch (s) {
		case Slot::kHead:
			return "head";
		case Slot::kHair:
			return "hair";
		case Slot::kBody:
			return "body";
		case Slot::kHands:
			return "hands";
		case Slot::kForearms:
			return "forearms";
		case Slot::kAmulet:
			return "amulet";
		case Slot::kRing:
			return "ring";
		case Slot::kFeet:
			return "feet";
		case Slot::kCalves:
			return "calves";
		case Slot::kShield:
			return "shield";
		case Slot::kTail:
			return "tail";
		case Slot::kLongHair:
			return "longhair";
		case Slot::kCirclet:
			return "circlet";
		case Slot::kEars:
			return "ears";
		default:
			return nullptr;
		}
	}

	void CollectArmorSlots(CogFeed::IconRegistry::Candidates& c, RE::TESObjectARMO* armo)
	{
		if (!armo) {
			return;
		}
		static constexpr Slot kSlots[] = {
			Slot::kHead,    Slot::kHair,     Slot::kBody,     Slot::kHands,  Slot::kForearms,
			Slot::kAmulet,  Slot::kRing,     Slot::kFeet,     Slot::kCalves, Slot::kShield,
			Slot::kTail,    Slot::kLongHair, Slot::kCirclet,  Slot::kEars
		};
		for (const auto slot : kSlots) {
			if (armo->HasPartOf(slot)) {
				if (const char* n = SlotName(slot)) {
					CogFeed::IconRegistry::PushCandidate(c, "armorslot", n);
				}
			}
		}
		if (const char* at = ArmorTypeName(armo->GetArmorType())) {
			CogFeed::IconRegistry::PushCandidate(c, "armortype", at);
		}
	}

	std::string FormDisplayName(RE::TESForm* form, std::string_view fallback)
	{
		if (!fallback.empty()) {
			return std::string{ fallback };
		}
		if (!form) {
			return {};
		}
		if (auto* bound = form->As<RE::TESBoundObject>()) {
			if (const char* n = bound->GetName(); n && n[0]) {
				return n;
			}
		}
		if (auto* named = form->As<RE::TESFullName>()) {
			if (const char* n = named->GetFullName(); n && n[0]) {
				return n;
			}
		}
		return {};
	}

	CogFeed::IconRegistry::Candidates BuildInventoryIconCandidates(RE::TESForm* form, std::string_view displayName)
	{
		CogFeed::IconRegistry::Candidates c;
		const auto name = FormDisplayName(form, displayName);
		if (!name.empty()) {
			CogFeed::IconRegistry::PushCandidate(c, "name", name);
		}
		if (!form) {
			return c;
		}
		CogFeed::IconRegistry::PushCandidateRaw(c, "form", CogFeed::IconRegistry::FormLookupKey(form));
		CogFeed::IconRegistry::PushCandidate(c, "formtype", std::string{ RE::FormTypeToString(form->GetFormType()) });
		CogFeed::IconRegistry::CollectFormKeywords(c, form);

		if (auto* weap = form->As<RE::TESObjectWEAP>()) {
			if (const char* wt = WeaponTypeName(weap->GetWeaponType())) {
				CogFeed::IconRegistry::PushCandidate(c, "weapontype", wt);
			}
		}
		if (auto* armo = form->As<RE::TESObjectARMO>()) {
			CollectArmorSlots(c, armo);
		}
		return c;
	}

	std::string ResolveInventoryIcon(RE::TESForm* form, std::string_view displayName)
	{
		std::lock_guard lock(g_iconMutex);
		return CogFeed::IconRegistry::Resolve(g_iconStore, BuildInventoryIconCandidates(form, displayName));
	}

	struct Entry
	{
		std::uint64_t id = 0;
		std::string name;
		std::int32_t count = 1;
		bool added = true;
		bool stolen = false;
		std::string icon;
	};

	std::mutex g_mutex;
	std::deque<Entry> g_ring;
	std::uint64_t g_nextId = 1;
	std::uint64_t g_flushedId = 0;

	std::string EscapeJson(std::string_view raw)
	{
		std::string out;
		out.reserve(raw.size() + 8);
		for (char c : raw) {
			switch (c) {
			case '\\':
				out += "\\\\";
				break;
			case '"':
				out += "\\\"";
				break;
			case '\n':
				out += "\\n";
				break;
			case '\r':
				out += "\\r";
				break;
			case '\t':
				out += "\\t";
				break;
			default:
				out += c;
				break;
			}
		}
		return out;
	}

	std::string EntryToJson(const Entry& e)
	{
		std::ostringstream o;
		o << "{\"id\":" << e.id << ",\"name\":\"" << EscapeJson(e.name) << "\",\"count\":" << e.count
		  << ",\"added\":" << (e.added ? "true" : "false") << ",\"stolen\":" << (e.stolen ? "true" : "false")
		  << ",\"icon\":\"" << EscapeJson(e.icon) << "\"}";
		return o.str();
	}

	std::string_view TrimView(std::string_view s)
	{
		while (!s.empty() && (s.front() == ' ' || s.front() == '\t')) {
			s.remove_prefix(1);
		}
		while (!s.empty() && (s.back() == ' ' || s.back() == '\t')) {
			s.remove_suffix(1);
		}
		return s;
	}

	// ExtraDataList / InventoryEntryData::GetDisplayName substitute the sMissingName GMST
	// ("<Missing Name>") when FULL is empty. Treat that as unnamed so skin/armor like the
	// werewolf beast form never toast.
	const char* MissingNameGmst()
	{
		if (auto* games = RE::GameSettingCollection::GetSingleton()) {
			if (auto* setting = games->GetSetting("sMissingName")) {
				if (const char* text = setting->GetString(); text && text[0]) {
					return text;
				}
			}
		}
		return "<Missing Name>";
	}

	bool IsUsableItemDisplayName(std::string_view name)
	{
		name = TrimView(name);
		if (name.empty()) {
			return false;
		}
		const char* missing = MissingNameGmst();
		return !(missing && missing[0] && name == missing);
	}

	// Match what the inventory menu shows: hide CK "Non-Playable" tokens (TNG genital
	// covers, skin/armor placeholders, script equipment) that still fire container events.
	// ARMO/MISC/KEY use formFlags bit 2. WEAP/AMMO also gate on DATA NonPlayable via
	// GetPlayable() (true = playable). Do not use base GetPlayable() for ARMO — in CLIB-NG
	// that virtual returns the raw NonPlayable bit, opposite polarity from WEAP/AMMO.
	bool ShouldToastInventoryBound(RE::TESBoundObject* bound)
	{
		if (!bound || bound->IsDeleted()) {
			return false;
		}
		if (bound->formFlags & static_cast<std::uint32_t>(RE::TESForm::RecordFlags::kNonPlayable)) {
			return false;
		}
		if (auto* weap = bound->As<RE::TESObjectWEAP>()) {
			return weap->GetPlayable();
		}
		if (auto* ammo = bound->As<RE::TESAmmo>()) {
			return ammo->GetPlayable();
		}
		return true;
	}

	std::string UsableDisplayName(const char* name)
	{
		if (!name || !name[0]) {
			return {};
		}
		const auto trimmed = TrimView(name);
		if (!IsUsableItemDisplayName(trimmed)) {
			return {};
		}
		return std::string{ trimmed };
	}

	bool EndsWithPhrase(std::string_view text, std::optional<const char*> phraseOpt)
	{
		if (!phraseOpt || !*phraseOpt || !(*phraseOpt)[0]) {
			return false;
		}
		auto phrase = TrimView(std::string_view(*phraseOpt));
		if (phrase.empty() || phrase.size() > text.size()) {
			return false;
		}
		const auto suffix = text.substr(text.size() - phrase.size());
		for (std::size_t i = 0; i < phrase.size(); ++i) {
			const auto a = static_cast<unsigned char>(suffix[i]);
			const auto b = static_cast<unsigned char>(phrase[i]);
			if (std::tolower(a) != std::tolower(b)) {
				return false;
			}
		}
		return true;
	}

	std::string LowerTrimmed(std::string_view text)
	{
		text = TrimView(text);
		std::string out;
		out.reserve(text.size());
		for (char c : text) {
			out.push_back(static_cast<char>(std::tolower(static_cast<unsigned char>(c))));
		}
		return out;
	}

	bool IsGenericInventoryBatchToast(std::string_view text)
	{
		const auto lower = LowerTrimmed(text);
		return lower == "item(s) added" || lower == "items added" || lower == "item added" ||
		       lower == "item(s) removed" || lower == "items removed" || lower == "item removed";
	}

	bool LoadingOrTitleOpen()
	{
		auto* ui = RE::UI::GetSingleton();
		if (!ui) {
			return true;
		}
		return ui->IsMenuOpen(RE::LoadingMenu::MENU_NAME) ||
			ui->IsMenuOpen(RE::MainMenu::MENU_NAME) ||
			ui->IsMenuOpen(RE::RaceSexMenu::MENU_NAME) ||
			ui->IsMenuOpen("LoadWaitSpinner") ||
			ui->IsMenuOpen("Mist Menu");
	}

	// Inventory UI "stolen" (red hand) is ExtraOwnership via IsOwnedBy — there is no
	// separate stolen extra. defaultTo=true matches SkyUI / player-inventory rows.
	bool ExtraListIsStolen(RE::TESBoundObject* obj, RE::ExtraDataList* xList, RE::Actor* player)
	{
		if (!obj || !player) {
			return false;
		}
		RE::InventoryEntryData probe(obj, 1);
		if (xList) {
			probe.AddExtraList(xList);
		}
		return !probe.IsOwnedBy(player, true);
	}

	std::size_t CountExtraLists(RE::InventoryEntryData* entry)
	{
		std::size_t n = 0;
		if (entry && entry->extraLists) {
			for (auto* xList : *entry->extraLists) {
				if (xList) {
					++n;
				}
			}
		}
		return n;
	}

	RE::ExtraDataList* FirstExtraList(RE::InventoryEntryData* entry)
	{
		if (!entry || !entry->extraLists) {
			return nullptr;
		}
		for (auto* xList : *entry->extraLists) {
			if (xList) {
				return xList;
			}
		}
		return nullptr;
	}

	std::string BoundBaseName(RE::TESBoundObject* bound, RE::TESForm* form)
	{
		if (bound) {
			if (const char* n = bound->GetName(); n && n[0]) {
				return n;
			}
		}
		if (form) {
			if (auto* named = form->As<RE::TESFullName>()) {
				if (const char* n = named->GetFullName(); n && n[0]) {
					return n;
				}
			}
		}
		return {};
	}

	void FlushCogLog()
	{
		if (auto log = spdlog::default_logger()) {
			log->flush();
		}
	}

	void LogInventorySehFault(
		const char* stage,
		unsigned long code,
		RE::FormID baseObj,
		RE::FormID oldCont,
		RE::FormID newCont,
		std::int32_t count,
		bool added)
	{
		logger::critical(
			"InventoryFeed: native fault (SEH 0x{:08X}) during {} — CTD review C4 "
			"(GetInventory/ExtraData on TESContainerChangedEvent). "
			"form={:08X} count={} {} old={:08X} new={:08X}. "
			"Toast skipped for this event; alias-name resolve left enabled.",
			static_cast<std::uint32_t>(code),
			stage ? stage : "unknown",
			baseObj,
			count,
			added ? "add" : "remove",
			oldCont,
			newCont);
		FlushCogLog();
	}

	// MSVC: __try function must not own C++ objects that require unwinding.
	bool CallNoExceptSeh(void (*fn)(void*), void* ctx, unsigned long* outCode)
	{
		__try {
			fn(ctx);
			return true;
		} __except (EXCEPTION_EXECUTE_HANDLER) {
			if (outCode) {
				*outCode = GetExceptionCode();
			}
			return false;
		}
	}

	// Prefer ExtraTextDisplayData / InventoryEntryData so quest aliases resolve
	// (e.g. "Letter from Jarl Siddgeir of Falkreath" instead of "<Alias=Jarl>…").
	std::string ResolveBoundDisplayName(
		RE::TESObjectREFR* container,
		RE::TESBoundObject* bound,
		RE::TESForm* form,
		std::uint16_t uniqueID,
		RE::ObjectRefHandle worldRef)
	{
		if (!bound) {
			return BoundBaseName(bound, form);
		}

		auto nameFromList = [&](RE::ExtraDataList* xList) -> std::string {
			if (!xList) {
				return {};
			}
			if (auto fromList = UsableDisplayName(xList->GetDisplayName(bound)); !fromList.empty()) {
				return fromList;
			}
			if (auto* text = xList->GetByType<RE::ExtraTextDisplayData>()) {
				if (auto fromExtra = UsableDisplayName(text->GetDisplayName(bound, 1.0f)); !fromExtra.empty()) {
					return fromExtra;
				}
			}
			return {};
		};

		auto tryEntry = [&](RE::InventoryEntryData* entry) -> std::string {
			if (!entry) {
				return {};
			}
			if (uniqueID != 0 && entry->extraLists) {
				for (auto* xList : *entry->extraLists) {
					if (!xList) {
						continue;
					}
					const auto* uid = xList->GetByType<RE::ExtraUniqueID>();
					if (!uid || uid->uniqueID != uniqueID) {
						continue;
					}
					if (auto n = nameFromList(xList); !n.empty()) {
						return n;
					}
					RE::InventoryEntryData probe(bound, 1);
					probe.AddExtraList(xList);
					if (auto fromProbe = UsableDisplayName(probe.GetDisplayName()); !fromProbe.empty()) {
						return fromProbe;
					}
				}
			}
			if (auto fromEntry = UsableDisplayName(entry->GetDisplayName()); !fromEntry.empty()) {
				return fromEntry;
			}
			if (entry->extraLists) {
				for (auto* xList : *entry->extraLists) {
					if (auto n = nameFromList(xList); !n.empty()) {
						return n;
					}
				}
			}
			return {};
		};

		if (worldRef) {
			if (auto refr = worldRef.get()) {
				if (auto n = nameFromList(&refr->extraList); !n.empty()) {
					return n;
				}
			}
		}

		if (container) {
			const auto inventory = container->GetInventory(
				[bound](RE::TESBoundObject& obj) {
					return obj.GetFormID() == bound->GetFormID();
				});
			const auto it = inventory.find(bound);
			if (it != inventory.end() && it->second.second) {
				if (auto resolved = tryEntry(it->second.second.get()); !resolved.empty()) {
					return resolved;
				}
			}
		}

		return BoundBaseName(bound, form);
	}

	// Match the inventory stolen tag for *this* add (ExtraOwnership / IsOwnedBy on the
	// stack), not a sibling stack and not transient source ownership on corpses.
	bool PlayerAddedItemIsStolen(
		RE::PlayerCharacter* player,
		RE::TESBoundObject* bound,
		const RE::TESContainerChangedEvent* a_event)
	{
		if (!player || !bound || !a_event) {
			return false;
		}

		// Vanilla never tags corpse loot as stolen (see Contraband / Stolen Possessions).
		if (a_event->oldContainer != 0) {
			if (auto* oldForm = RE::TESForm::LookupByID(a_event->oldContainer)) {
				if (auto* actor = oldForm->As<RE::Actor>(); actor && actor->IsDead()) {
					return false;
				}
			}
		}

		const auto inventory = player->GetInventory(
			[bound](RE::TESBoundObject& obj) {
				return obj.GetFormID() == bound->GetFormID();
			});
		const auto it = inventory.find(bound);
		if (it == inventory.end() || !it->second.second) {
			return false;
		}

		auto* entry = it->second.second.get();
		if (a_event->uniqueID != 0 && entry->extraLists) {
			for (auto* xList : *entry->extraLists) {
				if (!xList) {
					continue;
				}
				if (const auto* uid = xList->GetByType<RE::ExtraUniqueID>();
					uid && uid->uniqueID == a_event->uniqueID) {
					return ExtraListIsStolen(bound, xList, player);
				}
			}
		}

		const auto listCount = CountExtraLists(entry);
		if (listCount <= 1) {
			if (auto* only = FirstExtraList(entry)) {
				return ExtraListIsStolen(bound, only, player);
			}
			return !entry->IsOwnedBy(player, true);
		}

		// Multiple stacks share this base form. entry->IsOwnedBy uses GetOwner() which
		// returns the *first* owned list — that wrongly paints clean adds (e.g. merchant
		// gold) when a stolen sibling stack exists. Prefer source when we can.
		if (a_event->oldContainer == 0) {
			if (const auto handle = a_event->reference; handle) {
				if (auto refr = handle.get()) {
					return refr->IsCrimeToActivate();
				}
			}
		}
		return false;
	}

	struct InventoryToastBuildCtx
	{
		RE::TESObjectREFR* nameContainer = nullptr;
		RE::TESBoundObject* bound = nullptr;
		RE::TESForm* form = nullptr;
		RE::PlayerCharacter* player = nullptr;
		const RE::TESContainerChangedEvent* event = nullptr;
		bool added = false;

		std::string name;
		std::string icon;
		bool stolen = false;
		bool skipUnnamed = false;
		const char* stage = "init";
	};

	void InventoryToastBuildRun(void* raw)
	{
		auto* ctx = static_cast<InventoryToastBuildCtx*>(raw);
		try {
			ctx->stage = "ResolveBoundDisplayName";
			ctx->name = ResolveBoundDisplayName(
				ctx->nameContainer,
				ctx->bound,
				ctx->form,
				ctx->event->uniqueID,
				ctx->event->reference);
			if (!IsUsableItemDisplayName(ctx->name)) {
				ctx->name.clear();
				ctx->skipUnnamed = true;
				return;
			}

			ctx->stage = "PlayerAddedItemIsStolen";
			ctx->stolen = ctx->added && PlayerAddedItemIsStolen(ctx->player, ctx->bound, ctx->event);

			ctx->stage = "ResolveInventoryIcon";
			try {
				ctx->icon = ResolveInventoryIcon(ctx->bound, ctx->name);
			} catch (...) {
				logger::warn("InventoryFeed: icon resolve failed for \"{}\"", ctx->name);
				FlushCogLog();
			}
			ctx->stage = "done";
		} catch (const std::exception& e) {
			logger::error(
				"InventoryFeed: C++ exception during {} — CTD review C4 path: {}",
				ctx->stage,
				e.what());
			FlushCogLog();
			if (ctx->name.empty()) {
				ctx->skipUnnamed = true;
			}
		} catch (...) {
			logger::error(
				"InventoryFeed: C++ exception during {} — CTD review C4 path",
				ctx->stage);
			FlushCogLog();
			if (ctx->name.empty()) {
				ctx->skipUnnamed = true;
			}
		}
	}

	class ContainerWatcher : public RE::BSTEventSink<RE::TESContainerChangedEvent>
	{
	public:
		static ContainerWatcher* GetSingleton()
		{
			static ContainerWatcher singleton;
			return &singleton;
		}

		RE::BSEventNotifyControl ProcessEvent(
			const RE::TESContainerChangedEvent* a_event,
			RE::BSTEventSource<RE::TESContainerChangedEvent>*) override
		{
			if (!a_event || !CogFeed::HasActiveInventory() || CogRegistry::Get().IsLoading() ||
				LoadingOrTitleOpen()) {
				return RE::BSEventNotifyControl::kContinue;
			}

			auto* player = RE::PlayerCharacter::GetSingleton();
			if (!player) {
				return RE::BSEventNotifyControl::kContinue;
			}

			const auto playerId = player->GetFormID();
			const bool added = a_event->newContainer == playerId;
			const bool removed = a_event->oldContainer == playerId;
			if (added == removed) {
				return RE::BSEventNotifyControl::kContinue;
			}

			if (a_event->baseObj == 0) {
				return RE::BSEventNotifyControl::kContinue;
			}

			const auto count64 = std::llabs(static_cast<std::int64_t>(a_event->itemCount));
			std::int32_t count = count64 > 0
				? static_cast<std::int32_t>((std::min)(count64, static_cast<std::int64_t>(INT32_MAX)))
				: 1;

			{
				std::lock_guard lock(g_dedupMutex);
				const auto now = std::chrono::steady_clock::now();
				const bool same =
					g_lastDedup.baseObj == a_event->baseObj &&
					g_lastDedup.oldContainer == a_event->oldContainer &&
					g_lastDedup.newContainer == a_event->newContainer &&
					g_lastDedup.itemCount == count &&
					g_lastDedup.added == added;
				if (same && now - g_lastDedup.at <= kContainerDedupWindow) {
					logger::debug(
						"InventoryFeed: skip duplicate container {} form={:08X} x{} ({} ms)",
						added ? "add" : "remove",
						a_event->baseObj,
						count,
						std::chrono::duration_cast<std::chrono::milliseconds>(now - g_lastDedup.at).count());
					return RE::BSEventNotifyControl::kContinue;
				}
				g_lastDedup = {
					a_event->baseObj,
					a_event->oldContainer,
					a_event->newContainer,
					count,
					added,
					now
				};
			}

			auto* form = RE::TESForm::LookupByID(a_event->baseObj);
			auto* bound = form ? form->As<RE::TESBoundObject>() : nullptr;
			if (!bound) {
				return RE::BSEventNotifyControl::kContinue;
			}

			if (!ShouldToastInventoryBound(bound)) {
				logger::debug(
					"InventoryFeed: skip non-playable/hidden form {:08X}",
					a_event->baseObj);
				return RE::BSEventNotifyControl::kContinue;
			}

			RE::TESObjectREFR* nameContainer = added ? static_cast<RE::TESObjectREFR*>(player) : nullptr;
			if (!nameContainer && !added) {
				if (auto* oldCont = RE::TESForm::LookupByID(a_event->oldContainer)) {
					nameContainer = oldCont->As<RE::TESObjectREFR>();
				}
			}
			if (!nameContainer && added) {
				if (auto* newCont = RE::TESForm::LookupByID(a_event->newContainer)) {
					nameContainer = newCont->As<RE::TESObjectREFR>();
				}
			}

			// Alias names need GetInventory/ExtraData on this event (kept). Wrap in SEH so a
			// mid-mutation AV logs a clear C4 breadcrumb to COG.log instead of a silent CTD.
			InventoryToastBuildCtx build;
			build.nameContainer = nameContainer;
			build.bound = bound;
			build.form = form;
			build.player = player;
			build.event = a_event;
			build.added = added;

			unsigned long sehCode = 0;
			if (!CallNoExceptSeh(&InventoryToastBuildRun, &build, &sehCode)) {
				LogInventorySehFault(
					build.stage,
					sehCode,
					a_event->baseObj,
					a_event->oldContainer,
					a_event->newContainer,
					count,
					added);
				return RE::BSEventNotifyControl::kContinue;
			}
			if (build.skipUnnamed || build.name.empty()) {
				logger::debug(
					"InventoryFeed: skip unnamed form {:08X} count={}",
					a_event->baseObj,
					a_event->itemCount);
				return RE::BSEventNotifyControl::kContinue;
			}

			logger::debug(
				"InventoryFeed: container {}{} form={:08X} \"{}\" x{} old={:08X} new={:08X}",
				added ? "add" : "remove",
				build.stolen ? " stolen" : "",
				a_event->baseObj,
				build.name,
				count,
				a_event->oldContainer,
				a_event->newContainer);

			CogFeed::EnqueueInventory(
				build.name,
				count,
				added,
				build.stolen,
				std::move(build.icon));
			return RE::BSEventNotifyControl::kContinue;
		}

	private:
		struct DedupState
		{
			RE::FormID baseObj = 0;
			RE::FormID oldContainer = 0;
			RE::FormID newContainer = 0;
			std::int32_t itemCount = 0;
			bool added = false;
			std::chrono::steady_clock::time_point at{};
		};

		std::mutex g_dedupMutex;
		DedupState g_lastDedup;
	};
}

void CogFeed::InstallInventorySink()
{
	static bool installed = false;
	if (installed) {
		return;
	}
	if (auto* holder = RE::ScriptEventSourceHolder::GetSingleton()) {
		holder->AddEventSink<RE::TESContainerChangedEvent>(ContainerWatcher::GetSingleton());
		installed = true;
		logger::info("InventoryFeed: TESContainerChangedEvent sink installed");
	} else {
		logger::error("InventoryFeed: ScriptEventSourceHolder missing; inventory tracking disabled");
	}
}

void CogFeed::LoadInventoryIconRules()
{
	std::lock_guard lock(g_iconMutex);
	IconRegistry::LoadDir(InventoryIconRulesDir(), g_iconStore, "InventoryIcons", IconRegistry::InventoryKinds());
}

bool CogFeed::TryParseInventoryToast(
	std::string_view text,
	std::string& outName,
	std::int32_t& outCount,
	bool& outAdded)
{
	using namespace RE::literals;
	text = TrimView(text);
	if (text.empty()) {
		return false;
	}

	bool added = false;
	std::string_view phrase;
	if (EndsWithPhrase(text, "sAddItemtoInventory"_gs)) {
		added = true;
		phrase = TrimView(std::string_view(*"sAddItemtoInventory"_gs));
	} else if (EndsWithPhrase(text, "sRemoveItemfromInventory"_gs)) {
		added = false;
		phrase = TrimView(std::string_view(*"sRemoveItemfromInventory"_gs));
	} else {
		return false;
	}

	auto body = TrimView(text.substr(0, text.size() - phrase.size()));
	if (body.empty()) {
		return false;
	}

	std::int32_t count = 1;
	if (body.back() == ')') {
		const auto open = body.rfind('(');
		if (open != std::string_view::npos && open + 1 < body.size()) {
			auto num = TrimView(body.substr(open + 1, body.size() - open - 2));
			bool digits = !num.empty();
			for (char c : num) {
				if (c < '0' || c > '9') {
					digits = false;
					break;
				}
			}
			if (digits) {
				count = static_cast<std::int32_t>(std::strtol(std::string(num).c_str(), nullptr, 10));
				if (count < 1) {
					count = 1;
				}
				body = TrimView(body.substr(0, open));
			}
		}
	}

	if (body.empty()) {
		return false;
	}

	outName = std::string(body);
	outCount = count;
	outAdded = added;
	return true;
}

bool CogFeed::IsInventoryToast(std::string_view text)
{
	std::string name;
	std::int32_t count = 1;
	bool added = true;
	if (TryParseInventoryToast(text, name, count, added)) {
		return true;
	}
	return IsGenericInventoryBatchToast(text);
}

void CogFeed::EnqueueInventory(
	std::string name,
	std::int32_t count,
	bool added,
	bool stolen,
	std::string icon)
{
	while (!name.empty() && (name.back() == '\n' || name.back() == '\r')) {
		name.pop_back();
	}
	if (!IsUsableItemDisplayName(name)) {
		logger::debug("InventoryFeed: enqueue skipped (unnamed / sMissingName)");
		return;
	}
	if (count < 1) {
		count = 1;
	}
	if (!added) {
		stolen = false;
	}
	// Empty icon → view falls back to feed gizmo Default Icon, then Treasure/bag.svg.

	Entry e;
	{
		std::lock_guard lock(g_mutex);
		e.id = g_nextId++;
		e.name = std::move(name);
		e.count = count;
		e.added = added;
		e.stolen = stolen;
		e.icon = std::move(icon);
		g_ring.push_back(e);
		while (g_ring.size() > kRingCap) {
			g_ring.pop_front();
		}
	}
	logger::debug(
		"InventoryFeed: queued id={} {}{} \"{}\" x{} icon=\"{}\"",
		e.id,
		e.added ? "add" : "remove",
		e.stolen ? " stolen" : "",
		e.name,
		e.count,
		e.icon);
}

std::vector<std::string> CogFeed::DrainInventoryEventsJson()
{
	std::vector<Entry> copy;
	{
		std::lock_guard lock(g_mutex);
		for (const auto& e : g_ring) {
			if (e.id > g_flushedId) {
				copy.push_back(e);
			}
		}
		if (!copy.empty()) {
			g_flushedId = copy.back().id;
		}
	}
	std::vector<std::string> out;
	out.reserve(copy.size());
	for (const auto& e : copy) {
		out.push_back(EntryToJson(e));
	}
	return out;
}
