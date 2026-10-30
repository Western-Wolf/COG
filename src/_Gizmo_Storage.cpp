#include "pch.h"
#include "_Gizmo_Storage.h"
#include "_Core_Registry_Json.h"

#include <filesystem>

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

	std::string ResolvedTypeId(std::string_view typeId)
	{
		auto trimmed = TrimCopy(typeId);
		if (trimmed.empty()) {
			return {};
		}
		return CogRegistryJson::NormalizeGizmoType(std::move(trimmed));
	}
}

std::filesystem::path CogGizmoStorage::DataRoot()
{
	return std::filesystem::current_path() / "Data" / "SKSE" / "Plugins" / "COG";
}

std::string CogGizmoStorage::Relative(std::string_view typeId)
{
	const auto id = ResolvedTypeId(typeId);
	if (id.empty()) {
		return {};
	}
	return std::string("gizmoTypes/") + id;
}

std::filesystem::path CogGizmoStorage::EnsureDir(std::string_view typeId)
{
	const auto id = ResolvedTypeId(typeId);
	if (id.empty()) {
		return {};
	}
	const auto dir = DataRoot() / "gizmoTypes" / id;
	std::error_code ec;
	std::filesystem::create_directories(dir, ec);
	if (ec) {
		logger::warn("COG: could not create gizmo storage {}: {}", dir.string(), ec.message());
	}
	return dir;
}
