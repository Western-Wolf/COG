#pragma once

#include <string>

namespace CogFeed
{
	void InstallSkillIncreaseSink();
	void LoadSkillIconRules();

	/**
	 * Classify a kSkillIncrease banner (skill vs level via pending SkillIncrease::Event),
	 * enqueue into Feed only when that subtype's checkbox is on, and refresh the XP meter
	 * when Level Progress is showing. Vanilla HUD is soft-hidden via hud.questUpdates when
	 * the Skills section is on; caller always kIgnores when the section is visible.
	 * @return true (always) — kept for call-site clarity / future gating.
	 */
	[[nodiscard]] bool HandleSkillIncreaseHud(std::string text);

	/**
	 * Snapshot player level XP into the Feed meter. Prefer calling from HandleSkillIncreaseHud
	 * (skill-up and diverted level-up) — not from the UI tick.
	 */
	void PushLevelProgressToUi();

	/** Dismiss the level XP meter receipt when no Feed is showing Level Progress. */
	void ClearLevelProgressIfHidden();
}
