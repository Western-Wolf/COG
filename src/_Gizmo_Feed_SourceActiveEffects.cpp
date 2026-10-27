#include "_Gizmo_Feed_SourceActiveEffects.h"
#include "_Gizmo_Feed.h"
#include "_Gizmo_Feed_API.h"
#include "_Gizmo_Feed_Log.h"

#include "_Core_Registry.h"
#include "_Gizmo_Feed_UtilityIconRegistry.h"
#include "_Gizmo_Storage.h"
#include "_UI_CogUi.h"

#include <RE/A/ActorValueList.h>
#include <RE/A/ActiveEffect.h>
#include <RE/E/EffectArchetypes.h>
#include <RE/E/EffectSetting.h>
#include <RE/F/FormTypes.h>
#include <RE/M/MagicTarget.h>
#include <RE/P/PlayerCharacter.h>
#include <RE/T/TESForm.h>
#include <RE/T/TESFullName.h>

#include <algorithm>
#include <cctype>
#include <cmath>
#include <cstdint>
#include <filesystem>
#include <mutex>
#include <sstream>
#include <string>
#include <string_view>
#include <unordered_map>
#include <unordered_set>
#include <vector>

#include <spdlog/spdlog.h>

namespace
{
	std::mutex g_effectIconMutex;
	std::mutex g_effectMetaMutex;
	CogFeed::IconRegistry::Store g_effectIconStore;

	/** Stable per-MGEF chrome — timers stay live each tick; name/icon/transform fill on miss. */
	struct EffectMetaCache
	{
		std::string name;
		std::string icon;
		bool transform{ false };
	};
	std::unordered_map<RE::FormID, EffectMetaCache> g_effectMetaByForm;

	void ClearEffectMetaCache()
	{
		std::lock_guard lock(g_effectMetaMutex);
		g_effectMetaByForm.clear();
	}

	std::filesystem::path EffectIconRulesDir()
	{
		return CogGizmoStorage::EnsureDir("cog-feed") / "effects";
	}

	void PushAv(CogFeed::IconRegistry::Candidates& c, RE::ActorValue av)
	{
		const auto name = RE::ActorValueToString(av);
		if (name.empty()) {
			return;
		}
		CogFeed::IconRegistry::PushCandidate(c, "av", std::string{ name });
	}

	CogFeed::IconRegistry::Candidates BuildEffectIconCandidates(
		RE::EffectSetting* effect,
		std::string_view displayName)
	{
		CogFeed::IconRegistry::Candidates c;
		if (!displayName.empty()) {
			CogFeed::IconRegistry::PushCandidate(c, "name", std::string{ displayName });
		}
		if (!effect) {
			return c;
		}
		CogFeed::IconRegistry::PushCandidateRaw(c, "form", CogFeed::IconRegistry::FormLookupKey(effect));
		CogFeed::IconRegistry::PushCandidate(
			c, "formtype", std::string{ RE::FormTypeToString(effect->GetFormType()) });

		{
			const auto archStr = effect->GetArchetypeAsString();
			if (!archStr.empty()) {
				CogFeed::IconRegistry::PushCandidate(c, "archetype", archStr.c_str());
			} else if (const char* arch = RE::EffectArchetypes::GetArchetypeName(effect->GetArchetype());
					   arch && arch[0]) {
				CogFeed::IconRegistry::PushCandidate(c, "archetype", arch);
			}
		}
		PushAv(c, effect->data.primaryAV);
		PushAv(c, effect->data.secondaryAV);
		PushAv(c, effect->GetMagickSkill());
		CogFeed::IconRegistry::CollectFormKeywords(c, effect);
		return c;
	}

	std::string ResolveEffectIcon(RE::EffectSetting* effect, std::string_view displayName)
	{
		std::lock_guard lock(g_effectIconMutex);
		return CogFeed::IconRegistry::Resolve(g_effectIconStore, BuildEffectIconCandidates(effect, displayName));
	}

	std::string EscapeJson(std::string_view s)
	{
		std::string out;
		out.reserve(s.size() + 8);
		for (char c : s) {
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

	void FlushCogLog()
	{
		if (auto log = spdlog::default_logger()) {
			log->flush();
		}
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

	std::string EffectDisplayName(RE::EffectSetting* base)
	{
		if (base) {
			const auto* n = base->GetFullName();
			if (n && n[0]) {
				return n;
			}
		}
		return "Effect";
	}

	bool EffectHiddenOrInactive(const RE::ActiveEffect* ae)
	{
		if (!ae) {
			return true;
		}
		if (ae->flags.any(RE::ActiveEffect::Flag::kInactive, RE::ActiveEffect::Flag::kDispelled)) {
			return true;
		}
		const auto* base = ae->GetBaseObject();
		if (!base) {
			return true;
		}
		return base->data.flags.any(RE::EffectSetting::EffectSettingData::Flag::kHideInUI);
	}

	bool NameLooksLikeTransform(std::string_view name)
	{
		if (name.empty()) {
			return false;
		}
		std::string lower;
		lower.reserve(name.size());
		for (char c : name) {
			lower.push_back(static_cast<char>(std::tolower(static_cast<unsigned char>(c))));
		}
		// Vanilla ships two "Beast Form" MGEFs (WerewolfChangeEffect + WerewolfChangeFXEffect);
		// Vampire Lord has a similar change/FX pair. Name catch covers the non-archetype FX twin.
		return lower.find("beast form") != std::string::npos ||
			   lower.find("vampire lord") != std::string::npos;
	}

	bool IsTransformEffect(RE::EffectSetting* base)
	{
		if (!base) {
			return false;
		}
		using A = RE::EffectArchetypes::ArchetypeID;
		switch (base->GetArchetype()) {
		case A::kWerewolf:
		case A::kWerewolfFeed:
		case A::kVampireLord:
			return true;
		default:
			break;
		}
		const auto* n = base->GetFullName();
		return n && NameLooksLikeTransform(n);
	}

	struct EffectPushRow
	{
		RE::FormID formId{ 0 };
		std::string name;
		std::string icon;
		float duration{ 0.f };
		float elapsed{ 0.f };
		float remaining{ 0.f };
		double percent{ 0.0 };
		bool transform{ false };
	};

	/** By value so callers never hold a map reference across the meta unlock / icon resolve. */
	EffectMetaCache MetaForEffect(RE::FormID formId, RE::EffectSetting* base)
	{
		{
			std::lock_guard lock(g_effectMetaMutex);
			if (auto it = g_effectMetaByForm.find(formId); it != g_effectMetaByForm.end()) {
				return it->second;
			}
		}
		EffectMetaCache meta;
		meta.name = EffectDisplayName(base);
		meta.icon = ResolveEffectIcon(base, meta.name);
		meta.transform = IsTransformEffect(base);
		std::lock_guard lock(g_effectMetaMutex);
		return g_effectMetaByForm.emplace(formId, std::move(meta)).first->second;
	}

	void PruneEffectMetaCache(const std::unordered_map<RE::FormID, EffectPushRow>& live)
	{
		std::lock_guard lock(g_effectMetaMutex);
		for (auto it = g_effectMetaByForm.begin(); it != g_effectMetaByForm.end();) {
			if (!live.contains(it->first)) {
				it = g_effectMetaByForm.erase(it);
			} else {
				++it;
			}
		}
	}

	// POD snapshot only — no ActiveEffect* kept past the SEH collect (CTD review C3).
	constexpr std::uint32_t kMaxEffectSnap = 96;

	struct EffectSnapPod
	{
		RE::FormID formId{ 0 };
		float duration{ 0.f };
		float elapsed{ 0.f };
	};

	struct EffectCollectCtx
	{
		RE::BSSimpleList<RE::ActiveEffect*>* list = nullptr;
		EffectSnapPod snaps[kMaxEffectSnap]{};
		std::uint32_t count = 0;
	};

	void EffectCollectRun(void* raw)
	{
		auto* ctx = static_cast<EffectCollectCtx*>(raw);
		ctx->count = 0;
		if (!ctx->list) {
			return;
		}
		for (auto* ae : *ctx->list) {
			if (ctx->count >= kMaxEffectSnap) {
				break;
			}
			if (EffectHiddenOrInactive(ae)) {
				continue;
			}
			auto* base = ae->GetBaseObject();
			if (!base) {
				continue;
			}
			const RE::FormID formId = base->GetFormID();
			if (formId == 0) {
				continue;
			}
			const float duration = ae->duration;
			const float elapsed = ae->elapsedSeconds;
			// Permanent / no-duration effects are out of scope for the timed Feed section.
			if (!(duration > 0.05f)) {
				continue;
			}
			const float remaining = duration - elapsed;
			if (!(remaining > 0.0f)) {
				continue;
			}
			ctx->snaps[ctx->count++] = EffectSnapPod{ formId, duration, elapsed };
		}
	}

	void LogActiveEffectSehFault(unsigned long code, std::uint32_t snapCount)
	{
		logger::critical(
			"ActiveEffects: native fault (SEH 0x{:08X}) during list snapshot — CTD review C3 "
			"(GetActiveEffectList mid-apply/dispel). snaps_before_fault≈{} (may be partial). "
			"AE push skipped this tick; last Feed payload kept.",
			static_cast<std::uint32_t>(code),
			snapCount);
		FlushCogLog();
	}
}

bool CogFeed::AnyFeedShowsActiveEffects()
{
	return CogRegistry::Get().AnyVisibleFeedShowsActiveEffects();
}

void CogFeed::PushActiveEffectsToUi()
{
	static std::unordered_map<RE::FormID, std::int32_t> effectReceipts;

	auto dismissAll = [&]() {
		for (auto& [_, receipt] : effectReceipts) {
			if (receipt != 0) {
				Dismiss(receipt);
			}
		}
		effectReceipts.clear();
		ClearEffectMetaCache();
		FlushNotificationsToUi();
	};

	if (!AnyFeedShowsActiveEffects()) {
		if (!effectReceipts.empty()) {
			dismissAll();
		}
		return;
	}

	auto* player = RE::PlayerCharacter::GetSingleton();
	if (!player) {
		dismissAll();
		return;
	}

	auto* target = player->AsMagicTarget();
	if (!target) {
		dismissAll();
		return;
	}

	auto* list = target->GetActiveEffectList();
	if (!list) {
		dismissAll();
		return;
	}

	EffectCollectCtx collect;
	collect.list = list;
	unsigned long sehCode = 0;
	if (!CallNoExceptSeh(&EffectCollectRun, &collect, &sehCode)) {
		LogActiveEffectSehFault(sehCode, collect.count);
		return;
	}

	std::unordered_map<RE::FormID, EffectPushRow> bestByForm;
	bestByForm.reserve(48);

	for (std::uint32_t i = 0; i < collect.count; ++i) {
		const auto& snap = collect.snaps[i];
		const float remaining = snap.duration - snap.elapsed;
		if (!(remaining > 0.0f)) {
			continue;
		}

		auto it = bestByForm.find(snap.formId);
		if (it != bestByForm.end() && !(remaining > it->second.remaining)) {
			continue;
		}

		auto* base = RE::TESForm::LookupByID<RE::EffectSetting>(snap.formId);
		if (!base) {
			continue;
		}

		const EffectMetaCache meta = MetaForEffect(snap.formId, base);
		EffectPushRow row;
		row.formId = snap.formId;
		row.name = meta.name;
		row.icon = meta.icon;
		row.duration = snap.duration;
		row.elapsed = snap.elapsed;
		row.remaining = remaining;
		row.percent = 0.0;
		row.transform = meta.transform;
		bestByForm[snap.formId] = std::move(row);
	}

	PruneEffectMetaCache(bestByForm);

	std::vector<EffectPushRow> rows;
	rows.reserve(bestByForm.size());
	for (auto& [_, row] : bestByForm) {
		rows.push_back(std::move(row));
	}
	std::sort(rows.begin(), rows.end(), [](const EffectPushRow& a, const EffectPushRow& b) {
		if (a.remaining != b.remaining) {
			return a.remaining < b.remaining;
		}
		return a.formId < b.formId;
	});

	auto& reg = CogRegistry::Get();
	const auto color = reg.FirstVisibleFeedSetting("showActiveEffects", "effectsColor", "#e8d2a0");
	const bool suppressTransform =
		reg.FirstVisibleFeedSettingBool("showActiveEffects", "suppressTransformEffects", true);
	std::unordered_set<RE::FormID> seen;
	seen.reserve(rows.size());
	constexpr std::uint32_t kMaxPush = 48;
	std::uint32_t count = 0;
	for (const auto& row : rows) {
		if (count >= kMaxPush) {
			break;
		}
		if (suppressTransform && row.transform) {
			continue;
		}
		std::int32_t prior = 0;
		if (auto it = effectReceipts.find(row.formId); it != effectReceipts.end()) {
			prior = it->second;
		}
		const auto receipt = Notify(
			row.name,
			color,
			row.icon,
			kSourceEffects,
			row.remaining,
			row.duration,
			"timer",
			prior);
		if (receipt != 0) {
			effectReceipts[row.formId] = receipt;
			seen.insert(row.formId);
		}
		++count;
	}

	for (auto it = effectReceipts.begin(); it != effectReceipts.end();) {
		if (seen.contains(it->first)) {
			++it;
			continue;
		}
		if (it->second != 0) {
			Dismiss(it->second);
		}
		it = effectReceipts.erase(it);
	}

	FlushNotificationsToUi();
}

void CogFeed::LoadEffectIconRules()
{
	{
		std::lock_guard lock(g_effectIconMutex);
		IconRegistry::LoadDir(EffectIconRulesDir(), g_effectIconStore, "EffectIcons", IconRegistry::EffectKinds());
	}
	// Meta clear outside the icon lock — MetaForEffect may take icon while inserting (C10).
	ClearEffectMetaCache();
}
