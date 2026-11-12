#pragma once

#include <cstdint>
#include <string>
#include <string_view>
#include <vector>

namespace RE::BSScript
{
	class IVirtualMachine;
}

namespace CogFeed
{
	/** Builtin Feed source ids (canonical). Legacy cog-feed* aliases accepted at Notify. */
	inline constexpr const char* kSourceNotifications = "cog-notifications";
	inline constexpr const char* kSourceInventory = "cog-inventory";
	inline constexpr const char* kSourceLocation = "cog-location";
	inline constexpr const char* kSourceSkills = "cog-skills";
	inline constexpr const char* kSourceQuests = "cog-quests";
	inline constexpr const char* kSourceEffects = "cog-effects";

	/**
	 * Create/upsert a Feed line. Sources fully resolve message/color/icon/(meter) first.
	 * Empty/unknown asSource → Notifications bucket; log label "empty" or as provided.
	 * Sentinel current/max (< 0) → toast. Only current set → append number, toast.
	 * Both set → meter (type "timer" or progress). Expired/unknown receipt → new line.
	 * Returns 0 when dropped (no matching visible Feed section).
	 */
	[[nodiscard]] std::int32_t Notify(
		std::string message,
		std::string color = {},
		std::string icon = {},
		std::string source = {},
		float current = -1.0f,
		float maximum = -1.0f,
		std::string type = {},
		std::int32_t receipt = 0);

	/** Fade/remove a line. No-op for unknown receipt. */
	void Dismiss(std::int32_t receipt);

	/**
	 * JS reports a receipt finished fading — expire it so a later Notify with that id
	 * allocates a new line.
	 */
	void ExpireReceipt(std::int32_t receipt);

	/** Drain pending Notify upserts/dismissals into applyFeedEvents (with other drains). */
	[[nodiscard]] std::vector<std::string> DrainNotifyEventsJson();

	[[nodiscard]] bool SourceSectionVisible(std::string_view source);
}

namespace CogApiFeed
{
	bool Bind(RE::BSScript::IVirtualMachine* vm);
}
