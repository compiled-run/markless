package dev.markless.mobile.core

class MarklessRuntimeError(message: String) : RuntimeException(message)

sealed interface JournalEntry {
	val node: String
	fun toJson(): String

	data class Text(override val node: String, val value: String) : JournalEntry {
		override fun toJson() = "{\"op\":\"text\",\"node\":${jsonString(node)},\"value\":${jsonString(value)}}"
	}

	/** [value] null removes the attribute; "" is bare. */
	data class Attribute(override val node: String, val name: String, val value: String?) : JournalEntry {
		override fun toJson() = "{\"op\":\"attribute\",\"node\":${jsonString(node)},\"name\":${jsonString(name)},\"value\":${value?.let(::jsonString) ?: "null"}}"
	}

	/** Shows arm [index] of a branch (null: none). */
	data class Arm(override val node: String, val index: Int?) : JournalEntry {
		override fun toJson() = "{\"op\":\"arm\",\"node\":${jsonString(node)},\"index\":${index ?: "null"}}"
	}
}

/** Runs handler ops on cells and reports what changed on shown nodes as journal entries, in document order. Free of android.*. */
class Runtime(val payload: Payload) {
	private val values = LinkedHashMap<String, Scalar>().apply { for (c in payload.cells) put(c.id, c.initial) }
	private val handlers = payload.handlers.associateBy { it.id }
	private val byId = payload.nodes.associateBy { it.id }

	fun value(cell: String): Scalar = values[cell] ?: throw MarklessRuntimeError("unknown cell \"$cell\"")

	fun evaluate(e: Expr): Scalar = when (e) {
		is Expr.CellRef -> value(e.cell)
		is Expr.Literal -> e.value
		is Expr.Not -> Scalar.Bool(!JsString.truthy(evaluate(e.operand)))
		is Expr.If -> if (JsString.truthy(evaluate(e.test))) evaluate(e.whenTrue) else evaluate(e.whenFalse)
		is Expr.Equals -> Scalar.Bool(strictEquals(evaluate(e.left), evaluate(e.right)))
	}

	fun armOf(branch: Node.Branch): Int? = if (JsString.truthy(evaluate(branch.test))) 0 else if (branch.arms > 1) 1 else null

	fun isShown(node: Node): Boolean {
		val a = node.arm ?: return true
		val b = byId[a.branch] as? Node.Branch ?: return false
		return isShown(b) && armOf(b) == a.index
	}

	fun text(node: String): String {
		val t = byId[node] as? Node.Text ?: throw MarklessRuntimeError("unknown text node \"$node\"")
		return buildString {
			for (p in t.parts) when (p) {
				is TextPart.Literal -> append(p.text)
				is TextPart.Value -> append(JsString.of(evaluate(p.expr)))
			}
		}
	}

	fun attribute(element: Node.Element, binding: Binding): String? = AttributeValue.of(binding.attribute, evaluate(binding.value))

	/** Every shown text node's string, in document order. */
	fun texts(): List<Pair<String, String>> = payload.nodes.filter { it is Node.Text && isShown(it) }.map { it.id to text(it.id) }

	/** Every shown element's bound attributes as written. */
	fun attributes(): List<Triple<String, String, String?>> = payload.nodes.filterIsInstance<Node.Element>().filter { isShown(it) }.flatMap { e -> e.bindings.map { Triple(e.id, it.attribute, attribute(e, it)) } }

	/** Every shown branch's chosen arm. */
	fun arms(): List<Pair<String, Int?>> = payload.nodes.filterIsInstance<Node.Branch>().filter { isShown(it) }.map { it.id to armOf(it) }

	fun handlerFor(host: String, event: EventName): String? = payload.events.firstOrNull { it.host == host && it.event == event }?.handler

	fun dispatch(host: String, event: EventName): List<JournalEntry> {
		val handler = handlerFor(host, event) ?: throw MarklessRuntimeError("no ${event.wire} handler on \"$host\"")
		return run(handler)
	}

	fun run(handlerId: String): List<JournalEntry> {
		val handler = handlers[handlerId] ?: throw MarklessRuntimeError("unknown handler \"$handlerId\"")
		val beforeTexts = texts().toMap()
		val beforeAttributes = attributes().associate { (n, a, v) -> (n to a) to v }
		val beforeArms = arms().toMap()
		for (op in handler.ops) {
			val before = value(op.cell)
			values[op.cell] = when (op) {
				is Op.Add -> Scalar.Num((before as? Scalar.Num ?: throw MarklessRuntimeError("add on \"${op.cell}\", which does not hold a number")).value + op.value)
				is Op.Set -> op.value
				is Op.Toggle -> Scalar.Bool(!JsString.truthy(before))
			}
		}
		val afterTexts = texts().toMap()
		val afterAttributes = attributes().associate { (n, a, v) -> (n to a) to v }
		val afterArms = arms().toMap()
		val journal = ArrayList<JournalEntry>()
		for (node in payload.nodes) when (node) {
			is Node.Text -> {
				val b = beforeTexts[node.id]; val a = afterTexts[node.id]
				if (b != null && a != null && a != b) journal.add(JournalEntry.Text(node.id, a))
			}
			is Node.Branch -> if (node.id in beforeArms && node.id in afterArms && beforeArms[node.id] != afterArms[node.id]) journal.add(JournalEntry.Arm(node.id, afterArms[node.id]))
			is Node.Element -> for (binding in node.bindings) {
				val key = node.id to binding.attribute
				if (key in beforeAttributes && key in afterAttributes && beforeAttributes[key] != afterAttributes[key]) journal.add(JournalEntry.Attribute(node.id, binding.attribute, afterAttributes[key]))
			}
		}
		return journal
	}

	companion object {
		/** JavaScript's `===` on scalars: NaN is unequal to itself, 0 equals -0. */
		fun strictEquals(a: Scalar, b: Scalar): Boolean = when {
			a is Scalar.Num && b is Scalar.Num -> a.value == b.value
			a is Scalar.Str && b is Scalar.Str -> a.value == b.value
			a is Scalar.Bool && b is Scalar.Bool -> a.value == b.value
			else -> false
		}
	}
}
