import Foundation

/// What a person does to a retained view.
public struct NativeAction: Equatable, Sendable {
	public let event: NativeEventName
	/// The element acted on; "" for a `timer`.
	public let host: String
	/// For `input`: the field's whole text after the edit.
	public let value: String?
	/// For `timer`: the journalled timer whose time has come.
	public let timer: String?
	/// For an overlay's `dismiss`: why (`escape`; an outside press arrives as `pointerdown`). A sheet's has none.
	public let reason: String?
	/// For a touch (`pointerdown`, `pointermove`, `pointerup`, `pointercancel`): the touch, numbered from 1 as a phone browser
	/// does (default 1); its place in points from the screen's top left (default 0, 0); the milliseconds since the screen
	/// appeared (default 0).
	public let pointerId: Double?
	public let x: Double?
	public let y: Double?
	public let time: Double?

	public init(
		event: NativeEventName, host: String, value: String? = nil, reason: String? = nil, pointerId: Double? = nil, x: Double? = nil,
		y: Double? = nil, time: Double? = nil
	) {
		self.event = event
		self.host = host
		self.value = value
		timer = nil
		self.reason = reason
		self.pointerId = pointerId
		self.x = x
		self.y = y
		self.time = time
	}

	public init(event: NativeEventName, timer: String) {
		self.event = event
		host = ""
		value = nil
		self.timer = timer
		reason = nil
		pointerId = nil
		x = nil
		y = nil
		time = nil
	}
}

/// A touch that is down: the element it is captured to (nil after a release), the one it counts as over, and whether it was first.
private final class TouchState {
	var capture: String?
	var over: String
	let primary: Bool

	init(capture: String?, over: String, primary: Bool) {
		self.capture = capture
		self.over = over
		self.primary = primary
	}
}

/// One change the host applies to its retained views after a handler runs.
public enum NativeJournalEntry: Equatable, Sendable {
	case text(node: String, value: String)
	/// A styled cell's new value: the host moves to the style export's next assignment.
	case state(cell: String, value: NativeValue)
	/// nil removes the attribute; "" is a bare attribute.
	case attribute(node: String, name: String, value: String?)
	/// An input's text; never sent to the field whose edit caused it while it already shows that text.
	case property(node: String, name: String, value: String)
	/// A checkbox's or radio button's checkedness changed (journalled as the `checked` property).
	case checked(node: String, value: Bool)
	/// A list's new row order: rows whose key left go, new rows are built from current values, the rest move.
	case rows(node: String, keys: [String])
	/// Shows arm `index` of a branch (nil: none), built from current values; the old arm's views go.
	case arm(node: String, index: Int?)
	/// A system sheet's `open` turned truthy (present it) or falsy (dismiss it, unless the platform already has).
	case sheet(node: String, open: Bool)
	/// Leave this page for the page at `route`, built from scratch with `params`: pushed, or in this screen's place.
	case navigate(route: String, params: [NativeRouteParam], replace: Bool)
	/// The page's title text changed.
	case title(value: String)
	/// Run a device call now (on `object` when it names one); with `result`, settle that task cell with what it gives; with
	/// `resume`, answer with `resume(_:value:)` once the call settles.
	case call(call: String, object: String?, arguments: [NativeValue], result: String?, resume: String?)
	/// The device object's owner left the screen: the host stops it and forgets it.
	case release(object: String)
	/// A `<dialog>` put in the top layer (`open`) or taken out.
	case dialog(node: String, open: Bool)
	/// A `command` op the handler ran, after every other entry, in order.
	case command(node: String, command: String, preventScroll: Bool)
	/// A submit stopped: focus moves to `node` as `focus()` would and `message` shows until the next action.
	case invalid(node: String, message: String)
	/// Dispatch a `timer` action for `timer` in `ms` milliseconds (once; a script's interval asks again when it fires).
	case timer(timer: String, ms: Double)
	/// The script cleared a timer it set (`script:<n>`): drop it.
	case clearTimer(timer: String)
	/// The script called `fetch`: send the request and answer with `response(_:_:)`.
	case fetch(id: Int, request: NativeFetchRequest)
	/// An element marked `overlay` joined the overlay stack (`open`) or left it; a modal one goes in the top layer.
	case overlay(node: String, open: Bool, modal: Bool)

	public var json: JSONValue {
		switch self {
		case let .text(node, value): return .object([("op", .string("text")), ("node", .string(node)), ("value", .string(value))])
		case let .state(cell, value):
			return .object([("op", .string("state")), ("cell", .string(cell)), ("value", value.json)])
		case let .attribute(node, name, value):
			return .object([("op", .string("attribute")), ("node", .string(node)), ("name", .string(name)), ("value", value.map(JSONValue.string) ?? .null)])
		case let .property(node, name, value):
			return .object([("op", .string("property")), ("node", .string(node)), ("name", .string(name)), ("value", .string(value))])
		case let .checked(node, value):
			return .object([("op", .string("property")), ("node", .string(node)), ("name", .string("checked")), ("value", .bool(value))])
		case let .rows(node, keys):
			return .object([("op", .string("rows")), ("node", .string(node)), ("keys", .array(keys.map(JSONValue.string)))])
		case let .arm(node, index):
			return .object([("op", .string("arm")), ("node", .string(node)), ("index", index.map { .number(Double($0)) } ?? .null)])
		case let .sheet(node, open):
			return .object([("op", .string("sheet")), ("node", .string(node)), ("open", .bool(open))])
		case let .navigate(route, params, replace):
			return .object([("op", .string("navigate")), ("route", .string(route)), ("params", .object(params.map { ($0.name, .string($0.value)) }))]
				+ (replace ? [("replace", .bool(true))] : []))
		case let .title(value): return .object([("op", .string("title")), ("value", .string(value))])
		case let .call(call, object, arguments, result, resume):
			var fields: [(String, JSONValue)] = [("op", .string("call")), ("call", .string(call))]
			if let object { fields.append(("object", .string(object))) }
			fields.append(("arguments", .array(arguments.map(\.json))))
			if let result { fields.append(("result", .string(result))) }
			if let resume { fields.append(("resume", .string(resume))) }
			return .object(fields)
		case let .release(object): return .object([("op", .string("release")), ("object", .string(object))])
		case let .dialog(node, open):
			return .object([("op", .string("dialog")), ("node", .string(node)), ("open", .bool(open))])
		case let .command(node, command, preventScroll):
			return .object([("op", .string("command")), ("node", .string(node)), ("command", .string(command))] + (preventScroll ? [("preventScroll", .bool(true))] : []))
		case let .invalid(node, message):
			return .object([("op", .string("invalid")), ("node", .string(node)), ("message", .string(message))])
		case let .timer(timer, ms):
			return .object([("op", .string("timer")), ("timer", .string(timer)), ("ms", .number(ms))])
		case let .clearTimer(timer): return .object([("op", .string("clearTimer")), ("timer", .string(timer))])
		case let .fetch(id, request): return .object([("op", .string("fetch")), ("id", .number(Double(id))), ("request", request.json)])
		case let .overlay(node, open, modal):
			return .object([("op", .string("overlay")), ("node", .string(node)), ("open", .bool(open)), ("modal", .bool(modal))])
		}
	}
}

public struct RuntimeError: Error, CustomStringConvertible, Equatable {
	public let reason: String
	public var description: String { reason }
}

/// Device-kept values by storage key (iOS: `UserDefaults`).
public protocol NativeStore: AnyObject {
	func read(_ key: String) -> NativeValue?
	func write(_ key: String, _ value: NativeValue)
}

public final class MemoryStore: NativeStore {
	public private(set) var values: [String: NativeValue]
	public init(_ values: [String: NativeValue] = [:]) { self.values = values }
	public func read(_ key: String) -> NativeValue? { values[key] }
	public func write(_ key: String, _ value: NativeValue) { values[key] = value }
}

/// What names mean inside a list row or a lambda: row items by `repeat` id, lambda parameters by name.
public struct NativeScope: Sendable {
	public var items: [String: NativeValue] = [:]
	/// The row keys by `repeat` id, where a row's own state is read.
	public var keys: [String: String] = [:]
	public var locals: [String: NativeValue] = [:]
	public static let empty = NativeScope()
}

/// One shown copy of a node: the node itself outside lists, one per row inside one (`<id>@<key>`).
public struct NativeInstance {
	public let id: String
	public let scope: NativeScope
}

/// One run of a form's submit handler, kept while an `after` it started is pending.
private final class Submission {
	let sent: [[String]]
	let submitter: String?
	let marks: Bool
	var pending = 0

	init(sent: [[String]], submitter: String?, marks: Bool) {
		self.sent = sent
		self.submitter = submitter
		self.marks = marks
	}
}

private struct Context {
	let locals: [String: NativeValue]
	let submission: Submission?
}

/// The payload's state and op interpreter, matching `packages/mobile/src/runtime.ts` exactly.
public final class NativeRuntime {
	public let payload: NativeViewPayload
	private var values: [String: NativeValue]
	private let store: NativeStore
	private let storageKeys: [String: String]
	private let handlers: [String: [NativeOp]]
	private let continuations: [String: NativeContinuation]
	private let nodesById: [String: NativeNode]
	private let params: [NativeRouteParam]
	/// Row state's list by cell id: its values are kept as `<cell>@<key>`.
	private let rowOfCell: [String: String]
	private var eventValue: String?
	/// What a dismiss or pointer event carries while its handlers run.
	private var eventFields: [NativeEventField: NativeValue]?
	/// What a touch adds to a script pointer handler's event, in the order the reference writes them.
	private let touchFields: [NativeEventField] = [.button, .buttons, .clientX, .clientY, .pointerId, .pointerType, .isPrimary, .timeStamp]
	/// The element that has focus, or nil.
	public private(set) var focused: String?
	/// The overlay stack, topmost last, and the focus each overlay found when it joined, as the web's overlay behaviour keeps them.
	private var stack: [String] = []
	private var origins: [String: String] = [:]
	/// Each touch that is down, by pointer id.
	private var touches: [Double: TouchState] = [:]
	private var overlayNodes: [NativeNode] = []
	private let forms: [String: NativeForm]
	/// A field's text a person typed since its `value` binding last changed it.
	private var edited: [String: String] = [:]
	private var running: [String: [Submission]] = [:]
	private var timers: [String: (ops: [NativeOp], context: Context)] = [:]
	private var timerCount = 0
	/// Every non-row checkbox and radio button, in payload order.
	private let ticked: [NativeNode]
	/// Each one's checkedness: its `checked` binding sets it, as does a person's tick.
	private var checkedness: [String: Bool] = [:]
	private let missing: NativeValueMissing?
	/// Each `<dialog>`'s top-layer state; every dialog mounts closed.
	public private(set) var dialogs: [String: Bool]
	/// Where a page with a script gets its engine; asked only when a script op runs or a script computed is read.
	private let scriptHost: NativeScriptHost?

	/// The device's clock, in milliseconds since 1970 (UTC).
	private let now: () -> Double
	/// `idle` and `visible` handlers that ran, by `<event>\0<instance>`; an instance that leaves the screen is forgotten.
	private var fired = Set<String>()

	/// `params`: the route params the page opened with; `now`: the clock (a conformance run fixes it).
	/// `preferredLanguages`: the device's, most preferred first; the web's messages are shown in the first one the payload has.
	public init(
		payload: NativeViewPayload, store: NativeStore = MemoryStore(), params: [NativeRouteParam] = [], preferredLanguages: [String] = ["en"],
		now: @escaping () -> Double = { (Date().timeIntervalSince1970 * 1000).rounded(.down) }, scriptHost: NativeScriptHost? = nil
	) {
		self.payload = payload
		self.params = params
		self.store = store
		self.now = now
		self.scriptHost = scriptHost
		let opened = now()
		values = Dictionary(uniqueKeysWithValues: payload.cells.map { cell in
			(cell.id, cell.clock ? .number(opened) : cell.storageKey.flatMap(store.read) ?? cell.initial)
		})
		storageKeys = Dictionary(uniqueKeysWithValues: payload.cells.compactMap { cell in cell.storageKey.map { (cell.id, $0) } })
		handlers = Dictionary(uniqueKeysWithValues: payload.handlers.map { ($0.id, $0.ops) })
		var continuations: [String: NativeContinuation] = [:]
		func collect(_ ops: [NativeOp]) {
			for case let .call(_, _, _, _, then?) in ops {
				continuations[then.id] = then
				collect(then.ops)
			}
		}
		for handler in payload.handlers { collect(handler.ops) }
		self.continuations = continuations
		rowOfCell = Dictionary(uniqueKeysWithValues: payload.cells.compactMap { cell in cell.row.map { (cell.id, $0) } })
		nodesById = Dictionary(uniqueKeysWithValues: payload.nodes.map { ($0.id, $0) })
		forms = Dictionary(payload.forms.map { ($0.node, $0) }, uniquingKeysWith: { first, _ in first })
		ticked = payload.nodes.filter { node in
			guard node.row == nil, case let .element("input", attributes, _) = node.kind else { return false }
			return attributes["type"] == "checkbox" || attributes["type"] == "radio"
		}
		let locale = nativeLocale(preferredLanguages, payload.valueMissing.map(\.locale))
		missing = payload.valueMissing.first { $0.locale == locale }?.messages
		dialogs = Dictionary(uniqueKeysWithValues: payload.nodes.compactMap { node in
			if case let .element(element, _, _) = node.kind, element == "dialog" { return (node.id, false) }
			return nil
		})
		for node in ticked {
			guard case let .element(_, attributes, _) = node.kind else { continue }
			checkedness[node.id] = (try? checkedBinding(node.id)) ?? (attributes["checked"] != nil)
		}
		overlayNodes = payload.nodes.filter { node in
			guard node.row == nil, case let .element(_, attributes, bindings) = node.kind else { return false }
			return attributes[OverlayProtocol.attribute] != nil && bindings.contains { !$0.isProperty && $0.name == "hidden" }
		}
		// Shown at mount: the document's focus is the body.
		if let shown = try? shownOverlays() {
			stack = shown
			for overlay in shown { origins[overlay] = nativeDocumentBody }
		}
	}

	/// A row's copy (`<node>@<key>`) sits where its node does in the tree.
	private func nodeOf(_ id: String) -> String { id.firstIndex(of: "@").map { String(id[..<$0]) } ?? id }

	public func isElement(_ id: String) -> Bool { id == nativeDocumentBody || nodesById[nodeOf(id)]?.isElement == true }

	/// `within.contains(node)`, read from the payload's parent chain; everything is inside the body.
	public func contains(_ within: String, _ node: String) -> Bool {
		if within == nativeDocumentBody { return true }
		var at: String? = nodeOf(node)
		while let current = at {
			if current == nodeOf(within) { return true }
			at = nodesById[current]?.parent
		}
		return false
	}

	private func keyedAttributes() throws -> [String: String?] {
		Dictionary(try attributes().map { ("\($0.node)\u{0}\($0.name)", $0.value) }, uniquingKeysWith: { $1 })
	}

	private func shownOverlays() throws -> [String] {
		let now = try keyedAttributes()
		return try overlayNodes.filter { node in try !instances(of: node).isEmpty && now["\(node.id)\u{0}hidden"] == .some(nil) }.map(\.id)
	}

	/// An overlay is modal when it or an element inside it has `aria-modal="true"`, bound or else static.
	private func isModal(_ overlay: String, _ now: [String: String?]) -> Bool {
		payload.nodes.contains { node in
			guard case let .element(_, attributes, _) = node.kind, contains(overlay, node.id) else { return false }
			let value = now["\(node.id)\u{0}\(OverlayProtocol.modalAttribute)"] ?? attributes[OverlayProtocol.modalAttribute]
			return value == OverlayProtocol.modalValue
		}
	}

	/// The overlay stack, topmost last, with whether each is modal.
	public func overlays() throws -> [(node: String, modal: Bool)] {
		let now = try keyedAttributes()
		return stack.map { ($0, isModal($0, now)) }
	}

	/// Where a cell's value is kept: its id, or `<id>@<key>` for a row's own state, read in that row.
	private func slot(of cell: String, in scope: NativeScope) throws -> String {
		guard let row = rowOfCell[cell] else { return cell }
		guard let key = scope.keys[row] else { throw RuntimeError(reason: "the row state \(cell) read outside its row") }
		return "\(cell)@\(key)"
	}

	/// A row's state reads its first value until the row writes it.
	private func read(_ cell: String, in scope: NativeScope = .empty) throws -> NativeValue {
		guard let value = values[cell] else { throw RuntimeError(reason: "unknown cell \(cell)") }
		return values[try slot(of: cell, in: scope)] ?? value
	}

	/// The current value of a cell.
	public func value(of cell: String) throws -> NativeValue { try read(cell) }

	public func evaluate(_ expr: NativeExpr, in scope: NativeScope = .empty) throws -> NativeValue {
		let evaluate = { (inner: NativeExpr) throws -> NativeValue in try self.evaluate(inner, in: scope) }
		switch expr {
		case let .cell(cell): return try read(cell, in: scope)
		case let .literal(value): return value
		case let .item(repeatId):
			guard let item = scope.items[repeatId] else { throw RuntimeError(reason: "the row item of \(repeatId) read outside its row") }
			return item
		case let .local(name):
			guard let value = scope.locals[name] else { throw RuntimeError(reason: "the parameter \(name) read outside its function") }
			return value
		case let .array(items):
			var values: [NativeValue] = []
			for item in items {
				let value = try evaluate(item.value)
				if !item.spread { values.append(value); continue }
				guard case let .array(array) = value else { throw RuntimeError(reason: "a spread of a value that is not an array") }
				values += array.items
			}
			return .array(values)
		case let .object(fields): return .object(try fields.map { (key: $0.key, value: try evaluate($0.value)) })
		case .lambda: throw RuntimeError(reason: "a function value outside a method call")
		case let .method(method, target, arguments):
			let targetValue = try evaluate(target)
			let args = try arguments.map { argument -> MethodArgument in
				guard case let .lambda(parameters, body) = argument else { return .value(try evaluate(argument)) }
				return .function { values in
					var inner = scope
					for (index, name) in parameters.enumerated() { inner.locals[name] = index < values.count ? values[index] : .null }
					return try self.evaluate(body, in: inner)
				}
			}
			return try callMethod(method, on: targetValue, args)
		case .routeParams: return .object(params.map { (key: $0.name, value: .string($0.value)) })
		case let .checked(node): return .bool(try isChecked(node))
		case let .formData(form): return .array(try entries(of: form).map { .array($0.map(NativeValue.string)) })
		case .event(.value):
			guard let eventValue else { throw RuntimeError(reason: "the event's value read where the event has none") }
			return .string(eventValue)
		case let .event(name):
			guard let value = eventFields?[name] else { throw RuntimeError(reason: "the event's \(name.rawValue) read where the event has none") }
			return value
		case .focused: return .string(focused ?? nativeDocumentBody)
		case let .focusOrigin(inner):
			guard case let .string(overlay) = try evaluate(inner) else { return .null }
			return origins[overlay].map(NativeValue.string) ?? .null
		case let .isElement(inner):
			guard case let .string(id) = try evaluate(inner) else { return .bool(false) }
			return .bool(isElement(id))
		case let .contains(within, node):
			let outer = try evaluate(within)
			let inner = try evaluate(node)
			guard case let .string(a) = outer, case let .string(b) = inner else { return .bool(false) }
			return .bool(contains(a, b))
		case let .captures(node, pointer):
			let element = try evaluate(node)
			let id = try evaluate(pointer)
			guard case let .string(a) = element, case let .number(b) = id else { return .bool(false) }
			return .bool(touches[b]?.capture == a)
		case let .unary(op, inner):
			let value = try evaluate(inner)
			switch op {
			case "!": return .bool(!value.isTruthy)
			case "-": return .number(-value.primitive.number)
			case "typeof": return .string(value.typeName)
			default: return .number(value.primitive.number)
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
		case let .member(inner, property):
			let value = try evaluate(inner)
			switch value {
			case let .string(text) where property == "length": return .number(Double(text.utf16.count))
			case let .array(array) where property == "length": return .number(Double(array.items.count))
			case let .array(array):
				// An index past the end is `undefined` on the web, which a native value spells null.
				if let index = Int(property), index >= 0, String(index) == property { return index < array.items.count ? array.items[index] : .null }
			case let .object(object): if let found = object.get(property) { return found }
			default: break
			}
			throw RuntimeError(reason: ".\(property) of a value that has none")
		case let .call(builtin, arguments): return try evaluateCall(builtin, try arguments.map(evaluate), now: now)
		case let .at(index, list):
			guard case let .array(array) = try evaluate(list) else { throw RuntimeError(reason: "an index into a value that is not an array") }
			guard case let .number(at) = try evaluate(index), at >= 0, at.rounded() == at, at < Double(array.items.count) else { return .null }
			return array.items[Int(at)]
		case let .script(fn, bindings):
			let frame = try frame(of: bindings, in: scope)
			return try scriptHost.unwrap().entry {
				let text = try callScript("enter", .object([("kind", .string("compute")), ("fn", .string(fn)), ("frame", frame), ("elements", try elementFacts(frame))] + entryCells()))
				return NativeValue(json: try JSONValue.parse(Data(text.utf8)))
			}
		}
	}

	/// Calls `enter` or `leave` of the payload's script, starting the app's engine (and loading the script) when needed.
	private func callScript(_ method: String, _ argument: JSONValue? = nil) throws -> String {
		guard let script = payload.script else { throw RuntimeError(reason: "a script op in a payload with no script") }
		let engine = try scriptHost.unwrap().load(script)
		let target = "globalThis.__markless[\(quoteJavaScriptString(script.id))].\(method)"
		return try engine.evaluate(argument.map { "\(target)(\(quoteJavaScriptString($0.jsonText)))" } ?? "\(target)()")
	}

	/// The names a script function reads, as its engine entry spells them: slots of this scope's cells, and values.
	private func frame(of bindings: [NativeScriptBinding], in scope: NativeScope) throws -> JSONValue {
		.object(try bindings.map { binding -> (String, JSONValue) in
			switch binding.kind {
			case let .cell(cell): return (binding.name, .object([("slot", .string(try slot(of: cell, in: scope)))]))
			case let .fields(fields):
				return (binding.name, .object([("fields", .object(try fields.map { ($0.name, .string(try slot(of: $0.cell, in: scope))) }))]))
			case let .value(expr): return (binding.name, .object([("value", try evaluate(expr, in: scope).json)]))
			case let .elements(expr): return (binding.name, .object([("elements", try evaluate(expr, in: scope).json)]))
			case let .object(members): return (binding.name, .object([("object", try frame(of: members, in: scope))]))
			case let .shared(members): return (binding.name, .object([("shared", try frame(of: members, in: scope))]))
			}
		})
	}

	/// What the host tells a script about the elements its frame passes as proxies: each one's attributes now and the
	/// elements it is inside, nearest first.
	private func elementFacts(_ frame: JSONValue) throws -> JSONValue {
		var facts: [(String, JSONValue)] = []
		var seen = Set<String>()
		func add(_ value: JSONValue) throws {
			guard case let .string(id) = value, !seen.contains(id), isElement(id), id != nativeDocumentBody else { return }
			seen.insert(id)
			let key = id.firstIndex(of: "@").map { String(id[$0...]) } ?? ""
			let found = try element(nodeOf(id))
			var names: [String] = []
			for name in found.attributes.keys.sorted() + found.bindings.filter({ !$0.isProperty }).map(\.name) where !names.contains(name) { names.append(name) }
			var attributes: [(String, JSONValue)] = []
			for name in names { if let value = try attributeNow(nodeOf(id), name) { attributes.append((name, .string(value))) } }
			var ancestors: [JSONValue] = []
			var up = found.node.parent
			while let parent = up {
				ancestors.append(.string(!key.isEmpty && nodesById[parent]?.row != nil ? parent + key : parent))
				up = nodesById[parent]?.parent
			}
			facts.append((id, .object([("attributes", .object(attributes)), ("ancestors", .array(ancestors))])))
		}
		func visit(_ frame: JSONValue) throws {
			guard case let .object(names) = frame else { return }
			for (_, binding) in names {
				guard case let .object(fields) = binding else { continue }
				for (key, inner) in fields where key == "object" || key == "shared" { try visit(inner) }
				guard let given = fields.first(where: { $0.0 == "elements" })?.1 else { continue }
				if case let .array(items) = given { for item in items { try add(item) } } else { try add(given) }
			}
		}
		try visit(frame)
		return .object(facts)
	}

	/// Every current value by slot (the page's cells in payload order, then row slots), and a seed when `crypto` is used.
	private func entryCells() -> [(String, JSONValue)] {
		let ids = Set(payload.cells.map(\.id))
		let cells = payload.cells.compactMap { cell in values[cell.id].map { (cell.id, $0.json) } }
			+ values.keys.filter { !ids.contains($0) }.sorted().map { ($0, values[$0]!.json) }
		let crypto = payload.script?.services.contains(.crypto) == true
		return [("cells", .object(cells))] + (crypto ? [("seed", .string(scriptHost?.seed() ?? ""))] : [])
	}

	/// One engine entry, then what it asked for: its writes land in cells; clears, timers and requests become entries.
	private func enter(_ entry: [(String, JSONValue)]) throws -> [NativeJournalEntry] {
		let text = try scriptHost.unwrap().entry { () throws -> String in
			_ = try callScript("enter", .object(entry + entryCells()))
			return try callScript("leave")
		}
		let result = try Reader(try JSONValue.parse(Data(text.utf8)), at: "leave").object(required: ["writes", "timers", "clears", "requests", "logs"], optional: ["commands"])
		for write in try result["writes"].array() {
			let pair = try write.array()
			guard pair.count == 2 else { throw write.fail("a write is [slot, value]") }
			let slot = try pair[0].string()
			let cell = slot.firstIndex(of: "@").map { String(slot[..<$0]) } ?? slot
			guard values[cell] != nil, payload.cells.contains(where: { $0.id == cell }) else { throw RuntimeError(reason: "the script wrote unknown cell \(cell)") }
			let value = NativeValue(json: pair[1].value)
			values[slot] = value
			if let key = storageKeys[cell] { store.write(key, value) }
		}
		for line in try result["logs"].array() {
			let pair = try line.array()
			guard pair.count == 2 else { throw line.fail("a log line is [level, text]") }
			scriptHost?.log(try pair[0].string(), try pair[1].string())
		}
		let clears = try result["clears"].array().map { NativeJournalEntry.clearTimer(timer: "\(scriptTimer)\(try wholeNumber($0))") }
		let timers = try result["timers"].array().map { timer -> NativeJournalEntry in
			let pair = try timer.array()
			guard pair.count == 2 else { throw timer.fail("a timer is [id, ms]") }
			return .timer(timer: "\(scriptTimer)\(try wholeNumber(pair[0]))", ms: try pair[1].number())
		}
		let requests = try result["requests"].array().map { request -> NativeJournalEntry in
			let fields = try request.object(["id", "request"])
			let asked = try fields["request"].object(["url", "method", "headers", "body"])
			return .fetch(id: try wholeNumber(fields["id"]), request: NativeFetchRequest(
				url: try asked["url"].string(), method: try asked["method"].string(), headers: try decodeHeaders(asked["headers"]),
				body: try asked["body"].optionalString()))
		}
		let commands = try (result.has("commands") ? result["commands"].array() : []).compactMap { command -> NativeJournalEntry? in
			let parts = try command.array()
			guard parts.count == 3 else { throw command.fail("a command is [node, command, preventScroll]") }
			let node = try parts[0].string()
			let name = try parts[1].string()
			// A dialog's showModal() and close() change what the views show; the journal's dialog entry says so.
			if name == "showModal" || name == "close" {
				guard dialogs[node] != nil else { throw RuntimeError(reason: "\(name)() on \(node), which is not a dialog") }
				dialogs[node] = name == "showModal"
				return nil
			}
			if name == "focus" { focused = node }
			return .command(node: node, command: name, preventScroll: try parts[2].bool())
		}
		return clears + timers + requests + commands
	}

	/// The host's answer to a `fetch` entry.
	public func response(_ id: Int, _ response: NativeFetchResponse) throws -> [NativeJournalEntry] {
		try change(host: nil) { try self.enter([("kind", .string("response")), ("request", .number(Double(id))), ("response", response.json)]) }
	}

	/// The arm a branch shows now (nil: none).
	public func arm(of branch: String) throws -> Int? {
		guard let node = nodesById[branch], case let .branch(tests) = node.kind else { throw RuntimeError(reason: "unknown branch \(branch)") }
		for (index, test) in tests.enumerated() {
			if let test, try evaluate(test).isTruthy { return index }
		}
		return tests.firstIndex { $0 == nil }
	}

	public func isShown(_ place: NativeArmPlace?) throws -> Bool {
		guard let place else { return true }
		guard let branch = nodesById[place.branch] else { return false }
		return try isShown(branch.arm) && arm(of: place.branch) == place.index
	}

	/// A list's rows now: each item with its key, `String()` of the item at the key path.
	public func rows(of repeatId: String) throws -> [(key: String, item: NativeValue)] {
		guard let node = nodesById[repeatId], case let .repeat(list, keyPath) = node.kind else { throw RuntimeError(reason: "unknown list \(repeatId)") }
		guard case let .array(array) = try evaluate(list) else { throw RuntimeError(reason: "\(repeatId) lists a value that is not an array") }
		return try array.items.map { item in
			var key = item
			for step in keyPath {
				guard case let .object(object) = key, let next = object.get(step) else {
					throw RuntimeError(reason: "\(repeatId): a row has no key at \(keyPath.joined(separator: "."))")
				}
				key = next
			}
			return (key.text, item)
		}
	}

	/// Every shown copy of a node.
	public func instances(of node: NativeNode) throws -> [NativeInstance] {
		guard try isShown(node.arm) else { return [] }
		guard let row = node.row else { return [NativeInstance(id: node.id, scope: .empty)] }
		guard let list = nodesById[row], try isShown(list.arm) else { return [] }
		return try rows(of: row).map { NativeInstance(id: "\(node.id)@\($0.key)", scope: NativeScope(items: [row: $0.item], keys: [row: $0.key])) }
	}

	public func text(of parts: [NativeTextPart], in scope: NativeScope = .empty) throws -> String {
		try parts.map { part in
			switch part {
			case let .text(text): return text
			case let .cell(cell): return textOf(try read(cell, in: scope))
			case let .expr(expr): return textOf(try evaluate(expr, in: scope))
			}
		}.joined()
	}

	/// How a value reads in text, as the web writes it: null is empty, anything else `String(value)`.
	private func textOf(_ value: NativeValue) -> String { value == .null ? "" : value.text }

	/// Every shown text instance's current string, in document order.
	public func texts() throws -> [(node: String, text: String)] {
		try payload.nodes.flatMap { node -> [(node: String, text: String)] in
			guard case let .text(parts) = node.kind else { return [] }
			return try instances(of: node).map { ($0.id, try text(of: parts, in: $0.scope)) }
		}
	}

	private func bound(properties: Bool) throws -> [(node: String, name: String, value: NativeValue)] {
		try payload.nodes.flatMap { node -> [(node: String, name: String, value: NativeValue)] in
			guard case let .element(_, _, bindings) = node.kind else { return [] }
			return try instances(of: node).flatMap { instance in
				try bindings.filter { $0.isProperty == properties }.map { (instance.id, $0.name, try evaluate($0.value, in: instance.scope)) }
			}
		}
	}

	/// Every shown element's bound attributes as written (nil absent, "" bare), then each form's marks.
	public func attributes() throws -> [(node: String, name: String, value: String?)] {
		try boundAttributes() + marks().map { ($0.node, $0.name, $0.value) }
	}

	private func boundAttributes() throws -> [(node: String, name: String, value: String?)] {
		try bound(properties: false).map { ($0.node, $0.name, marklessAttributeValue($0.name, $0.value)) }
	}

	/// Every shown input's bound `value`, as `String(value)` with null reading "".
	public func properties() throws -> [(node: String, name: String, value: String)] {
		try bound(properties: true).filter { $0.name == "value" }.map { ($0.node, $0.name, $0.value == .null ? "" : $0.value.text) }
	}

	private func element(_ id: String) throws -> (node: NativeNode, attributes: [String: String], bindings: [NativeBinding]) {
		guard let node = nodesById[id], case let .element(_, attributes, bindings) = node.kind else { throw RuntimeError(reason: "\(id) is not an element") }
		return (node, attributes, bindings)
	}

	/// An attribute as the web has it now: a binding's value as written, else the attribute the element was built with.
	private func attributeNow(_ id: String, _ name: String) throws -> String? {
		let found = try element(id)
		if let binding = found.bindings.first(where: { !$0.isProperty && $0.name == name }) {
			return marklessAttributeValue(name, try evaluate(binding.value))
		}
		return found.attributes[name]
	}

	private func propertyBinding(_ id: String, _ name: String) throws -> NativeBinding? {
		try element(id).bindings.first { $0.isProperty && $0.name == name }
	}

	private func textOf(field id: String) throws -> String {
		if let typed = edited[id] { return typed }
		if let binding = try propertyBinding(id, "value") { return textOf(try evaluate(binding.value)) }
		return try attributeNow(id, "value") ?? ""
	}

	private func checkedBinding(_ id: String) throws -> Bool? {
		try propertyBinding(id, "checked").map { try evaluate($0.value).isTruthy }
	}

	/// A checkbox's or radio button's checkedness now.
	public func isChecked(_ id: String) throws -> Bool {
		guard let checked = checkedness[id] else { throw RuntimeError(reason: "\(id) is not a checkbox or radio button") }
		return checked
	}

	/// Every shown checkbox's and radio button's checkedness.
	public func checks() throws -> [(node: String, checked: Bool)] {
		try ticked.compactMap { node in try isShown(node.arm) ? (node.id, try isChecked(node.id)) : nil }
	}

	private func formOf(_ id: String) -> String? {
		payload.forms.first { form in form.fields.contains { $0.node == id } }?.node
	}

	/// The radio buttons of `id`'s group: the same `name`, in the same form or in none.
	private func group(of id: String) throws -> [NativeNode] {
		let name = try attributeNow(id, "name")
		let form = formOf(id)
		return try ticked.filter { node in
			if node.id == id { return true }
			guard case let .element(_, attributes, _) = node.kind, attributes["type"] == "radio", let name, !name.isEmpty else { return false }
			return try attributeNow(node.id, "name") == name && formOf(node.id) == form
		}
	}

	private func isShownField(_ id: String) throws -> Bool { try isShown(try element(id).node.arm) }

	/// A form's entry list as the web builds it: `[name, value]` pairs in tree order.
	public func entries(of id: String) throws -> [[String]] {
		guard let form = forms[id] else { throw RuntimeError(reason: "\(id) is not a form") }
		return try form.fields.compactMap { field -> [String]? in
			guard try isShownField(field.node), try attributeNow(field.node, "disabled") == nil,
				let name = try attributeNow(field.node, "name"), !name.isEmpty
			else { return nil }
			switch field.kind {
			case .checkbox, .radio: return try isChecked(field.node) ? [name, try attributeNow(field.node, "value") ?? "on"] : nil
			case .hidden: return [name, try attributeNow(field.node, "value") ?? ""]
			case .text: return [name, try textOf(field: field.node)]
			}
		}
	}

	/// The first field that stops a submit, or nil when none does.
	private func firstInvalid(_ form: NativeForm, submitter: String?) throws -> NativeForm.Field? {
		if form.noValidate { return nil }
		if let submitter, try attributeNow(submitter, "formnovalidate") != nil { return nil }
		return try form.fields.first { field in
			guard field.kind != .hidden, try isShownField(field.node) else { return false }
			guard try attributeNow(field.node, "disabled") == nil else { return false }
			// A radio button is missing its value when any button of its group is required and none is checked.
			let required = field.kind == .radio
				? try group(of: field.node).contains { try attributeNow($0.id, "required") != nil }
				: try attributeNow(field.node, "required") != nil
			guard required else { return false }
			if field.kind == .radio { return try group(of: field.node).allSatisfy { !(try isChecked($0.id)) } }
			return field.kind == .text ? try textOf(field: field.node) == "" : !(try isChecked(field.node))
		}
	}

	/// `aria-busy` on a form while a submission of it runs, `aria-disabled` on the button that sent a marking one.
	private func marks() -> [(node: String, name: String, value: String?)] {
		payload.forms.flatMap { form -> [(node: String, name: String, value: String?)] in
			let runs = running[form.node] ?? []
			let busy = (node: form.node, name: "aria-busy", value: runs.isEmpty ? nil : Optional("true"))
			if form.authoredAriaDisabled { return [busy] }
			return [busy] + form.submitters.map { submitter in
				(submitter, "aria-disabled", runs.contains { $0.marks && $0.submitter == submitter } ? "true" : nil)
			}
		}
	}

	private func settle(_ submission: Submission?) {
		guard let submission, submission.pending == 0 else { return }
		for (form, runs) in running {
			let left = runs.filter { $0 !== submission }
			running[form] = left.isEmpty ? nil : left
		}
	}

	/// Every shown branch's chosen arm.
	public func arms() throws -> [(node: String, index: Int?)] {
		try payload.nodes.compactMap { node in
			guard case .branch = node.kind, try isShown(node.arm) else { return nil }
			return (node.id, try arm(of: node.id))
		}
	}

	/// Every shown list's row keys, in order.
	public func rows() throws -> [(node: String, keys: [String])] {
		try payload.nodes.compactMap { node in
			guard case .repeat = node.kind, try isShown(node.arm) else { return nil }
			return (node.id, try rows(of: node.id).map(\.key))
		}
	}

	/// The page's `<title>` text, nil when it has none.
	public func title() throws -> String? { try payload.title.map { try text(of: $0) } }

	/// Every system sheet and whether its `open` is truthy.
	public func sheets() throws -> [(node: String, open: Bool)] {
		try payload.nodes.compactMap { node in
			guard case let .sheet(open, _, _, _) = node.kind else { return nil }
			return (node.id, try evaluate(open).isTruthy)
		}
	}

	/// Runs the handler bound to the action and returns the journal the host applies.
	public func dispatch(_ action: NativeAction) throws -> [NativeJournalEntry] {
		if action.event == .timer, let timer = action.timer, timer.hasPrefix(scriptTimer) {
			guard let id = Int(timer.dropFirst(scriptTimer.count)) else { throw RuntimeError(reason: "no timer \(timer) is set") }
			return try change(host: nil) { try self.enter([("kind", .string("timer")), ("timer", .number(Double(id)))]) }
		}
		if action.event == .timer {
			guard let id = action.timer, let timer = timers.removeValue(forKey: id) else {
				throw RuntimeError(reason: "no timer \(action.timer ?? "") is set")
			}
			var scope = NativeScope.empty
			scope.locals = timer.context.locals
			return try change(host: nil) {
				let taken = try self.run(timer.ops, in: scope, submission: timer.context.submission)
				if let submission = timer.context.submission {
					submission.pending -= 1
					self.settle(submission)
				}
				return taken
			}
		}
		if action.event == .cancel {
			guard dialogs[action.host] == true else { throw RuntimeError(reason: "\(action.host) is not an open dialog") }
			let cancel = payload.events.first(where: { $0.host == action.host && $0.event == .cancel })
			return try change(host: action.host) {
				self.dialogs[action.host] = false
				return try cancel.map { try self.run(self.handlers[$0.handler] ?? [], in: .empty) } ?? []
			}
		}
		if action.event == .idle || action.event == .visible {
			let key = "\(action.event.rawValue)\u{0}\(action.host)"
			guard !fired.contains(key), try due(action.event).contains(action.host) else { return [] }
			fired.insert(key)
		}
		let handlerOf = { (host: String, name: NativeEventName) in self.payload.events.first { $0.host == host && $0.event == name } }
		if action.event == .dismiss, let reason = action.reason {
			guard stack.last == action.host else { throw RuntimeError(reason: "\(action.host) is not the topmost overlay") }
			let dismiss = handlerOf(action.host, .dismiss)
			return try change(host: nil) {
				self.eventFields = [.reason: .string(reason), .pressTarget: .null]
				defer { self.eventFields = nil }
				return try dismiss.map { try self.run(self.handlers[$0.handler] ?? [], in: .empty) } ?? []
			}
		}
		if action.event.isTouch {
			return try touch(action, handlerOf: handlerOf)
		}
		// A row's copy (`<node>@<key>`) runs its node's handler in that row; node ids never hold `@`.
		let host = action.host.firstIndex(of: "@").map { String(action.host[..<$0]) } ?? action.host
		guard let bound = payload.events.first(where: { $0.host == host && $0.event == action.event }), let node = nodesById[host] else {
			throw RuntimeError(reason: "no \(action.event.rawValue) handler on \(action.host)")
		}
		guard let instance = try instances(of: node).first(where: { $0.id == action.host }) else {
			throw RuntimeError(reason: "\(action.host) is not shown")
		}
		let scope = instance.scope
		// A press focuses the control it presses, as the browser does.
		if action.event == .activate { focused = action.host }
		eventValue = action.event == .input ? action.value ?? "" : nil
		defer { eventValue = nil }
		return try change(host: action.host) { try self.run(self.handlers[bound.handler] ?? [], in: scope) }
	}

	/// A touch as a phone's browser raises it: `pointerover`, `pointerenter` outermost first, the overlay's outside press and
	/// `pointerdown`; later events go to the capturing element, with boundary events when it changed; `pointerout` and
	/// `pointerleave` after the touch lifts or is cancelled.
	private func touch(_ action: NativeAction, handlerOf: @escaping (String, NativeEventName) -> NativeEvent?) throws -> [NativeJournalEntry] {
		guard let node = nodesById[nodeOf(action.host)], let instance = try instances(of: node).first(where: { $0.id == action.host }) else {
			throw RuntimeError(reason: "\(action.host) is not shown")
		}
		let pointerId = action.pointerId ?? 1
		let down = touches[pointerId]
		if action.event == .pointerdown ? down != nil : down == nil {
			throw RuntimeError(reason: "touch \(textOf(.number(pointerId))) is \(down != nil ? "already" : "not") down")
		}
		return try change(host: nil) {
			var calls: [NativeJournalEntry] = []
			let state = down ?? TouchState(capture: action.host, over: action.host, primary: self.touches.values.allSatisfy { !$0.primary })
			if down == nil { self.touches[pointerId] = state }
			let x = action.x ?? 0, y = action.y ?? 0
			/// The elements from `id` out to the root, innermost first.
			let chain = { (id: String) -> [String] in
				var out: [String] = []
				var at: String? = self.nodeOf(id)
				while let current = at {
					out.append(current == self.nodeOf(id) ? id : current)
					at = self.nodesById[current]?.parent
				}
				return out
			}
			let fieldsOf = { (type: NativeEventName, target: String, currentTarget: String, related: String?) -> [NativeEventField: NativeValue] in
				let lifted = type == .pointerup || type == .pointercancel || type == .pointerout || type == .pointerleave
				let cancelled = action.event == .pointercancel
				return [
					.target: .string(target), .currentTarget: .string(currentTarget), .relatedTarget: related.map(NativeValue.string) ?? .null,
					// Safari's values, which the Pointer Events spec gives; Chrome on Android reports 0 for over, enter, out and leave.
					.button: .number(type == .pointerdown || type == .pointerup ? 0 : -1),
					.buttons: .number(lifted ? 0 : 1),
					.clientX: .number(cancelled ? 0 : x), .clientY: .number(cancelled ? 0 : y),
					.pointerId: .number(pointerId), .pointerType: .string("touch"), .isPrimary: .bool(state.primary),
					.timeStamp: .number(action.time ?? 0),
				]
			}
			var runs: [(handler: String, fields: [NativeEventField: NativeValue])] = []
			let raise = { (type: NativeEventName, target: String, related: String?) in
				for node in chain(target) {
					if let own = handlerOf(self.nodeOf(node), type) { runs.append((own.handler, fieldsOf(type, target, node, related))) }
				}
			}
			/// `pointerenter` on each element `target` is in that `from` is not, outermost first; `pointerleave` the other way.
			let crossing = { (type: NativeEventName, target: String, from: String?, related: String?) in
				let outside = Set(from.map(chain) ?? [])
				let nodes = chain(target).filter { !outside.contains($0) }
				for node in type == .pointerenter ? nodes.reversed() : nodes {
					if let own = handlerOf(self.nodeOf(node), type) { runs.append((own.handler, fieldsOf(type, node, node, related))) }
				}
			}
			let flush = { () throws -> [NativeJournalEntry]? in
				defer { self.eventFields = nil }
				let steps = runs
				runs = []
				for step in steps {
					self.eventFields = step.fields
					let taken = try self.run(self.handlers[step.handler] ?? [], in: instance.scope)
					if case .navigate? = taken.first { return taken }
					calls.append(contentsOf: taken)
				}
				return nil
			}
			if action.event == .pointerdown {
				raise(.pointerover, action.host, nil)
				crossing(.pointerenter, action.host, nil, nil)
				// The behaviour's document listener hears the press: the topmost overlay it landed outside is told.
				if let top = self.stack.last, !self.contains(top, action.host), let dismiss = handlerOf(top, .dismiss) {
					runs.append((dismiss.handler, [.reason: .string("outside-press"), .pressTarget: .string(action.host)]))
				}
				raise(.pointerdown, action.host, nil)
				return try flush() ?? calls
			}
			// Before the next event the pointer counts as over its capturing element (or, released, the one under it): a change
			// raises the boundary events from the old one to the new, as the browsers do.
			let target = state.capture ?? action.host
			if target != state.over {
				let from = state.over
				raise(.pointerout, from, target)
				crossing(.pointerleave, from, target, target)
				raise(.pointerover, target, from)
				crossing(.pointerenter, target, from, from)
				state.over = target
			}
			if action.event == .pointermove {
				raise(.pointermove, target, nil)
				return try flush() ?? calls
			}
			raise(action.event, target, nil)
			if let early = try flush() {
				self.touches[pointerId] = nil
				return early
			}
			self.touches[pointerId] = nil
			raise(.pointerout, target, nil)
			crossing(.pointerleave, target, nil, nil)
			return try flush() ?? calls
		}
	}

	/// The shown instances with an `idle` (or `visible`) handler that has not run for them, in document order.
	public func due(_ event: NativeEventName) throws -> [String] {
		try payload.events.flatMap { bound -> [String] in
			guard bound.event == event, let node = nodesById[bound.host] else { return [] }
			return try instances(of: node).map(\.id).filter { !fired.contains("\(event.rawValue)\u{0}\($0)") }
		}
	}

	private func forgetHidden() throws {
		for key in fired {
			let id = String(key[key.index(after: key.firstIndex(of: "\u{0}")!)...])
			let template = id.firstIndex(of: "@").map { String(id[..<$0]) } ?? id
			let shown = try nodesById[template].map { node in try instances(of: node).contains { $0.id == id } } ?? false
			if !shown { fired.remove(key) }
		}
	}

	/// A device call a handler awaited answered: its continuation runs with the answer as its local.
	public func resume(_ continuation: String, value: NativeValue) throws -> [NativeJournalEntry] {
		guard let then = continuations[continuation] else { throw RuntimeError(reason: "no continuation \(continuation)") }
		var scope = NativeScope.empty
		scope.locals[then.as] = value
		return try change(host: nil) { try self.run(then.ops, in: scope) }
	}

	/// That call failed: the rest of the handler does not run, and the nearest `@catch` cell takes `{ name, message }`.
	public func reject(_ continuation: String, name: String, message: String) throws -> [NativeJournalEntry] {
		guard let then = continuations[continuation] else { throw RuntimeError(reason: "no continuation \(continuation)") }
		guard let cell = then.catch else { return [] }
		return try change(host: nil) {
			self.values[cell] = .object([("name", .string(name)), ("message", .string(message))])
			return []
		}
	}

	/// Device objects whose owner is shown.
	public func liveObjects() throws -> [String] {
		try payload.objects.compactMap { object in
			guard let owner = nodesById[object.owner] else { throw RuntimeError(reason: "\(object.id) is owned by unknown node \(object.owner)") }
			return try isShown(owner.arm) ? object.id : nil
		}
	}

	/// Runs ops in order: writes cells and collects the calls (a continuation's id rides on its call); stops at a navigation.
	private func run(_ ops: [NativeOp], in scope: NativeScope, submission: Submission? = nil) throws -> [NativeJournalEntry] {
		var calls: [NativeJournalEntry] = []
		for op in ops {
			switch op {
			case let .submit(form, submitter):
				let taken = try submit(form, submitter, in: scope, into: &calls)
				if case .navigate? = taken.first { return taken }
				calls.append(contentsOf: taken)
			case let .tick(node):
				guard case let .element(_, attributes, _) = nodesById[node]?.kind else { throw RuntimeError(reason: "\(node) is not an element") }
				let members = attributes["type"] == "radio" ? try group(of: node) : []
				if members.isEmpty {
					checkedness[node] = !(try isChecked(node))
				} else {
					for member in members { checkedness[member.id] = member.id == node }
				}
			case let .after(msExpr, capture, ops):
				let ms = try evaluate(msExpr, in: scope)
				var locals = scope.locals
				for captured in capture { locals[captured.name] = try evaluate(captured.value, in: scope) }
				let id = "timer:\(timerCount)"
				timerCount += 1
				timers[id] = (ops, Context(locals: locals, submission: submission))
				submission?.pending += 1
				let wait: Double = if case let .number(number) = ms, number > 0 { number } else { 0 }
				calls.append(.timer(timer: id, ms: wait))
			case let .navigate(route, params, replace):
				let resolved = try params.map { param -> NativeRouteParam in
					switch param.value {
					case let .string(text): return NativeRouteParam(name: param.name, value: text)
					case let .expr(expr): return NativeRouteParam(name: param.name, value: try evaluate(expr, in: scope).text)
					}
				}
				return [.navigate(route: route, params: resolved, replace: replace)]
			case let .assign(cell, expr):
				let value = try evaluate(expr, in: scope)
				values[try slot(of: cell, in: scope)] = value
				if let key = storageKeys[cell] { store.write(key, value) }
			case let .when(test, then, otherwise):
				let taken = try run(try evaluate(test, in: scope).isTruthy ? then : otherwise, in: scope, submission: submission)
				if case .navigate? = taken.first { return taken }
				calls.append(contentsOf: taken)
			case let .dialog(node, open):
				guard dialogs[node] != nil else { throw RuntimeError(reason: "\(node) is not a dialog") }
				dialogs[node] = open
			case let .command(target, command, preventScroll):
				let value = try evaluate(target, in: scope)
				if value == .null || value == .string(nativeDocumentBody) { continue }
				guard case let .string(node) = value, isElement(node) else { throw RuntimeError(reason: "\(command)() on a value that is not an element") }
				if command == "focus" { focused = node }
				calls.append(.command(node: node, command: command, preventScroll: preventScroll))
			case let .capture(target, pointer, release):
				guard case let .string(node) = try evaluate(target, in: scope), case let .number(id) = try evaluate(pointer, in: scope),
					let touch = touches[id]
				else { continue }
				if !release { touch.capture = node } else if touch.capture == node { touch.capture = nil }
			case let .call(call, object, arguments, result, then):
				calls.append(.call(call: call, object: object, arguments: try arguments.map { try evaluate($0, in: scope) }, result: result, resume: then?.id))
			case let .script(fn, type, bindings, catchCell):
				let touch = touchFields.compactMap { field in eventFields?[field].map { (field.rawValue, $0.json) } }
				let event: JSONValue = .object([("type", .string(type))] + (eventValue.map { [("value", JSONValue.string($0))] } ?? []) + touch)
				let frame = try frame(of: bindings, in: scope)
				calls.append(contentsOf: try enter(
					[("kind", .string("dispatch")), ("fn", .string(fn)), ("frame", frame), ("elements", try elementFacts(frame)), ("event", event)]
						+ (try catchCell.map { [("catch", JSONValue.string(try slot(of: $0, in: scope)))] } ?? [])))
			}
		}
		return calls
	}

	/// A `submit` op as the web runs it: nothing for a disabled submitter, an `invalid` entry for the first field missing its
	/// value, nothing for the same entries from the same button as a submission still running, else the form's handler.
	private func submit(_ formId: String, _ submitter: String?, in scope: NativeScope, into calls: inout [NativeJournalEntry]) throws -> [NativeJournalEntry] {
		guard let form = forms[formId] else { throw RuntimeError(reason: "\(formId) is not a form") }
		if let submitter, try attributeNow(submitter, "disabled") != nil { return [] }
		if let invalid = try firstInvalid(form, submitter: submitter) {
			guard let missing else { throw RuntimeError(reason: "the payload has no message for a \(invalid.kind.rawValue) missing its value") }
			let message = switch invalid.kind {
			case .text, .hidden: missing.text
			case .checkbox: missing.checkbox
			case .radio: missing.radio
			}
			calls.append(.invalid(node: invalid.node, message: message))
			return []
		}
		let sent = try entries(of: formId)
		let runs = running[formId] ?? []
		if runs.contains(where: { $0.sent == sent && $0.submitter == submitter }) { return [] }
		guard let handler = payload.events.first(where: { $0.host == formId && $0.event == .submit }) else {
			throw RuntimeError(reason: "\(formId) has no submit handler")
		}
		let submission = Submission(sent: sent, submitter: submitter, marks: submitter != nil && !form.authoredAriaDisabled)
		running[formId] = runs + [submission]
		var handlerScope = NativeScope.empty
		handlerScope.locals = scope.locals
		let taken = try run(handlers[handler.handler] ?? [], in: handlerScope, submission: submission)
		settle(submission)
		return taken
	}

	/// A live device value changed: writes its device cell and returns the journal.
	public func device(_ cell: String, _ value: NativeValue) throws -> [NativeJournalEntry] {
		guard payload.cells.contains(where: { $0.id == cell && $0.device != nil }) else { throw RuntimeError(reason: "\(cell) is not a device cell") }
		return try change(host: nil) { self.values[cell] = value; return [] }
	}

	/// A device call answered: the task cell takes `{ state: 'value', value }`.
	public func settle(_ cell: String, value: NativeValue) throws -> [NativeJournalEntry] {
		try settle(cell, .object([("state", .string("value")), ("value", value)]))
	}

	/// A device call failed (`NotAllowedError` when refused): the task cell takes `{ state: 'error', error: { name, message } }`.
	public func settle(_ cell: String, errorName: String, message: String) throws -> [NativeJournalEntry] {
		try settle(cell, .object([("state", .string("error")), ("error", .object([("name", .string(errorName)), ("message", .string(message))]))]))
	}

	private func settle(_ cell: String, _ value: NativeValue) throws -> [NativeJournalEntry] {
		guard payload.cells.contains(where: { $0.id == cell && $0.task != nil }) else { throw RuntimeError(reason: "\(cell) is not a task cell") }
		return try change(host: nil) { self.values[cell] = value; return [] }
	}

	/// The calls a host starts at mount, one per task cell.
	public func tasks() throws -> [NativeJournalEntry] {
		try payload.cells.compactMap { cell in
			guard let task = cell.task else { return nil }
			return .call(call: task.call, object: nil, arguments: try task.arguments.map { try evaluate($0) }, result: cell.id, resume: nil)
		}
	}

	/// Runs `apply` (cell writes, returning the calls it made or a navigation) and returns the journal: styled cells,
	/// then every shown node whose output changed in document order, then released device objects, then the calls.
	private func change(host: String?, _ apply: () throws -> [NativeJournalEntry]) throws -> [NativeJournalEntry] {
		let keyed = { (list: [(node: String, name: String, value: String?)]) in
			Dictionary(list.map { ("\($0.node)\u{0}\($0.name)", $0.value) }, uniquingKeysWith: { $1 })
		}
		let cellsBefore = values
		let beforeTexts = Dictionary(try texts().map { ($0.node, $0.text) }, uniquingKeysWith: { $1 })
		let beforeAttributes = keyed(try boundAttributes())
		let beforeMarks = keyed(marks())
		let checkedBefore = checkedness
		let bindingsBefore = Dictionary(uniqueKeysWithValues: try ticked.map { ($0.id, try checkedBinding($0.id)) })
		var beforeProperties = keyed(try properties().map { ($0.node, $0.name, Optional($0.value)) })
		if let eventValue, let host {
			beforeProperties["\(host)\u{0}value"] = eventValue
			edited[host] = eventValue
		}
		let beforeArms = Dictionary(uniqueKeysWithValues: try arms().map { ($0.node, $0.index) })
		let beforeRows = Dictionary(uniqueKeysWithValues: try rows().map { ($0.node, $0.keys) })
		let beforeTitle = try title()
		let dialogsBefore = dialogs
		let beforeSheets = Dictionary(uniqueKeysWithValues: try sheets().map { ($0.node, $0.open) })
		let ownedBefore = Set(try liveObjects())
		let focusBefore = focused
		let stackBefore = stack
		let calls = try apply()
		if case .navigate? = calls.first { return calls }
		let shownNow = try shownOverlays()
		let released = stackBefore.filter { !shownNow.contains($0) }
		let enlisted = shownNow.filter { !stackBefore.contains($0) }
		stack = stackBefore.filter(shownNow.contains) + enlisted
		for overlay in enlisted { origins[overlay] = focusBefore ?? nativeDocumentBody }
		let overlayAttributes = try keyedAttributes()
		let overlays = released.map { NativeJournalEntry.overlay(node: $0, open: false, modal: isModal($0, overlayAttributes)) }
			+ enlisted.map { NativeJournalEntry.overlay(node: $0, open: true, modal: isModal($0, overlayAttributes)) }
		// A row that left takes its state with it; a later row with the same key starts from the first values.
		let kept = Set(try rows().flatMap { list in list.keys.map { "\(list.node)\u{0}\($0)" } })
		for slot in values.keys {
			guard let at = slot.firstIndex(of: "@"), let list = rowOfCell[String(slot[..<at])] else { continue }
			if !kept.contains("\(list)\u{0}\(slot[slot.index(after: at)...])") { values.removeValue(forKey: slot) }
		}
		try forgetHidden()
		let afterTexts = Dictionary(try texts().map { ($0.node, $0.text) }, uniquingKeysWith: { $1 })
		let afterAttributes = keyed(try boundAttributes())
		let afterProperties = keyed(try properties().map { ($0.node, $0.name, Optional($0.value)) })
		let afterArms = Dictionary(uniqueKeysWithValues: try arms().map { ($0.node, $0.index) })
		let afterRows = Dictionary(uniqueKeysWithValues: try rows().map { ($0.node, $0.keys) })
		let afterSheets = Dictionary(uniqueKeysWithValues: try sheets().map { ($0.node, $0.open) })
		let styles = payload.cells.compactMap { cell -> NativeJournalEntry? in
			guard cell.styled, let before = cellsBefore[cell.id], let after = values[cell.id], !before.strictlyEquals(after) else { return nil }
			return .state(cell: cell.id, value: after)
		}
		let entries = try payload.nodes.flatMap { node -> [NativeJournalEntry] in
			switch node.kind {
			case .repeat:
				guard let before = beforeRows[node.id], let after = afterRows[node.id], before != after else { return [] }
				return [.rows(node: node.id, keys: after)]
			case .branch:
				guard let before = beforeArms[node.id], let after = afterArms[node.id], before != after else { return [] }
				return [.arm(node: node.id, index: after)]
			case .sheet:
				guard let before = beforeSheets[node.id], let after = afterSheets[node.id], before != after else { return [] }
				return [.sheet(node: node.id, open: after)]
			case .text:
				return try instances(of: node).compactMap { instance in
					guard let before = beforeTexts[instance.id], let after = afterTexts[instance.id], before != after else { return nil }
					return .text(node: instance.id, value: after)
				}
			case let .element(_, _, bindings):
				let opened: [NativeJournalEntry] = dialogs[node.id].flatMap { open in open != dialogsBefore[node.id] ? [.dialog(node: node.id, open: open)] : nil } ?? []
				return try opened + instances(of: node).flatMap { instance in
					bindings.compactMap { binding -> NativeJournalEntry? in
						let key = "\(instance.id)\u{0}\(binding.name)"
						let (before, after) = binding.isProperty ? (beforeProperties, afterProperties) : (beforeAttributes, afterAttributes)
						guard let old = before[key], let new = after[key], old != new else { return nil }
						return binding.isProperty ? .property(node: instance.id, name: binding.name, value: new ?? "") : .attribute(node: instance.id, name: binding.name, value: new)
					}
				}
			}
		}
		// A `checked` binding whose value changed sets the checkedness, as the web's property write does.
		for node in ticked {
			if let bound = try checkedBinding(node.id), bound != bindingsBefore[node.id] ?? nil { checkedness[node.id] = bound }
		}
		let checks = try ticked.compactMap { node -> NativeJournalEntry? in
			guard try isShown(node.arm), let now = checkedness[node.id], checkedBefore[node.id] != now else { return nil }
			return .checked(node: node.id, value: now)
		}
		let afterMarks = marks()
		let marked = afterMarks.compactMap { mark -> NativeJournalEntry? in
			guard beforeMarks["\(mark.node)\u{0}\(mark.name)"] != mark.value else { return nil }
			return .attribute(node: mark.node, name: mark.name, value: mark.value)
		}
		// A field whose binding wrote it shows that value now, not what was typed before.
		for case let .property(node, _, _) in entries { edited[node] = nil }
		let owned = Set(try liveObjects())
		let releases = payload.objects.compactMap { object -> NativeJournalEntry? in
			ownedBefore.contains(object.id) && !owned.contains(object.id) ? .release(object: object.id) : nil
		}
		let afterTitle = try title()
		return styles + entries + checks + marked + (afterTitle != beforeTitle ? afterTitle.map { [.title(value: $0)] } ?? [] : []) + releases + overlays + calls
	}
}

/// One screen of an app: its route, the path it opened at and its page's runtime.
public struct NativeScreen {
	public let route: String
	public let params: [NativeRouteParam]
	public let path: String
	public let runtime: NativeRuntime
}

/// The reference meaning of an app's stack (`packages/mobile/src/app.ts`): the UIKit stack is checked against it headless.
public final class NativeAppStack {
	public let app: NativeAppPayload
	private let store: NativeStore
	private let scriptHost: NativeScriptHost?
	public private(set) var screens: [NativeScreen]

	/// `scriptHost`: the app's one engine, shared by every screen.
	public init(app: NativeAppPayload, path: String, store: NativeStore = MemoryStore(), scriptHost: NativeScriptHost? = nil) throws {
		self.app = app
		self.store = store
		self.scriptHost = scriptHost
		screens = []
		screens = try app.backStack(path).map { prefix in
			guard let (route, params) = app.match(prefix) else { throw RuntimeError(reason: "\(prefix) is not a route") }
			return try screen(route.pattern, params)
		}
	}

	public func screen(_ route: String, _ params: [NativeRouteParam]) throws -> NativeScreen {
		guard let entry = app.routes.first(where: { $0.pattern == route }) else { throw RuntimeError(reason: "no page for \(route)") }
		return NativeScreen(
			route: route, params: params, path: try NativeAppPayload.path(route, params),
			runtime: NativeRuntime(payload: entry.page, store: store, params: params, scriptHost: scriptHost))
	}

	/// Runs an action on the top screen; a `navigate` entry pushes the new screen or replaces the top one.
	public func dispatch(_ action: NativeAction) throws -> [NativeJournalEntry] {
		let journal = try screens[screens.count - 1].runtime.dispatch(action)
		if case let .navigate(route, params, replace)? = journal.last {
			let next = try screen(route, params)
			if replace { screens.removeLast() }
			screens.append(next)
		}
		return journal
	}

	/// The platform's Back: the top screen goes and the one below shows as it was left.
	public func back() throws {
		guard screens.count > 1 else { throw RuntimeError(reason: "back on the first screen leaves the app") }
		screens.removeLast()
	}
}

extension Optional where Wrapped == NativeScriptHost {
	func unwrap() throws -> NativeScriptHost {
		guard let self else { throw RuntimeError(reason: "a script op with no script engine to run it") }
		return self
	}
}

/// The prefix of a timer the script set, as its `timer` entries name it (`script:3`); other timers are `after` ops.
public let scriptTimer = "script:"
