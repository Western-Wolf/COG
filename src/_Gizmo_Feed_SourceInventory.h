#pragma once

#include <string>
#include <string_view>

namespace CogFeed
{
	void InstallInventorySink();

	void EnqueueInventory(
		std::string name,
		std::int32_t count,
		bool added,
		bool stolen = false,
		std::string icon = "Treasure/bag.svg");
	void LoadInventoryIconRules();

	bool TryParseInventoryToast(
		std::string_view text,
		std::string& outName,
		std::int32_t& outCount,
		bool& outAdded);

	[[nodiscard]] bool IsInventoryToast(std::string_view text);
}
