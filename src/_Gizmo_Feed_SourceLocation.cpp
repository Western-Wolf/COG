#include "pch.h"
#include "_Gizmo_Feed_SourceLocation.h"
#include "_Gizmo_Feed_UtilityIconRegistry.h"
#include "_Gizmo_Storage.h"
#include "_Core_Registry.h"

#include <filesystem>
#include <mutex>

namespace
{
	std::mutex g_mutex;
	CogFeed::IconRegistry::Store g_store;

	std::filesystem::path LocationIconRulesDir()
	{
		return CogGizmoStorage::EnsureDir("cog-feed") / "location";
	}
}

void CogFeed::LoadLocationIconRules()
{
	std::lock_guard lock(g_mutex);
	IconRegistry::LoadDir(LocationIconRulesDir(), g_store, "LocationIcons", IconRegistry::LocationKinds());
}

std::string CogFeed::ResolveLocationIcon(std::string_view placeText, std::string_view kind)
{
	const bool current = kind == "current";
	const char* kindKey = current ? "current" : "discovery";

	CogFeed::IconRegistry::Candidates c;
	if (!placeText.empty()) {
		CogFeed::IconRegistry::PushCandidate(c, "name", std::string{ placeText });
	}
	CogFeed::IconRegistry::PushCandidate(c, "kind", kindKey);
	std::string icon;
	{
		std::lock_guard lock(g_mutex);
		icon = CogFeed::IconRegistry::Resolve(g_store, c);
	}
	if (!icon.empty()) {
		return icon;
	}
	// Same as colour: section default from the play-visible Feed that owns Location.
	return CogRegistry::Get().FirstVisibleFeedSetting(
		"showLocation",
		current ? "currentLocationIcon" : "locationDiscoveryIcon",
		current ? "Camping/compass.svg" : "Camping/map.svg");
}
