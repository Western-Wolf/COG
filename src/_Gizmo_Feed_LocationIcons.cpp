#include "pch.h"
#include "_Gizmo_Feed_LocationIcons.h"
#include "_Gizmo_Feed_UtilityIconRegistry.h"

#include <filesystem>
#include <mutex>

namespace
{
	std::mutex g_mutex;
	CogFeed::IconRegistry::Store g_store;

	std::filesystem::path LocationIconRulesDir()
	{
		return std::filesystem::current_path() / "Data" / "SKSE" / "Plugins" / "COG" / "gizmos" / "feed" /
			   "location";
	}
}

void CogFeed::LoadLocationIconRules()
{
	std::lock_guard lock(g_mutex);
	IconRegistry::LoadDir(LocationIconRulesDir(), g_store, "LocationIcons", IconRegistry::LocationKinds());
}

std::string CogFeed::ResolveLocationIcon(std::string_view placeText, std::string_view kind)
{
	CogFeed::IconRegistry::Candidates c;
	if (!placeText.empty()) {
		CogFeed::IconRegistry::PushCandidate(c, "name", std::string{ placeText });
	}
	const auto k = (kind == "current") ? "current" : "discovery";
	CogFeed::IconRegistry::PushCandidate(c, "kind", k);
	std::lock_guard lock(g_mutex);
	return CogFeed::IconRegistry::Resolve(g_store, c);
}
