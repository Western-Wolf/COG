#include "pch.h"
#include "IconImport.h"
#include "LibraryMap.h"

#include <algorithm>
#include <cctype>
#include <filesystem>
#include <fstream>

#ifndef WIN32_LEAN_AND_MEAN
#	define WIN32_LEAN_AND_MEAN
#endif
#include <Windows.h>

namespace
{
	bool g_ready = false;

	std::filesystem::path DataRoot()
	{
		return std::filesystem::current_path() / "Data";
	}

	std::filesystem::path PreferSibling(const std::filesystem::path& requested)
	{
		static constexpr const char* kPrefer[] = { ".gif", ".png", ".webp" };
		const auto stem = requested.parent_path() / requested.stem();
		for (const char* ext : kPrefer) {
			auto cand = stem;
			cand += ext;
			std::error_code ec;
			if (std::filesystem::is_regular_file(cand, ec) && !ec) {
				return cand;
			}
			std::ifstream in(cand, std::ios::binary);
			if (in) {
				return cand;
			}
		}
		return requested;
	}

	std::string ToDataRelative(const std::filesystem::path& absolute, const std::filesystem::path& dataRoot)
	{
		// Use lexically_relative — NOT filesystem::relative. The latter weakly_canonicalizes,
		// and under MO2 that resolves Data\… to mods\SomeMod\…, producing ../../mods/… escapes
		// that COG_API.ImportIcon correctly rejects.
		const auto rel = absolute.lexically_relative(dataRoot);
		if (rel.empty() || *rel.begin() == "..") {
			return {};
		}
		return rel.generic_string();
	}
}

namespace CogIWant
{
	void MarkReady()
	{
		g_ready = true;
	}

	bool IsReady()
	{
		return g_ready;
	}

	std::string MapWidgetsLibraryIcon(std::string exportedRelPath)
	{
		std::replace(exportedRelPath.begin(), exportedRelPath.end(), '\\', '/');
		constexpr std::string_view kPrefix = "Interface/exported/";
		if (exportedRelPath.size() > kPrefix.size()) {
			std::string lower = exportedRelPath;
			std::transform(lower.begin(), lower.end(), lower.begin(), [](unsigned char c) {
				return static_cast<char>(std::tolower(c));
			});
			if (lower.rfind("interface/exported/", 0) == 0) {
				exportedRelPath = exportedRelPath.substr(kPrefix.size());
			}
		}
		return LibraryMap::MapWidgetsLibraryIcon(exportedRelPath);
	}

	std::string ResolveExportedIconPath(std::string exportedRelPath)
	{
		if (!g_ready) {
			logger::warn("COG_iWant ResolveExportedIconPath failed: called before data ready");
			return {};
		}
		if (exportedRelPath.empty()) {
			logger::warn("COG_iWant ResolveExportedIconPath failed: empty path");
			return {};
		}

		std::replace(exportedRelPath.begin(), exportedRelPath.end(), '\\', '/');
		constexpr std::string_view kPrefix = "Interface/exported/";
		if (exportedRelPath.size() > kPrefix.size()) {
			std::string lower = exportedRelPath;
			std::transform(lower.begin(), lower.end(), lower.begin(), [](unsigned char c) {
				return static_cast<char>(std::tolower(c));
			});
			if (lower.rfind("interface/exported/", 0) == 0) {
				exportedRelPath = exportedRelPath.substr(kPrefix.size());
			}
		}

		const auto data = DataRoot();
		std::filesystem::path requested = data / "Interface" / "exported";
		for (auto part : std::filesystem::path(exportedRelPath)) {
			requested /= part;
		}

		std::error_code ec;
		bool present = std::filesystem::is_regular_file(requested, ec) && !ec;
		if (!present) {
			// MO2/USVFS: directory_entry probes can miss files that still open for read.
			std::ifstream in(requested, std::ios::binary);
			present = static_cast<bool>(in);
		}
		if (!present) {
			const DWORD attr = GetFileAttributesW(requested.c_str());
			present = attr != INVALID_FILE_ATTRIBUTES && (attr & FILE_ATTRIBUTE_DIRECTORY) == 0;
		}
		if (!present) {
			logger::warn(
				"COG_iWant ResolveExportedIconPath failed: missing source {} (cwd='{}')",
				requested.string(),
				std::filesystem::current_path().string());
			return {};
		}

		const auto chosen = PreferSibling(requested);
		std::string dataRel = ToDataRelative(chosen, data);
		if (dataRel.empty()) {
			logger::warn(
				"COG_iWant ResolveExportedIconPath failed: could not relativize {}",
				chosen.string());
			return {};
		}
		std::replace(dataRel.begin(), dataRel.end(), '\\', '/');
		return dataRel;
	}
}
