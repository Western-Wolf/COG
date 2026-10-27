#include "pch.h"
#include "_Gizmo_Feed_UtilityCallbackIntercept.h"
#include "_Gizmo_Feed.h"
#include "_Gizmo_Feed_SourceInventory.h"
#include "_Core_Registry.h"
#include "_Core_HudSuppress.h"

#include <mutex>
#include <unordered_map>
#include <variant>
#include <vector>

namespace
{
	using Arg = std::variant<bool, std::int32_t, float, std::string>;

	struct Pending
	{
		std::string menu;
		std::string target;
		std::vector<Arg> args;
	};

	std::mutex g_mutex;
	std::unordered_map<std::int32_t, std::unique_ptr<Pending>> g_pending;
	std::int32_t g_nextHandle = 1;

	bool IsUiLibNotificationTarget(std::string_view target)
	{
		if (target.find("uilib_1_notificationArea") == std::string_view::npos) {
			return false;
		}
		// Prefer Icon suffix — "ShowIconMessage" also ends with "ShowMessage".
		return target.ends_with(".ShowIconMessage") || target.ends_with(".ShowMessage");
	}

	Pending* Access(std::int32_t handle)
	{
		auto it = g_pending.find(handle);
		return it == g_pending.end() ? nullptr : it->second.get();
	}

	std::unique_ptr<Pending> Take(std::int32_t handle)
	{
		auto it = g_pending.find(handle);
		if (it == g_pending.end()) {
			return nullptr;
		}
		auto out = std::move(it->second);
		g_pending.erase(it);
		return out;
	}

	void QueueInvoke(std::unique_ptr<Pending> cmd)
	{
		if (!cmd) {
			return;
		}

		auto* tasks = SKSE::GetTaskInterface();
		if (!tasks) {
			return;
		}

		tasks->AddUITask([cmd = std::shared_ptr<Pending>(std::move(cmd))]() {
			auto* ui = RE::UI::GetSingleton();
			if (!ui) {
				return;
			}
			auto view = ui->GetMovieView(cmd->menu);
			if (!view) {
				return;
			}

			std::vector<std::string> stringKeepAlive;
			stringKeepAlive.reserve(cmd->args.size());
			std::vector<RE::GFxValue> gfx;
			gfx.reserve(cmd->args.size());

			for (const auto& arg : cmd->args) {
				RE::GFxValue v;
				std::visit(
					[&](const auto& val) {
						using T = std::decay_t<decltype(val)>;
						if constexpr (std::is_same_v<T, bool>) {
							v.SetBoolean(val);
						} else if constexpr (std::is_same_v<T, std::int32_t>) {
							v.SetNumber(static_cast<double>(val));
						} else if constexpr (std::is_same_v<T, float>) {
							v.SetNumber(static_cast<double>(val));
						} else if constexpr (std::is_same_v<T, std::string>) {
							stringKeepAlive.push_back(val);
							v.SetString(stringKeepAlive.back().c_str());
						}
					},
					arg);
				gfx.push_back(v);
			}

			view->Invoke(
				cmd->target.c_str(),
				nullptr,
				gfx.empty() ? nullptr : gfx.data(),
				static_cast<std::uint32_t>(gfx.size()));
		});
	}

	std::int32_t Create(RE::StaticFunctionTag*, std::string menuName, std::string targetStr)
	{
		if (menuName.empty() || targetStr.empty()) {
			return 0;
		}
		auto pending = std::make_unique<Pending>();
		pending->menu = std::move(menuName);
		pending->target = std::move(targetStr);
		std::lock_guard lock(g_mutex);
		const auto handle = g_nextHandle++;
		if (g_nextHandle <= 0) {
			g_nextHandle = 1;
		}
		g_pending.emplace(handle, std::move(pending));
		return handle;
	}

	bool Send(RE::StaticFunctionTag*, std::int32_t handle)
	{
		if (handle <= 0) {
			return false;
		}

		std::unique_ptr<Pending> cmd;
		{
			std::lock_guard lock(g_mutex);
			cmd = Take(handle);
		}
		if (!cmd) {
			return false;
		}

		if (IsUiLibNotificationTarget(cmd->target)) {
			std::string text;
			std::string color;
			if (!cmd->args.empty()) {
				if (const auto* s = std::get_if<std::string>(&cmd->args[0])) {
					text = *s;
				}
			}
			if (cmd->args.size() >= 2) {
				if (const auto* s = std::get_if<std::string>(&cmd->args[1])) {
					color = *s;
				}
			}
			if (CogFeed::IsInventoryToast(CogFeed::StripHudMarkupForMatch(text)) &&
				CogRegistry::Get().ShouldSuppressInventoryNotifications()) {
				return true;
			}
			if (CogHudSuppress::IsKeySuppressed("hud.notifications")) {
				if (CogRegistry::Get().HasVisibleFeedShowingNotifications()) {
					CogFeed::EnqueueNotification(std::move(text), std::move(color), {});
				}
				return true;
			}
		}

		QueueInvoke(std::move(cmd));
		return true;
	}

	void Release(RE::StaticFunctionTag*, std::int32_t handle)
	{
		if (handle <= 0) {
			return;
		}
		std::lock_guard lock(g_mutex);
		g_pending.erase(handle);
	}

	template <class T>
	void Push(RE::StaticFunctionTag*, std::int32_t handle, T value)
	{
		if (handle <= 0) {
			return;
		}
		std::lock_guard lock(g_mutex);
		if (auto* cmd = Access(handle)) {
			cmd->args.emplace_back(std::move(value));
		}
	}

	template <class T>
	void PushArray(RE::StaticFunctionTag*, std::int32_t handle, std::vector<T> values)
	{
		if (handle <= 0) {
			return;
		}
		std::lock_guard lock(g_mutex);
		if (auto* cmd = Access(handle)) {
			cmd->args.reserve(cmd->args.size() + values.size());
			for (const auto& v : values) {
				cmd->args.emplace_back(static_cast<T>(v));
			}
		}
	}

	void SetNoWait(RE::BSScript::IVirtualMachine* vm, const char* fn)
	{
		vm->SetCallableFromTasklets("UICallback", fn, true);
	}
}

bool CogUiCallbackIntercept::Bind(RE::BSScript::IVirtualMachine* vm)
{
	if (!vm) {
		return false;
	}

	// Last bind wins — replaces SKSE's UICallback natives after SKSE has registered.
	vm->RegisterFunction("Create", "UICallback", Create);
	vm->RegisterFunction("Send", "UICallback", Send);
	vm->RegisterFunction("Release", "UICallback", Release);
	vm->RegisterFunction("PushBool", "UICallback", Push<bool>);
	vm->RegisterFunction("PushInt", "UICallback", Push<std::int32_t>);
	vm->RegisterFunction("PushFloat", "UICallback", Push<float>);
	vm->RegisterFunction("PushString", "UICallback", Push<std::string>);
	vm->RegisterFunction("PushBoolA", "UICallback", PushArray<bool>);
	vm->RegisterFunction("PushIntA", "UICallback", PushArray<std::int32_t>);
	vm->RegisterFunction("PushFloatA", "UICallback", PushArray<float>);
	vm->RegisterFunction("PushStringA", "UICallback", PushArray<std::string>);

	SetNoWait(vm, "Create");
	SetNoWait(vm, "Send");
	SetNoWait(vm, "Release");
	SetNoWait(vm, "PushBool");
	SetNoWait(vm, "PushInt");
	SetNoWait(vm, "PushFloat");
	SetNoWait(vm, "PushString");
	SetNoWait(vm, "PushBoolA");
	SetNoWait(vm, "PushIntA");
	SetNoWait(vm, "PushFloatA");
	SetNoWait(vm, "PushStringA");

	logger::info("COG UICallback intercept bound (SkyUILib notification divert)");
	return true;
}
