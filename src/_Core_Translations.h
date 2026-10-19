#pragma once

#include <filesystem>
#include <string>
#include <string_view>
#include <unordered_map>
#include <vector>

/** Editor translation catalogs: tag → lang → string (BCP 47 langs). */
namespace CogTranslations
{
	using LangMap = std::unordered_map<std::string, std::string>;
	using Catalog = std::unordered_map<std::string, LangMap>;

	/** Merge one JSON file into catalog (last-wins per tag/lang). */
	void MergeFile(Catalog& into, const std::filesystem::path& path);

	/** Load all *.json in dir A→Z by filename; last-wins. */
	void LoadDir(Catalog& into, const std::filesystem::path& dir);

	/** Collect distinct language codes present in catalog. */
	void CollectLanguages(const Catalog& catalog, std::vector<std::string>& into);

	/** Compact JSON object for UiPush. */
	std::string CatalogToJson(const Catalog& catalog);

	/** Compact JSON object keyed by typeId → catalog. */
	std::string GizmoCatalogsToJson(const std::unordered_map<std::string, Catalog>& byType);
}
