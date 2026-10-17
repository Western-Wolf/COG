#include "pch.h"
#include "_Gears_LiveStats.h"
#include "_UI_CogUi.h"
#include "_Core_Registry.h"
#include "_Core_HudSuppress.h"

#include "RE/B/BGSDefaultObjectManager.h"

#ifdef GetObject
#	undef GetObject
#endif

#include <algorithm>
#include <atomic>
#include <chrono>
#include <cmath>
#include <cstddef>
#include <cstring>
#include <string>

namespace
{
	float ReadPositiveFloatSetting(const char* name, float fallback)
	{
		const auto read = [](RE::Setting* setting, float fallbackValue) {
			if (!setting) {
				return fallbackValue;
			}
			const float value = setting->GetFloat();
			return value > 0.0f ? value : fallbackValue;
		};
		if (auto* games = RE::GameSettingCollection::GetSingleton()) {
			if (auto* setting = games->GetSetting(name)) {
				const float value = read(setting, 0.0f);
				if (value > 0.0f) {
					return value;
				}
			}
		}
		if (auto* ini = RE::INISettingCollection::GetSingleton()) {
			if (auto* setting = ini->GetSetting(name)) {
				const float value = read(setting, 0.0f);
				if (value > 0.0f) {
					return value;
				}
			}
		}
		return fallback;
	}

	bool TagEquals(const RE::BSFixedString& tag, const char* name)
	{
		const char* text = tag.c_str();
		return text && _stricmp(text, name) == 0;
	}

	struct BowDrawnTimerEntry
	{
		float bowDrawTime;
		std::uint64_t unk1;
	};

	// Player bow-draw timer array layout (not BSTSmallArray<void*> element strides).
	using PlayerBowTimerArray = RE::BSTSmallArray<BowDrawnTimerEntry, 2>;

	float EngineWeaponSpeed(RE::Actor* actor, RE::TESObjectWEAP* weapon, bool leftHand)
	{
		if (!actor || !weapon) {
			return 1.0f;
		}
		using func_t = float (*)(const RE::ActorValueOwner*, RE::TESObjectWEAP*, bool);
		static REL::Relocation<func_t> func{ RELOCATION_ID(25851, 26417) };
		const float speed = func(actor->AsActorValueOwner(), weapon, leftHand);
		return speed > 0.0f ? speed : 1.0f;
	}

	// Elapsed draw from the last BA0 bow-timer entry.
	float EngineBowDrawElapsed(RE::PlayerCharacter* player)
	{
		if (!player) {
			return 0.0f;
		}
		const auto* arr = reinterpret_cast<const PlayerBowTimerArray*>(&player->GetPlayerRuntimeData().unkBA0);
		if (!arr || arr->empty()) {
			return 0.0f;
		}
		const float elapsed = arr->back().bowDrawTime;
		if (!std::isfinite(elapsed) || elapsed <= 0.0f || elapsed > 30.0f) {
			return 0.0f;
		}
		return elapsed;
	}

	using ArrowPowerFn = float (*)(float, float);

	// Resolve GetArrowPower via the engine call site (third-party patches may rewrite this).
	ArrowPowerFn ResolveArrowPower()
	{
		const auto site = REL::Relocation<std::uintptr_t>{
			RELOCATION_ID(42928, 44108),
			REL::VariantOffset(0x604, 0x5D6, 0)
		}.address();
		if (!site || *reinterpret_cast<std::uint8_t*>(site) != 0xE8) {
			return nullptr;
		}
		const auto rel = *reinterpret_cast<std::int32_t*>(site + 1);
		return reinterpret_cast<ArrowPowerFn>(site + 5 + rel);
	}

	float ArrowMinPower()
	{
		if (auto* games = RE::GameSettingCollection::GetSingleton()) {
			if (auto* setting = games->GetSetting("fArrowMinPower")) {
				const float value = setting->GetFloat();
				if (value > 0.0f) {
					return value;
				}
			}
		}
		return 0.35f;
	}

	// Normalize arrow power into 0–1 charge: (GetArrowPower - minPower) / (1 - minPower).
	float ArrowChargeProgress(float drawTime, float bowSpeed)
	{
		if (drawTime <= 0.0f) {
			return 0.0f;
		}
		if (bowSpeed <= 0.0f) {
			bowSpeed = 1.0f;
		}
		static const ArrowPowerFn getPower = ResolveArrowPower();
		const float minPower = ArrowMinPower();
		float power = 0.0f;
		if (getPower) {
			power = getPower(drawTime, bowSpeed);
		} else {
			const float x = drawTime * bowSpeed;
			if (x >= 0.95f) {
				power = 1.0f;
			} else {
				power = ((0.5f * x * x) + (0.5f * x)) * (1.0f - minPower) + minPower;
			}
		}
		const float span = 1.0f - minPower;
		if (span <= 0.001f) {
			return std::clamp(power, 0.0f, 1.0f);
		}
		return std::clamp((power - minPower) / span, 0.0f, 1.0f);
	}

	// Vanilla animation events gate bow draw. Attack-state enums often never
	// change during a draw (animation overhauls, bitfield packing), which is
	// why a poll-only GetAttackState() path stays at 0.
	class BowDrawMonitor :
		public RE::BSTEventSink<SKSE::ActionEvent>,
		public RE::BSTEventSink<RE::BSAnimationGraphEvent>,
		public RE::BSTEventSink<RE::TESObjectLoadedEvent>,
		public RE::BSTEventSink<RE::TESLoadGameEvent>
	{
	public:
		static BowDrawMonitor& Get()
		{
			static BowDrawMonitor instance;
			return instance;
		}

		void Bind()
		{
			if (_bound) {
				return;
			}
			if (auto* actions = SKSE::GetActionEventSource()) {
				actions->AddEventSink(static_cast<RE::BSTEventSink<SKSE::ActionEvent>*>(this));
			}
			if (auto* events = RE::ScriptEventSourceHolder::GetSingleton()) {
				events->AddEventSink(static_cast<RE::BSTEventSink<RE::TESObjectLoadedEvent>*>(this));
				events->AddEventSink(static_cast<RE::BSTEventSink<RE::TESLoadGameEvent>*>(this));
			}
			_bound = true;
			AttachGraph();
		}

		void AttachGraph()
		{
			auto* player = RE::PlayerCharacter::GetSingleton();
			if (player) {
				player->AddAnimationGraphEventSink(this);
			}
		}

		void Start()
		{
			CancelPendingStop();
			bool expected = false;
			_drawing.compare_exchange_strong(expected, true, std::memory_order_relaxed);
		}

		void RequestStop()
		{
			if (!_drawing.load(std::memory_order_relaxed)) {
				return;
			}
			if (_stopAtNs.load(std::memory_order_relaxed) > 0) {
				return;
			}
			const auto ns = std::chrono::duration_cast<std::chrono::nanoseconds>(
								std::chrono::steady_clock::now().time_since_epoch())
								.count();
			_stopAtNs.store(ns + 120000000, std::memory_order_relaxed);
		}

		void CancelPendingStop()
		{
			_stopAtNs.store(0, std::memory_order_relaxed);
		}

		void FlushPendingStop()
		{
			const auto stopAt = _stopAtNs.load(std::memory_order_relaxed);
			if (stopAt <= 0) {
				return;
			}
			const auto ns = std::chrono::duration_cast<std::chrono::nanoseconds>(
								std::chrono::steady_clock::now().time_since_epoch())
								.count();
			if (ns >= stopAt) {
				Stop();
			}
		}

		void Stop()
		{
			CancelPendingStop();
			_drawing.store(false, std::memory_order_relaxed);
		}

		bool Drawing() const { return _drawing.load(std::memory_order_relaxed); }

		RE::BSEventNotifyControl ProcessEvent(const SKSE::ActionEvent* a_event, RE::BSTEventSource<SKSE::ActionEvent>*) override
		{
			if (!a_event) {
				return RE::BSEventNotifyControl::kContinue;
			}
			auto* player = RE::PlayerCharacter::GetSingleton();
			if (!player || a_event->actor != player) {
				return RE::BSEventNotifyControl::kContinue;
			}
			using T = SKSE::ActionEvent::Type;
			switch (a_event->type.get()) {
			case T::kBowDraw:
				Start();
				break;
			case T::kBowRelease:
				RequestStop();
				break;
			case T::kBeginSheathe:
			case T::kEndSheathe:
				Stop();
				break;
			default:
				break;
			}
			return RE::BSEventNotifyControl::kContinue;
		}

		RE::BSEventNotifyControl ProcessEvent(const RE::BSAnimationGraphEvent* a_event, RE::BSTEventSource<RE::BSAnimationGraphEvent>*) override
		{
			if (!a_event) {
				return RE::BSEventNotifyControl::kContinue;
			}
			auto* player = RE::PlayerCharacter::GetSingleton();
			if (!player || a_event->holder != player) {
				return RE::BSEventNotifyControl::kContinue;
			}
			if (TagEquals(a_event->tag, "BowDraw")) {
				Start();
			} else if (TagEquals(a_event->tag, "BowDrawn")) {
				CancelPendingStop();
			} else if (TagEquals(a_event->tag, "BowRelease") || TagEquals(a_event->tag, "WeaponSheathe")) {
				Stop();
			} else if (TagEquals(a_event->tag, "bowReset")) {
				RequestStop();
			}
			return RE::BSEventNotifyControl::kContinue;
		}

		RE::BSEventNotifyControl ProcessEvent(const RE::TESObjectLoadedEvent* a_event, RE::BSTEventSource<RE::TESObjectLoadedEvent>*) override
		{
			auto* player = RE::PlayerCharacter::GetSingleton();
			if (!a_event || !player || a_event->formID != player->GetFormID() || !a_event->loaded) {
				return RE::BSEventNotifyControl::kContinue;
			}
			if (auto* tasks = SKSE::GetTaskInterface()) {
				tasks->AddTask([]() { BowDrawMonitor::Get().AttachGraph(); });
			} else {
				AttachGraph();
			}
			return RE::BSEventNotifyControl::kContinue;
		}

		RE::BSEventNotifyControl ProcessEvent(const RE::TESLoadGameEvent*, RE::BSTEventSource<RE::TESLoadGameEvent>*) override
		{
			Stop();
			AttachGraph();
			return RE::BSEventNotifyControl::kContinue;
		}

	private:
		bool _bound{ false };
		std::atomic<bool> _drawing{ false };
		std::atomic<std::int64_t> _stopAtNs{ 0 };
	};

	RE::TESObjectWEAP* EquippedRanged(RE::Actor* actor)
	{
		for (const bool left : { true, false }) {
			auto* form = actor->GetEquippedObject(left);
			auto* weap = form ? form->As<RE::TESObjectWEAP>() : nullptr;
			if (weap && (weap->IsBow() || weap->IsCrossbow())) {
				return weap;
			}
		}
		const auto inv = actor->GetInventory([](RE::TESBoundObject& obj) { return obj.IsWeapon(); });
		for (const auto& [obj, data] : inv) {
			auto* weap = obj->As<RE::TESObjectWEAP>();
			if (weap && (weap->IsBow() || weap->IsCrossbow()) && data.second && data.second->IsWorn()) {
				return weap;
			}
		}
		return nullptr;
	}

	bool AmmoFitsWeapon(RE::TESAmmo* ammo, RE::TESObjectWEAP* weap)
	{
		if (!ammo || !weap) {
			return false;
		}
		const bool bolt = ammo->IsBolt();
		if (weap->IsCrossbow()) {
			return bolt;
		}
		if (weap->IsBow()) {
			return !bolt;
		}
		return false;
	}

	RE::TESObjectWEAP* EquippedBow(RE::Actor* actor)
	{
		for (const bool left : { true, false }) {
			auto* form = actor->GetEquippedObject(left);
			auto* weap = form ? form->As<RE::TESObjectWEAP>() : nullptr;
			if (weap && weap->IsBow()) {
				return weap;
			}
		}
		return nullptr;
	}

	RE::TESObjectWEAP* EquippedWeaponOfKind(RE::Actor* actor, bool bolts)
	{
		for (const bool left : { true, false }) {
			auto* form = actor->GetEquippedObject(left);
			auto* weap = form ? form->As<RE::TESObjectWEAP>() : nullptr;
			if (!weap) {
				continue;
			}
			if (bolts ? weap->IsCrossbow() : weap->IsBow()) {
				return weap;
			}
		}
		return nullptr;
	}

	int EquippedAmmoCountFor(bool bolts)
	{
		auto* player = RE::PlayerCharacter::GetSingleton();
		if (!player) {
			return 0;
		}
		auto* weap = EquippedWeaponOfKind(player, bolts);
		if (!weap) {
			return 0;
		}

		RE::TESAmmo* ammo = player->GetCurrentAmmo();
		if (!AmmoFitsWeapon(ammo, weap)) {
			ammo = nullptr;
		}
		if (!ammo) {
			if (auto* process = player->GetActorRuntimeData().currentProcess) {
				if (auto* entry = process->GetCurrentAmmo()) {
					ammo = entry->object ? entry->object->As<RE::TESAmmo>() : nullptr;
					if (!AmmoFitsWeapon(ammo, weap)) {
						ammo = nullptr;
					}
				}
			}
		}

		const auto counts = player->GetInventoryCounts([](RE::TESBoundObject& obj) { return obj.IsAmmo(); });
		if (ammo) {
			if (auto it = counts.find(ammo); it != counts.end() && it->second > 0) {
				return it->second;
			}
		}

		const auto inv = player->GetInventory([](RE::TESBoundObject& obj) { return obj.IsAmmo(); });
		for (const auto& [obj, data] : inv) {
			auto* candidate = obj->As<RE::TESAmmo>();
			if (!AmmoFitsWeapon(candidate, weap)) {
				continue;
			}
			if (data.second && data.second->IsWorn() && data.first > 0) {
				return data.first;
			}
		}
		return 0;
	}

	float SpellChargeOf(RE::MagicCaster* caster)
	{
		if (!caster || !caster->currentSpell) {
			return 0.0f;
		}
		const float chargeTime = caster->currentSpell->GetChargeTime();
		if (chargeTime <= 0.0f) {
			return 0.0f;
		}
		using S = RE::MagicCaster::State;
		const auto state = caster->state.get();
		switch (state) {
		case S::kUnk01:
		case S::kUnk02:
		case S::kUnk04:
		case S::kCharging:
			break;
		case S::kReady:
			return 1.0f;
		default:
			return 0.0f;
		}
		const float progress = std::clamp((chargeTime - caster->castingTimer) / chargeTime, 0.0f, 1.0f);
		return progress > 0.0f ? progress : 0.001f;
	}

	template <class T>
	T* Lookup(RE::FormID id, const char* file)
	{
		auto* data = RE::TESDataHandler::GetSingleton();
		return data ? data->LookupForm<T>(id, file) : nullptr;
	}

	struct PlayerUpdateHook
	{
		static void thunk(RE::PlayerCharacter* self, float delta)
		{
			func(self, delta);
			CogHudSuppress::OnPlayerUpdate();
			static bool pushedLive = false;
			auto& monitor = BowDrawMonitor::Get();
			monitor.FlushPendingStop();
			const bool wasDrawing = monitor.Drawing();
			if (!wasDrawing && !pushedLive) {
				return;
			}
			const float progress = CogLive::PlayerBowDraw();
			pushedLive = monitor.Drawing() || progress > 0.0f;
			if (CogUi::HasView()) {
				CogRegistry::Get().PushLivePercent("COG.Builtin", "BowDraw", progress, 1.0f);
			}
		}
		static inline REL::Relocation<void(RE::PlayerCharacter*, float)> func;
	};
}

void CogLive::ReadPlayerBreath(float& remaining, float& maximum)
{
	maximum = ReadPositiveFloatSetting("fActorSwimBreathBase", 20.0f);
	remaining = 0.0f;
	auto* player = RE::PlayerCharacter::GetSingleton();
	if (!player) {
		return;
	}
	auto* values = player->AsActorValueOwner();
	if (values && values->GetActorValue(RE::ActorValue::kWaterBreathing) > 0.0f) {
		return;
	}
	const bool underwater = player->GetActorRuntimeData().boolFlags.any(RE::Actor::BOOL_FLAGS::kUnderwater);
	if (!underwater) {
		return;
	}
	auto* process = player->GetActorRuntimeData().currentProcess;
	if (!process || !process->high) {
		return;
	}
	remaining = (std::max)(0.0f, process->high->breathTimer);
	if (remaining > maximum) {
		maximum = remaining;
	}
	if (remaining <= 0.0f) {
		remaining = 0.05f;
	}
}

void CogLive::BindBowDrawTracking()
{
	BowDrawMonitor::Get().Bind();
	static bool hooked = false;
	if (hooked) {
		return;
	}
	hooked = true;
	REL::Relocation<std::uintptr_t> vtbl{ RE::VTABLE_PlayerCharacter[0] };
	PlayerUpdateHook::func = vtbl.write_vfunc(0xAD, PlayerUpdateHook::thunk);
}

float CogLive::PlayerBowDraw()
{
	auto& monitor = BowDrawMonitor::Get();
	monitor.FlushPendingStop();

	auto* player = RE::PlayerCharacter::GetSingleton();
	if (!player) {
		monitor.Stop();
		return 0.0f;
	}

	auto* bow = EquippedBow(player);
	if (!bow) {
		monitor.Stop();
		return 0.0f;
	}

	// Bow draw speed is queried with leftHand=false (engine convention for bows).
	const float speed = EngineWeaponSpeed(player, bow, false);

	if (!monitor.Drawing()) {
		return 0.0f;
	}
	const float elapsed = EngineBowDrawElapsed(player);
	if (elapsed <= 0.0f) {
		return 0.001f;
	}
	const float progress = ArrowChargeProgress(elapsed, speed);
	return progress > 0.0f ? progress : 0.001f;
}

float CogLive::PlayerSpellCharge()
{
	auto* player = RE::PlayerCharacter::GetSingleton();
	if (!player) {
		return 0.0f;
	}
	float best = 0.0f;
	for (const auto source : { RE::MagicSystem::CastingSource::kLeftHand, RE::MagicSystem::CastingSource::kRightHand }) {
		best = (std::max)(best, SpellChargeOf(player->GetMagicCaster(source)));
	}
	return best;
}

namespace
{
	// Vanilla HUDChargeMeter reads LeftItemCharge / RightItemCharge ActorValues
	// (drained in combat). Inventory ExtraCharge stays stale — do not use it here.
	float EquippedHandWeaponCharge(bool leftHand)
	{
		auto* player = RE::PlayerCharacter::GetSingleton();
		if (!player) {
			return 0.0f;
		}
		auto* form = player->GetEquippedObject(leftHand);
		if (!form || !form->As<RE::TESObjectWEAP>()) {
			return 0.0f;
		}
		auto* values = player->AsActorValueOwner();
		if (!values) {
			return 0.0f;
		}
		const auto av = leftHand ? RE::ActorValue::kLeftItemCharge : RE::ActorValue::kRightItemCharge;
		const float current = values->GetActorValue(av);
		float maximum = values->GetPermanentActorValue(av);
		if (maximum < 0.0001f) {
			maximum = values->GetBaseActorValue(av);
		}
		if (maximum < 0.0001f) {
			return 0.0f;
		}
		if (maximum < current) {
			maximum = current;
		}
		return std::clamp(current / maximum, 0.0f, 1.0f);
	}
}

float CogLive::PlayerWeaponCharge(bool secondary)
{
	// Primary = right / two-hand; secondary = left.
	return EquippedHandWeaponCharge(secondary);
}

bool CogLive::PlayerIsWerewolf()
{
	auto* player = RE::PlayerCharacter::GetSingleton();
	if (!player) {
		return false;
	}
	if (player->HasKeywordString("ActorTypeWerewolf"sv)) {
		return true;
	}
	auto* race = Lookup<RE::TESRace>(0xCDD84, "Skyrim.esm");
	return race && player->GetRace() == race;
}

bool CogLive::PlayerIsVampireLord()
{
	auto* player = RE::PlayerCharacter::GetSingleton();
	if (!player) {
		return false;
	}
	// DLC1VampireBeastRace "Vampire Lord" [RACE:0200283A]
	auto* race = Lookup<RE::TESRace>(0x283A, "Dawnguard.esm");
	return race && player->GetRace() == race;
}

bool CogLive::PlayerInBeastForm()
{
	return PlayerIsWerewolf() || PlayerIsVampireLord();
}

// Voice recovery remaining seconds (0 when ready); timer latch like other depleting meters.
float VoiceRecoveryRemaining(bool requireWerewolf)
{
	const bool wolf = CogLive::PlayerIsWerewolf();
	if (requireWerewolf) {
		if (!wolf) {
			return 0.0f;
		}
	} else if (CogLive::PlayerInBeastForm()) {
		// Human shouts are unavailable in werewolf / vampire lord form.
		return 0.0f;
	}
	auto* player = RE::PlayerCharacter::GetSingleton();
	if (!player) {
		return 0.0f;
	}
	return (std::max)(0.0f, player->GetVoiceRecoveryTime());
}

float CogLive::PlayerShoutRemaining()
{
	return VoiceRecoveryRemaining(false);
}

float CogLive::PlayerHowlRemaining()
{
	return VoiceRecoveryRemaining(true);
}

namespace
{
	void ActorValuePoolPercent(RE::Actor* actor, RE::ActorValue av, float& current, float& maximum)
	{
		current = 0.0f;
		maximum = 0.0f;
		auto* values = actor ? actor->AsActorValueOwner() : nullptr;
		if (!values) {
			return;
		}
		current = values->GetActorValue(av);
		maximum = actor->GetActorValueMax(av);
		if (maximum < 0.0001f) {
			const float damage = actor->GetActorValueModifier(RE::ACTOR_VALUE_MODIFIER::kDamage, av);
			maximum = current - damage;
		}
		if (maximum < 0.0001f) {
			maximum = values->GetBaseActorValue(av);
		}
		if (maximum < current) {
			maximum = current;
		}
	}
}  // namespace

void CogLive::PlayerActorPercent(RE::ActorValue av, float& current, float& maximum)
{
	auto* player = RE::PlayerCharacter::GetSingleton();
	ActorValuePoolPercent(player, av, current, maximum);
}

void CogLive::ReadMountStamina(float& current, float& maximum)
{
	current = 0.0f;
	maximum = 1.0f;
	auto* player = RE::PlayerCharacter::GetSingleton();
	if (!player || !player->IsOnMount()) {
		return;
	}
	RE::NiPointer<RE::Actor> mount;
	if (!player->GetMount(mount) || !mount) {
		return;
	}
	ActorValuePoolPercent(mount.get(), RE::ActorValue::kStamina, current, maximum);
	if (maximum < 0.0001f) {
		maximum = 1.0f;
		current = 0.0f;
		return;
	}
	// Exhausted mount still visible while riding (hideAt "<0.01" would drop a true 0% bar).
	const float ratio = current / maximum;
	if (ratio < 0.01f) {
		current = maximum * 0.01f;
	}
}

float CogLive::BeastSecondsLeft(RE::FormID raceId, const char* raceFile, RE::FormID backTimeId, const char* backFile)
{
	struct BeastLatchState
	{
		RE::FormID raceId = 0;
		RE::FormID backTimeId = 0;
		bool       expired = false;
	};

	static BeastLatchState latch;

	auto resetLatch = [&]() {
		latch.expired = false;
	};

	if (latch.raceId != raceId || latch.backTimeId != backTimeId) {
		latch.raceId = raceId;
		latch.backTimeId = backTimeId;
		resetLatch();
	}

	auto* player = RE::PlayerCharacter::GetSingleton();
	auto* race = Lookup<RE::TESRace>(raceId, raceFile);
	if (!player || !race || player->GetRace() != race) {
		resetLatch();
		return 0.0f;
	}
	auto* backTime = Lookup<RE::TESGlobal>(backTimeId, backFile);
	auto* daysPassed = Lookup<RE::TESGlobal>(0x39, "Skyrim.esm");
	auto* timeScale = Lookup<RE::TESGlobal>(0x3A, "Skyrim.esm");
	if (!backTime || !daysPassed || !timeScale || timeScale->value <= 0.0f) {
		return 0.0f;
	}
	const float remainDays = backTime->value - daysPassed->value;
	if (remainDays <= 0.0f) {
		latch.expired = true;
		return 0.0f;
	}
	const float remaining = (remainDays * 86400.0f) / timeScale->value;
	if (latch.expired) {
		// After natural expiry, ignore tiny global twitches until feeding extends the timer.
		constexpr float kExtensionSeconds = 5.0f;
		if (remaining < kExtensionSeconds) {
			return 0.0f;
		}
		latch.expired = false;
	}
	return remaining;
}

int ReadScriptIntProperty(RE::TESForm* form, const char* script, const char* property)
{
	auto* vm = RE::BSScript::Internal::VirtualMachine::GetSingleton();
	if (!vm || !form) {
		return -1;
	}
	auto* policy = vm->GetObjectHandlePolicy();
	if (!policy) {
		return -1;
	}
	const auto handle = policy->GetHandleForObject(form->GetFormType(), form);
	if (handle == policy->EmptyHandle()) {
		return -1;
	}
	RE::BSTSmartPointer<RE::BSScript::Object> obj;
	if (!vm->FindBoundObject(handle, script, obj) || !obj) {
		return -1;
	}
	const RE::BSScript::Variable* var = obj->GetProperty(property);
	if (!var) {
		const auto hidden = std::string("::") + property + "_var";
		var = obj->GetVariable(hidden.c_str());
	}
	if (!var) {
		return -1;
	}
	if (var->IsInt()) {
		return var->GetSInt();
	}
	if (var->IsFloat()) {
		return static_cast<int>(std::lround(var->GetFloat()));
	}
	return -1;
}

int StageFromVampireSpells(RE::Actor* player)
{
	if (!player) {
		return 0;
	}
	static constexpr const char* kSun[] = {
		"VampireSunDamage04", "VampireSunDamage03", "VampireSunDamage02", "VampireSunDamage01"
	};
	static constexpr const char* kAb[] = { "AbVampire04", "AbVampire03", "AbVampire02", "AbVampire01" };
	for (int stage = 4; stage >= 1; --stage) {
		if (auto* spell = RE::TESForm::LookupByEditorID<RE::SpellItem>(kSun[4 - stage])) {
			if (player->HasSpell(spell)) {
				return stage;
			}
		}
	}
	for (int stage = 4; stage >= 1; --stage) {
		if (auto* spell = RE::TESForm::LookupByEditorID<RE::SpellItem>(kAb[4 - stage])) {
			if (player->HasSpell(spell)) {
				return stage;
			}
		}
	}
	return 0;
}

int CogLive::VampireStage()
{
	if (auto* quest = Lookup<RE::TESQuest>(0xEAFD5, "Skyrim.esm")) {
		const int status = ReadScriptIntProperty(quest, "PlayerVampireQuestScript", "VampireStatus");
		if (status >= 0 && status <= 4) {
			return status;
		}
	}
	auto* player = RE::PlayerCharacter::GetSingleton();
	if (const int fromSpells = StageFromVampireSpells(player); fromSpells > 0) {
		return fromSpells;
	}
	if (player && player->HasKeywordString("ActorTypeVampire"sv)) {
		return 1;
	}
	return 0;
}

int CogLive::PlayerEquippedArrowCount()
{
	return EquippedAmmoCountFor(false);
}

int CogLive::PlayerEquippedBoltCount()
{
	return EquippedAmmoCountFor(true);
}

namespace
{
	std::string EscapeJsonShout(const std::string& s)
	{
		std::string out;
		out.reserve(s.size() + 8);
		for (unsigned char c : s) {
			switch (c) {
			case '"':
				out += "\\\"";
				break;
			case '\\':
				out += "\\\\";
				break;
			case '\n':
				out += "\\n";
				break;
			case '\r':
				out += "\\r";
				break;
			default:
				out += static_cast<char>(c);
				break;
			}
		}
		return out;
	}

	const char* SafeCString(const char* text)
	{
		return text ? text : "";
	}

	bool WordKnown(RE::Actor* player, RE::TESWordOfPower* word, RE::SpellItem* spell)
	{
		if (!word) {
			return false;
		}
		if (word->GetKnown()) {
			return true;
		}
		return player && spell && player->HasSpell(spell);
	}

	class SpellLookupVisitor final : public RE::Actor::ForEachSpellVisitor
	{
	public:
		explicit SpellLookupVisitor(RE::SpellItem* a_spell) :
			target(a_spell)
		{}

		RE::BSContainer::ForEachResult Visit(RE::SpellItem* a_spell) override
		{
			if (a_spell && a_spell == target) {
				found = true;
				return RE::BSContainer::ForEachResult::kStop;
			}
			return RE::BSContainer::ForEachResult::kContinue;
		}

		RE::SpellItem* target;
		bool           found{ false };
	};

	bool ActorKnowsSpell(RE::Actor* player, RE::SpellItem* spell)
	{
		if (!player || !spell) {
			return false;
		}
		if (player->HasSpell(spell)) {
			return true;
		}
		SpellLookupVisitor visitor(spell);
		player->VisitSpells(visitor);
		return visitor.found;
	}

	bool WordUnlocked(RE::Actor* player, RE::TESWordOfPower* word, RE::SpellItem* spell)
	{
		if (!word) {
			return false;
		}
		return ActorKnowsSpell(player, spell);
	}

	int ShoutVariationIndex(RE::HighProcessData* high)
	{
		if (high) {
			const auto id = high->currentShoutVariation;
			if (id >= RE::TESShout::VariationID::kOne && id <= RE::TESShout::VariationID::kThree) {
				return static_cast<int>(id);
			}
		}
		return 2;
	}

	// Actor::GetCurrentShoutLevel() CTDs on shout press in this build — read process fields only.
	void ReadShoutSpeechState(RE::HighProcessData* high, int& shoutLevel, bool& shouting)
	{
		shoutLevel = -1;
		shouting = false;
		if (!high || !high->currentShout) {
			return;
		}
		if (high->voiceRecoveryTime > 0.0f) {
			return;
		}

		using VS = RE::VOICE_STATE;
		const auto voiceState = high->voiceState.get();
		const float elapsed = high->voiceTimeElapsed;
		const bool voiceActive =
			voiceState == VS::kPrecast ||
			voiceState == VS::kStart ||
			voiceState == VS::kContinue ||
			elapsed > 0.0f;

		if (!voiceActive) {
			return;
		}

		shouting = true;
		const auto id = high->currentShoutVariation;
		if (id >= RE::TESShout::VariationID::kOne && id <= RE::TESShout::VariationID::kThree) {
			shoutLevel = static_cast<int>(id);
		} else {
			shoutLevel = -1;
		}
	}

	float ShoutRecoveryMaximum(const RE::TESShout* shout, int variationIndex)
	{
		if (!shout) {
			return 0.0f;
		}
		const int idx = std::clamp(variationIndex, 0, 2);
		const float recovery = shout->variations[idx].recoveryTime;
		return recovery > 0.0f ? recovery : shout->variations[2].recoveryTime;
	}

	// Voice recovery is global; peak tracks the shout that started the active cooldown.
	float g_activeVoiceCooldownMaximum = 0.0f;

	void UpdateActiveVoiceCooldownMaximum(float remaining)
	{
		if (remaining <= 0.0f) {
			g_activeVoiceCooldownMaximum = 0.0f;
		} else if (remaining > g_activeVoiceCooldownMaximum) {
			g_activeVoiceCooldownMaximum = remaining;
		}
	}

	float ActiveVoiceCooldownMaximum(const RE::TESShout* shout, int variationIndex)
	{
		if (g_activeVoiceCooldownMaximum > 0.0f) {
			return g_activeVoiceCooldownMaximum;
		}
		return ShoutRecoveryMaximum(shout, variationIndex);
	}

	RE::TESShout* ShoutFromForm(RE::TESForm* form)
	{
		return form && form->Is(RE::FormType::Shout) ? form->As<RE::TESShout>() : nullptr;
	}

	struct ShoutMeterLogState
	{
		bool     equipped = false;
		std::string shoutEditor;
		int      wordCount = 0;
		int      unlockedCount = 0;
		std::string resolveSource;
	};

	bool ShoutMeterLogDue(const ShoutMeterLogState& state)
	{
		static ShoutMeterLogState last{};
		const bool                changed =
			state.equipped != last.equipped ||
			state.shoutEditor != last.shoutEditor ||
			state.wordCount != last.wordCount ||
			state.unlockedCount != last.unlockedCount ||
			state.resolveSource != last.resolveSource;
		if (!changed) {
			return false;
		}
		last = state;
		return true;
	}

	void LogShoutMeterSnapshot(
		const RE::TESShout* shout,
		const char* resolveSource,
		int shoutLevel,
		bool shouting,
		float remaining,
		float maximum,
		int wordCount,
		int unlockedCount,
		int knownCount)
	{
		ShoutMeterLogState state;
		state.equipped = shout != nullptr;
		state.shoutEditor = shout ? SafeCString(shout->GetFormEditorID()) : "";
		state.wordCount = wordCount;
		state.unlockedCount = unlockedCount;
		state.resolveSource = resolveSource ? resolveSource : "none";
		if (!ShoutMeterLogDue(state)) {
			return;
		}

		if (!shout) {
			logger::info("ShoutMeter: equipped=false source={}", state.resolveSource);
			return;
		}

		logger::info(
			"ShoutMeter: equipped=true source={} shout=\"{}\" remaining={:.1f}/{:.1f} shouting={} level={} words={}/{}/{}",
			resolveSource ? resolveSource : "?",
			SafeCString(shout->GetFullName()),
			remaining,
			maximum,
			shouting,
			shoutLevel,
			unlockedCount,
			knownCount,
			wordCount);
	}

	struct EquippedShoutResult
	{
		RE::TESShout* shout = nullptr;
		const char*   source = nullptr;
	};

	EquippedShoutResult ResolvePlayerEquippedShout(RE::Actor* player)
	{
		EquippedShoutResult result;
		if (!player) {
			return result;
		}

		auto& rt = player->GetActorRuntimeData();
		if (auto* shout = ShoutFromForm(rt.selectedPower)) {
			result.shout = shout;
			result.source = "selectedPower";
			return result;
		}

		if (auto* dom = RE::BGSDefaultObjectManager::GetSingleton()) {
			if (auto* voiceSlot = dom->GetObject<RE::BGSEquipSlot>(RE::DEFAULT_OBJECT::kVoiceEquip)) {
				if (auto* shout = ShoutFromForm(player->GetEquippedObjectInSlot(voiceSlot))) {
					result.shout = shout;
					result.source = "voiceEquipSlot";
					return result;
				}
			}
		}

		if (auto* process = rt.currentProcess) {
			for (const auto& entry : process->equippedForms) {
				if (auto* shout = ShoutFromForm(entry.object)) {
					result.shout = shout;
					result.source = "equippedForms";
					return result;
				}
			}
			if (auto* shout = process->GetCurrentShout()) {
				result.shout = shout;
				result.source = "processCurrentShout";
				return result;
			}
		}

		if (auto* shout = player->GetCurrentShout()) {
			result.shout = shout;
			result.source = "playerCurrentShout";
		}
		return result;
	}
}

void CogLive::WriteShoutMeterSnapshotJson(std::ostream& o)
{
	auto* player = RE::PlayerCharacter::GetSingleton();
	if (CogLive::PlayerInBeastForm()) {
		LogShoutMeterSnapshot(
			nullptr,
			CogLive::PlayerIsWerewolf() ? "werewolfForm" : "vampireLordForm",
			-1,
			false,
			0.0f,
			0.0f,
			0,
			0,
			0);
		o << "\"shoutMeter\":{\"equipped\":false}";
		return;
	}
	const auto equipped = ResolvePlayerEquippedShout(player);
	const auto* shout = equipped.shout;
	if (!player || !shout) {
		LogShoutMeterSnapshot(nullptr, equipped.source, -1, false, 0.0f, 0.0f, 0, 0, 0);
		o << "\"shoutMeter\":{\"equipped\":false}";
		return;
	}

	RE::HighProcessData* high = nullptr;
	if (auto* process = player->GetActorRuntimeData().currentProcess) {
		high = process->high;
	}

	const float remaining = (std::max)(0.0f, player->GetVoiceRecoveryTime());
	UpdateActiveVoiceCooldownMaximum(remaining);
	int shoutLevel = -1;
	bool shouting = false;
	ReadShoutSpeechState(high, shoutLevel, shouting);
	bool shoutDenied = false;
	if (high) {
		const auto voiceState = high->voiceState.get();
		if (remaining > 0.0f) {
			// Attempt while recovering: fail or aborted precast.
			shoutDenied =
				voiceState == RE::VOICE_STATE::kFail ||
				voiceState == RE::VOICE_STATE::kPrecast;
		} else {
			// Ready but shout rejected (invalid / out-of-range target, e.g. Soul Cairn Summon).
			shoutDenied = voiceState == RE::VOICE_STATE::kFail;
		}
	}
	const int variationIndex =
		remaining > 0.0f ? ShoutVariationIndex(high) : static_cast<int>(RE::TESShout::VariationID::kThree);
	const float maximum =
		remaining > 0.0f
			? ActiveVoiceCooldownMaximum(shout, variationIndex)
			: ShoutRecoveryMaximum(shout, variationIndex);

	const auto* shoutName = shout->GetFullName();
	const char* shoutEditor = shout->GetFormEditorID();

	int wordCount = 0;
	int unlockedCount = 0;
	int knownCount = 0;
	for (int i = 0; i < RE::TESShout::VariationID::kTotal; ++i) {
		auto* word = shout->variations[i].word;
		auto* spell = shout->variations[i].spell;
		if (!word) {
			continue;
		}
		++wordCount;
		if (WordKnown(player, word, spell)) {
			++knownCount;
		}
		if (WordUnlocked(player, word, spell)) {
			++unlockedCount;
		}
	}
	LogShoutMeterSnapshot(
		shout,
		equipped.source,
		shoutLevel,
		shouting,
		remaining,
		maximum,
		wordCount,
		unlockedCount,
		knownCount);

	o << "\"shoutMeter\":{"
	  << "\"equipped\":true"
	  << ",\"shoutName\":\"" << EscapeJsonShout(SafeCString(shoutName)) << "\""
	  << ",\"shoutEditor\":\"" << EscapeJsonShout(SafeCString(shoutEditor)) << "\""
	  << ",\"remaining\":" << remaining << ",\"maximum\":" << maximum
	  << ",\"shoutLevel\":" << shoutLevel << ",\"shouting\":" << (shouting ? "true" : "false")
	  << ",\"shoutDenied\":" << (shoutDenied ? "true" : "false")
	  << ",\"words\":[";

	bool firstWord = true;
	for (int i = 0; i < RE::TESShout::VariationID::kTotal; ++i) {
		auto* word = shout->variations[i].word;
		auto* spell = shout->variations[i].spell;
		if (!word) {
			continue;
		}
		if (!firstWord) {
			o << ",";
		}
		firstWord = false;
		const char* fontText = word->GetFullName();
		if (!fontText || !*fontText) {
			fontText = word->GetFormEditorID();
		}
		const char* translation = word->translation.c_str();
		const char* editor = word->GetFormEditorID();
		const bool known = WordKnown(player, word, spell);
		const bool unlocked = WordUnlocked(player, word, spell);
		o << "{\"index\":" << i << ",\"fontText\":\"" << EscapeJsonShout(SafeCString(fontText))
		  << "\",\"translation\":\"" << EscapeJsonShout(SafeCString(translation))
		  << "\",\"editor\":\"" << EscapeJsonShout(SafeCString(editor)) << "\",\"known\":" << (known ? "true" : "false")
		  << ",\"unlocked\":" << (unlocked ? "true" : "false") << "}";
	}
	o << "]}";
}
