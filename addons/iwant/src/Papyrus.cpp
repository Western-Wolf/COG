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
}

bool CogIWantPapyrus::Bind(RE::BSScript::IVirtualMachine* vm)
{
	if (!vm) {
		return false;
	}
	vm->RegisterFunction("MapWidgetsLibraryIcon", "COG_iWant", MapWidgetsLibraryIcon);
	vm->RegisterFunction("ResolveExportedIconPath", "COG_iWant", ResolveExportedIconPath);
	vm->RegisterFunction("IsReady", "COG_iWant", IsReady);
	return true;
}
