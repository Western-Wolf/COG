#pragma once

#include "_API_PrismaUI.h"

#include <functional>
#include <string>
#include <string_view>

namespace CogUi
{
	void SetApi(PRISMA_UI_API::IVPrismaUI1* api, PrismaView view);
	bool HasView();
	void Invoke(const char* script);
	void Unfocus();
	/** Same as Unfocus — closes editor when a gameplay menu (e.g. inventory picker) must take over. */
	void DismissEditorForGameMenu();
	/** After DialogueMenu closes: Focus/Unfocus nudge if the editor was closed under that menu. */
	void ReconcileEditorFocus(std::string_view closingMenu = {});
	bool CanOpenGameplayMenu();
	std::string DescribeGameplayMenuBlock();
	void Interop(const char* functionName, const std::string& argument);
	void SendReadyEvent();
	void RegisterMenuSink();
	void SyncVisibility();
	void BindEditorToggle();
	void SyncEditorKey();
	void SyncHideToggleKey();
	void SetRebinding(bool on);
	void SetHideKeyRebinding(bool on);
	/** Soft-hide / restore Flash HUD menus via _root._alpha. Soft dependency. */
	void ApplyFlashUiHidden(bool hidden);
	/**
	 * Coalesce Flash alpha + Prisma setUiHidden onto the main task queue.
	 * Call after flipping session uiHidden — safe to spam; only the latest state is applied.
	 */
	void ScheduleUiHiddenApply();

	/**
	 * Run fn on the SKSE main task queue (game thread). Use for Prisma JS listeners and
	 * other callbacks that may arrive off-thread before touching player data, GFx, or Interop.
	 * Falls back to inline fn() if the task interface is unavailable.
	 */
	void RunOnMainThread(std::function<void()> fn);
}
