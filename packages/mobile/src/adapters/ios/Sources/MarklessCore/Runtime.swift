/// What a person does to a retained view.
public struct NativeAction: Equatable, Sendable {
	public let event: NativeEventName
	public let host: String

	public init(event: NativeEventName, host: String) {
		self.event = event
		self.host = host
	}
}

/// One change the host applies to its retained views after a handler runs.
public enum NativeJournalEntry: Equatable, Sendable {
	case text(node: String, value: String)

	public var json: JSONValue {
		switch self {
		case let .text(node, value): return .object([("op", .string("text")), ("node", .string(node)), ("value", .string(value))])
		}
	}
}

public struct RuntimeError: Error, CustomStringConvertible, Equatable {
	public let reason: String
	public var description: String { reason }
}

/// The payload's state and op interpreter, matching `packages/mobile/src/runtime.ts` exactly.
public final class NativeRuntime {
	public let payload: NativeViewPayload
	private var values: [String: NativeScalar]
	private let textNodes: [(id: String, parts: [NativeTextPart])]
	private let handlers: [String: [NativeOp]]

	public init(payload: NativeViewPayload) {
		self.payload = payload
		values = Dictionary(uniqueKeysWithValues: payload.cells.map { ($0.id, $0.initial) })
		textNodes = payload.nodes.compactMap { node in
			if case let .text(id, _, parts) = node { return (id, parts) }
			return nil
		}
		handlers = Dictionary(uniqueKeysWithValues: payload.handlers.map { ($0.id, $0.ops) })
	}

	private func read(_ cell: String) throws -> NativeScalar {
		guard let value = values[cell] else { throw RuntimeError(reason: "unknown cell \(cell)") }
		return value
	}

	/// Every text node's current string, in document order.
	public func texts() throws -> [(node: String, text: String)] {
		try textNodes.map { node in
			(node.id, try node.parts.map { part in
				switch part {
				case let .text(text): return text
				case let .cell(cell): return try read(cell).text
				}
			}.joined())
		}
	}

	/// Runs the handler bound to the action and returns the journal the host applies.
	public func dispatch(_ action: NativeAction) throws -> [NativeJournalEntry] {
		guard let bound = payload.events.first(where: { $0.host == action.host && $0.event == action.event }) else {
			throw RuntimeError(reason: "no \(action.event.rawValue) handler on \(action.host)")
		}
		let before = Dictionary(uniqueKeysWithValues: try texts().map { ($0.node, $0.text) })
		for op in handlers[bound.handler] ?? [] {
			switch op {
			case let .add(cell, amount):
				guard case let .number(value) = try read(cell) else {
					throw RuntimeError(reason: "add on \(cell), which does not hold a number")
				}
				values[cell] = .number(value + amount)
			}
		}
		return try texts().compactMap { node, text in before[node] == text ? nil : .text(node: node, value: text) }
	}
}
