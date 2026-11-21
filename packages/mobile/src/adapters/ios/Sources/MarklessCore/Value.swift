/// A JavaScript array: a reference, so `===` compares identity as JavaScript does.
public final class JSArray: @unchecked Sendable {
	public var items: [NativeValue]
	public init(_ items: [NativeValue]) { self.items = items }
}

/// A JavaScript plain object: a reference with own properties in insertion order.
public final class JSObject: @unchecked Sendable {
	public private(set) var fields: [(key: String, value: NativeValue)]

	public init(_ fields: [(key: String, value: NativeValue)]) {
		self.fields = []
		for (key, value) in fields { set(key, value) }
	}

	public func get(_ key: String) -> NativeValue? { fields.first { $0.key == key }?.value }

	func set(_ key: String, _ value: NativeValue) {
		if let index = fields.firstIndex(where: { $0.key == key }) { fields[index].value = value } else { fields.append((key, value)) }
	}
}

/// A value as JavaScript holds it: JSON (number, string, boolean, null, array, object).
public enum NativeValue: Equatable, Sendable {
	case number(Double)
	case string(String)
	case bool(Bool)
	case null
	case array(JSArray)
	case object(JSObject)

	public static func array(_ items: [NativeValue]) -> NativeValue { .array(JSArray(items)) }
	public static func object(_ fields: [(key: String, value: NativeValue)]) -> NativeValue { .object(JSObject(fields)) }

	/// Structural equality, for tests; JavaScript's `===` is `strictlyEquals`.
	public static func == (a: NativeValue, b: NativeValue) -> Bool {
		switch (a, b) {
		case let (.number(x), .number(y)): return x == y || (x.isNaN && y.isNaN)
		case let (.string(x), .string(y)): return x == y
		case let (.bool(x), .bool(y)): return x == y
		case (.null, .null): return true
		case let (.array(x), .array(y)): return x.items == y.items
		case let (.object(x), .object(y)): return x.fields.map(\.key) == y.fields.map(\.key) && x.fields.map(\.value) == y.fields.map(\.value)
		default: return false
		}
	}

	/// `JSON.stringify(value)`.
	public var jsonText: String { json.jsonText }

	public init(json: JSONValue) {
		switch json {
		case .null: self = .null
		case let .bool(flag): self = .bool(flag)
		case let .number(number): self = .number(number)
		case let .string(text): self = .string(text)
		case let .array(items): self = .array(items.map(NativeValue.init(json:)))
		case let .object(fields): self = .object(fields.map { (key: $0.0, value: NativeValue(json: $0.1)) })
		}
	}

	var json: JSONValue {
		switch self {
		case let .number(value): return .number(value)
		case let .string(value): return .string(value)
		case let .bool(value): return .bool(value)
		case .null: return .null
		case let .array(array): return .array(array.items.map(\.json))
		case let .object(object): return .object(object.fields.map { ($0.key, $0.value.json) })
		}
	}

	/// JavaScript's `Boolean(value)`.
	public var isTruthy: Bool {
		switch self {
		case let .number(value): return value != 0 && !value.isNaN
		case let .string(value): return !value.isEmpty
		case let .bool(value): return value
		case .null: return false
		case .array, .object: return true
		}
	}

	/// JavaScript's `String(value)`.
	public var text: String {
		switch self {
		case let .number(value): return formatJavaScriptNumber(value)
		case let .string(value): return value
		case let .bool(value): return value ? "true" : "false"
		case .null: return "null"
		case let .array(array): return array.items.map { $0 == .null ? "" : $0.text }.joined(separator: ",")
		case .object: return "[object Object]"
		}
	}

	/// JavaScript's `typeof value`: null, arrays and objects are all "object".
	public var typeName: String {
		switch self {
		case .number: return "number"
		case .string: return "string"
		case .bool: return "boolean"
		case .null, .array, .object: return "object"
		}
	}

	/// ToPrimitive for operators: arrays and objects read as their string.
	var primitive: NativeValue {
		switch self {
		case .array, .object: return .string(text)
		default: return self
		}
	}
}

/// JSON writes Infinity, -Infinity and NaN as null: a value crosses JSON with where each was (nativeNonFiniteSplit/Join).
extension NativeValue {
	/// The value as JSON carries it, and each non-finite number's path (keys and indices) and name; an empty list when it has none.
	public var nonFiniteSplit: (json: JSONValue, nonFinite: JSONValue) {
		var found: [JSONValue] = []
		func walk(_ value: NativeValue, _ path: [JSONValue]) -> JSONValue {
			switch value {
			case let .number(n) where !n.isFinite:
				found.append(.array([.array(path), .string(n.isNaN ? "NaN" : n > 0 ? "Infinity" : "-Infinity")]))
				return .null
			case let .array(array): return .array(array.items.enumerated().map { walk($0.element, path + [.number(Double($0.offset))]) })
			case let .object(object): return .object(object.fields.map { ($0.key, walk($0.value, path + [.string($0.key)])) })
			default: return value.json
			}
		}
		let json = walk(self, [])
		return (json, .array(found))
	}

	/// A value JSON carried, with the non-finite numbers `nonFinite` lists put back at their paths.
	public static func nonFiniteJoin(_ json: JSONValue, _ nonFinite: JSONValue?) throws -> NativeValue {
		var value = NativeValue(json: json)
		guard case let .array(entries)? = nonFinite else { return value }
		for entry in entries {
			guard case let .array(pair) = entry, pair.count == 2, case let .array(path) = pair[0], case let .string(name) = pair[1] else {
				throw RuntimeError(reason: "a non-finite entry is [path, name], not \(entry.jsonText)")
			}
			let number: Double
			switch name {
			case "Infinity": number = .infinity
			case "-Infinity": number = -.infinity
			case "NaN": number = .nan
			default: throw RuntimeError(reason: "\(name) is not Infinity, -Infinity or NaN")
			}
			if path.isEmpty { value = .number(number); continue }
			var at = value
			for (k, key) in path.enumerated() {
				let last = k == path.count - 1
				switch (at, key) {
				case let (.array(array), .number(index)) where Int(index) >= 0 && Int(index) < array.items.count:
					if last { array.items[Int(index)] = .number(number) } else { at = array.items[Int(index)] }
				case let (.object(object), .string(field)) where object.get(field) != nil:
					if last { object.set(field, .number(number)) } else { at = object.get(field)! }
				default: throw RuntimeError(reason: "the non-finite path \(JSONValue.array(path).jsonText) names nothing in the value")
				}
			}
		}
		return value
	}
}
