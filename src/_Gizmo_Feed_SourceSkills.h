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

	/** Push character level XP progress when a Skills feed wants the live line. */
	void PushLevelProgressToUi();
}
