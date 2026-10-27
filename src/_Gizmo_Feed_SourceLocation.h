#pragma once

#include <string>
#include <string_view>

namespace CogFeed
{
	void LoadLocationIconRules();

	/**
	 * Fully resolve a location icon for Notify: disk rules under
	 * <gizmoStorage>/location/*.txt (name / kind), else the visible Feed's
	 * locationDiscoveryIcon or currentLocationIcon setting.
	 */
	[[nodiscard]] std::string ResolveLocationIcon(std::string_view placeText, std::string_view kind);
}
