import Foundation

/// ECMAScript's meaning for the values and operators a payload's expressions use.
extension NativeValue {
	/// ToNumber.
	public var number: Double {
		switch self {
		case let .number(value): return value
		case let .bool(value): return value ? 1 : 0
		case .null: return 0
		case let .string(text): return stringToNumber(text)
		case .array: return stringToNumber(text)
		case .object: return .nan
		}
	}

	/// `===`: same type and same value; NaN differs from itself, +0 equals -0.
	public func strictlyEquals(_ other: NativeValue) -> Bool {
		switch (self, other) {
		case let (.number(a), .number(b)): return a == b
		case let (.string(a), .string(b)): return Array(a.utf16) == Array(b.utf16)
		case let (.bool(a), .bool(b)): return a == b
		case (.null, .null): return true
		case let (.array(a), .array(b)): return a === b
		case let (.object(a), .object(b)): return a === b
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
private func lessThan(_ a: NativeValue, _ b: NativeValue) -> Bool? {
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

func evaluateBinary(_ op: String, _ leftOperand: NativeValue, _ rightOperand: NativeValue) throws -> NativeValue {
	if op == "===" { return .bool(leftOperand.strictlyEquals(rightOperand)) }
	if op == "!==" { return .bool(!leftOperand.strictlyEquals(rightOperand)) }
	let (left, right) = (leftOperand.primitive, rightOperand.primitive)
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
	case "<": return .bool(lessThan(left, right) ?? false)
	case ">": return .bool(lessThan(right, left) ?? false)
	case "<=": return .bool(lessThan(right, left).map { !$0 } ?? false)
	case ">=": return .bool(lessThan(left, right).map { !$0 } ?? false)
	default: throw RuntimeError(reason: "unknown operator \(op)")
	}
}

func evaluateCall(_ builtin: NativeBuiltin, _ arguments: [NativeValue]) -> NativeValue {
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

enum MethodArgument {
	case value(NativeValue)
	case function(([NativeValue]) throws -> NativeValue)

	var value: NativeValue? { if case let .value(value) = self { value } else { nil } }
}

/// ToIntegerOrInfinity, then clamped into a relative index of `length` as `slice`, `includes` and `indexOf` do.
private func relativeIndex(_ argument: NativeValue?, _ length: Int, default fallback: Int) -> Int {
	guard let argument else { return fallback }
	let number = argument.primitive.number
	let integer = number.isNaN ? 0 : number.rounded(.towardZero)
	if integer < 0 { return max(Int(max(Double(length) + integer, 0)), 0) }
	return Int(min(integer, Double(length)))
}

/// SameValueZero: `includes`' equality, where NaN finds NaN.
private func sameValueZero(_ a: NativeValue, _ b: NativeValue) -> Bool {
	if case let .number(x) = a, case let .number(y) = b, x.isNaN, y.isNaN { return true }
	return a.strictlyEquals(b)
}

private func trimmed(_ text: String) -> String {
	var scalars = Substring(text).unicodeScalars[...]
	while let first = scalars.first, whitespace.contains(first) { scalars.removeFirst() }
	while let last = scalars.last, whitespace.contains(last) { scalars.removeLast() }
	return String(String.UnicodeScalarView(scalars))
}

/// The position of `search` in `text` at or after `from`, in UTF-16 units.
private func utf16Index(of search: [UInt16], in text: [UInt16], from: Int) -> Int? {
	if search.isEmpty { return min(from, text.count) }
	guard text.count >= search.count, from <= text.count - search.count else { return nil }
	for start in from...(text.count - search.count) where Array(text[start..<start + search.count]) == search { return start }
	return nil
}

func callMethod(_ method: NativeMethod, on target: NativeValue, _ arguments: [MethodArgument]) throws -> NativeValue {
	let refuse = RuntimeError(reason: ".\(method.rawValue)() of a \(target == .null ? "null" : "value without it")")
	let argument = { (index: Int) -> NativeValue? in index < arguments.count ? arguments[index].value : nil }
	let function = { () throws -> ([NativeValue]) throws -> NativeValue in
		guard let first = arguments.first, case let .function(body) = first else { throw RuntimeError(reason: ".\(method.rawValue)() needs a function") }
		return body
	}
	switch target {
	case let .string(text):
		let units = Array(text.utf16)
		let searchText = { (value: NativeValue?) in Array((value?.text ?? "undefined").utf16) }
		let position = { (value: NativeValue?) -> Int in
			let number = value?.primitive.number ?? 0
			return Int(min(max(number.isNaN ? 0 : number.rounded(.towardZero), 0), Double(units.count)))
		}
		switch method {
		case .includes: return .bool(utf16Index(of: searchText(argument(0)), in: units, from: position(argument(1))) != nil)
		case .indexOf: return .number(Double(utf16Index(of: searchText(argument(0)), in: units, from: position(argument(1))) ?? -1))
		case .concat: return .string(text + arguments.map { $0.value?.text ?? "undefined" }.joined())
		case .slice:
			let start = relativeIndex(argument(0), units.count, default: 0)
			let end = relativeIndex(argument(1), units.count, default: units.count)
			return .string(start < end ? String(decoding: units[start..<end], as: UTF16.self) : "")
		case .toUpperCase: return .string(text.uppercased())
		case .toLowerCase: return .string(text.lowercased())
		case .trim: return .string(trimmed(text))
		default: throw refuse
		}
	case let .array(array):
		let items = array.items
		let each = { (body: ([NativeValue]) throws -> NativeValue) in
			try items.enumerated().map { index, item in try body([item, .number(Double(index)), target]) }
		}
		switch method {
		case .filter:
			let keep = try each(try function())
			return .array(zip(items, keep).filter { $0.1.isTruthy }.map(\.0))
		case .map: return .array(try each(try function()))
		case .findIndex:
			let body = try function()
			for (index, item) in items.enumerated() where try body([item, .number(Double(index)), target]).isTruthy { return .number(Double(index)) }
			return .number(-1)
		case .some:
			let body = try function()
			for (index, item) in items.enumerated() where try body([item, .number(Double(index)), target]).isTruthy { return .bool(true) }
			return .bool(false)
		case .every:
			let body = try function()
			for (index, item) in items.enumerated() where try !body([item, .number(Double(index)), target]).isTruthy { return .bool(false) }
			return .bool(true)
		case .includes:
			let search = argument(0) ?? .null
			let from = relativeIndex(argument(1), items.count, default: 0)
			return .bool(items[from...].contains { sameValueZero($0, search) })
		case .indexOf:
			let search = argument(0) ?? .null
			let from = relativeIndex(argument(1), items.count, default: 0)
			return .number(Double(items[from...].firstIndex { $0.strictlyEquals(search) } ?? -1))
		case .join:
			let separator = argument(0).map(\.text) ?? ","
			return .string(items.map { $0 == .null ? "" : $0.text }.joined(separator: separator))
		case .concat:
			var joined = items
			for value in arguments.map({ $0.value ?? .null }) {
				if case let .array(other) = value { joined += other.items } else { joined.append(value) }
			}
			return .array(joined)
		case .slice:
			let start = relativeIndex(argument(0), items.count, default: 0)
			let end = relativeIndex(argument(1), items.count, default: items.count)
			return .array(start < end ? Array(items[start..<end]) : [])
		case .reverse:
			array.items.reverse()
			return target
		case .toReversed: return .array(items.reversed())
		default: throw refuse
		}
	default: throw refuse
	}
}
