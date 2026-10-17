#pragma once

namespace RE::BSScript
{
	class IVirtualMachine;
}

namespace CogUiCallbackIntercept
{
	// Replaces SKSE UICallback natives so Send can filter SkyUILib notification
	// paths and divert them into the COG feed when notifications are visible.
	bool Bind(RE::BSScript::IVirtualMachine* vm);
}
