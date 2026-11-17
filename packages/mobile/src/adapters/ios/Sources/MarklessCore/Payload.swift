import Foundation

public let nativeViewVersion = "markless.native-view/0"

public enum NativeBuiltin: String, Sendable {
	case string = "String", number = "Number", boolean = "Boolean"
	case abs = "Math.abs", floor = "Math.floor", max = "Math.max", min = "Math.min", round = "Math.round"
}

/// A value computed from cells, with JavaScript's meaning (see `JavaScript.swift`).
public enum NativeMethod: String, Sendable {
	case filter, map, findIndex, some, every, includes, indexOf, join, concat, slice, reverse, toReversed
	case toUpperCase, toLowerCase, trim
}

public indirect enum NativeExpr: Equatable, Sendable {
	case cell(String)
	case literal(NativeValue)
	case unary(String, NativeExpr)
	case binary(String, NativeExpr, NativeExpr)
	case logical(String, NativeExpr, NativeExpr)
	case conditional(test: NativeExpr, whenTrue: NativeExpr, whenFalse: NativeExpr)
	case template([NativeTemplatePart])
	/// `length` of a string or array, or an own property of an object.
	case member(NativeExpr, String)
	case array([NativeArrayItem])
	case object([NativeObjectField])
	case method(NativeMethod, target: NativeExpr, arguments: [NativeExpr])
	/// Only as a method argument; its parameters read as `local`.
	case lambda(parameters: [String], body: NativeExpr)
	case local(String)
	/// The current row's item of a list (`repeat` id).
	case item(String)
	case call(NativeBuiltin, [NativeExpr])
	/// In an `input` handler: the field's text after the edit.
	case eventValue
	/// The page's route params, an object of strings.
	case routeParams

	var cells: [String] {
		switch self {
		case let .cell(cell): return [cell]
		case .literal, .eventValue, .local, .item, .routeParams: return []
		case let .unary(_, inner), let .member(inner, _), let .lambda(_, inner): return inner.cells
		case let .array(items): return items.flatMap(\.value.cells)
		case let .object(fields): return fields.flatMap(\.value.cells)
		case let .method(_, target, arguments): return target.cells + arguments.flatMap(\.cells)
		case let .binary(_, a, b), let .logical(_, a, b): return a.cells + b.cells
		case let .conditional(test, whenTrue, whenFalse): return test.cells + whenTrue.cells + whenFalse.cells
		case let .template(parts): return parts.flatMap { if case let .expr(e) = $0 { e.cells } else { [String]() } }
		case let .call(_, arguments): return arguments.flatMap(\.cells)
		}
	}
}

public struct NativeArrayItem: Equatable, Sendable {
	public let spread: Bool
	public let value: NativeExpr
}

public struct NativeObjectField: Equatable, Sendable {
	public let key: String
	public let value: NativeExpr
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
	/// The attribute's name, or `value` for the input property.
	public let name: String
	public let isProperty: Bool
	public let value: NativeExpr
}

public struct NativeNode: Equatable, Sendable {
	public enum Kind: Equatable, Sendable {
		case element(element: String, attributes: [String: String], bindings: [NativeBinding])
		case text(parts: [NativeTextPart])
		/// An `@if` chain or `@switch`: the first arm whose test is truthy, else the arm with no test, else none.
		case branch(tests: [NativeExpr?])
		/// A keyed `@for`: one row per item of `list`, keyed by `String()` of the item at `key`.
		case `repeat`(list: NativeExpr, key: [String])
	}

	public let id: String
	public let parent: String?
	/// Set when the node belongs to one arm of an `@if`.
	public let arm: NativeArmPlace?
	/// Set when the node belongs to a list row: the `repeat` node's id.
	public let row: String?
	public let kind: Kind

	public var isElement: Bool { if case .element = kind { true } else { false } }
	public var isText: Bool { if case .text = kind { true } else { false } }
}

public enum NativeEventName: String, Sendable {
	case activate
	case input
}

public enum NativeOp: Equatable, Sendable {
	/// The cell takes the expression's value, evaluated before the write.
	case assign(cell: String, value: NativeExpr)
	/// Opens the page at `route` with these params; ops after it do not run.
	case navigate(route: String, params: [NativeRouteParam])
}

public struct NativeRouteParam: Equatable, Sendable {
	public let name: String
	public let value: String
}

/// A page's route as the router spells it (`/[fruit]`) and its param names.
public struct NativeRoute: Equatable, Sendable {
	public let pattern: String
	public let params: [String]

	/// The params a path opens this page with: a `[name]` segment matches one URL-decoded segment; nil when it does not match.
	public func match(_ path: String) -> [NativeRouteParam]? {
		let want = pattern.split(separator: "/", omittingEmptySubsequences: true)
		let have = path.split(separator: "/", omittingEmptySubsequences: true)
		guard want.count == have.count else { return nil }
		var found: [NativeRouteParam] = []
		for (segment, actual) in zip(want, have) {
			if segment.hasPrefix("["), segment.hasSuffix("]") {
				guard let decoded = String(actual).removingPercentEncoding else { return nil }
				found.append(NativeRouteParam(name: String(segment.dropFirst().dropLast()), value: decoded))
			} else if segment != actual {
				return nil
			}
		}
		return found
	}
}

public struct NativeCell: Equatable, Sendable {
	public let id: String
	public let name: String
	public let initial: NativeValue
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
	public let route: NativeRoute?
	public let cells: [NativeCell]
	public let nodes: [NativeNode]
	public let events: [NativeEvent]
	public let handlers: [NativeHandler]

	public static func decode(_ data: Data) throws -> NativeViewPayload {
		try decode(JSONValue.parse(data))
	}

	public static func decode(_ json: JSONValue) throws -> NativeViewPayload {
		let root = try Reader(json, at: "payload")
		let fields = try root.object(required: ["version", "component", "cells", "nodes", "events", "handlers"], optional: ["route"])
		let version = try fields["version"].string()
		guard version == nativeViewVersion else {
			throw PayloadError(path: "payload.version", reason: "unsupported version \"\(version)\", this host reads \(nativeViewVersion)")
		}
		let cells = try fields["cells"].array().map { cell in
			let field = try cell.object(required: ["id", "name", "initial"], optional: ["storage", "styled"])
			let initial = NativeValue(json: try field["initial"].value)
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
			let place = ["arm", "row"]
			switch kind {
			case "element":
				let field = try node.object(required: ["kind", "id", "element", "parent"], optional: ["attributes", "bindings"] + place)
				var attributes: [String: String] = [:]
				if field.has("attributes") {
					let reader = try field["attributes"]
					for key in try reader.keys() { attributes[key] = try reader.field(key).string() }
				}
				let bindings: [NativeBinding] = field.has("bindings") ? try field["bindings"].array().map { binding -> NativeBinding in
					if try binding.keys().contains("property") {
						let b = try binding.object(["property", "value"])
						let property = try b["property"].string()
						guard property == "value" else { throw PayloadError(path: binding.path, reason: "unknown property \"\(property)\"") }
						return NativeBinding(name: property, isProperty: true, value: try decodeExpr(try b["value"]))
					}
					let b = try binding.object(["attribute", "value"])
					return NativeBinding(name: try b["attribute"].string(), isProperty: false, value: try decodeExpr(try b["value"]))
				} : []
				return NativeNode(
					id: try field["id"].string(), parent: try field["parent"].optionalString(), arm: try decodeArm(field),
					row: try decodeRow(field), kind: .element(element: try field["element"].string(), attributes: attributes, bindings: bindings))
			case "text":
				let field = try node.object(required: ["kind", "id", "parent", "parts"], optional: place)
				let parts = try field["parts"].array().map { part -> NativeTextPart in
					let keys = try part.keys()
					if keys == ["text"] { return .text(try part.field("text").string()) }
					if keys == ["cell"] { return .cell(try part.field("cell").string()) }
					if keys == ["expr"] { return .expr(try decodeExpr(try part.field("expr"))) }
					throw PayloadError(path: part.path, reason: "unknown text part with keys \(keys)")
				}
				return NativeNode(
					id: try field["id"].string(), parent: try field["parent"].string(), arm: try decodeArm(field), row: try decodeRow(field),
					kind: .text(parts: parts))
			case "branch":
				let field = try node.object(required: ["kind", "id", "parent", "arms"], optional: place + ["test", "tests"])
				let arms = try field["arms"].number()
				let tests: [NativeExpr?]
				switch (field.has("test"), field.has("tests")) {
				case (true, false):
					guard arms == 1 || arms == 2 else { throw PayloadError(path: node.path + ".arms", reason: "an @if with one test has 1 or 2 arms") }
					tests = [try decodeExpr(try field["test"])] + (arms == 2 ? [nil] : [])
				case (false, true):
					tests = try field["tests"].array().map { $0.isNull ? nil : try decodeExpr($0) }
					guard Double(tests.count) == arms, tests.filter({ $0 == nil }).count <= 1 else {
						throw PayloadError(path: node.path + ".tests", reason: "a branch has one test per arm and at most one arm without a test")
					}
				default: throw PayloadError(path: node.path, reason: "a branch has either test or tests")
				}
				return NativeNode(
					id: try field["id"].string(), parent: try field["parent"].optionalString(), arm: try decodeArm(field),
					row: try decodeRow(field), kind: .branch(tests: tests))
			case "repeat":
				let field = try node.object(required: ["kind", "id", "parent", "list", "key"], optional: place)
				return NativeNode(
					id: try field["id"].string(), parent: try field["parent"].optionalString(), arm: try decodeArm(field),
					row: try decodeRow(field),
					kind: .repeat(list: try decodeExpr(try field["list"]), key: try field["key"].array().map { try $0.string() }))
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
					return .assign(cell: try opField["cell"].string(), value: try decodeExpr(try opField["value"]))
				case "navigate":
					let opField = try op.object(["op", "route", "params"])
					return .navigate(route: try opField["route"].string(), params: try decodeParams(try opField["params"]))
				default:
					throw PayloadError(path: op.path + ".op", reason: "unknown op \"\(name)\"")
				}
			}
			return NativeHandler(id: try field["id"].string(), ops: ops)
		}
		let route: NativeRoute? = fields.has("route") ? try {
			let r = try fields["route"].object(["pattern", "params"])
			return NativeRoute(pattern: try r["pattern"].string(), params: try r["params"].array().map { try $0.string() })
		}() : nil
		let payload = NativeViewPayload(
			component: try fields["component"].string(), route: route, cells: cells, nodes: nodes, events: events, handlers: handlers)
		try payload.check()
		return payload
	}

	static func decodeParams(_ reader: Reader) throws -> [NativeRouteParam] {
		try reader.keys().map { NativeRouteParam(name: $0, value: try reader.field($0).string()) }
	}

	private static func decodeRow(_ fields: Fields) throws -> String? {
		fields.has("row") ? try fields["row"].string() : nil
	}

	private static func decodeArm(_ fields: Fields) throws -> NativeArmPlace? {
		guard fields.has("arm") else { return nil }
		let arm = try fields["arm"].object(["branch", "index"])
		let index = try arm["index"].number()
		guard index >= 0, index == index.rounded() else { throw PayloadError(path: try fields["arm"].path, reason: "arm index must be a whole number") }
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
		case ["event"]:
			let name = try field("event").string()
			guard name == "value" else { throw PayloadError(path: reader.path + ".event", reason: "unknown event read \"\(name)\"") }
			return .eventValue
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
		case ["member", "property"]: return .member(try decodeExpr(try field("member")), try field("property").string())
		case ["array"]:
			return .array(try field("array").array().map { item in
				let f = try item.object(["spread", "value"])
				return NativeArrayItem(spread: try f["spread"].bool(), value: try decodeExpr(try f["value"]))
			})
		case ["object"]:
			return .object(try field("object").array().map { pair in
				let items = try pair.array()
				guard items.count == 2 else { throw PayloadError(path: pair.path, reason: "an object field is [key, expression]") }
				return NativeObjectField(key: try items[0].string(), value: try decodeExpr(items[1]))
			})
		case ["arguments", "method", "target"]:
			let name = try field("method").string()
			guard let method = NativeMethod(rawValue: name) else { throw PayloadError(path: reader.path + ".method", reason: "unknown method \"\(name)\"") }
			return .method(method, target: try decodeExpr(try field("target")), arguments: try field("arguments").array().map(decodeExpr))
		case ["body", "lambda"]:
			return .lambda(parameters: try field("lambda").array().map { try $0.string() }, body: try decodeExpr(try field("body")))
		case ["local"]: return .local(try field("local").string())
		case ["route"]:
			let name = try field("route").string()
			guard name == "params" else { throw PayloadError(path: reader.path + ".route", reason: "unknown route read \"\(name)\"") }
			return .routeParams
		case ["item"]: return .item(try field("item").string())
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
		var repeats = Set<String>()
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
			if let row = node.row, !repeats.contains(row) {
				throw PayloadError(path: "payload.nodes", reason: "\(node.id) sits in a row of \(row), which is not an earlier list")
			}
			switch node.kind {
			case let .element(_, _, bindings):
				elements.insert(node.id)
				try checkCells(node, bindings.map(\.value))
			case let .text(parts):
				try checkCells(node, parts.map { part in
					switch part {
					case .text: return .literal(.bool(true))
					case let .cell(cell): return .cell(cell)
					case let .expr(expr): return expr
					}
				})
			case let .branch(tests):
				branchArms[node.id] = tests.count
				try checkCells(node, tests.compactMap { $0 })
			case let .repeat(list, _):
				repeats.insert(node.id)
				try checkCells(node, [list])
			}
		}
		var handlerIds = Set<String>()
		for handler in handlers {
			guard handlerIds.insert(handler.id).inserted else {
				throw PayloadError(path: "payload.handlers", reason: "duplicate handler \(handler.id)")
			}
			for case let .assign(cell, value) in handler.ops where !cellIds.contains(cell) || !value.cells.allSatisfy(cellIds.contains) {
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

	func scalar() throws -> NativeValue {
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
