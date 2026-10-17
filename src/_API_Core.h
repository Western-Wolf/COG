#pragma once

#include <string>

namespace RE
{
	using VMStackID = std::uint32_t;
	namespace BSScript
	{
		class IVirtualMachine;
	}
}

namespace CogCaller
{
	// Walk the Papyrus stack past COG_API and known bridge stubs (e.g. iWant Status Bars);
	// return owning plugin of the real caller form, or empty.
	[[nodiscard]] std::string SniffCallerPlugin(RE::BSScript::IVirtualMachine* vm, RE::VMStackID stackID);

	/** True for plugins that proxy Register for other mods (must not own their senders). */
	[[nodiscard]] bool IsBridgeProxyPlugin(std::string_view pluginFile);

	[[nodiscard]] bool IsPluginLoaded(std::string_view pluginFile);
}

namespace CogApi
{
	// Bind all COG Papyrus API modules (gears, gizmos, notifications).
	bool Bind(RE::BSScript::IVirtualMachine* vm);
}
