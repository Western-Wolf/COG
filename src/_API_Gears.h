#pragma once

namespace RE::BSScript
{
	class IVirtualMachine;
}

namespace CogApiGears
{
	bool Bind(RE::BSScript::IVirtualMachine* vm);
}
