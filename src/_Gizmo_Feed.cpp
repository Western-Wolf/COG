#include "pch.h"
#include "_Gizmo_Feed.h"
#include "_Gizmo_Feed_Inventory.h"
#include "_Gizmo_Feed_LocationIcons.h"
#include "_Gizmo_Feed_NotificationIcons.h"
#include "_Gizmo_Feed_Skills.h"
#include "_UI_CogUi.h"
#include "_Core_Registry.h"
#include "_Core_Registry_Json.h"
#include "_Core_HudSuppress.h"

#include <cctype>
#include <deque>
#include <mutex>
#include <sstream>
#include <string_view>
#include <vector>

namespace
{
	constexpr std::size_t kRingCap = 32;

	struct Entry
	{
		std::uint64_t id = 0;
		std::string text;
		std::string color;
		std::string icon;
	};

	struct LocationEntry
	{
		std::uint64_t id = 0;
		std::string text;
		std::string kind;
		std::string icon;
	};

	std::mutex g_mutex;
	std::deque<Entry> g_ring;
	std::deque<LocationEntry> g_locationRing;
	std::uint64_t g_nextId = 1;
	std::uint64_t g_nextLocationId = 1;
	// Prisma Interop is reliable on the JS tick path (PushToUi). Event/HUD threads
	// enqueue here; Flush* drains ids newer than these watermarks.
	std::uint64_t g_flushedNotificationId = 0;
	std::uint64_t g_flushedLocationId = 0;

	std::string EscapeJson(std::string_view raw)
	{
		std::string out;
		out.reserve(raw.size() + 8);
		for (char c : raw) {
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

	std::string TranslateHudText(std::string text)
	{
		while (!text.empty() && (text.back() == '\n' || text.back() == '\r')) {
			text.pop_back();
		}
		if (text.empty()) {
			return {};
		}
		if (text.starts_with('$')) {
			std::string translated;
			if (SKSE::Translation::Translate(text, translated) && !translated.empty()) {
				return translated;
			}
		}
		return text;
	}

	char AsciiLower(char c)
	{
		return static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
	}

	bool AsciiEqIgnoreCase(std::string_view a, std::string_view b)
	{
		if (a.size() != b.size()) {
			return false;
		}
		for (std::size_t i = 0; i < a.size(); ++i) {
			if (AsciiLower(a[i]) != AsciiLower(b[i])) {
				return false;
			}
		}
		return true;
	}

	bool IsEmphasisTag(std::string_view name)
	{
		return AsciiEqIgnoreCase(name, "b") || AsciiEqIgnoreCase(name, "i") || AsciiEqIgnoreCase(name, "u");
	}

	/** Extract color= value from a <font …> open tag body (attributes only, no brackets). */
	std::string FontTagColorAttr(std::string_view attrs)
	{
		constexpr std::string_view key = "color";
		for (std::size_t i = 0; i + key.size() <= attrs.size(); ++i) {
			if (!AsciiEqIgnoreCase(attrs.substr(i, key.size()), key)) {
				continue;
			}
			if (i > 0 && !std::isspace(static_cast<unsigned char>(attrs[i - 1]))) {
				continue;
			}
			std::size_t j = i + key.size();
			while (j < attrs.size() && std::isspace(static_cast<unsigned char>(attrs[j]))) {
				++j;
			}
			if (j >= attrs.size() || attrs[j] != '=') {
				continue;
			}
			++j;
			while (j < attrs.size() && std::isspace(static_cast<unsigned char>(attrs[j]))) {
				++j;
			}
			if (j >= attrs.size()) {
				return {};
			}
			char quote = 0;
			if (attrs[j] == '\'' || attrs[j] == '"') {
				quote = attrs[j];
				++j;
			}
			std::size_t start = j;
			if (quote) {
				while (j < attrs.size() && attrs[j] != quote) {
					++j;
				}
			} else {
				while (j < attrs.size() && !std::isspace(static_cast<unsigned char>(attrs[j])) && attrs[j] != '>') {
					++j;
				}
			}
			return std::string{ attrs.substr(start, j - start) };
		}
		return {};
	}

	enum class MarkupMode
	{
		KeepEmphasis,  // leave <b>/<i>/<u>; strip font + unknown
		StripAll       // strip every tag (inventory matching)
	};

	/**
	 * Process Scaleform-ish tags. When keepEmphasis, preserves b/i/u for JS rich text.
	 * Returns first font color= found (raw attribute string, may be #AARRGGBB).
	 */
	std::string ProcessHudMarkup(std::string& text, MarkupMode mode)
	{
		std::string extractedColor;
		std::string out;
		out.reserve(text.size());
		for (std::size_t i = 0; i < text.size();) {
			if (text[i] != '<') {
				out.push_back(text[i]);
				++i;
				continue;
			}
			const std::size_t close = text.find('>', i + 1);
			if (close == std::string::npos) {
				out.append(text.substr(i));
				break;
			}
			std::string_view tag = std::string_view{ text }.substr(i + 1, close - (i + 1));
			bool closing = false;
			std::size_t nameStart = 0;
			if (!tag.empty() && tag.front() == '/') {
				closing = true;
				nameStart = 1;
			}
			while (nameStart < tag.size() && std::isspace(static_cast<unsigned char>(tag[nameStart]))) {
				++nameStart;
			}
			std::size_t nameEnd = nameStart;
			while (nameEnd < tag.size() && std::isalnum(static_cast<unsigned char>(tag[nameEnd]))) {
				++nameEnd;
			}
			const std::string_view name = tag.substr(nameStart, nameEnd - nameStart);
			if (name.empty()) {
				// Not a tag we understand — drop the brackets so junk does not show.
				i = close + 1;
				continue;
			}
			if (AsciiEqIgnoreCase(name, "font")) {
				if (!closing && extractedColor.empty()) {
					extractedColor = FontTagColorAttr(tag.substr(nameEnd));
				}
				i = close + 1;
				continue;
			}
			if (mode == MarkupMode::KeepEmphasis && IsEmphasisTag(name)) {
				out.push_back('<');
				if (closing) {
					out.push_back('/');
				}
				for (char c : name) {
					out.push_back(AsciiLower(c));
				}
				out.push_back('>');
				i = close + 1;
				continue;
			}
			// StripAll, or unknown tag: drop.
			i = close + 1;
		}
		text = std::move(out);
		while (!text.empty() && std::isspace(static_cast<unsigned char>(text.front()))) {
			text.erase(text.begin());
		}
		while (!text.empty() && std::isspace(static_cast<unsigned char>(text.back()))) {
			text.pop_back();
		}
		return extractedColor;
	}

	void ApplyNotificationMarkup(std::string& text, std::string& color)
	{
		const std::string fromFont = ProcessHudMarkup(text, MarkupMode::KeepEmphasis);
		auto normalized = CogRegistryJson::OptionalHexColor(color);
		if (!normalized.empty()) {
			color = std::move(normalized);
			return;
		}
		color = CogRegistryJson::OptionalHexColor(fromFont);
	}

	void LogRejectedHudUpdateData()
	{
		// Exotic / hostile injectors could spam — keep COG.log readable.
		static std::uint64_t s_count = 0;
		const auto n = ++s_count;
		if (n <= 8 || (n % 50) == 0) {
			logger::warn(
				"Feed: HUD kUpdate data is not HUDData — divert/soft-hide side-path skipped "
				"(CTD review C9); rejectCount={}",
				n);
		}
	}

	struct HUDMenuProcessMessageHook
	{
		static RE::UI_MESSAGE_RESULTS thunk(RE::HUDMenu* a_this, RE::UIMessage& a_message)
		{
			if (a_message.type == RE::UI_MESSAGE_TYPE::kUpdate && a_message.data) {
				auto* hudData = skyrim_cast<RE::HUDData*>(a_message.data);
				if (!hudData) {
					LogRejectedHudUpdateData();
					// Wrong blob type — do not read toast fields; pass through to original.
				} else {
					const auto kind = hudData->type.get();
					const char* text = hudData->text.c_str();

					if (kind == RE::HUD_MESSAGE_TYPE::kLocationDiscovery) {
						// No suppress key — discovery shares QuestUpdateBaseInstance with hud.questUpdates.
						// Feed Location → Discovery owns divert/enqueue only.
						if (CogRegistry::Get().HasVisibleFeedDivertingLocationDiscovery()) {
							if (text && text[0]) {
								CogFeed::EnqueueLocation(text, "discovery");
							}
							return RE::UI_MESSAGE_RESULTS::kIgnore;
						}
					} else if (kind == RE::HUD_MESSAGE_TYPE::kShowLocationName) {
						if (CogHudSuppress::IsKeySuppressed("hud.currentLocation")) {
							if (CogRegistry::Get().HasVisibleFeedDivertingCurrentLocation() && text &&
								text[0]) {
								CogFeed::EnqueueLocation(text, "current");
							}
							return RE::UI_MESSAGE_RESULTS::kIgnore;
						}
					} else if (kind == RE::HUD_MESSAGE_TYPE::kNotification) {
						if (text && text[0]) {
							const std::string plain = CogFeed::StripHudMarkupForMatch(text);
							// Inventory-style toasts are still kNotification → MessagesBlock; starve when
							// Feed Inventory is on (or Notifications + suppressInventory). hud.inventory
							// is a reserved alias and does not gate this.
							if (CogFeed::IsInventoryToast(plain) &&
								CogRegistry::Get().ShouldSuppressInventoryNotifications()) {
								return RE::UI_MESSAGE_RESULTS::kIgnore;
							}
							if (CogHudSuppress::IsKeySuppressed("hud.notifications")) {
								if (CogRegistry::Get().HasVisibleFeedShowingNotifications()) {
									CogFeed::EnqueueNotification(text, {}, {});
								}
								return RE::UI_MESSAGE_RESULTS::kIgnore;
							}
						} else if (CogHudSuppress::IsKeySuppressed("hud.notifications")) {
							return RE::UI_MESSAGE_RESULTS::kIgnore;
						}
					} else if (kind == RE::HUD_MESSAGE_TYPE::kSkillIncrease) {
						// No suppress key — skill/level banners share QuestUpdateBaseInstance with
						// hud.questUpdates. Feed Skills owns divert/enqueue only.
						if (CogRegistry::Get().HasVisibleFeedShowingSkills()) {
							if (text && text[0]) {
								CogFeed::HandleSkillIncreaseHud(text);
							}
							return RE::UI_MESSAGE_RESULTS::kIgnore;
						}
					}
				}
			}

			const auto result = func(a_this, a_message);

			if (a_message.type == RE::UI_MESSAGE_TYPE::kUpdate && a_message.data) {
				if (auto* hudData = skyrim_cast<RE::HUDData*>(a_message.data)) {
					const auto kind = hudData->type.get();
					if (kind == RE::HUD_MESSAGE_TYPE::kSetMode ||
						kind == RE::HUD_MESSAGE_TYPE::kCrosshairSneak ||
						kind == RE::HUD_MESSAGE_TYPE::kRefreshAll) {
						CogHudSuppress::ReapplyHidden();
					}
				}
				// Non-HUDData reject already logged on the pre-divert path when data was present.
			}
			return result;
		}

		static inline REL::Relocation<decltype(thunk)> func;
	};
}

bool CogFeed::HasActiveNotifications()
{
	return CogRegistry::Get().HasVisibleFeedShowingNotifications();
}

bool CogFeed::HasActiveInventory()
{
	return CogRegistry::Get().HasVisibleFeedShowingInventory();
}

void CogFeed::PolledUiChannel::Reset()
{
	std::lock_guard lock(mutex);
	wasWanted = false;
	lastPayload.clear();
}

bool CogFeed::PolledUiChannel::BeginTick(bool wanted)
{
	const char* name = nullptr;
	const char* clear = nullptr;
	bool doClear = false;
	bool shouldBuild = false;
	{
		std::lock_guard lock(mutex);
		if (!CogUi::HasView()) {
			wasWanted = false;
			lastPayload.clear();
			return false;
		}
		if (!wanted) {
			if (wasWanted && clearPayload && clearPayload[0]) {
				doClear = true;
				name = interopName;
				clear = clearPayload;
				lastPayload = clearPayload;
			}
			wasWanted = false;
		} else {
			wasWanted = true;
			shouldBuild = true;
		}
	}
	if (doClear && name && clear) {
		CogUi::Interop(name, clear);
	}
	return shouldBuild;
}

void CogFeed::PolledUiChannel::SendIfChanged(std::string payload)
{
	const char* name = nullptr;
	std::string toSend;
	bool send = false;
	{
		std::lock_guard lock(mutex);
		if (!CogUi::HasView()) {
			wasWanted = false;
			lastPayload.clear();
			return;
		}
		if (payload == lastPayload) {
			return;
		}
		lastPayload = std::move(payload);
		name = interopName;
		toSend = lastPayload;
		send = true;
	}
	if (send) {
		CogUi::Interop(name, toSend);
	}
}

std::string CogFeed::StripHudMarkupForMatch(std::string text)
{
	ProcessHudMarkup(text, MarkupMode::StripAll);
	return text;
}

void CogFeed::EnqueueNotification(std::string text, std::string color, std::string icon)
{
	text = TranslateHudText(std::move(text));
	ApplyNotificationMarkup(text, color);
	if (text.empty()) {
		return;
	}
	if (icon.empty()) {
		// Icon rules see plain text (emphasis tags stripped for matching only).
		icon = CogFeed::ResolveNotificationIcon(StripHudMarkupForMatch(text));
	}

	Entry e;
	{
		std::lock_guard lock(g_mutex);
		e.id = g_nextId++;
		e.text = std::move(text);
		e.color = std::move(color);
		e.icon = std::move(icon);
		g_ring.push_back(e);
		while (g_ring.size() > kRingCap) {
			g_ring.pop_front();
		}
	}
	logger::debug("Feed: notification queued id={} \"{}\"", e.id, e.text);
}

void CogFeed::EnqueueLocation(std::string text, std::string kind)
{
	text = TranslateHudText(std::move(text));
	if (text.empty()) {
		return;
	}
	if (kind != "current") {
		kind = "discovery";
	}
	std::string icon = CogFeed::ResolveLocationIcon(text, kind);

	LocationEntry e;
	{
		std::lock_guard lock(g_mutex);
		e.id = g_nextLocationId++;
		e.text = std::move(text);
		e.kind = std::move(kind);
		e.icon = std::move(icon);
		g_locationRing.push_back(e);
		while (g_locationRing.size() > kRingCap) {
			g_locationRing.pop_front();
		}
	}
	logger::debug("Feed: location queued id={} kind={} \"{}\"", e.id, e.kind, e.text);
}

void CogFeed::FlushNotificationsToUi()
{
	PushPendingFeedEventsToUi();
}

void CogFeed::PushPendingFeedEventsToUi()
{
	if (!CogUi::HasView()) {
		return;
	}

	std::vector<Entry> notes;
	std::vector<LocationEntry> locs;
	{
		std::lock_guard lock(g_mutex);
		for (const auto& e : g_ring) {
			if (e.id > g_flushedNotificationId) {
				notes.push_back(e);
			}
		}
		if (!notes.empty()) {
			g_flushedNotificationId = notes.back().id;
		}
		for (const auto& e : g_locationRing) {
			if (e.id > g_flushedLocationId) {
				locs.push_back(e);
			}
		}
		if (!locs.empty()) {
			g_flushedLocationId = locs.back().id;
		}
	}
	auto inv = DrainInventoryEventsJson();
	auto skills = DrainSkillEventsJson();
	if (notes.empty() && locs.empty() && inv.empty() && skills.empty()) {
		return;
	}

	std::ostringstream o;
	o << '[';
	bool first = true;
	auto append = [&](const std::string& obj) {
		if (!first) {
			o << ',';
		}
		first = false;
		o << obj;
	};
	for (const auto& e : notes) {
		std::ostringstream one;
		one << "{\"channel\":\"notification\",\"id\":" << e.id << ",\"text\":\"" << EscapeJson(e.text)
			<< "\",\"color\":\"" << EscapeJson(e.color) << "\",\"icon\":\"" << EscapeJson(e.icon) << "\"}";
		append(one.str());
	}
	for (const auto& json : inv) {
		append(std::string("{\"channel\":\"inventory\",") + json.substr(1));
	}
	for (const auto& e : locs) {
		std::ostringstream one;
		one << "{\"channel\":\"location\",\"id\":" << e.id << ",\"text\":\"" << EscapeJson(e.text)
			<< "\",\"kind\":\"" << EscapeJson(e.kind) << "\",\"icon\":\"" << EscapeJson(e.icon) << "\"}";
		append(one.str());
	}
	for (const auto& json : skills) {
		append(std::string("{\"channel\":\"skill\",") + json.substr(1));
	}
	o << ']';

	logger::debug(
		"Feed: applyFeedEvents notes={} inventory={} locations={} skills={}",
		notes.size(),
		inv.size(),
		locs.size(),
		skills.size());
	CogUi::Interop("applyFeedEvents", o.str());
}

void CogFeed::InstallHudHooks()
{
	REL::Relocation<std::uintptr_t> vtbl{ RE::VTABLE_HUDMenu[0] };
	HUDMenuProcessMessageHook::func = vtbl.write_vfunc(0x4, HUDMenuProcessMessageHook::thunk);
	logger::info("COG HUD toast divert hooks installed (HUDMenu::ProcessMessage)");
}
