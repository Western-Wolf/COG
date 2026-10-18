#include "pch.h"
#include "Papyrus.h"
#include "IconImport.h"

namespace
{
	std::string MapWidgetsLibraryIcon(RE::StaticFunctionTag*, std::string exportedRelPath)
	{
		return CogIWant::MapWidgetsLibraryIcon(std::move(exportedRelPath));
	}

	std::string ResolveExportedIconPath(RE::StaticFunctionTag*, std::string exportedRelPath)
	{
		return CogIWant::ResolveExportedIconPath(std::move(exportedRelPath));
	}

	bool IsReady(RE::StaticFunctionTag*)
	{
		return CogIWant::IsReady();
	}

	std::string WriteIconPack(
		RE::StaticFunctionTag*,
		std::string sourceMod,
		std::string iconName,
		std::string cogPathsJoined)
	{
		return CogIWant::WriteIconPack(
			std::move(sourceMod),
			std::move(iconName),
			std::move(cogPathsJoined));
	}

	std::string BuildIconColorRamp(RE::StaticFunctionTag*, std::string rgbLinesJoined)
	{
		return CogIWant::BuildIconColorRamp(std::move(rgbLinesJoined));
	}
}

bool CogIWantPapyrus::Bind(RE::BSScript::IVirtualMachine* vm)
{
	if (!vm) {
		return false;
	}
	vm->RegisterFunction("MapWidgetsLibraryIcon", "COG_iWant", MapWidgetsLibraryIcon);
	vm->RegisterFunction("ResolveExportedIconPath", "COG_iWant", ResolveExportedIconPath);
	vm->RegisterFunction("IsReady", "COG_iWant", IsReady);
	vm->RegisterFunction("WriteIconPack", "COG_iWant", WriteIconPack);
	vm->RegisterFunction("BuildIconColorRamp", "COG_iWant", BuildIconColorRamp);
	return true;
}
