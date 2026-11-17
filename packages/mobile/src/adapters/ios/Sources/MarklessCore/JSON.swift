import Foundation

/// A parsed JSON value that keeps object keys in source order and rejects duplicate keys.
public indirect enum JSONValue: Equatable, Sendable {
	case null
	case bool(Bool)
	case number(Double)
	case string(String)
	case array([JSONValue])
	case object([(String, JSONValue)])

	public static func == (a: JSONValue, b: JSONValue) -> Bool {
		switch (a, b) {
		case (.null, .null): return true
		case let (.bool(x), .bool(y)): return x == y
		case let (.number(x), .number(y)): return x == y
		case let (.string(x), .string(y)): return x == y
		case let (.array(x), .array(y)): return x == y
		case let (.object(x), .object(y)):
			return x.count == y.count && zip(x, y).allSatisfy { $0.0 == $1.0 && $0.1 == $1.1 }
		default: return false
		}
	}

	public static func parse(_ data: Data) throws -> JSONValue {
		var parser = JSONParser(bytes: Array(data))
		parser.skipWhitespace()
		let value = try parser.value(depth: 0)
		parser.skipWhitespace()
		guard parser.index == parser.bytes.count else { throw parser.failure("trailing characters") }
		return value
	}

	/// The same text JavaScript's `JSON.stringify` writes for this value.
	public var jsonText: String {
		switch self {
		case .null: return "null"
		case let .bool(value): return value ? "true" : "false"
		case let .number(value): return value.isFinite ? formatJavaScriptNumber(value) : "null"
		case let .string(value): return quoteJavaScriptString(value)
		case let .array(items): return "[" + items.map(\.jsonText).joined(separator: ",") + "]"
		case let .object(fields):
			return "{" + fields.map { quoteJavaScriptString($0.0) + ":" + $0.1.jsonText }.joined(separator: ",") + "}"
		}
	}
}

public struct JSONSyntaxError: Error, CustomStringConvertible {
	public let offset: Int
	public let reason: String
	public var description: String { "invalid JSON at byte \(offset): \(reason)" }
}

private struct JSONParser {
	let bytes: [UInt8]
	var index = 0

	func failure(_ reason: String) -> JSONSyntaxError { JSONSyntaxError(offset: index, reason: reason) }

	mutating func skipWhitespace() {
		while index < bytes.count, [0x20, 0x09, 0x0A, 0x0D].contains(bytes[index]) { index += 1 }
	}

	mutating func expect(_ literal: String) throws {
		for byte in literal.utf8 {
			guard index < bytes.count, bytes[index] == byte else { throw failure("expected \(literal)") }
			index += 1
		}
	}

	mutating func value(depth: Int) throws -> JSONValue {
		guard depth < 512 else { throw failure("nesting too deep") }
		guard index < bytes.count else { throw failure("unexpected end") }
		switch bytes[index] {
		case UInt8(ascii: "{"):
			index += 1
			var fields: [(String, JSONValue)] = []
			var seen = Set<String>()
			skipWhitespace()
			if index < bytes.count, bytes[index] == UInt8(ascii: "}") { index += 1; return .object(fields) }
			while true {
				skipWhitespace()
				guard index < bytes.count, bytes[index] == UInt8(ascii: "\"") else { throw failure("expected a key") }
				let key = try string()
				guard seen.insert(key).inserted else { throw failure("duplicate key \"\(key)\"") }
				skipWhitespace()
				try expect(":")
				skipWhitespace()
				fields.append((key, try value(depth: depth + 1)))
				skipWhitespace()
				guard index < bytes.count else { throw failure("unexpected end") }
				if bytes[index] == UInt8(ascii: ",") { index += 1; continue }
				if bytes[index] == UInt8(ascii: "}") { index += 1; return .object(fields) }
				throw failure("expected , or }")
			}
		case UInt8(ascii: "["):
			index += 1
			var items: [JSONValue] = []
			skipWhitespace()
			if index < bytes.count, bytes[index] == UInt8(ascii: "]") { index += 1; return .array(items) }
			while true {
				skipWhitespace()
				items.append(try value(depth: depth + 1))
				skipWhitespace()
				guard index < bytes.count else { throw failure("unexpected end") }
				if bytes[index] == UInt8(ascii: ",") { index += 1; continue }
				if bytes[index] == UInt8(ascii: "]") { index += 1; return .array(items) }
				throw failure("expected , or ]")
			}
		case UInt8(ascii: "\""): return .string(try string())
		case UInt8(ascii: "t"): try expect("true"); return .bool(true)
		case UInt8(ascii: "f"): try expect("false"); return .bool(false)
		case UInt8(ascii: "n"): try expect("null"); return .null
		default: return .number(try number())
		}
	}

	mutating func number() throws -> Double {
		let start = index
		func digits(_ parser: inout JSONParser) -> Int {
			let from = parser.index
			while parser.index < parser.bytes.count, (0x30...0x39).contains(parser.bytes[parser.index]) { parser.index += 1 }
			return parser.index - from
		}
		if index < bytes.count, bytes[index] == UInt8(ascii: "-") { index += 1 }
		let integerStart = index
		let integerDigits = digits(&self)
		guard integerDigits > 0 else { throw failure("expected a value") }
		if integerDigits > 1, bytes[integerStart] == UInt8(ascii: "0") { throw failure("leading zero") }
		if index < bytes.count, bytes[index] == UInt8(ascii: ".") {
			index += 1
			guard digits(&self) > 0 else { throw failure("expected a fraction digit") }
		}
		if index < bytes.count, bytes[index] == UInt8(ascii: "e") || bytes[index] == UInt8(ascii: "E") {
			index += 1
			if index < bytes.count, bytes[index] == UInt8(ascii: "+") || bytes[index] == UInt8(ascii: "-") { index += 1 }
			guard digits(&self) > 0 else { throw failure("expected an exponent digit") }
		}
		guard let value = Double(String(decoding: bytes[start..<index], as: UTF8.self)), value.isFinite else {
			throw JSONSyntaxError(offset: start, reason: "number out of range")
		}
		return value
	}

	mutating func hex4() throws -> UInt32 {
		guard index + 4 <= bytes.count, let code = UInt32(String(decoding: bytes[index..<index + 4], as: UTF8.self), radix: 16)
		else { throw failure("bad \\u escape") }
		index += 4
		return code
	}

	mutating func string() throws -> String {
		index += 1
		var scalars = String.UnicodeScalarView()
		var runStart = index
		func flush(_ parser: JSONParser, _ scalars: inout String.UnicodeScalarView, _ runStart: Int) throws {
			guard let run = String(validating: parser.bytes[runStart..<parser.index], as: UTF8.self) else {
				throw parser.failure("invalid UTF-8")
			}
			scalars.append(contentsOf: run.unicodeScalars)
		}
		while true {
			guard index < bytes.count else { throw failure("unterminated string") }
			let byte = bytes[index]
			if byte == UInt8(ascii: "\"") {
				try flush(self, &scalars, runStart)
				index += 1
				return String(scalars)
			}
			if byte < 0x20 { throw failure("control character in string") }
			if byte != UInt8(ascii: "\\") { index += 1; continue }
			try flush(self, &scalars, runStart)
			index += 1
			guard index < bytes.count else { throw failure("unterminated escape") }
			let escape = bytes[index]
			index += 1
			switch escape {
			case UInt8(ascii: "\""): scalars.append("\"")
			case UInt8(ascii: "\\"): scalars.append("\\")
			case UInt8(ascii: "/"): scalars.append("/")
			case UInt8(ascii: "b"): scalars.append("\u{08}")
			case UInt8(ascii: "f"): scalars.append("\u{0C}")
			case UInt8(ascii: "n"): scalars.append("\n")
			case UInt8(ascii: "r"): scalars.append("\r")
			case UInt8(ascii: "t"): scalars.append("\t")
			case UInt8(ascii: "u"):
				var code = try hex4()
				if (0xD800...0xDBFF).contains(code) {
					guard index + 1 < bytes.count, bytes[index] == UInt8(ascii: "\\"), bytes[index + 1] == UInt8(ascii: "u")
					else { throw failure("lone surrogate") }
					index += 2
					let low = try hex4()
					guard (0xDC00...0xDFFF).contains(low) else { throw failure("lone surrogate") }
					code = 0x10000 + ((code - 0xD800) << 10) + (low - 0xDC00)
				} else if (0xDC00...0xDFFF).contains(code) {
					throw failure("lone surrogate")
				}
				guard let scalar = Unicode.Scalar(code) else { throw failure("bad \\u escape") }
				scalars.append(scalar)
			default: throw failure("bad escape")
			}
			runStart = index
		}
	}
}

/// JavaScript's `JSON.stringify` quoting for a string.
public func quoteJavaScriptString(_ value: String) -> String {
	var out = "\""
	for scalar in value.unicodeScalars {
		switch scalar {
		case "\"": out += "\\\""
		case "\\": out += "\\\\"
		case "\u{08}": out += "\\b"
		case "\u{0C}": out += "\\f"
		case "\n": out += "\\n"
		case "\r": out += "\\r"
		case "\t": out += "\\t"
		case _ where scalar.value < 0x20:
			let hex = String(scalar.value, radix: 16)
			out += "\\u" + String(repeating: "0", count: 4 - hex.count) + hex
		default: out.unicodeScalars.append(scalar)
		}
	}
	return out + "\""
}
