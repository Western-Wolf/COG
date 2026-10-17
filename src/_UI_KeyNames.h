#pragma once

#include <cstdint>
#include <string>
#include <string_view>

namespace CogKeys
{
	inline constexpr const char* kDefaultEditorKey = "F3";
	inline constexpr std::uint32_t kDefaultEditorScan = 0x3D;

	std::string NormalizeKeyName(std::string_view raw);
	std::uint32_t ScanCodeFromName(std::string_view name);
	std::string NameFromScanCode(std::uint32_t scan);
}
