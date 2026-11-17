import Foundation

public let nativeViewVersion = "markless.native-view/0"

/// A value as JavaScript holds it: a number (IEEE double), string, boolean or null.
public enum NativeScalar: Equatable, Sendable {
	case number(Double)
	case string(String)
	case bool(Bool)
	case null

	/// JavaScript's `Boolean(value)`.
	public var isTruthy: Bool {
		switch self {
		case let .number(value): return value != 0 && !value.isNaN
		case let .string(value): return !value.isEmpty
		case let .bool(value): return value
		case .null: return false
		}
	}

	var json: JSONValue {
		switch self {
		case let .number(value): return .number(value)
		case let .string(value): return .string(value)
		case let .bool(value): return .bool(value)
		case .null: return .null
		}
	}

	/// JavaScript's `String(value)`.
	public var text: String {
		switch self {
		case let .number(value): return formatJavaScriptNumber(value)
		case let .string(value): return value
		case let .bool(value): return value ? "true" : "false"
		case .null: return "null"
		}
	}
}

public enum NativeBuiltin: String, Sendable {
	case string = "String", number = "Number", boolean = "Boolean"
	case abs = "Math.abs", floor = "Math.floor", max = "Math.max", min = "Math.min", round = "Math.round"
}

/// A value computed from cells, with JavaScript's meaning (see `JavaScript.swift`).
public indirect enum NativeExpr: Equatable, Sendable {
	case cell(String)
	case literal(NativeScalar)
	case unary(String, NativeExpr)
	case binary(String, NativeExpr, NativeExpr)
	case logical(String, NativeExpr, NativeExpr)
	case conditional(test: NativeExpr, whenTrue: NativeExpr, whenFalse: NativeExpr)
	case template([NativeTemplatePart])
	case length(NativeExpr)
	case call(NativeBuiltin, [NativeExpr])

	var cells: [String] {
		switch self {
		case let .cell(cell): return [cell]
		case .literal: return []
		case let .unary(_, inner), let .length(inner): return inner.cells
		case let .binary(_, a, b), let .logical(_, a, b): return a.cells + b.cells
		case let .conditional(test, whenTrue, whenFalse): return test.cells + whenTrue.cells + whenFalse.cells
		case let .template(parts): return parts.flatMap { if case let .expr(e) = $0 { e.cells } else { [String]() } }
		case let .call(_, arguments): return arguments.flatMap(\.cells)
		}
	}
}

public enum NativeTemplatePart: Equatable, Sendable {
	case text(String)
	case expr(NativeExpr)
}

public enum NativeTextPart: Equatable, Sendable {
	case text(String)
	case cell(String)
	case expr(NativeExpr)
}

/// Where a node sits when it belongs to one arm of an `@if`.
public struct NativeArmPlace: Equatable, Hashable, Sendable {
	public let branch: String
	public let index: Int
}

public struct NativeBinding: Equatable, Sendable {
	public let attribute: String
	public let value: NativeExpr
}

public enum NativeNode: Equatable, Sendable {
	case element(id: String, element: String, parent: String?, attributes: [String: String], bindings: [NativeBinding], arm: NativeArmPlace?)
	case text(id: String, parent: String, parts: [NativeTextPart], arm: NativeArmPlace?)
	case branch(id: String, parent: String?, test: NativeExpr, arms: Int, arm: NativeArmPlace?)

	public var id: String {
		switch self {
		case let .element(id, _, _, _, _, _), let .text(id, _, _, _), let .branch(id, _, _, _, _): return id
		}
	}

	public var parent: String? {
		switch self {
		case let .element(_, _, parent, _, _, _): return parent
		case let .text(_, parent, _, _): return parent
		case let .branch(_, parent, _, _, _): return parent
		}
	}

	public var arm: NativeArmPlace? {
		switch self {
		case let .element(_, _, _, _, _, arm), let .text(_, _, _, arm), let .branch(_, _, _, _, arm): return arm
		}
	}
}

public enum NativeEventName: String, Sendable {
	case activate
}

/// A state write: the cell takes the expression's value, evaluated before the write.
public struct NativeOp: Equatable, Sendable {
	public let cell: String
	public let value: NativeExpr
}

public struct NativeCell: Equatable, Sendable {
	public let id: String
	public let name: String
	public let initial: NativeScalar
	/// The device-kept value's key: read at mount, written on every write.
	public let storageKey: String?
	/// A class binding reads this cell, so its changes are journalled as `state`.
	public let styled: Bool
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
			let field = try cell.object(required: ["id", "name", "initial"], optional: ["storage", "styled"])
			let initial = try field["initial"].scalar()
			if initial == .null { throw PayloadError(path: try field["initial"].path, reason: "a cell's initial value is a number, string or boolean") }
			var styled = false
			if field.has("styled") {
				guard try field["styled"].bool() else { throw PayloadError(path: try field["styled"].path, reason: "styled is only ever true") }
				styled = true
			}
			return NativeCell(
				id: try field["id"].string(), name: try field["name"].string(), initial: initial,
				storageKey: field.has("storage") ? try field["storage"].object(["key"])["key"].string() : nil, styled: styled)
		}
		let nodes = try fields["nodes"].array().map { node -> NativeNode in
			let kind = try node.field("kind").string()
			switch kind {
			case "element":
				let field = try node.object(required: ["kind", "id", "element", "parent"], optional: ["attributes", "bindings", "arm"])
				var attributes: [String: String] = [:]
				if field.has("attributes") {
					let reader = try field["attributes"]
					for key in try reader.keys() { attributes[key] = try reader.field(key).string() }
				}
				let bindings: [NativeBinding] = field.has("bindings") ? try field["bindings"].array().map { binding -> NativeBinding in
					let b = try binding.object(["attribute", "value"])
					return NativeBinding(attribute: try b["attribute"].string(), value: try decodeExpr(try b["value"]))
				} : []
				return .element(
					id: try field["id"].string(), element: try field["element"].string(),
					parent: try field["parent"].optionalString(), attributes: attributes, bindings: bindings, arm: try decodeArm(field))
			case "text":
				let field = try node.object(required: ["kind", "id", "parent", "parts"], optional: ["arm"])
				let parts = try field["parts"].array().map { part -> NativeTextPart in
					let keys = try part.keys()
					if keys == ["text"] { return .text(try part.field("text").string()) }
					if keys == ["cell"] { return .cell(try part.field("cell").string()) }
					if keys == ["expr"] { return .expr(try decodeExpr(try part.field("expr"))) }
					throw PayloadError(path: part.path, reason: "unknown text part with keys \(keys)")
				}
				return .text(id: try field["id"].string(), parent: try field["parent"].string(), parts: parts, arm: try decodeArm(field))
			case "branch":
				let field = try node.object(required: ["kind", "id", "parent", "test", "arms"], optional: ["arm"])
				let arms = try field["arms"].number()
				guard arms == 1 || arms == 2 else { throw PayloadError(path: node.path + ".arms", reason: "a branch has 1 or 2 arms") }
				return .branch(
					id: try field["id"].string(), parent: try field["parent"].optionalString(), test: try decodeExpr(try field["test"]),
					arms: Int(arms), arm: try decodeArm(field))
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
				case "assign":
					let opField = try op.object(["op", "cell", "value"])
					return NativeOp(cell: try opField["cell"].string(), value: try decodeExpr(try opField["value"]))
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

	private static func decodeArm(_ fields: Fields) throws -> NativeArmPlace? {
		guard fields.has("arm") else { return nil }
		let arm = try fields["arm"].object(["branch", "index"])
		let index = try arm["index"].number()
		guard index == 0 || index == 1 else { throw PayloadError(path: try fields["arm"].path, reason: "arm index must be 0 or 1") }
		return NativeArmPlace(branch: try arm["branch"].string(), index: Int(index))
	}

	static func decodeExpression(_ json: JSONValue) throws -> NativeExpr { try decodeExpr(try Reader(json, at: "expr")) }

	private static func decodeExpr(_ reader: Reader) throws -> NativeExpr {
		let keys = try reader.keys()
		let field = { (key: String) throws -> Reader in try reader.field(key) }
		let oneOf = { (key: String, allowed: Set<String>) throws -> String in
			let name = try field(key).string()
			guard allowed.contains(name) else { throw PayloadError(path: reader.path + "." + key, reason: "unknown operator \"\(name)\"") }
			return name
		}
		switch keys.sorted() {
		case ["cell"]: return .cell(try field("cell").string())
		case ["literal"]: return .literal(try field("literal").scalar())
		case ["unary", "value"]: return .unary(try oneOf("unary", ["!", "-", "+"]), try decodeExpr(try field("value")))
		case ["binary", "left", "right"]:
			return .binary(
				try oneOf("binary", ["+", "-", "*", "/", "%", "===", "!==", "<", "<=", ">", ">="]),
				try decodeExpr(try field("left")), try decodeExpr(try field("right")))
		case ["left", "logical", "right"]:
			return .logical(try oneOf("logical", ["&&", "||", "??"]), try decodeExpr(try field("left")), try decodeExpr(try field("right")))
		case ["if", "whenFalse", "whenTrue"]:
			return .conditional(
				test: try decodeExpr(try field("if")), whenTrue: try decodeExpr(try field("whenTrue")),
				whenFalse: try decodeExpr(try field("whenFalse")))
		case ["template"]:
			return .template(try field("template").array().map { part in
				if case let .string(text) = part.value { return .text(text) }
				return .expr(try decodeExpr(part))
			})
		case ["member", "property"]:
			let property = try field("property").string()
			guard property == "length" else { throw PayloadError(path: reader.path + ".property", reason: "unknown property \"\(property)\"") }
			return .length(try decodeExpr(try field("member")))
		case ["arguments", "call"]:
			let name = try field("call").string()
			guard let builtin = NativeBuiltin(rawValue: name) else { throw PayloadError(path: reader.path + ".call", reason: "unknown call \"\(name)\"") }
			return .call(builtin, try field("arguments").array().map(decodeExpr))
		default: throw PayloadError(path: reader.path, reason: "unknown expression with keys \(keys)")
		}
	}

	private func check() throws {
		var cellIds = Set<String>()
		for cell in cells where !cellIds.insert(cell.id).inserted {
			throw PayloadError(path: "payload.cells", reason: "duplicate cell \(cell.id)")
		}
		var elements = Set<String>()
		var branchArms: [String: Int] = [:]
		var seen = Set<String>()
		func checkCells(_ node: NativeNode, _ expressions: [NativeExpr]) throws {
			for cell in expressions.flatMap(\.cells) where !cellIds.contains(cell) {
				throw PayloadError(path: "payload.nodes", reason: "\(node.id) reads unknown cell \(cell)")
			}
		}
		for node in nodes {
			guard seen.insert(node.id).inserted else { throw PayloadError(path: "payload.nodes", reason: "duplicate node \(node.id)") }
			if let parent = node.parent, !elements.contains(parent) {
				throw PayloadError(path: "payload.nodes", reason: "\(node.id)'s parent \(parent) is not an earlier element")
			}
			if let arm = node.arm {
				guard let arms = branchArms[arm.branch], arm.index < arms else {
					throw PayloadError(path: "payload.nodes", reason: "\(node.id) sits in arm \(arm.index) of \(arm.branch), which is not an earlier branch with that arm")
				}
			}
			switch node {
			case let .element(_, _, _, _, bindings, _):
				elements.insert(node.id)
				try checkCells(node, bindings.map(\.value))
			case let .text(_, _, parts, _):
				try checkCells(node, parts.map { part in
					switch part {
					case .text: return .literal(.bool(true))
					case let .cell(cell): return .cell(cell)
					case let .expr(expr): return expr
					}
				})
			case let .branch(_, _, test, arms, _):
				branchArms[node.id] = arms
				try checkCells(node, [test])
			}
		}
		var handlerIds = Set<String>()
		for handler in handlers {
			guard handlerIds.insert(handler.id).inserted else {
				throw PayloadError(path: "payload.handlers", reason: "duplicate handler \(handler.id)")
			}
			for op in handler.ops where !cellIds.contains(op.cell) || !op.value.cells.allSatisfy(cellIds.contains) {
				throw PayloadError(path: "payload.handlers", reason: "\(handler.id) names an unknown cell")
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
		case .null: return .null
		default: throw fail("expected a number, string, boolean or null")
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
