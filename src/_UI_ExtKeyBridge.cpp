#include "pch.h"
#include "_UI_ExtKeyBridge.h"

#include <Windows.h>

#include <array>
#include <atomic>
#include <chrono>
#include <thread>

namespace
{
	constexpr int kVkF13 = 0x7C;  // VK_F13 .. VK_F24 = 0x7C .. 0x87
	constexpr std::size_t kExtCount = 12;

	// DirectInput DIK_F13–F24 (same codes as CogKeys name table).
	constexpr std::array<std::uint32_t, kExtCount> kExtDik{
		0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6A, 0x6B, 0x6C, 0x6D, 0x6E, 0x76
	};

	const RE::BSFixedString& ExtEventTag()
	{
		static RE::BSFixedString tag("COGExtKey");
		return tag;
	}

	bool SkyManagerPresent()
	{
		return ::GetModuleHandleW(L"SkyManager.dll") != nullptr;
	}

	bool GameWindowFocused()
	{
		HWND fg = ::GetForegroundWindow();
		if (!fg) {
			return false;
		}
		DWORD pid = 0;
		::GetWindowThreadProcessId(fg, &pid);
		return pid == ::GetCurrentProcessId();
	}

	// Main thread only. Synthetic keyboard ButtonEvent into the engine queue.
	void SendEngineKey(std::uint32_t dik, float value, float held)
	{
		auto* idm = RE::BSInputDeviceManager::GetSingleton();
		if (!idm) {
			return;
		}
		auto* ev = RE::ButtonEvent::Create(
			RE::INPUT_DEVICE::kKeyboard, ExtEventTag(), dik, value, held);
		if (!ev) {
			return;
		}
		RE::InputEvent* head = ev;
		idm->SendEvent(&head);
		RE::free(ev);
	}

	void ExtPollLoop()
	{
		using clock = std::chrono::steady_clock;
		constexpr auto kTick = std::chrono::milliseconds(10);

		struct KeyState
		{
			bool down = false;
			clock::time_point pressedAt{};
		};
		std::array<KeyState, kExtCount> state{};

		bool loggedStandDown = false;
		bool loggedActive = false;

		while (true) {
			std::this_thread::sleep_for(kTick);

			if (SkyManagerPresent()) {
				if (!loggedStandDown) {
					logger::info(
						"COG ExtKeyBridge: SkyManager.dll present — leaving F13–F24 bridging to it");
					loggedStandDown = true;
					loggedActive = false;
				}
				// Release any in-flight synthetic holds if SkyManager appeared mid-session.
				for (std::size_t i = 0; i < kExtCount; ++i) {
					if (state[i].down) {
						const auto dik = kExtDik[i];
						const float held = std::chrono::duration<float>(clock::now() - state[i].pressedAt).count();
						if (auto* task = SKSE::GetTaskInterface()) {
							task->AddTask([dik, held]() { SendEngineKey(dik, 0.0f, held > 0.0f ? held : 0.000001f); });
						}
						state[i].down = false;
					}
				}
				continue;
			}

			if (!loggedActive) {
				logger::info("COG ExtKeyBridge: polling OS F13–F24 into engine ButtonEvents");
				loggedActive = true;
				loggedStandDown = false;
			}

			if (!GameWindowFocused()) {
				continue;
			}

			const auto now = clock::now();
			auto* task = SKSE::GetTaskInterface();
			if (!task) {
				continue;
			}

			for (std::size_t i = 0; i < kExtCount; ++i) {
				auto& k = state[i];
				const bool physDown = (::GetAsyncKeyState(kVkF13 + static_cast<int>(i)) & 0x8000) != 0;
				const auto dik = kExtDik[i];

				if (physDown && !k.down) {
					k.down = true;
					k.pressedAt = now;
					task->AddTask([dik]() { SendEngineKey(dik, 1.0f, 0.0f); });
				} else if (!physDown && k.down) {
					k.down = false;
					const float held = std::chrono::duration<float>(now - k.pressedAt).count();
					task->AddTask([dik, held]() {
						SendEngineKey(dik, 0.0f, held > 0.0f ? held : 0.000001f);
					});
				}
			}
		}
	}

	std::atomic<bool> g_started{ false };
}

namespace CogExtKeyBridge
{
	void Start()
	{
		bool expected = false;
		if (!g_started.compare_exchange_strong(expected, true)) {
			return;
		}
		std::thread(ExtPollLoop).detach();
	}
}
