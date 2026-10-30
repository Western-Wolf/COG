#include "pch.h"
#include "_API_Gizmos.h"
#include "_API_Core.h"
#include "_Core_Registry.h"
#include "_Gizmo_Storage.h"

namespace
{
	std::int32_t RegisterGizmo(
		RE::StaticFunctionTag*,
		std::string sourceMod,
		std::string typeId,
		std::string displayName,
		std::string galleryIcon,
		float defaultWidth,
		float defaultHeight,
		std::string viewScript,
		std::string settingsSchemaJson,
		std::string defaultVisibility)
	{
		const std::string modKey = sourceMod;
		const auto receipt = CogRegistry::Get().RegisterGizmo(
			std::move(sourceMod),
			std::move(typeId),
			std::move(displayName),
			std::move(galleryIcon),
			defaultWidth,
			defaultHeight,
			std::move(viewScript),
			std::move(settingsSchemaJson),
			std::move(defaultVisibility));
		if (receipt != 0) {
			CogRegistry::Get().MarkLayoutDirty();
			// Inside BeginRegister…EndRegister: defer Push; EndRegister or next natural PushToUi commits.
			if (!CogRegistry::Get().IsRegisterBatchOpen(modKey)) {
				CogRegistry::Get().PushToUi();
			}
		}
		return receipt;
	}

	void UpdateGizmo(RE::StaticFunctionTag*, std::int32_t receipt, std::string payloadJson)
	{
		CogRegistry::Get().UpdateGizmoPayload(receipt, std::move(payloadJson));
	}

	/** Relative path under SKSE/Plugins/COG (e.g. "gizmoTypes/cog-feed"); creates the folder. */
	std::string GizmoStorage(RE::StaticFunctionTag*, std::string typeId)
	{
		CogGizmoStorage::EnsureDir(typeId);
		return CogGizmoStorage::Relative(typeId);
	}
}

bool CogApiGizmos::Bind(RE::BSScript::IVirtualMachine* vm)
{
	if (!vm) {
		return false;
	}
	vm->RegisterFunction("RegisterGizmo", "COG_API", RegisterGizmo);
	vm->RegisterFunction("UpdateGizmo", "COG_API", UpdateGizmo);
	vm->RegisterFunction("GizmoStorage", "COG_API", GizmoStorage);
	return true;
}
