#pragma once

#include <string>
#include <string_view>

namespace CogIWant::LibraryMap
{
	/**
	 * If exportedRelPath is an iWant Widgets shared-library icon, return the COG shipped
	 * icon path (e.g. "Food and Drink/apple.svg"). Otherwise return empty.
	 */
	[[nodiscard]] std::string MapWidgetsLibraryIcon(std::string_view exportedRelPath);
}
