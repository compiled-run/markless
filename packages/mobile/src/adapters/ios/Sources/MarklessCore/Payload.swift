import Foundation

public let nativeViewVersion = "markless.native-view/0"

/// The document body as an element value (`NATIVE_DOCUMENT_BODY` in `@markless/serializer`): no node has this id.
public let nativeDocumentBody = "#body"

/// The overlay behaviour's names, as `packages/web/src/overlay-protocol.ts` spells them.
public enum OverlayProtocol {
	public static let attribute = "overlay"
	public static let modalAttribute = "aria-modal"
	public static let modalValue = "true"
}

/// What an event carries, by the field an `{ event }` expression names.
public enum NativeEventField: String, Sendable {
	case value, reason, pressTarget, key, text, detail
	/// A pointer event's, as a phone's browser reports a touch.
	case target, currentTarget, relatedTarget, button, buttons, clientX, clientY, pointerId, pointerType, isPrimary, timeStamp
}

public enum NativeBuiltin: String, Sendable {
	case string = "String", number = "Number", boolean = "Boolean"
	case abs = "Math.abs", floor = "Math.floor", max = "Math.max", min = "Math.min", round = "Math.round"
	/// The device's clock, in milliseconds since 1970 (UTC).
	case dateNow = "Date.now"
	/// `new Date(ms).toISOString()`.
	case dateISOString = "Date.toISOString"
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
	/// A member read in an optional chain (`a?.b`): null when the object is null, as JavaScript gives undefined.
	case optionalMember(NativeExpr, String)
	/// An array's element at an index computed while the app runs; null when it is not an integer inside the array.
	case at(NativeExpr, of: NativeExpr)
	case array([NativeArrayItem])
	case object([NativeObjectField])
	case method(NativeMethod, target: NativeExpr, arguments: [NativeExpr])
	/// Only as a method argument; its parameters read as `local`.
	case lambda(parameters: [String], body: NativeExpr)
	case local(String)
	/// The current row's item of a list (`repeat` id).
	case item(String)
	case call(NativeBuiltin, [NativeExpr])
	/// A field of the event running the handler: an `input`'s text, a `dismiss`'s reason and press target, a pointer event's fields.
	case event(NativeEventField)
	/// Whether the element `node` has captured the touch `pointer` (`node.hasPointerCapture(pointer)`).
	case captures(node: NativeExpr, pointer: NativeExpr)
	/// The element that has focus, or the document body when none has.
	case focused
	/// Whether `node` is the element `within` or inside it; false unless both are strings.
	case contains(within: NativeExpr, node: NativeExpr)
	/// The element that had focus when the overlay was last shown, or null.
	case focusOrigin(NativeExpr)
	/// Whether the value is an element id or the document body.
	case isElement(NativeExpr)
	/// The page's route params, an object of strings.
	case routeParams
	/// `new FormData(form)`: the form's entries as `[name, value]` string pairs, in tree order.
	case formData(String)
	/// A checkbox's or radio button's checkedness now.
	case checked(String)
	/// A computed whose body runs in the script engine: function `fn` of the payload's script, called with `bindings`.
	case script(fn: String, bindings: [NativeScriptBinding])
	/// A text field's text now: what a person typed since, else its `value` binding, else its `value` attribute.
	case field(String)

	var cells: [String] {
		switch self {
		case let .cell(cell): return [cell]
		case .literal, .event, .focused, .local, .item, .routeParams, .formData, .checked, .field: return []
		case let .unary(_, inner), let .member(inner, _), let .optionalMember(inner, _), let .lambda(_, inner), let .focusOrigin(inner), let .isElement(inner): return inner.cells
		case let .contains(within, node): return within.cells + node.cells
		case let .captures(node, pointer): return node.cells + pointer.cells
		case let .array(items): return items.flatMap(\.value.cells)
		case let .object(fields): return fields.flatMap(\.value.cells)
		case let .method(_, target, arguments): return target.cells + arguments.flatMap(\.cells)
		case let .binary(_, a, b), let .logical(_, a, b), let .at(a, b): return a.cells + b.cells
		case let .conditional(test, whenTrue, whenFalse): return test.cells + whenTrue.cells + whenFalse.cells
		case let .template(parts): return parts.flatMap { if case let .expr(e) = $0 { e.cells } else { [String]() } }
		case let .call(_, arguments): return arguments.flatMap(\.cells)
		case let .script(_, bindings): return bindings.flatMap(\.cells)
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
	/// The attribute's name, or the property (`value`, `checked`, `indeterminate` or an option's `selected`).
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
		/// `key` nil: each row's key is its position (`byIndex`).
		case `repeat`(list: NativeExpr, key: [String]?, keyParts: [NativeKeyPart]? = nil)
		/// The platform's own sheet: its content (the nodes whose parent it is) is built at mount and kept while closed.
		case sheet(open: NativeExpr, snapPoints: [Double], dismissible: Bool, modal: Bool)
	}

	public let id: String
	public let parent: String?
	/// Set when the node belongs to one arm of an `@if`.
	public let arm: NativeArmPlace?
	/// Set when the node belongs to a list row: the `repeat` node's id.
	public let row: String?
	public let kind: Kind
	/// For a `camera` element: the device object it shows.
	public var object: String? = nil
	/// The browser's default look of an element, when it is more than a box of plain text.
	public var defaultStyle: NativeDefaultStyle? = nil
	/// On an `<svg>`: the shapes it draws.
	public var drawing: NativeDrawing? = nil
	/// A live region: a change to the text inside is announced.
	public var live: NativeLive? = nil

	public var isElement: Bool { if case .element = kind { true } else { false } }
	public var isText: Bool { if case .text = kind { true } else { false } }
}

/// How an element looks and flows under the browser's default stylesheet (`NativeDefaultStyle` in the serializer).
public struct NativeDefaultStyle: Equatable, Sendable {
	public enum Flow: String, Sendable { case inline, `break` }
	public var flow: Flow?
	public var bold = false
	public var italic = false
	public var monospace = false
	/// Font size as a multiple of the parent's.
	public var size: Double?
	/// `underline` or `line-through`.
	public var line: String?
	/// `sub` or `super`.
	public var shift: String?
	public var highlight = false
	public var quotes = false
	public var preformatted = false
	/// Start-side inset in CSS px.
	public var indent: Double?
	public var rule = false
	/// `disc` or `decimal`, on a list.
	public var marker: String?
	/// `table`, `row` or `cell`.
	public var table: String?
	public init() {}
}

/// One shape of a drawing, in the drawing's user units.
public struct NativeShape: Equatable, Sendable {
	public enum Paint: Equatable, Sendable {
		case color(RGBA)
		case currentColor
	}
	/// Verb-coded: 0 move x y, 1 line x y, 3 cubic x1 y1 x2 y2 x y, 4 close.
	public let path: [Double]
	public let fill: Paint?
	public let evenOdd: Bool
	public let stroke: Paint?
	public let width: Double
	public let cap: String
	public let join: String
	public let miterLimit: Double
	/// `[a, b, c, d, e, f]`.
	public let transform: [Double]?
}

/// An inline `<svg>` compiled when the app was built.
public struct NativeDrawing: Equatable, Sendable {
	/// min-x, min-y, width, height.
	public let viewBox: [Double]?
	public let width: Double?
	public let height: Double?
	public let shapes: [NativeShape]
	/// `width` and `height` are in ems of the font size of the text the svg sits in, not CSS px.
	public var em = false
}

public enum NativeEventName: String, Sendable {
	case activate
	case input
	/// A text field took the keyboard, or gave it up.
	case focus, blur
	/// A key of the on-screen keyboard in a text field, and a paste from its edit menu, before either edits the text.
	case keydown, paste
	/// The platform closed a system sheet; it is already closed when the handler runs.
	case dismiss
	/// The host's back gesture or Escape on an open `<dialog>`: it closes, as the browser's cancel does.
	case cancel
	/// The keyboard's return key in a single-line text field.
	case enter
	/// A form's, run only by a `submit` op.
	case submit
	/// A range input let go after its value moved: the web's `change` on it.
	case commit
	/// A `timer` journal entry's time has come.
	case timer
	/// The host is idle after the element appeared; once for each shown instance.
	case idle
	/// Some of the element is on the screen; once for each shown instance.
	case visible
	/// A person chose an option (its instance id is the action's host) in its `<select>`'s list; never a payload event.
	case choose
	/// A touch going down, moving, lifting, or taken by the platform for a scroll: the runtime raises the browser's pointer
	/// events from these (`NativeAction.isTouch`).
	case pointerdown, pointermove, pointerup, pointercancel
	/// Raised by the runtime around a touch; a host never sends them.
	case pointerover, pointerout, pointerenter, pointerleave

	/// The pointer events a page's handlers may listen for.
	public var isPointer: Bool {
		switch self {
		case .pointerdown, .pointermove, .pointerup, .pointercancel, .pointerover, .pointerout, .pointerenter, .pointerleave: true
		default: false
		}
	}

	/// What a host reports of a touch.
	public var isTouch: Bool {
		switch self {
		case .pointerdown, .pointermove, .pointerup, .pointercancel: true
		default: false
		}
	}
}

public enum NativeOp: Equatable, Sendable {
	/// The cell takes the expression's value, evaluated before the write.
	case assign(cell: String, value: NativeExpr)
	/// Opens the page at `route` with these params (fixed, or evaluated when the op runs); ops after it do not run.
	/// `replace` takes the current screen's place instead of pushing.
	case navigate(route: String, params: [NativeOpParam], replace: Bool)
	/// A device call (`haptics.tap`), on `object` when it names one; with `result` it settles that task cell, with `then`
	/// the host answers with `resume` and those ops run with the answer as a local.
	case call(call: String, object: String?, arguments: [NativeExpr], result: String?, then: NativeContinuation?)
	/// Runs `then` when `test` is truthy, else `otherwise`; the test is evaluated once, before either.
	indirect case when(test: NativeExpr, then: [NativeOp], otherwise: [NativeOp])
	/// `showModal()` (`open`) or `close()` on a `<dialog>`: the host puts it in its top layer or takes it out.
	case dialog(node: String, open: Bool)
	/// `focus()` or `scrollIntoView()` on an element, run once the views show the handler's writes. `node` is a fixed id
	/// (a string literal) or an expression evaluated when the op runs; null or the body does nothing.
	case command(node: NativeExpr, command: String, preventScroll: Bool)
	/// `node.setPointerCapture(pointer)`, or with `release` `node.releasePointerCapture(pointer)`. `node` is a fixed id (a
	/// string literal) or an expression evaluated when the op runs.
	case capture(node: NativeExpr, pointer: NativeExpr, release: Bool)
	/// Submits `form` as if `submitter` were pressed (nil: the return key with no submit button).
	case submit(form: String, submitter: String?)
	/// After `ms`, `ops` run with each captured name read as a local holding its value when this op ran.
	indirect case after(ms: NativeExpr, capture: [NativeCapture], ops: [NativeOp])
	/// A press on a checkbox (it flips) or radio button (it is checked, the rest of its group unchecked).
	case tick(node: String)
	/// Runs function `fn` of the payload's script with the event (`type`, the web event's) and `bindings`, then writes the
	/// cells it changed. A throw, or a rejection of what it returns, writes `{ name, message }` to `catch` when there is one.
	case script(fn: String, type: String, bindings: [NativeScriptBinding], catch: String?)
	/// `event.preventDefault()` in a text field's `keydown` or `paste` handler.
	case preventDefault
	/// `field.value = text` on a text field: its text becomes the value, with no input event; `node` evaluates to its id.
	case fieldText(node: NativeExpr, value: NativeExpr)
	/// `reset` of `@catch (error, reset)`: clears `catch` and runs again each of `cells` (read where the handler runs) that holds an error.
	case reset(cells: [String], catch: String?)
}

public struct NativeCapture: Equatable, Sendable {
	public let name: String
	public let value: NativeExpr
}

public enum NativeFieldKind: String, Sendable {
	case text, checkbox, radio, hidden, select
}

/// What the web says when a required field has no value, in one language.
public struct NativeValueMissing: Equatable, Sendable {
	public let text: String
	public let checkbox: String
	public let radio: String
}

/// Chromium's message for a text field longer than its `maxlength`, with `{max}` and `{length}` written in `digits`.
public struct NativeTooLong: Equatable, Sendable {
	public let text: String
	public let digits: [Character]

	/// The message for these numbers, as Chromium writes them: no grouping, in the language's digits.
	public func message(max: Int, length: Int) -> String {
		func write(_ value: Int) -> String { String(String(value).map { digits[Int(String($0))!] }) }
		return text.replacingOccurrences(of: "{max}", with: write(max)).replacingOccurrences(of: "{length}", with: write(length))
	}
}

/// Chromium's message for an email field whose value is not an email address, one per reason: `{value}` is the whole value,
/// `{symbol}` the first character not allowed, `{domain}` the part after the `@`.
public struct NativeEmailMismatch: Equatable, Sendable {
	public let noAt, emptyLocal, emptyDomain, invalidLocal, invalidDomain, invalidDots, other: String

	/// An email field's value as the web keeps it: line breaks dropped, then ASCII whitespace trimmed from both ends.
	public static func value(_ typed: String) -> String {
		let whitespace: Set<Unicode.Scalar> = ["\t", "\n", "\u{0C}", "\r", " "]
		var scalars = Array(typed.unicodeScalars.filter { $0 != "\n" && $0 != "\r" })
		while let first = scalars.first, whitespace.contains(first) { scalars.removeFirst() }
		while let last = scalars.last, whitespace.contains(last) { scalars.removeLast() }
		return String(String.UnicodeScalarView(scalars))
	}

	private static func isAlphanumeric(_ s: Unicode.Scalar) -> Bool { s.isASCII && (("a"..."z").contains(s) || ("A"..."Z").contains(s) || ("0"..."9").contains(s)) }
	private static func isLocal(_ s: Unicode.Scalar) -> Bool { isAlphanumeric(s) || ".!#$%&'*+/=?^_`{|}~-".unicodeScalars.contains(s) }
	private static func isLabel(_ label: Substring) -> Bool {
		let s = Array(label.unicodeScalars)
		guard (1...63).contains(s.count), isAlphanumeric(s.first!), isAlphanumeric(s.last!) else { return false }
		return s.allSatisfy { isAlphanumeric($0) || $0 == "-" }
	}

	/// Why `value` (as ``value(_:)`` keeps it) is not an email address, in Chromium's words, or nil when it is one or is empty.
	public func message(for value: String) -> String? {
		if value.isEmpty { return nil }
		let at = value.firstIndex(of: "@")
		let local = at.map { value[..<$0] } ?? Substring(value)
		let domain = at.map { value[value.index(after: $0)...] } ?? ""
		if let at, at != value.startIndex, local.unicodeScalars.allSatisfy(Self.isLocal),
			domain.split(separator: ".", omittingEmptySubsequences: false).allSatisfy(Self.isLabel) { return nil }
		func fill(_ message: String, _ symbol: String = "") -> String {
			var out = ""
			var rest = Substring(message)
			while let open = rest.firstIndex(of: "{") {
				out += rest[..<open]
				let tail = rest[open...]
				if tail.hasPrefix("{value}") { out += value; rest = tail.dropFirst(7) }
				else if tail.hasPrefix("{symbol}") { out += symbol; rest = tail.dropFirst(8) }
				else if tail.hasPrefix("{domain}") { out += domain; rest = tail.dropFirst(8) }
				else { out += "{"; rest = tail.dropFirst() }
			}
			return out + rest
		}
		guard let at else { return fill(noAt) }
		if at == value.startIndex { return fill(emptyLocal) }
		if domain.isEmpty { return fill(emptyDomain) }
		if let bad = local.unicodeScalars.first(where: { !Self.isLocal($0) }) { return fill(invalidLocal, String(bad)) }
		if let bad = domain.unicodeScalars.first(where: { !(Self.isAlphanumeric($0) || $0 == "." || $0 == "-") }) { return fill(invalidDomain, String(bad)) }
		if domain.hasPrefix(".") || domain.hasSuffix(".") || domain.contains("..") { return fill(invalidDots) }
		return fill(other)
	}
}

/// A range input's value as the web keeps it (`nativeRangeValue` in @markless/serializer): `min` 0 and `max` 100 by default
/// (a `max` below `min` is `min`); a value that is not a number is the midpoint; clamped into the range and moved to the
/// nearest step from `min` (the greater of two as near), at or below `max`; written as JavaScript writes the number.
public func nativeRangeValue(_ value: String?, min: String?, max: String?, step: String?) -> String {
	func number(_ text: String?) -> Double? {
		guard let text, text.range(of: #"^-?(\d+(\.\d+)?|\.\d+)([eE][-+]?\d+)?$"#, options: .regularExpression) != nil else { return nil }
		return Double(text)
	}
	func places(_ n: Double) -> Int {
		let written = jsNumber(n)
		let parts = written.components(separatedBy: "e")
		let mantissa = parts[0].components(separatedBy: ".")
		let fraction = mantissa.count > 1 ? mantissa[1].count : 0
		let exponent = parts.count > 1 ? Int(parts[1]) ?? 0 : 0
		return Swift.max(0, fraction - exponent)
	}
	let low = number(min) ?? 0
	let high = Swift.max(low, number(max) ?? 100)
	let any = step?.trimmingCharacters(in: .whitespaces).lowercased() == "any"
	let size: Double? = any ? nil : (number(step).flatMap { $0 > 0 ? $0 : nil } ?? 1)
	var value = Swift.min(high, Swift.max(low, number(value) ?? low + (high - low) / 2))
	if let size {
		let unit = pow(10, Double(Swift.max(places(low), places(size), places(value))))
		func whole(_ n: Double) -> Double { (n * unit).rounded() }
		let stepUnits = whole(size)
		var steps = ((whole(value) - whole(low)) / stepUnits + 0.5).rounded(.down)
		while steps > 0 && whole(low) + steps * stepUnits > whole(high) { steps -= 1 }
		value = (whole(low) + steps * stepUnits) / unit
	}
	return jsNumber(value)
}

/// A number as JavaScript's `String(n)` writes it for the values a range takes: whole numbers without a fraction.
func jsNumber(_ n: Double) -> String {
	if n == n.rounded(), abs(n) < 1e21 { return String(Int64(n)) }
	return "\(n)"
}

/// A `maxlength` attribute's limit, by HTML's rules for parsing non-negative integers; nil (no limit) when it has none.
public func nativeMaxLength(_ attribute: String?) -> Int? {
	guard var rest = attribute?.unicodeScalars[...] else { return nil }
	rest = rest.drop { [" ", "\t", "\n", "\r", "\u{0C}"].contains($0) }
	let negative = rest.first == "-"
	if rest.first == "-" || rest.first == "+" { rest = rest.dropFirst() }
	let digits = rest.prefix { ("0"..."9").contains($0) }
	guard !digits.isEmpty, let value = Int(String(String.UnicodeScalarView(digits))) else { return nil }
	return negative && value != 0 ? nil : value
}

/// The language a browser with these preferred languages shows its own text in, among `available`: an exact match, then
/// without a script subtag (`zh-Hant-TW` as `zh-TW`), then the language alone; else `en`.
public func nativeLocale(_ preferred: [String], _ available: [String]) -> String {
	let byLower = Dictionary(available.map { ($0.lowercased(), $0) }, uniquingKeysWith: { $1 })
	for wanted in preferred {
		let parts = wanted.replacingOccurrences(of: "_", with: "-").lowercased().split(separator: "-", omittingEmptySubsequences: false).map(String.init)
		let language = parts[0]
		let region = parts.dropFirst().first { $0.count != 4 }
		for candidate in [parts.joined(separator: "-"), region.map { "\(language)-\($0)" } ?? language, language] {
			if let found = byLower[candidate] { return found }
		}
	}
	return "en"
}

/// A form's submittable fields and submit buttons, each in tree order.
public struct NativeForm: Equatable, Sendable {
	public struct Field: Equatable, Sendable {
		public let node: String
		public let kind: NativeFieldKind
	}

	public let node: String
	public let fields: [Field]
	public let submitters: [String]
	public let noValidate: Bool
	/// An author wrote `aria-disabled` on one of its submit buttons, so a running submission marks none of them.
	public let authoredAriaDisabled: Bool
}

/// A navigate op's param: a string fixed at build time, or an expression evaluated in the activated element's scope.
public struct NativeOpParam: Equatable, Sendable {
	public enum Value: Equatable, Sendable {
		case string(String)
		case expr(NativeExpr)
	}
	public let name: String
	public let value: Value
}

/// What a handler does after a device call it awaited answers: `ops` with the answer read as `{ local: as }`.
public struct NativeContinuation: Equatable, Sendable {
	public let id: String
	public let `as`: String
	public let ops: [NativeOp]
	/// The cell of the nearest `@catch` around the handler's element: it takes the error when the call fails.
	public var `catch`: String? = nil
}

/// An async value's script function and the names it reads.
public struct NativeAsync: Equatable, Sendable {
	public let script: String
	public let bindings: [NativeScriptBinding]
	/// The `@try` branches that read it: it runs while one of them is shown.
	public let boundaries: [String]
}

/// A device call a task cell starts at mount.
public struct NativeTask: Equatable, Sendable {
	public let call: String
	public let arguments: [NativeExpr]
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
	/// A live device value (`network.online`) the host fills at mount and on every change.
	public var device: String? = nil
	/// For a device object's field (`cam.ready`): the object.
	public var object: String? = nil
	/// An async device call started at mount; the cell holds `{ state: 'pending' | 'value' | 'error', ... }`.
	public var task: NativeTask? = nil
	/// An async value the payload's script computes: the script settles the cell; the host never does.
	public var async: NativeAsync? = nil
	/// State of a component a list row renders: one value per row of this `repeat`, `initial` when the row is built.
	public var row: String? = nil
	/// The clock when the screen opened: written at mount, before the first build.
	public var clock = false
	/// On a row's state: its first value as an expression of the row's item, taken once when the row is built.
	public var first: NativeExpr? = nil
	/// On a row's state: the values the row passes to the part that owns it; when one changes the row's state starts over.
	public var rebuiltBy: [NativeExpr]? = nil
	/// Its first value is `undefined` on the web, which `initial` spells as null: a script reads it so until it is written.
	public var unset = false
	/// Written while rendering from a value that follows state: at mount, and again whenever that value changes.
	public var follows: NativeExpr? = nil
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
	/// The page's `<title>` as text parts: the screen's navigation bar title.
	public var title: [NativeTextPart]? = nil
	/// Device objects the page's components make.
	public var objects: [NativeDeviceObject] = []
	public let forms: [NativeForm]
	/// What the web says when a required field has no value, by locale, in payload order.
	public let valueMissing: [(locale: String, messages: NativeValueMissing)]
	/// What the web says when a text field a person edited is longer than its `maxlength`, by locale, in payload order.
	public var tooLong: [(locale: String, message: NativeTooLong)] = []
	/// What the web says when an email field holds no email address, by locale, in payload order.
	public var typeMismatch: [(locale: String, message: NativeEmailMismatch)] = []

	public static func == (a: NativeViewPayload, b: NativeViewPayload) -> Bool {
		a.component == b.component && a.route == b.route && a.cells == b.cells && a.nodes == b.nodes && a.events == b.events
			&& a.handlers == b.handlers && a.title == b.title && a.objects == b.objects && a.forms == b.forms && a.valueMissing.map(\.locale) == b.valueMissing.map(\.locale)
			&& a.valueMissing.map(\.messages) == b.valueMissing.map(\.messages) && a.tooLong.map(\.locale) == b.tooLong.map(\.locale)
			&& a.tooLong.map(\.message) == b.tooLong.map(\.message) && a.typeMismatch.map(\.locale) == b.typeMismatch.map(\.locale)
			&& a.typeMismatch.map(\.message) == b.typeMismatch.map(\.message) && a.script == b.script
	}
	/// The JavaScript the page's script ops and computeds run; absent when every handler is data.
	public var script: NativeScript? = nil

	public static func decode(_ data: Data) throws -> NativeViewPayload {
		try decode(JSONValue.parse(data))
	}

	public static func decode(_ json: JSONValue) throws -> NativeViewPayload {
		let root = try Reader(json, at: "payload")
		let fields = try root.object(required: ["version", "component", "cells", "nodes", "events", "handlers"], optional: ["route", "title", "objects", "forms", "valueMissing", "tooLong", "typeMismatch", "script"])
		let version = try fields["version"].string()
		guard version == nativeViewVersion else {
			throw PayloadError(path: "payload.version", reason: "unsupported version \"\(version)\", this host reads \(nativeViewVersion)")
		}
		let cells = try fields["cells"].array().map { cell in
			let field = try cell.object(required: ["id", "name", "initial"], optional: ["storage", "styled", "domain", "device", "task", "async", "object", "row", "clock", "first", "rebuiltBy", "unset", "follows"])
			if field.has("clock"), try !field["clock"].bool() {
				throw PayloadError(path: try field["clock"].path, reason: "clock is only ever true")
			}
			if field.has("unset"), try !field["unset"].bool() {
				throw PayloadError(path: try field["unset"].path, reason: "unset is only ever true")
			}
			let initial = NativeValue(json: try field["initial"].value)
			// The style export carries each state's domain; the payload's copy is Dragon's input, checked here and not kept.
			if field.has("domain") { _ = try field["domain"].array().map { try $0.string() } }
			var styled = false
			if field.has("styled") {
				guard try field["styled"].bool() else { throw PayloadError(path: try field["styled"].path, reason: "styled is only ever true") }
				styled = true
			}
			return NativeCell(
				id: try field["id"].string(), name: try field["name"].string(), initial: initial,
				storageKey: field.has("storage") ? try field["storage"].object(["key"])["key"].string() : nil, styled: styled,
				device: field.has("device") ? try field["device"].string() : nil,
				object: field.has("object") ? try field["object"].string() : nil,
				task: field.has("task") ? try {
					let task = try field["task"].object(["call", "arguments"])
					return NativeTask(call: try task["call"].string(), arguments: try task["arguments"].array().map(decodeExpr))
				}() : nil,
				async: field.has("async") ? try {
					let async = try field["async"].object(["script", "bindings", "boundaries"])
					return NativeAsync(script: try async["script"].string(), bindings: try decodeBindings(try async["bindings"]),
						boundaries: try async["boundaries"].array().map { try $0.string() })
				}() : nil,
				row: field.has("row") ? try field["row"].string() : nil,
				clock: field.has("clock"),
				first: field.has("first") ? try decodeExpr(try field["first"]) : nil,
				rebuiltBy: field.has("rebuiltBy") ? try field["rebuiltBy"].array().map(decodeExpr) : nil,
				unset: field.has("unset"),
				follows: field.has("follows") ? try decodeExpr(try field["follows"]) : nil)
		}
		let nodes = try fields["nodes"].array().map { node -> NativeNode in
			let kind = try node.field("kind").string()
			let place = ["arm", "row"]
			switch kind {
			case "element":
				let field = try node.object(required: ["kind", "id", "element", "parent"], optional: ["attributes", "bindings", "object", "defaultStyle", "drawing", "live"] + place)
				var attributes: [String: String] = [:]
				if field.has("attributes") {
					let reader = try field["attributes"]
					for key in try reader.keys() { attributes[key] = try reader.field(key).string() }
				}
				let bindings: [NativeBinding] = field.has("bindings") ? try field["bindings"].array().map { binding -> NativeBinding in
					if try binding.keys().contains("property") {
						let b = try binding.object(["property", "value"])
						let property = try b["property"].string()
						guard ["value", "checked", "indeterminate", "selected"].contains(property) else { throw PayloadError(path: binding.path, reason: "unknown property \"\(property)\"") }
						return NativeBinding(name: property, isProperty: true, value: try decodeExpr(try b["value"]))
					}
					let b = try binding.object(["attribute", "value"])
					return NativeBinding(name: try b["attribute"].string(), isProperty: false, value: try decodeExpr(try b["value"]))
				} : []
				return NativeNode(
					id: try field["id"].string(), parent: try field["parent"].optionalString(), arm: try decodeArm(field),
					row: try decodeRow(field), kind: .element(element: try field["element"].string(), attributes: attributes, bindings: bindings),
					object: field.has("object") ? try field["object"].string() : nil,
					defaultStyle: field.has("defaultStyle") ? try decodeDefaultStyle(try field["defaultStyle"]) : nil,
					drawing: field.has("drawing") ? try decodeDrawing(try field["drawing"]) : nil,
					live: field.has("live") ? try decodeLive(try field["live"]) : nil)
			case "text":
				let field = try node.object(required: ["kind", "id", "parent", "parts"], optional: place)
				let parts = try decodeParts(try field["parts"])
				return NativeNode(
					id: try field["id"].string(), parent: try field["parent"].optionalString(), arm: try decodeArm(field), row: try decodeRow(field),
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
				let field = try node.object(required: ["kind", "id", "parent", "list", "key"], optional: place + ["byIndex", "keyParts"])
				let key = try field["key"].array().map { try $0.string() }
				let byIndex = field.has("byIndex") ? try field["byIndex"].bool() : false
				if byIndex && !key.isEmpty { throw try field["key"].fail("a list keyed by its index has no key path") }
				return NativeNode(
					id: try field["id"].string(), parent: try field["parent"].optionalString(), arm: try decodeArm(field),
					row: try decodeRow(field),
					kind: .repeat(list: try decodeExpr(try field["list"]), key: byIndex ? nil : key,
						keyParts: try field.has("keyParts") ? decodeKeyParts(field["keyParts"]) : nil))
			case "sheet":
				let field = try node.object(["kind", "id", "parent", "open", "snapPoints", "dismissible", "modal"])
				let snapPoints = try field["snapPoints"].array().map { try $0.number() }
				let valid = switch snapPoints.count {
				case 1: snapPoints[0] == 1
				case 2: snapPoints[0] > 0 && snapPoints[0] < 1 && snapPoints[1] == 1
				default: false
				}
				guard valid else { throw PayloadError(path: node.path + ".snapPoints", reason: "a sheet rests at [1] or [x, 1] with 0 < x < 1") }
				return NativeNode(
					id: try field["id"].string(), parent: try field["parent"].optionalString(), arm: nil, row: nil,
					kind: .sheet(
						open: try decodeExpr(try field["open"]), snapPoints: snapPoints, dismissible: try field["dismissible"].bool(),
						modal: try field["modal"].bool()))
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
			let ops = try field["ops"].array().map(decodeOp)
			return NativeHandler(id: try field["id"].string(), ops: ops)
		}
		let objects = fields.has("objects") ? try fields["objects"].array().map { object -> NativeDeviceObject in
			let f = try object.object(["id", "device", "owner"])
			return NativeDeviceObject(id: try f["id"].string(), device: try f["device"].string(), owner: try f["owner"].string())
		} : []
		func decodeOp(_ op: Reader) throws -> NativeOp {
				let name = try op.field("op").string()
				switch name {
				case "assign":
					let opField = try op.object(["op", "cell", "value"])
					return .assign(cell: try opField["cell"].string(), value: try decodeExpr(try opField["value"]))
				case "navigate":
					let opField = try op.object(required: ["op", "route", "params"], optional: ["replace"])
					let params = try opField["params"]
					return .navigate(
						route: try opField["route"].string(),
						params: try params.keys().map { name in
							let value = try params.field(name)
							return NativeOpParam(name: name, value: value.isString ? .string(try value.string()) : .expr(try decodeExpr(value)))
						},
						replace: try decodeReplace(opField))
				case "call":
					let opField = try op.object(required: ["op", "call", "arguments"], optional: ["result", "object", "after"])
					let then: NativeContinuation? = opField.has("after") ? try {
						let t = try opField["after"].object(required: ["id", "as", "ops"], optional: ["catch"])
						return NativeContinuation(
							id: try t["id"].string(), as: try t["as"].string(), ops: try t["ops"].array().map(decodeOp),
							catch: t.has("catch") ? try t["catch"].string() : nil)
					}() : nil
					return .call(
						call: try opField["call"].string(), object: opField.has("object") ? try opField["object"].string() : nil,
						arguments: try opField["arguments"].array().map(decodeExpr),
						result: opField.has("result") ? try opField["result"].string() : nil, then: then)
				case "dialog":
					let opField = try op.object(["op", "node", "method"])
					let method = try opField["method"].string()
					guard method == "showModal" || method == "close" else {
						throw PayloadError(path: op.path + ".method", reason: "unknown dialog method \"\(method)\"")
					}
					return .dialog(node: try opField["node"].string(), open: method == "showModal")
				case "fieldText":
					let opField = try op.object(["op", "node", "value"])
					let node = try opField["node"]
					let target: NativeExpr = if let fixed = try? node.string() { .literal(.string(fixed)) } else { try decodeExpr(node) }
					return .fieldText(node: target, value: try decodeExpr(try opField["value"]))
				case "preventDefault":
					_ = try op.object(["op"])
					return .preventDefault
				case "command":
					let keys = Set(try op.keys())
					let opField = try op.object(required: ["op", "node", "command"], optional: ["preventScroll"])
					let command = try opField["command"].string()
					guard ["focus", "scrollIntoView", "select"].contains(command) else {
						throw PayloadError(path: op.path + ".command", reason: "unknown command \"\(command)\"")
					}
					let preventScroll = keys.contains("preventScroll") ? try opField["preventScroll"].bool() : false
					let node = try opField["node"]
					let target: NativeExpr = if let fixed = try? node.string() { .literal(.string(fixed)) } else { try decodeExpr(node) }
					return .command(node: target, command: command, preventScroll: preventScroll)
				case "capture":
					let opField = try op.object(required: ["op", "node", "pointer"], optional: ["release"])
					let release: Bool = opField.has("release") ? try {
						guard try opField["release"].bool() else { throw PayloadError(path: try opField["release"].path, reason: "release is only ever true") }
						return true
					}() : false
					let node = try opField["node"]
					let target: NativeExpr = node.isString ? .literal(.string(try node.string())) : try decodeExpr(node)
					return .capture(node: target, pointer: try decodeExpr(try opField["pointer"]), release: release)
				case "submit":
					let opField = try op.object(["op", "form", "submitter"])
					return .submit(form: try opField["form"].string(), submitter: try opField["submitter"].optionalString())
				case "tick":
					return .tick(node: try op.object(["op", "node"])["node"].string())
				case "after":
					let opField = try op.object(["op", "ms", "capture", "ops"])
					let capture = try opField["capture"].array().map { pair -> NativeCapture in
						let items = try pair.array()
						guard items.count == 2 else { throw PayloadError(path: pair.path, reason: "a capture is [name, expression]") }
						return NativeCapture(name: try items[0].string(), value: try decodeExpr(items[1]))
					}
					return .after(ms: try decodeExpr(try opField["ms"]), capture: capture, ops: try opField["ops"].array().map(decodeOp))
				case "script":
					let opField = try op.object(required: ["op", "fn", "type", "bindings"], optional: ["catch"])
					return .script(
						fn: try opField["fn"].string(), type: try opField["type"].string(), bindings: try decodeBindings(try opField["bindings"]),
						catch: opField.has("catch") ? try opField["catch"].string() : nil)
				case "reset":
					let opField = try op.object(required: ["op", "cells"], optional: ["catch"])
					return .reset(
						cells: try opField["cells"].array().map { try $0.string() },
						catch: opField.has("catch") ? try opField["catch"].string() : nil)
				case "if":
					let opField = try op.object(["op", "test", "whenTrue", "whenFalse"])
					return .when(
						test: try decodeExpr(try opField["test"]),
						then: try opField["whenTrue"].array().map(decodeOp),
						otherwise: try opField["whenFalse"].array().map(decodeOp))
				default:
					throw PayloadError(path: op.path + ".op", reason: "unknown op \"\(name)\"")
				}
		}
		let forms: [NativeForm] = fields.has("forms") ? try fields["forms"].array().map { form in
			let field = try form.object(required: ["node", "fields", "submitters"], optional: ["noValidate", "authoredAriaDisabled"])
			let flag = { (key: String) throws -> Bool in
				guard field.has(key) else { return false }
				guard try field[key].bool() else { throw PayloadError(path: try field[key].path, reason: "\(key) is only ever true") }
				return true
			}
			return NativeForm(
				node: try field["node"].string(),
				fields: try field["fields"].array().map { entry in
					let f = try entry.object(["node", "kind"])
					let kind = try f["kind"].string()
					guard let fieldKind = NativeFieldKind(rawValue: kind) else {
						throw PayloadError(path: try f["kind"].path, reason: "unknown field kind \"\(kind)\"")
					}
					return NativeForm.Field(node: try f["node"].string(), kind: fieldKind)
				},
				submitters: try field["submitters"].array().map { try $0.string() },
				noValidate: try flag("noValidate"), authoredAriaDisabled: try flag("authoredAriaDisabled"))
		} : []
		let valueMissing: [(locale: String, messages: NativeValueMissing)] = fields.has("valueMissing") ? try {
			let reader = try fields["valueMissing"]
			return try reader.keys().map { locale in
				let m = try reader.field(locale).object(["text", "checkbox", "radio"])
				return (locale, NativeValueMissing(text: try m["text"].string(), checkbox: try m["checkbox"].string(), radio: try m["radio"].string()))
			}
		}() : []
		let tooLong: [(locale: String, message: NativeTooLong)] = fields.has("tooLong") ? try {
			let reader = try fields["tooLong"]
			return try reader.keys().map { locale in
				let m = try reader.field(locale).object(required: ["text"], optional: ["digits"])
				let digits = m.has("digits") ? Array(try m["digits"].string()) : Array("0123456789")
				guard digits.count == 10 else { throw PayloadError(path: "payload.tooLong.\(locale).digits", reason: "not ten digits") }
				return (locale, NativeTooLong(text: try m["text"].string(), digits: digits))
			}
		}() : []
		let typeMismatch: [(locale: String, message: NativeEmailMismatch)] = fields.has("typeMismatch") ? try {
			let reader = try fields["typeMismatch"]
			return try reader.keys().map { locale in
				let m = try reader.field(locale).object(["noAt", "emptyLocal", "emptyDomain", "invalidLocal", "invalidDomain", "invalidDots", "other"])
				return (locale, NativeEmailMismatch(
					noAt: try m["noAt"].string(), emptyLocal: try m["emptyLocal"].string(), emptyDomain: try m["emptyDomain"].string(),
					invalidLocal: try m["invalidLocal"].string(), invalidDomain: try m["invalidDomain"].string(),
					invalidDots: try m["invalidDots"].string(), other: try m["other"].string()))
			}
		}() : []
		let route: NativeRoute? = fields.has("route") ? try {
			let r = try fields["route"].object(["pattern", "params"])
			return NativeRoute(pattern: try r["pattern"].string(), params: try r["params"].array().map { try $0.string() })
		}() : nil
		let payload = NativeViewPayload(
			component: try fields["component"].string(), route: route, cells: cells, nodes: nodes, events: events, handlers: handlers,
			title: fields.has("title") ? try decodeParts(try fields["title"]) : nil,
			objects: objects, forms: forms, valueMissing: valueMissing, tooLong: tooLong, typeMismatch: typeMismatch,
			script: fields.has("script") ? try decodeScript(try fields["script"]) : nil)
		try payload.check()
		return payload
	}

	private static func decodeDefaultStyle(_ reader: Reader) throws -> NativeDefaultStyle {
		let field = try reader.object(required: [], optional: [
			"flow", "bold", "italic", "monospace", "size", "line", "shift", "highlight", "quotes", "preformatted", "indent", "rule",
			"marker", "table",
		])
		func oneOf(_ key: String, _ allowed: [String]) throws -> String? {
			guard field.has(key) else { return nil }
			let value = try field[key].string()
			guard allowed.contains(value) else { throw PayloadError(path: "\(reader.path).\(key)", reason: "unknown value \"\(value)\"") }
			return value
		}
		func flag(_ key: String) throws -> Bool { field.has(key) ? try field[key].bool() : false }
		var style = NativeDefaultStyle()
		style.flow = try oneOf("flow", ["inline", "break"]).flatMap(NativeDefaultStyle.Flow.init(rawValue:))
		style.bold = try flag("bold")
		style.italic = try flag("italic")
		style.monospace = try flag("monospace")
		style.size = field.has("size") ? try field["size"].number() : nil
		style.line = try oneOf("line", ["underline", "line-through"])
		style.shift = try oneOf("shift", ["sub", "super"])
		style.highlight = try flag("highlight")
		style.quotes = try flag("quotes")
		style.preformatted = try flag("preformatted")
		style.indent = field.has("indent") ? try field["indent"].number() : nil
		style.rule = try flag("rule")
		style.marker = try oneOf("marker", ["disc", "decimal"])
		style.table = try oneOf("table", ["table", "row", "cell"])
		return style
	}

	private static func decodeLive(_ reader: Reader) throws -> NativeLive {
		let live = try reader.object(["politeness", "atomic"])
		let politeness = try live["politeness"].string()
		guard ["polite", "assertive"].contains(politeness) else { throw PayloadError(path: reader.path, reason: "unknown politeness \"\(politeness)\"") }
		return NativeLive(assertive: politeness == "assertive", atomic: try live["atomic"].bool())
	}

	private static func decodeDrawing(_ reader: Reader) throws -> NativeDrawing {
		let field = try reader.object(required: ["viewBox", "shapes"], optional: ["width", "height", "em"])
		let viewBox = try field["viewBox"].isNull ? nil : try field["viewBox"].array().map { try $0.number() }
		if let viewBox, viewBox.count != 4 { throw PayloadError(path: "\(reader.path).viewBox", reason: "expected four numbers") }
		func paint(_ reader: Reader) throws -> NativeShape.Paint? {
			if reader.isNull { return nil }
			if reader.isString {
				guard try reader.string() == "currentColor" else { throw reader.fail("unknown paint") }
				return .currentColor
			}
			let color = try reader.object(["r", "g", "b", "alpha"])
			return .color(RGBA(r: try color["r"].number(), g: try color["g"].number(), b: try color["b"].number(), alpha: try color["alpha"].number()))
		}
		let shapes = try field["shapes"].array().map { shape -> NativeShape in
			let s = try shape.object(required: ["path", "fill", "fillRule", "stroke", "width", "cap", "join", "miterLimit"], optional: ["transform"])
			let transform = s.has("transform") ? try s["transform"].array().map { try $0.number() } : nil
			if let transform, transform.count != 6 { throw shape.fail("a transform has six numbers") }
			let rule = try s["fillRule"].string()
			guard rule == "nonzero" || rule == "evenodd" else { throw shape.fail("unknown fillRule \(rule)") }
			return NativeShape(
				path: try s["path"].array().map { try $0.number() }, fill: try paint(try s["fill"]), evenOdd: rule == "evenodd",
				stroke: try paint(try s["stroke"]), width: try s["width"].number(), cap: try s["cap"].string(), join: try s["join"].string(),
				miterLimit: try s["miterLimit"].number(), transform: transform)
		}
		return NativeDrawing(
			viewBox: viewBox, width: field.has("width") ? try field["width"].number() : nil,
			height: field.has("height") ? try field["height"].number() : nil, shapes: shapes,
			em: field.has("em") ? try field["em"].bool() : false)
	}

	private static func decodeScript(_ reader: Reader) throws -> NativeScript {
		let fields = try reader.object(["id", "source", "services"])
		return NativeScript(
			id: try fields["id"].string(), source: try fields["source"].string(),
			services: try fields["services"].array().map { service in
				let name = try service.string()
				guard let known = NativeScriptService(rawValue: name) else { throw service.fail("unknown script service \"\(name)\"") }
				return known
			})
	}

	private static func decodeBindings(_ reader: Reader) throws -> [NativeScriptBinding] {
		try reader.keys().map { name in
			let binding = try reader.field(name)
			switch try binding.keys() {
			case ["cell"]: return NativeScriptBinding(name: name, kind: .cell(try binding.field("cell").string()))
			case ["fields"]:
				let fields = try binding.field("fields")
				return NativeScriptBinding(name: name, kind: .fields(try fields.keys().map { NativeScriptField(name: $0, cell: try fields.field($0).string()) }))
			case ["value"]: return NativeScriptBinding(name: name, kind: .value(try decodeExpr(try binding.field("value"))))
			case ["elements"]: return NativeScriptBinding(name: name, kind: .elements(try decodeExpr(try binding.field("elements"))))
			case ["object"]: return NativeScriptBinding(name: name, kind: .object(try decodeBindings(try binding.field("object"))))
			case ["shared"]: return NativeScriptBinding(name: name, kind: .shared(try decodeBindings(try binding.field("shared"))))
			case ["bindings", "method"], ["method", "bindings"]:
				return NativeScriptBinding(name: name, kind: .method(try binding.field("method").string(), try decodeBindings(try binding.field("bindings"))))
			default: throw binding.fail("a script binding is { cell }, { fields }, { value }, { elements }, { object }, { shared } or { method, bindings }")
			}
		}
	}

	private static func decodeParts(_ reader: Reader) throws -> [NativeTextPart] {
		try reader.array().map { part -> NativeTextPart in
			let keys = try part.keys()
			if keys == ["text"] { return .text(try part.field("text").string()) }
			if keys == ["cell"] { return .cell(try part.field("cell").string()) }
			if keys == ["expr"] { return .expr(try decodeExpr(try part.field("expr"))) }
			throw PayloadError(path: part.path, reason: "unknown text part with keys \(keys)")
		}
	}

	static func decodeReplace(_ fields: Fields) throws -> Bool {
		guard fields.has("replace") else { return false }
		guard try fields["replace"].bool() else { throw PayloadError(path: try fields["replace"].path, reason: "replace is only ever true") }
		return true
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
			guard let read = NativeEventField(rawValue: name) else { throw PayloadError(path: reader.path + ".event", reason: "unknown event read \"\(name)\"") }
			return .event(read)
		case ["focused"]:
			guard try field("focused").bool() else { throw PayloadError(path: reader.path + ".focused", reason: "focused is only ever true") }
			return .focused
		case ["contains", "node"]: return .contains(within: try decodeExpr(try field("contains")), node: try decodeExpr(try field("node")))
		case ["captures", "pointer"]: return .captures(node: try decodeExpr(try field("captures")), pointer: try decodeExpr(try field("pointer")))
		case ["focusOrigin"]: return .focusOrigin(try decodeExpr(try field("focusOrigin")))
		case ["isElement"]: return .isElement(try decodeExpr(try field("isElement")))
		case ["literal"]: return .literal(try field("literal").scalar())
		case ["unary", "value"]: return .unary(try oneOf("unary", ["!", "-", "+", "typeof"]), try decodeExpr(try field("value")))
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
		case ["member", "optional", "property"]:
			guard try field("optional").bool() else { throw PayloadError(path: reader.path + ".optional", reason: "optional is only ever true") }
			return .optionalMember(try decodeExpr(try field("member")), try field("property").string())
		case ["at", "of"]: return .at(try decodeExpr(try field("at")), of: try decodeExpr(try field("of")))
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
		case ["formData"]: return .formData(try field("formData").string())
		case ["checked"]: return .checked(try field("checked").string())
		case ["bindings", "script"]: return .script(fn: try field("script").string(), bindings: try decodeBindings(try field("bindings")))
		case ["field"]: return .field(try field("field").string())
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
		var sheets = Set<String>()
		let overlays = Set(nodes.compactMap { node -> String? in
			if case let .element(_, attributes, _) = node.kind, attributes[OverlayProtocol.attribute] != nil { return node.id }
			return nil
		})
		var seen = Set<String>()
		func checkCells(_ node: NativeNode, _ expressions: [NativeExpr]) throws {
			for cell in expressions.flatMap(\.cells) where !cellIds.contains(cell) {
				throw PayloadError(path: "payload.nodes", reason: "\(node.id) reads unknown cell \(cell)")
			}
		}
		for node in nodes {
			guard seen.insert(node.id).inserted else { throw PayloadError(path: "payload.nodes", reason: "duplicate node \(node.id)") }
			if let parent = node.parent, !elements.contains(parent), !sheets.contains(parent) {
				throw PayloadError(path: "payload.nodes", reason: "\(node.id)'s parent \(parent) is not an earlier element or sheet")
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
			case let .repeat(list, _, _):
				repeats.insert(node.id)
				try checkCells(node, [list])
			case let .sheet(open, _, _, _):
				sheets.insert(node.id)
				try checkCells(node, [open])
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
			for case let .call(_, _, arguments, result, _) in handler.ops
			where !arguments.flatMap(\.cells).allSatisfy(cellIds.contains) || !(result.map { id in cells.contains { $0.id == id && $0.task != nil } } ?? true) {
				throw PayloadError(path: "payload.handlers", reason: "\(handler.id) calls the device with an unknown cell or a result cell that is not a task")
			}
			for case let .script(_, _, bindings, catchCell) in handler.ops where !(bindings.flatMap(\.cells) + (catchCell.map { [$0] } ?? [])).allSatisfy(cellIds.contains) {
				throw PayloadError(path: "payload.handlers", reason: "\(handler.id) runs a script with an unknown cell")
			}
		}
		for cell in cells {
			if let async = cell.async, !async.bindings.flatMap(\.cells).allSatisfy(cellIds.contains) {
				throw PayloadError(path: "payload.cells", reason: "\(cell.id) computes an async value with an unknown cell")
			}
			if let row = cell.row, !repeats.contains(row) {
				throw PayloadError(path: "payload.cells", reason: "\(cell.id) is state of rows of \(row), which is not a list")
			}
		}
		for form in forms {
			for node in [form.node] + form.fields.map(\.node) + form.submitters where !elements.contains(node) {
				throw PayloadError(path: "payload.forms", reason: "form \(form.node) names unknown element \(node)")
			}
		}
		for event in events {
			guard (event.event == .dismiss ? sheets.union(overlays) : elements).contains(event.host) else {
				throw PayloadError(path: "payload.events", reason: "\(event.event.rawValue) event on \(event.host), which is not \(event.event == .dismiss ? "a sheet or an element marked overlay" : "an element")")
			}
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
	var isString: Bool { if case .string = value { return true } else { return false } }

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

public let nativeAppVersion = "markless.native-app/0"

/// A decoded `markless.native-app/0` payload: each route's page, in the router's match order.
public struct NativeAppPayload: Equatable, Sendable {
	public struct Route: Equatable, Sendable {
		public let pattern: String
		public let params: [String]
		public let page: NativeViewPayload
	}
	public let routes: [Route]

	public static func decode(_ data: Data) throws -> NativeAppPayload { try decode(JSONValue.parse(data)) }

	public static func decode(_ json: JSONValue) throws -> NativeAppPayload {
		let fields = try Reader(json, at: "app").object(["version", "routes"])
		let version = try fields["version"].string()
		guard version == nativeAppVersion else {
			throw PayloadError(path: "app.version", reason: "unsupported version \"\(version)\", this host reads \(nativeAppVersion)")
		}
		return NativeAppPayload(routes: try fields["routes"].array().map { route in
			let field = try route.object(["pattern", "params", "page"])
			let page = try NativeViewPayload.decode(try field["page"].value)
			let pattern = try field["pattern"].string()
			guard page.route?.pattern == pattern else { throw PayloadError(path: route.path, reason: "the page's route is not \(pattern)") }
			return Route(pattern: pattern, params: try field["params"].array().map { try $0.string() }, page: page)
		})
	}

	/// The route a path opens: the first in payload order whose segments match (a `[name]` segment takes one, URL-decoded).
	public func match(_ path: String) -> (route: Route, params: [NativeRouteParam])? {
		for route in routes {
			if let params = NativeRoute(pattern: route.pattern, params: route.params).match(path) { return (route, params) }
		}
		return nil
	}

	/// The stack an app opens with at `path`: every leading part of the path that is a route, shortest first.
	public func backStack(_ path: String) throws -> [String] {
		let segments = path.split(separator: "/", omittingEmptySubsequences: true)
		let stack = (0...segments.count).map { "/" + segments.prefix($0).joined(separator: "/") }.filter { match($0) != nil }
		guard stack.last == "/" + segments.joined(separator: "/") else { throw PayloadError(path: "app", reason: "\(path) is not a route of this app") }
		return stack
	}

	/// The path a pattern names with these params, each URL-encoded as `encodeURIComponent` does.
	public static func path(_ pattern: String, _ params: [NativeRouteParam]) throws -> String {
		let allowed = CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.!~*'()")
		return "/" + (try pattern.split(separator: "/", omittingEmptySubsequences: true).map { part -> String in
			guard part.hasPrefix("["), part.hasSuffix("]") else { return String(part) }
			let name = String(part.dropFirst().dropLast())
			guard let value = params.first(where: { $0.name == name })?.value else {
				throw PayloadError(path: "app", reason: "\(pattern) needs the param \(name)")
			}
			return value.addingPercentEncoding(withAllowedCharacters: allowed) ?? value
		}).joined(separator: "/")
	}
}

/// What a shell was given: one page, or an app of several routes.
public enum NativePayload: Sendable {
	case page(NativeViewPayload)
	case app(NativeAppPayload)

	public static func decode(_ data: Data) throws -> NativePayload {
		let json = try JSONValue.parse(data)
		let version = try Reader(json, at: "payload").field("version").string()
		return version == nativeAppVersion ? .app(try NativeAppPayload.decode(json)) : .page(try NativeViewPayload.decode(json))
	}
}

/// A device object a component makes (`const cam = camera()`), by its payload id. It lives while `owner` is shown.
public struct NativeDeviceObject: Equatable, Sendable {
	public let id: String
	public let device: String
	/// The first node of the component instance that made it.
	public let owner: String
}

/// A live region: an assertive one interrupts the screen reader; an atomic one is read whole.
public struct NativeLive: Sendable, Equatable {
	public let assertive: Bool
	public let atomic: Bool
}

/// One piece of a key joined from a row's fields: fixed text, or the value at a path on the item, as a template literal writes it.
public enum NativeKeyPart: Equatable, Sendable {
	case text(String)
	case path([String])
}

func decodeKeyParts(_ reader: Reader) throws -> [NativeKeyPart] {
	try reader.array().map { part in
		if case .string = part.value { return .text(try part.string()) }
		return .path(try part.array().map { try $0.string() })
	}
}
