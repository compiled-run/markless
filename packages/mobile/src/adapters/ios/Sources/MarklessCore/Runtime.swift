/// What a person does to a retained view.
public struct NativeAction: Equatable, Sendable {
	public let event: NativeEventName
	public let host: String
	/// For `input`: the field's whole text after the edit.
	public let value: String?

	public init(event: NativeEventName, host: String, value: String? = nil) {
		self.event = event
		self.host = host
		self.value = value
	}
}

/// One change the host applies to its retained views after a handler runs.
public enum NativeJournalEntry: Equatable, Sendable {
	case text(node: String, value: String)
	/// A styled cell's new value: the host moves to the style export's next assignment.
	case state(cell: String, value: NativeScalar)
	/// nil removes the attribute; "" is a bare attribute.
	case attribute(node: String, name: String, value: String?)
	/// An input's text; never sent to the field whose edit caused it while it already shows that text.
	case property(node: String, name: String, value: String)
	/// Shows arm `index` of a branch (nil: none), built from current values; the old arm's views go.
	case arm(node: String, index: Int?)

	public var json: JSONValue {
		switch self {
		case let .text(node, value): return .object([("op", .string("text")), ("node", .string(node)), ("value", .string(value))])
		case let .state(cell, value):
			return .object([("op", .string("state")), ("cell", .string(cell)), ("value", value.json)])
		case let .attribute(node, name, value):
			return .object([("op", .string("attribute")), ("node", .string(node)), ("name", .string(name)), ("value", value.map(JSONValue.string) ?? .null)])
		case let .property(node, name, value):
			return .object([("op", .string("property")), ("node", .string(node)), ("name", .string(name)), ("value", .string(value))])
		case let .arm(node, index):
			return .object([("op", .string("arm")), ("node", .string(node)), ("index", index.map { .number(Double($0)) } ?? .null)])
		}
	}
}

public struct RuntimeError: Error, CustomStringConvertible, Equatable {
	public let reason: String
	public var description: String { reason }
}

/// Device-kept values by storage key (iOS: `UserDefaults`).
public protocol NativeStore: AnyObject {
	func read(_ key: String) -> NativeScalar?
	func write(_ key: String, _ value: NativeScalar)
}

public final class MemoryStore: NativeStore {
	public private(set) var values: [String: NativeScalar]
	public init(_ values: [String: NativeScalar] = [:]) { self.values = values }
	public func read(_ key: String) -> NativeScalar? { values[key] }
	public func write(_ key: String, _ value: NativeScalar) { values[key] = value }
}

/// The payload's state and op interpreter, matching `packages/mobile/src/runtime.ts` exactly.
public final class NativeRuntime {
	public let payload: NativeViewPayload
	private var values: [String: NativeScalar]
	private let store: NativeStore
	private let storageKeys: [String: String]
	private let handlers: [String: [NativeOp]]
	private let branches: [String: (test: NativeExpr, arms: Int, arm: NativeArmPlace?)]
	private var eventValue: String?

	public init(payload: NativeViewPayload, store: NativeStore = MemoryStore()) {
		self.payload = payload
		self.store = store
		values = Dictionary(uniqueKeysWithValues: payload.cells.map { cell in
			(cell.id, cell.storageKey.flatMap(store.read) ?? cell.initial)
		})
		storageKeys = Dictionary(uniqueKeysWithValues: payload.cells.compactMap { cell in cell.storageKey.map { (cell.id, $0) } })
		handlers = Dictionary(uniqueKeysWithValues: payload.handlers.map { ($0.id, $0.ops) })
		branches = Dictionary(uniqueKeysWithValues: payload.nodes.compactMap { node in
			if case let .branch(id, _, test, arms, arm) = node { return (id, (test, arms, arm)) }
			return nil
		})
	}

	private func read(_ cell: String) throws -> NativeScalar {
		guard let value = values[cell] else { throw RuntimeError(reason: "unknown cell \(cell)") }
		return value
	}

	/// The current value of a cell.
	public func value(of cell: String) throws -> NativeScalar { try read(cell) }

	public func evaluate(_ expr: NativeExpr) throws -> NativeScalar {
		switch expr {
		case let .cell(cell): return try read(cell)
		case let .literal(value): return value
		case let .unary(op, inner):
			let value = try evaluate(inner)
			switch op {
			case "!": return .bool(!value.isTruthy)
			case "-": return .number(-value.number)
			default: return .number(value.number)
			}
		case let .binary(op, left, right): return try evaluateBinary(op, evaluate(left), evaluate(right))
		case let .logical(op, left, right):
			let value = try evaluate(left)
			switch op {
			case "&&": return value.isTruthy ? try evaluate(right) : value
			case "||": return value.isTruthy ? value : try evaluate(right)
			default: return value == .null ? try evaluate(right) : value
			}
		case let .conditional(test, whenTrue, whenFalse): return try evaluate(test).isTruthy ? evaluate(whenTrue) : evaluate(whenFalse)
		case let .template(parts):
			return .string(try parts.map { part in
				switch part {
				case let .text(text): return text
				case let .expr(inner): return try evaluate(inner).text
				}
			}.joined())
		case let .length(inner):
			let value = try evaluate(inner)
			guard case let .string(text) = value else { throw RuntimeError(reason: ".length of a \(value == .null ? "null" : "non-string")") }
			return .number(Double(text.utf16.count))
		case let .call(builtin, arguments): return evaluateCall(builtin, try arguments.map(evaluate))
		case .eventValue:
			guard let eventValue else { throw RuntimeError(reason: "the event value read outside an input handler") }
			return .string(eventValue)
		}
	}

	/// The arm a branch shows now (nil: none).
	public func arm(of branch: String) throws -> Int? {
		guard let site = branches[branch] else { throw RuntimeError(reason: "unknown branch \(branch)") }
		return try evaluate(site.test).isTruthy ? 0 : site.arms > 1 ? 1 : nil
	}

	public func isShown(_ place: NativeArmPlace?) throws -> Bool {
		guard let place else { return true }
		guard let site = branches[place.branch] else { return false }
		return try isShown(site.arm) && arm(of: place.branch) == place.index
	}

	public func text(of parts: [NativeTextPart]) throws -> String {
		try parts.map { part in
			switch part {
			case let .text(text): return text
			case let .cell(cell): return try read(cell).text
			case let .expr(expr): return try evaluate(expr).text
			}
		}.joined()
	}

	/// Every shown text node's current string, in document order.
	public func texts() throws -> [(node: String, text: String)] {
		try payload.nodes.compactMap { node in
			guard case let .text(id, _, parts, arm) = node, try isShown(arm) else { return nil }
			return (id, try text(of: parts))
		}
	}

	/// Every shown element's bound attributes as written: nil absent, "" bare.
	public func attributes() throws -> [(node: String, name: String, value: String?)] {
		try payload.nodes.flatMap { node -> [(node: String, name: String, value: String?)] in
			guard case let .element(id, _, _, _, bindings, arm) = node, try isShown(arm) else { return [] }
			return try bindings.filter { !$0.isProperty }.map { (id, $0.name, marklessAttributeValue($0.name, try evaluate($0.value))) }
		}
	}

	/// Every shown element's bound properties (an input's `value`) as `String(value)`, null reading "".
	public func properties() throws -> [(node: String, name: String, value: String)] {
		try payload.nodes.flatMap { node -> [(node: String, name: String, value: String)] in
			guard case let .element(id, _, _, _, bindings, arm) = node, try isShown(arm) else { return [] }
			return try bindings.filter(\.isProperty).map { binding in
				let value = try evaluate(binding.value)
				return (id, binding.name, value == .null ? "" : value.text)
			}
		}
	}

	/// Every shown branch's chosen arm.
	public func arms() throws -> [(node: String, index: Int?)] {
		try payload.nodes.compactMap { node in
			guard case let .branch(id, _, _, _, arm) = node, try isShown(arm) else { return nil }
			return (id, try self.arm(of: id))
		}
	}

	/// Runs the handler bound to the action and returns the journal the host applies.
	public func dispatch(_ action: NativeAction) throws -> [NativeJournalEntry] {
		guard let bound = payload.events.first(where: { $0.host == action.host && $0.event == action.event }) else {
			throw RuntimeError(reason: "no \(action.event.rawValue) handler on \(action.host)")
		}
		eventValue = action.event == .input ? action.value ?? "" : nil
		defer { eventValue = nil }
		let cellsBefore = values
		let beforeTexts = Dictionary(uniqueKeysWithValues: try texts().map { ($0.node, $0.text) })
		let beforeAttributes = Dictionary(uniqueKeysWithValues: try attributes().map { ("\($0.node)\u{0}\($0.name)", $0.value) })
		var beforeProperties = Dictionary(uniqueKeysWithValues: try properties().map { ("\($0.node)\u{0}\($0.name)", $0.value) })
		if let eventValue { beforeProperties["\(action.host)\u{0}value"] = eventValue }
		let beforeArms = Dictionary(uniqueKeysWithValues: try arms().map { ($0.node, $0.index) })
		for op in handlers[bound.handler] ?? [] {
			let value = try evaluate(op.value)
			values[op.cell] = value
			if let key = storageKeys[op.cell] { store.write(key, value) }
		}
		let afterTexts = Dictionary(uniqueKeysWithValues: try texts().map { ($0.node, $0.text) })
		let afterAttributes = Dictionary(uniqueKeysWithValues: try attributes().map { ("\($0.node)\u{0}\($0.name)", $0.value) })
		let afterProperties = Dictionary(uniqueKeysWithValues: try properties().map { ("\($0.node)\u{0}\($0.name)", $0.value) })
		let afterArms = Dictionary(uniqueKeysWithValues: try arms().map { ($0.node, $0.index) })
		let styles = payload.cells.compactMap { cell -> NativeJournalEntry? in
			guard cell.styled, let before = cellsBefore[cell.id], let after = values[cell.id], !before.strictlyEquals(after) else { return nil }
			return .state(cell: cell.id, value: after)
		}
		return styles + payload.nodes.flatMap { node -> [NativeJournalEntry] in
			switch node {
			case let .text(id, _, _, _):
				guard let before = beforeTexts[id], let after = afterTexts[id], before != after else { return [] }
				return [.text(node: id, value: after)]
			case let .branch(id, _, _, _, _):
				guard let before = beforeArms[id], let after = afterArms[id], before != after else { return [] }
				return [.arm(node: id, index: after)]
			case let .element(id, _, _, _, bindings, _):
				return bindings.compactMap { binding in
					let key = "\(id)\u{0}\(binding.name)"
					if binding.isProperty {
						guard let before = beforeProperties[key], let after = afterProperties[key], before != after else { return nil }
						return .property(node: id, name: binding.name, value: after)
					}
					guard let before = beforeAttributes[key], let after = afterAttributes[key], before != after else { return nil }
					return .attribute(node: id, name: binding.name, value: after)
				}
			}
		}
	}
}
