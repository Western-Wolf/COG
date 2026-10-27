#include "pch.h"
#include "_Gizmo_Feed_Log.h"

#include <spdlog/sinks/basic_file_sink.h>

namespace
{
	std::shared_ptr<spdlog::logger> g_feedLog;
}

void CogFeedLog::Init()
{
	if (g_feedLog) {
		return;
	}
	try {
		auto dir = SKSE::log::log_directory();
		if (!dir) {
			return;
		}
		const auto path = *dir / "COG_Feed.log";
		auto sink = std::make_shared<spdlog::sinks::basic_file_sink_mt>(path.string(), true);
		g_feedLog = std::make_shared<spdlog::logger>("COG_Feed", std::move(sink));
		g_feedLog->set_level(spdlog::level::trace);
		g_feedLog->flush_on(spdlog::level::trace);
		spdlog::register_logger(g_feedLog);
		g_feedLog->info("COG_Feed log started → {}", path.string());
	} catch (const std::exception& e) {
		logger::error("COG_Feed.log init failed: {}", e.what());
	}
}

std::shared_ptr<spdlog::logger> CogFeedLog::Get()
{
	return g_feedLog;
}
