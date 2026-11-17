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

	fun evaluate(e: Expr): Scalar = when (e) {
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
		for (op in handler.ops) when (op) {
			is Op.Assign -> {
				val v = evaluate(op.value)
				values[op.cell] = v
				storageKeys[op.cell]?.let { store.set(it, v) }
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
		fun strictEquals(a: Scalar, b: Scalar): Boolean = Js.strictEquals(a, b)
	}
}
