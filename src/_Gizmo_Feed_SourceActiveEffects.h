#pragma once

#include <string>

namespace CogFeed
{
	// Push timed player effects when a Feed shows Active Effects.
	// PolledUiChannel (mutex + Interop outside lock): silence when unused; one-shot "[]"
	// when AE section turns off; skip Interop when JSON unchanged. Meta cache by MGEF FormID
	// under g_effectMetaMutex (see CTD review C10).
	// List walk: POD FormID/duration/elapsed snapshot under SEH, then chrome via LookupByID
	// (CTD review C3) — no ActiveEffect* retained across icon/meta work.
	void PushActiveEffectsToUi();

	void LoadEffectIconRules();

	[[nodiscard]] bool AnyFeedShowsActiveEffects();
}
