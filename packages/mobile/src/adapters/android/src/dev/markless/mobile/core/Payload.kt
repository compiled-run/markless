package dev.markless.mobile.core

const val NATIVE_VIEW_VERSION = "markless.native-view/0"

/** The element id that stands for the document body, which no node has. */
const val NATIVE_DOCUMENT_BODY = "#body"

/** A JavaScript value a cell or expression holds; arrays and objects compare by identity, as `===` does. */
sealed interface JsValue {
	data object Null : JsValue
	data class Num(val value: Double) : JsValue
	data class Str(val value: String) : JsValue
	data class Bool(val value: Boolean) : JsValue
	class Arr(val items: MutableList<JsValue>) : JsValue {
		override fun toString() = "Arr$items"
	}
	class Obj(val fields: LinkedHashMap<String, JsValue>) : JsValue {
		override fun toString() = "Obj$fields"
	}

	companion object {
		/** A JSON value as JavaScript holds it after `JSON.parse`. */
		fun fromJson(j: Json): JsValue = when (j) {
			Json.Null -> Null
			is Json.Num -> Num(j.value)
			is Json.Str -> Str(j.value)
			is Json.Bool -> Bool(j.value)
			is Json.Arr -> Arr(j.items.mapTo(ArrayList(), ::fromJson))
			is Json.Obj -> Obj(j.fields.entries.associateTo(LinkedHashMap()) { it.key to fromJson(it.value) })
		}
	}
}

/** A value computed from cells with ECMAScript's meaning (see [Js]). */
sealed interface Expr {
	data class CellRef(val cell: String) : Expr
	data class Literal(val value: JsValue) : Expr
	data class Unary(val op: String, val value: Expr) : Expr
	data class Binary(val op: String, val left: Expr, val right: Expr) : Expr
	data class Logical(val op: String, val left: Expr, val right: Expr) : Expr
	data class If(val test: Expr, val whenTrue: Expr, val whenFalse: Expr) : Expr
	/** Each part is a literal string or an expression read with `String(value)`. */
	data class Template(val parts: List<Any>) : Expr
	/** `length` of a string or array, or an own property of an object. */
	data class Member(val value: Expr, val property: String) : Expr
	/** An array's element at an index computed while the app runs; null when it is not an integer inside the array. */
	data class At(val index: Expr, val list: Expr) : Expr
	/** Each item, spread when [spread] (its value must be an array). */
	data class ArrayLit(val items: List<Pair<Boolean, Expr>>) : Expr
	data class ObjectLit(val entries: List<Pair<String, Expr>>) : Expr
	data class Method(val name: String, val target: Expr, val arguments: List<Expr>) : Expr
	/** An arrow function; only a method argument. */
	data class Lambda(val params: List<String>, val body: Expr) : Expr
	data class Local(val name: String) : Expr
	/** The current row's item of a list. */
	data class Item(val repeat: String) : Expr
	data class Call(val name: String, val arguments: List<Expr>) : Expr
	/** A field of the event running the handler: an input's `value`, a dismissal's `reason` and `pressTarget`, or a pointer field. */
	data class Event(val field: String) : Expr
	/** Whether the element [node] has captured the touch [pointer] (`hasPointerCapture`). */
	data class Captures(val node: Expr, val pointer: Expr) : Expr
	/** The focused element's id, or [NATIVE_DOCUMENT_BODY] when none has focus. */
	data object Focused : Expr
	/** Whether the element [node] is [within] or inside it. */
	data class Contains(val within: Expr, val node: Expr) : Expr
	/** The element that had focus when the overlay [overlay] was last shown, or null. */
	data class FocusOrigin(val overlay: Expr) : Expr
	data class IsElement(val value: Expr) : Expr
	/** The page's route params, an object of strings. */
	data object RouteParams : Expr
	/** `new FormData(form)`: the form's entries as `[name, value]` string pairs, in tree order. */
	data class FormData(val form: String) : Expr
	/** A checkbox's or radio button's checkedness now. */
	data class Checked(val node: String) : Expr
	/** A computed whose body runs in the script engine: function [fn] of the payload's script, called with [bindings]. */
	data class Script(val fn: String, val bindings: Map<String, ScriptBinding>) : Expr
}

/** What a name of a script function means where it runs: a cell it reads and writes, a state object (one cell per field), or a value it only reads. */
sealed interface ScriptBinding {
	data class Cell(val cell: String) : ScriptBinding
	data class Fields(val fields: Map<String, String>) : ScriptBinding
	data class Value(val value: Expr) : ScriptBinding
}

/** The JavaScript a payload's script ops and script computeds run, kept in the engine under [id]; [services] are the host services it uses. */
data class ScriptSource(val id: String, val source: String, val services: List<String>)

sealed interface TextPart {
	data class Literal(val text: String) : TextPart
	data class Value(val expr: Expr) : TextPart
}

data class ArmPlace(val branch: String, val index: Int)

/** An attribute that follows state, or (when [property]) an input's `value`, `checked` or `indeterminate`, or an option's `selected`. */
data class Binding(val name: String, val value: Expr, val property: Boolean = false)

sealed interface Node {
	val id: String
	val parent: String?
	val arm: ArmPlace?
	/** The `repeat` node whose rows this node is part of. */
	val row: String?

	/** [obj]: the device object a `camera` element shows. */
	data class Element(override val id: String, val element: String, override val parent: String?, val attributes: Map<String, String> = emptyMap(), val bindings: List<Binding> = emptyList(), override val arm: ArmPlace? = null, override val row: String? = null, val obj: String? = null, val defaultStyle: DefaultStyle? = null, val drawing: Drawing? = null) : Node
	/** [parent] is null for text at the top of the page. */
	data class Text(override val id: String, override val parent: String?, val parts: List<TextPart>, override val arm: ArmPlace? = null, override val row: String? = null) : Node
	/** An `@if` with [test] (arm 0 while truthy, arm 1 otherwise), or a chain with [tests]: the first truthy arm, else the `null` arm. */
	data class Branch(override val id: String, override val parent: String?, val test: Expr?, val arms: Int, override val arm: ArmPlace? = null, override val row: String? = null, val tests: List<Expr?>? = null) : Node
	/** A keyed list: one row per item of [list], keyed by `String()` of the item at the [key] path. */
	data class Repeat(override val id: String, override val parent: String?, val list: Expr, val key: List<String>, override val arm: ArmPlace? = null, override val row: String? = null) : Node
	/** The platform's own sheet: its content is the nodes whose parent is this id, built at mount and kept; shown while [open] is truthy. */
	data class Sheet(override val id: String, override val parent: String, val open: Expr, val snapPoints: List<Double>, val dismissible: Boolean, val modal: Boolean) : Node {
		override val arm: ArmPlace? get() = null
		override val row: String? get() = null
	}
}

/** How an element looks under the browser's default stylesheet (the payload's `defaultStyle`); applied only without a style export. */
data class DefaultStyle(
	/** "inline" or "break" when the element flows in its parent's text; null for a box. */
	val flow: String? = null,
	val bold: Boolean = false,
	val italic: Boolean = false,
	val monospace: Boolean = false,
	val size: Double = 1.0,
	/** "underline" or "line-through". */
	val line: String? = null,
	/** "sub" or "super". */
	val shift: String? = null,
	val highlight: Boolean = false,
	val quotes: Boolean = false,
	val preformatted: Boolean = false,
	val indent: Double = 0.0,
	/** Space above and below, in ems of the element's own font size; adjoining margins collapse. */
	val margin: Double = 0.0,
	val rule: Boolean = false,
	/** "disc" or "decimal", on a list. */
	val marker: String? = null,
	/** "table", "row" or "cell". */
	val table: String? = null,
)

/** An RGBA colour, each channel 0-255. */
data class Rgba(val r: Int, val g: Int, val b: Int, val alpha: Int) {
	val argb: Int get() = (alpha shl 24) or (r shl 16) or (g shl 8) or b
}

/** A shape's paint: a colour, the svg's text colour, or none. */
sealed interface ShapePaint {
	data class Color(val color: Rgba) : ShapePaint
	data object Current : ShapePaint
}

/** One shape: verb-coded path (0 move, 1 line, 3 cubic, 4 close), its paint and stroke, and an optional affine map [a,b,c,d,e,f]. */
data class Shape(val path: List<Double>, val fill: ShapePaint?, val evenOdd: Boolean, val stroke: ShapePaint?, val width: Double, val cap: String, val join: String, val miterLimit: Double, val transform: List<Double>?)

/** An inline `<svg>` compiled to shapes. */
data class Drawing(val viewBox: List<Double>?, val width: Double?, val height: Double?, val shapes: List<Shape>, val em: Boolean = false)

/** [Enter] is the return key in a single-line text field; [Submit] is a form's, run only by a `submit` op. [Dismiss] is a sheet's platform close or an overlay's Escape or outside press. [Idle] and [Visible] run once for each shown instance of their element: when the host is idle after it appeared, and the first time any of it is on screen. */
/** [pointer]: an event a touch raises; [touch]: one of those a host reports, from which the runtime raises the rest. */
enum class EventName(val wire: String, val pointer: Boolean = false, val touch: Boolean = false) {
	Activate("activate"), Input("input"), Dismiss("dismiss"), Cancel("cancel"), Enter("enter"), Submit("submit"), Idle("idle"), Visible("visible"),
	PointerDown("pointerdown", true, true), PointerMove("pointermove", true, true), PointerUp("pointerup", true, true), PointerCancel("pointercancel", true, true),
	PointerOver("pointerover", true), PointerOut("pointerout", true), PointerEnter("pointerenter", true), PointerLeave("pointerleave", true),
	Choose("choose"),
}

sealed interface Op {
	/** The cell takes the expression's value, evaluated before the write. */
	data class Assign(val cell: String, val value: Expr) : Op
	/** Opens the page at [route] with [params], each evaluated when the op runs; ops after it do not run. */
	data class Navigate(val route: String, val params: Map<String, Expr>, val replace: Boolean = false) : Op
	/** A device call (`haptics.tap`); with [result], the call settles that task cell. */
	/** A device call on [obj] when it names one; [result] settles a task cell; [after] runs once the host resumes it. */
	data class Call(val call: String, val arguments: List<Expr>, val result: String?, val obj: String? = null, val after: Continuation? = null) : Op
	/** Runs [then] when [test] is truthy, else [otherwise]; the test is evaluated once, before either. */
	data class If(val test: Expr, val then: List<Op>, val otherwise: List<Op>) : Op
	/** `showModal()` ([open] true) or `close()` on a `<dialog>`: the host puts it in its top layer or takes it out. */
	data class Dialog(val node: String, val open: Boolean) : Op
	/** `focus()` or `scrollIntoView()` on the element [node] evaluates to (a fixed id is a literal), once the views show the handler's writes; null or the body does nothing. */
	data class Command(val node: Expr, val command: String, val preventScroll: Boolean) : Op
	/** Submits [form] as pressing [submitter] does (null: the return key with no submit button). */
	data class Submit(val form: String, val submitter: String?) : Op
	/** After [ms], [ops] run with each [capture] name holding the value it had when this op ran. */
	data class After(val ms: Expr, val capture: List<Pair<String, Expr>>, val ops: List<Op>) : Op
	/** A press on a checkbox (it flips) or a radio button (it is checked, the rest of its group unchecked). */
	data class Tick(val node: String) : Op
	/** Runs function [fn] of the payload's script with [bindings]; a throw or rejection writes `{ name, message }` to [catch] when there is one. */
	data class Script(val fn: String, val type: String, val bindings: Map<String, ScriptBinding>, val catch: String? = null) : Op
	/** `reset` of `@catch (error, reset)`: clears [catch] and runs again each of [cells] that holds an error. */
	data class Reset(val cells: List<String>, val catch: String? = null) : Op
	/** `setPointerCapture(pointer)` on the element [node] evaluates to, or with [release] `releasePointerCapture(pointer)`. */
	data class Capture(val node: Expr, val pointer: Expr, val release: Boolean) : Op
}

/** A device call a task cell starts at mount. */
data class Task(val call: String, val arguments: List<Expr>)

/** A page's route as the router spells it (`/[fruit]`) and its param names. */
data class Route(val pattern: String, val params: List<String>) {
	/** The params of [path] when it matches the pattern: a `[name]` segment matches one URL-decoded path segment. */
	fun match(path: String): Map<String, String>? {
		val want = pattern.trim('/').split('/').filter { it.isNotEmpty() }
		val got = path.substringBefore('?').substringBefore('#').trim('/').split('/').filter { it.isNotEmpty() }
		if (want.size != got.size) return null
		val out = LinkedHashMap<String, String>()
		for ((w, g) in want.zip(got)) {
			if (w.startsWith("[...") || w.startsWith("[[")) throw MarklessDecodeError("route segment \"$w\" is not supported yet")
			if (w.startsWith("[") && w.endsWith("]")) out[w.substring(1, w.length - 1)] = java.net.URLDecoder.decode(g.replace("+", "%2B"), "UTF-8")
			else if (w != g) return null
		}
		return out
	}
}

/** [device]: a live device value the host fills at mount and on change. [task]: an async device call started at mount. [row]: state of a component a list row renders, one value per row of that `repeat`, [initial] when the row is built. */
/** [clock]: the clock when the screen opened, written at mount before the first build. */
/** [async]: an async value function [AsyncValue.fn] of the payload's script computes while one of its [AsyncValue.boundaries] branches is shown; the script settles the cell. */
data class Cell(val id: String, val name: String, val initial: JsValue, val storageKey: String? = null, val styled: Boolean = false, val device: String? = null, val task: Task? = null, val obj: String? = null, val row: String? = null, val clock: Boolean = false, val async: AsyncValue? = null)

data class AsyncValue(val fn: String, val bindings: Map<String, ScriptBinding>, val boundaries: List<String>)
data class Event(val host: String, val event: EventName, val handler: String)
data class Handler(val id: String, val ops: List<Op>)

/** What a handler does once a device call it awaited answers: [ops] with the answer read as `{ local: as }`; when the call fails, [catch] (the nearest `@catch`'s cell) takes the error. */
data class Continuation(val id: String, val local: String, val ops: List<Op>, val catch: String? = null)

/** A device object a component makes (`const cam = camera()`); it lives while its [owner] node is shown. */
data class DeviceObject(val id: String, val device: String, val owner: String)

enum class FieldKind(val wire: String) { Text("text"), Checkbox("checkbox"), Radio("radio"), Hidden("hidden"), Select("select") }

data class Field(val node: String, val kind: FieldKind)

/** What the web says when a required field of each kind has no value, in one language. */
data class ValueMissing(val text: String, val checkbox: String, val radio: String)

/** Chromium's message for a text field longer than its `maxlength`, with `{max}` and `{length}` written in [digits]. */
data class TooLong(val text: String, val digits: String = "0123456789") {
	/** The message for these numbers, as Chromium writes them: no grouping, in the language's digits. */
	fun message(max: Int, length: Int): String {
		fun write(value: Int) = value.toString().map { digits[it - '0'] }.joinToString("")
		return text.replace("{max}", write(max)).replace("{length}", write(length))
	}
}

/** A `maxlength` attribute's limit, by HTML's rules for parsing non-negative integers; null (no limit) when it has none. */
fun nativeMaxLength(attribute: String?): Int? {
	if (attribute == null) return null
	var at = 0
	while (at < attribute.length && attribute[at] in " \t\n\r\u000C") at++
	val negative = attribute.getOrNull(at) == '-'
	if (negative || attribute.getOrNull(at) == '+') at++
	val start = at
	while (at < attribute.length && attribute[at] in '0'..'9') at++
	val value = attribute.substring(start, at).toIntOrNull() ?: return null
	return if (negative && value != 0) null else value
}

/** A form's submittable fields and submit buttons, each in tree order. */
data class Form(val node: String, val fields: List<Field>, val submitters: List<String>, val noValidate: Boolean = false, val authoredAriaDisabled: Boolean = false)

data class Payload(
	val component: String,
	val route: Route?,
	val cells: List<Cell>,
	val nodes: List<Node>,
	val events: List<Event>,
	val handlers: List<Handler>,
	/** The page's `<title>` text parts, shown in the screen's action bar. */
	val title: List<TextPart>? = null,
	val objects: List<DeviceObject> = emptyList(),
	val forms: List<Form> = emptyList(),
	/** [ValueMissing] by the locale the browser shows its own text in. */
	val valueMissing: Map<String, ValueMissing> = emptyMap(),
	/** [TooLong] by the locale the browser shows its own text in. */
	val tooLong: Map<String, TooLong> = emptyMap(),
	/** Present only when a handler or computed runs as JavaScript; a payload without it never starts an engine. */
	val script: ScriptSource? = null,
) {
	companion object {
		fun decode(bytes: ByteArray): Payload = decode(Json.parse(bytes))

		fun decode(json: Json): Payload {
			val root = json.obj("payload")
			root.only(setOf("version", "component", "route", "cells", "nodes", "events", "handlers", "title", "objects", "forms", "valueMissing", "tooLong", "script"), "payload")
			val route = root["route"]?.obj("payload.route")?.let { r ->
				r.only(setOf("pattern", "params"), "payload.route")
				Route(r.field("pattern", "route").str("route.pattern"), r.field("params", "route").arr("route.params").map { it.str("route.params[]") })
			}
			val version = root.field("version", "payload").str("payload.version")
			if (version != NATIVE_VIEW_VERSION) throw MarklessDecodeError("unknown payload version \"$version\" (this host reads $NATIVE_VIEW_VERSION)")
			val cells = root.field("cells", "payload").arr("payload.cells").mapIndexed { n, c -> cell(c, "cells[$n]") }
			val cellIds = HashSet<String>()
			for (c in cells) if (!cellIds.add(c.id)) throw MarklessDecodeError("duplicate cell \"${c.id}\"")
			val nodes = root.field("nodes", "payload").arr("payload.nodes").mapIndexed { n, v -> node(v, "nodes[$n]") }
			val seen = HashMap<String, Node>()
			for (node in nodes) {
				val p = node.parent
				if (p != null) {
					val parent = seen[p] ?: throw MarklessDecodeError("node \"${node.id}\" names parent \"$p\" that does not precede it")
					if (parent !is Node.Element && (parent !is Node.Sheet || node is Node.Sheet)) throw MarklessDecodeError("node \"${node.id}\" has a ${parent::class.simpleName} node as its parent")
				}
				node.arm?.let { a ->
					val b = seen[a.branch] as? Node.Branch ?: throw MarklessDecodeError("node \"${node.id}\" sits in an arm of \"${a.branch}\", which is not a preceding branch")
					if (a.index < 0 || a.index >= b.arms) throw MarklessDecodeError("node \"${node.id}\" sits in arm ${a.index} of a branch with ${b.arms}")
				}
				node.row?.let { r -> if (seen[r] !is Node.Repeat) throw MarklessDecodeError("node \"${node.id}\" sits in rows of \"$r\", which is not a preceding list") }
				if (seen.put(node.id, node) != null) throw MarklessDecodeError("duplicate node \"${node.id}\"")
				for (e in readsOf(node)) for (c in cellsOf(e)) if (c !in cellIds) throw MarklessDecodeError("node \"${node.id}\" reads unknown cell \"$c\"")
			}
			for (c in cells) c.row?.let { r -> if (seen[r] !is Node.Repeat) throw MarklessDecodeError("cell \"${c.id}\" is state of rows of \"$r\", which is not a list") }
			for (c in cells) c.async?.let { a -> for (r in cellsOf(a.bindings)) if (r !in cellIds) throw MarklessDecodeError("cell \"${c.id}\" reads unknown cell \"$r\"") }
			val handlers = root.field("handlers", "payload").arr("payload.handlers").mapIndexed { n, h -> handler(h, "handlers[$n]", cellIds) }
			val handlerIds = HashSet<String>()
			for (h in handlers) if (!handlerIds.add(h.id)) throw MarklessDecodeError("duplicate handler \"${h.id}\"")
			val events = root.field("events", "payload").arr("payload.events").mapIndexed { n, e -> event(e, "events[$n]") }
			for (e in events) {
				val host = seen[e.host]
				if (e.event == EventName.Dismiss) {
					if (host !is Node.Sheet && !(host is Node.Element && OVERLAY_ATTRIBUTE in host.attributes)) throw MarklessDecodeError("dismiss event on \"${e.host}\" names no sheet or overlay")
				} else if (host !is Node.Element) throw MarklessDecodeError("event on \"${e.host}\" names no element")
				if (e.handler !in handlerIds) throw MarklessDecodeError("event on \"${e.host}\" names unknown handler \"${e.handler}\"")
			}
			val title = root["title"]?.arr("payload.title")?.mapIndexed { n, p -> part(p, "payload.title[$n]") }
			for (p in title.orEmpty()) if (p is TextPart.Value) for (c in cellsOf(p.expr)) if (c !in cellIds) throw MarklessDecodeError("the title reads unknown cell \"$c\"")
			val objects = root["objects"]?.arr("payload.objects")?.mapIndexed { n, v ->
				val o = v.obj("objects[$n]")
				o.only(setOf("id", "device", "owner"), "objects[$n]")
				val owner = o.field("owner", "objects[$n]").str("objects[$n].owner")
				if (owner !in seen) throw MarklessDecodeError("objects[$n] is owned by unknown node \"$owner\"")
				DeviceObject(o.field("id", "objects[$n]").str("objects[$n].id"), o.field("device", "objects[$n]").str("objects[$n].device"), owner)
			} ?: emptyList()
			val forms = root["forms"]?.arr("payload.forms")?.mapIndexed { n, f -> form(f, "forms[$n]") } ?: emptyList()
			for (f in forms) for (id in listOf(f.node) + f.fields.map { it.node } + f.submitters) if (seen[id] !is Node.Element) throw MarklessDecodeError("form \"${f.node}\" names \"$id\", which is not an element")
			val valueMissing = root["valueMissing"]?.obj("payload.valueMissing")?.entries?.associateTo(LinkedHashMap()) { (locale, m) ->
				val mo = m.obj("payload.valueMissing.$locale")
				mo.only(setOf("text", "checkbox", "radio"), "payload.valueMissing.$locale")
				fun text(k: String) = mo.field(k, "payload.valueMissing.$locale").str("payload.valueMissing.$locale.$k")
				locale to ValueMissing(text("text"), text("checkbox"), text("radio"))
			} ?: emptyMap()
			val tooLong = root["tooLong"]?.obj("payload.tooLong")?.entries?.associateTo(LinkedHashMap()) { (locale, m) ->
				val mo = m.obj("payload.tooLong.$locale")
				mo.only(setOf("text", "digits"), "payload.tooLong.$locale")
				val digits = mo["digits"]?.str("payload.tooLong.$locale.digits") ?: "0123456789"
				if (digits.length != 10) throw MarklessDecodeError("payload.tooLong.$locale.digits is not ten digits")
				locale to TooLong(mo.field("text", "payload.tooLong.$locale").str("payload.tooLong.$locale.text"), digits)
			} ?: emptyMap()
			val script = root["script"]?.obj("payload.script")?.let { o ->
				o.only(setOf("id", "source", "services"), "payload.script")
				val services = o.field("services", "payload.script").arr("payload.script.services").map { it.str("payload.script.services[]") }
				for (s in services) if (s !in SERVICES) throw MarklessDecodeError("payload.script has unknown service \"$s\"")
				ScriptSource(o.field("id", "payload.script").str("payload.script.id"), o.field("source", "payload.script").str("payload.script.source"), services)
			}
			if (script == null) {
				val runsScript = cells.any { it.async != null } || handlers.any { h -> scriptOps(h.ops) } || nodes.any { n -> readsOf(n).any(::hasScript) } || title.orEmpty().any { it is TextPart.Value && hasScript(it.expr) }
				if (runsScript) throw MarklessDecodeError("a script op or computed in a payload with no script")
			}
			return Payload(root.field("component", "payload").str("payload.component"), route, cells, nodes, events, handlers, title, objects, forms, valueMissing, tooLong, script)
		}

		private fun readsOf(node: Node): List<Expr> = when (node) {
			is Node.Text -> node.parts.filterIsInstance<TextPart.Value>().map { it.expr }
			is Node.Element -> node.bindings.map { it.value }
			is Node.Branch -> listOfNotNull(node.test) + node.tests.orEmpty().filterNotNull()
			is Node.Repeat -> listOf(node.list)
			is Node.Sheet -> listOf(node.open)
		}

		private fun hasScript(e: Expr): Boolean = when (e) {
			is Expr.Script -> true
			is Expr.Unary -> hasScript(e.value)
			is Expr.Binary -> hasScript(e.left) || hasScript(e.right)
			is Expr.Logical -> hasScript(e.left) || hasScript(e.right)
			is Expr.If -> hasScript(e.test) || hasScript(e.whenTrue) || hasScript(e.whenFalse)
			is Expr.Template -> e.parts.any { it is Expr && hasScript(it) }
			is Expr.Member -> hasScript(e.value)
			is Expr.At -> hasScript(e.index) || hasScript(e.list)
			is Expr.ArrayLit -> e.items.any { hasScript(it.second) }
			is Expr.ObjectLit -> e.entries.any { hasScript(it.second) }
			is Expr.Method -> hasScript(e.target) || e.arguments.any(::hasScript)
			is Expr.Lambda -> hasScript(e.body)
			is Expr.Call -> e.arguments.any(::hasScript)
			is Expr.CellRef, is Expr.Literal, is Expr.Local, is Expr.Item, Expr.RouteParams, is Expr.Event, Expr.Focused, is Expr.FormData, is Expr.Checked -> false
			is Expr.Contains -> hasScript(e.within) || hasScript(e.node)
			is Expr.Captures -> hasScript(e.node) || hasScript(e.pointer)
			is Expr.FocusOrigin -> hasScript(e.overlay)
			is Expr.IsElement -> hasScript(e.value)
		}

		private fun scriptOps(ops: List<Op>): Boolean = ops.any { op ->
			when (op) {
				is Op.Script -> true
				is Op.If -> hasScript(op.test) || scriptOps(op.then) || scriptOps(op.otherwise)
				is Op.Call -> op.arguments.any(::hasScript) || op.after?.let { scriptOps(it.ops) } == true
				is Op.Assign -> hasScript(op.value)
				is Op.Navigate -> op.params.values.any(::hasScript)
				is Op.After -> hasScript(op.ms) || op.capture.any { hasScript(it.second) } || scriptOps(op.ops)
				is Op.Capture -> hasScript(op.node) || hasScript(op.pointer)
				is Op.Dialog, is Op.Command, is Op.Submit, is Op.Tick, is Op.Reset -> false
			}
		}

		fun cellsOf(e: Expr): List<String> = when (e) {
			is Expr.CellRef -> listOf(e.cell)
			is Expr.Literal -> emptyList()
			is Expr.Unary -> cellsOf(e.value)
			is Expr.Binary -> cellsOf(e.left) + cellsOf(e.right)
			is Expr.Logical -> cellsOf(e.left) + cellsOf(e.right)
			is Expr.If -> cellsOf(e.test) + cellsOf(e.whenTrue) + cellsOf(e.whenFalse)
			is Expr.Template -> e.parts.filterIsInstance<Expr>().flatMap(::cellsOf)
			is Expr.Member -> cellsOf(e.value)
			is Expr.At -> cellsOf(e.index) + cellsOf(e.list)
			is Expr.ArrayLit -> e.items.flatMap { cellsOf(it.second) }
			is Expr.ObjectLit -> e.entries.flatMap { cellsOf(it.second) }
			is Expr.Method -> cellsOf(e.target) + e.arguments.flatMap(::cellsOf)
			is Expr.Lambda -> cellsOf(e.body)
			is Expr.Local, is Expr.Item, Expr.RouteParams -> emptyList()
			is Expr.Call -> e.arguments.flatMap(::cellsOf)
			is Expr.Event, Expr.Focused, is Expr.FormData, is Expr.Checked -> emptyList()
			is Expr.Contains -> cellsOf(e.within) + cellsOf(e.node)
			is Expr.Captures -> cellsOf(e.node) + cellsOf(e.pointer)
			is Expr.FocusOrigin -> cellsOf(e.overlay)
			is Expr.IsElement -> cellsOf(e.value)
			is Expr.Script -> cellsOf(e.bindings)
		}

		fun cellsOf(bindings: Map<String, ScriptBinding>): List<String> = bindings.values.flatMap { b ->
			when (b) {
				is ScriptBinding.Cell -> listOf(b.cell)
				is ScriptBinding.Fields -> b.fields.values.toList()
				is ScriptBinding.Value -> cellsOf(b.value)
			}
		}

		private val SERVICES = setOf("timers", "fetch", "console", "crypto")

		private fun scriptBindings(v: Json, what: String): Map<String, ScriptBinding> = v.obj(what).entries.associateTo(LinkedHashMap()) { (name, b) ->
			val bo = b.obj("$what.$name")
			name to when {
				bo.containsKey("cell") -> { bo.only(setOf("cell"), "$what.$name"); ScriptBinding.Cell(bo.field("cell", what).str("$what.$name.cell")) }
				bo.containsKey("fields") -> {
					bo.only(setOf("fields"), "$what.$name")
					ScriptBinding.Fields(bo.field("fields", what).obj("$what.$name.fields").entries.associateTo(LinkedHashMap()) { (f, c) -> f to c.str("$what.$name.fields.$f") })
				}
				bo.containsKey("value") -> { bo.only(setOf("value"), "$what.$name"); ScriptBinding.Value(expr(bo.field("value", what), "$what.$name.value")) }
				else -> throw MarklessDecodeError("$what.$name is an unknown script binding (fields ${bo.keys})")
			}
		}

		private val UNARY = setOf("!", "-", "+", "typeof")
		private val BINARY = setOf("+", "-", "*", "/", "%", "===", "!==", "<", "<=", ">", ">=")
		private val LOGICAL = setOf("&&", "||", "??")
		private val METHODS = setOf("filter", "map", "findIndex", "some", "every", "includes", "indexOf", "join", "concat", "slice", "reverse", "toReversed", "toUpperCase", "toLowerCase", "trim")
		private val EVENT_FIELDS = setOf("value", "reason", "pressTarget", "target", "currentTarget", "relatedTarget", "button", "buttons", "clientX", "clientY", "pointerId", "pointerType", "isPrimary", "timeStamp")
		private val BUILTINS = setOf("String", "Number", "Boolean", "Math.abs", "Math.floor", "Math.max", "Math.min", "Math.round", "Date.now", "Date.toISOString")

		private fun oneOf(o: Map<String, Json>, key: String, allowed: Set<String>, what: String): String {
			val v = o.field(key, what).str("$what.$key")
			if (v !in allowed) throw MarklessDecodeError("$what has unknown $key \"$v\"")
			return v
		}

		fun expr(v: Json, what: String): Expr {
			val o = v.obj(what)
			fun sub(k: String) = expr(o.field(k, what), "$what.$k")
			return when {
				o.containsKey("cell") -> { o.only(setOf("cell"), what); Expr.CellRef(o.field("cell", what).str("$what.cell")) }
				o.containsKey("literal") -> { o.only(setOf("literal"), what); Expr.Literal(o.field("literal", what).let { if (it == Json.Null) JsValue.Null else scalar(it, "$what.literal") }) }
				o.containsKey("unary") -> { o.only(setOf("unary", "value"), what); Expr.Unary(oneOf(o, "unary", UNARY, what), sub("value")) }
				o.containsKey("binary") -> { o.only(setOf("binary", "left", "right"), what); Expr.Binary(oneOf(o, "binary", BINARY, what), sub("left"), sub("right")) }
				o.containsKey("logical") -> { o.only(setOf("logical", "left", "right"), what); Expr.Logical(oneOf(o, "logical", LOGICAL, what), sub("left"), sub("right")) }
				o.containsKey("if") -> { o.only(setOf("if", "whenTrue", "whenFalse"), what); Expr.If(sub("if"), sub("whenTrue"), sub("whenFalse")) }
				o.containsKey("template") -> {
					o.only(setOf("template"), what)
					Expr.Template(o.field("template", what).arr("$what.template").mapIndexed { n, p -> if (p is Json.Str) p.value else expr(p, "$what.template[$n]") })
				}
				o.containsKey("at") -> { o.only(setOf("at", "of"), what); Expr.At(sub("at"), sub("of")) }
				o.containsKey("member") -> { o.only(setOf("member", "property"), what); Expr.Member(sub("member"), o.field("property", what).str("$what.property")) }
				o.containsKey("array") -> {
					o.only(setOf("array"), what)
					Expr.ArrayLit(o.field("array", what).arr("$what.array").mapIndexed { n, a ->
						val ao = a.obj("$what.array[$n]")
						ao.only(setOf("spread", "value"), "$what.array[$n]")
						val spread = ao.field("spread", what) as? Json.Bool ?: throw MarklessDecodeError("$what.array[$n].spread must be a boolean")
						spread.value to expr(ao.field("value", what), "$what.array[$n].value")
					})
				}
				o.containsKey("object") -> {
					o.only(setOf("object"), what)
					Expr.ObjectLit(o.field("object", what).arr("$what.object").mapIndexed { n, e ->
						val pair = e.arr("$what.object[$n]")
						if (pair.size != 2) throw MarklessDecodeError("$what.object[$n] is not a [key, value] pair")
						pair[0].str("$what.object[$n][0]") to expr(pair[1], "$what.object[$n][1]")
					})
				}
				o.containsKey("method") -> {
					o.only(setOf("method", "target", "arguments"), what)
					Expr.Method(oneOf(o, "method", METHODS, what), sub("target"), o.field("arguments", what).arr("$what.arguments").mapIndexed { n, a -> expr(a, "$what.arguments[$n]") })
				}
				o.containsKey("lambda") -> { o.only(setOf("lambda", "body"), what); Expr.Lambda(o.field("lambda", what).arr("$what.lambda").map { it.str("$what.lambda[]") }, sub("body")) }
				o.containsKey("local") -> { o.only(setOf("local"), what); Expr.Local(o.field("local", what).str("$what.local")) }
				o.containsKey("item") -> { o.only(setOf("item"), what); Expr.Item(o.field("item", what).str("$what.item")) }
				o.containsKey("call") -> {
					o.only(setOf("call", "arguments"), what)
					Expr.Call(oneOf(o, "call", BUILTINS, what), o.field("arguments", what).arr("$what.arguments").mapIndexed { n, a -> expr(a, "$what.arguments[$n]") })
				}
				o.containsKey("route") -> { o.only(setOf("route"), what); oneOf(o, "route", setOf("params"), what); Expr.RouteParams }
				o.containsKey("event") -> { o.only(setOf("event"), what); Expr.Event(oneOf(o, "event", EVENT_FIELDS, what)) }
				o.containsKey("focused") -> {
					o.only(setOf("focused"), what)
					if (o.field("focused", what) != Json.Bool(true)) throw MarklessDecodeError("$what.focused must be true")
					Expr.Focused
				}
				o.containsKey("contains") -> { o.only(setOf("contains", "node"), what); Expr.Contains(sub("contains"), sub("node")) }
				o.containsKey("captures") -> { o.only(setOf("captures", "pointer"), what); Expr.Captures(sub("captures"), sub("pointer")) }
				o.containsKey("focusOrigin") -> { o.only(setOf("focusOrigin"), what); Expr.FocusOrigin(sub("focusOrigin")) }
				o.containsKey("isElement") -> { o.only(setOf("isElement"), what); Expr.IsElement(sub("isElement")) }
				o.containsKey("checked") -> { o.only(setOf("checked"), what); Expr.Checked(o.field("checked", what).str("$what.checked")) }
				o.containsKey("formData") -> { o.only(setOf("formData"), what); Expr.FormData(o.field("formData", what).str("$what.formData")) }
				o.containsKey("script") -> { o.only(setOf("script", "bindings"), what); Expr.Script(o.field("script", what).str("$what.script"), scriptBindings(o.field("bindings", what), "$what.bindings")) }
				else -> throw MarklessDecodeError("$what is an unknown expression (fields ${o.keys})")
			}
		}

		private fun rowPlace(o: Map<String, Json>, what: String): String? = o["row"]?.str("$what.row")

		private fun armPlace(o: Map<String, Json>, what: String): ArmPlace? = o["arm"]?.obj("$what.arm")?.let { a ->
			a.only(setOf("branch", "index"), "$what.arm")
			ArmPlace(a.field("branch", what).str("$what.arm.branch"), integer(a.field("index", what).num("$what.arm.index"), "$what.arm.index").toInt())
		}

		private fun scalar(v: Json, what: String): JsValue = when (v) {
			is Json.Num -> JsValue.Num(v.value)
			is Json.Str -> JsValue.Str(v.value)
			is Json.Bool -> JsValue.Bool(v.value)
			else -> throw MarklessDecodeError("$what must be a number, string or boolean")
		}

		private fun integer(v: Double, what: String): Double {
			if (v != Math.floor(v) || v.isInfinite()) throw MarklessDecodeError("$what is $v; native-view/0 carries integers only")
			return v
		}

		private fun cell(v: Json, what: String): Cell {
			val o = v.obj(what)
			o.only(setOf("id", "name", "initial", "storage", "styled", "device", "task", "object", "row", "clock", "async"), what)
			val clock = o["clock"]?.let { if (it != Json.Bool(true)) throw MarklessDecodeError("$what.clock must be true when present"); true } ?: false
			val styled = o["styled"]?.let { if (it != Json.Bool(true)) throw MarklessDecodeError("$what.styled must be true when present"); true } ?: false
			val storage = o["storage"]?.obj("$what.storage")?.let { it.only(setOf("key"), "$what.storage"); it.field("key", what).str("$what.storage.key") }
			val task = o["task"]?.obj("$what.task")?.let { t ->
				t.only(setOf("call", "arguments"), "$what.task")
				Task(t.field("call", what).str("$what.task.call"), t.field("arguments", what).arr("$what.task.arguments").mapIndexed { n, a -> expr(a, "$what.task.arguments[$n]") })
			}
			val async = o["async"]?.obj("$what.async")?.let { a ->
				a.only(setOf("script", "bindings", "boundaries"), "$what.async")
				AsyncValue(a.field("script", what).str("$what.async.script"), scriptBindings(a.field("bindings", what), "$what.async.bindings"), a.field("boundaries", what).arr("$what.async.boundaries").map { it.str("$what.async.boundaries[]") })
			}
			return Cell(o.field("id", what).str("$what.id"), o.field("name", what).str("$what.name"), JsValue.fromJson(o.field("initial", what)), storage, styled, o["device"]?.str("$what.device"), task, o["object"]?.str("$what.object"), o["row"]?.str("$what.row"), clock, async)
		}

		private fun defaultStyle(v: Json, what: String): DefaultStyle {
			val o = v.obj(what)
			o.only(setOf("flow", "bold", "italic", "monospace", "size", "line", "shift", "highlight", "quotes", "preformatted", "indent", "margin", "rule", "marker", "table"), what)
			fun flag(name: String): Boolean = o[name]?.let { if (it != Json.Bool(true)) throw MarklessDecodeError("$what.$name must be true when present"); true } ?: false
			fun word(name: String, allowed: Set<String>): String? = o[name]?.let { oneOf(o, name, allowed, what) }
			return DefaultStyle(
				flow = word("flow", setOf("inline", "break")),
				bold = flag("bold"), italic = flag("italic"), monospace = flag("monospace"),
				size = o["size"]?.num("$what.size") ?: 1.0,
				line = word("line", setOf("underline", "line-through")),
				shift = word("shift", setOf("sub", "super")),
				highlight = flag("highlight"), quotes = flag("quotes"), preformatted = flag("preformatted"),
				indent = o["indent"]?.num("$what.indent") ?: 0.0,
				margin = o["margin"]?.num("$what.margin") ?: 0.0,
				rule = flag("rule"),
				marker = word("marker", setOf("disc", "decimal")),
				table = word("table", setOf("table", "row", "cell")),
			)
		}

		private fun paint(v: Json, what: String): ShapePaint? = when (v) {
			Json.Null -> null
			is Json.Str -> if (v.value == "currentColor") ShapePaint.Current else throw MarklessDecodeError("$what must be a colour, \"currentColor\" or null")
			else -> {
				val o = v.obj(what)
				o.only(setOf("r", "g", "b", "alpha"), what)
				fun channel(name: String): Int {
					val n = o.field(name, what).num("$what.$name")
					if (n < 0 || n > 255 || n != Math.floor(n)) throw MarklessDecodeError("$what.$name is $n; a channel is an integer 0-255")
					return n.toInt()
				}
				ShapePaint.Color(Rgba(channel("r"), channel("g"), channel("b"), channel("alpha")))
			}
		}

		private fun drawing(v: Json, what: String): Drawing {
			val o = v.obj(what)
			o.only(setOf("viewBox", "width", "height", "shapes", "em"), what)
			val em = o["em"]?.let { if (it != Json.Bool(true)) throw MarklessDecodeError("$what.em must be true when present"); true } ?: false
			val viewBox = o.field("viewBox", what).let { if (it == Json.Null) null else it.arr("$what.viewBox").map { n -> n.num("$what.viewBox[]") } }
			if (viewBox != null && viewBox.size != 4) throw MarklessDecodeError("$what.viewBox must hold four numbers")
			val shapes = o.field("shapes", what).arr("$what.shapes").mapIndexed { n, sv ->
				val w = "$what.shapes[$n]"
				val so = sv.obj(w)
				so.only(setOf("path", "fill", "fillRule", "stroke", "width", "cap", "join", "miterLimit", "transform"), w)
				val path = so.field("path", w).arr("$w.path").map { it.num("$w.path[]") }
				val transform = so["transform"]?.arr("$w.transform")?.map { it.num("$w.transform[]") }
				if (transform != null && transform.size != 6) throw MarklessDecodeError("$w.transform must hold six numbers")
				Shape(
					path, paint(so.field("fill", w), "$w.fill"), oneOf(so, "fillRule", setOf("nonzero", "evenodd"), w) == "evenodd",
					paint(so.field("stroke", w), "$w.stroke"), so.field("width", w).num("$w.width"),
					oneOf(so, "cap", setOf("butt", "round", "square"), w), oneOf(so, "join", setOf("miter", "round", "bevel"), w),
					so.field("miterLimit", w).num("$w.miterLimit"), transform,
				)
			}
			return Drawing(viewBox, o["width"]?.num("$what.width"), o["height"]?.num("$what.height"), shapes, em)
		}

		private fun node(v: Json, what: String): Node {
			val o = v.obj(what)
			val id = o.field("id", what).str("$what.id")
			return when (val kind = o.field("kind", what).str("$what.kind")) {
				"element" -> {
					o.only(setOf("kind", "id", "element", "parent", "attributes", "bindings", "arm", "row", "object", "defaultStyle", "drawing"), what)
					val parent = o.field("parent", what)
					val attributes = o["attributes"]?.obj("$what.attributes")?.mapValues { (k, v) -> v.str("$what.attributes.$k") } ?: emptyMap()
					val bindings = o["bindings"]?.arr("$what.bindings")?.mapIndexed { n, b ->
						val bo = b.obj("$what.bindings[$n]")
						val value = expr(bo.field("value", what), "$what.bindings[$n].value")
						if (bo.containsKey("property")) {
							bo.only(setOf("property", "value"), "$what.bindings[$n]")
							Binding(oneOf(bo, "property", setOf("value", "checked", "indeterminate", "selected"), "$what.bindings[$n]"), value, property = true)
						} else {
							bo.only(setOf("attribute", "value"), "$what.bindings[$n]")
							Binding(bo.field("attribute", what).str("$what.bindings[$n].attribute"), value)
						}
					} ?: emptyList()
					Node.Element(id, o.field("element", what).str("$what.element"), if (parent == Json.Null) null else parent.str("$what.parent"), attributes, bindings, armPlace(o, what), rowPlace(o, what), o["object"]?.str("$what.object"), o["defaultStyle"]?.let { defaultStyle(it, "$what.defaultStyle") }, o["drawing"]?.let { drawing(it, "$what.drawing") })
				}
				"text" -> {
					o.only(setOf("kind", "id", "parent", "parts", "arm", "row"), what)
					val parts = o.field("parts", what).arr("$what.parts").mapIndexed { n, p -> part(p, "$what.parts[$n]") }
					val parent = o.field("parent", what)
					Node.Text(id, if (parent == Json.Null) null else parent.str("$what.parent"), parts, armPlace(o, what), rowPlace(o, what))
				}
				"branch" -> {
					o.only(setOf("kind", "id", "parent", "test", "tests", "arms", "arm", "row"), what)
					val parent = o.field("parent", what)
					val arms = integer(o.field("arms", what).num("$what.arms"), "$what.arms").toInt()
					if (o.containsKey("test") == o.containsKey("tests")) throw MarklessDecodeError("$what has ${if (o.containsKey("test")) "both test and tests" else "neither test nor tests"}")
					val test = o["test"]?.let { expr(it, "$what.test") }
					val tests = o["tests"]?.arr("$what.tests")?.mapIndexed { n, t -> if (t == Json.Null) null else expr(t, "$what.tests[$n]") }
					if (test != null && arms != 1 && arms != 2) throw MarklessDecodeError("$what has $arms arms; an @if has 1 or 2")
					if (tests != null && (tests.size != arms || arms < 1)) throw MarklessDecodeError("$what has ${tests.size} tests for $arms arms")
					Node.Branch(id, if (parent == Json.Null) null else parent.str("$what.parent"), test, arms, armPlace(o, what), rowPlace(o, what), tests)
				}
				"repeat" -> {
					o.only(setOf("kind", "id", "parent", "list", "key", "arm", "row"), what)
					val parent = o.field("parent", what)
					val key = o.field("key", what).arr("$what.key").map { it.str("$what.key[]") }
					Node.Repeat(id, if (parent == Json.Null) null else parent.str("$what.parent"), expr(o.field("list", what), "$what.list"), key, armPlace(o, what), rowPlace(o, what))
				}
				"sheet" -> {
					o.only(setOf("kind", "id", "parent", "open", "snapPoints", "dismissible", "modal"), what)
					val snapPoints = o.field("snapPoints", what).arr("$what.snapPoints").map { it.num("$what.snapPoints[]") }
					val two = snapPoints.size == 2 && snapPoints[0] > 0 && snapPoints[0] < 1 && snapPoints[1] == 1.0
					if (snapPoints != listOf(1.0) && !two) throw MarklessDecodeError("$what has snapPoints $snapPoints; a sheet rests at [1] or [x, 1] with 0 < x < 1")
					fun flag(k: String) = (o.field(k, what) as? Json.Bool ?: throw MarklessDecodeError("$what.$k must be a boolean")).value
					Node.Sheet(id, o.field("parent", what).str("$what.parent"), expr(o.field("open", what), "$what.open"), snapPoints, flag("dismissible"), flag("modal"))
				}
				else -> throw MarklessDecodeError("$what has unknown node kind \"$kind\"")
			}
		}

		private fun part(v: Json, what: String): TextPart {
			val o = v.obj(what)
			return when {
				o.containsKey("text") -> { o.only(setOf("text"), what); TextPart.Literal(o.field("text", what).str("$what.text")) }
				o.containsKey("cell") -> { o.only(setOf("cell"), what); TextPart.Value(Expr.CellRef(o.field("cell", what).str("$what.cell"))) }
				o.containsKey("expr") -> { o.only(setOf("expr"), what); TextPart.Value(expr(o.field("expr", what), "$what.expr")) }
				else -> throw MarklessDecodeError("$what is neither a text, cell nor expr part")
			}
		}

		private fun event(v: Json, what: String): Event {
			val o = v.obj(what)
			o.only(setOf("host", "event", "handler"), what)
			val name = o.field("event", what).str("$what.event")
			val event = EventName.entries.firstOrNull { it.wire == name } ?: throw MarklessDecodeError("$what has unknown event \"$name\"")
			return Event(o.field("host", what).str("$what.host"), event, o.field("handler", what).str("$what.handler"))
		}

		private fun flag(o: Map<String, Json>, key: String, what: String): Boolean =
			o[key]?.let { if (it != Json.Bool(true)) throw MarklessDecodeError("$what.$key must be true when present"); true } ?: false

		private fun form(v: Json, what: String): Form {
			val o = v.obj(what)
			o.only(setOf("node", "fields", "submitters", "noValidate", "authoredAriaDisabled"), what)
			val fields = o.field("fields", what).arr("$what.fields").mapIndexed { n, f ->
				val fo = f.obj("$what.fields[$n]")
				fo.only(setOf("node", "kind"), "$what.fields[$n]")
				val kind = oneOf(fo, "kind", FieldKind.entries.mapTo(HashSet()) { it.wire }, "$what.fields[$n]")
				Field(fo.field("node", what).str("$what.fields[$n].node"), FieldKind.entries.first { it.wire == kind })
			}
			val submitters = o.field("submitters", what).arr("$what.submitters").map { it.str("$what.submitters[]") }
			return Form(o.field("node", what).str("$what.node"), fields, submitters, flag(o, "noValidate", what), flag(o, "authoredAriaDisabled", what))
		}

		private fun handler(v: Json, what: String, cells: Set<String>): Handler {
			val o = v.obj(what)
			o.only(setOf("id", "ops"), what)
			val ops = o.field("ops", what).arr("$what.ops").mapIndexed { n, op -> op(op, "$what.ops[$n]", cells) }
			return Handler(o.field("id", what).str("$what.id"), ops)
		}

		private fun op(v: Json, what: String, cells: Set<String>): Op {
			val o = v.obj(what)
			val name = o.field("op", what).str("$what.op")
			if (name == "navigate") {
				o.only(setOf("op", "route", "params", "replace"), what)
				val params = o.field("params", what).obj("$what.params").entries.associateTo(LinkedHashMap()) { (k, v) ->
					k to if (v is Json.Str) Expr.Literal(JsValue.Str(v.value)) else expr(v, "$what.params.$k")
				}
				for (e in params.values) for (c in cellsOf(e)) if (c !in cells) throw MarklessDecodeError("$what reads unknown cell \"$c\"")
				val replace = o["replace"]?.let { if (it != Json.Bool(true)) throw MarklessDecodeError("$what.replace must be true when present"); true } ?: false
				return Op.Navigate(o.field("route", what).str("$what.route"), params, replace)
			}
			if (name == "call") {
				o.only(setOf("op", "call", "arguments", "result", "object", "after"), what)
				val args = o.field("arguments", what).arr("$what.arguments").mapIndexed { n, a -> expr(a, "$what.arguments[$n]") }
				for (c in args.flatMap(::cellsOf)) if (c !in cells) throw MarklessDecodeError("$what reads unknown cell \"$c\"")
				val result = o["result"]?.str("$what.result")
				if (result != null && result !in cells) throw MarklessDecodeError("$what settles unknown cell \"$result\"")
				val after = o["after"]?.obj("$what.after")?.let { t ->
					t.only(setOf("id", "as", "ops", "catch"), "$what.after")
					val catch = t["catch"]?.str("$what.after.catch")
					if (catch != null && catch !in cells) throw MarklessDecodeError("$what.after catches into unknown cell \"$catch\"")
					Continuation(t.field("id", what).str("$what.after.id"), t.field("as", what).str("$what.after.as"), t.field("ops", what).arr("$what.after.ops").mapIndexed { n, inner -> op(inner, "$what.after.ops[$n]", cells) }, catch)
				}
				return Op.Call(o.field("call", what).str("$what.call"), args, result, o["object"]?.str("$what.object"), after)
			}
			if (name == "dialog") {
				o.only(setOf("op", "node", "method"), what)
				val method = o.field("method", what).str("$what.method")
				if (method != "showModal" && method != "close") throw MarklessDecodeError("$what has unknown dialog method \"$method\"")
				return Op.Dialog(o.field("node", what).str("$what.node"), method == "showModal")
			}
			if (name == "command") {
				o.only(setOf("op", "node", "command", "preventScroll"), what)
				val command = o.field("command", what).str("$what.command")
				if (command != "focus" && command != "scrollIntoView") throw MarklessDecodeError("$what has unknown command \"$command\"")
				val preventScroll = if (o.containsKey("preventScroll")) ((o.field("preventScroll", what) as? Json.Bool ?: throw MarklessDecodeError("$what.preventScroll must be a boolean")).value) else false
				val raw = o.field("node", what)
				val node = if (raw is Json.Str) Expr.Literal(JsValue.Str(raw.value)) else expr(raw, "$what.node")
				for (c in cellsOf(node)) if (c !in cells) throw MarklessDecodeError("$what reads unknown cell \"$c\"")
				return Op.Command(node, command, preventScroll)
			}
			if (name == "capture") {
				o.only(setOf("op", "node", "pointer", "release"), what)
				val raw = o.field("node", what)
				val node = if (raw is Json.Str) Expr.Literal(JsValue.Str(raw.value)) else expr(raw, "$what.node")
				val pointer = expr(o.field("pointer", what), "$what.pointer")
				for (c in cellsOf(node) + cellsOf(pointer)) if (c !in cells) throw MarklessDecodeError("$what reads unknown cell \"$c\"")
				return Op.Capture(node, pointer, flag(o, "release", what))
			}
			if (name == "if") {
				o.only(setOf("op", "test", "whenTrue", "whenFalse"), what)
				val test = expr(o.field("test", what), "$what.test")
				for (c in cellsOf(test)) if (c !in cells) throw MarklessDecodeError("$what reads unknown cell \"$c\"")
				val then = o.field("whenTrue", what).arr("$what.whenTrue").mapIndexed { n, inner -> op(inner, "$what.whenTrue[$n]", cells) }
				val otherwise = o.field("whenFalse", what).arr("$what.whenFalse").mapIndexed { n, inner -> op(inner, "$what.whenFalse[$n]", cells) }
				return Op.If(test, then, otherwise)
			}
			if (name == "submit") {
				o.only(setOf("op", "form", "submitter"), what)
				val submitter = o.field("submitter", what)
				return Op.Submit(o.field("form", what).str("$what.form"), if (submitter == Json.Null) null else submitter.str("$what.submitter"))
			}
			if (name == "tick") {
				o.only(setOf("op", "node"), what)
				return Op.Tick(o.field("node", what).str("$what.node"))
			}
			if (name == "after") {
				o.only(setOf("op", "ms", "capture", "ops"), what)
				val ms = expr(o.field("ms", what), "$what.ms")
				val capture = o.field("capture", what).arr("$what.capture").mapIndexed { n, c ->
					val pair = c.arr("$what.capture[$n]")
					if (pair.size != 2) throw MarklessDecodeError("$what.capture[$n] is not a [name, value] pair")
					pair[0].str("$what.capture[$n][0]") to expr(pair[1], "$what.capture[$n][1]")
				}
				for (e in listOf(ms) + capture.map { it.second }) for (c in cellsOf(e)) if (c !in cells) throw MarklessDecodeError("$what reads unknown cell \"$c\"")
				val ops = o.field("ops", what).arr("$what.ops").mapIndexed { n, inner -> op(inner, "$what.ops[$n]", cells) }
				return Op.After(ms, capture, ops)
			}
			if (name == "script") {
				o.only(setOf("op", "fn", "type", "bindings", "catch"), what)
				val bindings = scriptBindings(o.field("bindings", what), "$what.bindings")
				for (c in cellsOf(bindings)) if (c !in cells) throw MarklessDecodeError("$what reads unknown cell \"$c\"")
				val catch = o["catch"]?.str("$what.catch")
				if (catch != null && catch !in cells) throw MarklessDecodeError("$what catches into unknown cell \"$catch\"")
				return Op.Script(o.field("fn", what).str("$what.fn"), o.field("type", what).str("$what.type"), bindings, catch)
			}
			if (name == "reset") {
				o.only(setOf("op", "cells", "catch"), what)
				val reset = o.field("cells", what).arr("$what.cells").mapIndexed { n, c -> c.str("$what.cells[$n]") }
				for (c in reset) if (c !in cells) throw MarklessDecodeError("$what resets unknown cell \"$c\"")
				val catch = o["catch"]?.str("$what.catch")
				if (catch != null && catch !in cells) throw MarklessDecodeError("$what clears unknown cell \"$catch\"")
				return Op.Reset(reset, catch)
			}
			if (name != "assign") throw MarklessDecodeError("$what has unknown op \"$name\"")
			o.only(setOf("op", "cell", "value"), what)
			val cell = o.field("cell", what).str("$what.cell")
			if (cell !in cells) throw MarklessDecodeError("$what writes unknown cell \"$cell\"")
			val value = expr(o.field("value", what), "$what.value")
			for (c in cellsOf(value)) if (c !in cells) throw MarklessDecodeError("$what reads unknown cell \"$c\"")
			return Op.Assign(cell, value)
		}
	}
}

const val NATIVE_APP_VERSION = "markless.native-app/0"

/** One route of an app and the page it shows. */
data class AppRoute(val route: Route, val page: Payload)

/** An app of several routes, in the router's match order: each screen of the stack is one of these pages. */
data class AppPayload(val routes: List<AppRoute>) {
	/** The first route [path] matches, in payload order, and its params. */
	fun match(path: String): Pair<AppRoute, Map<String, String>>? {
		for (r in routes) r.route.match(path)?.let { return r to it }
		return null
	}

	fun page(pattern: String): AppRoute = routes.firstOrNull { it.route.pattern == pattern } ?: throw MarklessDecodeError("no page for $pattern")

	/** Every leading part of [path] that is itself a route, shortest first, ending with [path]. */
	fun backStack(path: String): List<String> {
		val segments = path.substringBefore('?').substringBefore('#').split('/').filter { it.isNotEmpty() }
		val stack = (0..segments.size).map { "/" + segments.take(it).joinToString("/") }.filter { match(it) != null }
		if (stack.lastOrNull() != "/" + segments.joinToString("/")) throw MarklessDecodeError("$path is not a route of this app")
		return stack
	}

	companion object {
		/** An app payload, or null when [bytes] is a single page payload. */
		fun decodeOrNull(bytes: ByteArray): AppPayload? = decodeOrNull(Json.parse(bytes))

		fun decodeOrNull(json: Json): AppPayload? {
			val root = json.obj("payload")
			val version = root.field("version", "payload").str("payload.version")
			if (version == NATIVE_VIEW_VERSION) return null
			if (version != NATIVE_APP_VERSION) throw MarklessDecodeError("unknown payload version \"$version\" (this host reads $NATIVE_VIEW_VERSION and $NATIVE_APP_VERSION)")
			root.only(setOf("version", "routes"), "app")
			val routes = root.field("routes", "app").arr("app.routes").mapIndexed { n, r ->
				val o = r.obj("app.routes[$n]")
				o.only(setOf("pattern", "params", "page"), "app.routes[$n]")
				val route = Route(o.field("pattern", "app.routes[$n]").str("app.routes[$n].pattern"), o.field("params", "app.routes[$n]").arr("app.routes[$n].params").map { it.str("app.routes[$n].params[]") })
				AppRoute(route, Payload.decode(o.field("page", "app.routes[$n]")))
			}
			if (routes.isEmpty()) throw MarklessDecodeError("an app payload has no routes")
			for (r in routes) for (h in r.page.handlers) for (op in h.ops) if (op is Op.Navigate && routes.none { it.route.pattern == op.route }) throw MarklessDecodeError("a link to ${op.route}, which is not a route of this app")
			return AppPayload(routes)
		}

		/** The path [pattern] names with [params], each param encoded as `encodeURIComponent` does. */
		fun path(pattern: String, params: Map<String, String>): String = "/" + pattern.split('/').filter { it.isNotEmpty() }.joinToString("/") { part ->
			if (part.startsWith("[") && part.endsWith("]")) encodeComponent(params[part.substring(1, part.length - 1)] ?: throw MarklessDecodeError("$pattern needs the param $part")) else part
		}

		private fun encodeComponent(value: String): String = buildString {
			for (b in value.toByteArray(Charsets.UTF_8)) {
				val c = b.toInt() and 0xff
				if (c.toChar().isLetterOrDigit() && c < 0x80 || c.toChar() in "-_.!~*'()") append(c.toChar()) else append("%" + "%02X".format(c))
			}
		}
	}
}
