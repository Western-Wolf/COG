#include "pch.h"
#include "_UI_CogUi.h"
#include "_UI_KeyNames.h"
#include "_Core_Registry.h"
#include "_Core_HudSuppress.h"
#include "_Gears_Inventory.h"
#include "_UI_KeyHandler.h"

#include <atomic>
#include <chrono>
#include <utility>

namespace
{
	PRISMA_UI_API::IVPrismaUI1* g_api = nullptr;
	PrismaView g_view = 0;
	bool g_hudVisible = true;
	KeyHandlerEvent g_toggleHandle = INVALID_REGISTRATION_HANDLE;
	std::uint32_t g_toggleScan = CogKeys::kDefaultEditorScan;
	KeyHandlerEvent g_hideToggleHandle = INVALID_REGISTRATION_HANDLE;
	std::uint32_t g_hideToggleScan = 0;
	bool g_rebinding = false;
	bool g_hideKeyRebinding = false;
	bool g_wantEditorFocus = false;
	std::atomic_bool g_uiHiddenDirty{ false };
	std::atomic_bool g_uiHiddenApplyQueued{ false };
	// Set when the editor Unfocuses while DialogueMenu (etc.) is open — Unfocus alone often
	// leaves look/camera dead until a Focus/Unfocus cycle runs in free gameplay.
	bool g_pendingCameraNudge = false;
	std::chrono::steady_clock::time_point g_rebindArmedAt{};

	constexpr std::string_view kCameraConflictMenus[] = {
		RE::DialogueMenu::MENU_NAME,
		RE::BookMenu::MENU_NAME,
		RE::MessageBoxMenu::MENU_NAME,
		RE::TrainingMenu::MENU_NAME,
		RE::LockpickingMenu::MENU_NAME,
		RE::SleepWaitMenu::MENU_NAME,
		RE::LevelUpMenu::MENU_NAME,
		RE::Console::MENU_NAME,
		RE::ConsoleNativeUIMenu::MENU_NAME
	};

	bool IsCameraConflictMenu(std::string_view name)
	{
		for (const auto menu : kCameraConflictMenus) {
			if (name == menu) {
				return true;
			}
		}
		return false;
	}

	bool AnyCameraConflictMenuOpen(std::string_view ignoreClosing = {})
	{
		auto* ui = RE::UI::GetSingleton();
		if (!ui) {
			return false;
		}
		for (const auto menu : kCameraConflictMenus) {
			if (!ignoreClosing.empty() && menu == ignoreClosing) {
				continue;
			}
			if (ui->IsMenuOpen(menu)) {
				return true;
			}
		}
		return false;
	}

	void RestoreGameplayLookInput()
	{
		if (auto* map = RE::ControlMap::GetSingleton()) {
			if (!map->IsLookingControlsEnabled()) {
				map->ToggleControls(RE::UserEvents::USER_EVENT_FLAG::kLooking, true, false);
			}
		}
		if (auto* pc = RE::PlayerControls::GetSingleton()) {
			pc->blockPlayerInput = false;
			if (pc->lookHandler) {
				pc->lookHandler->SetInputEventHandlingEnabled(true);
			}
		}
	}

	void MarkCameraNudgeIfNeeded()
	{
		if (AnyCameraConflictMenuOpen()) {
			g_pendingCameraNudge = true;
		}
	}

	bool GameHudVisible()
	{
		auto* ui = RE::UI::GetSingleton();
		if (!ui || !ui->IsShowingMenus()) {
			return false;
		}
		if (!ui->IsMenuOpen(RE::HUDMenu::MENU_NAME)) {
			return false;
		}
		if (const auto movie = ui->GetMovieView(RE::HUDMenu::MENU_NAME); movie && !movie->GetVisible()) {
			return false;
		}

		static constexpr std::string_view kHideMenus[] = {
			RE::DialogueMenu::MENU_NAME,
			RE::InventoryMenu::MENU_NAME,
			RE::MagicMenu::MENU_NAME,
			RE::TweenMenu::MENU_NAME,
			RE::JournalMenu::MENU_NAME,
			RE::MapMenu::MENU_NAME,
			RE::StatsMenu::MENU_NAME,
			RE::ContainerMenu::MENU_NAME,
			RE::BarterMenu::MENU_NAME,
			RE::GiftMenu::MENU_NAME,
			RE::CraftingMenu::MENU_NAME,
			RE::TrainingMenu::MENU_NAME,
			RE::FavoritesMenu::MENU_NAME,
			RE::LockpickingMenu::MENU_NAME,
			RE::BookMenu::MENU_NAME,
			RE::SleepWaitMenu::MENU_NAME,
			RE::LevelUpMenu::MENU_NAME,
			RE::MessageBoxMenu::MENU_NAME,
			RE::Console::MENU_NAME,
			RE::ConsoleNativeUIMenu::MENU_NAME,
			RE::LoadingMenu::MENU_NAME,
			RE::MainMenu::MENU_NAME,
			RE::RaceSexMenu::MENU_NAME,
			RE::ModManagerMenu::MENU_NAME,
			RE::CreditsMenu::MENU_NAME,
			RE::TitleSequenceMenu::MENU_NAME,
			RE::TutorialMenu::MENU_NAME,
			"GenericMenu",
			"CustomMenu",
			"Quantity Menu",
			"Creation Club Menu",
			// LoadWaitSpinner is the brief "Saving..." indicator (quicksave) — keep COG up.
			"Mist Menu"
		};
		for (const auto name : kHideMenus) {
			if (ui->IsMenuOpen(name)) {
				return false;
			}
		}
		return true;
	}

	// Inventory-feed stays on during gameplay menus (loot / inventory / barter).
	// Still suppress on loading / title / character-gen screens.
	bool HardHideOverlayMenusOpen()
	{
		auto* ui = RE::UI::GetSingleton();
		if (!ui) {
			return true;
		}
		static constexpr std::string_view kHardHide[] = {
			RE::LoadingMenu::MENU_NAME,
			RE::MainMenu::MENU_NAME,
			RE::RaceSexMenu::MENU_NAME,
			RE::ModManagerMenu::MENU_NAME,
			RE::CreditsMenu::MENU_NAME,
			RE::TitleSequenceMenu::MENU_NAME,
			// Not LoadWaitSpinner: quicksave must not Hide()/Show() the whole overlay.
			"Mist Menu"
		};
		for (const auto name : kHardHide) {
			if (ui->IsMenuOpen(name)) {
				return true;
			}
		}
		return false;
	}

	bool KeepOverlayForFeed()
	{
		if (!CogRegistry::Get().HasVisibleFeedShowingInventory()) {
			return false;
		}
		auto* ui = RE::UI::GetSingleton();
		if (!ui || !ui->IsShowingMenus()) {
			return false;
		}
		if (HardHideOverlayMenusOpen()) {
			return false;
		}
		return true;
	}

	void PushHudVisible(bool visible)
	{
		g_hudVisible = visible;
		if (g_api && g_view) {
			g_api->InteropCall(g_view, "setHudVisible", visible ? "true" : "false");
		}
	}

	/** Toggle UI hotkey: free gameplay only (HUD up, no hide-menus, no COG editor, no rebind). */
	bool CanUseHideToggleHotkey()
	{
		if (g_rebinding || g_hideKeyRebinding || g_wantEditorFocus) {
			return false;
		}
		// GameHudVisible already excludes console, inventory, map, journal, dialogue, etc.
		return GameHudVisible();
	}

	void ToggleEditor()
	{
		if (g_rebinding || g_hideKeyRebinding || !g_api || !g_view) {
			return;
		}
		// Track intent separately from HasFocus — Show()/CreateView can leave the view
		// focused and steal camera/movement until an explicit open/close cycle.
		if (!g_wantEditorFocus) {
			g_wantEditorFocus = true;
			// pauseGame: freeze world while editing. disableFocusMenu=false: keep Prisma
			// FocusMenu so the overlay owns cursor/keys more cleanly.
			if (g_api->Focus(g_view, true, false)) {
				g_api->Show(g_view);
				g_api->Invoke(g_view, "setFocused(true)");
				CogRegistry::Get().MarkCatalogDirty();
				CogRegistry::Get().MarkLayoutDirty();
				CogRegistry::Get().PushToUi();
				CogUi::SyncVisibility();
				logger::info("COG: editor opened (wantFocus=1 pause=1)");
			} else {
				g_wantEditorFocus = false;
				logger::warn("COG: editor open failed (Prisma Focus returned false)");
			}
		} else {
			MarkCameraNudgeIfNeeded();
			CogUi::Unfocus();
			CogUi::SyncVisibility();
			logger::info("COG: editor closed (wantFocus=0 pendingNudge={})", g_pendingCameraNudge ? 1 : 0);
		}
	}

	class MenuWatcher : public RE::BSTEventSink<RE::MenuOpenCloseEvent>
	{
	public:
		static MenuWatcher* GetSingleton()
		{
			static MenuWatcher singleton;
			return &singleton;
		}

		RE::BSEventNotifyControl ProcessEvent(const RE::MenuOpenCloseEvent* a_event, RE::BSTEventSource<RE::MenuOpenCloseEvent>*) override
		{
			if (a_event && a_event->menuName == RE::LoadingMenu::MENU_NAME) {
				if (a_event->opening) {
					CogRegistry::Get().OnLoadingMenuOpened();
				} else {
					// Arm load gate only — do not SyncHudDuplicates / live Push / ReapplyHidden here.
					// Live tick resumes as soon as IsLoading() clears (LoadingMenu closed).
					CogRegistry::Get().OnLoadingMenuClosed();
				}
				// Always SyncVisibility: during load it hard-hides; after close it shows again.
				CogUi::SyncVisibility();
				return RE::BSEventNotifyControl::kContinue;
			}
			if (a_event && !a_event->opening && a_event->menuName == RE::ContainerMenu::MENU_NAME) {
				CogInventory::OnContainerClosed();
			}
			if (a_event && !a_event->opening) {
				CogInventory::OnPickerMenuClosed();
				CogHudSuppress::OnMenuClosed(a_event->menuName);
			}
			// After DialogueMenu (etc.) closes, finish a deferred Focus/Unfocus if the editor
			// was closed while that menu still owned look/camera.
			if (a_event && !a_event->opening && IsCameraConflictMenu(a_event->menuName)) {
				CogUi::ReconcileEditorFocus(a_event->menuName);
			}
			// Soft-hide targets may remount visible when a menu opens (whole-menu widgets,
			// or HUD clips refreshed with the menu). Re-assert the full desired hide set —
			// no per-menu allowlist — immediate + one deferred pass for late movie attach.
			if (a_event && a_event->opening) {
				CogHudSuppress::ReapplyHidden();
				if (auto* tasks = SKSE::GetTaskInterface()) {
					tasks->AddTask([]() { CogHudSuppress::ReapplyHidden(); });
				}
				// Flash UiHidden can reset when menus remount — re-assert once, not every tick.
				if (CogRegistry::Get().IsUiHidden() && CogRegistry::Get().HideIncludesFlash()) {
					CogUi::ApplyFlashUiHidden(true);
					if (auto* tasks = SKSE::GetTaskInterface()) {
						tasks->AddTask([]() {
							if (CogRegistry::Get().IsUiHidden() && CogRegistry::Get().HideIncludesFlash()) {
								CogUi::ApplyFlashUiHidden(true);
							}
						});
					}
				}
			}
			CogUi::SyncVisibility();
			return RE::BSEventNotifyControl::kContinue;
		}
	};
}

void CogUi::SetApi(PRISMA_UI_API::IVPrismaUI1* api, PrismaView view)
{
	g_api = api;
	g_view = view;
}

bool CogUi::HasView()
{
	return g_api && g_view;
}

void CogUi::Invoke(const char* script)
{
	if (g_api && g_view && script) {
		g_api->Invoke(g_view, script);
	}
}

void CogUi::Unfocus()
{
	g_wantEditorFocus = false;
	if (g_api && g_view) {
		g_api->Unfocus(g_view);
		g_api->Invoke(g_view, "setFocused(false)");
	}
}

void CogUi::DismissEditorForGameMenu()
{
	MarkCameraNudgeIfNeeded();
	Unfocus();
}

void CogUi::ReconcileEditorFocus(std::string_view closingMenu)
{
	if (!g_pendingCameraNudge || g_wantEditorFocus || !g_api || !g_view) {
		return;
	}
	// Wait until every conflicting menu is gone (event may fire while IsMenuOpen is still true).
	if (AnyCameraConflictMenuOpen(closingMenu)) {
		return;
	}
	g_pendingCameraNudge = false;
	auto nudge = []() {
		if (g_wantEditorFocus || !g_api || !g_view) {
			return;
		}
		// Same recovery path as manually opening and closing the editor.
		// Do not call MarkCameraNudge from Unfocus here — that re-arms pending and can
		// Focus/Unfocus-loop during menu teardown (quit freeze).
		(void)g_api->Focus(g_view, false, false);
		g_api->Unfocus(g_view);
		g_api->Invoke(g_view, "setFocused(false)");
		RestoreGameplayLookInput();
		logger::info("COG: camera focus nudge after gameplay menu close");
	};
	if (auto* tasks = SKSE::GetTaskInterface()) {
		// Two frames out: DialogueMenu teardown often finishes after the close event.
		tasks->AddTask([nudge]() {
			if (auto* tasks2 = SKSE::GetTaskInterface()) {
				tasks2->AddTask(nudge);
			} else {
				nudge();
			}
		});
	} else {
		nudge();
	}
}

bool CogUi::CanOpenGameplayMenu()
{
	// g_wantEditorFocus tracks editor intent; Prisma HasFocus can stay true while the HUD overlay is shown.
	if (g_wantEditorFocus) {
		return false;
	}
	auto* ui = RE::UI::GetSingleton();
	if (!ui) {
		return false;
	}
	if (ui->IsMenuOpen(RE::ContainerMenu::MENU_NAME)) {
		return false;
	}
	// Prisma keeps overlay / custom menus open for the HUD — only block menus that
	// actually conflict with the vanilla container loot UI.
	static constexpr std::string_view kBlock[] = {
		RE::DialogueMenu::MENU_NAME,
		RE::InventoryMenu::MENU_NAME,
		RE::MagicMenu::MENU_NAME,
		RE::JournalMenu::MENU_NAME,
		RE::MapMenu::MENU_NAME,
		RE::StatsMenu::MENU_NAME,
		RE::BarterMenu::MENU_NAME,
		RE::GiftMenu::MENU_NAME,
		RE::CraftingMenu::MENU_NAME,
		RE::TrainingMenu::MENU_NAME,
		RE::FavoritesMenu::MENU_NAME,
		RE::LockpickingMenu::MENU_NAME,
		RE::BookMenu::MENU_NAME,
		RE::SleepWaitMenu::MENU_NAME,
		RE::LevelUpMenu::MENU_NAME,
		RE::MessageBoxMenu::MENU_NAME,
		RE::Console::MENU_NAME,
		RE::ConsoleNativeUIMenu::MENU_NAME,
		RE::LoadingMenu::MENU_NAME,
		RE::MainMenu::MENU_NAME,
		RE::RaceSexMenu::MENU_NAME,
		RE::ModManagerMenu::MENU_NAME,
		RE::CreditsMenu::MENU_NAME,
		RE::TitleSequenceMenu::MENU_NAME,
		RE::TutorialMenu::MENU_NAME,
		"Quantity Menu",
		"Creation Club Menu",
		"LoadWaitSpinner",
		"Mist Menu"
	};
	for (const auto name : kBlock) {
		if (ui->IsMenuOpen(name)) {
			return false;
		}
	}
	return true;
}

std::string CogUi::DescribeGameplayMenuBlock()
{
	if (g_wantEditorFocus) {
		return "COG editor still wants focus";
	}
	auto* ui = RE::UI::GetSingleton();
	if (!ui) {
		return "UI singleton missing";
	}
	if (ui->IsMenuOpen(RE::ContainerMenu::MENU_NAME)) {
		return "ContainerMenu already open";
	}
	static constexpr std::string_view kBlock[] = {
		RE::DialogueMenu::MENU_NAME,
		RE::InventoryMenu::MENU_NAME,
		RE::MagicMenu::MENU_NAME,
		RE::JournalMenu::MENU_NAME,
		RE::MapMenu::MENU_NAME,
		RE::StatsMenu::MENU_NAME,
		RE::BarterMenu::MENU_NAME,
		RE::GiftMenu::MENU_NAME,
		RE::CraftingMenu::MENU_NAME,
		RE::TrainingMenu::MENU_NAME,
		RE::FavoritesMenu::MENU_NAME,
		RE::LockpickingMenu::MENU_NAME,
		RE::BookMenu::MENU_NAME,
		RE::SleepWaitMenu::MENU_NAME,
		RE::LevelUpMenu::MENU_NAME,
		RE::MessageBoxMenu::MENU_NAME,
		RE::Console::MENU_NAME,
		RE::ConsoleNativeUIMenu::MENU_NAME,
		RE::LoadingMenu::MENU_NAME,
		RE::MainMenu::MENU_NAME,
		RE::RaceSexMenu::MENU_NAME,
		RE::ModManagerMenu::MENU_NAME,
		RE::CreditsMenu::MENU_NAME,
		RE::TitleSequenceMenu::MENU_NAME,
		RE::TutorialMenu::MENU_NAME,
		"Quantity Menu",
		"Creation Club Menu",
		"LoadWaitSpinner",
		"Mist Menu"
	};
	for (const auto name : kBlock) {
		if (ui->IsMenuOpen(name)) {
			return std::string("menu open: ") + std::string(name);
		}
	}
	return {};
}

void CogUi::Interop(const char* functionName, const std::string& argument)
{
	if (CogRegistry::Get().IsLoading()) {
		return;
	}
	if (g_api && g_view && functionName) {
		g_api->InteropCall(g_view, functionName, argument.c_str());
	}
}

void CogUi::RunOnMainThread(std::function<void()> fn)
{
	if (!fn) {
		return;
	}
	if (auto* tasks = SKSE::GetTaskInterface()) {
		tasks->AddTask([fn = std::move(fn)]() mutable { fn(); });
		return;
	}
	fn();
}

void CogUi::SendReadyEvent()
{
	SKSE::ModCallbackEvent ev{ "COG_Ready", "", 0.0f, nullptr };
	if (auto* source = SKSE::GetModCallbackEventSource()) {
		source->SendEvent(&ev);
	}
}

void CogUi::RegisterMenuSink()
{
	if (auto* ui = RE::UI::GetSingleton()) {
		ui->AddEventSink<RE::MenuOpenCloseEvent>(MenuWatcher::GetSingleton());
	}
}

void CogUi::SyncVisibility()
{
	if (!g_api || !g_view) {
		return;
	}
	// Load in progress: hard-hide overlay; live PushToUi stays gated until load finishes.
	if (CogRegistry::Get().IsLoading()) {
		PushHudVisible(false);
		if (!g_api->IsHidden(g_view)) {
			g_api->Hide(g_view);
		}
		CogRegistry::Get().MaybeReconcileSenders();
		return;
	}
	const bool hud = GameHudVisible();
	const bool keepInventory = KeepOverlayForFeed();
	// Editor open: keep soft-HUD "on" so preview stays visible even if a hide-menu
	// (inventory, map, mod hotkeys, etc.) would otherwise soft-hide the overlay.
	PushHudVisible(g_wantEditorFocus || hud);
	if (g_wantEditorFocus || hud || keepInventory) {
		if (g_api->IsHidden(g_view)) {
			g_api->Show(g_view);
		}
	} else if (!g_api->IsHidden(g_view)) {
		g_api->Hide(g_view);
	}
	CogRegistry::Get().MaybeReconcileSenders();
}

void CogUi::BindEditorToggle()
{
	KeyHandler::RegisterSink();
	SyncEditorKey();
	SyncHideToggleKey();
}

void CogUi::SyncEditorKey()
{
	auto scan = CogKeys::ScanCodeFromName(CogRegistry::Get().EditorKey());
	if (scan == 0) {
		scan = CogKeys::kDefaultEditorScan;
	}
	auto* keys = KeyHandler::GetSingleton();
	if (g_toggleHandle == INVALID_REGISTRATION_HANDLE) {
		g_toggleHandle = keys->Register(scan, KeyEventType::KEY_DOWN, ToggleEditor);
		g_toggleScan = scan;
		return;
	}
	if (scan != g_toggleScan && keys->Rebind(g_toggleHandle, scan)) {
		g_toggleScan = scan;
	}
}

void CogUi::SyncHideToggleKey()
{
	auto* keys = KeyHandler::GetSingleton();
	const auto name = CogRegistry::Get().HideToggleKey();
	const auto scan = name.empty() ? 0u : CogKeys::ScanCodeFromName(name);
	if (scan == 0) {
		if (g_hideToggleHandle != INVALID_REGISTRATION_HANDLE) {
			keys->Unregister(g_hideToggleHandle);
			g_hideToggleHandle = INVALID_REGISTRATION_HANDLE;
			g_hideToggleScan = 0;
		}
		return;
	}
	if (g_hideToggleHandle == INVALID_REGISTRATION_HANDLE) {
		g_hideToggleHandle = keys->Register(scan, KeyEventType::KEY_DOWN, []() {
			// Never toggle from search / console / COG editor / any gameplay menu.
			if (!CanUseHideToggleHotkey()) {
				return;
			}
			// Bounce guard — coalesce below still collapses Apply, but avoid flip-flopping
			// the session flag on accidental double-taps.
			static std::chrono::steady_clock::time_point last{};
			const auto now = std::chrono::steady_clock::now();
			if (now - last < std::chrono::milliseconds(350)) {
				return;
			}
			last = now;
			// Flip on the main task queue — never touch GFx/Prisma inside the input sink.
			CogUi::RunOnMainThread([]() {
				if (!CanUseHideToggleHotkey()) {
					return;
				}
				CogRegistry::Get().ToggleUiHidden();
			});
		});
		g_hideToggleScan = scan;
		return;
	}
	if (scan != g_hideToggleScan && keys->Rebind(g_hideToggleHandle, scan)) {
		g_hideToggleScan = scan;
	}
}

void CogUi::ApplyFlashUiHidden(bool hidden)
{
	// Soft-hide known Flash HUD menus via _root._alpha (0 / restore 100). Soft dependency.
	static constexpr const char* kMenus[] = {
		"HUD Menu",
		"MiniMapMenu",
		"TrueHUD",
		"lvlWidget",
		"goldWidget",
		"gametimeWidget",
		"shoutWidget",
		"resistWidget",
		"playtimeWidget",
		"weightWidget",
		"equipWidget_STB",
		"STBActiveEffects",
		"BTPS Menu",
		"BTPS Ovelay Menu",
	};
	auto* ui = RE::UI::GetSingleton();
	if (!ui) {
		return;
	}
	RE::GFxValue alpha;
	alpha.SetNumber(hidden ? 0.0 : 100.0);
	for (const char* menu : kMenus) {
		const auto movie = ui->GetMovieView(menu);
		if (!movie) {
			continue;
		}
		movie->SetVariable("_root._alpha", alpha);
	}
}

void CogUi::ScheduleUiHiddenApply()
{
	g_uiHiddenDirty.store(true);
	if (g_uiHiddenApplyQueued.exchange(true)) {
		return;
	}
	RunOnMainThread([]() {
		do {
			g_uiHiddenDirty.store(false);
			const bool hidden = CogRegistry::Get().IsUiHidden();
			const bool includeFlash = CogRegistry::Get().HideIncludesFlash();
			if (hidden) {
				if (includeFlash) {
					ApplyFlashUiHidden(true);
				}
			} else {
				// Always restore Flash when showing again (no-op if never dimmed).
				ApplyFlashUiHidden(false);
			}
			Interop("setUiHidden", hidden ? "true" : "false");
		} while (g_uiHiddenDirty.load());
		g_uiHiddenApplyQueued.store(false);
		// Rare race: dirty flipped after the loop check but before queued cleared.
		if (g_uiHiddenDirty.load()) {
			ScheduleUiHiddenApply();
		}
	});
}

namespace
{
	bool IsModifierOrLockScan(std::uint32_t scan)
	{
		switch (scan) {
		case 0x1D:
		case 0x2A:
		case 0x36:
		case 0x38:
		case 0x3A:
		case 0x9D:
		case 0xB8:
		case 0xDB:
		case 0xDC:
			return true;
		default:
			return false;
		}
	}
}

void CogUi::SetRebinding(bool on)
{
	g_rebinding = on;
	if (on) {
		g_hideKeyRebinding = false;
	}
	auto* keys = KeyHandler::GetSingleton();
	if (!on) {
		if (!g_hideKeyRebinding) {
			g_rebindArmedAt = {};
			keys->SetCapture(nullptr);
		}
		return;
	}
	g_rebindArmedAt = std::chrono::steady_clock::now();
	keys->SetCapture([](std::uint32_t scan, KeyEventType type) {
		if (type != KeyEventType::KEY_DOWN) {
			return true;
		}
		if (IsModifierOrLockScan(scan)) {
			return true;
		}
		if (scan == 0x01) {
			CogUi::SetRebinding(false);
			CogUi::Interop("cancelEditorRebind", "");
			return true;
		}
		// Ignore leftover/autorepeat presses from opening the editor (often the same F3).
		constexpr auto kArmGrace = std::chrono::milliseconds(450);
		if (std::chrono::steady_clock::now() - g_rebindArmedAt < kArmGrace) {
			return true;
		}
		const auto name = CogKeys::NameFromScanCode(scan);
		if (name.empty()) {
			return true;
		}
		CogRegistry::Get().SetEditorKey(name);
		CogUi::SetRebinding(false);
		CogUi::Interop("setEditorKeyName", name);
		CogRegistry::Get().PushToUi();
		return true;
	});
}

void CogUi::SetHideKeyRebinding(bool on)
{
	g_hideKeyRebinding = on;
	if (on) {
		g_rebinding = false;
	}
	auto* keys = KeyHandler::GetSingleton();
	if (!on) {
		if (!g_rebinding) {
			g_rebindArmedAt = {};
			keys->SetCapture(nullptr);
		}
		return;
	}
	g_rebindArmedAt = std::chrono::steady_clock::now();
	keys->SetCapture([](std::uint32_t scan, KeyEventType type) {
		if (type != KeyEventType::KEY_DOWN) {
			return true;
		}
		if (IsModifierOrLockScan(scan)) {
			return true;
		}
		if (scan == 0x01) {
			CogUi::SetHideKeyRebinding(false);
			CogUi::Interop("cancelHideKeyRebind", "");
			return true;
		}
		constexpr auto kArmGrace = std::chrono::milliseconds(450);
		if (std::chrono::steady_clock::now() - g_rebindArmedAt < kArmGrace) {
			return true;
		}
		const auto name = CogKeys::NameFromScanCode(scan);
		if (name.empty()) {
			return true;
		}
		CogRegistry::Get().SetHideToggleKey(name);
		CogUi::SetHideKeyRebinding(false);
		CogUi::Interop("setHideToggleKeyName", name);
		CogRegistry::Get().PushToUi();
		return true;
	});
}
