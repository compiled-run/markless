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
	case state(cell: String, value: NativeValue)
	/// nil removes the attribute; "" is a bare attribute.
	case attribute(node: String, name: String, value: String?)
	/// An input's text; never sent to the field whose edit caused it while it already shows that text.
	case property(node: String, name: String, value: String)
	/// A list's new row order: rows whose key left go, new rows are built from current values, the rest move.
	case rows(node: String, keys: [String])
	/// Shows arm `index` of a branch (nil: none), built from current values; the old arm's views go.
	case arm(node: String, index: Int?)
	/// A system sheet's `open` turned truthy (present it) or falsy (dismiss it, unless the platform already has).
	case sheet(node: String, open: Bool)
	/// Leave this page for the page at `route`, built from scratch with `params`: pushed, or in this screen's place.
	case navigate(route: String, params: [NativeRouteParam], replace: Bool)
	/// Run a device call now (on `object` when it names one); with `result`, settle that task cell with what it gives; with
	/// `resume`, answer with `resume(_:value:)` once the call settles.
	case call(call: String, object: String?, arguments: [NativeValue], result: String?, resume: String?)
	/// The device object's owner left the screen: the host stops it and forgets it.
	case release(object: String)
	/// The page's title text changed.
	case title(value: String)

	public var json: JSONValue {
		switch self {
		case let .text(node, value): return .object([("op", .string("text")), ("node", .string(node)), ("value", .string(value))])
		case let .state(cell, value):
			return .object([("op", .string("state")), ("cell", .string(cell)), ("value", value.json)])
		case let .attribute(node, name, value):
			return .object([("op", .string("attribute")), ("node", .string(node)), ("name", .string(name)), ("value", value.map(JSONValue.string) ?? .null)])
		case let .property(node, name, value):
			return .object([("op", .string("property")), ("node", .string(node)), ("name", .string(name)), ("value", .string(value))])
		case let .rows(node, keys):
			return .object([("op", .string("rows")), ("node", .string(node)), ("keys", .array(keys.map(JSONValue.string)))])
		case let .arm(node, index):
			return .object([("op", .string("arm")), ("node", .string(node)), ("index", index.map { .number(Double($0)) } ?? .null)])
		case let .sheet(node, open):
			return .object([("op", .string("sheet")), ("node", .string(node)), ("open", .bool(open))])
		case let .navigate(route, params, replace):
			return .object([("op", .string("navigate")), ("route", .string(route)), ("params", .object(params.map { ($0.name, .string($0.value)) }))]
				+ (replace ? [("replace", .bool(true))] : []))
		case let .call(call, object, arguments, result, resume):
			var fields: [(String, JSONValue)] = [("op", .string("call")), ("call", .string(call))]
			if let object { fields.append(("object", .string(object))) }
			fields.append(("arguments", .array(arguments.map(\.json))))
			if let result { fields.append(("result", .string(result))) }
			if let resume { fields.append(("resume", .string(resume))) }
			return .object(fields)
		case let .release(object): return .object([("op", .string("release")), ("object", .string(object))])
		case let .title(value): return .object([("op", .string("title")), ("value", .string(value))])
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
	public var locals: [String: NativeValue] = [:]
	public static let empty = NativeScope()
}

/// One shown copy of a node: the node itself outside lists, one per row inside one (`<id>@<key>`).
public struct NativeInstance {
	public let id: String
	public let scope: NativeScope
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
	private var eventValue: String?

	/// `params`: the route params the page opened with.
	public init(payload: NativeViewPayload, store: NativeStore = MemoryStore(), params: [NativeRouteParam] = []) {
		self.payload = payload
		self.params = params
		self.store = store
		values = Dictionary(uniqueKeysWithValues: payload.cells.map { cell in
			(cell.id, cell.storageKey.flatMap(store.read) ?? cell.initial)
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
		nodesById = Dictionary(uniqueKeysWithValues: payload.nodes.map { ($0.id, $0) })
	}

	private func read(_ cell: String) throws -> NativeValue {
		guard let value = values[cell] else { throw RuntimeError(reason: "unknown cell \(cell)") }
		return value
	}

	/// The current value of a cell.
	public func value(of cell: String) throws -> NativeValue { try read(cell) }

	public func evaluate(_ expr: NativeExpr, in scope: NativeScope = .empty) throws -> NativeValue {
		let evaluate = { (inner: NativeExpr) throws -> NativeValue in try self.evaluate(inner, in: scope) }
		switch expr {
		case let .cell(cell): return try read(cell)
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
		case .eventValue:
			guard let eventValue else { throw RuntimeError(reason: "the event value read outside an input handler") }
			return .string(eventValue)
		case let .unary(op, inner):
			let value = try evaluate(inner)
			switch op {
			case "!": return .bool(!value.isTruthy)
			case "-": return .number(-value.primitive.number)
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
			case let .object(object): if let found = object.get(property) { return found }
			default: break
			}
			throw RuntimeError(reason: ".\(property) of a value that has none")
		case let .call(builtin, arguments): return evaluateCall(builtin, try arguments.map(evaluate))
		}
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
		return try rows(of: row).map { NativeInstance(id: "\(node.id)@\($0.key)", scope: NativeScope(items: [row: $0.item])) }
	}

	public func text(of parts: [NativeTextPart], in scope: NativeScope = .empty) throws -> String {
		try parts.map { part in
			switch part {
			case let .text(text): return text
			case let .cell(cell): return textOf(try read(cell))
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

	/// Every shown element instance's bound attributes as written: nil absent, "" bare.
	public func attributes() throws -> [(node: String, name: String, value: String?)] {
		try bound(properties: false).map { ($0.node, $0.name, marklessAttributeValue($0.name, $0.value)) }
	}

	/// Every shown input's bound `value`, as `String(value)` with null reading "".
	public func properties() throws -> [(node: String, name: String, value: String)] {
		try bound(properties: true).map { ($0.node, $0.name, $0.value == .null ? "" : $0.value.text) }
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

	/// Every system sheet and whether its `open` is truthy.
	public func sheets() throws -> [(node: String, open: Bool)] {
		try payload.nodes.compactMap { node in
			guard case let .sheet(open, _, _, _) = node.kind else { return nil }
			return (node.id, try evaluate(open).isTruthy)
		}
	}

	/// The page's `<title>` text, nil when it has none.
	public func title() throws -> String? { try payload.title.map { try text(of: $0) } }

	/// The element an action names and the scope it runs in: a row instance (`h6@42`) reads its row's item.
	private func target(_ host: String) throws -> (node: String, scope: NativeScope) {
		guard let at = host.firstIndex(of: "@") else { return (host, .empty) }
		let node = String(host[..<at])
		let key = String(host[host.index(after: at)...])
		guard let repeatId = nodesById[node]?.row, let repeatNode = nodesById[repeatId], try isShown(repeatNode.arm),
			let row = try rows(of: repeatId).first(where: { $0.key == key })
		else { throw RuntimeError(reason: "\(host) is not a shown row instance") }
		var scope = NativeScope()
		scope.items[repeatId] = row.item
		return (node, scope)
	}

	/// Runs the handler bound to the action and returns the journal the host applies.
	public func dispatch(_ action: NativeAction) throws -> [NativeJournalEntry] {
		let (host, scope) = try target(action.host)
		guard let bound = payload.events.first(where: { $0.host == host && $0.event == action.event }) else {
			throw RuntimeError(reason: "no \(action.event.rawValue) handler on \(action.host)")
		}
		eventValue = action.event == .input ? action.value ?? "" : nil
		defer { eventValue = nil }
		return try change(host: action.host) { try self.run(self.handlers[bound.handler] ?? [], in: scope) }
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
	private func run(_ ops: [NativeOp], in scope: NativeScope) throws -> [NativeJournalEntry] {
		var calls: [NativeJournalEntry] = []
		for op in ops {
			switch op {
			case let .navigate(route, params, replace):
				let values = try params.map { param -> NativeRouteParam in
					switch param.value {
					case let .string(text): return NativeRouteParam(name: param.name, value: text)
					case let .expr(expr): return NativeRouteParam(name: param.name, value: try evaluate(expr, in: scope).text)
					}
				}
				return [.navigate(route: route, params: values, replace: replace)]
			case let .assign(cell, expr):
				let value = try evaluate(expr, in: scope)
				values[cell] = value
				if let key = storageKeys[cell] { store.write(key, value) }
			case let .call(call, object, arguments, result, then):
				calls.append(.call(call: call, object: object, arguments: try arguments.map { try evaluate($0, in: scope) }, result: result, resume: then?.id))
			}
		}
		return calls
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
		let beforeAttributes = keyed(try attributes())
		var beforeProperties = keyed(try properties().map { ($0.node, $0.name, Optional($0.value)) })
		if let eventValue, let host { beforeProperties["\(host)\u{0}value"] = eventValue }
		let beforeArms = Dictionary(uniqueKeysWithValues: try arms().map { ($0.node, $0.index) })
		let beforeRows = Dictionary(uniqueKeysWithValues: try rows().map { ($0.node, $0.keys) })
		let beforeTitle = try title()
		let beforeSheets = Dictionary(uniqueKeysWithValues: try sheets().map { ($0.node, $0.open) })
		let ownedBefore = Set(try liveObjects())
		let calls = try apply()
		if case .navigate? = calls.first { return calls }
		let afterTexts = Dictionary(try texts().map { ($0.node, $0.text) }, uniquingKeysWith: { $1 })
		let afterAttributes = keyed(try attributes())
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
				return try instances(of: node).flatMap { instance in
					bindings.compactMap { binding -> NativeJournalEntry? in
						let key = "\(instance.id)\u{0}\(binding.name)"
						let (before, after) = binding.isProperty ? (beforeProperties, afterProperties) : (beforeAttributes, afterAttributes)
						guard let old = before[key], let new = after[key], old != new else { return nil }
						return binding.isProperty ? .property(node: instance.id, name: binding.name, value: new ?? "") : .attribute(node: instance.id, name: binding.name, value: new)
					}
				}
			}
		}
		let owned = Set(try liveObjects())
		let releases = payload.objects.compactMap { object -> NativeJournalEntry? in
			ownedBefore.contains(object.id) && !owned.contains(object.id) ? .release(object: object.id) : nil
		}
		let afterTitle = try title()
		let titles: [NativeJournalEntry] = afterTitle != beforeTitle ? afterTitle.map { [.title(value: $0)] } ?? [] : []
		return styles + entries + titles + releases + calls
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
	public private(set) var screens: [NativeScreen]

	public init(app: NativeAppPayload, path: String, store: NativeStore = MemoryStore()) throws {
		self.app = app
		self.store = store
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
			runtime: NativeRuntime(payload: entry.page, store: store, params: params))
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
