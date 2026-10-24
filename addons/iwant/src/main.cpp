#include "pch.h"
#include "Papyrus.h"
#include "IconImport.h"

namespace
{
	std::string LoadedEspHeaderVersion(std::string_view pluginFile)
	{
		auto* data = RE::TESDataHandler::GetSingleton();
		if (!data || pluginFile.empty()) {
			return {};
		}
		const RE::TESFile* file = data->LookupLoadedModByName(pluginFile);
		if (!file) {
			file = data->LookupLoadedLightModByName(pluginFile);
		}
		if (!file) {
			file = data->LookupModByName(pluginFile);
			if (file && file->GetCompileIndex() == 0xFF) {
				file = nullptr;
			}
		}
		if (!file) {
			return {};
		}
		auto s = std::format("{:.2f}", file->version);
		while (s.size() > 1 && s.back() == '0') {
			s.pop_back();
		}
		if (!s.empty() && s.back() == '.') {
			s.pop_back();
		}
		return s;
	}

	void LogEspVersionsWhenLoaded()
	{
		const auto dll =
			SKSE::PluginDeclaration::GetSingleton()
				? REL::FormatProductVersion(SKSE::PluginDeclaration::GetSingleton()->GetVersion())
				: std::string{ "?" };
		constexpr const char* kWidgets = "iWant Widgets.esl";
		constexpr const char* kStatusBars = "iWant Status Bars.esp";
		const auto widgets = LoadedEspHeaderVersion(kWidgets);
		const auto statusBars = LoadedEspHeaderVersion(kStatusBars);
		logger::info(
			"COG_iWant: version check — DLL v{}, '{}' header v{}, '{}' header v{}",
			dll,
			kWidgets,
			widgets.empty() ? "(not loaded)" : widgets,
			kStatusBars,
			statusBars.empty() ? "(not loaded)" : statusBars);
	}

	void SKSEMessageHandler(SKSE::MessagingInterface::Message* message)
	{
		if (message->type == SKSE::MessagingInterface::kDataLoaded) {
			CogIWant::MarkReady();
			LogEspVersionsWhenLoaded();
			logger::info("COG_iWant ready (data loaded)");
		}
	}
}

SKSE_PLUGIN_LOAD(const SKSE::LoadInterface* a_skse)
{
	REL::Module::reset();
	SKSE::Init(a_skse, { .trampoline = true, .trampolineSize = 1 << 10 });

	const auto* plugin = SKSE::PluginDeclaration::GetSingleton();
	const auto version = plugin ? REL::FormatProductVersion(plugin->GetVersion()) : std::string{ "?" };
	const auto name = plugin ? plugin->GetName() : "COG_iWant"sv;
	logger::info("{} v{} loaded", name, version);

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
	return true;
}
