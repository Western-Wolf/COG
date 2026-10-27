#include "_API_PrismaUI.h"
#include "_UI_CogUi.h"
#include "_Gears_LiveStats.h"
#include "_Gears_Inventory.h"
#include "_Gizmo_Feed.h"
#include "_Gizmo_Feed_API.h"
#include "_Gizmo_Feed_SourceActiveEffects.h"
#include "_Gizmo_Feed_SourceInventory.h"
#include "_Gizmo_Feed_SourceLocation.h"
#include "_Gizmo_Feed_Log.h"
#include "_Gizmo_Feed_SourceNotifications.h"
#include "_Gizmo_Feed_SourceSkills.h"
#include "_API_Core.h"
#include "_Core_Registry.h"
#include "_Core_HudSuppress.h"
#include "_Core_Icon.h"

#include <atomic>
#include <string>

namespace
{
	constexpr const char* kViewPath = "COG/overlay.html";

	// Coalesce Prisma "tick" — only one main-thread PushToUi queued at a time.
	std::atomic<bool> g_jsTickQueued{ false };

	const char* BuildConfig()
	{
#ifdef NDEBUG
		return "Release";
#else
		return "Debug";
#endif
	}

	void LogSessionBanner()
	{
		const auto* plugin = SKSE::PluginDeclaration::GetSingleton();
		const auto version = plugin ? REL::FormatProductVersion(plugin->GetVersion()) : std::string{ "?" };
		const auto name = plugin ? plugin->GetName() : "COG"sv;
		logger::info(
			"COG: session start — {} v{} ({}); view={}",
			name,
			version,
			BuildConfig(),
			kViewPath);
		if (auto dir = SKSE::log::log_directory()) {
			logger::info("COG: log file → {}/COG.log", dir->string());
		}
	}

	// Prisma/CEF clipboard APIs often report success without updating the OS clipboard.
	// Win32 write is the reliable path for editor Ctrl+C / Ctrl+X.
	bool SetOsClipboardUtf8(std::string_view utf8)
	{
		const int wideCount = MultiByteToWideChar(
			CP_UTF8,
			0,
			utf8.data(),
			static_cast<int>(utf8.size()),
			nullptr,
			0);
		if (wideCount <= 0) {
			return false;
		}
		const auto bytes = static_cast<std::size_t>(wideCount + 1) * sizeof(wchar_t);
		HGLOBAL mem = GlobalAlloc(GMEM_MOVEABLE, bytes);
		if (!mem) {
			return false;
		}
		auto* locked = static_cast<wchar_t*>(GlobalLock(mem));
		if (!locked) {
			GlobalFree(mem);
			return false;
		}
		MultiByteToWideChar(
			CP_UTF8,
			0,
			utf8.data(),
			static_cast<int>(utf8.size()),
			locked,
			wideCount);
		locked[wideCount] = L'\0';
		GlobalUnlock(mem);

		if (!OpenClipboard(nullptr)) {
			GlobalFree(mem);
			return false;
		}
		EmptyClipboard();
		if (!SetClipboardData(CF_UNICODETEXT, mem)) {
			CloseClipboard();
			GlobalFree(mem);
			return false;
		}
		CloseClipboard();
		return true;
	}

	void OnDomReady(PrismaView view)
	{
		logger::info("COG: [phase] view — DOM ready (id={})", view);
		// Prisma may invoke this off the game thread — defer engine/Prisma work.
		CogUi::RunOnMainThread([]() {
			CogRegistry::Get().SetViewReady(true);
			// CreateView/Show can leave the view focused; without Unfocus the game eats input
			// until the player opens and closes the COG menu.
			CogUi::Unfocus();
			// Always sync visibility (hard-hides during load). Defer live Push while loading.
			CogUi::SyncVisibility();
			if (!CogRegistry::Get().IsLoading()) {
				CogRegistry::Get().PushToUi();
				logger::info("COG: [phase] ready — initial snapshot pushed; overlay unfocused");
			} else {
				logger::info("COG: [phase] ready — DOM ready during load; live UI deferred");
			}
		});
	}

	void HandleJsMessage(const char* data)
	{
		if (!data) {
			return;
		}
		const std::string msg{ data };
		if (msg == "tick") {
			bool expected = false;
			if (!g_jsTickQueued.compare_exchange_strong(expected, true, std::memory_order_acq_rel)) {
				return;
			}
			CogUi::RunOnMainThread([]() {
				g_jsTickQueued.store(false, std::memory_order_release);
				// Visibility still runs during load (hard-hide); live PushToUi does not.
				CogUi::SyncVisibility();
				if (CogRegistry::Get().IsLoading()) {
					return;
				}
				CogRegistry::Get().PushToUi();
			});
			return;
		}
		if (msg.rfind("jsError:", 0) == 0) {
			logger::error("JS: {}", msg.substr(8));
			return;
		}
		if (msg.rfind("jsConfig:", 0) == 0) {
			logger::info("JS config: {}", msg.substr(9));
			return;
		}
		if (msg.rfind("clipboard:", 0) == 0) {
			// Win32 clipboard — safe on the listener thread; no game/GFx access.
			const auto text = msg.substr(10);
			if (!SetOsClipboardUtf8(text)) {
				logger::warn("clipboard: Win32 set FAILED ({} chars)", text.size());
			}
			return;
		}
		if (msg == "rebindStart") {
			CogUi::RunOnMainThread([]() { CogUi::SetRebinding(true); });
			return;
		}
		if (msg == "rebindCancel") {
			CogUi::RunOnMainThread([]() { CogUi::SetRebinding(false); });
			return;
		}
		if (msg == "hideRebindStart") {
			CogUi::RunOnMainThread([]() { CogUi::SetHideKeyRebinding(true); });
			return;
		}
		if (msg == "hideRebindCancel") {
			CogUi::RunOnMainThread([]() { CogUi::SetHideKeyRebinding(false); });
			return;
		}
		if (msg == "hideToggleKeyClear") {
			CogUi::RunOnMainThread([]() {
				CogRegistry::Get().SetHideToggleKey("");
				CogUi::SetHideKeyRebinding(false);
				CogRegistry::Get().PushToUi();
			});
			return;
		}
		if (msg.rfind("editorKey:", 0) == 0) {
			const auto key = msg.substr(10);
			CogUi::RunOnMainThread([key]() {
				CogRegistry::Get().SetEditorKey(key);
				CogUi::SetRebinding(false);
				CogRegistry::Get().PushToUi();
			});
			return;
		}
		if (msg.rfind("state:", 0) == 0) {
			const auto json = msg.substr(6);
			CogUi::RunOnMainThread([json]() {
				CogRegistry::Get().SetStateFromJson(json);
				CogRegistry::Get().PushToUi();
			});
			return;
		}
		if (msg == "inventoryGear:open") {
			CogUi::RunOnMainThread([]() { CogInventory::OpenPicker(); });
			return;
		}
		if (msg.rfind("inventoryGear:remove:", 0) == 0) {
			const auto name = msg.substr(21);
			CogUi::RunOnMainThread([name]() {
				CogInventory::RemoveGear(name);
				CogRegistry::Get().PushToUi();
			});
			return;
		}
		if (msg == "listImportedIcons") {
			CogUi::RunOnMainThread([]() { CogRegistry::Get().PushImportedIconsToUi(); });
			return;
		}
		logger::info("JS -> SKSE: {}", msg);
		if (msg.rfind("feedExpire:", 0) == 0) {
			const auto id = static_cast<std::int32_t>(std::strtol(msg.c_str() + 11, nullptr, 10));
			CogUi::RunOnMainThread([id]() { CogFeed::ExpireReceipt(id); });
			return;
		}
		logger::info("JS -> SKSE: {}", msg);
	}

	void SKSEMessageHandler(SKSE::MessagingInterface::Message* message)
	{
		switch (message->type) {
		case SKSE::MessagingInterface::kPreLoadGame:
			// Hide overlay for the load; LoadingMenu alone can miss some continue paths.
			logger::info("COG: [phase] PreLoadGame");
			CogRegistry::Get().OnLoadingMenuOpened();
			CogUi::SyncVisibility();
			return;
		case SKSE::MessagingInterface::kPostLoadGame:
			// Idempotent with LoadingMenu close — only the first resume after open runs.
			logger::info("COG: [phase] PostLoadGame");
			CogRegistry::Get().OnLoadingMenuClosed();
			return;
		case SKSE::MessagingInterface::kDataLoaded:
			break;
		default:
			return;
		}

		logger::info("COG: [phase] dataLoaded — installing hooks");
		CogLive::BindBowDrawTracking();
		CogHudSuppress::BindRemountWatchers();
		CogFeed::InstallHudHooks();
		CogFeed::InstallInventorySink();
		CogFeed::InstallSkillIncreaseSink();

		auto* prisma = PRISMA_UI_API::RequestPluginAPI<PRISMA_UI_API::IVPrismaUI1>();
		if (!prisma) {
			logger::critical("PrismaUI API not found. Is Prisma UI installed and loading before COG?");
			return;
		}
		logger::info("COG: [phase] prisma — API acquired");

		const auto view = prisma->CreateView(kViewPath, OnDomReady);
		if (!view) {
			logger::critical("CreateView failed for {}", kViewPath);
			return;
		}
		logger::info("COG: [phase] view — CreateView ok (id={})", view);

		CogIcon::EnsureFallbackIconOnDisk();
		CogUi::SetApi(prisma, view);
		CogRegistry::Get().LoadConfig();
		CogFeed::LoadInventoryIconRules();
		CogFeed::LoadEffectIconRules();
		CogFeed::LoadSkillIconRules();
		CogFeed::LoadNotificationIconRules();
		CogFeed::LoadLocationIconRules();
		prisma->RegisterJSListener(view, "cogToSKSE", HandleJsMessage);
		CogUi::RegisterMenuSink();
		CogUi::SyncVisibility();
		CogUi::BindEditorToggle();

		CogUi::SendReadyEvent();
		logger::info("COG: [phase] init — COG_Ready sent; waiting for DOM");
	}
}

SKSE_PLUGIN_LOAD(const SKSE::LoadInterface* a_skse)
{
	REL::Module::reset();
	SKSE::Init(a_skse, { .trampoline = true, .trampolineSize = 1 << 11 });
	CogFeedLog::Init();
	LogSessionBanner();

	auto* papyrus = SKSE::GetPapyrusInterface();
	if (!papyrus || !papyrus->Register(CogApi::Bind)) {
		logger::critical("Failed to register COG Papyrus natives");
		return false;
	}
	logger::info("COG: [phase] papyrus — natives registered");

	auto* messaging = SKSE::GetMessagingInterface();
	if (!messaging) {
		logger::critical("Failed to get SKSE messaging interface");
		return false;
	}

	messaging->RegisterListener("SKSE", SKSEMessageHandler);
	logger::info("COG: [phase] messaging — listener armed; waiting for dataLoaded");
	return true;
}
