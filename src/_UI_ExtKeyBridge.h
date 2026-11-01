#pragma once

// Bridges OS-level F13–F24 (Stream Deck, iCUE, AHK, …) into Skyrim's input
// sink. DirectInput does not deliver those keys; GetAsyncKeyState does.
// When SkyManager.dll is loaded it already owns this bridge — we stand down
// so presses are not injected twice.

namespace CogExtKeyBridge
{
	void Start();
}
