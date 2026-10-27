#include "pch.h"
#include "_API_GizmoFeed_Notifications.h"
#include "_Gizmo_Feed_UtilityCallbackIntercept.h"

bool CogApiGizmoFeedNotifications::Bind(RE::BSScript::IVirtualMachine* vm)
{
	if (!vm) {
		return false;
	}
	// Notify moved to COG_Feed_API (CogApiFeed::Bind). SkyUILib divert stays here.
	CogUiCallbackIntercept::Bind(vm);
	return true;
}
