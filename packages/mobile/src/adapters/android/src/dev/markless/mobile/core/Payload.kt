package dev.markless.mobile.core

const val NATIVE_VIEW_VERSION = "markless.native-view/0"

sealed interface Scalar {
	data class Num(val value: Double) : Scalar
	data class Str(val value: String) : Scalar
	data class Bool(val value: Boolean) : Scalar
}

sealed interface TextPart {
	data class Literal(val text: String) : TextPart
	data class CellValue(val cell: String) : TextPart
}

sealed interface Node {
	val id: String
	val parent: String?

	data class Element(override val id: String, val element: String, override val parent: String?) : Node
	data class Text(override val id: String, override val parent: String, val parts: List<TextPart>) : Node
}

enum class EventName(val wire: String) { Activate("activate") }

sealed interface Op {
	data class Add(val cell: String, val value: Double) : Op
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
					if (parent !is Node.Element) throw MarklessDecodeError("node \"${node.id}\" has a text node as its parent")
				} else if (node is Node.Text) throw MarklessDecodeError("text node \"${node.id}\" has no parent")
				if (seen.put(node.id, node) != null) throw MarklessDecodeError("duplicate node \"${node.id}\"")
				if (node is Node.Text) for (part in node.parts) if (part is TextPart.CellValue && part.cell !in cellIds) throw MarklessDecodeError("text node \"${node.id}\" reads unknown cell \"${part.cell}\"")
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
					o.only(setOf("kind", "id", "element", "parent"), what)
					val parent = o.field("parent", what)
					Node.Element(id, o.field("element", what).str("$what.element"), if (parent == Json.Null) null else parent.str("$what.parent"))
				}
				"text" -> {
					o.only(setOf("kind", "id", "parent", "parts"), what)
					val parts = o.field("parts", what).arr("$what.parts").mapIndexed { n, p -> part(p, "$what.parts[$n]") }
					Node.Text(id, o.field("parent", what).str("$what.parent"), parts)
				}
				else -> throw MarklessDecodeError("$what has unknown node kind \"$kind\"")
			}
		}

		private fun part(v: Json, what: String): TextPart {
			val o = v.obj(what)
			return when {
				o.containsKey("text") -> { o.only(setOf("text"), what); TextPart.Literal(o.field("text", what).str("$what.text")) }
				o.containsKey("cell") -> { o.only(setOf("cell"), what); TextPart.CellValue(o.field("cell", what).str("$what.cell")) }
				else -> throw MarklessDecodeError("$what is neither a text nor a cell part")
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
			return when (val name = o.field("op", what).str("$what.op")) {
				"add" -> {
					o.only(setOf("op", "cell", "value"), what)
					val cell = o.field("cell", what).str("$what.cell")
					if (cell !in cells) throw MarklessDecodeError("$what writes unknown cell \"$cell\"")
					Op.Add(cell, integer(o.field("value", what).num("$what.value"), "$what.value"))
				}
				else -> throw MarklessDecodeError("$what has unknown op \"$name\"")
			}
		}
	}
}
