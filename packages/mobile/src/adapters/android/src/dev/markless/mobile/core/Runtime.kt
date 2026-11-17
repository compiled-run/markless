package dev.markless.mobile.core

class MarklessRuntimeError(message: String) : RuntimeException(message)

data class JournalEntry(val node: String, val value: String) {
	fun toJson(): String = "{\"op\":\"text\",\"node\":${jsonString(node)},\"value\":${jsonString(value)}}"
}

/** Runs handler ops on cells and reports, as journal entries, every text node whose string changed. Free of android.* so the JVM conformance test runs it. */
class Runtime(val payload: Payload) {
	private val values = LinkedHashMap<String, Scalar>().apply { for (c in payload.cells) put(c.id, c.initial) }
	private val handlers = payload.handlers.associateBy { it.id }
	private val texts = payload.nodes.filterIsInstance<Node.Text>()
	private val rendered = HashMap<String, String>().apply { for (t in texts) put(t.id, format(t)) }

	fun value(cell: String): Scalar = values[cell] ?: throw MarklessRuntimeError("unknown cell \"$cell\"")

	fun text(node: String): String = rendered[node] ?: throw MarklessRuntimeError("unknown text node \"$node\"")

	fun handlerFor(host: String, event: EventName): String? = payload.events.firstOrNull { it.host == host && it.event == event }?.handler

	fun dispatch(host: String, event: EventName): List<JournalEntry> {
		val handler = handlerFor(host, event) ?: throw MarklessRuntimeError("no ${event.wire} handler on \"$host\"")
		return run(handler)
	}

	fun run(handlerId: String): List<JournalEntry> {
		val handler = handlers[handlerId] ?: throw MarklessRuntimeError("unknown handler \"$handlerId\"")
		val changed = HashSet<String>()
		for (op in handler.ops) {
			val before = value(op.cell)
			val after = when (op) {
				is Op.Add -> Scalar.Num((before as? Scalar.Num ?: throw MarklessRuntimeError("add on \"${op.cell}\", which does not hold a number")).value + op.value)
				is Op.Set -> op.value
				is Op.Toggle -> Scalar.Bool(!JsString.truthy(before))
			}
			if (after != before) changed.add(op.cell)
			values[op.cell] = after
		}
		val journal = ArrayList<JournalEntry>()
		for (t in texts) {
			if (t.parts.none { it is TextPart.CellValue && it.cell in changed }) continue
			val next = format(t)
			if (next != rendered[t.id]) {
				rendered[t.id] = next
				journal.add(JournalEntry(t.id, next))
			}
		}
		return journal
	}

	private fun format(t: Node.Text): String = buildString {
		for (p in t.parts) when (p) {
			is TextPart.Literal -> append(p.text)
			is TextPart.CellValue -> append(JsString.of(value(p.cell)))
		}
	}
}
