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
