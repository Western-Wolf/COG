#pragma once

#include <string>
#include <string_view>

namespace CogFeed
{
	void LoadNotificationIconRules();

	/**
	 * Resolve icon from gizmos/feed/notifications/*.txt for a toast with no API icon.
	 * Callers must only invoke when the notification icon is empty (API icon wins).
	 */
	[[nodiscard]] std::string ResolveNotificationIcon(std::string_view displayText);
}
