#pragma once

#include <mutex>
#include <string>

namespace CogFeed
{
	void InstallHudHooks();

	[[nodiscard]] bool HasActiveNotifications();
	[[nodiscard]] bool HasActiveInventory();

	void EnqueueNotification(std::string text, std::string color = {}, std::string icon = {});
	void EnqueueLocation(std::string text, std::string kind);

	/** Strip all Scaleform markup (font/b/i/u/unknown) for plain-text matching (e.g. inventory toasts). */
	[[nodiscard]] std::string StripHudMarkupForMatch(std::string text);
	/** Immediate drain (Papyrus Notify); tick path uses PushPendingFeedEventsToUi. */
	void FlushNotificationsToUi();

	/** Drain pending notification + location + inventory into one Interop (call after effects). */
	void PushPendingFeedEventsToUi();

	/**
	 * Shared policy for polled Feed → UI channels (Active Effects, level progress, …):
	 * 1. No listener → no Interop (after optional one-shot clear).
	 * 2. Listener just went away → send clearPayload once, then silence.
	 * 3. Listener present → Interop only when payload differs from last send.
	 * Event channels (notifications / inventory / location / skills toasts) stay
	 * enqueue-gated + drain-only-when-pending; they do not use this gate.
	 *
	 * Gate state is mutex-protected (CTD review C10). Interop runs outside the lock so a
	 * Prisma callback cannot deadlock by re-entering BeginTick / SendIfChanged.
	 */
	struct PolledUiChannel {
		const char* interopName{ "" };
		const char* clearPayload{ "" };  // e.g. "[]" or "null"; empty = silence only (no clear)
		bool wasWanted{ false };
		std::string lastPayload{};
		mutable std::mutex mutex{};

		void Reset();

		/** Returns true if the caller should build and SendIfChanged a live payload. */
		[[nodiscard]] bool BeginTick(bool wanted);

		/** Interop when payload != lastPayload (updates lastPayload). */
		void SendIfChanged(std::string payload);
	};
}
