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

	std::string BuildIconColorRamp(RE::StaticFunctionTag*, std::string rgbLinesJoined)
	{
		return CogIWant::BuildIconColorRamp(std::move(rgbLinesJoined));
	}

	std::string BuildIconAssetRamp(RE::StaticFunctionTag*, std::string cogPathsJoined)
	{
		return CogIWant::BuildIconAssetRamp(std::move(cogPathsJoined));
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
	vm->RegisterFunction("BuildIconColorRamp", "COG_iWant", BuildIconColorRamp);
	vm->RegisterFunction("BuildIconAssetRamp", "COG_iWant", BuildIconAssetRamp);
	return true;
}
