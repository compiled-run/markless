import Foundation

public let nativeViewVersion = "markless.native-view/0"

public enum NativeScalar: Equatable, Sendable {
	case number(Double)
	case string(String)
	case bool(Bool)

	/// JavaScript's `String(value)`.
	public var text: String {
		switch self {
		case let .number(value): return formatJavaScriptNumber(value)
		case let .string(value): return value
		case let .bool(value): return value ? "true" : "false"
		}
	}
}

public enum NativeTextPart: Equatable, Sendable {
	case text(String)
	case cell(String)
}

public enum NativeNode: Equatable, Sendable {
	case element(id: String, element: String, parent: String?)
	case text(id: String, parent: String, parts: [NativeTextPart])

	public var id: String {
		switch self {
		case let .element(id, _, _), let .text(id, _, _): return id
		}
	}

	public var parent: String? {
		switch self {
		case let .element(_, _, parent): return parent
		case let .text(_, parent, _): return parent
		}
	}
}

public enum NativeEventName: String, Sendable {
	case activate
}

public enum NativeOp: Equatable, Sendable {
	case add(cell: String, value: Double)
}

public struct NativeCell: Equatable, Sendable {
	public let id: String
	public let name: String
	public let initial: NativeScalar
}

public struct NativeEvent: Equatable, Sendable {
	public let host: String
	public let event: NativeEventName
	public let handler: String
}

public struct NativeHandler: Equatable, Sendable {
	public let id: String
	public let ops: [NativeOp]
}

/// A decoded and cross-checked `markless.native-view/0` payload.
public struct NativeViewPayload: Equatable, Sendable {
	public let component: String
	public let cells: [NativeCell]
	public let nodes: [NativeNode]
	public let events: [NativeEvent]
	public let handlers: [NativeHandler]

	public static func decode(_ data: Data) throws -> NativeViewPayload {
		try decode(JSONValue.parse(data))
	}

	public static func decode(_ json: JSONValue) throws -> NativeViewPayload {
		let root = try Reader(json, at: "payload")
		let fields = try root.object(["version", "component", "cells", "nodes", "events", "handlers"])
		let version = try fields["version"].string()
		guard version == nativeViewVersion else {
			throw PayloadError(path: "payload.version", reason: "unsupported version \"\(version)\", this host reads \(nativeViewVersion)")
		}
		let cells = try fields["cells"].array().map { cell in
			let field = try cell.object(["id", "name", "initial"])
			return NativeCell(id: try field["id"].string(), name: try field["name"].string(), initial: try field["initial"].scalar())
		}
		let nodes = try fields["nodes"].array().map { node -> NativeNode in
			let kind = try node.field("kind").string()
			switch kind {
			case "element":
				let field = try node.object(["kind", "id", "element", "parent"])
				return .element(id: try field["id"].string(), element: try field["element"].string(), parent: try field["parent"].optionalString())
			case "text":
				let field = try node.object(["kind", "id", "parent", "parts"])
				let parts = try field["parts"].array().map { part -> NativeTextPart in
					let keys = try part.keys()
					if keys == ["text"] { return .text(try part.field("text").string()) }
					if keys == ["cell"] { return .cell(try part.field("cell").string()) }
					throw PayloadError(path: part.path, reason: "unknown text part with keys \(keys)")
				}
				return .text(id: try field["id"].string(), parent: try field["parent"].string(), parts: parts)
			default:
				throw PayloadError(path: node.path + ".kind", reason: "unknown node kind \"\(kind)\"")
			}
		}
		let events = try fields["events"].array().map { event in
			let field = try event.object(["host", "event", "handler"])
			let name = try field["event"].string()
			guard let eventName = NativeEventName(rawValue: name) else {
				throw PayloadError(path: try field["event"].path, reason: "unknown event \"\(name)\"")
			}
			return NativeEvent(host: try field["host"].string(), event: eventName, handler: try field["handler"].string())
		}
		let handlers = try fields["handlers"].array().map { handler in
			let field = try handler.object(["id", "ops"])
			let ops = try field["ops"].array().map { op -> NativeOp in
				let name = try op.field("op").string()
				switch name {
				case "add":
					let opField = try op.object(["op", "cell", "value"])
					return .add(cell: try opField["cell"].string(), value: try opField["value"].number())
				default:
					throw PayloadError(path: op.path + ".op", reason: "unknown op \"\(name)\"")
				}
			}
			return NativeHandler(id: try field["id"].string(), ops: ops)
		}
		let payload = NativeViewPayload(
			component: try fields["component"].string(), cells: cells, nodes: nodes, events: events, handlers: handlers)
		try payload.check()
		return payload
	}

	private func check() throws {
		var cellIds = Set<String>()
		for cell in cells where !cellIds.insert(cell.id).inserted {
			throw PayloadError(path: "payload.cells", reason: "duplicate cell \(cell.id)")
		}
		var elements = Set<String>()
		var seen = Set<String>()
		for node in nodes {
			guard seen.insert(node.id).inserted else { throw PayloadError(path: "payload.nodes", reason: "duplicate node \(node.id)") }
			if let parent = node.parent, !elements.contains(parent) {
				throw PayloadError(path: "payload.nodes", reason: "\(node.id)'s parent \(parent) is not an earlier element")
			}
			switch node {
			case .element: elements.insert(node.id)
			case let .text(_, _, parts):
				for case let .cell(cell) in parts where !cellIds.contains(cell) {
					throw PayloadError(path: "payload.nodes", reason: "\(node.id) reads unknown cell \(cell)")
				}
			}
		}
		var handlerIds = Set<String>()
		for handler in handlers {
			guard handlerIds.insert(handler.id).inserted else {
				throw PayloadError(path: "payload.handlers", reason: "duplicate handler \(handler.id)")
			}
			for case let .add(cell, _) in handler.ops where !cellIds.contains(cell) {
				throw PayloadError(path: "payload.handlers", reason: "\(handler.id) writes unknown cell \(cell)")
			}
		}
		for event in events {
			guard elements.contains(event.host) else { throw PayloadError(path: "payload.events", reason: "event on unknown element \(event.host)") }
			guard handlerIds.contains(event.handler) else {
				throw PayloadError(path: "payload.events", reason: "event on \(event.host) names unknown handler \(event.handler)")
			}
		}
	}
}

public struct PayloadError: Error, CustomStringConvertible, Equatable {
	public let path: String
	public let reason: String
	public var description: String { "\(path): \(reason)" }
}

/// Typed, path-tracking access to a JSON value; every unexpected shape is a `PayloadError`.
struct Reader {
	let value: JSONValue
	let path: String

	init(_ value: JSONValue, at path: String) throws {
		self.value = value
		self.path = path
	}

	func fail(_ reason: String) -> PayloadError { PayloadError(path: path, reason: reason) }

	func keys() throws -> [String] {
		guard case let .object(fields) = value else { throw fail("expected an object") }
		return fields.map(\.0)
	}

	func field(_ key: String) throws -> Reader {
		guard case let .object(fields) = value else { throw fail("expected an object") }
		guard let found = fields.first(where: { $0.0 == key }) else { throw fail("missing \"\(key)\"") }
		return try Reader(found.1, at: "\(path).\(key)")
	}

	/// Reads an object whose keys are exactly `expected`: a missing or unknown key is an error.
	func object(_ expected: [String]) throws -> Fields {
		let present = try keys()
		if let unknown = present.first(where: { !expected.contains($0) }) { throw fail("unknown field \"\(unknown)\"") }
		if let missing = expected.first(where: { !present.contains($0) }) { throw fail("missing \"\(missing)\"") }
		return Fields(reader: self)
	}

	func object(required: [String], optional: [String]) throws -> Fields {
		let present = try keys()
		if let unknown = present.first(where: { !required.contains($0) && !optional.contains($0) }) {
			throw fail("unknown field \"\(unknown)\"")
		}
		if let missing = required.first(where: { !present.contains($0) }) { throw fail("missing \"\(missing)\"") }
		return Fields(reader: self)
	}

	func string() throws -> String {
		guard case let .string(text) = value else { throw fail("expected a string") }
		return text
	}

	func optionalString() throws -> String? {
		if case .null = value { return nil }
		return try string()
	}

	func number() throws -> Double {
		guard case let .number(number) = value else { throw fail("expected a number") }
		return number
	}

	func bool() throws -> Bool {
		guard case let .bool(flag) = value else { throw fail("expected a boolean") }
		return flag
	}

	var isNull: Bool { if case .null = value { return true } else { return false } }

	func scalar() throws -> NativeScalar {
		switch value {
		case let .number(number): return .number(number)
		case let .string(text): return .string(text)
		case let .bool(flag): return .bool(flag)
		default: throw fail("expected a number, string or boolean")
		}
	}

	func array() throws -> [Reader] {
		guard case let .array(items) = value else { throw fail("expected an array") }
		return try items.enumerated().map { try Reader($1, at: "\(path)[\($0)]") }
	}
}

struct Fields {
	let reader: Reader

	subscript(key: String) -> Reader {
		get throws { try reader.field(key) }
	}

	func has(_ key: String) -> Bool { (try? reader.keys().contains(key)) ?? false }
}
