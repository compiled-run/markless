package dev.markless.mobile.core

const val NATIVE_VIEW_VERSION = "markless.native-view/0"

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
	/** In an `input` handler: the field's whole text after the edit. */
	data object EventValue : Expr
	/** The page's route params, an object of strings. */
	data object RouteParams : Expr
	/** `new FormData(form)`: the form's entries as `[name, value]` string pairs, in tree order. */
	data class FormData(val form: String) : Expr
	/** A checkbox's or radio button's checkedness now. */
	data class Checked(val node: String) : Expr
}

sealed interface TextPart {
	data class Literal(val text: String) : TextPart
	data class Value(val expr: Expr) : TextPart
}

data class ArmPlace(val branch: String, val index: Int)

/** An attribute that follows state, or (when [property]) an input's `value`, `checked` or `indeterminate` property. */
data class Binding(val name: String, val value: Expr, val property: Boolean = false)

sealed interface Node {
	val id: String
	val parent: String?
	val arm: ArmPlace?
	/** The `repeat` node whose rows this node is part of. */
	val row: String?

	data class Element(override val id: String, val element: String, override val parent: String?, val attributes: Map<String, String> = emptyMap(), val bindings: List<Binding> = emptyList(), override val arm: ArmPlace? = null, override val row: String? = null) : Node
	data class Text(override val id: String, override val parent: String, val parts: List<TextPart>, override val arm: ArmPlace? = null, override val row: String? = null) : Node
	/** An `@if` with [test] (arm 0 while truthy, arm 1 otherwise), or a chain with [tests]: the first truthy arm, else the `null` arm. */
	data class Branch(override val id: String, override val parent: String?, val test: Expr?, val arms: Int, override val arm: ArmPlace? = null, override val row: String? = null, val tests: List<Expr?>? = null) : Node
	/** A keyed list: one row per item of [list], keyed by `String()` of the item at the [key] path. */
	data class Repeat(override val id: String, override val parent: String?, val list: Expr, val key: List<String>, override val arm: ArmPlace? = null, override val row: String? = null) : Node
}

/** [Enter] is the return key in a single-line text field; [Submit] is a form's, run only by a `submit` op. */
enum class EventName(val wire: String) { Activate("activate"), Input("input"), Cancel("cancel"), Enter("enter"), Submit("submit") }

sealed interface Op {
	/** The cell takes the expression's value, evaluated before the write. */
	data class Assign(val cell: String, val value: Expr) : Op
	/** Opens the page at [route] with [params]; ops after it do not run. */
	data class Navigate(val route: String, val params: Map<String, String>) : Op
	/** Runs [then] when [test] is truthy, else [otherwise]; the test is evaluated once, before either. */
	data class If(val test: Expr, val then: List<Op>, val otherwise: List<Op>) : Op
	/** `showModal()` ([open] true) or `close()` on a `<dialog>`: the host puts it in its top layer or takes it out. */
	data class Dialog(val node: String, val open: Boolean) : Op
	/** `focus()` or `scrollIntoView()` on an element, run once the views show the handler's writes. */
	data class Command(val node: String, val command: String, val preventScroll: Boolean) : Op
	/** Submits [form] as pressing [submitter] does (null: the return key with no submit button). */
	data class Submit(val form: String, val submitter: String?) : Op
	/** After [ms], [ops] run with each [capture] name holding the value it had when this op ran. */
	data class After(val ms: Expr, val capture: List<Pair<String, Expr>>, val ops: List<Op>) : Op
	/** A press on a checkbox (it flips) or a radio button (it is checked, the rest of its group unchecked). */
	data class Tick(val node: String) : Op
}

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

data class Cell(val id: String, val name: String, val initial: JsValue, val storageKey: String? = null, val styled: Boolean = false)
data class Event(val host: String, val event: EventName, val handler: String)
data class Handler(val id: String, val ops: List<Op>)

enum class FieldKind(val wire: String) { Text("text"), Checkbox("checkbox"), Radio("radio"), Hidden("hidden") }

data class Field(val node: String, val kind: FieldKind)

/** What the web says when a required field of each kind has no value, in one language. */
data class ValueMissing(val text: String, val checkbox: String, val radio: String)

/** A form's submittable fields and submit buttons, each in tree order. */
data class Form(val node: String, val fields: List<Field>, val submitters: List<String>, val noValidate: Boolean = false, val authoredAriaDisabled: Boolean = false)

data class Payload(
	val component: String,
	val route: Route?,
	val cells: List<Cell>,
	val nodes: List<Node>,
	val events: List<Event>,
	val handlers: List<Handler>,
	val forms: List<Form> = emptyList(),
	/** [ValueMissing] by the locale the browser shows its own text in. */
	val valueMissing: Map<String, ValueMissing> = emptyMap(),
) {
	companion object {
		fun decode(bytes: ByteArray): Payload = decode(Json.parse(bytes))

		fun decode(json: Json): Payload {
			val root = json.obj("payload")
			root.only(setOf("version", "component", "route", "cells", "nodes", "events", "handlers", "forms", "valueMissing"), "payload")
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
					if (parent !is Node.Element) throw MarklessDecodeError("node \"${node.id}\" has a ${parent::class.simpleName} node as its parent")
				} else if (node is Node.Text) throw MarklessDecodeError("text node \"${node.id}\" has no parent")
				node.arm?.let { a ->
					val b = seen[a.branch] as? Node.Branch ?: throw MarklessDecodeError("node \"${node.id}\" sits in an arm of \"${a.branch}\", which is not a preceding branch")
					if (a.index < 0 || a.index >= b.arms) throw MarklessDecodeError("node \"${node.id}\" sits in arm ${a.index} of a branch with ${b.arms}")
				}
				node.row?.let { r -> if (seen[r] !is Node.Repeat) throw MarklessDecodeError("node \"${node.id}\" sits in rows of \"$r\", which is not a preceding list") }
				if (seen.put(node.id, node) != null) throw MarklessDecodeError("duplicate node \"${node.id}\"")
				val reads = when (node) {
					is Node.Text -> node.parts.filterIsInstance<TextPart.Value>().map { it.expr }
					is Node.Element -> node.bindings.map { it.value }
					is Node.Branch -> listOfNotNull(node.test) + node.tests.orEmpty().filterNotNull()
					is Node.Repeat -> listOf(node.list)
				}
				for (e in reads) for (c in cellsOf(e)) if (c !in cellIds) throw MarklessDecodeError("node \"${node.id}\" reads unknown cell \"$c\"")
			}
			val handlers = root.field("handlers", "payload").arr("payload.handlers").mapIndexed { n, h -> handler(h, "handlers[$n]", cellIds) }
			val handlerIds = HashSet<String>()
			for (h in handlers) if (!handlerIds.add(h.id)) throw MarklessDecodeError("duplicate handler \"${h.id}\"")
			val events = root.field("events", "payload").arr("payload.events").mapIndexed { n, e -> event(e, "events[$n]") }
			for (e in events) {
				if (seen[e.host] !is Node.Element) throw MarklessDecodeError("event on \"${e.host}\" names no element")
				if (e.handler !in handlerIds) throw MarklessDecodeError("event on \"${e.host}\" names unknown handler \"${e.handler}\"")
			}
			val forms = root["forms"]?.arr("payload.forms")?.mapIndexed { n, f -> form(f, "forms[$n]") } ?: emptyList()
			for (f in forms) for (id in listOf(f.node) + f.fields.map { it.node } + f.submitters) if (seen[id] !is Node.Element) throw MarklessDecodeError("form \"${f.node}\" names \"$id\", which is not an element")
			val valueMissing = root["valueMissing"]?.obj("payload.valueMissing")?.entries?.associateTo(LinkedHashMap()) { (locale, m) ->
				val mo = m.obj("payload.valueMissing.$locale")
				mo.only(setOf("text", "checkbox", "radio"), "payload.valueMissing.$locale")
				fun text(k: String) = mo.field(k, "payload.valueMissing.$locale").str("payload.valueMissing.$locale.$k")
				locale to ValueMissing(text("text"), text("checkbox"), text("radio"))
			} ?: emptyMap()
			return Payload(root.field("component", "payload").str("payload.component"), route, cells, nodes, events, handlers, forms, valueMissing)
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
			Expr.EventValue, is Expr.FormData, is Expr.Checked -> emptyList()
		}

		private val UNARY = setOf("!", "-", "+", "typeof")
		private val BINARY = setOf("+", "-", "*", "/", "%", "===", "!==", "<", "<=", ">", ">=")
		private val LOGICAL = setOf("&&", "||", "??")
		private val METHODS = setOf("filter", "map", "findIndex", "some", "every", "includes", "indexOf", "join", "concat", "slice", "reverse", "toReversed", "toUpperCase", "toLowerCase", "trim")
		private val BUILTINS = setOf("String", "Number", "Boolean", "Math.abs", "Math.floor", "Math.max", "Math.min", "Math.round")

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
				o.containsKey("event") -> { o.only(setOf("event"), what); oneOf(o, "event", setOf("value"), what); Expr.EventValue }
				o.containsKey("checked") -> { o.only(setOf("checked"), what); Expr.Checked(o.field("checked", what).str("$what.checked")) }
				o.containsKey("formData") -> { o.only(setOf("formData"), what); Expr.FormData(o.field("formData", what).str("$what.formData")) }
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
			o.only(setOf("id", "name", "initial", "storage", "styled"), what)
			val styled = o["styled"]?.let { if (it != Json.Bool(true)) throw MarklessDecodeError("$what.styled must be true when present"); true } ?: false
			val storage = o["storage"]?.obj("$what.storage")?.let { it.only(setOf("key"), "$what.storage"); it.field("key", what).str("$what.storage.key") }
			return Cell(o.field("id", what).str("$what.id"), o.field("name", what).str("$what.name"), JsValue.fromJson(o.field("initial", what)), storage, styled)
		}

		private fun node(v: Json, what: String): Node {
			val o = v.obj(what)
			val id = o.field("id", what).str("$what.id")
			return when (val kind = o.field("kind", what).str("$what.kind")) {
				"element" -> {
					o.only(setOf("kind", "id", "element", "parent", "attributes", "bindings", "arm", "row"), what)
					val parent = o.field("parent", what)
					val attributes = o["attributes"]?.obj("$what.attributes")?.mapValues { (k, v) -> v.str("$what.attributes.$k") } ?: emptyMap()
					val bindings = o["bindings"]?.arr("$what.bindings")?.mapIndexed { n, b ->
						val bo = b.obj("$what.bindings[$n]")
						val value = expr(bo.field("value", what), "$what.bindings[$n].value")
						if (bo.containsKey("property")) {
							bo.only(setOf("property", "value"), "$what.bindings[$n]")
							Binding(oneOf(bo, "property", setOf("value", "checked", "indeterminate"), "$what.bindings[$n]"), value, property = true)
						} else {
							bo.only(setOf("attribute", "value"), "$what.bindings[$n]")
							Binding(bo.field("attribute", what).str("$what.bindings[$n].attribute"), value)
						}
					} ?: emptyList()
					Node.Element(id, o.field("element", what).str("$what.element"), if (parent == Json.Null) null else parent.str("$what.parent"), attributes, bindings, armPlace(o, what), rowPlace(o, what))
				}
				"text" -> {
					o.only(setOf("kind", "id", "parent", "parts", "arm", "row"), what)
					val parts = o.field("parts", what).arr("$what.parts").mapIndexed { n, p -> part(p, "$what.parts[$n]") }
					Node.Text(id, o.field("parent", what).str("$what.parent"), parts, armPlace(o, what), rowPlace(o, what))
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
				o.only(setOf("op", "route", "params"), what)
				val params = o.field("params", what).obj("$what.params").entries.associateTo(LinkedHashMap()) { (k, v) -> k to v.str("$what.params.$k") }
				return Op.Navigate(o.field("route", what).str("$what.route"), params)
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
				return Op.Command(o.field("node", what).str("$what.node"), command, preventScroll)
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
