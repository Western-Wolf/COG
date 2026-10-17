#include "pch.h"
#include "Papyrus.h"
#include "IconImport.h"

namespace
{
	void SKSEMessageHandler(SKSE::MessagingInterface::Message* message)
	{
		if (message->type == SKSE::MessagingInterface::kDataLoaded) {
			CogIWant::MarkReady();
			logger::info("COG_iWant ready (data loaded)");
		}
	}
}

SKSE_PLUGIN_LOAD(const SKSE::LoadInterface* a_skse)
{
	REL::Module::reset();
	SKSE::Init(a_skse, { .trampoline = true, .trampolineSize = 1 << 10 });

	auto* papyrus = SKSE::GetPapyrusInterface();
	if (!papyrus || !papyrus->Register(CogIWantPapyrus::Bind)) {
		logger::critical("COG_iWant: failed to register Papyrus natives");
		return false;
	}

	auto* messaging = SKSE::GetMessagingInterface();
	if (!messaging) {
		logger::critical("COG_iWant: failed to get SKSE messaging interface");
		return false;
	}
	messaging->RegisterListener("SKSE", SKSEMessageHandler);

	// IsReady / ImportIcon wait for kDataLoaded (MarkReady in SKSEMessageHandler).
	logger::info("COG_iWant plugin loaded");
	return true;
}
