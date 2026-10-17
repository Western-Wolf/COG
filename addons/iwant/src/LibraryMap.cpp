#include "pch.h"
#include "LibraryMap.h"

#include <algorithm>
#include <cctype>
#include <string>
#include <unordered_map>

namespace
{
	std::string StemLower(std::string_view path)
	{
		std::string p(path);
		std::replace(p.begin(), p.end(), '\\', '/');
		const auto slash = p.find_last_of('/');
		std::string base = slash == std::string::npos ? p : p.substr(slash + 1);
		const auto dot = base.find_last_of('.');
		if (dot != std::string::npos) {
			base.resize(dot);
		}
		std::transform(base.begin(), base.end(), base.begin(), [](unsigned char c) {
			return static_cast<char>(std::tolower(c));
		});
		return base;
	}

	const std::unordered_map<std::string, std::string>& WidgetsLibraryToCog()
	{
		// Filenames from iWant Widgets Interface/exported/widgets/iwant/widgets/library/*.dds
		static const std::unordered_map<std::string, std::string> kMap = {
			{ "apple", "Food and Drink/apple.svg" },
			{ "chickenleg", "Food and Drink/chicken-leg.svg" },
			{ "fire", "Survival/fire.svg" },
			{ "handcuffs", "Restraints/handcuffs.svg" },
			{ "moonandstars", "Celestial/moon-and-stars.svg" },
			{ "mug", "Food and Drink/stein.svg" },
			{ "raincloud", "Weather/raincloud.svg" },
			{ "raincloud1", "Weather/raincloud.svg" },
			{ "sheep", "Animals/goat.svg" },
			{ "skull", "Alchemy/skull.svg" },
			{ "skullandbones", "Alchemy/skull-and-bones.svg" },
			{ "snowflake", "Weather/snowflake.svg" },
			{ "sun", "Celestial/sun.svg" },
			{ "testscreen", "COG/cog.svg" },
			{ "thermometer-empty", "Temperature/thermometer-000.svg" },
			{ "thermometer-full", "Temperature/thermometer-100.svg" },
			{ "thermometer-half", "Temperature/thermometer-050.svg" },
			{ "thermometer-quarter", "Temperature/thermometer-025.svg" },
			{ "thermometer-threequarter", "Temperature/thermometer-075.svg" },
			{ "thermometer-0", "Temperature/thermometer-000.svg" },
			{ "thermometer-00", "Temperature/thermometer-000.svg" },
			{ "thermometer-000", "Temperature/thermometer-000.svg" },
			{ "thermometer-25", "Temperature/thermometer-025.svg" },
			{ "thermometer-025", "Temperature/thermometer-025.svg" },
			{ "thermometer-50", "Temperature/thermometer-050.svg" },
			{ "thermometer-050", "Temperature/thermometer-050.svg" },
			{ "thermometer-75", "Temperature/thermometer-075.svg" },
			{ "thermometer-075", "Temperature/thermometer-075.svg" },
			{ "thermometer-100", "Temperature/thermometer-100.svg" },
			{ "umbrella", "Weather/umbrella.svg" },
			{ "umbrella2", "Weather/umbrella.svg" },
			{ "vampire", "Vampire/fangs.svg" },
		};
		return kMap;
	}
}

namespace CogIWant::LibraryMap
{
	std::string MapWidgetsLibraryIcon(std::string_view exportedRelPath)
	{
		if (exportedRelPath.empty()) {
			return {};
		}
		const auto stem = StemLower(exportedRelPath);
		if (stem.empty()) {
			return {};
		}
		const auto& map = WidgetsLibraryToCog();
		const auto it = map.find(stem);
		if (it == map.end()) {
			return {};
		}
		return it->second;
	}
}
