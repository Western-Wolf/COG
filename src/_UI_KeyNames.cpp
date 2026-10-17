#include "pch.h"
#include "_UI_KeyNames.h"

#include <cctype>

namespace
{
	struct KeyEntry
	{
		const char* name;
		std::uint32_t scan;
	};

	constexpr KeyEntry kKeys[] = {
		{ "Esc", 0x01 },
		{ "1", 0x02 },
		{ "2", 0x03 },
		{ "3", 0x04 },
		{ "4", 0x05 },
		{ "5", 0x06 },
		{ "6", 0x07 },
		{ "7", 0x08 },
		{ "8", 0x09 },
		{ "9", 0x0A },
		{ "0", 0x0B },
		{ "-", 0x0C },
		{ "=", 0x0D },
		{ "Backspace", 0x0E },
		{ "Tab", 0x0F },
		{ "Q", 0x10 },
		{ "W", 0x11 },
		{ "E", 0x12 },
		{ "R", 0x13 },
		{ "T", 0x14 },
		{ "Y", 0x15 },
		{ "U", 0x16 },
		{ "I", 0x17 },
		{ "O", 0x18 },
		{ "P", 0x19 },
		{ "[", 0x1A },
		{ "]", 0x1B },
		{ "Enter", 0x1C },
		{ "A", 0x1E },
		{ "S", 0x1F },
		{ "D", 0x20 },
		{ "F", 0x21 },
		{ "G", 0x22 },
		{ "H", 0x23 },
		{ "J", 0x24 },
		{ "K", 0x25 },
		{ "L", 0x26 },
		{ ";", 0x27 },
		{ "'", 0x28 },
		{ "`", 0x29 },
		{ "\\", 0x2B },
		{ "Z", 0x2C },
		{ "X", 0x2D },
		{ "C", 0x2E },
		{ "V", 0x2F },
		{ "B", 0x30 },
		{ "N", 0x31 },
		{ "M", 0x32 },
		{ ",", 0x33 },
		{ ".", 0x34 },
		{ "/", 0x35 },
		{ "Space", 0x39 },
		{ "Num*", 0x37 },
		{ "F1", 0x3B },
		{ "F2", 0x3C },
		{ "F3", 0x3D },
		{ "F4", 0x3E },
		{ "F5", 0x3F },
		{ "F6", 0x40 },
		{ "F7", 0x41 },
		{ "F8", 0x42 },
		{ "F9", 0x43 },
		{ "F10", 0x44 },
		{ "NumLock", 0x45 },
		{ "ScrollLock", 0x46 },
		{ "Num7", 0x47 },
		{ "Num8", 0x48 },
		{ "Num9", 0x49 },
		{ "Num-", 0x4A },
		{ "Num4", 0x4B },
		{ "Num5", 0x4C },
		{ "Num6", 0x4D },
		{ "Num+", 0x4E },
		{ "Num1", 0x4F },
		{ "Num2", 0x50 },
		{ "Num3", 0x51 },
		{ "Num0", 0x52 },
		{ "Num.", 0x53 },
		{ "F11", 0x57 },
		{ "F12", 0x58 },
		{ "NumEnter", 0x9C },
		{ "Num/", 0xB5 },
		{ "Home", 0xC7 },
		{ "Up", 0xC8 },
		{ "PageUp", 0xC9 },
		{ "Left", 0xCB },
		{ "Right", 0xCD },
		{ "End", 0xCF },
		{ "Down", 0xD0 },
		{ "PageDown", 0xD1 },
		{ "Insert", 0xD2 },
		{ "Delete", 0xD3 },
	};

	std::string LowerCopy(std::string_view s)
	{
		std::string out;
		out.reserve(s.size());
		for (unsigned char c : s) {
			if (!std::isspace(c)) {
				out += static_cast<char>(std::tolower(c));
			}
		}
		return out;
	}

	std::string StripPrefix(std::string lower)
	{
		if (lower.rfind("dik_", 0) == 0) {
			return lower.substr(4);
		}
		if (lower.rfind("key_", 0) == 0) {
			return lower.substr(4);
		}
		return lower;
	}
}

namespace CogKeys
{
	std::string NormalizeKeyName(std::string_view raw)
	{
		auto lower = StripPrefix(LowerCopy(raw));
		if (lower == "escape") {
			lower = "esc";
		}
		if (lower == "return") {
			lower = "enter";
		}
		if (lower == "spacebar" || lower == "space") {
			return "Space";
		}
		if (lower == "pgup") {
			lower = "pageup";
		}
		if (lower == "pgdn" || lower == "pgdown") {
			lower = "pagedown";
		}
		if (lower == "ins") {
			lower = "insert";
		}
		if (lower == "del") {
			lower = "delete";
		}
		for (const auto& entry : kKeys) {
			if (LowerCopy(entry.name) == lower) {
				return entry.name;
			}
		}
		return {};
	}

	std::uint32_t ScanCodeFromName(std::string_view name)
	{
		const auto canonical = NormalizeKeyName(name);
		if (canonical.empty()) {
			return 0;
		}
		for (const auto& entry : kKeys) {
			if (entry.name == canonical) {
				return entry.scan;
			}
		}
		return 0;
	}

	std::string NameFromScanCode(std::uint32_t scan)
	{
		for (const auto& entry : kKeys) {
			if (entry.scan == scan) {
				return entry.name;
			}
		}
		return {};
	}
}
