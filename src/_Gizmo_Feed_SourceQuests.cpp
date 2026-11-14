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

	/** SKSE key → translated chrome word; English fallback if missing. */
	std::string TranslateChromeWord(const char* key, const char* fallback)
	{
		auto translated = TranslateHudText(key);
		if (translated.empty() || translated.starts_with('$')) {
			return fallback;
		}
		return translated;
	}

	enum class QuestLineStatus
	{
		None,
		Started,
		Completed,
		Failed
	};

	const char* StatusToken(QuestLineStatus status)
	{
		switch (status) {
		case QuestLineStatus::Started:
			return "started";
		case QuestLineStatus::Completed:
			return "completed";
		case QuestLineStatus::Failed:
			return "failed";
		default:
			return nullptr;
		}
	}

	QuestLineStatus StatusFromHudType(RE::HUD_MESSAGE_TYPE type)
	{
		switch (type) {
		case RE::HUD_MESSAGE_TYPE::kQuestStarted:
		case RE::HUD_MESSAGE_TYPE::kObjectiveStarted:
			return QuestLineStatus::Started;
		case RE::HUD_MESSAGE_TYPE::kQuestComplete:
		case RE::HUD_MESSAGE_TYPE::kObjectiveComplete:
			return QuestLineStatus::Completed;
		case RE::HUD_MESSAGE_TYPE::kQuestFailed:
		case RE::HUD_MESSAGE_TYPE::kObjectiveFailed:
			return QuestLineStatus::Failed;
		default:
			return QuestLineStatus::None;
		}
	}

	QuestLineStatus StatusFromObjectiveState(RE::QUEST_OBJECTIVE_STATE state)
	{
		using St = RE::QUEST_OBJECTIVE_STATE;
		if (state == St::kDisplayed) {
			return QuestLineStatus::Started;
		}
		if (state == St::kCompletedDisplayed) {
			return QuestLineStatus::Completed;
		}
		if (state == St::kFailedDisplayed) {
			return QuestLineStatus::Failed;
		}
		return QuestLineStatus::None;
	}

	/** Vanilla QuestNotification second word — $Started / $Completed / $Failed. */
	std::string StatusWord(QuestLineStatus status)
	{
		switch (status) {
		case QuestLineStatus::Started:
			return TranslateChromeWord("$Started", "Started");
		case QuestLineStatus::Completed:
			return TranslateChromeWord("$Completed", "Completed");
		case QuestLineStatus::Failed:
			return TranslateChromeWord("$Failed", "Failed");
		default:
			return {};
		}
	}

	std::string QuestTypeToken(RE::TESQuest* quest)
	{
		if (!quest) {
			return {};
		}
		using T = RE::QUEST_DATA::Type;
		switch (quest->GetType()) {
		case T::kNone:
			return "none";
		case T::kMainQuest:
			return "mainquest";
		case T::kMagesGuild:
			return "magesguild";
		case T::kThievesGuild:
			return "thievesguild";
		case T::kDarkBrotherhood:
			return "darkbrotherhood";
		case T::kCompanionsQuest:
			return "companionsquest";
		case T::kMiscellaneous:
			return "miscellaneous";
		case T::kDaedric:
			return "daedric";
		case T::kSideQuest:
			return "sidequest";
		case T::kCivilWar:
			return "civilwar";
		case T::kDLC01_Vampire:
			return "dlc01_vampire";
		case T::kDLC02_Dragonborn:
			return "dlc02_dragonborn";
		default:
			return {};
		}
	}

	std::string CleanHudName(std::string name)
	{
		name = TranslateHudText(std::move(name));
		while (!name.empty() && (name.back() == '\n' || name.back() == '\r')) {
			name.pop_back();
		}
		return name;
	}

	/** Vanilla-style: "Quest Started: <name>" — chrome via SKSE, name already cleaned. */
	std::string FormatQuestStatusLine(std::string rawName, QuestLineStatus status)
	{
		auto name = CleanHudName(std::move(rawName));
		if (name.empty()) {
			return {};
		}
		const auto statusWord = StatusWord(status);
		if (statusWord.empty()) {
			return name;
		}
		std::string out = TranslateChromeWord("$Quest", "Quest");
		out += ' ';
		out += statusWord;
		out += ": ";
		out += name;
		return out;
	}

	/**
	 * Objectives: plain when started/updated; "Completed: …" / "Failed: …" otherwise.
	 * No Started prefix (matches vanilla objective list chrome).
	 */
	std::string FormatQuestObjectiveLine(std::string rawName, QuestLineStatus status)
	{
		auto name = CleanHudName(std::move(rawName));
		if (name.empty()) {
			return {};
		}
		if (status != QuestLineStatus::Completed && status != QuestLineStatus::Failed) {
			return name;
		}
		std::string out = StatusWord(status);
		out += ": ";
		out += name;
		return out;
	}

	std::string ResolveQuestIcon(
		RE::TESQuest* quest,
		std::string_view rawName,
		QuestLineStatus status,
		bool objective)
	{
		CogFeed::IconRegistry::Candidates c;
		if (!rawName.empty()) {
			CogFeed::IconRegistry::PushCandidate(c, "name", std::string{ rawName });
		}
		if (const auto* token = StatusToken(status)) {
			CogFeed::IconRegistry::PushCandidate(c, objective ? "objectivestatus" : "queststatus", token);
		}
		if (quest) {
			const auto formKey = CogFeed::IconRegistry::FormLookupKey(quest);
			if (!formKey.empty()) {
				CogFeed::IconRegistry::PushCandidateRaw(c, "form", formKey);
			}
			// PushCandidate skips the literal "none"; questtype none must still match rules.
			if (auto typeTok = QuestTypeToken(quest); !typeTok.empty()) {
				CogFeed::IconRegistry::PushCandidateRaw(c, "questtype", std::move(typeTok));
			}
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

	void NotifyQuestLine(
		std::string message,
		std::string_view rawName,
		RE::TESQuest* quest,
		QuestLineStatus status,
		bool objective)
	{
		if (message.empty()) {
			return;
		}
		auto& reg = CogRegistry::Get();
		std::string icon = ResolveQuestIcon(quest, rawName, status, objective);
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
		const auto id = CogFeed::Notify(std::move(message), colorKey, std::move(icon), CogFeed::kSourceQuests);
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
			const auto status = StatusFromObjectiveState(state);
			const auto cleaned = CleanHudName(raw);
			NotifyQuestLine(
				FormatQuestObjectiveLine(raw, status),
				cleaned,
				quest,
				status,
				true);
		}
	}
}

void CogFeed::LoadQuestIconRules()
{
	std::lock_guard lock(g_iconMutex);
	IconRegistry::LoadDir(QuestIconRulesDir(), g_iconStore, "QuestIcons", IconRegistry::QuestKinds());
}

void CogFeed::HandleQuestHud(RE::HUD_MESSAGE_TYPE type, std::string text, RE::TESQuest* quest)
{
	auto& reg = CogRegistry::Get();
	const auto status = StatusFromHudType(type);

	if (IsQuestStatusType(type)) {
		if (reg.HasVisibleFeedDivertingQuestStatus()) {
			const auto cleaned = CleanHudName(text);
			NotifyQuestLine(
				FormatQuestStatusLine(text, status),
				cleaned,
				quest,
				status,
				false);
		}
		// Vanilla bundles displayed objectives into the same QuestUpdate notification.
		EnqueueDisplayedObjectives(quest);
		return;
	}

	if (!IsObjectiveType(type) || !reg.HasVisibleFeedDivertingQuestObjectives()) {
		return;
	}

	const auto cleaned = CleanHudName(text);
	auto line = FormatQuestObjectiveLine(text, status);
	if (line.empty() && quest) {
		// Empty HUD text — fall back to newly displayed objectives on the quest.
		EnqueueDisplayedObjectives(quest);
		return;
	}
	if (!line.empty()) {
		NotifyQuestLine(std::move(line), cleaned, quest, status, true);
	}
}
