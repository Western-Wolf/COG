#pragma once

#include <string>
#include <string_view>
#include <unordered_set>
#include <vector>

class CogRegistry;

struct CogHudSuppressController
{
	std::string kind;
	std::string id;
	std::string label;
	std::string role;
	bool winning = false;
	/** False = layout would suppress if this controller were shown (e.g. hidden group). */
	bool active = true;
};

struct CogHudSuppressRow
{
	std::string key;
	std::string alias;
	std::string label;
	bool hidden = false;
	std::vector<CogHudSuppressController> controllers;
};

// Soft-hide Scaleform HUD duplicates when COG layout exposes linked gears / gizmos.
// Missing menus/clips are ignored (no hard dependency on third-party meters).
// hud.notifications soft-hides MessagesBlock; hud.currentLocation soft-hides LocationLockBase;
// hud.inventory soft-hides TrueHUD Recent Loot (soft dependency). Location discovery / skills have
// no suppress key — Feed diverts those from QuestUpdateBaseInstance (hud.questUpdates clip).
// Inventory-style notification toast starve is Feed-owned (ShouldSuppressInventoryNotifications).
// hud.activeEffects is a policy alias; soft-hide materializes it to WidgetContainer.* clip
// keys (SkyUI guests), applies on Sync / post-load resolve, skips guest reassert on remount.
//
// Boundary inside this module:
//   Vocabulary + Scaleform  — CanonicalKey / Sync / ReapplyHidden (no Registry types in .cpp body except policy).
//   Policy                 — layout walks, hide-vs-exempt, cache, PrepareSync / SyncHudDuplicates.
namespace CogHudSuppress
{
	// --- Vocabulary / Scaleform (executor) ---

	// Resolve Register HUDLinkedElement tokens to canonical hide keys.
	// Aliases: hud.health / stamina / magicka / ammo / oxygen / casting / charge / leftcharge /
	// compass (CompassShoutMeterHolder) / enemyHealth / stealth / crosshair / activate (rollover
	// cluster) / subtitles / tutorials / questUpdates / notifications (MessagesBlock) /
	// currentLocation (LocationLockBase) / inventory (TrueHUD Recent Loot) / activeEffects.
	// Raw menu names or "Menu|path" clip targets. Retired: hud.locationDiscovery / hud.skills.
	[[nodiscard]] std::string CanonicalKey(std::string_view linked);

	// Best-effort reverse map to a short alias (hud.health) or empty if unknown.
	[[nodiscard]] std::string AliasForKey(std::string_view canonicalKey);

	// Human label for known aliases / feed divert keys; falls back to alias or key.
	[[nodiscard]] std::string LabelForKey(std::string_view canonicalKeyOrAlias);

	// True for Scaleform soft-hide targets (all known aliases after inventory was wired).
	[[nodiscard]] bool IsSoftHideKey(std::string_view canonicalKeyOrAlias);

	// JSON array of {value,label} for the suppressor editor datalist.
	[[nodiscard]] std::string KnownAliasesJson();

	// Apply desired hide set: hide keys present, restore keys we previously hid that are absent.
	void Sync(const std::unordered_set<std::string>& hideKeys);

	// Re-assert hide for concrete Scaleform keys (menus + resident clips). WidgetContainer
	// guests are not re-poked; pending AE resolve after load runs once via guest-need apply.
	void ReapplyHidden();

	// Bind ActionEvent / activate / jump / shout / draw-sheathe remount sinks.
	// Sprint / submerge rising-edge remount; every player Update re-asserts menus and
	// resident clips. Whole-menu soft-hides also hook GFx SetVisible / AdvanceMovie
	// so AlwaysOpen widgets cannot flash visible after player Update.
	void BindRemountWatchers();

	// Drop cached GFx movie→menu entries when a menu closes (avoids pointer reuse).
	void OnMenuClosed(std::string_view menuName);

	// Per-frame: sprint rising-edge + soft-hide reassert. Call from player Update.
	void OnPlayerUpdate();

	// --- Policy (layout → hide set; caller holds CogRegistry mutex where noted) ---

	// Walk groups/gauges/gizmos → controller rows (exempt beats hide).
	// Hidden groups/gauges still emit inactive controllers for the Suppressions UI.
	// Friend of CogRegistry — reads private layout under caller's lock.
	void CollectSuppressions(const CogRegistry& reg, std::vector<CogHudSuppressRow>& out);

	[[nodiscard]] std::string SuppressionsJson(const CogRegistry& reg);

	void CollectHideKeys(const CogRegistry& reg, std::unordered_set<std::string>& out);

	// Rebuilds the policy suppressed-key cache from layout (call under Registry lock).
	void RefreshSuppressedCache(const CogRegistry& reg);

	// Query the last RefreshSuppressedCache result (thread-safe).
	[[nodiscard]] bool IsKeySuppressed(std::string_view aliasOrKey);

	// Under Registry lock: refresh cache, compute soft-hide keys, detect unchanged set.
	// After releasing the lock, call ApplyPreparedSync().
	void PrepareSync(const CogRegistry& reg, bool& outUnchanged);

	// Outside Registry lock: Sync or ReapplyHidden based on PrepareSync.
	void ApplyPreparedSync(bool unchanged);
}
