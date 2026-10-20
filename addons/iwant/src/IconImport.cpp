#include "pch.h"
#include "IconImport.h"
#include "LibraryMap.h"

#include <algorithm>
#include <cctype>
#include <cstdio>
#include <filesystem>
#include <fstream>
#include <sstream>
#include <vector>

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

	std::string BuildIconColorRamp(std::string rgbLinesJoined)
	{
		struct Rgb
		{
			int r = 255;
			int g = 255;
			int b = 255;
		};
		std::vector<Rgb> colors;
		{
			std::stringstream ss(rgbLinesJoined);
			std::string line;
			while (std::getline(ss, line)) {
				while (!line.empty() && (line.back() == '\r' || line.back() == ' ' || line.back() == '\t')) {
					line.pop_back();
				}
				if (line.empty()) {
					continue;
				}
				int r = 255;
				int g = 255;
				int b = 255;
				std::replace(line.begin(), line.end(), ',', ' ');
				std::istringstream ls(line);
				if (!(ls >> r >> g >> b)) {
					continue;
				}
				r = std::clamp(r, 0, 255);
				g = std::clamp(g, 0, 255);
				b = std::clamp(b, 0, 255);
				colors.push_back(Rgb{ r, g, b });
			}
		}
		if (colors.empty()) {
			return {};
		}
		auto toHex = [](const Rgb& c) {
			char buf[8];
			std::snprintf(buf, sizeof(buf), "#%02x%02x%02x", c.r, c.g, c.b);
			return std::string(buf);
		};
		const auto first = toHex(colors.front());
		bool allSame = true;
		for (const auto& c : colors) {
			if (toHex(c) != first) {
				allSame = false;
				break;
			}
		}
		if (allSame) {
			return first;
		}
		const std::size_t n = colors.size();
		const double denom = static_cast<double>(n > 1 ? n - 1 : 1);
		std::ostringstream o;
		o << "[";
		for (std::size_t i = 0; i < n; ++i) {
			if (i) {
				o << ",";
			}
			// Match iWant_Status_Bars._statusToPercent
			const double pct = 0.1 + static_cast<double>(i) * (99.9 / denom);
			o << "{\"pct\":" << pct << ",\"color\":\"" << toHex(colors[i]) << "\"}";
		}
		o << "]";
		return o.str();
	}

	std::string BuildIconAssetRamp(std::string cogPathsJoined)
	{
		std::vector<std::string> paths;
		{
			std::stringstream ss(cogPathsJoined);
			std::string line;
			while (std::getline(ss, line)) {
				while (!line.empty() && (line.back() == '\r' || line.back() == ' ' || line.back() == '\t')) {
					line.pop_back();
				}
				while (!line.empty() && (line.front() == ' ' || line.front() == '\t')) {
					line.erase(line.begin());
				}
				std::replace(line.begin(), line.end(), '\\', '/');
				if (!line.empty()) {
					paths.push_back(std::move(line));
				}
			}
		}
		if (paths.empty()) {
			return {};
		}
		const std::size_t n = paths.size();
		const double denom = static_cast<double>(n > 1 ? n - 1 : 1);
		struct Stop
		{
			std::string path;
			double pct = 0;
		};
		std::vector<Stop> collapsed;
		collapsed.reserve(n);
		for (std::size_t i = 0; i < n; ++i) {
			const double pct = 0.1 + static_cast<double>(i) * (99.9 / denom);
			if (!collapsed.empty() && collapsed.back().path == paths[i]) {
				continue;
			}
			collapsed.push_back(Stop{ paths[i], pct });
		}
		if (collapsed.size() <= 1) {
			return collapsed.empty() ? paths.front() : collapsed.front().path;
		}
		auto jsonEscape = [](std::string_view in) {
			std::string out;
			out.reserve(in.size() + 8);
			for (unsigned char c : in) {
				switch (c) {
				case '\\':
					out += "\\\\";
					break;
				case '"':
					out += "\\\"";
					break;
				default:
					out.push_back(static_cast<char>(c));
					break;
				}
			}
			return out;
		};
		std::ostringstream o;
		o << "[";
		for (std::size_t i = 0; i < collapsed.size(); ++i) {
			if (i) {
				o << ",";
			}
			o << "{\"pct\":" << collapsed[i].pct << ",\"path\":\"" << jsonEscape(collapsed[i].path) << "\"}";
		}
		o << "]";
		return o.str();
	}
}
