#include "pch.h"
#include "_Gizmo_Feed_API.h"
#include "_Gizmo_Feed.h"
#include "_Gizmo_Feed_Log.h"
#include "_Core_Registry.h"
#include "_UI_CogUi.h"

#include <algorithm>
#include <cctype>
#include <mutex>
#include <sstream>
#include <unordered_map>
#include <vector>

namespace
{
	constexpr float kSentinel = -0.5f;

	struct Line
	{
		std::int32_t receipt = 0;
		std::string source;
		std::string message;
		std::string color;
		std::string icon;
		float current = -1.0f;
		float maximum = -1.0f;
		std::string type;
		bool meter = false;
		bool pendingUpsert = false;
		bool pendingDismiss = false;
		bool visible = true;
	};

	std::mutex g_mutex;
	std::unordered_map<std::int32_t, Line> g_lines;
	std::int32_t g_nextReceipt = 1;
	std::vector<std::int32_t> g_pendingOrder;

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

	std::string TrimCopy(std::string s)
	{
		while (!s.empty() && std::isspace(static_cast<unsigned char>(s.front()))) {
			s.erase(s.begin());
		}
		while (!s.empty() && std::isspace(static_cast<unsigned char>(s.back()))) {
			s.pop_back();
		}
		return s;
	}

	std::string NormalizeSource(std::string source)
	{
		source = TrimCopy(std::move(source));
		if (source.empty()) {
			return CogFeed::kSourceGeneral;
		}
		if (source.size() >= 4) {
			const auto prefix = source.substr(0, 4);
			bool cog = true;
			for (std::size_t i = 0; i < 4; ++i) {
				const char expect[] = { 'c', 'o', 'g', '-' };
				if (std::tolower(static_cast<unsigned char>(prefix[i])) != expect[i]) {
					cog = false;
					break;
				}
			}
			if (cog && source != CogFeed::kSourceNotifications && source != CogFeed::kSourceInventory &&
				source != CogFeed::kSourceLocation && source != CogFeed::kSourceSkills &&
				source != CogFeed::kSourceEffects && !source.starts_with("cog-feed")) {
				CogFeedLog::warn("Notify source '{}' uses reserved cog- prefix (non-builtin)", source);
			}
		}
		return source;
	}

	bool IsTimerType(std::string_view type)
	{
		std::string t;
		t.reserve(type.size());
		for (char c : type) {
			t.push_back(static_cast<char>(std::tolower(static_cast<unsigned char>(c))));
		}
		return t == "timer";
	}

	void QueuePending(std::int32_t receipt)
	{
		if (std::find(g_pendingOrder.begin(), g_pendingOrder.end(), receipt) == g_pendingOrder.end()) {
			g_pendingOrder.push_back(receipt);
		}
	}

	std::string FormatCurrentOnlyMessage(std::string message, float current)
	{
		char buf[64];
		std::snprintf(buf, sizeof(buf), "%.4g", static_cast<double>(current));
		if (!message.empty()) {
			message.push_back(' ');
		}
		message += buf;
		return message;
	}

	std::string LineToJson(const Line& e, bool dismiss)
	{
		std::ostringstream o;
		o << "{\"channel\":\"notify\",\"op\":\"" << (dismiss ? "dismiss" : "upsert") << "\",\"id\":" << e.receipt
		  << ",\"source\":\"" << EscapeJson(e.source) << "\"";
		if (!dismiss) {
			o << ",\"text\":\"" << EscapeJson(e.message) << "\",\"color\":\"" << EscapeJson(e.color)
			  << "\",\"icon\":\"" << EscapeJson(e.icon) << "\"";
			if (e.meter) {
				o << ",\"current\":" << e.current << ",\"max\":" << e.maximum << ",\"type\":\""
				  << EscapeJson(e.type) << "\"";
			}
		}
		o << '}';
		return o.str();
	}
}

bool CogFeed::SourceSectionVisible(std::string_view source)
{
	auto& reg = CogRegistry::Get();
	if (source == kSourceInventory) {
		return reg.HasVisibleFeedShowingInventory();
	}
	if (source == kSourceLocation) {
		return reg.HasVisibleFeedDivertingLocationDiscovery() || reg.HasVisibleFeedDivertingCurrentLocation();
	}
	if (source == kSourceSkills) {
		return reg.HasVisibleFeedShowingSkills() || reg.HasVisibleFeedShowingLevelProgress();
	}
	if (source == kSourceEffects) {
		return reg.AnyVisibleFeedShowsActiveEffects();
	}
	// notifications, general, unknown mod ids
	return reg.HasVisibleFeedShowingNotifications();
}

std::int32_t CogFeed::Notify(
	std::string message,
	std::string color,
	std::string icon,
	std::string source,
	float current,
	float maximum,
	std::string type,
	std::int32_t receipt)
{
	source = NormalizeSource(std::move(source));
	while (!message.empty() && (message.back() == '\n' || message.back() == '\r')) {
		message.pop_back();
	}

	const bool hasCurrent = current > kSentinel;
	const bool hasMax = maximum > kSentinel;
	bool meter = false;
	if (hasCurrent && hasMax) {
		meter = true;
		if (IsTimerType(type)) {
			type = "timer";
		} else {
			type.clear();
		}
	} else if (hasCurrent && !hasMax) {
		message = FormatCurrentOnlyMessage(std::move(message), current);
		current = -1.0f;
		maximum = -1.0f;
		type.clear();
	} else {
		current = -1.0f;
		maximum = -1.0f;
		type.clear();
	}

	if (message.empty() && !meter) {
		CogFeedLog::debug("Notify dropped empty message source={}", source);
		return 0;
	}

	if (!SourceSectionVisible(source)) {
		static std::uint64_t s_drop = 0;
		const auto n = ++s_drop;
		if (n <= 8 || (n % 50) == 0) {
			CogFeedLog::info(
				"COG_Feed_API.Notify dropped source={} \"{}\"; dropCount={}",
				source,
				message,
				n);
		}
		return 0;
	}

	std::int32_t outReceipt = 0;
	{
		std::lock_guard lock(g_mutex);
		Line* line = nullptr;
		if (receipt != 0) {
			auto it = g_lines.find(receipt);
			// Allow upsert while fading (visible=false until ExpireReceipt) so AE can revive the same receipt.
			if (it != g_lines.end()) {
				line = &it->second;
				outReceipt = receipt;
			}
		}
		if (!line) {
			outReceipt = g_nextReceipt++;
			if (outReceipt <= 0) {
				g_nextReceipt = 1;
				outReceipt = g_nextReceipt++;
			}
			line = &g_lines[outReceipt];
			line->receipt = outReceipt;
			if (receipt != 0) {
				CogFeedLog::debug(
					"Notify expired/unknown receipt={} → new id={} source={}",
					receipt,
					outReceipt,
					source);
			}
		}
		line->source = std::move(source);
		line->message = std::move(message);
		line->color = std::move(color);
		line->icon = std::move(icon);
		line->current = current;
		line->maximum = maximum;
		line->type = std::move(type);
		line->meter = meter;
		line->pendingUpsert = true;
		line->pendingDismiss = false;
		line->visible = true;
		QueuePending(outReceipt);
		CogFeedLog::debug(
			"Notify queued id={} source={} meter={} \"{}\"",
			outReceipt,
			line->source,
			line->meter ? 1 : 0,
			line->message);
	}
	return outReceipt;
}

void CogFeed::Dismiss(std::int32_t receipt)
{
	if (receipt == 0) {
		return;
	}
	std::lock_guard lock(g_mutex);
	auto it = g_lines.find(receipt);
	if (it == g_lines.end()) {
		CogFeedLog::debug("Dismiss unknown receipt={}", receipt);
		return;
	}
	it->second.pendingDismiss = true;
	it->second.pendingUpsert = false;
	it->second.visible = false;
	QueuePending(receipt);
	CogFeedLog::debug("Dismiss queued id={} source={}", receipt, it->second.source);
}

void CogFeed::ExpireReceipt(std::int32_t receipt)
{
	if (receipt == 0) {
		return;
	}
	std::lock_guard lock(g_mutex);
	auto it = g_lines.find(receipt);
	if (it == g_lines.end()) {
		return;
	}
	CogFeedLog::debug("Expire receipt={} source={}", receipt, it->second.source);
	g_lines.erase(it);
	std::erase(g_pendingOrder, receipt);
}

std::vector<std::string> CogFeed::DrainNotifyEventsJson()
{
	std::vector<std::string> out;
	std::lock_guard lock(g_mutex);
	std::vector<std::int32_t> order = std::move(g_pendingOrder);
	g_pendingOrder.clear();
	for (const auto receipt : order) {
		auto it = g_lines.find(receipt);
		if (it == g_lines.end()) {
			continue;
		}
		auto& line = it->second;
		if (line.pendingDismiss) {
			out.push_back(LineToJson(line, true));
			line.pendingDismiss = false;
			// Meters stay until JS finishes fading (feedExpire) so a mid-fade upsert can reuse the receipt.
			// Toasts are one-shot — drop immediately.
			if (!line.meter) {
				g_lines.erase(it);
			}
			continue;
		}
		if (line.pendingUpsert) {
			out.push_back(LineToJson(line, false));
			line.pendingUpsert = false;
			// Toasts are one-shot; meters stay until Dismiss + ExpireReceipt.
			if (!line.meter) {
				g_lines.erase(it);
			}
		}
	}
	return out;
}

namespace
{
	std::int32_t PapyrusNotify(
		RE::StaticFunctionTag*,
		std::string message,
		std::string color,
		std::string icon,
		std::string source,
		float current,
		float maximum,
		std::string type,
		std::int32_t receipt)
	{
		const auto id = CogFeed::Notify(
			std::move(message),
			std::move(color),
			std::move(icon),
			std::move(source),
			current,
			maximum,
			std::move(type),
			receipt);
		if (id != 0) {
			CogUi::RunOnMainThread([]() { CogFeed::FlushNotificationsToUi(); });
		}
		return id;
	}

	void PapyrusDismiss(RE::StaticFunctionTag*, std::int32_t receipt)
	{
		CogFeed::Dismiss(receipt);
		CogUi::RunOnMainThread([]() { CogFeed::FlushNotificationsToUi(); });
	}

	void LegacyNotify(RE::StaticFunctionTag*, std::string message, std::string color, std::string icon)
	{
		// Migration Code for Transition from v1.01 or earlier to v1.1:
		// COG_API.Notify → COG_Feed_API.Notify (source omitted → general).
		PapyrusNotify(
			nullptr,
			std::move(message),
			std::move(color),
			std::move(icon),
			{},
			-1.0f,
			-1.0f,
			{},
			0);
	}
}

bool CogApiFeed::Bind(RE::BSScript::IVirtualMachine* vm)
{
	if (!vm) {
		return false;
	}
	vm->RegisterFunction("Notify", "COG_Feed_API", PapyrusNotify);
	vm->RegisterFunction("Dismiss", "COG_Feed_API", PapyrusDismiss);
	vm->SetCallableFromTasklets("COG_Feed_API", "Notify", true);
	vm->SetCallableFromTasklets("COG_Feed_API", "Dismiss", true);

	// Migration Code for Transition from v1.01 or earlier to v1.1:
	vm->RegisterFunction("Notify", "COG_API", LegacyNotify);
	vm->SetCallableFromTasklets("COG_API", "Notify", true);
	return true;
}
