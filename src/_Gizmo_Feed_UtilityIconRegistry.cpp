#include "pch.h"
#include "_Gizmo_Feed_UtilityIconRegistry.h"
#include "_Gizmo_Feed_UtilityStrings.h"

#include "RE/B/BGSKeywordForm.h"

#include <cctype>
#include <fstream>
#include <iomanip>
#include <sstream>
#include <vector>

namespace CogFeed::IconRegistry
{
	using CogFeed::Strings::Lower;
	using CogFeed::Strings::NormalizeIconPath;
	using CogFeed::Strings::Trim;

	KindSet BaseKinds()
	{
		return { "name", "form" };
	}

	KindSet NotificationKinds()
	{
		return BaseKinds();
	}

	KindSet SkillsKinds()
	{
		return BaseKinds();
	}

	KindSet LocationKinds()
	{
		auto k = BaseKinds();
		k.insert("kind");
		return k;
	}

	KindSet InventoryKinds()
	{
		auto k = BaseKinds();
		k.insert("keyword");
		k.insert("formtype");
		k.insert("weapontype");
		k.insert("armortype");
		k.insert("armorslot");
		return k;
	}

	KindSet EffectKinds()
	{
		auto k = BaseKinds();
		k.insert("keyword");
		k.insert("formtype");
		k.insert("av");
		k.insert("archetype");
		return k;
	}

	void PushCandidate(Candidates& c, const char* kind, std::string value)
	{
		if (!kind || !kind[0]) {
			return;
		}
		value = Lower(Trim(std::move(value)));
		if (value.empty() || value == "none") {
			return;
		}
		c[kind].push_back(std::move(value));
	}

	void PushCandidateRaw(Candidates& c, const char* kind, std::string value)
	{
		if (!kind || !kind[0] || value.empty()) {
			return;
		}
		c[kind].push_back(std::move(value));
	}

	void CollectFormKeywords(Candidates& c, RE::TESForm* form)
	{
		auto* kf = form ? form->As<RE::BGSKeywordForm>() : nullptr;
		if (!kf) {
			return;
		}
		kf->ForEachKeyword([&](RE::BGSKeyword* kw) {
			if (kw) {
				if (const char* edid = kw->GetFormEditorID(); edid && edid[0]) {
					PushCandidate(c, "keyword", edid);
				}
			}
			return RE::BSContainer::ForEachResult::kContinue;
		});
	}

	namespace
	{
		constexpr char kBacktick = '`';

		std::string NormalizeFormIdHex(std::string raw)
		{
			raw = Trim(std::move(raw));
			if (raw.size() >= 2 && raw[0] == '0' && (raw[1] == 'x' || raw[1] == 'X')) {
				raw.erase(0, 2);
			}
			raw = Lower(std::move(raw));
			while (raw.size() < 8) {
				raw.insert(raw.begin(), '0');
			}
			if (raw.size() > 8) {
				raw = raw.substr(raw.size() - 8);
			}
			for (char c : raw) {
				if (!std::isxdigit(static_cast<unsigned char>(c))) {
					return {};
				}
			}
			return raw;
		}

		bool ParseFormNeedle(std::string_view raw, std::string& outKey)
		{
			const auto colon = raw.find(':');
			if (colon == std::string_view::npos || colon == 0 || colon + 1 >= raw.size()) {
				return false;
			}
			auto plugin = Lower(Trim(std::string{ raw.substr(0, colon) }));
			auto idHex = NormalizeFormIdHex(std::string{ raw.substr(colon + 1) });
			if (plugin.empty() || idHex.empty()) {
				return false;
			}
			std::uint32_t id = 0;
			{
				std::stringstream ss;
				ss << std::hex << idHex;
				ss >> id;
			}
			id &= 0x00FFFFFFu;
			std::ostringstream o;
			o << "form:" << plugin << ':' << std::hex << std::setw(6) << std::setfill('0') << id;
			outKey = o.str();
			return true;
		}

		bool ParseOp(std::string_view tok, Op& out)
		{
			const auto t = Lower(std::string{ tok });
			if (t == "equals") {
				out = Op::Equals;
				return true;
			}
			if (t == "notequals") {
				out = Op::NotEquals;
				return true;
			}
			if (t == "contains") {
				out = Op::Contains;
				return true;
			}
			if (t == "notcontains") {
				out = Op::NotContains;
				return true;
			}
			return false;
		}

		bool ClauseMatches(Op op, std::string_view candidateLower, std::string_view needleLower)
		{
			switch (op) {
			case Op::Equals:
				return candidateLower == needleLower;
			case Op::NotEquals:
				return candidateLower != needleLower;
			case Op::Contains:
				return !needleLower.empty() && candidateLower.find(needleLower) != std::string_view::npos;
			case Op::NotContains:
				return needleLower.empty() || candidateLower.find(needleLower) == std::string_view::npos;
			}
			return false;
		}

		bool RuleMatches(const Rule& rule, const Candidates& candidates)
		{
			const auto it = candidates.find(rule.kind);
			if (it == candidates.end() || it->second.empty()) {
				return false;
			}
			const auto& vals = it->second;
			for (const auto& clause : rule.clauses) {
				bool any = false;
				for (const auto& cand : vals) {
					if (ClauseMatches(clause.op, cand, clause.needle)) {
						any = true;
						break;
					}
				}
				if (!any) {
					return false;
				}
			}
			return true;
		}

		std::string MakePatternKey(std::string_view kind, const std::vector<Clause>& clauses)
		{
			std::ostringstream o;
			o << kind;
			for (const auto& c : clauses) {
				o << '\x1f' << static_cast<int>(c.op) << '\x1f' << c.needle;
			}
			return o.str();
		}

		/** Parse: kind op `needle` [op `needle` ...] */
		bool ParseLhs(
			std::string lhsRaw,
			const KindSet& allowedKinds,
			std::string& outKind,
			std::vector<Clause>& outClauses,
			std::string& err)
		{
			outKind.clear();
			outClauses.clear();
			lhsRaw = Trim(std::move(lhsRaw));
			if (lhsRaw.empty()) {
				err = "empty lhs";
				return false;
			}
			const std::string_view lhs = lhsRaw;

			std::size_t i = 0;
			while (i < lhs.size() && !std::isspace(static_cast<unsigned char>(lhs[i]))) {
				++i;
			}
			outKind = Lower(std::string{ lhs.substr(0, i) });
			if (!allowedKinds.contains(outKind)) {
				err = "kind '" + outKind + "' not allowed for this feed section";
				return false;
			}
			while (i < lhs.size() && std::isspace(static_cast<unsigned char>(lhs[i]))) {
				++i;
			}
			if (i >= lhs.size()) {
				err = "missing operator";
				return false;
			}

			while (i < lhs.size()) {
				while (i < lhs.size() && std::isspace(static_cast<unsigned char>(lhs[i]))) {
					++i;
				}
				if (i >= lhs.size()) {
					break;
				}
				std::size_t opStart = i;
				while (i < lhs.size() && !std::isspace(static_cast<unsigned char>(lhs[i])) && lhs[i] != kBacktick) {
					++i;
				}
				Op op{};
				if (!ParseOp(lhs.substr(opStart, i - opStart), op)) {
					err = "bad operator";
					return false;
				}
				while (i < lhs.size() && std::isspace(static_cast<unsigned char>(lhs[i]))) {
					++i;
				}
				if (i >= lhs.size() || lhs[i] != kBacktick) {
					err = "expected backtick-delimited needle";
					return false;
				}
				++i;
				const auto needleStart = i;
				while (i < lhs.size() && lhs[i] != kBacktick) {
					++i;
				}
				if (i >= lhs.size()) {
					err = "unclosed backtick";
					return false;
				}
				std::string needle{ lhs.substr(needleStart, i - needleStart) };
				++i; // closing backtick
				if (needle.empty()) {
					err = "empty needle";
					return false;
				}
				if (outKind == "form") {
					std::string formKey;
					if (!ParseFormNeedle(needle, formKey)) {
						err = "bad form key";
						return false;
					}
					needle = std::move(formKey);
				} else {
					needle = Lower(std::move(needle));
				}
				outClauses.push_back(Clause{ op, std::move(needle) });
			}
			if (outClauses.empty()) {
				err = "no clauses";
				return false;
			}
			return true;
		}

		void UpsertRule(Store& store, Rule rule)
		{
			for (auto& existing : store.rules) {
				if (existing.patternKey == rule.patternKey) {
					existing.icon = std::move(rule.icon);
					return;
				}
			}
			store.rules.push_back(std::move(rule));
		}

		void ApplyLine(
			Store& store,
			const KindSet& allowedKinds,
			std::string_view lhs,
			std::string icon,
			const std::string& file,
			std::size_t lineNo,
			std::string_view logTag)
		{
			icon = NormalizeIconPath(std::move(icon));
			if (icon.empty()) {
				logger::warn("{}: {}:{} bad icon path", logTag, file, lineNo);
				return;
			}
			std::string kind;
			std::vector<Clause> clauses;
			std::string err;
			if (!ParseLhs(std::string{ lhs }, allowedKinds, kind, clauses, err)) {
				logger::warn("{}: {}:{} {}", logTag, file, lineNo, err);
				return;
			}
			Rule rule;
			rule.kind = std::move(kind);
			rule.clauses = std::move(clauses);
			rule.patternKey = MakePatternKey(rule.kind, rule.clauses);
			rule.icon = std::move(icon);
			UpsertRule(store, std::move(rule));
		}

		void ParseFile(
			Store& store,
			const KindSet& allowedKinds,
			const std::filesystem::path& path,
			std::string_view logTag)
		{
			std::ifstream in(path);
			if (!in) {
				logger::warn("{}: failed to open {}", logTag, path.string());
				return;
			}
			const auto fileName = path.filename().string();
			std::string line;
			std::size_t lineNo = 0;
			while (std::getline(in, line)) {
				++lineNo;
				auto trimmed = Trim(line);
				if (trimmed.empty() || trimmed.front() == '#') {
					continue;
				}
				const auto eq = trimmed.find('=');
				if (eq == std::string::npos) {
					logger::warn("{}: {}:{} missing '='", logTag, fileName, lineNo);
					continue;
				}
				ApplyLine(
					store,
					allowedKinds,
					Trim(trimmed.substr(0, eq)),
					Trim(trimmed.substr(eq + 1)),
					fileName,
					lineNo,
					logTag);
			}
		}
	}

	std::string FormLookupKey(RE::TESForm* form)
	{
		if (!form) {
			return {};
		}
		const auto* file = form->GetFile(0);
		if (!file) {
			return {};
		}
		const auto plugin = Lower(std::string{ file->GetFilename() });
		const auto local = form->GetLocalFormID() & 0x00FFFFFFu;
		std::ostringstream o;
		o << "form:" << plugin << ':' << std::hex << std::setw(6) << std::setfill('0') << local;
		return o.str();
	}

	void LoadDir(
		const std::filesystem::path& dir,
		Store& out,
		std::string_view logTag,
		const KindSet& allowedKinds)
	{
		out.rules.clear();
		out.loaded = false;

		std::error_code ec;
		std::filesystem::create_directories(dir, ec);

		std::vector<std::filesystem::path> files;
		if (std::filesystem::exists(dir, ec)) {
			for (const auto& entry : std::filesystem::directory_iterator(dir, ec)) {
				if (!entry.is_regular_file(ec)) {
					continue;
				}
				if (Lower(entry.path().extension().string()) != ".txt") {
					continue;
				}
				files.push_back(entry.path());
			}
		}
		std::sort(files.begin(), files.end(), [](const auto& a, const auto& b) {
			return Lower(a.filename().string()) < Lower(b.filename().string());
		});

		for (const auto& path : files) {
			ParseFile(out, allowedKinds, path, logTag);
		}

		out.loaded = true;
		logger::info("{}: loaded {} file(s) — {} rule(s) from {}", logTag, files.size(), out.rules.size(), dir.string());
	}

	std::string Resolve(const Store& store, const Candidates& candidates)
	{
		if (!store.loaded) {
			return {};
		}
		std::string icon;
		for (const auto& rule : store.rules) {
			if (RuleMatches(rule, candidates)) {
				icon = rule.icon;
			}
		}
		return icon;
	}
}
