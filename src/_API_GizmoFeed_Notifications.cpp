#include "pch.h"
#include "_API_GizmoFeed_Notifications.h"
#include "_Gizmo_Feed.h"
#include "_Gizmo_Feed_UtilityCallbackIntercept.h"
#include "_UI_CogUi.h"

namespace
{
	void LogNotifyDropped(std::string_view message)
	{
		// Polling scripts without a Feed can flood COG.log — keep signal, limit volume (same idea as CTD C9).
		static std::uint64_t s_count = 0;
		const auto n = ++s_count;
		if (n <= 8 || (n % 50) == 0) {
			logger::info(
				"COG_API.Notify dropped — no play-visible Feed with Notifications on (\"{}\"); dropCount={}",
				message,
				n);
		}
	}

	void Notify(RE::StaticFunctionTag*, std::string message, std::string color, std::string icon)
	{
		if (!CogFeed::HasActiveNotifications()) {
			LogNotifyDropped(message);
			return;
		}
		// Enqueue is mutex-safe from tasklets; Interop flush must run on the main thread.
		CogFeed::EnqueueNotification(std::move(message), std::move(color), std::move(icon));
		CogUi::RunOnMainThread([]() { CogFeed::FlushNotificationsToUi(); });
	}
}

bool CogApiGizmoFeedNotifications::Bind(RE::BSScript::IVirtualMachine* vm)
{
	if (!vm) {
		return false;
	}
	vm->RegisterFunction("Notify", "COG_API", Notify);
	vm->SetCallableFromTasklets("COG_API", "Notify", true);
	CogUiCallbackIntercept::Bind(vm);
	return true;
}
