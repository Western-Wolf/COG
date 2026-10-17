#include "_UI_KeyHandler.h"

KeyHandler* KeyHandler::GetSingleton()
{
    static KeyHandler singleton;
    return &singleton;
}

void KeyHandler::RegisterSink()
{
    auto inputMgr = RE::BSInputDeviceManager::GetSingleton();
    if (inputMgr) {
        inputMgr->AddEventSink(GetSingleton());
        logger::info("KeyHandler sink registered successfully.");
    }
    else {
        logger::critical("Failed to get InputDeviceManager. KeyHandler sink NOT registered!");
    }
}

[[nodiscard]] KeyHandlerEvent KeyHandler::Register(uint32_t dxScanCode, KeyEventType eventType, KeyCallback callback)
{
    if (!callback) {
        logger::warn("Attempted to register a null callback for key 0x{:X}", dxScanCode);
        return INVALID_REGISTRATION_HANDLE;
    }

    const KeyHandlerEvent handle = _nextHandle.fetch_add(1);
    if (handle == INVALID_REGISTRATION_HANDLE) {
        logger::critical("KeyHandlerEvent overflow detected!");
        _nextHandle.store(INVALID_REGISTRATION_HANDLE + 1);
        return INVALID_REGISTRATION_HANDLE;
    }

    std::unique_lock lock(_mutex);

    logger::debug("Registering callback with handle {} for key 0x{:X}, event type {}", handle, dxScanCode, (eventType == KeyEventType::KEY_DOWN ? "DOWN" : "UP"));

    auto& keyCallbacks = _registeredCallbacks[dxScanCode];
    auto& targetMap = (eventType == KeyEventType::KEY_DOWN) ? keyCallbacks.down : keyCallbacks.up;
    targetMap[handle] = std::move(callback);

    _handleMap[handle] = { dxScanCode, eventType };

    return handle;
}

void KeyHandler::Unregister(KeyHandlerEvent handle)
{
    if (handle == INVALID_REGISTRATION_HANDLE) {
        logger::warn("Attempted to unregister with an invalid handle.");
        return;
    }

    CallbackInfo info;
    bool foundHandle = false;

    std::unique_lock lock(_mutex);

    auto handleIt = _handleMap.find(handle);
    if (handleIt != _handleMap.end()) {
        info = handleIt->second;
        foundHandle = true;
        _handleMap.erase(handleIt);
    }
    else {
        logger::warn("Attempted to unregister handle {}, but it was not found. It might have been already unregistered.", handle);
        return;
    }

    auto keyCallbacksIt = _registeredCallbacks.find(info.key);
    if (keyCallbacksIt != _registeredCallbacks.end()) {
        auto& keyCallbacks = keyCallbacksIt->second;
        auto& targetMap = (info.type == KeyEventType::KEY_DOWN) ? keyCallbacks.down : keyCallbacks.up;

        size_t removedCount = targetMap.erase(handle);

        if (removedCount > 0) {
            logger::debug("Unregistered callback with handle {} for key 0x{:X}, event type {}", handle, info.key, (info.type == KeyEventType::KEY_DOWN ? "DOWN" : "UP"));
        }
        else {
            logger::error("Inconsistency detected: Handle {} found in handle map but corresponding callback not found for key 0x{:X}.", handle, info.key);
        }

        if (keyCallbacks.down.empty() && keyCallbacks.up.empty()) {
            logger::debug("Removing empty key entry 0x{:X} from callback map.", info.key);
            _registeredCallbacks.erase(keyCallbacksIt);
        }

    }
    else {
        logger::error("Inconsistency detected: Handle {} found in handle map but key 0x{:X} not found in callback map.", handle, info.key);
    }
}

bool KeyHandler::Rebind(KeyHandlerEvent handle, uint32_t dxScanCode)
{
    if (handle == INVALID_REGISTRATION_HANDLE || dxScanCode == 0) {
        return false;
    }

    std::unique_lock lock(_mutex);
    auto handleIt = _handleMap.find(handle);
    if (handleIt == _handleMap.end()) {
        return false;
    }
    const auto oldKey = handleIt->second.key;
    const auto type = handleIt->second.type;
    if (oldKey == dxScanCode) {
        return true;
    }

    auto oldKeyIt = _registeredCallbacks.find(oldKey);
    if (oldKeyIt == _registeredCallbacks.end()) {
        return false;
    }
    auto& oldMap = (type == KeyEventType::KEY_DOWN) ? oldKeyIt->second.down : oldKeyIt->second.up;
    auto cbIt = oldMap.find(handle);
    if (cbIt == oldMap.end()) {
        return false;
    }
    auto callback = std::move(cbIt->second);
    oldMap.erase(cbIt);
    if (oldKeyIt->second.down.empty() && oldKeyIt->second.up.empty()) {
        _registeredCallbacks.erase(oldKeyIt);
    }

    auto& newMap = (type == KeyEventType::KEY_DOWN) ? _registeredCallbacks[dxScanCode].down : _registeredCallbacks[dxScanCode].up;
    newMap[handle] = std::move(callback);
    handleIt->second.key = dxScanCode;
    logger::info("Rebound handle {} from key 0x{:X} to 0x{:X}", handle, oldKey, dxScanCode);
    return true;
}

void KeyHandler::SetCapture(KeyCapture capture)
{
    std::unique_lock lock(_mutex);
    _capture = std::move(capture);
}

RE::BSEventNotifyControl KeyHandler::ProcessEvent(RE::InputEvent* const* a_eventList, [[maybe_unused]] RE::BSTEventSource<RE::InputEvent*>* a_eventSource)
{
    if (!a_eventList) {
        return RE::BSEventNotifyControl::kContinue;
    }

    KeyCapture capture;
    {
        std::shared_lock lock(_mutex);
        capture = _capture;
    }

    std::vector<KeyCallback> callbacksToRun;

    for (auto event = *a_eventList; event; event = event->next) {
        if (event->eventType != RE::INPUT_EVENT_TYPE::kButton) {
            continue;
        }

        const auto buttonEvent = event->AsButtonEvent();
        if (!buttonEvent || buttonEvent->GetDevice() != RE::INPUT_DEVICE::kKeyboard) {
            continue;
        }

        const uint32_t dxScanCode = buttonEvent->GetIDCode();
        KeyEventType eventType;

        if (buttonEvent->IsDown()) {
            eventType = KeyEventType::KEY_DOWN;
        }
        else if (buttonEvent->IsUp()) {
            eventType = KeyEventType::KEY_UP;
        }
        else {
            continue;
        }

        if (capture && capture(dxScanCode, eventType)) {
            continue;
        }

        std::shared_lock lock(_mutex);

        auto keyCallbacksIt = _registeredCallbacks.find(dxScanCode);
        if (keyCallbacksIt != _registeredCallbacks.end()) {
            const auto& keyCallbacks = keyCallbacksIt->second;
            const auto& targetMap = (eventType == KeyEventType::KEY_DOWN) ? keyCallbacks.down : keyCallbacks.up;

            if (!targetMap.empty()) {
                callbacksToRun.reserve(callbacksToRun.size() + targetMap.size());
                for (const auto& pair : targetMap) {
                    callbacksToRun.push_back(pair.second);
                }
            }
        }
    }

    if (!callbacksToRun.empty()) {
        for (const auto& callback : callbacksToRun) {
            callback();
        }
    }

    return RE::BSEventNotifyControl::kContinue;
}
