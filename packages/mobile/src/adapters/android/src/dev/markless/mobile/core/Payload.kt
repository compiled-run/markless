package dev.markless.mobile.core

const val NATIVE_VIEW_VERSION = "markless.native-view/0"

sealed interface Scalar {
	data class Num(val value: Double) : Scalar
	data class Str(val value: String) : Scalar
	data class Bool(val value: Boolean) : Scalar
}

/** A value computed from cells: JavaScript truthiness for `not` and `if`, `===` for `equals`. */
sealed interface Expr {
	data class CellRef(val cell: String) : Expr
	data class Literal(val value: Scalar) : Expr
	data class Not(val operand: Expr) : Expr
	data class If(val test: Expr, val whenTrue: Expr, val whenFalse: Expr) : Expr
	data class Equals(val left: Expr, val right: Expr) : Expr
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

	data class Add(override val cell: String, val value: Double) : Op
	data class Set(override val cell: String, val value: Scalar) : Op
	data class Toggle(override val cell: String) : Op
}

data class Cell(val id: String, val name: String, val initial: Scalar)
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
			is Expr.Not -> cellsOf(e.operand)
			is Expr.If -> cellsOf(e.test) + cellsOf(e.whenTrue) + cellsOf(e.whenFalse)
			is Expr.Equals -> cellsOf(e.left) + cellsOf(e.right)
		}

		private fun expr(v: Json, what: String): Expr {
			val o = v.obj(what)
			return when {
				o.containsKey("cell") -> { o.only(setOf("cell"), what); Expr.CellRef(o.field("cell", what).str("$what.cell")) }
				o.containsKey("literal") -> { o.only(setOf("literal"), what); Expr.Literal(scalar(o.field("literal", what), "$what.literal")) }
				o.containsKey("not") -> { o.only(setOf("not"), what); Expr.Not(expr(o.field("not", what), "$what.not")) }
				o.containsKey("if") -> { o.only(setOf("if", "whenTrue", "whenFalse"), what); Expr.If(expr(o.field("if", what), "$what.if"), expr(o.field("whenTrue", what), "$what.whenTrue"), expr(o.field("whenFalse", what), "$what.whenFalse")) }
				o.containsKey("equals") -> {
					o.only(setOf("equals"), what)
					val pair = o.field("equals", what).arr("$what.equals")
					if (pair.size != 2) throw MarklessDecodeError("$what.equals has ${pair.size} operands, not 2")
					Expr.Equals(expr(pair[0], "$what.equals[0]"), expr(pair[1], "$what.equals[1]"))
				}
				else -> throw MarklessDecodeError("$what is an unknown expression (fields ${o.keys})")
			}
		}

		private fun armPlace(o: Map<String, Json>, what: String): ArmPlace? = o["arm"]?.obj("$what.arm")?.let { a ->
			a.only(setOf("branch", "index"), "$what.arm")
			ArmPlace(a.field("branch", what).str("$what.arm.branch"), integer(a.field("index", what).num("$what.arm.index"), "$what.arm.index").toInt())
		}

		private fun scalar(v: Json, what: String): Scalar = when (v) {
			is Json.Num -> Scalar.Num(integer(v.value, what))
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
			o.only(setOf("id", "name", "initial"), what)
			return Cell(o.field("id", what).str("$what.id"), o.field("name", what).str("$what.name"), scalar(o.field("initial", what), "$what.initial"))
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
			val cell = o.field("cell", what).str("$what.cell")
			if (name in setOf("add", "set", "toggle") && cell !in cells) throw MarklessDecodeError("$what writes unknown cell \"$cell\"")
			return when (name) {
				"add" -> {
					o.only(setOf("op", "cell", "value"), what)
					Op.Add(cell, integer(o.field("value", what).num("$what.value"), "$what.value"))
				}
				"set" -> {
					o.only(setOf("op", "cell", "value"), what)
					Op.Set(cell, scalar(o.field("value", what), "$what.value"))
				}
				"toggle" -> {
					o.only(setOf("op", "cell"), what)
					Op.Toggle(cell)
				}
				else -> throw MarklessDecodeError("$what has unknown op \"$name\"")
			}
		}
	}
}
