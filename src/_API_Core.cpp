#include "pch.h"
#include "_API_Core.h"
#include "_API_Gears.h"
#include "_API_GizmoFeed_Notifications.h"
#include "_API_Gizmos.h"
#include "_Gizmo_Feed_API.h"
#include "_Core_Registry.h"

#include "RE/S/Stack.h"
#include "RE/S/StackFrame.h"
#include "RE/V/VirtualMachine.h"

#ifdef GetObject
#	undef GetObject
#endif

namespace
{
	std::string LowerCopy(std::string s)
	{
		std::transform(s.begin(), s.end(), s.begin(), [](unsigned char c) {
			return static_cast<char>(std::tolower(c));
		});
		return s;
	}

	bool IsCogApiFrame(const RE::BSScript::StackFrame* frame)
	{
		if (!frame || !frame->owningObjectType) {
			return false;
		}
		const auto name = LowerCopy(std::string{ frame->owningObjectType->GetName() });
		return name == "cog_api";
	}

	bool IsBridgeScriptFrame(const RE::BSScript::StackFrame* frame)
	{
		if (!frame || !frame->owningObjectType) {
			return false;
		}
		const auto name = LowerCopy(std::string{ frame->owningObjectType->GetName() });
		// COG iWant Status Bars stub (+ alias) — proxies loadIcon → COG_API for consumer addons.
		return name == "iwant_status_bars" || name == "iwant_status_bars_alias";
	}

	RE::TESForm* FormFromSelf(const RE::BSScript::Variable& self)
	{
		if (!self.IsObject()) {
			return nullptr;
		}
		const auto obj = self.GetObject();
		if (!obj) {
			return nullptr;
		}
		if (auto* form = static_cast<RE::TESForm*>(obj->Resolve(static_cast<RE::VMTypeID>(RE::FormType::Quest)))) {
			return form;
		}
		if (auto* vm = RE::BSScript::Internal::VirtualMachine::GetSingleton()) {
			if (auto* policy = vm->GetObjectHandlePolicy()) {
				const auto handle = obj->GetHandle();
				if (auto* form = policy->GetObjectForHandle(RE::FormType::None, handle)) {
					return form;
				}
				if (auto* form = policy->GetObjectForHandle(RE::FormType::Quest, handle)) {
					return form;
				}
			}
		}
		return nullptr;
	}

	bool IsReady(RE::StaticFunctionTag*)
	{
		return true;
	}

	bool IsPluginLoaded(RE::StaticFunctionTag*, std::string pluginFile)
	{
		return CogCaller::IsPluginLoaded(pluginFile);
	}

	void SetUiHidden(RE::StaticFunctionTag*, bool hidden)
	{
		CogRegistry::Get().SetUiHidden(hidden);
	}

	bool IsUiHidden(RE::StaticFunctionTag*)
	{
		return CogRegistry::Get().IsUiHidden();
	}

	void ToggleUiHidden(RE::StaticFunctionTag*)
	{
		CogRegistry::Get().ToggleUiHidden();
	}
}

bool CogCaller::IsBridgeProxyPlugin(std::string_view pluginFile)
{
	if (pluginFile.empty()) {
		return false;
	}
	return LowerCopy(std::string{ pluginFile }) == "iwant status bars.esp";
}

std::string CogCaller::SniffCallerPlugin(RE::BSScript::IVirtualMachine*, RE::VMStackID stackID)
{
	auto* vm = RE::BSScript::Internal::VirtualMachine::GetSingleton();
	if (!vm) {
		return {};
	}
	RE::BSScript::Stack* stack = nullptr;
	if (!vm->GetStackByID(stackID, &stack) || !stack) {
		return {};
	}
	// Prefer the first non-bridge caller (consumer addon). Do not fall back to the bridge
	// plugin — that would pin gears to Status Bars.esp and block prune when only the
	// consumer is removed.
	for (auto* frame = stack->top; frame; frame = frame->previousFrame) {
		if (IsCogApiFrame(frame) || IsBridgeScriptFrame(frame)) {
			continue;
		}
		auto* form = FormFromSelf(frame->self);
		if (!form) {
			continue;
		}
		if (auto* file = form->GetFile(0)) {
			const auto name = std::string{ file->GetFilename() };
			if (name.empty() || IsBridgeProxyPlugin(name)) {
				continue;
			}
			return name;
		}
	}
	return {};
}

bool CogCaller::IsPluginLoaded(std::string_view pluginFile)
{
	if (pluginFile.empty()) {
		return false;
	}
	auto* data = RE::TESDataHandler::GetSingleton();
	if (!data) {
		return false;
	}
	// Full + light loaded lists, then any known mod file whose compile index is assigned
	// (covers ESL-flagged .esp edge cases where loaded-light lookup briefly misses).
	if (data->LookupLoadedModByName(pluginFile) != nullptr ||
		data->LookupLoadedLightModByName(pluginFile) != nullptr) {
		return true;
	}
	if (const auto* file = data->LookupModByName(pluginFile)) {
		return file->GetCompileIndex() != 0xFF;
	}
	return false;
}

bool CogApi::Bind(RE::BSScript::IVirtualMachine* vm)
{
	if (!vm) {
		return false;
	}
	vm->RegisterFunction("IsReady", "COG_API", IsReady);
	vm->RegisterFunction("IsPluginLoaded", "COG_API", IsPluginLoaded);
	vm->RegisterFunction("SetUiHidden", "COG_API", SetUiHidden);
	vm->RegisterFunction("IsUiHidden", "COG_API", IsUiHidden);
	vm->RegisterFunction("ToggleUiHidden", "COG_API", ToggleUiHidden);
	CogApiGears::Bind(vm);
	CogApiGizmos::Bind(vm);
	CogApiGizmoFeedNotifications::Bind(vm);
	CogApiFeed::Bind(vm);
	logger::info("COG Papyrus natives bound");
	return true;
}
