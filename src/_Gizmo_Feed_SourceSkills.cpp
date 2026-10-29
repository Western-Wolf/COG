#include "pch.h"
#include "_Gizmo_Feed_SourceSkills.h"
#include "_Gizmo_Feed.h"
#include "_Gizmo_Feed_API.h"
#include "_Gizmo_Feed_Log.h"
#include "_Gizmo_Feed_UtilityIconRegistry.h"
#include "_Gizmo_Storage.h"
#include "_Core_Registry.h"
#include "_UI_CogUi.h"

#include <RE/A/ActorValueList.h>
#include <RE/A/ActorValues.h>
#include <RE/P/PlayerCharacter.h>
#include <RE/S/SkillIncrease.h>

#include <chrono>
#include <cmath>
#include <cstdio>
#include <filesystem>
#include <limits>
#include <mutex>
#include <string>
#include <string_view>

namespace
{
	constexpr auto kPendingSkillTtl = std::chrono::milliseconds(750);

	std::mutex g_pendingMutex;
	RE::ActorValue g_pendingAv = RE::ActorValue::kNone;
	std::chrono::steady_clock::time_point g_pendingAt{};
	bool g_hasPending = false;

	std::mutex g_iconMutex;
	CogFeed::IconRegistry::Store g_iconStore;

	std::filesystem::path SkillIconRulesDir()
	{
		return CogGizmoStorage::EnsureDir("cog-feed") / "skills";
	}

	std::string TranslateHudText(std::string text)
	{
		while (!text.empty() && (text.back() == '\n' || text.back() == '\r')) {
			text.pop_back();
		}
		if (text.empty()) {
			return {};
		}
		if (text.starts_with('$')) {
			std::string translated;
			if (SKSE::Translation::Translate(text, translated) && !translated.empty()) {
				return translated;
			}
		}
		return text;
	}

	bool PeekPendingSkill(RE::ActorValue& outAv)
	{
		std::lock_guard lock(g_pendingMutex);
		if (!g_hasPending) {
			return false;
		}
		const auto age = std::chrono::steady_clock::now() - g_pendingAt;
		if (age > kPendingSkillTtl) {
			g_hasPending = false;
			g_pendingAv = RE::ActorValue::kNone;
			return false;
		}
		outAv = g_pendingAv;
		return outAv != RE::ActorValue::kNone;
	}

	bool TakePendingSkill(RE::ActorValue& outAv)
	{
		std::lock_guard lock(g_pendingMutex);
		if (!g_hasPending) {
			return false;
		}
		const auto age = std::chrono::steady_clock::now() - g_pendingAt;
		if (age > kPendingSkillTtl) {
			g_hasPending = false;
			g_pendingAv = RE::ActorValue::kNone;
			return false;
		}
		outAv = g_pendingAv;
		g_hasPending = false;
		g_pendingAv = RE::ActorValue::kNone;
		return outAv != RE::ActorValue::kNone;
	}

	void ClearPendingSkill()
	{
		std::lock_guard lock(g_pendingMutex);
		g_hasPending = false;
		g_pendingAv = RE::ActorValue::kNone;
	}

	std::string ResolveSkillIcon(RE::ActorValue av, std::string_view displayText)
	{
		CogFeed::IconRegistry::Candidates c;
		if (!displayText.empty()) {
			CogFeed::IconRegistry::PushCandidate(c, "name", std::string{ displayText });
		}
		const auto avStr = RE::ActorValueToString(av);
		if (!avStr.empty()) {
			CogFeed::IconRegistry::PushCandidate(c, "name", std::string{ avStr });
		}
		if (const char* avName = RE::ActorValueList::GetActorValueName(av); avName && avName[0]) {
			CogFeed::IconRegistry::PushCandidate(c, "name", avName);
		}
		std::lock_guard lock(g_iconMutex);
		return CogFeed::IconRegistry::Resolve(g_iconStore, c);
	}

	std::string ResolveSkillIconByText(std::string_view displayText)
	{
		CogFeed::IconRegistry::Candidates c;
		if (!displayText.empty()) {
			CogFeed::IconRegistry::PushCandidate(c, "name", std::string{ displayText });
		}
		std::lock_guard lock(g_iconMutex);
		return CogFeed::IconRegistry::Resolve(g_iconStore, c);
	}

	class SkillIncreaseWatcher : public RE::BSTEventSink<RE::SkillIncrease::Event>
	{
	public:
		static SkillIncreaseWatcher* GetSingleton()
		{
			static SkillIncreaseWatcher singleton;
			return &singleton;
		}

		RE::BSEventNotifyControl ProcessEvent(
			const RE::SkillIncrease::Event* a_event,
			RE::BSTEventSource<RE::SkillIncrease::Event>*) override
		{
			if (!a_event || a_event->actorValue == RE::ActorValue::kNone) {
				return RE::BSEventNotifyControl::kContinue;
			}
			std::lock_guard lock(g_pendingMutex);
			g_pendingAv = a_event->actorValue;
			g_pendingAt = std::chrono::steady_clock::now();
			g_hasPending = true;
			return RE::BSEventNotifyControl::kContinue;
		}
	};

	void EnqueueSkillInternal(std::string text, std::string kind)
	{
		text = TranslateHudText(std::move(text));
		if (text.empty()) {
			return;
		}
		if (kind != "level") {
			kind = "skill";
		}

		auto& reg = CogRegistry::Get();
		if (kind == "skill") {
			if (!reg.HasVisibleFeedShowingSkillProgress()) {
				ClearPendingSkill();
				return;
			}
		} else if (!reg.HasVisibleFeedShowingLevelProgress()) {
			ClearPendingSkill();
			return;
		}

		std::string icon;
		std::string colorKey;
		std::string iconKey;
		std::string iconFallback;
		if (kind == "skill") {
			RE::ActorValue av = RE::ActorValue::kNone;
			if (TakePendingSkill(av)) {
				icon = ResolveSkillIcon(av, text);
			} else {
				icon = ResolveSkillIconByText(text);
			}
			colorKey = "skillProgressColor";
			iconKey = "skillProgressIcon";
			iconFallback = "Scribe/book-open.svg";
		} else {
			ClearPendingSkill();
			colorKey = "levelProgressColor";
			iconKey = "levelProgressIcon";
			iconFallback = "Celestial/star.svg";
		}
		if (icon.empty()) {
			icon = reg.FirstVisibleFeedSetting("showSkills", iconKey, iconFallback);
		}
		// Colour is a feed colour-var name; each Feed instance resolves to its own settings hex.
		const auto id = CogFeed::Notify(std::move(text), colorKey, std::move(icon), CogFeed::kSourceSkills);
		CogFeedLog::debug("SkillsFeed: Notify id={} kind={} ", id, kind);
		if (id != 0) {
			CogUi::RunOnMainThread([]() { CogFeed::FlushNotificationsToUi(); });
		}
	}
}

namespace
{
	std::int32_t g_levelProgressReceipt = 0;
	float g_levelProgressLastXp = std::numeric_limits<float>::quiet_NaN();
	float g_levelProgressLastThreshold = std::numeric_limits<float>::quiet_NaN();
	std::uint16_t g_levelProgressLastLevel = 0;

	void ClearLevelProgressReceipt()
	{
		if (g_levelProgressReceipt != 0) {
			CogFeed::Dismiss(g_levelProgressReceipt);
			g_levelProgressReceipt = 0;
			CogFeed::FlushNotificationsToUi();
		}
		g_levelProgressLastXp = std::numeric_limits<float>::quiet_NaN();
		g_levelProgressLastThreshold = std::numeric_limits<float>::quiet_NaN();
		g_levelProgressLastLevel = 0;
	}
}

void CogFeed::InstallSkillIncreaseSink()
{
	static bool installed = false;
	if (installed) {
		return;
	}
	if (auto* src = RE::SkillIncrease::GetEventSource()) {
		src->AddEventSink(SkillIncreaseWatcher::GetSingleton());
		installed = true;
		logger::info("SkillsFeed: SkillIncrease::Event sink installed");
	} else {
		logger::error("SkillsFeed: SkillIncrease event source missing");
	}
}

void CogFeed::LoadSkillIconRules()
{
	std::lock_guard lock(g_iconMutex);
	IconRegistry::LoadDir(SkillIconRulesDir(), g_iconStore, "SkillIcons", IconRegistry::SkillsKinds());
}

bool CogFeed::HandleSkillIncreaseHud(std::string text)
{
	auto& reg = CogRegistry::Get();
	// Caller already gates on Skills section; always treat as diverted. Checkboxes gate Feed only.
	RE::ActorValue av = RE::ActorValue::kNone;
	const bool isSkill = PeekPendingSkill(av);
	if (isSkill) {
		if (reg.HasVisibleFeedShowingSkillProgress()) {
			EnqueueSkillInternal(std::move(text), "skill");
		} else {
			// Consume pending AV so a later level-up banner isn't misclassified as skill.
			ClearPendingSkill();
		}
	} else if (reg.HasVisibleFeedShowingLevelProgress()) {
		EnqueueSkillInternal(std::move(text), "level");
	}

	if (reg.HasVisibleFeedShowingLevelProgress()) {
		// HUD ProcessMessage is UI-thread; player skills + Prisma Interop go on the main task queue.
		CogUi::RunOnMainThread([]() { PushLevelProgressToUi(); });
	}
	return true;
}

void CogFeed::ClearLevelProgressIfHidden()
{
	if (!CogRegistry::Get().HasVisibleFeedShowingLevelProgress()) {
		ClearLevelProgressReceipt();
	}
}

void CogFeed::PushLevelProgressToUi()
{
	if (!CogRegistry::Get().HasVisibleFeedShowingLevelProgress()) {
		ClearLevelProgressReceipt();
		return;
	}
	auto* player = RE::PlayerCharacter::GetSingleton();
	if (!player) {
		ClearLevelProgressReceipt();
		return;
	}
	auto* skills = player->GetInfoRuntimeData().skills;
	if (!skills || !skills->data) {
		ClearLevelProgressReceipt();
		return;
	}
	const auto* data = skills->data;
	const float xp = data->xp;
	const float threshold = data->levelThreshold > 0.f ? data->levelThreshold : 1.f;
	const auto level = player->GetLevel();
	// Same divert can re-enter; skip identical meters so JS pulseAt can age out.
	if (g_levelProgressReceipt != 0 && level == g_levelProgressLastLevel &&
		xp == g_levelProgressLastXp && threshold == g_levelProgressLastThreshold) {
		return;
	}
	std::string message = "Level ";
	message += std::to_string(static_cast<unsigned>(level));

	g_levelProgressReceipt = Notify(
		std::move(message),
		"levelProgressColor",
		{},
		kSourceSkills,
		xp,
		threshold,
		{},
		g_levelProgressReceipt);
	g_levelProgressLastXp = xp;
	g_levelProgressLastThreshold = threshold;
	g_levelProgressLastLevel = level;
	FlushNotificationsToUi();
}
