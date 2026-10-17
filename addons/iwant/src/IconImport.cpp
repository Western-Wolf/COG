#include "pch.h"
#include "IconImport.h"
#include "LibraryMap.h"

#include <algorithm>
#include <cctype>
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

	std::string SanitizeToken(std::string_view in)
	{
		std::string out;
		out.reserve(in.size());
		for (unsigned char c : in) {
			if (std::isalnum(c) || c == '-' || c == '_' || c == '.') {
				out.push_back(static_cast<char>(c));
			} else if (c == ' ') {
				out.push_back('_');
			} else {
				out.push_back('_');
			}
		}
		if (out.empty()) {
			out = "_";
		}
		return out;
	}

	std::string JsonEscape(std::string_view in)
	{
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
				out.push_back(static_cast<char>(c));
				break;
			}
		}
		return out;
	}

	struct PackFrame
	{
		std::string path;
		double min = 0;
		double max = 100;
	};
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

	std::string WriteIconPack(
		std::string sourceMod,
		std::string iconName,
		std::string cogPathsJoined)
	{
		if (!g_ready) {
			logger::warn("COG_iWant WriteIconPack failed: called before data ready");
			return {};
		}
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
			logger::warn("COG_iWant WriteIconPack failed: no paths (mod='{}' icon='{}')", sourceMod, iconName);
			return {};
		}

		const std::size_t n = paths.size();
		const double denom = static_cast<double>(n > 1 ? n - 1 : 1);
		std::vector<PackFrame> bands;
		bands.reserve(n);
		for (std::size_t i = 0; i < n; ++i) {
			const double lo = (static_cast<double>(i) * 100.0) / denom;
			const double hi = i + 1 < n ? (static_cast<double>(i + 1) * 100.0) / denom : 100.0;
			bands.push_back(PackFrame{ paths[i], lo, hi });
		}

		std::vector<PackFrame> collapsed;
		collapsed.reserve(bands.size());
		for (const auto& band : bands) {
			if (!collapsed.empty() && collapsed.back().path == band.path) {
				collapsed.back().max = band.max;
			} else {
				collapsed.push_back(band);
			}
		}

		const auto modTok = SanitizeToken(sourceMod);
		const auto nameTok = SanitizeToken(iconName);
		const auto rel = modTok + "/" + nameTok + ".json";
		const auto abs =
			DataRoot() / "PrismaUI" / "views" / "COG" / "assets" / "imports" / "icons" / modTok /
			(nameTok + ".json");

		std::error_code ec;
		std::filesystem::create_directories(abs.parent_path(), ec);
		{
			std::ofstream out(abs, std::ios::binary | std::ios::trunc);
			if (!out) {
				logger::warn("COG_iWant WriteIconPack failed: open {} (mod='{}' icon='{}')", abs.string(), sourceMod, iconName);
				return {};
			}
			out << "{\n\t\"icons\": [\n";
			for (std::size_t i = 0; i < collapsed.size(); ++i) {
				const auto& f = collapsed[i];
				out << "\t\t{ \"path\": \"" << JsonEscape(f.path) << "\", \"min\": " << f.min
					<< ", \"max\": " << f.max << " }";
				if (i + 1 < collapsed.size()) {
					out << ",";
				}
				out << "\n";
			}
			out << "\t]\n}\n";
		}

		logger::info(
			"COG_iWant WriteIconPack -> {} ({} states -> {} bands, mod='{}' icon='{}')",
			rel,
			n,
			collapsed.size(),
			sourceMod,
			iconName);
		return rel;
	}
}
