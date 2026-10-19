#include "pch.h"
#include "_Core_Translations.h"
#include "_Core_Json.h"
#include "_Core_Registry_Json.h"

#include <algorithm>
#include <cctype>
#include <filesystem>
#include <fstream>
#include <sstream>
#include <unordered_set>
#include <vector>

namespace
{
	std::string TrimCopy(std::string_view raw)
	{
		std::size_t begin = 0;
		while (begin < raw.size() &&
			   (raw[begin] == ' ' || raw[begin] == '\t' || raw[begin] == '\r' || raw[begin] == '\n')) {
			++begin;
		}
		std::size_t end = raw.size();
		while (end > begin &&
			   (raw[end - 1] == ' ' || raw[end - 1] == '\t' || raw[end - 1] == '\r' || raw[end - 1] == '\n')) {
			--end;
		}
		return std::string(raw.substr(begin, end - begin));
	}

	std::string ReadAll(const std::filesystem::path& path)
	{
		std::ifstream in(path, std::ios::binary);
		if (!in) {
			return {};
		}
		std::ostringstream ss;
		ss << in.rdbuf();
		return ss.str();
	}

	std::vector<std::filesystem::path> ListJsonFilesSorted(const std::filesystem::path& dir)
	{
		std::vector<std::filesystem::path> files;
		std::error_code ec;
		if (!std::filesystem::is_directory(dir, ec)) {
			return files;
		}
		for (const auto& entry : std::filesystem::directory_iterator(dir, ec)) {
			if (ec) {
				break;
			}
			if (!entry.is_regular_file(ec) || entry.path().extension() != ".json") {
				continue;
			}
			files.push_back(entry.path());
		}
		std::sort(files.begin(), files.end(), [](const std::filesystem::path& a, const std::filesystem::path& b) {
			return a.filename().string() < b.filename().string();
		});
		return files;
	}
}

void CogTranslations::MergeFile(Catalog& into, const std::filesystem::path& path)
{
	const auto text = ReadAll(path);
	if (text.empty()) {
		return;
	}
	CogJson::Value root;
	std::string err;
	if (!CogJson::Parse(text, root, err) || !root.IsObject()) {
		logger::error(
			"COG: failed to parse translation file {}: {}",
			path.string(),
			err.empty() ? "root is not an object" : err);
		return;
	}
	for (const auto& [tag, langsVal] : root.objectValue) {
		if (tag.empty() || !langsVal.IsObject()) {
			continue;
		}
		auto& langs = into[tag];
		for (const auto& [lang, textVal] : langsVal.objectValue) {
			const auto code = TrimCopy(lang);
			if (code.empty() || !textVal.IsString()) {
				continue;
			}
			langs[code] = textVal.stringValue;
		}
	}
}

void CogTranslations::LoadDir(Catalog& into, const std::filesystem::path& dir)
{
	for (const auto& file : ListJsonFilesSorted(dir)) {
		MergeFile(into, file);
	}
}

void CogTranslations::CollectLanguages(const Catalog& catalog, std::vector<std::string>& into)
{
	std::unordered_set<std::string> seen(into.begin(), into.end());
	for (const auto& [tag, langs] : catalog) {
		(void)tag;
		for (const auto& [lang, text] : langs) {
			(void)text;
			const auto code = TrimCopy(lang);
			if (code.empty() || seen.contains(code)) {
				continue;
			}
			seen.insert(code);
			into.push_back(code);
		}
	}
}

std::string CogTranslations::CatalogToJson(const Catalog& catalog)
{
	std::vector<std::string> tags;
	tags.reserve(catalog.size());
	for (const auto& [tag, langs] : catalog) {
		(void)langs;
		tags.push_back(tag);
	}
	std::sort(tags.begin(), tags.end());
	std::ostringstream o;
	o << "{";
	bool firstTag = true;
	for (const auto& tag : tags) {
		const auto it = catalog.find(tag);
		if (it == catalog.end()) {
			continue;
		}
		std::vector<std::string> langs;
		langs.reserve(it->second.size());
		for (const auto& [lang, text] : it->second) {
			(void)text;
			langs.push_back(lang);
		}
		std::sort(langs.begin(), langs.end());
		if (!firstTag) {
			o << ",";
		}
		firstTag = false;
		o << "\"" << CogRegistryJson::EscapeJson(tag) << "\":{";
		bool firstLang = true;
		for (const auto& lang : langs) {
			const auto lit = it->second.find(lang);
			if (lit == it->second.end()) {
				continue;
			}
			if (!firstLang) {
				o << ",";
			}
			firstLang = false;
			o << "\"" << CogRegistryJson::EscapeJson(lang) << "\":\"" << CogRegistryJson::EscapeJson(lit->second)
			  << "\"";
		}
		o << "}";
	}
	o << "}";
	return o.str();
}

std::string CogTranslations::GizmoCatalogsToJson(const std::unordered_map<std::string, Catalog>& byType)
{
	std::vector<std::string> typeIds;
	typeIds.reserve(byType.size());
	for (const auto& [typeId, cat] : byType) {
		(void)cat;
		typeIds.push_back(typeId);
	}
	std::sort(typeIds.begin(), typeIds.end());
	std::ostringstream o;
	o << "{";
	bool first = true;
	for (const auto& typeId : typeIds) {
		const auto it = byType.find(typeId);
		if (it == byType.end() || it->second.empty()) {
			continue;
		}
		if (!first) {
			o << ",";
		}
		first = false;
		o << "\"" << CogRegistryJson::EscapeJson(typeId) << "\":" << CatalogToJson(it->second);
	}
	o << "}";
	return o.str();
}
