#include "pch.h"
#include "_Core_HudSuppress.h"
#include "_Core_Json.h"
#include "_Core_Registry.h"
#include "_Core_Registry_Json.h"

#include <algorithm>
#include <cctype>
#include <chrono>
#include <mutex>
#include <sstream>
#include <string>
#include <unordered_map>
#include <unordered_set>
#include <vector>

namespace
{
	std::recursive_mutex g_mutex;
	// Last desired hide set from Sync — ReapplyHidden must use this, not g_hidden,
	// so a failed restore cannot keep forcing soft-hide after Never Hide / gear removal.
	std::unordered_set<std::string> g_desiredHidden;
	std::unordered_set<std::string> g_hidden;
	std::unordered_set<std::string> g_pendingShow;

	thread_local bool t_cogSettingVisible = false;
	std::unordered_map<const void*, std::string> g_movieToMenu;

	[[nodiscard]] bool IsDesiredMenuHide(std::string_view menuName)
	{
		std::lock_guard lock(g_mutex);
		return g_desiredHidden.contains(std::string{ menuName });
	}

	void RegisterMovie(const RE::GFxMovieView* movie, std::string_view menuName)
	{
		if (!movie || menuName.empty()) {
			return;
		}
		// Same recursive mutex as Sync/ReapplyHidden — hooks may re-enter via SetVisible.
		std::lock_guard lock(g_mutex);
		g_movieToMenu[movie] = std::string{ menuName };
	}

	void UnregisterMoviesForMenu(std::string_view menuName)
	{
		if (menuName.empty()) {
			return;
		}
		std::lock_guard lock(g_mutex);
		for (auto it = g_movieToMenu.begin(); it != g_movieToMenu.end();) {
			if (it->second == menuName) {
				it = g_movieToMenu.erase(it);
			} else {
				++it;
			}
		}
	}

	[[nodiscard]] std::string MenuNameForMovie(const RE::GFxMovie* movie)
	{
		if (!movie) {
			return {};
		}
		// Cover map + g_desiredHidden together so main-thread sync and UI-thread hooks
		// cannot rehash/erase g_movieToMenu concurrently (CTD C2).
		std::lock_guard lock(g_mutex);
		if (const auto it = g_movieToMenu.find(movie); it != g_movieToMenu.end()) {
			const auto cached = it->second;
			auto* ui = RE::UI::GetSingleton();
			if (ui) {
				if (const auto view = ui->GetMovieView(cached); view && view.get() == movie) {
					return cached;
				}
			}
			// Stale pointer reuse — drop and resolve live.
			g_movieToMenu.erase(it);
		}
		auto* ui = RE::UI::GetSingleton();
		if (!ui) {
			return {};
		}
		std::vector<std::string> desiredMenus;
		for (const auto& key : g_desiredHidden) {
			if (key.find('|') == std::string::npos) {
				desiredMenus.push_back(key);
			}
		}
		for (const auto& menu : desiredMenus) {
			if (const auto view = ui->GetMovieView(menu); view && view.get() == movie) {
				g_movieToMenu[movie] = menu;
				return menu;
			}
		}
		return {};
	}

	struct CogSetVisibleGuard
	{
		CogSetVisibleGuard() { t_cogSettingVisible = true; }
		~CogSetVisibleGuard() { t_cogSettingVisible = false; }
	};

	struct GFxSetVisibleHook
	{
		static void thunk(RE::GFxMovie* self, bool visible)
		{
			const bool ours = t_cogSettingVisible;
			func(self, visible);

			// Soft-hide wins: AlwaysOpen widgets (e.g. oxygen) SetVisible(true) from
			// AdvanceMovie after player Update — force hide before the frame presents.
			if (!ours && visible && self) {
				const auto menu = MenuNameForMovie(self);
				if (!menu.empty() && IsDesiredMenuHide(menu)) {
					CogSetVisibleGuard guard;
					func(self, false);
				}
			}
		}
		static inline REL::Relocation<void(RE::GFxMovie*, bool)> func;
	};

	struct IMenuAdvanceMovieHook
	{
		static void thunk(RE::IMenu* self, float interval, std::uint32_t currentTime)
		{
			if (!self) {
				return;
			}
			const auto vtable = *reinterpret_cast<std::uintptr_t*>(self);
			const auto it = origByVtbl.find(vtable);
			if (it == origByVtbl.end()) {
				return;
			}

			std::string menu;
			if (self->uiMovie) {
				menu = MenuNameForMovie(self->uiMovie.get());
			}

			using Fn = void (*)(RE::IMenu*, float, std::uint32_t);
			reinterpret_cast<Fn>(it->second)(self, interval, currentTime);

			// If Advance left a soft-hidden movie visible (path other than SetVisible), pin it.
			if (self->uiMovie && !menu.empty() && IsDesiredMenuHide(menu) && self->uiMovie->GetVisible()) {
				CogSetVisibleGuard guard;
				self->uiMovie->SetVisible(false);
			}
		}
		static inline std::unordered_map<std::uintptr_t, std::uintptr_t> origByVtbl;
	};

	void EnsureMovieHooks(RE::GFxMovieView* movie, std::string_view menuName)
	{
		if (!movie) {
			return;
		}
		RegisterMovie(movie, menuName);

		static bool s_setVisibleHooked = false;
		if (!s_setVisibleHooked) {
			const auto vtableAddr = *reinterpret_cast<std::uintptr_t*>(movie);
			REL::Relocation<std::uintptr_t> vtbl{ vtableAddr };
			// GFxMovie::SetVisible == vfunc 0x08 (see GFxMovieRoot).
			GFxSetVisibleHook::func = vtbl.write_vfunc(0x08, GFxSetVisibleHook::thunk);
			s_setVisibleHooked = true;
			logger::info("HudSuppress: hooked GFxMovie::SetVisible");
		}

		auto* ui = RE::UI::GetSingleton();
		if (!ui || menuName.empty()) {
			return;
		}
		if (const auto menu = ui->GetMenu(menuName)) {
			const auto vtableAddr = *reinterpret_cast<std::uintptr_t*>(menu.get());
			if (IMenuAdvanceMovieHook::origByVtbl.contains(vtableAddr)) {
				return;
			}
			REL::Relocation<std::uintptr_t> vtbl{ vtableAddr };
			// IMenu::AdvanceMovie == vfunc 0x05.
			const auto orig = vtbl.write_vfunc(0x05, IMenuAdvanceMovieHook::thunk);
			IMenuAdvanceMovieHook::origByVtbl.emplace(vtableAddr, orig);
			logger::info("HudSuppress: hooked IMenu::AdvanceMovie ({})", menuName);
		}
	}

	std::string Lower(std::string s)
	{
		std::transform(s.begin(), s.end(), s.begin(), [](unsigned char c) {
			return static_cast<char>(std::tolower(c));
		});
		return s;
	}

	std::string Trim(std::string raw)
	{
		while (!raw.empty() && std::isspace(static_cast<unsigned char>(raw.front()))) {
			raw.erase(raw.begin());
		}
		while (!raw.empty() && std::isspace(static_cast<unsigned char>(raw.back()))) {
			raw.pop_back();
		}
		return raw;
	}

	struct Target
	{
		enum class Kind : std::uint8_t
		{
			Menu,
			Clip
		};

		Kind kind = Kind::Menu;
		std::string menu;
		// For Clip: Scaleform path under the movie (no trailing ._visible).
		std::string path;
	};

	bool ParseKey(const std::string& key, Target& out)
	{
		if (key.empty()) {
			return false;
		}
		const auto pipe = key.find('|');
		if (pipe != std::string::npos) {
			out.kind = Target::Kind::Clip;
			out.menu = key.substr(0, pipe);
			out.path = key.substr(pipe + 1);
			return !out.menu.empty() && !out.path.empty();
		}
		out.kind = Target::Kind::Menu;
		out.menu = key;
		out.path.clear();
		return !out.menu.empty();
	}

	/** One alias may map to several Scaleform clips (activate/rollover cluster). */
	std::vector<std::string> ExpandHudKeys(std::string_view linked)
	{
		auto raw = Trim(std::string{ linked });
		if (raw.empty()) {
			return {};
		}
		const auto lower = Lower(raw);
		if (lower == "hud.activate" || lower == "activate" || lower == "hud.rollover" ||
			lower == "rollover") {
			const std::string prefix = std::string(RE::HUDMenu::MENU_NAME) + "|HUDMovieBaseInstance.";
			return {
				prefix + "RolloverNameInstance",
				prefix + "RolloverInfoInstance",
				prefix + "ActivateButton_tf",
				prefix + "GrayBarInstance",
			};
		}
		auto key = CogHudSuppress::CanonicalKey(raw);
		if (key.empty()) {
			return {};
		}
		return { std::move(key) };
	}

	bool SetClipVisible(RE::GFxMovieView* movie, const std::string& path, bool visible)
	{
		if (!movie || path.empty()) {
			return false;
		}
		RE::GFxValue value;
		value.SetBoolean(visible);
		const auto varPath = path + "._visible";
		return movie->SetVariable(varPath.c_str(), value);
	}

	// Policy alias for Feed hud.activeEffects (CanonicalKey only). Soft-hide executor
	// materializes this to HUD Menu|WidgetContainer.N[.widget] before apply.
	constexpr const char* kSkyUiActiveEffectsPath = "__cog_skyui_activeeffects__";

	bool ApplyTarget(const Target& target, bool visible);

	[[nodiscard]] std::string SkyUiAePolicyKey()
	{
		return std::string(RE::HUDMenu::MENU_NAME) + "|" + kSkyUiActiveEffectsPath;
	}

	[[nodiscard]] bool IsSkyUiAePolicyKey(std::string_view key)
	{
		return key == SkyUiAePolicyKey();
	}

	// Discover cache for materializing AE → WidgetContainer paths (not stored as hide keys).
	std::vector<std::string> g_skyUiAeClipPaths;
	std::chrono::steady_clock::time_point g_skyUiAeNextDiscover{};
	// Last Sync policy asked for AE hide (alias/sentinel). Survives load invalidate.
	bool g_policyWantsSkyUiAe = false;
	// Guests not yet resolved/hidden — retry on ReapplyHidden only (not every remount poke).
	bool g_guestClipsNeedApply = false;

	// SkyUI WidgetLoader guests under _root.WidgetContainer.<id>.
	[[nodiscard]] bool IsGuestClipPath(std::string_view path)
	{
		if (path.empty()) {
			return false;
		}
		return Lower(std::string{ path }).starts_with("widgetcontainer.");
	}

	[[nodiscard]] bool IsGuestClip(const Target& target)
	{
		return target.kind == Target::Kind::Clip && IsGuestClipPath(target.path);
	}

	[[nodiscard]] bool IsGuestHideKey(std::string_view key)
	{
		Target target;
		return ParseKey(std::string{ key }, target) && IsGuestClip(target);
	}

	bool IsSkyUiActiveEffectsWidget(RE::GFxMovieView* movie, const std::string& widgetPath)
	{
		if (!movie) {
			return false;
		}
		RE::GFxValue widget;
		if (!movie->GetVariable(&widget, widgetPath.c_str()) || widget.IsUndefined() || widget.IsNull()) {
			return false;
		}
		return widget.HasMember("setMinTimeLeft") || widget.HasMember("setGroupEffectCount");
	}

	bool DiscoverSkyUiActiveEffectsPaths(RE::GFxMovieView* movie)
	{
		g_skyUiAeClipPaths.clear();
		if (!movie) {
			return false;
		}
		for (int i = 0; i < 128; ++i) {
			const auto holder = "WidgetContainer." + std::to_string(i);
			const auto widget = holder + ".widget";
			if (!IsSkyUiActiveEffectsWidget(movie, widget)) {
				continue;
			}
			g_skyUiAeClipPaths.push_back(widget);
			g_skyUiAeClipPaths.push_back(holder);
		}
		return !g_skyUiAeClipPaths.empty();
	}

	bool EnsureSkyUiActiveEffectsPaths(RE::GFxMovieView* movie)
	{
		if (!g_skyUiAeClipPaths.empty()) {
			return true;
		}
		const auto now = std::chrono::steady_clock::now();
		if (now < g_skyUiAeNextDiscover) {
			return false;
		}
		g_skyUiAeNextDiscover = now + std::chrono::seconds(1);
		return DiscoverSkyUiActiveEffectsPaths(movie);
	}

	void AppendResolvedSkyUiAeKeys(std::unordered_set<std::string>& out)
	{
		const auto prefix = std::string(RE::HUDMenu::MENU_NAME) + "|";
		for (const auto& path : g_skyUiAeClipPaths) {
			out.insert(prefix + path);
		}
	}

	/** Policy hide keys → concrete Scaleform keys (AE sentinel → WidgetContainer.*). */
	std::unordered_set<std::string> MaterializeHideKeys(const std::unordered_set<std::string>& policyKeys)
	{
		std::unordered_set<std::string> out;
		g_policyWantsSkyUiAe = false;
		for (const auto& key : policyKeys) {
			if (IsSkyUiAePolicyKey(key)) {
				g_policyWantsSkyUiAe = true;
				continue;
			}
			out.insert(key);
		}
		if (!g_policyWantsSkyUiAe) {
			g_guestClipsNeedApply = false;
			g_skyUiAeClipPaths.clear();
			return out;
		}
		auto* ui = RE::UI::GetSingleton();
		const auto movie = ui ? ui->GetMovieView(RE::HUDMenu::MENU_NAME) : RE::GPtr<RE::GFxMovieView>{};
		if (movie && EnsureSkyUiActiveEffectsPaths(movie.get())) {
			AppendResolvedSkyUiAeKeys(out);
			g_guestClipsNeedApply = false;
		} else {
			// SkyUI not mounted yet — retry on ReapplyHidden (throttled discover).
			g_guestClipsNeedApply = true;
		}
		return out;
	}

	void EraseGuestKeys(std::unordered_set<std::string>& keys)
	{
		for (auto it = keys.begin(); it != keys.end();) {
			if (IsGuestHideKey(*it)) {
				it = keys.erase(it);
			} else {
				++it;
			}
		}
	}

	void LogDesiredHiddenUnlocked()
	{
		std::vector<std::string> keys(g_desiredHidden.begin(), g_desiredHidden.end());
		std::sort(keys.begin(), keys.end());
		std::ostringstream o;
		for (std::size_t i = 0; i < keys.size(); ++i) {
			if (i > 0) {
				o << ", ";
			}
			o << keys[i];
		}
		logger::info("HudSuppress: desired=[{}] (n={})", o.str(), keys.size());
	}

	void InvalidateSkyUiActiveEffectsCache()
	{
		const auto before = g_desiredHidden;
		EraseGuestKeys(g_desiredHidden);
		EraseGuestKeys(g_hidden);
		EraseGuestKeys(g_pendingShow);
		g_skyUiAeClipPaths.clear();
		g_skyUiAeNextDiscover = {};
		g_guestClipsNeedApply = g_policyWantsSkyUiAe;
		if (before != g_desiredHidden) {
			LogDesiredHiddenUnlocked();
		}
	}

	/** Late mount / post-load: resolve AE into g_desiredHidden and hide once. */
	void ResolveAndHideSkyUiAeGuests()
	{
		if (!g_policyWantsSkyUiAe) {
			g_guestClipsNeedApply = false;
			return;
		}
		auto* ui = RE::UI::GetSingleton();
		const auto movie = ui ? ui->GetMovieView(RE::HUDMenu::MENU_NAME) : RE::GPtr<RE::GFxMovieView>{};
		if (!movie || !EnsureSkyUiActiveEffectsPaths(movie.get())) {
			g_guestClipsNeedApply = true;
			return;
		}
		const auto before = g_desiredHidden;
		const auto prefix = std::string(RE::HUDMenu::MENU_NAME) + "|";
		for (const auto& path : g_skyUiAeClipPaths) {
			const auto key = prefix + path;
			g_desiredHidden.insert(key);
			Target target;
			if (!ParseKey(key, target)) {
				continue;
			}
			if (ApplyTarget(target, false)) {
				g_hidden.insert(key);
			}
		}
		g_guestClipsNeedApply = false;
		if (before != g_desiredHidden) {
			LogDesiredHiddenUnlocked();
		}
	}

	bool SetMenuVisible(std::string_view menuName, bool visible)
	{
		auto* ui = RE::UI::GetSingleton();
		if (!ui) {
			return false;
		}
		const auto movie = ui->GetMovieView(menuName);
		if (!movie) {
			return false;
		}
		EnsureMovieHooks(movie.get(), menuName);
		CogSetVisibleGuard guard;
		movie->SetVisible(visible);
		return true;
	}

	bool ApplyTarget(const Target& target, bool visible)
	{
		auto* ui = RE::UI::GetSingleton();
		if (!ui) {
			return false;
		}
		if (target.kind == Target::Kind::Menu) {
			return SetMenuVisible(target.menu, visible);
		}
		const auto movie = ui->GetMovieView(target.menu);
		if (!movie) {
			return false;
		}
		// AlwaysOpen menus can remount; keep SetVisible hooks armed.
		EnsureMovieHooks(movie.get(), target.menu);
		return SetClipVisible(movie.get(), target.path, visible);
	}
}

std::string CogHudSuppress::CanonicalKey(std::string_view linked)
{
	auto raw = Trim(std::string{ linked });
	if (raw.empty()) {
		return {};
	}

	const auto lower = Lower(raw);
	if (lower == "hud.health" || lower == "health") {
		return std::string(RE::HUDMenu::MENU_NAME) + "|HUDMovieBaseInstance.Health";
	}
	if (lower == "hud.stamina" || lower == "stamina") {
		return std::string(RE::HUDMenu::MENU_NAME) + "|HUDMovieBaseInstance.Stamina";
	}
	if (lower == "hud.magicka" || lower == "magicka" || lower == "hud.magica") {
		return std::string(RE::HUDMenu::MENU_NAME) + "|HUDMovieBaseInstance.Magica";
	}
	if (lower == "hud.ammo" || lower == "hud.arrows" || lower == "ammo" || lower == "arrowinfo" || lower == "arrowinfoinstance") {
		return std::string(RE::HUDMenu::MENU_NAME) + "|HUDMovieBaseInstance.ArrowInfoInstance";
	}
	if (lower == "hud.oxygen" || lower == "oxygen" || lower == "oxygenmeter2") {
		return "oxygenMeter2";
	}
	if (lower == "hud.casting" || lower == "casting" || lower == "castingbar") {
		return "CastingBar";
	}
	if (lower == "hud.charge" || lower == "hud.weaponcharge" || lower == "hud.rightcharge" ||
		lower == "rightchargemeteranim") {
		return std::string(RE::HUDMenu::MENU_NAME) + "|HUDMovieBaseInstance.RightChargeMeterAnim";
	}
	if (lower == "hud.leftcharge" || lower == "hud.secondaryweaponcharge" ||
		lower == "leftchargemeteranim") {
		return std::string(RE::HUDMenu::MENU_NAME) + "|HUDMovieBaseInstance.LeftChargeMeterAnim";
	}
	if (lower == "hud.activeeffects" || lower == "hud.activeeffect" || lower == "activeeffects") {
		return std::string(RE::HUDMenu::MENU_NAME) + "|" + kSkyUiActiveEffectsPath;
	}
	if (lower == "hud.compass" || lower == "compass" || lower == "compassshoutmeterholder") {
		return std::string(RE::HUDMenu::MENU_NAME) + "|HUDMovieBaseInstance.CompassShoutMeterHolder";
	}
	if (lower == "hud.enemyhealth" || lower == "enemyhealth" || lower == "enemyhealth_mc") {
		return std::string(RE::HUDMenu::MENU_NAME) + "|HUDMovieBaseInstance.EnemyHealth_mc";
	}
	if (lower == "hud.stealth" || lower == "stealth" || lower == "stealthmeter" ||
		lower == "stealthmeterinstance") {
		return std::string(RE::HUDMenu::MENU_NAME) + "|HUDMovieBaseInstance.StealthMeterInstance";
	}
	if (lower == "hud.crosshair" || lower == "crosshair") {
		return std::string(RE::HUDMenu::MENU_NAME) + "|HUDMovieBaseInstance.Crosshair";
	}
	// Activate / rollover cluster — CanonicalKey is the name clip; ExpandHudKeys adds siblings.
	if (lower == "hud.activate" || lower == "activate" || lower == "hud.rollover" || lower == "rollover") {
		return std::string(RE::HUDMenu::MENU_NAME) + "|HUDMovieBaseInstance.RolloverNameInstance";
	}
	if (lower == "hud.subtitles" || lower == "subtitles" || lower == "subtitletextholder") {
		return std::string(RE::HUDMenu::MENU_NAME) + "|HUDMovieBaseInstance.SubtitleTextHolder";
	}
	if (lower == "hud.tutorials" || lower == "tutorials" || lower == "tutoriallockinstance") {
		return std::string(RE::HUDMenu::MENU_NAME) + "|HUDMovieBaseInstance.TutorialLockInstance";
	}
	if (lower == "hud.questupdates" || lower == "questupdates" || lower == "questupdatebaseinstance") {
		return std::string(RE::HUDMenu::MENU_NAME) + "|HUDMovieBaseInstance.QuestUpdateBaseInstance";
	}
	// Notifications — soft-hide MessagesBlock; Feed Notifications section still diverts via IsKeySuppressed.
	if (lower == "hud.notifications" || lower == "notifications" || lower == "messagesblock") {
		return std::string(RE::HUDMenu::MENU_NAME) + "|HUDMovieBaseInstance.MessagesBlock";
	}
	// Current location name — soft-hide LocationLockBase; Feed Current Location still diverts via IsKeySuppressed.
	if (lower == "hud.currentlocation" || lower == "currentlocation" || lower == "locationlockbase") {
		return std::string(RE::HUDMenu::MENU_NAME) + "|HUDMovieBaseInstance.LocationLockBase";
	}
	// Retired suppress keys — Feed-owned divert only (QuestUpdateBaseInstance / hud.questUpdates clip).
	if (lower == "hud.locationdiscovery" || lower == "locationdiscovery" || lower == "hud.location" ||
		lower == "hud.skills" || lower == "skills") {
		return {};
	}
	// hud.inventory → TrueHUD Recent Loot clip (soft dependency).
	if (lower == "hud.inventory" || lower == "inventory" || lower == "truehud.recentloot" ||
		lower == "recentloot" || lower == "truehud_recentlootwidget") {
		return "TrueHUD|TrueHUD.TrueHUD_PartialVisibilityWidgets.TrueHUD_RecentLootWidget";
	}

	// Explicit "Menu|path" (path may include HUDMovieBaseInstance.…).
	if (raw.find('|') != std::string::npos) {
		return raw;
	}

	// Clip path shorthand for vanilla HUD Menu.
	if (lower.starts_with("hudmoviebaseinstance.") || lower.starts_with("_root.hudmoviebaseinstance.")) {
		auto path = raw;
		if (lower.starts_with("_root.")) {
			path = raw.substr(6);
		}
		return std::string(RE::HUDMenu::MENU_NAME) + "|" + path;
	}

	// Otherwise treat as a whole-menu name (modded widgets).
	return raw;
}

std::string CogHudSuppress::AliasForKey(std::string_view canonicalKey)
{
	const auto key = Trim(std::string{ canonicalKey });
	if (key.empty()) {
		return {};
	}
	static const std::pair<const char*, const char*> kReverse[] = {
		{ "hud.health", nullptr },
		{ "hud.stamina", nullptr },
		{ "hud.magicka", nullptr },
		{ "hud.ammo", nullptr },
		{ "hud.oxygen", nullptr },
		{ "hud.casting", nullptr },
		{ "hud.charge", nullptr },
		{ "hud.leftcharge", nullptr },
		{ "hud.activeEffects", nullptr },
		{ "hud.compass", nullptr },
		{ "hud.enemyHealth", nullptr },
		{ "hud.stealth", nullptr },
		{ "hud.crosshair", nullptr },
		{ "hud.activate", nullptr },
		{ "hud.subtitles", nullptr },
		{ "hud.tutorials", nullptr },
		{ "hud.questUpdates", nullptr },
		{ "hud.notifications", nullptr },
		{ "hud.currentLocation", nullptr },
		{ "hud.inventory", nullptr },
	};
	for (const auto& entry : kReverse) {
		if (CanonicalKey(entry.first) == key) {
			return entry.first;
		}
	}
	return {};
}

std::string CogHudSuppress::LabelForKey(std::string_view canonicalKeyOrAlias)
{
	auto raw = Trim(std::string{ canonicalKeyOrAlias });
	if (raw.empty()) {
		return {};
	}
	auto alias = AliasForKey(raw);
	if (alias.empty()) {
		const auto lower = Lower(raw);
		if (lower.starts_with("hud.")) {
			alias = raw;
		} else {
			alias = AliasForKey(CanonicalKey(raw));
			if (alias.empty()) {
				alias = raw;
			}
		}
	}
	const auto lower = Lower(alias);
	if (lower == "hud.health") {
		return "Health bar";
	}
	if (lower == "hud.stamina") {
		return "Stamina bar";
	}
	if (lower == "hud.magicka") {
		return "Magicka bar";
	}
	if (lower == "hud.ammo") {
		return "Ammo / arrows";
	}
	if (lower == "hud.oxygen") {
		return "Oxygen Meter 2";
	}
	if (lower == "hud.casting") {
		return "Casting Bar";
	}
	if (lower == "hud.charge") {
		return "Right / two-hand charge";
	}
	if (lower == "hud.leftcharge") {
		return "Left-hand charge";
	}
	if (lower == "hud.notifications") {
		return "Notifications (MessagesBlock)";
	}
	if (lower == "hud.inventory") {
		return "Inventory (TrueHUD Recent Loot)";
	}
	if (lower == "hud.currentlocation") {
		return "Current location (LocationLockBase)";
	}
	if (lower == "hud.activeeffects") {
		return "SkyUI Active Effects";
	}
	if (lower == "hud.compass") {
		return "Compass / shout meter";
	}
	if (lower == "hud.enemyhealth") {
		return "Enemy health";
	}
	if (lower == "hud.stealth") {
		return "Stealth eye";
	}
	if (lower == "hud.crosshair") {
		return "Crosshair";
	}
	if (lower == "hud.activate" || lower == "hud.rollover") {
		return "Activate / rollover prompt";
	}
	if (lower == "hud.subtitles") {
		return "Subtitles";
	}
	if (lower == "hud.tutorials") {
		return "Tutorial hints";
	}
	if (lower == "hud.questupdates") {
		return "Quest updates";
	}
	return alias;
}

bool CogHudSuppress::IsSoftHideKey(std::string_view canonicalKeyOrAlias)
{
	// All suppress keys with a CanonicalKey soft-hide. Location discovery / skills have no
	// suppress key (Feed divert only). Inventory toast starve is Feed-owned separately.
	return !Trim(std::string{ canonicalKeyOrAlias }).empty();
}

std::string CogHudSuppress::KnownAliasesJson()
{
	static constexpr const char* kAliases[][2] = {
		{ "hud.health", "Health bar" },
		{ "hud.stamina", "Stamina bar" },
		{ "hud.magicka", "Magicka bar" },
		{ "hud.ammo", "Ammo / arrows" },
		{ "hud.oxygen", "Oxygen Meter 2" },
		{ "hud.casting", "Casting Bar (whole menu)" },
		{ "hud.charge", "Right / two-hand charge" },
		{ "hud.leftcharge", "Left-hand charge" },
		{ "hud.compass", "Compass / shout meter" },
		{ "hud.enemyHealth", "Enemy health" },
		{ "hud.stealth", "Stealth eye" },
		{ "hud.crosshair", "Crosshair" },
		{ "hud.activate", "Activate / rollover prompt" },
		{ "hud.subtitles", "Subtitles" },
		{ "hud.tutorials", "Tutorial hints" },
		{ "hud.questUpdates", "Quest updates" },
		{ "hud.notifications", "Notifications (MessagesBlock)" },
		{ "hud.inventory", "Inventory (TrueHUD Recent Loot)" },
		{ "hud.currentLocation", "Current location (LocationLockBase)" },
		{ "hud.activeEffects", "SkyUI Active Effects" },
	};
	std::string out = "[";
	bool first = true;
	for (const auto& entry : kAliases) {
		if (!first) {
			out += ',';
		}
		first = false;
		const auto key = CanonicalKey(entry[0]);
		out += "{\"value\":\"";
		out += entry[0];
		out += "\",\"label\":\"";
		out += entry[1];
		out += "\",\"key\":\"";
		out += key;
		out += "\"}";
	}
	out += ']';
	return out;
}

void CogHudSuppress::Sync(const std::unordered_set<std::string>& hideKeys)
{
	std::lock_guard lock(g_mutex);

	// Policy keys (may include AE sentinel) → concrete Scaleform keys (WidgetContainer.*).
	const auto concrete = MaterializeHideKeys(hideKeys);

	std::unordered_set<std::string> toShow;
	for (const auto& key : g_hidden) {
		if (!concrete.contains(key)) {
			toShow.insert(key);
		}
	}
	for (auto it = g_pendingShow.begin(); it != g_pendingShow.end();) {
		if (concrete.contains(*it)) {
			it = g_pendingShow.erase(it);
		} else {
			toShow.insert(*it);
			++it;
		}
	}

	const bool desiredChanged = (concrete != g_desiredHidden);
	g_desiredHidden = concrete;

	bool changed = false;
	for (const auto& key : toShow) {
		Target target;
		if (!ParseKey(key, target)) {
			g_hidden.erase(key);
			g_pendingShow.erase(key);
			changed = true;
			continue;
		}
		// Drop from g_hidden immediately so ReapplyHidden cannot keep forcing hide
		// after Never Hide / gear removal — even if show fails this tick.
		if (g_hidden.erase(key)) {
			changed = true;
		}
		if (ApplyTarget(target, true)) {
			if (g_pendingShow.erase(key)) {
				changed = true;
			}
		} else if (g_pendingShow.insert(key).second) {
			changed = true;
		}
	}

	for (const auto& key : concrete) {
		Target target;
		if (!ParseKey(key, target)) {
			continue;
		}
		g_pendingShow.erase(key);
		if (ApplyTarget(target, false)) {
			if (g_hidden.insert(key).second) {
				changed = true;
			}
		}
	}

	if (desiredChanged) {
		LogDesiredHiddenUnlocked();
	}
	if (changed) {
		logger::info(
			"HudSuppress: {} HUD target(s) currently hidden ({} pending show)",
			g_hidden.size(),
			g_pendingShow.size());
	}
}

void CogHudSuppress::ReapplyHidden()
{
	std::lock_guard lock(g_mutex);
	// Late SkyUI mount / post-load: materialize AE sentinel → WidgetContainer keys once.
	if (g_guestClipsNeedApply) {
		ResolveAndHideSkyUiAeGuests();
	}
	if (g_desiredHidden.empty()) {
		return;
	}
	// Re-assert menus + resident clips. Guest WidgetContainer.* skipped once applied.
	for (const auto& key : g_desiredHidden) {
		Target target;
		if (!ParseKey(key, target)) {
			continue;
		}
		if (IsGuestClip(target)) {
			continue;
		}
		if (ApplyTarget(target, false)) {
			g_hidden.insert(key);
		}
	}
}

// =============================================================================
// Policy — layout walks, hide-vs-exempt, suppressed-key cache, sync orchestration
// =============================================================================

namespace
{
	std::mutex g_policyMutex;
	std::unordered_set<std::string> g_policySuppressedKeys;
	std::unordered_set<std::string> g_lastSyncedHideKeys;
	std::unordered_set<std::string> g_preparedHideKeys;

	std::string PolicyLower(std::string s)
	{
		std::transform(s.begin(), s.end(), s.begin(), [](unsigned char c) {
			return static_cast<char>(std::tolower(c));
		});
		return s;
	}

	std::string PolicyTrim(std::string raw)
	{
		while (!raw.empty() && std::isspace(static_cast<unsigned char>(raw.front()))) {
			raw.erase(raw.begin());
		}
		while (!raw.empty() && std::isspace(static_cast<unsigned char>(raw.back()))) {
			raw.pop_back();
		}
		return raw;
	}

	std::string SourceKey(const std::string& mod, const std::string& name)
	{
		return PolicyLower(mod) + "\x1F" + PolicyLower(name);
	}

	std::string EscapeJsonPolicy(const std::string& s)
	{
		std::string out;
		out.reserve(s.size() + 8);
		for (char c : s) {
			switch (c) {
			case '\\':
				out += "\\\\";
				break;
			case '"':
				out += "\\\"";
				break;
			case '\n':
				out += "\\n";
				break;
			case '\r':
				out += "\\r";
				break;
			case '\t':
				out += "\\t";
				break;
			default:
				out += c;
				break;
			}
		}
		return out;
	}

	std::vector<std::string> ParseStringArrayJson(std::string_view raw)
	{
		if (raw.empty() || raw == "[]") {
			return {};
		}
		CogJson::Value v;
		std::string err;
		if (!CogJson::Parse(raw, v, err) || !v.IsArray()) {
			return {};
		}
		std::vector<std::string> out;
		out.reserve(v.arrayValue.size());
		for (const auto& elem : v.arrayValue) {
			if (elem.IsString()) {
				out.push_back(elem.stringValue);
			}
		}
		return out;
	}

	std::string GizmoTypeKey(std::string raw)
	{
		return CogRegistryJson::NormalizeGizmoType(std::move(raw));
	}

	int ControllerKindRank(std::string_view kind)
	{
		if (kind == "suppressor") {
			return 0;
		}
		if (kind == "gizmo") {
			return 1;
		}
		if (kind == "gauge") {
			return 2;
		}
		if (kind == "group") {
			return 3;
		}
		return 9;
	}

	void AppendUniqueController(CogHudSuppressRow& row, CogHudSuppressController controller)
	{
		for (auto& existing : row.controllers) {
			if (existing.kind == controller.kind && existing.id == controller.id &&
				existing.role == controller.role) {
				// Prefer an active instance if we see the same controller twice.
				if (controller.active && !existing.active) {
					existing = std::move(controller);
				}
				return;
			}
		}
		row.controllers.push_back(std::move(controller));
	}

	CogHudSuppressRow& RowForKey(
		std::unordered_map<std::string, CogHudSuppressRow>& byKey,
		std::string key)
	{
		auto it = byKey.find(key);
		if (it != byKey.end()) {
			return it->second;
		}
		CogHudSuppressRow row;
		row.key = key;
		row.alias = CogHudSuppress::AliasForKey(key);
		if (row.alias.empty()) {
			row.alias = key;
		}
		row.label = CogHudSuppress::LabelForKey(row.alias);
		return byKey.emplace(std::move(key), std::move(row)).first->second;
	}

	void FinalizeSuppressRows(std::vector<CogHudSuppressRow>& rows)
	{
		for (auto& row : rows) {
			bool hasExempt = false;
			bool hasHide = false;
			for (const auto& c : row.controllers) {
				if (!c.active) {
					continue;
				}
				if (c.role == "exempt") {
					hasExempt = true;
				} else if (c.role == "hide") {
					hasHide = true;
				}
			}
			row.hidden = hasHide && !hasExempt;
			for (auto& c : row.controllers) {
				c.winning = false;
			}
			const char* wantRole = hasExempt ? "exempt" : (row.hidden ? "hide" : nullptr);
			if (!wantRole) {
				continue;
			}
			CogHudSuppressController* best = nullptr;
			for (auto& c : row.controllers) {
				if (!c.active || c.role != wantRole) {
					continue;
				}
				if (!best || ControllerKindRank(c.kind) < ControllerKindRank(best->kind) ||
					(ControllerKindRank(c.kind) == ControllerKindRank(best->kind) && c.id < best->id)) {
					best = &c;
				}
			}
			if (best) {
				best->winning = true;
			}
		}
		std::sort(rows.begin(), rows.end(), [](const CogHudSuppressRow& a, const CogHudSuppressRow& b) {
			return PolicyLower(a.alias) < PolicyLower(b.alias);
		});
	}

	std::string SerializeSuppressRows(const std::vector<CogHudSuppressRow>& rows)
	{
		std::ostringstream o;
		o << "[";
		bool firstRow = true;
		for (const auto& row : rows) {
			if (!firstRow) {
				o << ",";
			}
			firstRow = false;
			o << "{\"key\":\"" << EscapeJsonPolicy(row.key) << "\",\"alias\":\"" << EscapeJsonPolicy(row.alias)
			  << "\",\"label\":\"" << EscapeJsonPolicy(row.label)
			  << "\",\"hidden\":" << (row.hidden ? "true" : "false") << ",\"controllers\":[";
			bool firstC = true;
			for (const auto& c : row.controllers) {
				if (!firstC) {
					o << ",";
				}
				firstC = false;
				o << "{\"kind\":\"" << EscapeJsonPolicy(c.kind) << "\",\"id\":\"" << EscapeJsonPolicy(c.id)
				  << "\",\"label\":\"" << EscapeJsonPolicy(c.label) << "\",\"role\":\"" << EscapeJsonPolicy(c.role)
				  << "\",\"winning\":" << (c.winning ? "true" : "false")
				  << ",\"active\":" << (c.active ? "true" : "false") << "}";
			}
			o << "]}";
		}
		o << "]";
		return o.str();
	}
}

void CogHudSuppress::CollectSuppressions(const CogRegistry& reg, std::vector<CogHudSuppressRow>& out)
{
	out.clear();
	std::unordered_map<std::string, CogHudSuppressRow> byKey;

	auto add = [&](std::string key, CogHudSuppressController controller) {
		if (key.empty()) {
			return;
		}
		auto& row = RowForKey(byKey, std::move(key));
		AppendUniqueController(row, std::move(controller));
	};

	auto addLinked = [&](std::string_view linked, CogHudSuppressController controller) {
		const auto keys = ExpandHudKeys(linked);
		for (std::size_t i = 0; i < keys.size(); ++i) {
			auto c = controller;
			add(keys[i], i + 1 == keys.size() ? std::move(controller) : std::move(c));
		}
	};

	auto findGearBySource = [&](const std::string& mod, const std::string& name) -> const CogGear* {
		for (const auto& g : reg._gears) {
			if (SourceKey(g.mod, g.name) == SourceKey(mod, name)) {
				return &g;
			}
		}
		return nullptr;
	};

	auto effectiveHud = [](const CogGear& gear, bool& hideDup, std::string& linked) {
		const auto& look =
			CogRegistryJson::AppearanceEmpty(gear.settings) ? gear.defaults : gear.settings;
		hideDup = look.hudHideDuplicate;
		linked = look.hudLinkedElement;
	};

	for (const auto& group : reg._groups) {
		const bool visible = group.id == kDefaultGroupId ? reg._general.showDefaultGroup : group.visible;
		for (const auto& gearId : group.gearIds) {
			const CogGear* gear = nullptr;
			for (const auto& g : reg._gears) {
				if (g.id == gearId) {
					gear = &g;
					break;
				}
			}
			if (!gear || !gear->enabled) {
				continue;
			}
			const auto idx = reg._index.find(SourceKey(gear->mod, gear->name));
			if (idx == reg._index.end()) {
				continue;
			}
			if (reg._sources.find(idx->second) == reg._sources.end()) {
				continue;
			}
			bool hideDup = false;
			std::string linked;
			effectiveHud(*gear, hideDup, linked);
			if (!hideDup || linked.empty()) {
				continue;
			}
			CogHudSuppressController c;
			c.kind = "group";
			c.id = group.id;
			c.label = std::string("Group ") + group.name;
			c.role = "hide";
			c.active = visible;
			if (!visible) {
				c.label += " (hidden)";
			}
			addLinked(linked, std::move(c));
		}
	}

	for (const auto& gauge : reg._gauges) {
		const bool gaugeVisible = gauge.visible;
		if (gauge.gearMod.empty() || gauge.gearName.empty()) {
			continue;
		}
		const auto idx = reg._index.find(SourceKey(gauge.gearMod, gauge.gearName));
		if (idx == reg._index.end()) {
			continue;
		}
		if (reg._sources.find(idx->second) == reg._sources.end()) {
			continue;
		}
		const CogGear* gear = findGearBySource(gauge.gearMod, gauge.gearName);
		if (!gear) {
			continue;
		}
		bool hideDup = false;
		std::string linked;
		effectiveHud(*gear, hideDup, linked);
		if (!hideDup || linked.empty()) {
			continue;
		}
		CogHudSuppressController c;
		c.kind = "gauge";
		c.id = gauge.id;
		c.label = std::string("Gauge ") + (gauge.name.empty() ? gauge.id : gauge.name);
		c.role = "hide";
		c.active = gaugeVisible;
		if (!gaugeVisible) {
			c.label += " (hidden)";
		}
		addLinked(linked, std::move(c));
	}

	for (const auto& gizmo : reg._gizmos) {
		const auto type = GizmoTypeKey(gizmo.type);
		const auto gizmoLabel = std::string("Gizmo ") + (gizmo.name.empty() ? gizmo.id : gizmo.name);
		if (type == "cog-suppressor") {
			for (const auto& raw : ParseStringArrayJson(
					 CogRegistryJson::NormalizeHudKeyListJson(
						 CogRegistryJson::GizmoSettingsRawJson(gizmo, "alwaysHide", "[]")))) {
				CogHudSuppressController c;
				c.kind = "suppressor";
				c.id = gizmo.id;
				c.label = gizmoLabel;
				c.role = "hide";
				addLinked(raw, std::move(c));
			}
			for (const auto& raw : ParseStringArrayJson(
					 CogRegistryJson::NormalizeHudKeyListJson(
						 CogRegistryJson::GizmoSettingsRawJson(gizmo, "neverHide", "[]")))) {
				CogHudSuppressController c;
				c.kind = "suppressor";
				c.id = gizmo.id;
				c.label = gizmoLabel;
				c.role = "exempt";
				addLinked(raw, std::move(c));
			}
			continue;
		}
		if (!CogRegistryJson::GizmoIsPlayActive(gizmo)) {
			continue;
		}
		if (type == "cog-shout-meter") {
			CogHudSuppressController c;
			c.kind = "gizmo";
			c.id = gizmo.id;
			c.label = gizmoLabel;
			c.role = "hide";
			addLinked("hud.casting", std::move(c));
			continue;
		}
		if (type != "cog-feed") {
			continue;
		}
		auto addFeed = [&](const char* alias, bool enabled) {
			if (!enabled) {
				return;
			}
			CogHudSuppressController c;
			c.kind = "gizmo";
			c.id = gizmo.id;
			c.label = gizmoLabel;
			c.role = "hide";
			addLinked(alias, std::move(c));
		};
		const bool showNotifications = CogRegistryJson::GizmoSettingsBool(gizmo, "showNotifications", false);
		const bool showInventory = CogRegistryJson::GizmoSettingsBool(gizmo, "showInventory", false);
		const bool showLocation = CogRegistryJson::GizmoSettingsBool(gizmo, "showLocation", false);
		const bool showActiveEffects = CogRegistryJson::GizmoSettingsBool(gizmo, "showActiveEffects", false);
		addFeed("hud.notifications", showNotifications);
		addFeed("hud.inventory", showInventory);
		addFeed(
			"hud.currentLocation",
			showLocation && CogRegistryJson::GizmoSettingsBool(gizmo, "showCurrentLocation", true));
		addFeed("hud.activeEffects", showActiveEffects);
	}

	out.reserve(byKey.size());
	for (auto& [_, row] : byKey) {
		out.push_back(std::move(row));
	}
	FinalizeSuppressRows(out);
}

std::string CogHudSuppress::SuppressionsJson(const CogRegistry& reg)
{
	std::vector<CogHudSuppressRow> rows;
	CollectSuppressions(reg, rows);
	return SerializeSuppressRows(rows);
}

namespace
{
	void FillSuppressedCacheFromRows(const std::vector<CogHudSuppressRow>& rows)
	{
		std::unordered_set<std::string> next;
		for (const auto& row : rows) {
			if (!row.hidden) {
				continue;
			}
			next.insert(row.key);
			if (!row.alias.empty()) {
				next.insert(row.alias);
			}
		}
		std::lock_guard lock(g_policyMutex);
		g_policySuppressedKeys = std::move(next);
	}

	void FillHideKeysFromRows(const std::vector<CogHudSuppressRow>& rows, std::unordered_set<std::string>& out)
	{
		for (const auto& row : rows) {
			if (!row.hidden || !CogHudSuppress::IsSoftHideKey(row.key)) {
				continue;
			}
			out.insert(row.key);
		}
	}
}

void CogHudSuppress::CollectHideKeys(const CogRegistry& reg, std::unordered_set<std::string>& out)
{
	std::vector<CogHudSuppressRow> rows;
	CollectSuppressions(reg, rows);
	FillHideKeysFromRows(rows, out);
}

void CogHudSuppress::RefreshSuppressedCache(const CogRegistry& reg)
{
	std::vector<CogHudSuppressRow> rows;
	CollectSuppressions(reg, rows);
	FillSuppressedCacheFromRows(rows);
}

bool CogHudSuppress::IsKeySuppressed(std::string_view aliasOrKey)
{
	auto key = CanonicalKey(aliasOrKey);
	auto alias = AliasForKey(key.empty() ? std::string{ aliasOrKey } : key);
	const auto raw = PolicyTrim(std::string{ aliasOrKey });
	std::lock_guard lock(g_policyMutex);
	if (!key.empty() && g_policySuppressedKeys.contains(key)) {
		return true;
	}
	if (!alias.empty() && g_policySuppressedKeys.contains(alias)) {
		return true;
	}
	return !raw.empty() && g_policySuppressedKeys.contains(raw);
}

void CogHudSuppress::PrepareSync(const CogRegistry& reg, bool& outUnchanged)
{
	// One layout walk — cache + hide-key set both derive from the same rows.
	std::vector<CogHudSuppressRow> rows;
	CollectSuppressions(reg, rows);
	FillSuppressedCacheFromRows(rows);
	std::unordered_set<std::string> hideKeys;
	FillHideKeysFromRows(rows, hideKeys);
	outUnchanged = (hideKeys == g_lastSyncedHideKeys);
	if (!outUnchanged) {
		g_lastSyncedHideKeys = hideKeys;
	}
	g_preparedHideKeys = std::move(hideKeys);
}

void CogHudSuppress::ApplyPreparedSync(bool unchanged)
{
	if (unchanged) {
		// Same set — still re-assert. Whole-menu / late-mounted widgets need another
		// ApplyTarget pass even when the hide-key set did not change.
		// Guest clips are skipped inside ReapplyHidden unless g_guestClipsNeedApply.
		ReapplyHidden();
		return;
	}
	Sync(g_preparedHideKeys);
}

// =============================================================================
// Remount watchers — ungated Reapply on player actions that remount HUD clips
// =============================================================================

namespace
{
	void RequestRemountReapply()
	{
		CogHudSuppress::ReapplyHidden();
		if (auto* tasks = SKSE::GetTaskInterface()) {
			tasks->AddTask([]() { CogHudSuppress::ReapplyHidden(); });
		}
	}

	bool AnimTagEquals(const RE::BSFixedString& tag, const char* name)
	{
		return tag.c_str() && name && std::strcmp(tag.c_str(), name) == 0;
	}

	class RemountWatcher :
		public RE::BSTEventSink<SKSE::ActionEvent>,
		public RE::BSTEventSink<RE::TESActivateEvent>,
		public RE::BSTEventSink<RE::BSAnimationGraphEvent>,
		public RE::BSTEventSink<RE::TESObjectLoadedEvent>,
		public RE::BSTEventSink<RE::TESLoadGameEvent>
	{
	public:
		static RemountWatcher& Get()
		{
			static RemountWatcher instance;
			return instance;
		}

		void Bind()
		{
			if (_bound) {
				return;
			}
			if (auto* actions = SKSE::GetActionEventSource()) {
				actions->AddEventSink(static_cast<RE::BSTEventSink<SKSE::ActionEvent>*>(this));
			}
			if (auto* events = RE::ScriptEventSourceHolder::GetSingleton()) {
				events->AddEventSink(static_cast<RE::BSTEventSink<RE::TESActivateEvent>*>(this));
				events->AddEventSink(static_cast<RE::BSTEventSink<RE::TESObjectLoadedEvent>*>(this));
				events->AddEventSink(static_cast<RE::BSTEventSink<RE::TESLoadGameEvent>*>(this));
			}
			_bound = true;
			AttachGraph();
		}

		void AttachGraph()
		{
			auto* player = RE::PlayerCharacter::GetSingleton();
			if (player) {
				player->AddAnimationGraphEventSink(this);
			}
		}

		void TickRisingEdges()
		{
			auto* player = RE::PlayerCharacter::GetSingleton();
			const bool sprinting = player && player->IsSprinting();
			if (sprinting && !_wasSprinting) {
				RequestRemountReapply();
			}
			_wasSprinting = sprinting;

			// Soft-hide is also enforced from GFx SetVisible / AdvanceMovie hooks (AlwaysOpen
			// widgets show after player Update). Still re-assert here for remounts / clips.
			const bool underwater = player && player->GetActorRuntimeData().boolFlags.any(
												 RE::Actor::BOOL_FLAGS::kUnderwater);
			const bool deep =
				player && player->GetParentCell() &&
				player->IsPointSubmergedMoreThan(player->GetPosition(), player->GetParentCell(), 0.875f);
			const bool submerged = underwater || deep;
			if (submerged && !_wasSubmerged) {
				RequestRemountReapply();
			} else {
				CogHudSuppress::ReapplyHidden();
			}
			_wasSubmerged = submerged;
		}

		RE::BSEventNotifyControl ProcessEvent(const SKSE::ActionEvent* a_event, RE::BSTEventSource<SKSE::ActionEvent>*) override
		{
			if (!a_event) {
				return RE::BSEventNotifyControl::kContinue;
			}
			auto* player = RE::PlayerCharacter::GetSingleton();
			if (!player || a_event->actor != player) {
				return RE::BSEventNotifyControl::kContinue;
			}
			using T = SKSE::ActionEvent::Type;
			switch (a_event->type.get()) {
			case T::kVoiceCast:
			case T::kVoiceFire:
			case T::kBowDraw:
			case T::kBeginDraw:
			case T::kEndDraw:
			case T::kBeginSheathe:
			case T::kEndSheathe:
			case T::kSpellCast:
			case T::kSpellFire:
				RequestRemountReapply();
				break;
			default:
				break;
			}
			return RE::BSEventNotifyControl::kContinue;
		}

		RE::BSEventNotifyControl ProcessEvent(const RE::TESActivateEvent* a_event, RE::BSTEventSource<RE::TESActivateEvent>*) override
		{
			if (!a_event) {
				return RE::BSEventNotifyControl::kContinue;
			}
			auto* player = RE::PlayerCharacter::GetSingleton();
			if (!player || a_event->actionRef.get() != player) {
				return RE::BSEventNotifyControl::kContinue;
			}
			RequestRemountReapply();
			return RE::BSEventNotifyControl::kContinue;
		}

		RE::BSEventNotifyControl ProcessEvent(const RE::BSAnimationGraphEvent* a_event, RE::BSTEventSource<RE::BSAnimationGraphEvent>*) override
		{
			if (!a_event) {
				return RE::BSEventNotifyControl::kContinue;
			}
			auto* player = RE::PlayerCharacter::GetSingleton();
			if (!player || a_event->holder != player) {
				return RE::BSEventNotifyControl::kContinue;
			}
			if (AnimTagEquals(a_event->tag, "JumpStandingStart") ||
				AnimTagEquals(a_event->tag, "JumpDirectionalStart")) {
				RequestRemountReapply();
			}
			return RE::BSEventNotifyControl::kContinue;
		}

		RE::BSEventNotifyControl ProcessEvent(const RE::TESObjectLoadedEvent* a_event, RE::BSTEventSource<RE::TESObjectLoadedEvent>*) override
		{
			auto* player = RE::PlayerCharacter::GetSingleton();
			if (!a_event || !player || a_event->formID != player->GetFormID() || !a_event->loaded) {
				return RE::BSEventNotifyControl::kContinue;
			}
			_wasSprinting = false;
			_wasSubmerged = false;
			if (auto* tasks = SKSE::GetTaskInterface()) {
				tasks->AddTask([]() { RemountWatcher::Get().AttachGraph(); });
			} else {
				AttachGraph();
			}
			return RE::BSEventNotifyControl::kContinue;
		}

		RE::BSEventNotifyControl ProcessEvent(const RE::TESLoadGameEvent*, RE::BSTEventSource<RE::TESLoadGameEvent>*) override
		{
			_wasSprinting = false;
			_wasSubmerged = false;
			{
				std::lock_guard lock(g_mutex);
				g_movieToMenu.clear();
				InvalidateSkyUiActiveEffectsCache();
			}
			AttachGraph();
			return RE::BSEventNotifyControl::kContinue;
		}

	private:
		bool _bound = false;
		bool _wasSprinting = false;
		bool _wasSubmerged = false;
	};
}

void CogHudSuppress::BindRemountWatchers()
{
	RemountWatcher::Get().Bind();
}

void CogHudSuppress::OnMenuClosed(std::string_view menuName)
{
	UnregisterMoviesForMenu(menuName);
	if (menuName == RE::HUDMenu::MENU_NAME) {
		std::lock_guard lock(g_mutex);
		InvalidateSkyUiActiveEffectsCache();
	}
}

void CogHudSuppress::OnPlayerUpdate()
{
	RemountWatcher::Get().TickRisingEdges();
}

