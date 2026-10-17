#include "_Core_Json.h"

#include <charconv>
#include <cmath>
#include <cstdio>

namespace CogJson
{
	namespace
	{
		struct Parser
		{
			std::string_view text;
			size_t i = 0;
			std::string* err = nullptr;

			bool Fail(const char* msg)
			{
				if (err) {
					*err = msg;
					*err += " at offset ";
					*err += std::to_string(i);
					if (i < text.size()) {
						const size_t begin = i > 16 ? i - 16 : 0;
						const size_t end = (std::min)(text.size(), i + 16);
						*err += " near \"";
						for (size_t k = begin; k < end; ++k) {
							const char c = text[k];
							if (c == '\n' || c == '\r' || c == '\t') {
								err->push_back(' ');
							} else {
								err->push_back(c);
							}
						}
						*err += "\"";
					}
				}
				return false;
			}

			void SkipWs()
			{
				while (i < text.size()) {
					const unsigned char c = static_cast<unsigned char>(text[i]);
					if (c == ' ' || c == '\t' || c == '\n' || c == '\r') {
						++i;
					} else {
						break;
					}
				}
			}

			bool ParseValue(Value& out)
			{
				SkipWs();
				if (i >= text.size()) {
					return Fail("unexpected end of input");
				}
				const char c = text[i];
				if (c == 'n') {
					return ParseLiteral("null", out, Type::Null);
				}
				if (c == 't') {
					if (!ParseLiteral("true", out, Type::Bool)) {
						return false;
					}
					out.boolValue = true;
					return true;
				}
				if (c == 'f') {
					if (!ParseLiteral("false", out, Type::Bool)) {
						return false;
					}
					out.boolValue = false;
					return true;
				}
				if (c == '"') {
					return ParseString(out);
				}
				if (c == '{') {
					return ParseObject(out);
				}
				if (c == '[') {
					return ParseArray(out);
				}
				if (c == '-' || (c >= '0' && c <= '9')) {
					return ParseNumber(out);
				}
				return Fail("unexpected character");
			}

			bool ParseLiteral(const char* lit, Value& out, Type type)
			{
				const size_t n = std::char_traits<char>::length(lit);
				if (text.substr(i, n) != lit) {
					return Fail("invalid literal");
				}
				i += n;
				out = Value{};
				out.type = type;
				return true;
			}

			bool ParseString(Value& out)
			{
				++i;  // "
				std::string s;
				while (i < text.size()) {
					const char c = text[i++];
					if (c == '"') {
						out = Value{};
						out.type = Type::String;
						out.stringValue = std::move(s);
						return true;
					}
					if (static_cast<unsigned char>(c) < 0x20) {
						return Fail("unescaped control character in string");
					}
					if (c != '\\') {
						s.push_back(c);
						continue;
					}
					if (i >= text.size()) {
						return Fail("truncated escape");
					}
					const char e = text[i++];
					switch (e) {
					case '"':
					case '\\':
					case '/':
						s.push_back(e);
						break;
					case 'b':
						s.push_back('\b');
						break;
					case 'f':
						s.push_back('\f');
						break;
					case 'n':
						s.push_back('\n');
						break;
					case 'r':
						s.push_back('\r');
						break;
					case 't':
						s.push_back('\t');
						break;
					case 'u': {
						if (i + 4 > text.size()) {
							return Fail("truncated unicode escape");
						}
						unsigned code = 0;
						for (int k = 0; k < 4; ++k) {
							const char h = text[i++];
							code <<= 4;
							if (h >= '0' && h <= '9') {
								code |= static_cast<unsigned>(h - '0');
							} else if (h >= 'a' && h <= 'f') {
								code |= static_cast<unsigned>(h - 'a' + 10);
							} else if (h >= 'A' && h <= 'F') {
								code |= static_cast<unsigned>(h - 'A' + 10);
							} else {
								return Fail("invalid unicode escape");
							}
						}
						if (code <= 0x7F) {
							s.push_back(static_cast<char>(code));
						} else if (code <= 0x7FF) {
							s.push_back(static_cast<char>(0xC0 | (code >> 6)));
							s.push_back(static_cast<char>(0x80 | (code & 0x3F)));
						} else {
							s.push_back(static_cast<char>(0xE0 | (code >> 12)));
							s.push_back(static_cast<char>(0x80 | ((code >> 6) & 0x3F)));
							s.push_back(static_cast<char>(0x80 | (code & 0x3F)));
						}
						break;
					}
					default:
						return Fail("invalid escape");
					}
				}
				return Fail("unterminated string");
			}

			bool ParseNumber(Value& out)
			{
				const size_t start = i;
				if (text[i] == '-') {
					++i;
				}
				if (i >= text.size() || text[i] < '0' || text[i] > '9') {
					return Fail("invalid number");
				}
				if (text[i] == '0') {
					++i;
				} else {
					while (i < text.size() && text[i] >= '0' && text[i] <= '9') {
						++i;
					}
				}
				if (i < text.size() && text[i] == '.') {
					++i;
					if (i >= text.size() || text[i] < '0' || text[i] > '9') {
						return Fail("invalid number fraction");
					}
					while (i < text.size() && text[i] >= '0' && text[i] <= '9') {
						++i;
					}
				}
				if (i < text.size() && (text[i] == 'e' || text[i] == 'E')) {
					++i;
					if (i < text.size() && (text[i] == '+' || text[i] == '-')) {
						++i;
					}
					if (i >= text.size() || text[i] < '0' || text[i] > '9') {
						return Fail("invalid number exponent");
					}
					while (i < text.size() && text[i] >= '0' && text[i] <= '9') {
						++i;
					}
				}
				double v = 0.0;
				const auto slice = text.substr(start, i - start);
				const auto* begin = slice.data();
				const auto* end = begin + slice.size();
				auto res = std::from_chars(begin, end, v);
				if (res.ec != std::errc{} || res.ptr != end) {
					// from_chars may lack full float support on some MSVC configs; fall back.
					try {
						v = std::stod(std::string(slice));
					} catch (...) {
						return Fail("invalid number value");
					}
				}
				out = Value{};
				out.type = Type::Number;
				out.numberValue = v;
				return true;
			}

			bool ParseArray(Value& out)
			{
				++i;  // [
				Value arr;
				arr.type = Type::Array;
				SkipWs();
				if (i < text.size() && text[i] == ']') {
					++i;
					out = std::move(arr);
					return true;
				}
				for (;;) {
					Value elem;
					if (!ParseValue(elem)) {
						return false;
					}
					arr.arrayValue.push_back(std::move(elem));
					SkipWs();
					if (i >= text.size()) {
						return Fail("unterminated array");
					}
					if (text[i] == ',') {
						++i;
						continue;
					}
					if (text[i] == ']') {
						++i;
						out = std::move(arr);
						return true;
					}
					return Fail("expected ',' or ']' in array");
				}
			}

			bool ParseObject(Value& out)
			{
				++i;  // {
				Value obj;
				obj.type = Type::Object;
				SkipWs();
				if (i < text.size() && text[i] == '}') {
					++i;
					out = std::move(obj);
					return true;
				}
				for (;;) {
					SkipWs();
					if (i >= text.size() || text[i] != '"') {
						return Fail("expected object key");
					}
					Value keyVal;
					if (!ParseString(keyVal)) {
						return false;
					}
					SkipWs();
					if (i >= text.size() || text[i] != ':') {
						return Fail("expected ':' after object key");
					}
					++i;
					Value val;
					if (!ParseValue(val)) {
						return false;
					}
					obj.objectValue[std::move(keyVal.stringValue)] = std::move(val);
					SkipWs();
					if (i >= text.size()) {
						return Fail("unterminated object");
					}
					if (text[i] == ',') {
						++i;
						continue;
					}
					if (text[i] == '}') {
						++i;
						out = std::move(obj);
						return true;
					}
					return Fail("expected ',' or '}' in object");
				}
			}
		};

		void AppendStringify(std::string& out, const Value& v)
		{
			switch (v.type) {
			case Type::Null:
				out += "null";
				break;
			case Type::Bool:
				out += v.boolValue ? "true" : "false";
				break;
			case Type::Number: {
				char buf[64];
				const auto n = std::snprintf(buf, sizeof(buf), "%.10g", v.numberValue);
				if (n > 0) {
					out.append(buf, static_cast<size_t>(n));
				} else {
					out += "0";
				}
				break;
			}
			case Type::String: {
				out.push_back('"');
				for (unsigned char c : v.stringValue) {
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
					case '\t':
						out += "\\t";
						break;
					default:
						if (c < 0x20) {
							char esc[8];
							std::snprintf(esc, sizeof(esc), "\\u%04x", c);
							out += esc;
						} else {
							out.push_back(static_cast<char>(c));
						}
						break;
					}
				}
				out.push_back('"');
				break;
			}
			case Type::Array: {
				out.push_back('[');
				for (size_t i = 0; i < v.arrayValue.size(); ++i) {
					if (i) {
						out.push_back(',');
					}
					AppendStringify(out, v.arrayValue[i]);
				}
				out.push_back(']');
				break;
			}
			case Type::Object: {
				out.push_back('{');
				bool first = true;
				for (const auto& [k, child] : v.objectValue) {
					if (!first) {
						out.push_back(',');
					}
					first = false;
					Value key;
					key.type = Type::String;
					key.stringValue = k;
					AppendStringify(out, key);
					out.push_back(':');
					AppendStringify(out, child);
				}
				out.push_back('}');
				break;
			}
			}
		}

		std::string ShortSnippet(const Value& v)
		{
			std::string s;
			AppendStringify(s, v);
			if (s.size() > 48) {
				s.resize(45);
				s += "...";
			}
			return s;
		}
	}

	const char* TypeName(Type t)
	{
		switch (t) {
		case Type::Null:
			return "null";
		case Type::Bool:
			return "bool";
		case Type::Number:
			return "number";
		case Type::String:
			return "string";
		case Type::Array:
			return "array";
		case Type::Object:
			return "object";
		}
		return "unknown";
	}

	bool Value::Has(std::string_view key) const
	{
		return Find(key) != nullptr;
	}

	const Value* Value::Find(std::string_view key) const
	{
		if (!IsObject()) {
			return nullptr;
		}
		const auto it = objectValue.find(std::string(key));
		if (it == objectValue.end()) {
			return nullptr;
		}
		return &it->second;
	}

	bool Parse(std::string_view text, Value& out, std::string& err)
	{
		err.clear();
		Parser p{ text, 0, &err };
		Value root;
		if (!p.ParseValue(root)) {
			out = Value{};
			return false;
		}
		p.SkipWs();
		if (p.i < p.text.size()) {
			p.Fail("trailing characters after JSON value");
			out = Value{};
			return false;
		}
		out = std::move(root);
		return true;
	}

	std::string Stringify(const Value& v, bool pretty)
	{
		(void)pretty;  // nested blobs stay compact; pretty is Writer's job
		std::string out;
		AppendStringify(out, v);
		return out;
	}

	void ParseContext::WarnWrongType(std::string_view key, Type expected, Type found, std::string_view snippet)
	{
		repaired = true;
		logger::warn(
			"COG: repaired JSON in {} — key \"{}\" expected {}, found {} (value {}); using default",
			path.empty() ? "<memory>" : path,
			key,
			TypeName(expected),
			TypeName(found),
			snippet);
	}

	bool ParseContext::Has(const Value& obj, std::string_view key) const
	{
		return obj.Has(key);
	}

	std::string ParseContext::GetString(const Value& obj, std::string_view key, std::string_view fallback)
	{
		const Value* v = obj.Find(key);
		if (!v) {
			return std::string(fallback);
		}
		if (!v->IsString()) {
			WarnWrongType(key, Type::String, v->type, ShortSnippet(*v));
			return std::string(fallback);
		}
		return v->stringValue;
	}

	bool ParseContext::GetBool(const Value& obj, std::string_view key, bool fallback)
	{
		const Value* v = obj.Find(key);
		if (!v) {
			return fallback;
		}
		if (!v->IsBool()) {
			WarnWrongType(key, Type::Bool, v->type, ShortSnippet(*v));
			return fallback;
		}
		return v->boolValue;
	}

	float ParseContext::GetFloat(const Value& obj, std::string_view key, float fallback)
	{
		const Value* v = obj.Find(key);
		if (!v) {
			return fallback;
		}
		if (!v->IsNumber()) {
			WarnWrongType(key, Type::Number, v->type, ShortSnippet(*v));
			return fallback;
		}
		return static_cast<float>(v->numberValue);
	}

	int ParseContext::GetInt(const Value& obj, std::string_view key, int fallback)
	{
		const Value* v = obj.Find(key);
		if (!v) {
			return fallback;
		}
		if (!v->IsNumber()) {
			WarnWrongType(key, Type::Number, v->type, ShortSnippet(*v));
			return fallback;
		}
		return static_cast<int>(v->numberValue);
	}

	const Value* ParseContext::GetObject(const Value& obj, std::string_view key)
	{
		const Value* v = obj.Find(key);
		if (!v) {
			return nullptr;
		}
		if (!v->IsObject()) {
			WarnWrongType(key, Type::Object, v->type, ShortSnippet(*v));
			return nullptr;
		}
		return v;
	}

	const Value* ParseContext::GetArray(const Value& obj, std::string_view key)
	{
		const Value* v = obj.Find(key);
		if (!v) {
			return nullptr;
		}
		if (!v->IsArray()) {
			WarnWrongType(key, Type::Array, v->type, ShortSnippet(*v));
			return nullptr;
		}
		return v;
	}

	std::vector<std::string> ParseContext::GetStringArray(const Value& obj, std::string_view key)
	{
		std::vector<std::string> out;
		const Value* arr = GetArray(obj, key);
		if (!arr) {
			return out;
		}
		out.reserve(arr->arrayValue.size());
		for (size_t i = 0; i < arr->arrayValue.size(); ++i) {
			const auto& elem = arr->arrayValue[i];
			if (!elem.IsString()) {
				WarnWrongType(
					std::string(key) + "[" + std::to_string(i) + "]",
					Type::String,
					elem.type,
					ShortSnippet(elem));
				continue;
			}
			out.push_back(elem.stringValue);
		}
		return out;
	}

	std::string ParseContext::GetRawJson(const Value& obj, std::string_view key, std::string_view fallbackText)
	{
		const Value* v = obj.Find(key);
		if (!v) {
			return {};
		}
		if (!v->IsObject() && !v->IsArray()) {
			WarnWrongType(key, Type::Object, v->type, ShortSnippet(*v));
			return std::string(fallbackText);
		}
		return Stringify(*v, false);
	}

	Writer::Writer(bool pretty) :
		_pretty(pretty)
	{
		_out.reserve(256);
	}

	void Writer::CommaIfNeeded()
	{
		if (_pendingComma) {
			_out.push_back(',');
			if (_pretty && _arrayDepth == 0) {
				_out.push_back('\n');
			} else if (_pretty && _arrayDepth > 0) {
				_out.push_back(' ');
			}
		}
	}

	void Writer::Indent()
	{
		if (!_pretty || _arrayDepth > 0) {
			return;
		}
		for (int i = 0; i < _depth; ++i) {
			_out.push_back('\t');
		}
	}

	void Writer::EscapeAndWrite(std::string_view v)
	{
		_out.push_back('"');
		for (unsigned char c : v) {
			switch (c) {
			case '"':
				_out += "\\\"";
				break;
			case '\\':
				_out += "\\\\";
				break;
			case '\n':
				_out += "\\n";
				break;
			case '\r':
				_out += "\\r";
				break;
			case '\t':
				_out += "\\t";
				break;
			default:
				if (c < 0x20) {
					char buf[8];
					std::snprintf(buf, sizeof(buf), "\\u%04x", static_cast<unsigned>(c));
					_out += buf;
				} else {
					_out.push_back(static_cast<char>(c));
				}
				break;
			}
		}
		_out.push_back('"');
	}

	void Writer::BeginObject()
	{
		if (!_afterKey) {
			CommaIfNeeded();
			Indent();
		}
		_afterKey = false;
		_out.push_back('{');
		if (_pretty) {
			_out.push_back('\n');
		}
		++_depth;
		_pendingComma = false;
	}

	void Writer::EndObject()
	{
		--_depth;
		if (_pretty) {
			_out.push_back('\n');
			Indent();
		}
		_out.push_back('}');
		_pendingComma = true;
		_afterKey = false;
	}

	void Writer::BeginArray()
	{
		if (!_afterKey) {
			CommaIfNeeded();
			Indent();
		}
		_afterKey = false;
		_out.push_back('[');
		++_depth;
		++_arrayDepth;
		_pendingComma = false;
	}

	void Writer::EndArray()
	{
		--_arrayDepth;
		--_depth;
		_out.push_back(']');
		_pendingComma = true;
		_afterKey = false;
	}

	void Writer::Key(std::string_view key)
	{
		CommaIfNeeded();
		Indent();
		EscapeAndWrite(key);
		_out.push_back(':');
		_pendingComma = false;
		_afterKey = true;
	}

	void Writer::Null()
	{
		if (!_afterKey) {
			CommaIfNeeded();
			Indent();
		}
		_afterKey = false;
		_out += "null";
		_pendingComma = true;
	}

	void Writer::Bool(bool v)
	{
		if (!_afterKey) {
			CommaIfNeeded();
			Indent();
		}
		_afterKey = false;
		_out += v ? "true" : "false";
		_pendingComma = true;
	}

	void Writer::Number(double v)
	{
		if (!_afterKey) {
			CommaIfNeeded();
			Indent();
		}
		_afterKey = false;
		if (!std::isfinite(v)) {
			_out += "0";
			_pendingComma = true;
			return;
		}
		// Snap float32 noise so UI decimals round-trip (1.3f must not become 1.299999952).
		constexpr double kScale = 1e6;
		const double snapped = std::round(v * kScale) / kScale;
		char buf[64];
		const auto n = std::snprintf(buf, sizeof(buf), "%.6g", snapped);
		if (n > 0) {
			_out.append(buf, static_cast<size_t>(n));
		} else {
			_out += "0";
		}
		_pendingComma = true;
	}

	void Writer::Int(std::int32_t v)
	{
		Number(static_cast<double>(v));
	}

	void Writer::String(std::string_view v)
	{
		if (!_afterKey) {
			CommaIfNeeded();
			Indent();
		}
		_afterKey = false;
		EscapeAndWrite(v);
		_pendingComma = true;
	}

	void Writer::Raw(std::string_view jsonFragment)
	{
		if (!_afterKey) {
			CommaIfNeeded();
			Indent();
		}
		_afterKey = false;
		_out.append(jsonFragment);
		_pendingComma = true;
	}

	void Writer::KeyNull(std::string_view key)
	{
		Key(key);
		Null();
	}

	void Writer::KeyBool(std::string_view key, bool v)
	{
		Key(key);
		Bool(v);
	}

	void Writer::KeyNumber(std::string_view key, double v)
	{
		Key(key);
		Number(v);
	}

	void Writer::KeyInt(std::string_view key, std::int32_t v)
	{
		Key(key);
		Int(v);
	}

	void Writer::KeyString(std::string_view key, std::string_view v)
	{
		Key(key);
		String(v);
	}

	void Writer::KeyRaw(std::string_view key, std::string_view jsonFragment)
	{
		Key(key);
		Raw(jsonFragment);
	}
}
