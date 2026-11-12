#pragma once

#include <string>
#include <string_view>

namespace RE
{
	enum class HUD_MESSAGE_TYPE;
	class TESQuest;
}

namespace CogFeed
{
	void LoadQuestIconRules();

	/**
	 * Divert a quest / objective HUD banner into Feed Quests.
	 * Status lines get a Started/Completed/Failed label (HUDData has name only).
	 * On quest-status messages, also harvest currently displayed objectives from the quest
	 * when Quest Objectives divert is on (vanilla bundles them into the same notification).
	 */
	void HandleQuestHud(RE::HUD_MESSAGE_TYPE type, std::string text, RE::TESQuest* quest);
}
