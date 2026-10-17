#pragma once

#include "pch.h"

#include <cstdint>
#include <map>
#include <string>
#include <string_view>
#include <vector>

namespace CogJson
{
	enum class Type : std::uint8_t
	{
		Null,
		Bool,
		Number,
		String,
		Array,
		Object
	};

	struct Value
	{
		Type type = Type::Null;
		bool boolValue = false;
		double numberValue = 0.0;
		std::string stringValue;
		std::vector<Value> arrayValue;
		std::map<std::string, Value> objectValue;

		bool IsNull() const { return type == Type::Null; }
		bool IsBool() const { return type == Type::Bool; }
		bool IsNumber() const { return type == Type::Number; }
		bool IsString() const { return type == Type::String; }
		bool IsArray() const { return type == Type::Array; }
		bool IsObject() const { return type == Type::Object; }

		bool Has(std::string_view key) const;
		const Value* Find(std::string_view key) const;
	};

	const char* TypeName(Type t);

	bool Parse(std::string_view text, Value& out, std::string& err);

	// Compact re-emit of a subtree (for nested blobs like settings / displayLines).
	std::string Stringify(const Value& v, bool pretty = false);

	struct ParseContext
	{
		std::string path;  // e.g. gauges/foo.json
		bool repaired = false;

		bool Has(const Value& obj, std::string_view key) const;
		std::string GetString(const Value& obj, std::string_view key, std::string_view fallback = {});
		bool GetBool(const Value& obj, std::string_view key, bool fallback);
		float GetFloat(const Value& obj, std::string_view key, float fallback);
		int GetInt(const Value& obj, std::string_view key, int fallback);
		const Value* GetObject(const Value& obj, std::string_view key);
		const Value* GetArray(const Value& obj, std::string_view key);
		std::vector<std::string> GetStringArray(const Value& obj, std::string_view key);
		// Object or array → compact JSON text; missing → empty; wrong type → repair + fallbackText.
		std::string GetRawJson(const Value& obj, std::string_view key, std::string_view fallbackText);

	private:
		void WarnWrongType(std::string_view key, Type expected, Type found, std::string_view snippet);
	};

	class Writer
	{
	public:
		explicit Writer(bool pretty);

		void BeginObject();
		void EndObject();
		void BeginArray();
		void EndArray();

		void Key(std::string_view key);
		void Null();
		void Bool(bool v);
		void Number(double v);
		void Int(std::int32_t v);
		void String(std::string_view v);
		void Raw(std::string_view jsonFragment);

		void KeyNull(std::string_view key);
		void KeyBool(std::string_view key, bool v);
		void KeyNumber(std::string_view key, double v);
		void KeyInt(std::string_view key, std::int32_t v);
		void KeyString(std::string_view key, std::string_view v);
		void KeyRaw(std::string_view key, std::string_view jsonFragment);

		std::string str() const { return _out; }

	private:
		void CommaIfNeeded();
		void Indent();
		void EscapeAndWrite(std::string_view v);

		bool _pretty = false;
		bool _pendingComma = false;
		bool _afterKey = false;
		int _depth = 0;
		int _arrayDepth = 0;
		std::string _out;
	};
}
