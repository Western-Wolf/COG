#pragma once

#include <string>
#include <vector>

namespace CogFeed
{
	void InstallSkillIncreaseSink();
	void LoadSkillIconRules();

	/** Diverted kSkillIncrease banner: classifies skill vs level and enqueues. */
	void HandleSkillIncreaseHud(std::string text);

	/** Drain newly queued skill toast entries as JSON objects (no surrounding array). */
	[[nodiscard]] std::vector<std::string> DrainSkillEventsJson();

	/**
	 * Snapshot player level XP into the Feed meter. Call only from the skill/level
	 * HUD divert (HandleSkillIncreaseHud) — not from the UI tick.
	 */
	void PushLevelProgressToUi();

	/** Dismiss the level XP meter receipt when no Feed is showing Level Progress. */
	void ClearLevelProgressIfHidden();
}
