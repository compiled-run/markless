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

	/** An input's text, as `String(value)`. */
	data class Property(override val node: String, val name: String, val value: String) : JournalEntry {
		override fun toJson() = "{\"op\":\"property\",\"node\":${jsonString(node)},\"name\":${jsonString(name)},\"value\":${jsonString(value)}}"
	}

	/** A styled cell's new value; [node] is the cell id. */
	data class State(override val node: String, val value: Scalar) : JournalEntry {
		override fun toJson() = "{\"op\":\"state\",\"cell\":${jsonString(node)},\"value\":${jsonScalar(value)}}"
	}

	/** Shows arm [index] of a branch (null: none). */
	data class Arm(override val node: String, val index: Int?) : JournalEntry {
		override fun toJson() = "{\"op\":\"arm\",\"node\":${jsonString(node)},\"index\":${index ?: "null"}}"
	}
}

/** `JSON.stringify` of a scalar: non-finite numbers are `null`. */
fun jsonScalar(v: Scalar): String = when (v) {
	Scalar.Null -> "null"
	is Scalar.Str -> jsonString(v.value)
	is Scalar.Bool -> v.value.toString()
	is Scalar.Num -> if (v.value.isNaN() || v.value.isInfinite()) "null" else JsString.number(v.value)
}

/** Where cells with a storage key keep their values across launches. */
interface Store {
	fun get(key: String): Scalar?
	fun set(key: String, value: Scalar)
}

class MemoryStore(private val values: MutableMap<String, Scalar> = HashMap()) : Store {
	override fun get(key: String): Scalar? = values[key]
	override fun set(key: String, value: Scalar) { values[key] = value }
}

/** Runs handler ops on cells and reports what changed on shown nodes as journal entries, in document order. Free of android.*. */
class Runtime(val payload: Payload, private val store: Store = MemoryStore()) {
	private val values = LinkedHashMap<String, Scalar>().apply { for (c in payload.cells) put(c.id, c.storageKey?.let(store::get) ?: c.initial) }
	private val storageKeys = payload.cells.mapNotNull { c -> c.storageKey?.let { c.id to it } }.toMap()
	private val handlers = payload.handlers.associateBy { it.id }
	private val byId = payload.nodes.associateBy { it.id }

	fun value(cell: String): Scalar = values[cell] ?: throw MarklessRuntimeError("unknown cell \"$cell\"")

	private var eventValue: String? = null

	fun evaluate(e: Expr): Scalar = when (e) {
		Expr.EventValue -> Scalar.Str(eventValue ?: throw MarklessRuntimeError("the event value read outside an input handler"))
		is Expr.CellRef -> value(e.cell)
		is Expr.Literal -> e.value
		is Expr.Unary -> Js.unary(e.op, evaluate(e.value))
		is Expr.Binary -> { val l = evaluate(e.left); Js.binary(e.op, l, evaluate(e.right)) }
		is Expr.Logical -> {
			val l = evaluate(e.left)
			when (e.op) {
				"&&" -> if (Js.truthy(l)) evaluate(e.right) else l
				"||" -> if (Js.truthy(l)) l else evaluate(e.right)
				else -> if (l == Scalar.Null) evaluate(e.right) else l
			}
		}
		is Expr.If -> if (Js.truthy(evaluate(e.test))) evaluate(e.whenTrue) else evaluate(e.whenFalse)
		is Expr.Template -> Scalar.Str(e.parts.joinToString("") { if (it is String) it else Js.toStr(evaluate(it as Expr)) })
		is Expr.Length -> when (val v = evaluate(e.value)) {
			is Scalar.Str -> Scalar.Num(v.value.length.toDouble())
			else -> throw MarklessRuntimeError(".length of a ${if (v == Scalar.Null) "null" else v::class.simpleName}")
		}
		is Expr.Call -> Js.call(e.name, e.arguments.map(::evaluate))
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

	fun attribute(binding: Binding): String? = AttributeValue.of(binding.name, evaluate(binding.value))

	/** `String(value ?? '')`, as an input's `value` property reads. */
	fun property(binding: Binding): String = evaluate(binding.value).let { if (it == Scalar.Null) "" else Js.toStr(it) }

	fun property(node: String, name: String): String {
		val e = byId[node] as? Node.Element ?: throw MarklessRuntimeError("unknown element \"$node\"")
		return property(e.bindings.firstOrNull { it.property && it.name == name } ?: throw MarklessRuntimeError("\"$node\" has no $name property binding"))
	}

	/** Every shown text node's string, in document order. */
	fun texts(): List<Pair<String, String>> = payload.nodes.filter { it is Node.Text && isShown(it) }.map { it.id to text(it.id) }

	/** Every shown element's bound attributes as written. */
	fun attributes(): List<Triple<String, String, String?>> = payload.nodes.filterIsInstance<Node.Element>().filter { isShown(it) }.flatMap { e -> e.bindings.filter { !it.property }.map { Triple(e.id, it.name, attribute(it)) } }

	/** Every shown input's bound `value`. */
	fun properties(): List<Triple<String, String, String>> = payload.nodes.filterIsInstance<Node.Element>().filter { isShown(it) }.flatMap { e -> e.bindings.filter { it.property }.map { Triple(e.id, it.name, property(it)) } }

	/** Every shown branch's chosen arm. */
	fun arms(): List<Pair<String, Int?>> = payload.nodes.filterIsInstance<Node.Branch>().filter { isShown(it) }.map { it.id to armOf(it) }

	fun handlerFor(host: String, event: EventName): String? = payload.events.firstOrNull { it.host == host && it.event == event }?.handler

	/** Runs the handler for [event] on [host]; an `input` event carries the field's whole text as [value]. */
	fun dispatch(host: String, event: EventName, value: String? = null): List<JournalEntry> {
		if ((event == EventName.Input) != (value != null)) throw MarklessRuntimeError("an ${event.wire} event ${if (value == null) "needs" else "carries no"} a value")
		val handlerId = handlerFor(host, event) ?: throw MarklessRuntimeError("no ${event.wire} handler on \"$host\"")
		val handler = handlers[handlerId] ?: throw MarklessRuntimeError("unknown handler \"$handlerId\"")
		val cellsBefore = HashMap(values)
		val beforeProperties = properties().associate { (n, a, v) -> (n to a) to v }.toMutableMap()
		// The edited field already shows what was typed, so its own value counts as written.
		if (value != null) beforeProperties[host to "value"] = value
		val beforeTexts = texts().toMap()
		val beforeAttributes = attributes().associate { (n, a, v) -> (n to a) to v }
		val beforeArms = arms().toMap()
		eventValue = value
		try {
			for (op in handler.ops) when (op) {
				is Op.Assign -> {
					val v = evaluate(op.value)
					values[op.cell] = v
					storageKeys[op.cell]?.let { store.set(it, v) }
				}
			}
		} finally {
			eventValue = null
		}
		val afterProperties = properties().associate { (n, a, v) -> (n to a) to v }
		val afterTexts = texts().toMap()
		val afterAttributes = attributes().associate { (n, a, v) -> (n to a) to v }
		val afterArms = arms().toMap()
		val journal = ArrayList<JournalEntry>()
		for (c in payload.cells) if (c.styled && !sameValue(cellsBefore.getValue(c.id), values.getValue(c.id))) journal.add(JournalEntry.State(c.id, values.getValue(c.id)))
		for (node in payload.nodes) when (node) {
			is Node.Text -> {
				val b = beforeTexts[node.id]; val a = afterTexts[node.id]
				if (b != null && a != null && a != b) journal.add(JournalEntry.Text(node.id, a))
			}
			is Node.Branch -> if (node.id in beforeArms && node.id in afterArms && beforeArms[node.id] != afterArms[node.id]) journal.add(JournalEntry.Arm(node.id, afterArms[node.id]))
			is Node.Element -> for (binding in node.bindings) {
				val key = node.id to binding.name
				if (binding.property) {
					if (key in beforeProperties && key in afterProperties && beforeProperties[key] != afterProperties[key]) journal.add(JournalEntry.Property(node.id, binding.name, afterProperties.getValue(key)))
				} else if (key in beforeAttributes && key in afterAttributes && beforeAttributes[key] != afterAttributes[key]) journal.add(JournalEntry.Attribute(node.id, binding.name, afterAttributes[key]))
			}
		}
		return journal
	}

	companion object {
		/** `!==` as the reference runtime compares cell values (so NaN always counts as a change). */
		private fun sameValue(a: Scalar, b: Scalar): Boolean = Js.strictEquals(a, b)

		fun strictEquals(a: Scalar, b: Scalar): Boolean = Js.strictEquals(a, b)
	}
}
