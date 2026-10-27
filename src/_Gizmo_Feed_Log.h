#pragma once

#include <memory>
#include <string_view>

#include <spdlog/spdlog.h>

namespace CogFeedLog
{
	/** Create SKSE log-dir/COG_Feed.log sink (call once at plugin load). */
	void Init();

	[[nodiscard]] std::shared_ptr<spdlog::logger> Get();

	template <typename... Args>
	void trace(spdlog::format_string_t<Args...> fmt, Args&&... args)
	{
		if (auto log = Get()) {
			log->trace(fmt, std::forward<Args>(args)...);
		}
	}

	template <typename... Args>
	void debug(spdlog::format_string_t<Args...> fmt, Args&&... args)
	{
		if (auto log = Get()) {
			log->debug(fmt, std::forward<Args>(args)...);
		}
	}

	template <typename... Args>
	void info(spdlog::format_string_t<Args...> fmt, Args&&... args)
	{
		if (auto log = Get()) {
			log->info(fmt, std::forward<Args>(args)...);
		}
	}

	template <typename... Args>
	void warn(spdlog::format_string_t<Args...> fmt, Args&&... args)
	{
		if (auto log = Get()) {
			log->warn(fmt, std::forward<Args>(args)...);
		}
	}

	template <typename... Args>
	void error(spdlog::format_string_t<Args...> fmt, Args&&... args)
	{
		if (auto log = Get()) {
			log->error(fmt, std::forward<Args>(args)...);
		}
	}

	template <typename... Args>
	void critical(spdlog::format_string_t<Args...> fmt, Args&&... args)
	{
		if (auto log = Get()) {
			log->critical(fmt, std::forward<Args>(args)...);
		}
	}
}
