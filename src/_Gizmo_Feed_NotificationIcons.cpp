#include "pch.h"
#include "_Gizmo_Feed_NotificationIcons.h"
#include "_Gizmo_Feed_UtilityIconRegistry.h"

#include <filesystem>
#include <mutex>

namespace
{
	std::mutex g_mutex;
	CogFeed::IconRegistry::Store g_store;

	std::filesystem::path NotificationIconRulesDir()
	{
		return std::filesystem::current_path() / "Data" / "SKSE" / "Plugins" / "COG" / "gizmos" / "feed" /
			   "notifications";
	}
}

void CogFeed::LoadNotificationIconRules()
{
	std::lock_guard lock(g_mutex);
	IconRegistry::LoadDir(
		NotificationIconRulesDir(), g_store, "NotificationIcons", IconRegistry::NotificationKinds());
}

std::string CogFeed::ResolveNotificationIcon(std::string_view displayText)
{
	CogFeed::IconRegistry::Candidates c;
	if (!displayText.empty()) {
		CogFeed::IconRegistry::PushCandidate(c, "name", std::string{ displayText });
	}
	std::lock_guard lock(g_mutex);
	return CogFeed::IconRegistry::Resolve(g_store, c);
}
