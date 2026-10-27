#pragma once

#include "_Core_HudSuppress.h"
#include "_Core_Translations.h"
#include "_Gears_Inventory.h"

#include <chrono>
#include <cstdint>
#include <filesystem>
#include <mutex>
#include <optional>
#include <string>
#include <string_view>
#include <unordered_map>
#include <unordered_set>
#include <vector>

enum class CogVarType : std::uint8_t
{
	Percent,
	Count,
	Timer
};

struct CogSource
{
	std::int32_t receipt = 0;
	std::string sourceMod;
	std::string varName;
	std::string displayName;
	std::string category;
	CogVarType type = CogVarType::Percent;
	double value = 0.0;
	double current = 0.0;
	double maximum = 0.0;
	std::string icon;
	/** Hex (#RRGGBB) or compact JSON stop array; empty = unset. */
	std::string iconColor;
	std::string barColor;
	std::string hideAt;
	std::string hudLinkedElement;
	bool hudHideDuplicate = false;
};

struct CogGroupSettings
{
	std::string displayName;
	bool showLabel = false;
	bool showIcon = true;
	bool showNumber = true;
	bool barTrough = true;
	// hideAt reveal for percent/timer: "" | "alpha" | "up" | "down" | "alphaUp" | "alphaDown"
	std::string fillFromHidden;
	std::string numberFormat = "barPercent";
	bool useGroupColors = false;
	std::string iconColor;
	std::string barColor;
	std::string borderColor;
	std::string neutralIconMode = "white";
	float gearSize = 50.0f;
	float spacing = 25.0f;
	std::string stack = "below";
	/** Per-gear exemptions from useGroupColors; only `true` entries are stored. */
	std::unordered_map<std::string, bool> exemptFromGroupColors;
	/** Ordered membership; empty = no gears on this line. */
	std::vector<std::string> gearIds;
};

struct CogGearAppearance
{
	std::string displayName;
	std::string icon;
	std::string iconColor;
	std::string barColor;
	std::string hideAt;
	std::string hudLinkedElement;
	bool hudHideDuplicate = false;
};

struct CogGear
{
	std::string id;
	std::string sourceMod;
	std::string varName;
	bool locked = false;
	CogGearAppearance defaults;
	CogGearAppearance settings;
};

/** Screen display: AABB top-left (tlc). Groups use x/y/rotation/maxAlpha. */
struct CogDisplay
{
	float x = 0.1f;
	float y = 0.10f;
	float rotation = 0.0f;
	float maxAlpha = 100.0f;
};

/** Gauge/gizmo display box (AABB top-left + size + maxAlpha). */
struct CogBoxDisplay
{
	float x = 0.1f;
	float y = 0.10f;
	float rotation = 0.0f;
	float width = 240.0f;
	float height = 24.0f;
	float maxAlpha = 100.0f;
};

struct CogGroup
{
	std::string id;
	bool locked = false;
	// none | hud | ui — same triad as gizmos (groups default hud; no editor control except Default via General).
	std::string visibility = "hud";
	CogDisplay display;
	CogGroupSettings settings;
};

/** Appearance / options nested under gauge.settings (identity + display stay on CogGauge). */
struct CogGaugeSettings
{
	std::string displayName;
	std::string type = "meter";
	std::string shape = "bar";
	std::string borderColor;
	float borderThickness = 15.0f;
	float troughOpacity = 20.0f;
	std::string endCapMode = "border";
	std::string endCap;
	float endCapOverlap = 0.0f;
	std::string showIcon = "none";
	std::string showLabel = "none";
	std::string showNumber = "none";
	std::string fillDirection = "left";
	std::string iconColorMode = "border";
	std::string labelColorMode = "border";
	std::string numberColorMode = "border";
	bool numberAsPercent = false;
	float fontSize = 0.0f;
	std::string frameShape = "Frames/circle.svg";
	std::string frameFillColor;
	std::string frameBorderColor;
	float frameBorderThickness = 5.0f;
	float insideSize = 65.0f;
	std::string displayMode = "gear";
	bool alwaysVisible = true;
	bool barTrough = false;
	std::string numberFormat = "barPercent";
	std::string pictureIcon;
	std::string pictureDirection = "out";
	float pictureRotation = 0.0f;
	std::string pictureEmpty = "#000000";
	std::string pictureFull = "#ffffff";
	std::string pictureFade = "#c4a35a";
};

struct CogGauge
{
	std::string id;
	bool locked = false;
	// none | hud | ui — same triad as gizmos (gauges default hud; not exposed in the gauge editor).
	std::string visibility = "hud";
	CogBoxDisplay display;
	std::string sourceMod;
	std::string varName;
	CogGaugeSettings settings;
};

struct CogGizmo
{
	std::string id;
	std::string typeId = "cog-clock";
	// none | hud (HUD Visible) | ui (UI Visible / menus too)
	std::string visibility = "hud";
	CogBoxDisplay display{ 0.1f, 0.1f, 0.0f, 275.0f, 40.0f, 100.0f };
	// Owning mod of the gizmo type (empty for builtin types).
	std::string sourceMod;
	// Opaque JSON object of type settings (includes instance displayName + type options).
	std::string settingsJson = "{}";
	// Live payload from UpdateGizmo (not persisted).
	std::string livePayloadJson;
};

// Registered gizmo product (builtin or third-party). Instances reference typeId.
struct CogGizmoType
{
	std::string sourceMod;
	std::string typeId;
	std::string displayName;
	std::string galleryIcon;
	float defaultWidth = 240.0f;
	float defaultHeight = 48.0f;
	// Instance visibility when the key is omitted on disk / at create (none | hud | ui).
	std::string defaultVisibility = "hud";
	// Empty = builtin JS renderer for typeId. Else path under PrismaUI/views/, e.g. "MyMod/compass.js".
	std::string viewScript;
	// JSON array of setting field descriptors for the editor.
	std::string settingsSchemaJson = "[]";
	// Live payload from UpdateGizmo (type-scoped stash; not persisted).
	std::string livePayloadJson;
};

struct CogGeneral
{
	bool showDefaultGroup = true;
	std::string editorKey = "F3";
	/** Optional hotkey to toggle UiHidden. Empty = unbound (no hotkey). */
	std::string hideToggleKey;
	/** When UiHidden is on, also soft-hide Flash HUD menus via _root._alpha. Default on. */
	bool hideIncludesFlash = true;
	std::string fillColor = "#c4a35a";
	std::string borderColor = "#e8d2a0";
	/** Single backup icon tint when gear/group iconColor is unset. */
	std::string iconColor = "#ffffff";
	std::string neutralIconMode = "white";
	std::string gadgetFont = "Roboto";
	/** Editor UI language (BCP 47). Default en-CA. */
	std::string language = "en-CA";
	/** When on, missing catalog strings show a gold en-CA badge in the editor. */
	bool highlightMissingTranslations = false;
	/** When on, language changes rewrite still-stock entity displayName fields. */
	bool updateStockTitlesOnTranslation = false;
	/** Undocumented support toggle: "info" (default) or "debug". Not pushed to the editor UI. */
	std::string logLevel = "info";
};

struct CogSenderInfo
{
	std::string plugin;
	int strikes = 0;
};

inline constexpr const char* kDefaultGroupId = "default";
inline constexpr const char* kCogPluginFile = "COG - Custom Overlay Gadgets.esp";
inline constexpr float kDefaultGearSize = 50.0f;
inline constexpr float kDefaultSpacing = 25.0f;

class CogRegistry
{
public:
	static CogRegistry& Get();

	friend void CogHudSuppress::CollectSuppressions(const CogRegistry& reg, std::vector<CogHudSuppressRow>& out);
	friend void CogInventory::EnsureBuiltinsUnlocked(CogRegistry& reg);
	friend void CogInventory::RefreshCountsUnlocked(CogRegistry& reg);
	friend void CogInventory::RemoveGear(std::string_view varName);
	friend void CogInventory::RegisterFromSaved();
	friend void CogInventory::FinishContainerClosed();

	std::int32_t Register(
		std::string mod,
		std::string name,
		std::string type,
		std::string displayName,
		std::string category,
		std::string icon = {},
		std::string iconColor = {},
		std::string legacyEndColor = {},
		std::string barColor = {},
		std::string hideAt = {},
		std::string hudLinkedElement = {},
		bool hudHideDuplicate = false);
	void UpdatePercent(std::int32_t receipt, float current, float maximum);
	/** Lookup by sourceMod+varName (session key); no-op if missing or not percent. */
	void UpdatePercentByKey(std::string mod, std::string name, float current, float maximum);
	void UpdateCount(std::int32_t receipt, std::int32_t value);
	void UpdateTimer(std::int32_t receipt, float remainingSeconds);
	void Unregister(std::int32_t receipt);
	void BeginRegister(std::string mod, std::string pluginFile = {}, std::string sniffedPlugin = {});
	void EndRegister(std::string mod);

	/** Register/upsert a custom gizmo type; returns a session receipt (0 on failure). */
	std::int32_t RegisterGizmo(
		std::string mod,
		std::string typeId,
		std::string displayName,
		std::string galleryIcon,
		float defaultWidth,
		float defaultHeight,
		std::string viewScript,
		std::string settingsSchemaJson,
		std::string defaultVisibility = "hud");
	/** Push live JSON to all placed instances of the type for this RegisterGizmo receipt. */
	void UpdateGizmoPayload(std::int32_t receipt, std::string payloadJson);
	void RegisterBuiltinGizmoTypes();
	void RegisterBuiltinGizmoTypesUnlocked();
	/** Type default visibility (type record → builtin universal). Unknown typeId → hud. */
	std::string DefaultVisibilityForType(std::string_view typeId) const;
	/** Fill missing instance fields from the registered type (settings schema + root defaults). */
	bool ApplyGizmoTypeDefaultsUnlocked();
	/** Mirror COG_Builtin.psc Register batch from C++ so builtins always exist even if the quest misses COG_Ready. */
	void EnsureBuiltinSources();

	std::string EditorKey() const;
	void SetEditorKey(std::string name);
	std::string HideToggleKey() const;
	void SetHideToggleKey(std::string name);
	bool HideIncludesFlash() const;
	void SetHideIncludesFlash(bool on);

	/** Session-only: treat all COG play HUD as hidden (editor preview still works). */
	bool IsUiHidden() const;
	void SetUiHidden(bool hidden);
	void ToggleUiHidden();

	void LoadConfig();
	void SaveConfig() const;
	bool SetStateFromJson(const std::string& json);

	std::string BuildSnapshotJson();
	/** languages + translation catalogs (separate Interop from entity snapshot). */
	std::string BuildTranslationCatalogsJson();
	/** Lean tick payload: sources + gameTime + shoutMeter + gizmo livePayload (no layout/catalog). */
	std::string BuildLivePatchJson();
	void PushToUi();
	void PushLivePercent(const char* mod, const char* name, float current, float maximum);
	void SyncHudDuplicates();
	void OnLoadingMenuOpened();
	void OnLoadingMenuClosed();
	void MaybeReconcileSenders();
	/**
	 * True while a load is in flight (LoadingMenu open and/or SKSE PreLoadGame).
	 * Hide the overlay and skip live PushToUi / Interop until the load finishes.
	 * Close is idempotent: LoadingMenu close and PostLoadGame both call OnLoadingMenuClosed,
	 * but only the first after a matching open clears presence and fires COG_Ready.
	 */
	bool IsLoading() const;
	/** Next full snapshot includes a fresh icons/fonts disk scan (editor open, DOM-ready, import). */
	void MarkCatalogDirty();
	/** Next PushToUi sends a full applySnapshot (entities + live), not a lean live patch. */
	void MarkLayoutDirty();

	void SetViewReady(bool ready);
	bool HasVisibleFeedShowingNotifications() const;
	bool HasVisibleFeedShowingInventory() const;
	bool HasVisibleFeedDivertingLocationDiscovery() const;
	bool HasVisibleFeedDivertingCurrentLocation() const;
	bool HasVisibleFeedShowingSkills() const;
	bool HasVisibleFeedShowingLevelProgress() const;
	bool AnyVisibleFeedShowsActiveEffects() const;
	bool ShouldSuppressInventoryNotifications() const;
	/** First play-visible cog-feed with showKey true → settings[settingKey], else fallback. */
	[[nodiscard]] std::string FirstVisibleFeedSetting(
		std::string_view showKey,
		std::string_view settingKey,
		std::string_view fallback) const;
	[[nodiscard]] bool FirstVisibleFeedSettingBool(
		std::string_view showKey,
		std::string_view settingKey,
		bool fallback) const;

	/** Record a runtime-imported icon (path relative to assets/imports/icons/). Write-through index. */
	bool RegisterImportedIcon(std::string relPath);
	/** Like RegisterImportedIcon; when requireFile is false, skip the on-disk probe (post-write). */
	bool RegisterImportedIcon(std::string relPath, bool requireFile);
	/**
	 * Copy/convert a Data-relative source into assets/imports/icons/, index it, and return the
	 * imports-relative path (e.g. "MyMod/icon.png"). Empty on failure.
	 */
	std::string ImportIcon(std::string sourceMod, std::string iconName, std::string dataRelPath);
	/** Push imported-icons.json contents to the view (does not include shipped manifest). */
	void PushImportedIconsToUi();

private:
	CogRegistry() = default;

	static CogVarType ParseType(const std::string& type);
	static const char* TypeKey(CogVarType type);
	CogSource* FindByReceipt(std::int32_t receipt);
	void RefreshLiveUnlocked();
	bool PruneModGearsUnlocked(const std::string& mod);
	bool DropGearUnlocked(const std::string& mod, const std::string& name);
	bool DropAllModGearsUnlocked(const std::string& mod);
	bool CullGaugesBoundToSourceUnlocked(const std::string& mod, const std::string& name);
	bool ReconcileGaugeBindingsUnlocked();
	/** Drop this mod's gizmo types not in the session receipt index (EndRegister omit-prune). */
	bool PruneModGizmoTypesUnlocked(const std::string& mod);
	bool DropAllModGizmoTypesUnlocked(const std::string& mod);
	bool CullGizmosOfSourceModUnlocked(const std::string& mod);
	bool CullGizmosOfTypesUnlocked(const std::unordered_set<std::string>& typeIds);
	void BindSenderPluginUnlocked(const std::string& mod, std::string pluginFile);
	void BindSniffedSenderPluginUnlocked(const std::string& mod, std::string sniffedPlugin);
	bool PruneMissingPluginsUnlocked();
	bool ReconcileAbsentSendersUnlocked();

	std::filesystem::path DataRoot() const;
	void EnsureDirs() const;
	/** Migration Code for Transition from v1.01 or earlier to v1.1: gizmos/feed → gizmos/cog-feed. */
	void MigrateLegacyFeedDataDir() const;
	/** Migration Code for Transition from v1.01 or earlier to v1.1: drop pre-cog-* builtin type records. */
	bool MigrateLegacyBuiltinGizmoTypeIdsUnlocked();
	/** Ensure Default Group exists in memory. Returns true if it was newly inserted. */
	bool EnsureDefaultGroup();
	void ReconcileGroupMembership();
	void RememberGearKeysUnlocked();
	void OfferDefaultGearUnlocked(const std::string& mod, const std::string& name);
	void EnsureGearDefinitionUnlocked(const std::string& mod, const std::string& name, const CogGearAppearance& appearance);
	void LoadGeneralFile(bool& repaired);
	void ApplyLogLevelUnlocked() const;
	void LoadTranslationsUnlocked();
	void LoadGroupFiles(bool& repaired);
	void LoadGearFiles(bool& repaired);
	void LoadGaugeFiles(bool& repaired);
	void LoadGizmoTypeFiles(bool& repaired);
	void LoadGizmoFiles(bool& repaired);
	void LoadSeenFile(bool& repaired);
	void LoadSendersFile(bool& repaired);
	void LoadImportedIconsFile(bool& repaired);
	void RemoveEmptyIconsRootIfPoisoned();
	void SaveImportedIconsUnlocked() const;
	void SaveSendersUnlocked() const;
	void SaveGizmoTypesUnlocked() const;
	const CogGizmoType* FindGizmoTypeUnlocked(std::string_view typeId) const;
	bool ApplyStateJson(const std::string& json);
	void SaveConfigUnlocked() const;

	mutable std::mutex _mutex;
	std::int32_t _nextReceipt = 1;
	std::unordered_map<std::int32_t, CogSource> _sources;
	std::unordered_map<std::string, std::int32_t> _index;
	std::vector<std::int32_t> _order;
	CogGeneral _general;
	/** Session only — not written to general.json. */
	bool _uiHidden = false;
	/** Global editor catalogs (translations/*.json). */
	CogTranslations::Catalog _translations;
	/** Per-type catalogs (gizmos/<typeId>/translations/*.json). */
	std::unordered_map<std::string, CogTranslations::Catalog> _gizmoTranslations;
	std::vector<CogGroup> _groups;
	std::vector<CogGear> _gears;
	std::vector<CogGauge> _gauges;
	std::vector<CogGizmo> _gizmos;
	std::vector<CogGizmoType> _gizmoTypes;
	/** Session receipts for RegisterGizmo (shared _nextReceipt space with gears). */
	std::unordered_map<std::int32_t, std::string> _gizmoTypeReceipts;
	std::unordered_map<std::string, std::int32_t> _gizmoTypeReceiptIndex;
	bool _viewReady = false;
	bool _configLoaded = false;
	std::unordered_set<std::string> _modBatchOpen;
	std::unordered_set<std::string> _seenSources;
	std::unordered_map<std::string, CogSenderInfo> _senders;
	/** path (relative to assets/imports/icons) -> section (first path segment). */
	std::unordered_map<std::string, std::string> _importedIcons;
	std::unordered_set<std::string> _presentThisSession;
	bool _catalogDirty = true;
	/** True until a full snapshot is pushed after layout/entity mutation. */
	bool _layoutDirty = true;
	std::optional<std::chrono::steady_clock::time_point> _loadingClosedAt;
	bool _senderReconcileDone = false;
	/** True while Loading Menu is open or SKSE PreLoadGame armed the same gate. */
	bool _loadingMenuOpen = false;
};
