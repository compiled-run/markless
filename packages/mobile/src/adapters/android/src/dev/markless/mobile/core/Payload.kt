package dev.markless.mobile.core

const val NATIVE_VIEW_VERSION = "markless.native-view/0"

sealed interface Scalar {
	data object Null : Scalar
	data class Num(val value: Double) : Scalar
	data class Str(val value: String) : Scalar
	data class Bool(val value: Boolean) : Scalar
}

/** A value computed from cells with ECMAScript's meaning (see [Js]). */
sealed interface Expr {
	data class CellRef(val cell: String) : Expr
	data class Literal(val value: Scalar) : Expr
	data class Unary(val op: String, val value: Expr) : Expr
	data class Binary(val op: String, val left: Expr, val right: Expr) : Expr
	data class Logical(val op: String, val left: Expr, val right: Expr) : Expr
	data class If(val test: Expr, val whenTrue: Expr, val whenFalse: Expr) : Expr
	/** Each part is a literal string or an expression read with `String(value)`. */
	data class Template(val parts: List<Any>) : Expr
	data class Length(val value: Expr) : Expr
	data class Call(val name: String, val arguments: List<Expr>) : Expr
}

sealed interface TextPart {
	data class Literal(val text: String) : TextPart
	data class Value(val expr: Expr) : TextPart
}

data class ArmPlace(val branch: String, val index: Int)

data class Binding(val attribute: String, val value: Expr)

sealed interface Node {
	val id: String
	val parent: String?
	val arm: ArmPlace?

	data class Element(override val id: String, val element: String, override val parent: String?, val attributes: Map<String, String> = emptyMap(), val bindings: List<Binding> = emptyList(), override val arm: ArmPlace? = null) : Node
	data class Text(override val id: String, override val parent: String, val parts: List<TextPart>, override val arm: ArmPlace? = null) : Node
	data class Branch(override val id: String, override val parent: String?, val test: Expr, val arms: Int, override val arm: ArmPlace? = null) : Node
}

enum class EventName(val wire: String) { Activate("activate") }

sealed interface Op {
	val cell: String

	/** The cell takes the expression's value, evaluated before the write. */
	data class Assign(override val cell: String, val value: Expr) : Op
}

data class Cell(val id: String, val name: String, val initial: Scalar, val storageKey: String? = null)
data class Event(val host: String, val event: EventName, val handler: String)
data class Handler(val id: String, val ops: List<Op>)

data class Payload(
	val component: String,
	val cells: List<Cell>,
	val nodes: List<Node>,
	val events: List<Event>,
	val handlers: List<Handler>,
) {
	companion object {
		fun decode(bytes: ByteArray): Payload = decode(Json.parse(bytes))

		fun decode(json: Json): Payload {
			val root = json.obj("payload")
			root.only(setOf("version", "component", "cells", "nodes", "events", "handlers"), "payload")
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
					if (parent !is Node.Element) throw MarklessDecodeError("node \"${node.id}\" has a ${if (parent is Node.Text) "text" else "branch"} node as its parent")
				} else if (node is Node.Text) throw MarklessDecodeError("text node \"${node.id}\" has no parent")
				node.arm?.let { a ->
					val b = seen[a.branch] as? Node.Branch ?: throw MarklessDecodeError("node \"${node.id}\" sits in an arm of \"${a.branch}\", which is not a preceding branch")
					if (a.index < 0 || a.index >= b.arms) throw MarklessDecodeError("node \"${node.id}\" sits in arm ${a.index} of a branch with ${b.arms}")
				}
				if (seen.put(node.id, node) != null) throw MarklessDecodeError("duplicate node \"${node.id}\"")
				val reads = when (node) {
					is Node.Text -> node.parts.filterIsInstance<TextPart.Value>().map { it.expr }
					is Node.Element -> node.bindings.map { it.value }
					is Node.Branch -> listOf(node.test)
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
			return Payload(root.field("component", "payload").str("payload.component"), cells, nodes, events, handlers)
		}

		fun cellsOf(e: Expr): List<String> = when (e) {
			is Expr.CellRef -> listOf(e.cell)
			is Expr.Literal -> emptyList()
			is Expr.Unary -> cellsOf(e.value)
			is Expr.Binary -> cellsOf(e.left) + cellsOf(e.right)
			is Expr.Logical -> cellsOf(e.left) + cellsOf(e.right)
			is Expr.If -> cellsOf(e.test) + cellsOf(e.whenTrue) + cellsOf(e.whenFalse)
			is Expr.Template -> e.parts.filterIsInstance<Expr>().flatMap(::cellsOf)
			is Expr.Length -> cellsOf(e.value)
			is Expr.Call -> e.arguments.flatMap(::cellsOf)
		}

		private val UNARY = setOf("!", "-", "+")
		private val BINARY = setOf("+", "-", "*", "/", "%", "===", "!==", "<", "<=", ">", ">=")
		private val LOGICAL = setOf("&&", "||", "??")
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
				o.containsKey("literal") -> { o.only(setOf("literal"), what); Expr.Literal(o.field("literal", what).let { if (it == Json.Null) Scalar.Null else scalar(it, "$what.literal") }) }
				o.containsKey("unary") -> { o.only(setOf("unary", "value"), what); Expr.Unary(oneOf(o, "unary", UNARY, what), sub("value")) }
				o.containsKey("binary") -> { o.only(setOf("binary", "left", "right"), what); Expr.Binary(oneOf(o, "binary", BINARY, what), sub("left"), sub("right")) }
				o.containsKey("logical") -> { o.only(setOf("logical", "left", "right"), what); Expr.Logical(oneOf(o, "logical", LOGICAL, what), sub("left"), sub("right")) }
				o.containsKey("if") -> { o.only(setOf("if", "whenTrue", "whenFalse"), what); Expr.If(sub("if"), sub("whenTrue"), sub("whenFalse")) }
				o.containsKey("template") -> {
					o.only(setOf("template"), what)
					Expr.Template(o.field("template", what).arr("$what.template").mapIndexed { n, p -> if (p is Json.Str) p.value else expr(p, "$what.template[$n]") })
				}
				o.containsKey("member") -> {
					o.only(setOf("member", "property"), what)
					oneOf(o, "property", setOf("length"), what)
					Expr.Length(sub("member"))
				}
				o.containsKey("call") -> {
					o.only(setOf("call", "arguments"), what)
					Expr.Call(oneOf(o, "call", BUILTINS, what), o.field("arguments", what).arr("$what.arguments").mapIndexed { n, a -> expr(a, "$what.arguments[$n]") })
				}
				else -> throw MarklessDecodeError("$what is an unknown expression (fields ${o.keys})")
			}
		}

		private fun armPlace(o: Map<String, Json>, what: String): ArmPlace? = o["arm"]?.obj("$what.arm")?.let { a ->
			a.only(setOf("branch", "index"), "$what.arm")
			ArmPlace(a.field("branch", what).str("$what.arm.branch"), integer(a.field("index", what).num("$what.arm.index"), "$what.arm.index").toInt())
		}

		private fun scalar(v: Json, what: String): Scalar = when (v) {
			is Json.Num -> Scalar.Num(v.value)
			is Json.Str -> Scalar.Str(v.value)
			is Json.Bool -> Scalar.Bool(v.value)
			else -> throw MarklessDecodeError("$what must be a number, string or boolean")
		}

		private fun integer(v: Double, what: String): Double {
			if (v != Math.floor(v) || v.isInfinite()) throw MarklessDecodeError("$what is $v; native-view/0 carries integers only")
			return v
		}

		private fun cell(v: Json, what: String): Cell {
			val o = v.obj(what)
			o.only(setOf("id", "name", "initial", "storage"), what)
			val storage = o["storage"]?.obj("$what.storage")?.let { it.only(setOf("key"), "$what.storage"); it.field("key", what).str("$what.storage.key") }
			return Cell(o.field("id", what).str("$what.id"), o.field("name", what).str("$what.name"), scalar(o.field("initial", what), "$what.initial"), storage)
		}

		private fun node(v: Json, what: String): Node {
			val o = v.obj(what)
			val id = o.field("id", what).str("$what.id")
			return when (val kind = o.field("kind", what).str("$what.kind")) {
				"element" -> {
					o.only(setOf("kind", "id", "element", "parent", "attributes", "bindings", "arm"), what)
					val parent = o.field("parent", what)
					val attributes = o["attributes"]?.obj("$what.attributes")?.mapValues { (k, v) -> v.str("$what.attributes.$k") } ?: emptyMap()
					val bindings = o["bindings"]?.arr("$what.bindings")?.mapIndexed { n, b ->
						val bo = b.obj("$what.bindings[$n]")
						bo.only(setOf("attribute", "value"), "$what.bindings[$n]")
						Binding(bo.field("attribute", what).str("$what.bindings[$n].attribute"), expr(bo.field("value", what), "$what.bindings[$n].value"))
					} ?: emptyList()
					Node.Element(id, o.field("element", what).str("$what.element"), if (parent == Json.Null) null else parent.str("$what.parent"), attributes, bindings, armPlace(o, what))
				}
				"text" -> {
					o.only(setOf("kind", "id", "parent", "parts", "arm"), what)
					val parts = o.field("parts", what).arr("$what.parts").mapIndexed { n, p -> part(p, "$what.parts[$n]") }
					Node.Text(id, o.field("parent", what).str("$what.parent"), parts, armPlace(o, what))
				}
				"branch" -> {
					o.only(setOf("kind", "id", "parent", "test", "arms", "arm"), what)
					val parent = o.field("parent", what)
					val arms = integer(o.field("arms", what).num("$what.arms"), "$what.arms").toInt()
					if (arms != 1 && arms != 2) throw MarklessDecodeError("$what has $arms arms; native-view/0 has 1 or 2")
					Node.Branch(id, if (parent == Json.Null) null else parent.str("$what.parent"), expr(o.field("test", what), "$what.test"), arms, armPlace(o, what))
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

		private fun handler(v: Json, what: String, cells: Set<String>): Handler {
			val o = v.obj(what)
			o.only(setOf("id", "ops"), what)
			val ops = o.field("ops", what).arr("$what.ops").mapIndexed { n, op -> op(op, "$what.ops[$n]", cells) }
			return Handler(o.field("id", what).str("$what.id"), ops)
		}

		private fun op(v: Json, what: String, cells: Set<String>): Op {
			val o = v.obj(what)
			val name = o.field("op", what).str("$what.op")
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
