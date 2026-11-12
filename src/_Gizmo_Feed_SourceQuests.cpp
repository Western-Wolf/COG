#include "pch.h"
#include "_Gizmo_Feed_SourceQuests.h"
#include "_Gizmo_Feed.h"
#include "_Gizmo_Feed_API.h"
#include "_Gizmo_Feed_Log.h"
#include "_Gizmo_Feed_UtilityIconRegistry.h"
#include "_Gizmo_Feed_Sources.h"
#include "_Core_Registry.h"
#include "_UI_CogUi.h"

#include <RE/H/HUDMessageTypes.h>
#include <RE/Q/QuestObjectiveStates.h>
#include <RE/T/TESQuest.h>

#include <filesystem>
#include <mutex>
#include <string>
#include <string_view>

namespace
{
	std::mutex g_iconMutex;
	CogFeed::IconRegistry::Store g_iconStore;

	std::filesystem::path QuestIconRulesDir()
	{
		return CogFeedSources::SourceStorageDir(CogFeedSources::kIdQuests);
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

	std::string ResolveQuestIcon(std::string_view displayText)
	{
		CogFeed::IconRegistry::Candidates c;
		if (!displayText.empty()) {
			CogFeed::IconRegistry::PushCandidate(c, "name", std::string{ displayText });
		}
		std::lock_guard lock(g_iconMutex);
		return CogFeed::IconRegistry::Resolve(g_iconStore, c);
	}

	bool IsQuestStatusType(RE::HUD_MESSAGE_TYPE type)
	{
		return type == RE::HUD_MESSAGE_TYPE::kQuestStarted ||
			type == RE::HUD_MESSAGE_TYPE::kQuestComplete ||
			type == RE::HUD_MESSAGE_TYPE::kQuestFailed;
	}

	bool IsObjectiveType(RE::HUD_MESSAGE_TYPE type)
	{
		return type == RE::HUD_MESSAGE_TYPE::kObjectiveStarted ||
			type == RE::HUD_MESSAGE_TYPE::kObjectiveComplete ||
			type == RE::HUD_MESSAGE_TYPE::kObjectiveFailed;
	}

	/** Vanilla QuestNotification shows this as a second animated word beside the name. */
	std::string StatusWord(RE::HUD_MESSAGE_TYPE type)
	{
		const char* key = nullptr;
		const char* fallback = nullptr;
		switch (type) {
		case RE::HUD_MESSAGE_TYPE::kQuestStarted:
		case RE::HUD_MESSAGE_TYPE::kObjectiveStarted:
			key = "$Started";
			fallback = "Started";
			break;
		case RE::HUD_MESSAGE_TYPE::kQuestComplete:
		case RE::HUD_MESSAGE_TYPE::kObjectiveComplete:
			key = "$Completed";
			fallback = "Completed";
			break;
		case RE::HUD_MESSAGE_TYPE::kQuestFailed:
		case RE::HUD_MESSAGE_TYPE::kObjectiveFailed:
			key = "$Failed";
			fallback = "Failed";
			break;
		default:
			return {};
		}
		auto translated = TranslateHudText(key);
		if (translated.empty() || translated.starts_with('$')) {
			return fallback;
		}
		return translated;
	}

	std::string CleanHudName(std::string name)
	{
		name = TranslateHudText(std::move(name));
		while (!name.empty() && (name.back() == '\n' || name.back() == '\r')) {
			name.pop_back();
		}
		return name;
	}

	/** Vanilla-style: "Quest Started: <name>". */
	std::string FormatQuestStatusLine(std::string name, std::string_view status)
	{
		name = CleanHudName(std::move(name));
		if (name.empty()) {
			return {};
		}
		if (status.empty()) {
			return name;
		}
		std::string out = "Quest ";
		out += status;
		out += ": ";
		out += name;
		return out;
	}

	/**
	 * Objectives: plain when started/updated; "Completed: …" / "Failed: …" otherwise.
	 * No Started prefix (matches vanilla objective list chrome).
	 */
	std::string FormatQuestObjectiveLine(std::string name, std::string_view prefix)
	{
		name = CleanHudName(std::move(name));
		if (name.empty()) {
			return {};
		}
		if (prefix.empty()) {
			return name;
		}
		std::string out{ prefix };
		out += ": ";
		out += name;
		return out;
	}

	std::string_view ObjectivePrefix(RE::HUD_MESSAGE_TYPE type)
	{
		switch (type) {
		case RE::HUD_MESSAGE_TYPE::kObjectiveComplete:
			return "Completed";
		case RE::HUD_MESSAGE_TYPE::kObjectiveFailed:
			return "Failed";
		default:
			return {};
		}
	}

	std::string_view ObjectivePrefixFromState(RE::QUEST_OBJECTIVE_STATE state)
	{
		using St = RE::QUEST_OBJECTIVE_STATE;
		if (state == St::kCompletedDisplayed) {
			return "Completed";
		}
		if (state == St::kFailedDisplayed) {
			return "Failed";
		}
		return {};
	}

	void NotifyQuestLine(std::string text, bool objective)
	{
		if (text.empty()) {
			return;
		}
		auto& reg = CogRegistry::Get();
		std::string icon = ResolveQuestIcon(text);
		std::string colorKey;
		std::string iconKey;
		std::string iconFallback;
		if (objective) {
			colorKey = "cog-quests.questObjectiveColor";
			iconKey = "questObjectiveIcon";
			iconFallback = "Scribe/list.svg";
		} else {
			colorKey = "cog-quests.questStatusColor";
			iconKey = "questStatusIcon";
			iconFallback = "Scribe/scroll.svg";
		}
		if (icon.empty()) {
			icon = reg.FirstVisibleFeedSetting(CogFeedSources::kIdQuests, iconKey, iconFallback);
		}
		const auto id = CogFeed::Notify(std::move(text), colorKey, std::move(icon), CogFeed::kSourceQuests);
		CogFeedLog::debug("QuestsFeed: Notify id={} objective={}", id, objective ? 1 : 0);
		if (id != 0) {
			CogUi::RunOnMainThread([]() { CogFeed::FlushNotificationsToUi(); });
		}
	}

	void EnqueueDisplayedObjectives(RE::TESQuest* quest)
	{
		if (!quest || !CogRegistry::Get().HasVisibleFeedDivertingQuestObjectives()) {
			return;
		}
		for (auto* obj : quest->objectives) {
			if (!obj) {
				continue;
			}
			const auto state = obj->state.get();
			using St = RE::QUEST_OBJECTIVE_STATE;
			if (state != St::kDisplayed && state != St::kCompletedDisplayed &&
				state != St::kFailedDisplayed) {
				continue;
			}
			const char* raw = obj->displayText.c_str();
			if (!raw || !raw[0]) {
				continue;
			}
			NotifyQuestLine(FormatQuestObjectiveLine(raw, ObjectivePrefixFromState(state)), true);
		}
	}
}

void CogFeed::LoadQuestIconRules()
{
	std::lock_guard lock(g_iconMutex);
	IconRegistry::LoadDir(QuestIconRulesDir(), g_iconStore, "QuestIcons", IconRegistry::SkillsKinds());
}

void CogFeed::HandleQuestHud(RE::HUD_MESSAGE_TYPE type, std::string text, RE::TESQuest* quest)
{
	auto& reg = CogRegistry::Get();
	const auto status = StatusWord(type);

	if (IsQuestStatusType(type)) {
		if (reg.HasVisibleFeedDivertingQuestStatus()) {
			NotifyQuestLine(FormatQuestStatusLine(std::move(text), status), false);
		}
		// Vanilla bundles displayed objectives into the same QuestUpdate notification.
		EnqueueDisplayedObjectives(quest);
		return;
	}

	if (!IsObjectiveType(type) || !reg.HasVisibleFeedDivertingQuestObjectives()) {
		return;
	}

	auto line = FormatQuestObjectiveLine(std::move(text), ObjectivePrefix(type));
	if (line.empty() && quest) {
		// Empty HUD text — fall back to newly displayed objectives on the quest.
		EnqueueDisplayedObjectives(quest);
		return;
	}
	if (!line.empty()) {
		NotifyQuestLine(std::move(line), true);
	}
}
