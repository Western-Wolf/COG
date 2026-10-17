#pragma once

#include <filesystem>
#include <initializer_list>
#include <string>
#include <string_view>
#include <unordered_map>
#include <unordered_set>
#include <vector>

namespace RE
{
	class TESForm;
}

namespace CogFeed::IconRegistry
{
	enum class Op
	{
		Equals,
		NotEquals,
		Contains,
		NotContains
	};

	struct Clause
	{
		Op op = Op::Equals;
		std::string needle; // already lowercased (except significant spaces)
	};

	struct Rule
	{
		std::string kind; // form, name, av, …
		std::vector<Clause> clauses;
		std::string icon;
		std::string patternKey; // kind + clauses for identical-LHS replace
	};

	struct Store
	{
		std::vector<Rule> rules;
		bool loaded = false;
	};

	/** kind -> candidate strings (lowercased where appropriate; form keys use form:plugin:hex). */
	using Candidates = std::unordered_map<std::string, std::vector<std::string>>;
	using KindSet = std::unordered_set<std::string>;

	/** Base kinds every feed section accepts: name + form. */
	[[nodiscard]] KindSet BaseKinds();
	[[nodiscard]] KindSet NotificationKinds();
	[[nodiscard]] KindSet SkillsKinds();
	[[nodiscard]] KindSet LocationKinds();
	[[nodiscard]] KindSet InventoryKinds();
	[[nodiscard]] KindSet EffectKinds();

	[[nodiscard]] std::string FormLookupKey(RE::TESForm* form);

	/** Push lowercased trimmed candidate; skips empty / "none". */
	void PushCandidate(Candidates& c, const char* kind, std::string value);
	/** Push as-is (e.g. already-normalized form: keys). */
	void PushCandidateRaw(Candidates& c, const char* kind, std::string value);
	/** All keyword EditorIDs on the form (as kind "keyword"). */
	void CollectFormKeywords(Candidates& c, RE::TESForm* form);

	/**
	 * Scan dir for *.txt (A→Z); identical LHS replaced by later file; sets out.loaded.
	 * Only kinds in allowedKinds are accepted (section-scoped extras on top of base).
	 */
	void LoadDir(
		const std::filesystem::path& dir,
		Store& out,
		std::string_view logTag,
		const KindSet& allowedKinds);

	/**
	 * Last matching rule wins (files A→Z, lines top→bottom).
	 * Empty = no rule hit.
	 */
	[[nodiscard]] std::string Resolve(const Store& store, const Candidates& candidates);
}
