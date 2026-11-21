import Foundation

/// What a person does to a retained view.
public struct NativeAction: Equatable, Sendable {
	public let event: NativeEventName
	/// The element acted on; "" for a `timer`.
	public let host: String
	/// For `input`: the field's whole text after the edit; for `keydown`, the key; for `paste`, the pasted text.
	public let value: String?
	/// For `timer`: the journalled timer whose time has come.
	public let timer: String?
	/// For an overlay's `dismiss`: why (`escape`; an outside press arrives as `pointerdown`). A sheet's has none.
	public let reason: String?
	/// For `activate`: how many presses in a row on the element (a double tap's second is 2); nil reads as 1.
	public let detail: Int?
	/// For a touch (`pointerdown`, `pointermove`, `pointerup`, `pointercancel`): the touch, numbered from 1 as a phone browser
	/// does (default 1); its place in points from the screen's top left (default 0, 0); the milliseconds since the screen
	/// appeared (default 0).
	public let pointerId: Double?
	public let x: Double?
	public let y: Double?
	public let time: Double?

	public init(
		event: NativeEventName, host: String, value: String? = nil, reason: String? = nil, detail: Int? = nil, pointerId: Double? = nil,
		x: Double? = nil, y: Double? = nil, time: Double? = nil
	) {
		self.event = event
		self.host = host
		self.value = value
		self.detail = detail
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
		detail = nil
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
	/// A style slot's new value: the host lays the page out again with it through Dragon's plan.
	case slot(slot: String, value: Double)
	/// nil removes the attribute; "" is a bare attribute.
	case attribute(node: String, name: String, value: String?)
	/// An input's text; never sent to the field whose edit caused it while it already shows that text.
	case property(node: String, name: String, value: String)
	/// A checkbox's or radio button's checkedness changed (journalled as the `checked` property).
	case checked(node: String, value: Bool)
	/// An option's selectedness changed (journalled as the `selected` property); a row's new option arrives unselected.
	case selected(node: String, value: Bool)
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
	/// The signal of request `id` aborted (its async value was superseded or left the screen): cancel it, send no response.
	case abort(id: Int)
	/// An element marked `overlay` joined the overlay stack (`open`) or left it; a modal one goes in the top layer.
	case overlay(node: String, open: Bool, modal: Bool)
	/// The `keydown` or `paste` handler called `preventDefault()`: the host leaves out what the key or paste does.
	case preventDefault

	public var json: JSONValue {
		switch self {
		case let .text(node, value): return .object([("op", .string("text")), ("node", .string(node)), ("value", .string(value))])
		case let .state(cell, value):
			return .object([("op", .string("state")), ("cell", .string(cell)), ("value", value.json)])
		case let .slot(slot, value):
			return .object([("op", .string("slot")), ("slot", .string(slot)), ("value", .number(value))])
		case let .attribute(node, name, value):
			return .object([("op", .string("attribute")), ("node", .string(node)), ("name", .string(name)), ("value", value.map(JSONValue.string) ?? .null)])
		case let .property(node, name, value):
			return .object([("op", .string("property")), ("node", .string(node)), ("name", .string(name)), ("value", .string(value))])
		case let .checked(node, value):
			return .object([("op", .string("property")), ("node", .string(node)), ("name", .string("checked")), ("value", .bool(value))])
		case let .selected(node, value):
			return .object([("op", .string("property")), ("node", .string(node)), ("name", .string("selected")), ("value", .bool(value))])
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
		case let .abort(id): return .object([("op", .string("abort")), ("id", .number(Double(id)))])
		case let .overlay(node, open, modal):
			return .object([("op", .string("overlay")), ("node", .string(node)), ("open", .bool(open)), ("modal", .bool(modal))])
		case .preventDefault: return .object([("op", .string("preventDefault"))])
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
	/// Each row's position in its list by `repeat` id, from 0: what a `@for`'s `index` reads.
	public var positions: [String: Int] = [:]
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

/// Each screen's async values run under their own name in an engine the app's screens share.
nonisolated(unsafe) private var screenCount = 0

/// The payload's state and op interpreter, matching `packages/mobile/src/runtime.ts` exactly.
public final class NativeRuntime {
	public let payload: NativeViewPayload
	// Each write moves `version`, so a script computed is run again only once a cell may have changed.
	private var values: [String: NativeValue] { didSet { version &+= 1 } }
	/// Each style slot's last value, kept while its style case hides its text.
	private var keptSlots: [String: Double] = [:]
	/// Cells still `undefined` on the web: a script reads them so until one is written.
	private var unset: Set<String> = []
	/// Each following cell's last value of what it follows: the write runs again only when that value changes, as on the web.
	private var followed: [String: NativeValue] = [:]
	private var version = 0
	private var computed: [String: NativeValue] = [:]
	private var computedAt = -1
	private let store: NativeStore
	private let storageKeys: [String: String]
	private let session: NativeAppSession
	private let handlers: [String: [NativeOp]]
	private let continuations: [String: NativeContinuation]
	private let nodesById: [String: NativeNode]
	private let params: [NativeRouteParam]
	/// Row state's list by cell id: its values are kept as `<cell>@<key>`.
	private let rowOfCell: [String: String]
	private var eventValue: String?
	/// In an `input` dispatch: the field's text, which it already shows.
	private var edit: String?
	/// What a dismiss or pointer event carries while its handlers run.
	private var eventFields: [NativeEventField: NativeValue]?
	/// The arms on screen when the running action began; nil between actions, when what shows is what the cells say.
	private var drawnArms: [String: Int?]?
	/// A text field's key or paste event: the field's text then, a script handler's `event.target.value`.
	private var targetText: String?
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
	private let firstOfCell: [String: NativeExpr]
	private let forms: [String: NativeForm]
	/// A field's text a person typed since its `value` binding last changed it.
	private var edited: [String: String] = [:]
	private var running: [String: [Submission]] = [:]
	/// Submissions held by a script promise not settled yet, by the engine's run number.
	private var scriptRuns: [Int: Submission] = [:]
	private var timers: [String: (ops: [NativeOp], context: Context)] = [:]
	private var timerCount = 0
	/// Every non-row checkbox and radio button, in payload order.
	private let ticked: [NativeNode]
	/// Each one's checkedness: its `checked` binding sets it, as does a person's tick.
	private var checkedness: [String: Bool] = [:]
	/// Every `<select>`, in payload order.
	private let selects: [NativeNode]
	/// Each shown option's selectedness, kept as the web keeps it (HTML's selectedness setting algorithm).
	private var selectedness: [String: Bool] = [:]
	/// What each option's `selected` binding last wrote: a binding sets the selectedness only when its value changes.
	private var selectedBound: [String: Bool?] = [:]
	/// The option a person chose in the action being dispatched.
	private var chosenNow: String?
	private let missing: NativeValueMissing?
	private let tooLong: NativeTooLong?
	private let emailMismatch: NativeEmailMismatch?
	/// Each `<dialog>`'s top-layer state; every dialog mounts closed.
	public private(set) var dialogs: [String: Bool]
	/// Where a page with a script gets its engine; asked only when a script op runs or a script computed is read.
	private let scriptHost: NativeScriptHost?

	/// The device's clock, in milliseconds since 1970 (UTC).
	private let now: () -> Double
	/// `idle` and `visible` handlers that ran, by `<event>\0<instance>`; an instance that leaves the screen is forgotten.
	private var fired = Set<String>()
	private let screen: Int
	private let asyncCells: [NativeCell]
	/// What the async values' runs depend on as last told to the engine; nil before the first.
	private var asyncSent: String?
	/// Async values a `reset` asked to run again, by slot, in order: sent with the next `tasks` entry.
	private var retry: [String] = []

	/// `params`: the route params the page opened with; `now`: the clock (a conformance run fixes it).
	/// `preferredLanguages`: the device's, most preferred first; the web's messages are shown in the first one the payload has.
	public init(
		payload: NativeViewPayload, store: NativeStore = MemoryStore(), params: [NativeRouteParam] = [], preferredLanguages: [String] = ["en"],
		now: @escaping () -> Double = { (Date().timeIntervalSince1970 * 1000).rounded(.down) }, scriptHost: NativeScriptHost? = nil,
		session: NativeAppSession = .shared
	) {
		self.payload = payload
		self.session = session
		self.params = params
		self.store = store
		self.now = now
		self.scriptHost = scriptHost
		screenCount += 1
		screen = screenCount
		asyncCells = payload.cells.filter { $0.async != nil }
		let opened = now()
		values = Dictionary(uniqueKeysWithValues: payload.cells.map { cell in
			(cell.id, cell.clock ? .number(opened) : (cell.app ? session.values[cell.id] : nil) ?? cell.storageKey.flatMap(store.read) ?? cell.initial)
		})
		storageKeys = Dictionary(uniqueKeysWithValues: payload.cells.compactMap { cell in cell.storageKey.map { (cell.id, $0) } })
		unset = Set(payload.cells.filter { $0.unset && $0.storageKey.flatMap(store.read) == nil && !($0.app && session.values[$0.id] != nil) }.map(\.id))
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
		firstOfCell = Dictionary(uniqueKeysWithValues: payload.cells.compactMap { cell in cell.first.map { (cell.id, $0) } })
		nodesById = Dictionary(uniqueKeysWithValues: payload.nodes.map { ($0.id, $0) })
		forms = Dictionary(payload.forms.map { ($0.node, $0) }, uniquingKeysWith: { first, _ in first })
		ticked = payload.nodes.filter { node in
			guard node.row == nil, case let .element("input", attributes, _) = node.kind else { return false }
			return attributes["type"] == "checkbox" || attributes["type"] == "radio"
		}
		selects = payload.nodes.filter { node in
			if case .element("select", _, _) = node.kind { return true }
			return false
		}
		let locale = nativeLocale(preferredLanguages, payload.valueMissing.map(\.locale))
		missing = payload.valueMissing.first { $0.locale == locale }?.messages
		let tooLongLocale = nativeLocale(preferredLanguages, payload.tooLong.map(\.locale))
		tooLong = payload.tooLong.first { $0.locale == tooLongLocale }?.message
		let mismatchLocale = nativeLocale(preferredLanguages, payload.typeMismatch.map(\.locale))
		emailMismatch = payload.typeMismatch.first { $0.locale == mismatchLocale }?.message
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
		// Rows take their first values, and following cells theirs, before anything reads them. Shown at mount: the
		// document's focus is the body.
		try? seedRows()
		try? follow()
		try? settleSelects()
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

	private func shownOverlays() throws -> [String] {
		try overlayNodes.filter { node in try !instances(of: node).isEmpty && attributeNow(node.id, "hidden") == nil }.map(\.id)
	}

	/// A hint (a tooltip, a hovercard) carries `overlay-hint` beside `overlay`, as authored.
	private func isHint(_ overlay: String) -> Bool {
		guard case let .element(_, attributes, _) = nodesById[overlay]?.kind else { return false }
		return attributes[OverlayProtocol.hintAttribute] != nil
	}

	/// An overlay is modal when it or an element inside it has `aria-modal="true"`, bound or else static.
	private func isModal(_ overlay: String) throws -> Bool {
		try payload.nodes.contains { node in
			guard case let .element(_, attributes, _) = node.kind, contains(overlay, node.id) else { return false }
			// A row's copies are keyed by row, so a row element is read as it was built.
			let value = node.row != nil ? attributes[OverlayProtocol.modalAttribute] : try attributeNow(node.id, OverlayProtocol.modalAttribute)
			return value == OverlayProtocol.modalValue
		}
	}

	/// The overlay stack, topmost last, with whether each is modal.
	public func overlays() throws -> [(node: String, modal: Bool)] {
		try stack.map { ($0, try isModal($0)) }
	}

	/// Where a cell's value is kept: its id, or `<id>@<key>` for a row's own state, read in that row.
	private func slot(of cell: String, in scope: NativeScope) throws -> String {
		guard let row = rowOfCell[cell] else { return cell }
		guard let key = scope.keys[row] else { throw RuntimeError(reason: "the row state \(cell) read outside its row") }
		return "\(cell)@\(key)"
	}

	/// A row's state reads its first value until the row writes it; one taken from the row's item is seeded before any change
	/// (`seedRows`), so until the first change it reads the item as the row was built.
	private func read(_ cell: String, in scope: NativeScope = .empty) throws -> NativeValue {
		guard let value = values[cell] else { throw RuntimeError(reason: "unknown cell \(cell)") }
		if let seeded = values[try slot(of: cell, in: scope)] { return seeded }
		if let first = firstOfCell[cell] { return try evaluate(first, in: scope) }
		return value
	}

	/// For each row's state that has `rebuiltBy`, by slot (`<cell>@<key>`): those values now, as JSON.
	private func rowSignatures() throws -> [String: String] {
		var signatures: [String: String] = [:]
		for cell in payload.cells {
			guard let row = cell.row, let rebuiltBy = cell.rebuiltBy, let list = nodesById[row], try isShown(list.arm) else { continue }
			for (key, item) in try rows(of: row) {
				let scope = NativeScope(items: [row: item], keys: [row: key])
				signatures["\(cell.id)@\(key)"] = try rebuiltBy.map { try evaluate($0, in: scope).jsonText }.joined(separator: ",")
			}
		}
		return signatures
	}

	/// As on the web, a part a row passes a changed value to is built again: that row's state starts over.
	private func resetChangedRows(_ before: [String: String]) throws {
		for (slot, now) in try rowSignatures() where before[slot].map({ $0 != now }) ?? false { values.removeValue(forKey: slot) }
	}

	/// A row's state with a `first` takes it once, from the row's item, when the row is built.
	private func follow() throws {
		for _ in 0...payload.cells.count {
			var moved = false
			for cell in payload.cells {
				guard let follows = cell.follows else { continue }
				let now = try evaluate(follows)
				if followed[cell.id] == now { continue }
				followed[cell.id] = now
				if (values[cell.id] ?? .null) == now { continue }
				values[cell.id] = now
				unset.remove(cell.id)
				moved = true
			}
			if !moved { return }
		}
		throw RuntimeError(reason: "following cells kept changing each other")
	}

	private func seedRows() throws {
		for cell in payload.cells {
			guard let row = cell.row, let first = cell.first, let list = nodesById[row], try isShown(list.arm) else { continue }
			for (key, item) in try rows(of: row) where values["\(cell.id)@\(key)"] == nil {
				values["\(cell.id)@\(key)"] = try evaluate(first, in: NativeScope(items: [row: item], keys: [row: key]))
			}
		}
	}

	/// The current value of a cell.
	public func value(of cell: String) throws -> NativeValue {
		if let styleCase = payload.styleCases.first(where: { $0.id == cell }) { return .bool(try evaluate(styleCase.value).isTruthy) }
		return try read(cell)
	}

	public func evaluate(_ expr: NativeExpr, in scope: NativeScope = .empty) throws -> NativeValue {
		let evaluate = { (inner: NativeExpr) throws -> NativeValue in try self.evaluate(inner, in: scope) }
		switch expr {
		case let .cell(cell): return try read(cell, in: scope)
		case let .literal(value): return value
		case let .item(repeatId):
			guard let item = scope.items[repeatId] else { throw RuntimeError(reason: "the row item of \(repeatId) read outside its row") }
			return item
		case let .index(repeatId):
			guard let position = scope.positions[repeatId] else { throw RuntimeError(reason: "the row index of \(repeatId) read outside its row") }
			return .number(Double(position))
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
		case let .field(node): return .string(try textOf(field: node))
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
		case let .drawn(node):
			let chosen = try drawnArms ?? Dictionary(uniqueKeysWithValues: arms().map { ($0.node, $0.index) })
			var at = nodesById[node]?.arm
			while let place = at {
				guard let shown = chosen[place.branch], shown == place.index else { return .null }
				at = nodesById[place.branch]?.arm
			}
			return .string(node)
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
		case let .optionalMember(inner, property):
			if case .null = try evaluate(inner) { return .null }
			return try evaluate(.member(inner, property))
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
			// As on the web, a computed is not run again while nothing it reads has changed.
			if computedAt != version {
				computed = [:]
				computedAt = version
			}
			let frame = try frame(of: bindings, in: scope)
			let elements = try elementFacts(frame)
			let key = JSONValue.array([.string(fn), frame, elements]).jsonText
			if let known = computed[key] { return known }
			let value = try scriptHost.unwrap().entry {
				let text = try callScript("enter", .object([("kind", .string("compute")), ("fn", .string(fn)), ("frame", frame), ("elements", elements)] + entryCells()))
				return NativeValue(json: try JSONValue.parse(Data(text.utf8)))
			}
			computed[key] = value
			return value
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
			case let .device(device, object): return (binding.name, .object([("device", .string(device)), ("object", .string(object))]))
			case let .callback(fn): return (binding.name, .object([("callback", .string(fn))]))
			case let .elements(expr): return (binding.name, .object([("elements", try evaluate(expr, in: scope).json)]))
			case let .object(members): return (binding.name, .object([("object", try frame(of: members, in: scope))]))
			case let .shared(members): return (binding.name, .object([("shared", try frame(of: members, in: scope))]))
			case let .method(fn, members): return (binding.name, .object([("method", .string(fn)), ("frame", try frame(of: members, in: scope))]))
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
			for name in names { if let value = try attributeNow(id, name) { attributes.append((name, .string(value))) } }
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
				for (key, inner) in fields where key == "object" || key == "shared" || key == "frame" { try visit(inner) }
				guard let given = fields.first(where: { $0.0 == "elements" })?.1 else { continue }
				if case let .array(items) = given { for item in items { try add(item) } } else { try add(given) }
			}
		}
		try visit(frame)
		return .object(facts)
	}

	/// Every current value by slot (the page's cells in payload order, then row slots), a seed when `crypto` is used, and
	/// the route params when `navigate` is.
	private func entryCells() -> [(String, JSONValue)] {
		let ids = Set(payload.cells.map(\.id))
		let cells = payload.cells.compactMap { cell in values[cell.id].map { (cell.id, $0.json) } }
			+ values.keys.filter { !ids.contains($0) }.sorted().map { ($0, values[$0]!.json) }
		let crypto = payload.script?.services.contains(.crypto) == true
		let navigate = payload.script?.services.contains(.navigate) == true
		return [("cells", .object(cells))]
			+ (unset.isEmpty ? [] : [("unset", .array(unset.sorted().map { .string($0) }))])
			+ (crypto ? [("seed", .string(scriptHost?.seed() ?? ""))] : [])
			+ (navigate ? [("params", .object(params.map { ($0.name, .string($0.value)) }))] : [])
	}

	/// One engine entry, then what it asked for: its writes land in cells; clears, timers and requests become entries.
	private func enter(_ entry: [(String, JSONValue)], submission: Submission? = nil) throws -> [NativeJournalEntry] {
		let text = try scriptHost.unwrap().entry { () throws -> String in
			_ = try callScript("enter", .object(entry + entryCells()))
			return try callScript("leave")
		}
		let result = try Reader(try JSONValue.parse(Data(text.utf8)), at: "leave")
			.object(required: ["writes", "aborts", "timers", "clears", "requests", "logs", "pending", "settled"], optional: ["calls", "commands", "navigate", "prevented"])
		for write in try result["writes"].array() {
			let pair = try write.array()
			guard pair.count == 2 else { throw write.fail("a write is [slot, value]") }
			let slot = try pair[0].string()
			let cell = slot.firstIndex(of: "@").map { String(slot[..<$0]) } ?? slot
			guard values[cell] != nil, payload.cells.contains(where: { $0.id == cell }) else { throw RuntimeError(reason: "the script wrote unknown cell \(cell)") }
			let value = NativeValue(json: pair[1].value)
			values[slot] = value
			unset.remove(slot)
			if let key = storageKeys[cell] { store.write(key, value) }
		}
		for line in try result["logs"].array() {
			let pair = try line.array()
			guard pair.count == 2 else { throw line.fail("a log line is [level, text]") }
			scriptHost?.log(try pair[0].string(), try pair[1].string())
		}
		// A submit handler's promise keeps its submission running until the entry it settles in, as the web keeps the form busy.
		for run in try result["pending"].array() {
			guard let submission else { continue }
			submission.pending += 1
			scriptRuns[try wholeNumber(run)] = submission
		}
		for run in try result["settled"].array() {
			guard let kept = scriptRuns.removeValue(forKey: try wholeNumber(run)) else { continue }
			kept.pending -= 1
			settle(kept)
		}
		let aborts = try result["aborts"].array().map { NativeJournalEntry.abort(id: try wholeNumber($0)) }
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
		let calls = try (result.has("calls") ? result["calls"].array() : []).map { asked -> NativeJournalEntry in
			let fields = try asked.object(required: ["call", "arguments"], optional: ["id", "object"])
			return .call(
				call: try fields["call"].string(), object: fields.has("object") ? try fields["object"].string() : nil,
				arguments: try fields["arguments"].array().map { NativeValue(json: $0.value) }, result: nil,
				resume: fields.has("id") ? "\(scriptCall)\(try wholeNumber(fields["id"]))" : nil)
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
		// A key or paste handler called preventDefault() before it first awaited.
		let prevented: [NativeJournalEntry] = try result.has("prevented") && result["prevented"].bool() ? [.preventDefault] : []
		guard result.has("navigate") else { return aborts + clears + timers + requests + calls + commands + prevented }
		let opened = try result["navigate"].object(["route", "params", "replace"])
		let params = try opened["params"].keys().map { NativeRouteParam(name: $0, value: try opened["params"].field($0).string()) }
		return aborts + clears + timers + requests + calls + commands + prevented + [.navigate(route: try opened["route"].string(), params: params, replace: try opened["replace"].bool())]
	}

	/// Tells the engine which async values are shown and what they read, when that moved; it starts and aborts runs.
	private func syncAsync() throws -> [NativeJournalEntry] {
		if asyncCells.isEmpty { return [] }
		let event = eventValue
		eventValue = nil
		defer { eventValue = event }
		var out: [NativeJournalEntry] = []
		// A run that settles at once can show another; the engine is asked again until nothing moves.
		for _ in 0..<16 {
			let shownAsync = try asyncCells.flatMap { cell -> [(cell: NativeCell, slot: String, scope: NativeScope)] in
				var seen = Set<String>()
				var out: [(cell: NativeCell, slot: String, scope: NativeScope)] = []
				for id in cell.async!.boundaries {
					for instance in try nodesById[id].map(instances(of:)) ?? [] {
						let slot = try slot(of: cell.id, in: instance.scope)
						if seen.insert(slot).inserted { out.append((cell, slot, instance.scope)) }
					}
				}
				return out
			}
			let tasks = try shownAsync.map { shown -> (slot: String, fn: String, frame: [(String, JSONValue)]) in
				guard case let .object(names) = try self.frame(of: shown.cell.async!.bindings, in: shown.scope) else { throw RuntimeError(reason: "a frame is an object") }
				return (shown.slot, shown.cell.async!.script, names)
			}
			let listed = JSONValue.array(tasks.map { .object([("slot", .string($0.slot)), ("fn", .string($0.fn)), ("frame", .object($0.frame))]) })
			let sent = JSONValue.array([listed, .array(tasks.map { .array($0.frame.map { readFrame($0.1) }) })]).jsonText
			if sent == asyncSent && retry.isEmpty { return out }
			asyncSent = sent
			var entry: [(String, JSONValue)] = [("kind", .string("tasks")), ("screen", .number(Double(screen))), ("tasks", listed)]
			if !retry.isEmpty { entry.append(("retry", .array(retry.map { .string($0) }))) }
			retry = []
			out += try enter(entry)
		}
		throw RuntimeError(reason: "async values that keep starting each other")
	}

	/// A frame's name as the value it holds now.
	private func readFrame(_ binding: JSONValue) -> JSONValue {
		guard case let .object(fields) = binding, let (kind, inner) = fields.first else { return .null }
		let slotValue = { (slot: String) -> JSONValue in
			if let value = self.values[slot], value != .null { return value.json }
			return self.values[String(slot.split(separator: "@", omittingEmptySubsequences: false)[0])]?.json ?? .null
		}
		switch (kind, inner) {
		case let ("slot", .string(slot)): return slotValue(slot)
		case let ("fields", .object(slots)): return .array(slots.map { if case let .string(slot) = $0.1 { slotValue(slot) } else { .null } })
		case ("callback", _): return .null
		case let ("object", .object(members)), let ("shared", .object(members)): return .array(members.map { readFrame($0.1) })
		case ("method", _):
			guard let frame = fields.first(where: { $0.0 == "frame" })?.1, case let .object(members) = frame else { return .null }
			return .array(members.map { readFrame($0.1) })
		default: return inner
		}
	}

	/// Starts the async values the script computes, once the screen is built; the host applies its journal as an action's.
	public func start() throws -> [NativeJournalEntry] {
		asyncCells.isEmpty ? [] : try change(host: nil) { [] }
	}

	/// The screen shows again after Back: it takes the app's values of its app-wide cells that a page above it changed.
	public func resume() throws -> [NativeJournalEntry] {
		let moved = payload.cells.filter { cell in cell.app && session.values[cell.id] != nil && session.values[cell.id] != values[cell.id] }
		guard !moved.isEmpty else { return [] }
		return try change(host: nil) {
			for cell in moved { values[cell.id] = session.values[cell.id] }
			return []
		}
	}

	/// The screen is gone: its async values' runs are aborted; the journal holds the requests to cancel.
	public func leave() throws -> [NativeJournalEntry] {
		guard asyncSent != nil else { return [] }
		return try enter([("kind", .string("tasks")), ("screen", .number(Double(screen))), ("tasks", .array([])), ("leave", .bool(true))])
			.filter { if case .abort = $0 { true } else { false } }
	}

	/// The host's answer to a `fetch` entry.
	public func response(_ id: Int, _ response: NativeFetchResponse) throws -> [NativeJournalEntry] {
		try change(host: nil) { try self.enter([("kind", .string("response")), ("request", .number(Double(id))), ("response", response.json)]) }
	}

	/// The arm a branch shows now (nil: none).
	/// In a list row, `scope` is that row's: its tests read the row's item and state.
	public func arm(of branch: String, in scope: NativeScope = .empty) throws -> Int? {
		guard let node = nodesById[branch], case let .branch(tests) = node.kind else { throw RuntimeError(reason: "unknown branch \(branch)") }
		for (index, test) in tests.enumerated() {
			if let test, try evaluate(test, in: scope).isTruthy { return index }
		}
		return tests.firstIndex { $0 == nil }
	}

	public func isShown(_ place: NativeArmPlace?, in scope: NativeScope = .empty) throws -> Bool {
		guard let place else { return true }
		guard let branch = nodesById[place.branch] else { return false }
		return try isShown(branch.arm, in: scope) && arm(of: place.branch, in: scope) == place.index
	}

	/// A list's rows now: each item with its key, `String()` of the item at the key path.
	public func rows(of repeatId: String, in scope: NativeScope = .empty) throws -> [(key: String, item: NativeValue)] {
		guard let node = nodesById[repeatId], case let .repeat(list, keyPath, keyParts) = node.kind else { throw RuntimeError(reason: "unknown list \(repeatId)") }
		guard case let .array(array) = try evaluate(list, in: scope) else { throw RuntimeError(reason: "\(repeatId) lists a value that is not an array") }
		guard let keyPath else { return array.items.enumerated().map { (String($0.offset), $0.element) } }
		let valueAt = { (item: NativeValue, path: [String]) throws -> NativeValue in
			var key = item
			for step in path {
				guard case let .object(object) = key, let next = object.get(step) else {
					throw RuntimeError(reason: "\(repeatId): a row has no key at \(path.joined(separator: "."))")
				}
				key = next
			}
			return key
		}
		return try array.items.map { item in
			guard let keyParts else { return (try valueAt(item, keyPath).text, item) }
			let key = try keyParts.map { part in
				switch part {
				case let .text(text): text
				case let .path(path): try valueAt(item, path).text
				}
			}.joined()
			return (key, item)
		}
	}

	/// Every shown copy of a node; a row of a list inside another list's row is keyed by both (`<id>@<outer>@<key>`).
	public func instances(of node: NativeNode) throws -> [NativeInstance] {
		guard let row = node.row else { return try isShown(node.arm) ? [NativeInstance(id: node.id, scope: .empty)] : [] }
		guard let list = nodesById[row] else { return [] }
		return try instances(of: list).flatMap { copy in
			let outer = list.row.flatMap { copy.scope.keys[$0] }
			return try rows(of: row, in: copy.scope).enumerated().map { position, entry -> NativeInstance in
				let suffix = outer.map { "\($0)@\(entry.key)" } ?? entry.key
				var scope = copy.scope
				scope.items[row] = entry.item
				scope.keys[row] = suffix
				scope.positions[row] = position
				return NativeInstance(id: "\(node.id)@\(suffix)", scope: scope)
			}
		}.filter { try isShown(node.arm, in: $0.scope) }
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
		let found = try element(nodeOf(id))
		if let binding = found.bindings.first(where: { !$0.isProperty && $0.name == name }) {
			// A row's copy (`<node>@<key>`) reads its own row.
			let scope = id == found.node.id ? NativeScope.empty : try instances(of: found.node).first { $0.id == id }?.scope ?? .empty
			return marklessAttributeValue(name, try evaluate(binding.value, in: scope))
		}
		return found.attributes[name]
	}

	private func propertyBinding(_ id: String, _ name: String) throws -> NativeBinding? {
		try element(id).bindings.first { $0.isProperty && $0.name == name }
	}

	private func textOf(field id: String) throws -> String {
		let text: String
		if let typed = edited[id] { text = typed }
		else if let binding = try propertyBinding(id, "value") { text = textOf(try evaluate(binding.value)) }
		else { text = try attributeNow(id, "value") ?? "" }
		// A range keeps a number in its range and on its step, whatever it is given.
		guard try attributeNow(id, "type") == "range" else { return text }
		return nativeRangeValue(text, min: try attributeNow(id, "min"), max: try attributeNow(id, "max"), step: try attributeNow(id, "step"))
	}

	/// A box an arm hides is not built yet, so its binding (which may read what the arm's test guards) is not read.
	private func checkedBinding(_ id: String) throws -> Bool? {
		if let node = ticked.first(where: { $0.id == id }), try instances(of: node).isEmpty { return nil }
		return try propertyBinding(id, "checked").map { try evaluate($0.value).isTruthy }
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

	private struct OptionInstance {
		let id: String
		let node: NativeNode
		let scope: NativeScope
	}

	/// An attribute of one instance as the web has it now: a binding's value in its row, else the attribute as built.
	private func attribute(of node: NativeNode, _ name: String, in scope: NativeScope) throws -> String? {
		guard case let .element(_, attributes, bindings) = node.kind else { return nil }
		if let binding = bindings.first(where: { !$0.isProperty && $0.name == name }) {
			return marklessAttributeValue(name, try evaluate(binding.value, in: scope))
		}
		return attributes[name]
	}

	/// A select's shown options in tree order: a list's rows where the list stands, each row's options in order.
	private func options(of select: String) throws -> [OptionInstance] {
		let children = payload.nodes.filter { node in
			guard node.parent == select, case .element("option", _, _) = node.kind else { return false }
			return true
		}
		var listed = Set<String>()
		var found: [OptionInstance] = []
		for node in children {
			guard let row = node.row else {
				found += try instances(of: node).map { OptionInstance(id: $0.id, node: node, scope: $0.scope) }
				continue
			}
			guard !listed.contains(row) else { continue }
			listed.insert(row)
			guard let list = nodesById[row], try isShown(list.arm) else { continue }
			let siblings = children.filter { $0.row == row }
			var shown: [String: OptionInstance] = [:]
			for child in siblings {
				for instance in try instances(of: child) { shown[instance.id] = OptionInstance(id: instance.id, node: child, scope: instance.scope) }
			}
			for entry in try rows(of: row) {
				for child in siblings { if let option = shown["\(child.id)@\(entry.key)"] { found.append(option) } }
			}
		}
		return found
	}

	/// An option's text: its text with ASCII whitespace stripped and collapsed, as `option.text` gives it.
	private func text(of option: OptionInstance) throws -> String {
		let raw = try payload.nodes.compactMap { node -> String? in
			guard node.parent == option.node.id, case let .text(parts) = node.kind else { return nil }
			return try text(of: parts, in: option.scope)
		}.joined()
		return raw.split(whereSeparator: { "\t\n\u{0C}\r ".contains($0) }).joined(separator: " ")
	}

	private func value(of option: OptionInstance) throws -> String {
		try attribute(of: option.node, "value", in: option.scope) ?? text(of: option)
	}

	private func selectedBinding(_ option: OptionInstance) throws -> Bool? {
		guard case let .element(_, _, bindings) = option.node.kind,
			let binding = bindings.first(where: { $0.isProperty && $0.name == "selected" })
		else { return nil }
		return try evaluate(binding.value, in: option.scope).isTruthy
	}

	/// Brings each select's options up to date: rows that came or left, `selected` bindings that changed, then the rule.
	private func settleSelects(_ chosen: String? = nil) throws {
		for select in selects {
			let options = try options(of: select.id)
			let ids = Set(options.map(\.id))
			for id in Array(selectedBound.keys) where nodesById[nodeOf(id)]?.parent == select.id && !ids.contains(id) {
				selectedBound.removeValue(forKey: id)
				selectedness.removeValue(forKey: id)
			}
			let choose = { (id: String) in for option in options { self.selectedness[option.id] = option.id == id } }
			for option in options {
				if selectedBound.index(forKey: option.id) == nil {
					let first = try selectedBinding(option)
					selectedBound[option.id] = .some(first)
					let selected = try first ?? (attribute(of: option.node, "selected", in: option.scope) != nil)
					selectedness[option.id] = selected
					if selected { choose(option.id) }
					continue
				}
				if let bound = try selectedBinding(option), bound != selectedBound[option.id] ?? nil {
					selectedBound[option.id] = .some(bound)
					selectedness[option.id] = bound
					if bound { choose(option.id) }
				}
			}
			if let chosen, ids.contains(chosen) { choose(chosen) }
			if !options.contains(where: { selectedness[$0.id] == true }),
				let first = try options.first(where: { try attribute(of: $0.node, "disabled", in: $0.scope) == nil })
			{
				selectedness[first.id] = true
			}
		}
	}

	/// Each shown option of each `<select>`, in tree order, and whether it is selected.
	public func selections() throws -> [(node: String, selected: Bool)] {
		try selects.flatMap { select in try options(of: select.id).map { ($0.id, selectedness[$0.id] ?? false) } }
	}

	/// What a select's list shows: each shown option in tree order, with its label (its `label` attribute when not empty,
	/// else its text), whether a person cannot choose it, and whether it is the chosen one.
	public func choices(of select: String) throws -> [(option: String, label: String, disabled: Bool, selected: Bool)] {
		try options(of: select).map { option in
			let label = try attribute(of: option.node, "label", in: option.scope).flatMap { $0.isEmpty ? nil : $0 } ?? text(of: option)
			let disabled = try attribute(of: option.node, "disabled", in: option.scope) != nil
			return (option.id, label, disabled, selectedness[option.id] ?? false)
		}
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
			case .text: return [name, try valueOf(field: field.node)]
			case .select:
				guard let chosen = try options(of: field.node).first(where: { selectedness[$0.id] == true }) else { return nil }
				return [name, try value(of: chosen)]
			}
		}
	}

	/// A text field's value as the web keeps it: an email field drops line breaks and trims its ends.
	private func valueOf(field node: String) throws -> String {
		let text = try textOf(field: node)
		return try attributeNow(node, "type") == "email" ? NativeEmailMismatch.value(text) : text
	}

	/// The first field that stops a submit and what the web says about it, or nil when none does.
	private func firstInvalid(_ form: NativeForm, submitter: String?) throws -> (node: String, message: String)? {
		if form.noValidate { return nil }
		if let submitter, try attributeNow(submitter, "formnovalidate") != nil { return nil }
		for field in form.fields {
			if let message = try invalidity(field) { return (field.node, message) }
		}
		return nil
	}

	/// Why a field stops a submit, as the web says it, or nil when it does not.
	private func invalidity(_ field: NativeForm.Field) throws -> String? {
		guard field.kind != .hidden, field.kind != .select, try isShownField(field.node) else { return nil }
		guard try attributeNow(field.node, "disabled") == nil else { return nil }
		// A readonly text field is barred from constraint validation.
		if field.kind == .text, try attributeNow(field.node, "readonly") != nil { return nil }
		// A radio button is missing its value when any button of its group is required and none is checked.
		let required = field.kind == .radio
			? try group(of: field.node).contains { try attributeNow($0.id, "required") != nil }
			: try attributeNow(field.node, "required") != nil
		if required {
			let absent = switch field.kind {
			case .radio: try group(of: field.node).allSatisfy { !(try isChecked($0.id)) }
			case .text: try valueOf(field: field.node) == ""
			default: !(try isChecked(field.node))
			}
			if absent {
				guard let missing else { throw RuntimeError(reason: "the payload has no message for a \(field.kind.rawValue) missing its value") }
				switch field.kind {
				case .checkbox: return missing.checkbox
				case .radio: return missing.radio
				default: return missing.text
				}
			}
		}
		if field.kind == .text, try attributeNow(field.node, "type") == "email" {
			guard let emailMismatch else { throw RuntimeError(reason: "the payload has no message for an email field") }
			if let message = emailMismatch.message(for: try valueOf(field: field.node)) { return message }
		}
		// Only text a person typed is too long: a value the app set is kept whole and passes.
		guard field.kind == .text, let max = nativeMaxLength(try attributeNow(field.node, "maxlength")), let typed = edited[field.node],
			typed.utf16.count > max
		else { return nil }
		guard let tooLong else { throw RuntimeError(reason: "the payload has no message for a field longer than its maxlength") }
		return tooLong.message(max: max, length: typed.utf16.count)
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

	/// Every shown branch instance's chosen arm (`<branch>@<key>` in a list row).
	public func arms() throws -> [(node: String, index: Int?)] {
		try payload.nodes.flatMap { node -> [(node: String, index: Int?)] in
			guard case .branch = node.kind else { return [] }
			return try instances(of: node).map { ($0.id, try arm(of: node.id, in: $0.scope)) }
		}
	}

	/// A branch's style state: the arm it shows ("0", "1", …, or "none"); nil while it is not shown.
	public func styleArm(of branch: String) throws -> NativeValue? {
		guard let shown = try arms().first(where: { $0.node == branch }) else { return nil }
		return .string(shown.index.map(String.init) ?? "none")
	}

	/// Every shown list's row keys, in order.
	public func rows() throws -> [(node: String, keys: [String])] {
		try payload.nodes.flatMap { node -> [(node: String, keys: [String])] in
			guard case .repeat = node.kind else { return [] }
			return try instances(of: node).map { ($0.id, try rows(of: node.id, in: $0.scope).map(\.key)) }
		}
	}

	/// The page's `<title>` text, nil when it has none.
	public func title() throws -> String? { try payload.title.map { try text(of: $0) } }

	/// Each style slot's number now, in the payload's order: what the host lays the page out with.
	public func slots() throws -> [(slot: String, value: Double)] {
		let cases = Dictionary(uniqueKeysWithValues: try styleCases().map { ($0.styleCase, $0.value) })
		return try payload.slots.map { slot in
			// Its expression may not hold while its style case hides the text (`point.x`), so it keeps its last value.
			if let when = slot.when, cases[when.styleCase] != when.value { return (slot.id, keptSlots[slot.id] ?? 0) }
			let evaluated = try evaluate(slot.value)
			guard case let .number(value) = evaluated, value.isFinite else {
				throw RuntimeError(reason: "style slot \(slot.id) is \(evaluated.json.jsonText), not a finite number")
			}
			if slot.integer, value.rounded(.towardZero) != value {
				throw RuntimeError(reason: "style slot \(slot.id) is \(JSONValue.number(value).jsonText), not a whole number")
			}
			keptSlots[slot.id] = value
			return (slot.id, value)
		}
	}

	/// Whether each style case's test holds now, in the payload's order: which of Dragon's assignments the style is in.
	public func styleCases() throws -> [(styleCase: String, value: Bool)] {
		try payload.styleCases.map { ($0.id, try evaluate($0.value).isTruthy) }
	}

	/// Every system sheet shown (its arm, if any, showing) and whether its `open` is truthy.
	public func sheets() throws -> [(node: String, open: Bool)] {
		try payload.nodes.compactMap { node in
			guard case let .sheet(open, _, _, _) = node.kind, try isShown(node.arm) else { return nil }
			return (node.id, try evaluate(open).isTruthy)
		}
	}

	/// Runs the handler bound to the action and returns the journal the host applies.
	public func dispatch(_ action: NativeAction) throws -> [NativeJournalEntry] {
		if action.event == .choose {
			guard let option = nodesById[nodeOf(action.host)], case .element("option", _, _) = option.kind, let select = option.parent,
				let instance = try options(of: select).first(where: { $0.id == action.host })
			else { throw RuntimeError(reason: "\(action.host) is not a shown option of a select") }
			return try change(host: nil) {
				guard try self.attributeNow(select, "disabled") == nil, try self.attribute(of: option, "disabled", in: instance.scope) == nil else { return [] }
				let before = try self.options(of: select).first { self.selectedness[$0.id] == true }?.id
				self.chosenNow = action.host
				// A different choice fires the select's `change` (an `input` event here), its value the new option's.
				guard before != action.host, let changed = self.payload.events.first(where: { $0.host == select && $0.event == .input }) else { return [] }
				for one in try self.options(of: select) { self.selectedness[one.id] = one.id == action.host }
				self.eventValue = try self.value(of: instance)
				defer { self.eventValue = nil }
				return try self.run(self.handlers[changed.handler] ?? [], in: instance.scope)
			}
		}
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
		eventValue = action.event == .input || action.event == .commit ? action.value ?? "" : nil
		edit = eventValue
		switch action.event {
		case .keydown, .keyup: eventFields = [.key: .string(action.value ?? "")]
		case .paste: eventFields = [.text: .string(action.value ?? "")]
		case .activate: eventFields = [.detail: .number(Double(action.detail ?? 1))]
		default: break
		}
		if [.keydown, .keyup, .paste].contains(action.event) { targetText = try textOf(field: action.host) }
		defer { eventValue = nil; edit = nil; eventFields = nil; targetText = nil }
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
				// The behaviour's document listener hears the press: the topmost hint and the topmost other overlay it landed outside are told.
				for top in [self.stack.last(where: self.isHint), self.stack.last(where: { !self.isHint($0) })] {
					guard let top, !self.contains(top, action.host), let dismiss = handlerOf(top, .dismiss) else { continue }
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

	private func isShownInstance(_ id: String) throws -> Bool {
		let template = id.firstIndex(of: "@").map { String(id[..<$0]) } ?? id
		return try nodesById[template].map { node in try instances(of: node).contains { $0.id == id } } ?? false
	}

	/// A field an arm hid is a new element when it shows again: it starts from its markup, as the web builds it.
	private func forgetHidden() throws {
		for key in fired where !(try isShownInstance(String(key[key.index(after: key.firstIndex(of: "\u{0}")!)...]))) { fired.remove(key) }
		for id in edited.keys where !(try isShownInstance(id)) { edited[id] = nil }
		for node in ticked where try instances(of: node).isEmpty {
			guard case let .element(_, attributes, _) = node.kind else { continue }
			checkedness[node.id] = try checkedBinding(node.id) ?? (attributes["checked"] != nil)
		}
	}

	/// A device call a handler awaited answered: its continuation runs with the answer as its local.
	public func resume(_ continuation: String, value: NativeValue) throws -> [NativeJournalEntry] {
		if let call = scriptCallId(continuation) {
			return try change(host: nil) { try self.enter([("kind", .string("answer")), ("call", .number(Double(call))), ("value", value.json)]) }
		}
		guard let then = continuations[continuation] else { throw RuntimeError(reason: "no continuation \(continuation)") }
		var scope = NativeScope.empty
		scope.locals[then.as] = value
		return try change(host: nil) { try self.run(then.ops, in: scope) }
	}

	/// That call failed: the rest of the handler does not run, and the nearest `@catch` cell takes `{ name, message }`.
	public func reject(_ continuation: String, name: String, message: String) throws -> [NativeJournalEntry] {
		if let call = scriptCallId(continuation) {
			let error = JSONValue.object([("name", .string(name)), ("message", .string(message))])
			return try change(host: nil) { try self.enter([("kind", .string("answer")), ("call", .number(Double(call))), ("error", error)]) }
		}
		guard let then = continuations[continuation] else { throw RuntimeError(reason: "no continuation \(continuation)") }
		guard let cell = then.catch else { return [] }
		return try change(host: nil) {
			self.values[cell] = .object([("name", .string(name)), ("message", .string(message))])
			self.unset.remove(cell)
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
			case let .reset(cells, catchCell):
				if let catchCell { values[catchCell] = .null }
				for cell in cells where try heldError(try read(cell, in: scope)) {
					let held = try slot(of: cell, in: scope)
					if !retry.contains(held) { retry.append(held) }
				}
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
				unset.remove(cell)
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
			case .preventDefault:
				calls.append(.preventDefault)
			case let .fieldText(target, value):
				let id = try evaluate(target, in: scope)
				if id == .null { continue }
				guard case let .string(node) = id, isElement(node) else { throw RuntimeError(reason: "a field text written to a value that is not an element") }
				let text = textOf(try evaluate(value, in: scope))
				edited[node] = text
				calls.append(.property(node: node, name: "value", value: text))
			case let .capture(target, pointer, release):
				guard case let .string(node) = try evaluate(target, in: scope), case let .number(id) = try evaluate(pointer, in: scope),
					let touch = touches[id]
				else { continue }
				if !release { touch.capture = node } else if touch.capture == node { touch.capture = nil }
			case let .call(call, object, arguments, result, then):
				calls.append(.call(call: call, object: object, arguments: try arguments.map { try evaluate($0, in: scope) }, result: result, resume: then?.id))
			case let .script(fn, type, bindings, catchCell):
				let touch = touchFields.compactMap { field in eventFields?[field].map { (field.rawValue, $0.json) } }
				let typed = [NativeEventField.key, .text].compactMap { field in eventFields?[field].map { (field.rawValue, $0.json) } }
				let event: JSONValue = .object([("type", .string(type))] + ((eventValue ?? targetText).map { [("value", JSONValue.string($0))] } ?? []) + typed + touch)
				let frame = try frame(of: bindings, in: scope)
				calls.append(contentsOf: try enter(
					[("kind", .string("dispatch")), ("fn", .string(fn)), ("frame", frame), ("elements", try elementFacts(frame)), ("event", event)]
						+ (try catchCell.map { [("catch", JSONValue.string(try slot(of: $0, in: scope)))] } ?? []), submission: submission))
			}
		}
		return calls
	}

	/// An async value that settled with an error: `{ state: 'error' }`, or `{ state: 'value', error }` with a non-null error.
	private func heldError(_ value: NativeValue) -> Bool {
		guard case let .object(fields) = value, case let .string(state)? = fields.get("state") else { return false }
		if state == "error" { return true }
		guard state == "value", let error = fields.get("error") else { return false }
		return error != .null
	}

	/// A `submit` op as the web runs it: nothing for a disabled submitter, an `invalid` entry for the first field missing its
	/// value, nothing for the same entries from the same button as a submission still running, else the form's handler.
	private func submit(_ formId: String, _ submitter: String?, in scope: NativeScope, into calls: inout [NativeJournalEntry]) throws -> [NativeJournalEntry] {
		guard let form = forms[formId] else { throw RuntimeError(reason: "\(formId) is not a form") }
		if let submitter, try attributeNow(submitter, "disabled") != nil { return [] }
		if let invalid = try firstInvalid(form, submitter: submitter) {
			calls.append(.invalid(node: invalid.node, message: invalid.message))
			return []
		}
		if let opens = form.opens {
			let url = nativeFormUrl(opens, try entries(of: formId).map { ($0[0], $0[1]) })
			calls.append(.call(call: "browser.open", object: nil, arguments: [.string(url)], result: nil, resume: nil))
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
		return try change(host: nil) { self.values[cell] = value; self.unset.remove(cell); return [] }
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
		return try change(host: nil) { self.values[cell] = value; self.unset.remove(cell); return [] }
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
		try seedRows()
		let cellsBefore = values
		let slotsBefore = Dictionary(try slots().map { ($0.slot, $0.value) }, uniquingKeysWith: { $1 })
		let casesBefore = Dictionary(uniqueKeysWithValues: try styleCases().map { ($0.styleCase, $0.value) })
		let beforeTexts = Dictionary(try texts().map { ($0.node, $0.text) }, uniquingKeysWith: { $1 })
		let beforeAttributes = keyed(try boundAttributes())
		let beforeMarks = keyed(marks())
		let checkedBefore = checkedness
		let selectedBefore = selectedness
		let bindingsBefore = Dictionary(uniqueKeysWithValues: try ticked.map { ($0.id, try checkedBinding($0.id)) })
		var beforeProperties = keyed(try properties().map { ($0.node, $0.name, Optional($0.value)) })
		if let edit, let host {
			beforeProperties["\(host)\u{0}value"] = edit
			edited[host] = edit
		}
		let beforeArms = Dictionary(uniqueKeysWithValues: try arms().map { ($0.node, $0.index) })
		let beforeRows = Dictionary(uniqueKeysWithValues: try rows().map { ($0.node, $0.keys) })
		let beforeTitle = try title()
		let dialogsBefore = dialogs
		let beforeSheets = Dictionary(uniqueKeysWithValues: try sheets().map { ($0.node, $0.open) })
		let ownedBefore = Set(try liveObjects())
		let focusBefore = focused
		let stackBefore = stack
		let signaturesBefore = try rowSignatures()
		drawnArms = beforeArms
		defer { drawnArms = nil }
		var calls = try apply()
		if case .navigate? = calls.first { return calls }
		// A row that left takes its state with it; a later row with the same key starts from the first values.
		let kept = Set(try rows().flatMap { list in list.keys.map { "\(list.node)\u{0}\($0)" } })
		for slot in values.keys {
			guard let at = slot.firstIndex(of: "@"), let list = rowOfCell[String(slot[..<at])] else { continue }
			if !kept.contains("\(list)\u{0}\(slot[slot.index(after: at)...])") { values.removeValue(forKey: slot) }
		}
		try resetChangedRows(signaturesBefore)
		try seedRows()
		try follow()
		calls += try syncAsync()
		// An overlay becoming shown supersedes every shown hint it is not inside, before it joins the stack.
		let shownFirst = try shownOverlays()
		var working = stackBefore.filter(shownFirst.contains)
		for newcomer in shownFirst where !stackBefore.contains(newcomer) {
			for hint in working where isHint(hint) && !contains(hint, newcomer) {
				guard let dismiss = payload.events.first(where: { $0.host == hint && $0.event == .dismiss }) else { continue }
				eventFields = [.reason: .string("superseded"), .pressTarget: .null]
				defer { eventFields = nil }
				let taken = try run(handlers[dismiss.handler] ?? [], in: .empty)
				if case .navigate? = taken.first { return taken }
				calls.append(contentsOf: taken)
			}
			working.append(newcomer)
		}
		let shownNow = try shownOverlays()
		let released = stackBefore.filter { !shownNow.contains($0) }
		let enlisted = shownNow.filter { !stackBefore.contains($0) }
		stack = stackBefore.filter(shownNow.contains) + enlisted
		for overlay in enlisted { origins[overlay] = focusBefore ?? nativeDocumentBody }
		let overlays = try released.map { NativeJournalEntry.overlay(node: $0, open: false, modal: try isModal($0)) }
			+ enlisted.map { NativeJournalEntry.overlay(node: $0, open: true, modal: try isModal($0)) }
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
		} + (try styleCases()).compactMap { styleCase -> NativeJournalEntry? in
			casesBefore[styleCase.styleCase] == styleCase.value ? nil : .state(cell: styleCase.styleCase, value: .bool(styleCase.value))
		} + (try slots()).compactMap { slot -> NativeJournalEntry? in
			// Object.is: a finite number is the same only with the same bit pattern (0 and -0 differ).
			slotsBefore[slot.slot]?.bitPattern == slot.value.bitPattern ? nil : .slot(slot: slot.slot, value: slot.value)
		}
		let entries = try payload.nodes.flatMap { node -> [NativeJournalEntry] in
			switch node.kind {
			case .repeat:
				// Each shown copy of the list: an inner list has one per row of its outer list (`<id>@<key>`).
				return try rows().compactMap { copy in
					guard copy.node == node.id || copy.node.hasPrefix("\(node.id)@"),
						let before = beforeRows[copy.node], let after = afterRows[copy.node], before != after else { return nil }
					return .rows(node: copy.node, keys: after)
				}
			case .branch:
				return try instances(of: node).compactMap { instance in
					guard let before = beforeArms[instance.id], let after = afterArms[instance.id], before != after else { return nil }
					return .arm(node: instance.id, index: after)
				}
			case .sheet:
				guard let before = beforeSheets[node.id], let after = afterSheets[node.id], before != after else { return [] }
				return [.sheet(node: node.id, open: after)]
			case .text:
				return try instances(of: node).compactMap { instance in
					guard let before = beforeTexts[instance.id], let after = afterTexts[instance.id], before != after else { return nil }
					return .text(node: instance.id, value: after)
				}
			case let .element(element, _, bindings):
				let opened: [NativeJournalEntry] = dialogs[node.id].flatMap { open in open != dialogsBefore[node.id] ? [.dialog(node: node.id, open: open)] : nil } ?? []
				// A textarea nobody edited and no `value` property sets shows its `value` attribute, as the web's default value.
				let followsDefault = element == "textarea" && !bindings.contains { $0.isProperty && $0.name == "value" }
				return try opened + instances(of: node).flatMap { instance in
					bindings.flatMap { binding -> [NativeJournalEntry] in
						let key = "\(instance.id)\u{0}\(binding.name)"
						let (before, after) = binding.isProperty ? (beforeProperties, afterProperties) : (beforeAttributes, afterAttributes)
						guard let old = before[key], let new = after[key], old != new else { return [] }
						if binding.isProperty { return [.property(node: instance.id, name: binding.name, value: new ?? "")] }
						let shown: [NativeJournalEntry] = followsDefault && binding.name == "value" && edited[instance.id] == nil ? [.property(node: instance.id, name: "value", value: new ?? "")] : []
						return [.attribute(node: instance.id, name: binding.name, value: new)] + shown
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
		try settleSelects(chosenNow)
		chosenNow = nil
		// An option a new row builds starts unselected on the host, so only a selected one is sent.
		let chosen = try selections().compactMap { entry -> NativeJournalEntry? in
			(selectedBefore[entry.node] ?? false) == entry.selected ? nil : .selected(node: entry.node, value: entry.selected)
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
		let titled: [NativeJournalEntry] = afterTitle != beforeTitle ? afterTitle.map { [.title(value: $0)] } ?? [] : []
		var journal: [NativeJournalEntry] = styles
		for part in [entries, checks, chosen, marked, titled, releases, overlays, calls] { journal += part }
		for cell in payload.cells where cell.app && !unset.contains(cell.id) { session.values[cell.id] = values[cell.id] }
		return journal
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
/// The values of an app's app-wide `shared()` cells, one for every page; `shared` lasts as long as the app runs, as the web's
/// module-level instance lasts as long as its page is open.
public final class NativeAppSession: @unchecked Sendable {
	// Read and written on the main thread only, where every runtime runs.
	public static let shared = NativeAppSession()
	public var values: [String: NativeValue] = [:]
	public init() {}
}

public final class NativeAppStack {
	public let app: NativeAppPayload
	private let store: NativeStore
	private let scriptHost: NativeScriptHost?
	private let session = NativeAppSession()
	public private(set) var screens: [NativeScreen]
	/// What starting the screens the app opened with asked for, bottom first.
	public private(set) var started: [NativeJournalEntry] = []

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
		started = try screens.flatMap { try $0.runtime.start() }
	}

	public func screen(_ route: String, _ params: [NativeRouteParam]) throws -> NativeScreen {
		guard let entry = app.routes.first(where: { $0.pattern == route }) else { throw RuntimeError(reason: "no page for \(route)") }
		return NativeScreen(
			route: route, params: params, path: try NativeAppPayload.path(route, params),
			runtime: NativeRuntime(payload: entry.page, store: store, params: params, scriptHost: scriptHost, session: session))
	}

	/// Runs an action on the top screen; a `navigate` entry pushes the new screen or replaces the top one.
	public func dispatch(_ action: NativeAction) throws -> [NativeJournalEntry] {
		let journal = try screens[screens.count - 1].runtime.dispatch(action)
		if case let .navigate(route, params, replace)? = journal.last {
			let next = try screen(route, params)
			let left = replace ? try screens.removeLast().runtime.leave() : []
			screens.append(next)
			return journal + left + (try next.runtime.start())
		}
		return journal
	}

	/// The platform's Back: the top screen goes and the one below shows as it was left; returns what its leaving cancels.
	@discardableResult
	public func back() throws -> [NativeJournalEntry] {
		guard screens.count > 1 else { throw RuntimeError(reason: "back on the first screen leaves the app") }
		let left = try screens.removeLast().runtime.leave()
		return left + (try screens[screens.count - 1].runtime.resume())
	}
}

extension Optional where Wrapped == NativeScriptHost {
	func unwrap() throws -> NativeScriptHost {
		guard let self else { throw RuntimeError(reason: "a script op with no script engine to run it") }
		return self
	}
}

/// The prefix of a timer the script set, as its `timer` entries name it (`script:3`); other timers are `after` ops.
/// The URL a GET form leaves for: its action with the query replaced by the entries, each encoded as
/// `application/x-www-form-urlencoded` (UTF-8, a space as `+`, all but `*-._` and ASCII letters and digits escaped).
public func nativeFormUrl(_ action: String, _ entries: [(String, String)]) -> String {
	let encode = { (text: String) -> String in
		text.utf8.map { byte -> String in
			switch byte {
			case 0x20: return "+"
			case 0x30...0x39, 0x41...0x5A, 0x61...0x7A, 0x2A, 0x2D, 0x2E, 0x5F: return String(UnicodeScalar(byte))
			default: return String(format: "%%%02X", byte)
			}
		}.joined()
	}
	let fragment = action.firstIndex(of: "#").map { String(action[$0...]) } ?? ""
	let base = action.firstIndex(of: "#").map { String(action[..<$0]) } ?? action
	let path = base.firstIndex(of: "?").map { String(base[..<$0]) } ?? base
	return path + "?" + entries.map { "\(encode($0.0))=\(encode($0.1))" }.joined(separator: "&") + fragment
}

public let scriptTimer = "script:"
/// The continuation a device call from a script names: its answer goes back to the script.
public let scriptCall = "script:"

private func scriptCallId(_ continuation: String) -> Int? {
	continuation.hasPrefix(scriptCall) ? Int(continuation.dropFirst(scriptCall.count)) : nil
}
