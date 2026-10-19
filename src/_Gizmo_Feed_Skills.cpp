#include "pch.h"
#include "_Gizmo_Feed_Skills.h"
#include "_Gizmo_Feed.h"
#include "_Gizmo_Feed_UtilityIconRegistry.h"
#include "_Gizmo_Storage.h"
#include "_Core_Registry.h"
#include "_UI_CogUi.h"

#include <RE/A/ActorValueList.h>
#include <RE/A/ActorValues.h>
#include <RE/P/PlayerCharacter.h>
#include <RE/S/SkillIncrease.h>

#include <chrono>
#include <cmath>
#include <cstdio>
#include <deque>
#include <filesystem>
#include <mutex>
#include <sstream>
#include <string>
#include <string_view>

namespace
{
	constexpr std::size_t kRingCap = 32;
	constexpr auto kPendingSkillTtl = std::chrono::milliseconds(750);

	struct SkillEntry
	{
		std::uint64_t id = 0;
		std::string text;
		std::string kind;
		std::string icon;
		std::string skillName;
	};

	std::mutex g_mutex;
	std::deque<SkillEntry> g_ring;
	std::uint64_t g_nextId = 1;
	std::uint64_t g_flushedId = 0;

	std::mutex g_pendingMutex;
	RE::ActorValue g_pendingAv = RE::ActorValue::kNone;
	std::chrono::steady_clock::time_point g_pendingAt{};
	bool g_hasPending = false;

	std::mutex g_iconMutex;
	CogFeed::IconRegistry::Store g_iconStore;

	std::filesystem::path SkillIconRulesDir()
	{
		return CogGizmoStorage::EnsureDir("cog-feed") / "skills";
	}

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

	bool PeekPendingSkill(RE::ActorValue& outAv)
	{
		std::lock_guard lock(g_pendingMutex);
		if (!g_hasPending) {
			return false;
		}
		const auto age = std::chrono::steady_clock::now() - g_pendingAt;
		if (age > kPendingSkillTtl) {
			g_hasPending = false;
			g_pendingAv = RE::ActorValue::kNone;
			return false;
		}
		outAv = g_pendingAv;
		return outAv != RE::ActorValue::kNone;
	}

	bool TakePendingSkill(RE::ActorValue& outAv)
	{
		std::lock_guard lock(g_pendingMutex);
		if (!g_hasPending) {
			return false;
		}
		const auto age = std::chrono::steady_clock::now() - g_pendingAt;
		if (age > kPendingSkillTtl) {
			g_hasPending = false;
			g_pendingAv = RE::ActorValue::kNone;
			return false;
		}
		outAv = g_pendingAv;
		g_hasPending = false;
		g_pendingAv = RE::ActorValue::kNone;
		return outAv != RE::ActorValue::kNone;
	}

	void ClearPendingSkill()
	{
		std::lock_guard lock(g_pendingMutex);
		g_hasPending = false;
		g_pendingAv = RE::ActorValue::kNone;
	}

	std::string ResolveSkillIcon(RE::ActorValue av, std::string_view displayText)
	{
		CogFeed::IconRegistry::Candidates c;
		if (!displayText.empty()) {
			CogFeed::IconRegistry::PushCandidate(c, "name", std::string{ displayText });
		}
		const auto avStr = RE::ActorValueToString(av);
		if (!avStr.empty()) {
			CogFeed::IconRegistry::PushCandidate(c, "name", std::string{ avStr });
		}
		if (const char* avName = RE::ActorValueList::GetActorValueName(av); avName && avName[0]) {
			CogFeed::IconRegistry::PushCandidate(c, "name", avName);
		}
		std::lock_guard lock(g_iconMutex);
		return CogFeed::IconRegistry::Resolve(g_iconStore, c);
	}

	std::string ResolveSkillIconByText(std::string_view displayText)
	{
		CogFeed::IconRegistry::Candidates c;
		if (!displayText.empty()) {
			CogFeed::IconRegistry::PushCandidate(c, "name", std::string{ displayText });
		}
		std::lock_guard lock(g_iconMutex);
		return CogFeed::IconRegistry::Resolve(g_iconStore, c);
	}

	class SkillIncreaseWatcher : public RE::BSTEventSink<RE::SkillIncrease::Event>
	{
	public:
		static SkillIncreaseWatcher* GetSingleton()
		{
			static SkillIncreaseWatcher singleton;
			return &singleton;
		}

		RE::BSEventNotifyControl ProcessEvent(
			const RE::SkillIncrease::Event* a_event,
			RE::BSTEventSource<RE::SkillIncrease::Event>*) override
		{
			if (!a_event || a_event->actorValue == RE::ActorValue::kNone) {
				return RE::BSEventNotifyControl::kContinue;
			}
			std::lock_guard lock(g_pendingMutex);
			g_pendingAv = a_event->actorValue;
			g_pendingAt = std::chrono::steady_clock::now();
			g_hasPending = true;
			return RE::BSEventNotifyControl::kContinue;
		}
	};

	void EnqueueSkillInternal(std::string text, std::string kind)
	{
		text = TranslateHudText(std::move(text));
		if (text.empty()) {
			return;
		}
		if (kind != "level") {
			kind = "skill";
		}

		std::string icon;
		std::string skillName;
		if (kind == "skill") {
			RE::ActorValue av = RE::ActorValue::kNone;
			if (TakePendingSkill(av)) {
				icon = ResolveSkillIcon(av, text);
				if (const char* avName = RE::ActorValueList::GetActorValueName(av); avName && avName[0]) {
					skillName = avName;
				} else {
					skillName = std::string{ RE::ActorValueToString(av) };
				}
			} else {
				icon = ResolveSkillIconByText(text);
			}
		} else {
			ClearPendingSkill();
		}

		SkillEntry e;
		{
			std::lock_guard lock(g_mutex);
			e.id = g_nextId++;
			e.text = std::move(text);
			e.kind = std::move(kind);
			e.icon = std::move(icon);
			e.skillName = std::move(skillName);
			g_ring.push_back(e);
			while (g_ring.size() > kRingCap) {
				g_ring.pop_front();
			}
		}
		logger::debug("Feed: skill queued id={} kind={} \"{}\"", e.id, e.kind, e.text);
	}
}

void CogFeed::InstallSkillIncreaseSink()
{
	static bool installed = false;
	if (installed) {
		return;
	}
	if (auto* src = RE::SkillIncrease::GetEventSource()) {
		src->AddEventSink(SkillIncreaseWatcher::GetSingleton());
		installed = true;
		logger::info("SkillsFeed: SkillIncrease::Event sink installed");
	} else {
		logger::error("SkillsFeed: SkillIncrease event source missing");
	}
}

void CogFeed::LoadSkillIconRules()
{
	std::lock_guard lock(g_iconMutex);
	IconRegistry::LoadDir(SkillIconRulesDir(), g_iconStore, "SkillIcons", IconRegistry::SkillsKinds());
}

void CogFeed::HandleSkillIncreaseHud(std::string text)
{
	RE::ActorValue av = RE::ActorValue::kNone;
	const bool isSkill = PeekPendingSkill(av);
	EnqueueSkillInternal(std::move(text), isSkill ? "skill" : "level");
	// HUD ProcessMessage is UI-thread; player skills + Prisma Interop go on the main task queue.
	CogUi::RunOnMainThread([]() { PushLevelProgressToUi(); });
}

std::vector<std::string> CogFeed::DrainSkillEventsJson()
{
	std::vector<SkillEntry> batch;
	{
		std::lock_guard lock(g_mutex);
		for (const auto& e : g_ring) {
			if (e.id > g_flushedId) {
				batch.push_back(e);
			}
		}
		if (!batch.empty()) {
			g_flushedId = batch.back().id;
		}
	}
	std::vector<std::string> out;
	out.reserve(batch.size());
	for (const auto& e : batch) {
		std::ostringstream o;
		o << "{\"id\":" << e.id << ",\"text\":\"" << EscapeJson(e.text) << "\",\"kind\":\""
		  << EscapeJson(e.kind) << "\",\"icon\":\"" << EscapeJson(e.icon) << "\",\"skillName\":\""
		  << EscapeJson(e.skillName) << "\"}";
		out.push_back(o.str());
	}
	return out;
}

void CogFeed::PushLevelProgressToUi()
{
	// clearPayload "null" → applyLevelProgress clears levelProgressLive (see Feed JS).
	static PolledUiChannel gate{ "applyLevelProgress", "null" };
	if (!gate.BeginTick(CogRegistry::Get().HasVisibleFeedShowingLevelProgress())) {
		return;
	}
	auto* player = RE::PlayerCharacter::GetSingleton();
	if (!player) {
		gate.SendIfChanged("null");
		return;
	}
	// Versioned accessor — direct player->skills is SE-offset and wrong on AE.
	auto* skills = player->GetInfoRuntimeData().skills;
	if (!skills || !skills->data) {
		gate.SendIfChanged("null");
		return;
	}
	const auto* data = skills->data;
	const float xp = data->xp;
	const float threshold = data->levelThreshold > 0.f ? data->levelThreshold : 1.f;
	float progress = xp / threshold;
	if (!std::isfinite(progress)) {
		progress = 0.f;
	}
	progress = (std::max)(0.f, (std::min)(1.f, progress));
	const auto level = player->GetLevel();

	char buf[160];
	std::snprintf(
		buf,
		sizeof(buf),
		"{\"level\":%u,\"xp\":%.4f,\"threshold\":%.4f,\"progress\":%.6f}",
		static_cast<unsigned>(level),
		static_cast<double>(xp),
		static_cast<double>(threshold),
		static_cast<double>(progress));
	gate.SendIfChanged(buf);
}
