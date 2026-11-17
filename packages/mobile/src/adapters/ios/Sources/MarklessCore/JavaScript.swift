import Foundation

/// ECMAScript's meaning for the values and operators a payload's expressions use.
extension NativeScalar {
	/// ToNumber.
	public var number: Double {
		switch self {
		case let .number(value): return value
		case let .bool(value): return value ? 1 : 0
		case .null: return 0
		case let .string(text): return stringToNumber(text)
		}
	}

	/// `===`: same type and same value; NaN differs from itself, +0 equals -0.
	public func strictlyEquals(_ other: NativeScalar) -> Bool {
		switch (self, other) {
		case let (.number(a), .number(b)): return a == b
		case let (.string(a), .string(b)): return Array(a.utf16) == Array(b.utf16)
		case let (.bool(a), .bool(b)): return a == b
		case (.null, .null): return true
		default: return false
		}
	}
}

private let whitespace: Set<Unicode.Scalar> = [
	"\u{09}", "\u{0A}", "\u{0B}", "\u{0C}", "\u{0D}", "\u{20}", "\u{A0}", "\u{1680}", "\u{2000}", "\u{2001}", "\u{2002}",
	"\u{2003}", "\u{2004}", "\u{2005}", "\u{2006}", "\u{2007}", "\u{2008}", "\u{2009}", "\u{200A}", "\u{2028}", "\u{2029}",
	"\u{202F}", "\u{205F}", "\u{3000}", "\u{FEFF}",
]

/// StringToNumber: trimmed decimal, `Infinity`, or an unsigned 0x/0o/0b integer; anything else is NaN.
func stringToNumber(_ text: String) -> Double {
	var scalars = Substring(text).unicodeScalars[...]
	while let first = scalars.first, whitespace.contains(first) { scalars.removeFirst() }
	while let last = scalars.last, whitespace.contains(last) { scalars.removeLast() }
	let trimmed = String(String.UnicodeScalarView(scalars))
	if trimmed.isEmpty { return 0 }
	for (prefix, radix) in [("0x", 16), ("0X", 16), ("0o", 8), ("0O", 8), ("0b", 2), ("0B", 2)] where trimmed.hasPrefix(prefix) {
		let digits = trimmed.dropFirst(2)
		guard !digits.isEmpty else { return .nan }
		var value = 0.0
		for character in digits {
			guard let digit = character.hexDigitValue, digit < radix else { return .nan }
			value = value * Double(radix) + Double(digit)
		}
		return value
	}
	var body = Substring(trimmed)
	var sign = 1.0
	if body.first == "+" || body.first == "-" {
		sign = body.first == "-" ? -1 : 1
		body = body.dropFirst()
	}
	if body == "Infinity" { return sign * .infinity }
	let bytes = Array(body.utf8)
	var index = 0
	func digits() -> Int {
		let start = index
		while index < bytes.count, (0x30...0x39).contains(bytes[index]) { index += 1 }
		return index - start
	}
	var mantissaDigits = digits()
	if index < bytes.count, bytes[index] == UInt8(ascii: ".") {
		index += 1
		mantissaDigits += digits()
	}
	guard mantissaDigits > 0 else { return .nan }
	if index < bytes.count, bytes[index] == UInt8(ascii: "e") || bytes[index] == UInt8(ascii: "E") {
		index += 1
		if index < bytes.count, bytes[index] == UInt8(ascii: "+") || bytes[index] == UInt8(ascii: "-") { index += 1 }
		guard digits() > 0 else { return .nan }
	}
	guard index == bytes.count else { return .nan }
	var normalized = String(body)
	if normalized.hasPrefix(".") { normalized = "0" + normalized }
	normalized = normalized.replacingOccurrences(of: ".e", with: ".0e").replacingOccurrences(of: ".E", with: ".0E")
	if normalized.hasSuffix(".") { normalized += "0" }
	return sign * (Double(normalized) ?? .nan)
}

/// The abstract relational comparison `a < b`: nil when either side is NaN (undefined in the spec).
private func lessThan(_ a: NativeScalar, _ b: NativeScalar) -> Bool? {
	if case let .string(x) = a, case let .string(y) = b { return Array(x.utf16).lexicographicallyPrecedes(Array(y.utf16)) }
	let x = a.number, y = b.number
	if x.isNaN || y.isNaN { return nil }
	return x < y
}

private func javaScriptRound(_ x: Double) -> Double {
	if !x.isFinite || x == x.rounded(.towardZero) { return x }
	if x < 0 && x >= -0.5 { return -0.0 }
	let floor = x.rounded(.down)
	return x - floor >= 0.5 ? floor + 1 : floor
}

func evaluateBinary(_ op: String, _ left: NativeScalar, _ right: NativeScalar) throws -> NativeScalar {
	switch op {
	case "+":
		if case .string = left { return .string(left.text + right.text) }
		if case .string = right { return .string(left.text + right.text) }
		return .number(left.number + right.number)
	case "-": return .number(left.number - right.number)
	case "*": return .number(left.number * right.number)
	case "/": return .number(left.number / right.number)
	case "%":
		let (x, y) = (left.number, right.number)
		if x.isNaN || y.isNaN || x.isInfinite || y == 0 { return .number(.nan) }
		if y.isInfinite { return .number(x) }
		return .number(x.truncatingRemainder(dividingBy: y))
	case "===": return .bool(left.strictlyEquals(right))
	case "!==": return .bool(!left.strictlyEquals(right))
	case "<": return .bool(lessThan(left, right) ?? false)
	case ">": return .bool(lessThan(right, left) ?? false)
	case "<=": return .bool(lessThan(right, left).map { !$0 } ?? false)
	case ">=": return .bool(lessThan(left, right).map { !$0 } ?? false)
	default: throw RuntimeError(reason: "unknown operator \(op)")
	}
}

func evaluateCall(_ builtin: NativeBuiltin, _ arguments: [NativeScalar]) -> NativeScalar {
	let first = arguments.first
	switch builtin {
	case .string: return .string(first?.text ?? "undefined")
	case .number: return .number(first?.number ?? .nan)
	case .boolean: return .bool(first?.isTruthy ?? false)
	case .abs: return .number(abs(first?.number ?? .nan))
	case .floor: return .number((first?.number ?? .nan).rounded(.down))
	case .round: return .number(javaScriptRound(first?.number ?? .nan))
	case .max, .min:
		var result: Double = builtin == .max ? -.infinity : .infinity
		for value in arguments.map(\.number) {
			if value.isNaN { return .number(.nan) }
			let wins = builtin == .max
				? value > result || (value == 0 && result == 0 && result.sign == .minus)
				: value < result || (value == 0 && result == 0 && value.sign == .minus)
			if wins { result = value }
		}
		return .number(result)
	}
}
