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
	data class State(override val node: String, val value: JsValue) : JournalEntry {
		override fun toJson() = "{\"op\":\"state\",\"cell\":${jsonString(node)},\"value\":${jsonValue(value)}}"
	}

	/** A list's row keys in their new order: rows whose key left go, new keys are built, the rest move. */
	data class Rows(override val node: String, val keys: List<String>) : JournalEntry {
		override fun toJson() = "{\"op\":\"rows\",\"node\":${jsonString(node)},\"keys\":${keys.joinToString(",", "[", "]", transform = ::jsonString)}}"
	}

	/** Leave this page for the page at [route] with [params]: pushed as a new screen, or in this one's place when [replace]. */
	data class Navigate(override val node: String, val params: Map<String, String>, val replace: Boolean = false) : JournalEntry {
		val route get() = node
		override fun toJson() = "{\"op\":\"navigate\",\"route\":${jsonString(node)},\"params\":${params.entries.joinToString(",", "{", "}") { "${jsonString(it.key)}:${jsonString(it.value)}" }}${if (replace) ",\"replace\":true" else ""}}"
	}

	/** The page's title text changed; [node] is empty. */
	data class Title(val value: String) : JournalEntry {
		override val node get() = ""
		override fun toJson() = "{\"op\":\"title\",\"value\":${jsonString(value)}}"
	}

	/** Run a device call now; [node] is the call's name. With [result], settle that task cell with what it gives. */
	data class Call(override val node: String, val arguments: List<JsValue>, val result: String?, val obj: String? = null, val resume: String? = null) : JournalEntry {
		override fun toJson() = "{\"op\":\"call\",\"call\":${jsonString(node)}${obj?.let { ",\"object\":${jsonString(it)}" } ?: ""},\"arguments\":${arguments.joinToString(",", "[", "]", transform = ::jsonValue)}${result?.let { ",\"result\":${jsonString(it)}" } ?: ""}${resume?.let { ",\"resume\":${jsonString(it)}" } ?: ""}}"
	}

	/** The device object [node] ended: its owner left the screen. */
	data class Release(override val node: String) : JournalEntry {
		override fun toJson() = "{\"op\":\"release\",\"object\":${jsonString(node)}}"
	}

	/** A `<dialog>` put in the top layer ([open]) or taken out. */
	data class Dialog(override val node: String, val open: Boolean) : JournalEntry {
		override fun toJson() = "{\"op\":\"dialog\",\"node\":${jsonString(node)},\"open\":$open}"
	}

	/** A `command` op the handler ran, after every other entry, in order. */
	data class Command(override val node: String, val command: String, val preventScroll: Boolean) : JournalEntry {
		override fun toJson() = "{\"op\":\"command\",\"node\":${jsonString(node)},\"command\":${jsonString(command)}${if (preventScroll) ",\"preventScroll\":true" else ""}}"
	}

	/** Shows arm [index] of a branch (null: none). */
	data class Arm(override val node: String, val index: Int?) : JournalEntry {
		override fun toJson() = "{\"op\":\"arm\",\"node\":${jsonString(node)},\"index\":${index ?: "null"}}"
	}

	/** A system sheet's `open` turned truthy (present it) or falsy (dismiss it, unless the platform already has). */
	data class Sheet(override val node: String, val open: Boolean) : JournalEntry {
		override fun toJson() = "{\"op\":\"sheet\",\"node\":${jsonString(node)},\"open\":$open}"
	}
}

/** `JSON.stringify` of a value: non-finite numbers are `null`. */
fun jsonValue(v: JsValue): String = when (v) {
	JsValue.Null -> "null"
	is JsValue.Str -> jsonString(v.value)
	is JsValue.Bool -> v.value.toString()
	is JsValue.Num -> if (v.value.isNaN() || v.value.isInfinite()) "null" else JsString.number(v.value)
	is JsValue.Arr -> v.items.joinToString(",", "[", "]", transform = ::jsonValue)
	is JsValue.Obj -> v.fields.entries.joinToString(",", "{", "}") { "${jsonString(it.key)}:${jsonValue(it.value)}" }
}

/** Where cells with a storage key keep their values across launches. */
interface Store {
	fun get(key: String): JsValue?
	fun set(key: String, value: JsValue)
}

class MemoryStore(private val values: MutableMap<String, JsValue> = HashMap()) : Store {
	override fun get(key: String): JsValue? = values[key]
	override fun set(key: String, value: JsValue) { values[key] = value }
}

/** What names mean inside a list row or an arrow function: the row items by repeat id, the function's parameters. */
/** [keys]: the row keys by repeat id, where a row's own state is read. */
data class Scope(val items: Map<String, JsValue> = emptyMap(), val locals: Map<String, JsValue> = emptyMap(), val keys: Map<String, String> = emptyMap()) {
	companion object {
		val EMPTY = Scope()
	}
}

/** One shown copy of a node: the node itself outside lists, one per row inside one (`<id>@<key>`). */
data class Instance(val id: String, val node: Node, val scope: Scope, val rowKey: String? = null)

/** A list row: its key (`String()` of the item at the key path) and item. */
data class Row(val key: String, val item: JsValue)

/** Runs handler ops on cells and reports what changed on shown nodes as journal entries, in document order. Free of android.*. */
/** [now]: the device's clock, in ms since 1970 (UTC); a conformance run fixes it. */
class Runtime(val payload: Payload, private val store: Store = MemoryStore(), val params: Map<String, String> = emptyMap(), private val now: () -> Double = { System.currentTimeMillis().toDouble() }) {
	private val opened = now()
	private val values = LinkedHashMap<String, JsValue>().apply { for (c in payload.cells) put(c.id, if (c.clock) JsValue.Num(opened) else c.storageKey?.let(store::get) ?: c.initial) }
	/** `idle` and `visible` handlers that ran, by `<event>\u0000<instance>`; an instance that leaves the screen is forgotten. */
	private val fired = HashSet<String>()
	private val storageKeys = payload.cells.mapNotNull { c -> c.storageKey?.let { c.id to it } }.toMap()
	private val handlers = payload.handlers.associateBy { it.id }
	private val continuations = HashMap<String, Continuation>().also { found ->
		fun collect(ops: List<Op>) {
			for (op in ops) if (op is Op.Call && op.after != null) {
				found[op.after.id] = op.after
				collect(op.after.ops)
			}
		}
		for (h in payload.handlers) collect(h.ops)
	}
	/** Row state's list by cell id: its values are kept as `<cell>@<key>`. */
	private val rowOfCell = payload.cells.mapNotNull { c -> c.row?.let { c.id to it } }.toMap()
	private val byId = payload.nodes.associateBy { it.id }
	private var eventValue: String? = null

	fun value(cell: String): JsValue = values[cell] ?: throw MarklessRuntimeError("unknown cell \"$cell\"")

	/** Where a cell's value is kept: its id, or `<id>@<key>` for a row's own state, read in that row. */
	private fun slot(cell: String, scope: Scope): String {
		val row = rowOfCell[cell] ?: return cell
		val key = scope.keys[row] ?: throw MarklessRuntimeError("the row state $cell read outside its row")
		return "$cell@$key"
	}

	/** A row's state reads its first value until the row writes it. */
	private fun read(cell: String, scope: Scope): JsValue = value(cell).let { values[slot(cell, scope)] ?: it }

	fun node(id: String): Node = byId[id] ?: throw MarklessRuntimeError("unknown node \"$id\"")

	fun evaluate(e: Expr, scope: Scope = Scope.EMPTY): JsValue {
		fun eval(x: Expr) = evaluate(x, scope)
		return when (e) {
			Expr.RouteParams -> JsValue.Obj(params.entries.associateTo(LinkedHashMap()) { it.key to JsValue.Str(it.value) })
			Expr.EventValue -> JsValue.Str(eventValue ?: throw MarklessRuntimeError("the event value read outside an input handler"))
			is Expr.CellRef -> read(e.cell, scope)
			is Expr.Literal -> e.value
			is Expr.Item -> scope.items[e.repeat] ?: throw MarklessRuntimeError("the row item of ${e.repeat} read outside its row")
			is Expr.Local -> scope.locals[e.name] ?: throw MarklessRuntimeError("the parameter ${e.name} read outside its function")
			is Expr.Unary -> Js.unary(e.op, eval(e.value))
			is Expr.Binary -> { val l = eval(e.left); Js.binary(e.op, l, eval(e.right)) }
			is Expr.Logical -> {
				val l = eval(e.left)
				when (e.op) {
					"&&" -> if (Js.truthy(l)) eval(e.right) else l
					"||" -> if (Js.truthy(l)) l else eval(e.right)
					else -> if (l == JsValue.Null) eval(e.right) else l
				}
			}
			is Expr.If -> if (Js.truthy(eval(e.test))) eval(e.whenTrue) else eval(e.whenFalse)
			is Expr.Template -> JsValue.Str(e.parts.joinToString("") { if (it is String) it else Js.toStr(eval(it as Expr)) })
			is Expr.At -> {
				val list = eval(e.list) as? JsValue.Arr ?: throw MarklessRuntimeError("an index into a value that is not an array")
				val at = (eval(e.index) as? JsValue.Num)?.value
				if (at == null || at < 0 || at != Math.floor(at) || at >= list.items.size) JsValue.Null else list.items[at.toInt()]
			}
			is Expr.Member -> {
				val v = eval(e.value)
				when {
					v is JsValue.Str && e.property == "length" -> JsValue.Num(v.value.length.toDouble())
					v is JsValue.Arr && e.property == "length" -> JsValue.Num(v.items.size.toDouble())
					v is JsValue.Arr && Js.element(v, e.property) != null -> Js.element(v, e.property)!!
					v is JsValue.Obj && e.property in v.fields -> v.fields.getValue(e.property)
					else -> throw MarklessRuntimeError(".${e.property} of a value that has none")
				}
			}
			is Expr.ArrayLit -> JsValue.Arr(ArrayList<JsValue>().apply {
				for ((spread, x) in e.items) {
					val v = eval(x)
					if (!spread) add(v) else addAll((v as? JsValue.Arr ?: throw MarklessRuntimeError("a spread of a value that is not an array")).items)
				}
			})
			is Expr.ObjectLit -> JsValue.Obj(LinkedHashMap<String, JsValue>().apply { for ((k, x) in e.entries) put(k, eval(x)) })
			is Expr.Lambda -> throw MarklessRuntimeError("a function value outside a method call")
			is Expr.Method -> {
				val target = eval(e.target)
				val args = e.arguments.map { a ->
					if (a is Expr.Lambda) Js.Arg.Callback { given -> evaluate(a.body, scope.copy(locals = scope.locals + a.params.withIndex().associate { (i, name) -> name to (given.getOrNull(i) ?: JsValue.Null) })) }
					else Js.Arg.Value(eval(a))
				}
				Js.method(e.name, target, args)
			}
			is Expr.Call -> Js.call(e.name, e.arguments.map(::eval), now)
		}
	}

	fun armOf(branch: Node.Branch): Int? {
		val tests = branch.tests ?: return if (Js.truthy(evaluate(branch.test!!))) 0 else if (branch.arms > 1) 1 else null
		for ((i, t) in tests.withIndex()) if (t != null && Js.truthy(evaluate(t))) return i
		return tests.indexOfFirst { it == null }.takeIf { it >= 0 }
	}

	fun isShown(node: Node): Boolean {
		val a = node.arm ?: return true
		val b = byId[a.branch] as? Node.Branch ?: return false
		return isShown(b) && armOf(b) == a.index
	}

	fun rowsOf(repeat: Node.Repeat): List<Row> {
		val list = evaluate(repeat.list) as? JsValue.Arr ?: throw MarklessRuntimeError("${repeat.id} lists a value that is not an array")
		return list.items.map { item ->
			var key = item
			for (step in repeat.key) key = (key as? JsValue.Obj)?.fields?.get(step) ?: throw MarklessRuntimeError("${repeat.id}: a row has no key at ${repeat.key.joinToString(".")}")
			Row(Js.toStr(key), item)
		}
	}

	/** Every shown instance of [node]: one outside lists, one per row inside one. */
	fun instances(node: Node): List<Instance> {
		if (!isShown(node)) return emptyList()
		val r = node.row ?: return listOf(Instance(node.id, node, Scope.EMPTY))
		val repeat = byId[r] as? Node.Repeat ?: return emptyList()
		if (!isShown(repeat)) return emptyList()
		return rowsOf(repeat).map { Instance("${node.id}@${it.key}", node, Scope(items = mapOf(repeat.id to it.item), keys = mapOf(repeat.id to it.key)), it.key) }
	}

	fun text(t: Node.Text, scope: Scope): String = text(t.parts, scope)

	fun text(parts: List<TextPart>, scope: Scope): String = buildString {
		for (p in parts) when (p) {
			is TextPart.Literal -> append(p.text)
			is TextPart.Value -> evaluate(p.expr, scope).let { if (it != JsValue.Null) append(JsString.of(it)) }
		}
	}

	fun attribute(binding: Binding, scope: Scope = Scope.EMPTY): String? = AttributeValue.of(binding.name, evaluate(binding.value, scope))

	/** `String(value ?? '')`, as an input's `value` property reads. */
	fun property(binding: Binding, scope: Scope = Scope.EMPTY): String = evaluate(binding.value, scope).let { if (it == JsValue.Null) "" else Js.toStr(it) }

	fun property(node: String, name: String): String {
		val e = byId[node] as? Node.Element ?: throw MarklessRuntimeError("unknown element \"$node\"")
		return property(e.bindings.firstOrNull { it.property && it.name == name } ?: throw MarklessRuntimeError("\"$node\" has no $name property binding"))
	}

	fun text(instanceId: String): String = texts().firstOrNull { it.first == instanceId }?.second ?: throw MarklessRuntimeError("no shown text \"$instanceId\"")

	/** Every shown text instance's string, in document order. */
	fun texts(): List<Pair<String, String>> = payload.nodes.filterIsInstance<Node.Text>().flatMap { t -> instances(t).map { it.id to text(t, it.scope) } }

	private fun bound(property: Boolean): List<Triple<String, String, Any?>> = payload.nodes.filterIsInstance<Node.Element>().flatMap { e ->
		instances(e).flatMap { inst -> e.bindings.filter { it.property == property }.map { b -> Triple(inst.id, b.name, if (property) property(b, inst.scope) else attribute(b, inst.scope)) } }
	}

	/** Every shown element's bound attributes as written. */
	@Suppress("UNCHECKED_CAST")
	fun attributes(): List<Triple<String, String, String?>> = bound(false) as List<Triple<String, String, String?>>

	/** Every shown input's bound `value`. */
	@Suppress("UNCHECKED_CAST")
	fun properties(): List<Triple<String, String, String>> = bound(true) as List<Triple<String, String, String>>

	/** Every shown branch's chosen arm. */
	fun arms(): List<Pair<String, Int?>> = payload.nodes.filterIsInstance<Node.Branch>().filter { isShown(it) }.map { it.id to armOf(it) }

	/** Every shown list's row keys, in order. */
	fun rows(): List<Pair<String, List<String>>> = payload.nodes.filterIsInstance<Node.Repeat>().filter { isShown(it) }.map { r -> r.id to rowsOf(r).map { it.key } }

	/** Every system sheet and whether its `open` is truthy. */
	fun sheets(): List<Pair<String, Boolean>> = payload.nodes.filterIsInstance<Node.Sheet>().map { it.id to Js.truthy(evaluate(it.open)) }

	/** Each `<dialog>`'s top-layer state; every dialog mounts closed. */
	private val dialogs = LinkedHashMap<String, Boolean>().apply {
		for (n in payload.nodes) if (n is Node.Element && n.element == "dialog") put(n.id, false)
	}

	fun dialogs(): List<Pair<String, Boolean>> = dialogs.entries.map { it.key to it.value }

	fun isDialogOpen(id: String): Boolean = dialogs[id] == true

	fun handlerFor(host: String, event: EventName): String? = payload.events.firstOrNull { it.host == host && it.event == event }?.handler

	/** The page's `<title>` text, null when it has none. */
	fun title(): String? = payload.title?.let { text(it, Scope.EMPTY) }

	/** Runs the handler for [event] on [host] (a row instance as `<node>@<key>`); an `input` event carries the field's whole text as [value]. */
	fun dispatch(host: String, event: EventName, value: String? = null): List<JournalEntry> {
		if ((event == EventName.Input) != (value != null)) throw MarklessRuntimeError("an ${event.wire} event ${if (value == null) "needs" else "carries no"} a value")
		if (event == EventName.Cancel) {
			if (dialogs[host] != true) throw MarklessRuntimeError("\"$host\" is not an open dialog")
			val cancel = handlerFor(host, event)?.let { handlers[it] ?: throw MarklessRuntimeError("unknown handler \"$it\"") }
			return change(host, null) {
				dialogs[host] = false
				cancel?.let { run(it.ops, Scope.EMPTY) } ?: emptyList()
			}
		}
		if (event == EventName.Idle || event == EventName.Visible) {
			val key = "${event.wire}\u0000$host"
			if (key in fired || host !in due(event)) return emptyList()
			fired.add(key)
		}
		// A row's copy (`<node>@<key>`) runs its node's handler in that row; node ids never hold `@`.
		val template = host.substringBefore('@')
		val handlerId = handlerFor(template, event) ?: throw MarklessRuntimeError("no ${event.wire} handler on \"$host\"")
		val scope = (instances(node(template)).firstOrNull { it.id == host } ?: throw MarklessRuntimeError("\"$host\" is not shown")).scope
		val handler = handlers[handlerId] ?: throw MarklessRuntimeError("unknown handler \"$handlerId\"")
		return change(host, value) {
			eventValue = value
			try {
				run(handler.ops, scope)
			} finally {
				eventValue = null
			}
		}
	}

	/** The shown instances with an `idle` (or `visible`) handler that has not run for them, in document order. */
	fun due(event: EventName): List<String> = payload.events.filter { it.event == event }.flatMap { bound ->
		val node = byId[bound.host] ?: return@flatMap emptyList()
		instances(node).map { it.id }.filter { "${event.wire}\u0000$it" !in fired }
	}

	private fun forgetHidden() {
		fired.removeAll { key ->
			val id = key.substringAfter('\u0000')
			val node = byId[id.substringBefore('@')]
			node == null || instances(node).none { it.id == id }
		}
	}

	/** A device call a handler awaited answered: its continuation runs with the answer as its local. */
	fun resume(continuation: String, value: JsValue): List<JournalEntry> {
		val then = continuations[continuation] ?: throw MarklessRuntimeError("no continuation \"$continuation\"")
		return change(null, null) { run(then.ops, Scope(locals = mapOf(then.local to value))) }
	}

	/** That call failed: the handler ends, and the nearest `@catch` around it (if any) takes `{ name, message }`. */
	fun reject(continuation: String, name: String, message: String): List<JournalEntry> {
		val then = continuations[continuation] ?: throw MarklessRuntimeError("no continuation \"$continuation\"")
		val cell = then.catch ?: return emptyList()
		return change(null, null) {
			values[cell] = JsValue.Obj(linkedMapOf("name" to JsValue.Str(name), "message" to JsValue.Str(message)))
			emptyList()
		}
	}

	/** Device objects whose owner node is shown. */
	fun liveObjects(): Set<String> = payload.objects.filter { isShown(byId[it.owner] ?: throw MarklessRuntimeError("${it.id} is owned by unknown node ${it.owner}")) }.mapTo(LinkedHashSet()) { it.id }

	/** Runs ops in order: writes cells and collects the calls (a continuation's id rides on its call); stops at a navigation. */
	private fun run(ops: List<Op>, scope: Scope): List<JournalEntry> {
		val calls = ArrayList<JournalEntry>()
		for (op in ops) when (op) {
			is Op.Navigate -> return listOf(JournalEntry.Navigate(op.route, op.params.mapValues { Js.toStr(evaluate(it.value, scope)) }, op.replace))
			is Op.Call -> calls.add(JournalEntry.Call(op.call, op.arguments.map { evaluate(it, scope) }, op.result, op.obj, op.after?.id))
			is Op.If -> {
				val taken = run(if (Js.truthy(evaluate(op.test, scope))) op.then else op.otherwise, scope)
				if (taken.firstOrNull() is JournalEntry.Navigate) return taken
				calls.addAll(taken)
			}
			is Op.Dialog -> {
				if (op.node !in dialogs) throw MarklessRuntimeError("\"${op.node}\" is not a dialog")
				dialogs[op.node] = op.open
			}
			is Op.Command -> calls.add(JournalEntry.Command(op.node, op.command, op.preventScroll))
			is Op.Assign -> {
				val v = evaluate(op.value, scope)
				values[slot(op.cell, scope)] = v
				storageKeys[op.cell]?.let { store.set(it, v) }
			}
		}
		return calls
	}

	/** A live device value changed: writes its device cell and returns the journal. */
	fun device(cell: String, value: JsValue): List<JournalEntry> {
		if (payload.cells.none { it.id == cell && it.device != null }) throw MarklessRuntimeError("\"$cell\" is not a device cell")
		return change(null, null) { values[cell] = value; emptyList() }
	}

	/** A device call answered: the task cell takes `{ state: 'value', value }`. */
	fun settle(cell: String, value: JsValue): List<JournalEntry> =
		settleWith(cell, JsValue.Obj(linkedMapOf("state" to JsValue.Str("value"), "value" to value)))

	/** A device call failed (`NotAllowedError` when refused): the task cell takes `{ state: 'error', error: { name, message } }`. */
	fun settleError(cell: String, name: String, message: String): List<JournalEntry> =
		settleWith(cell, JsValue.Obj(linkedMapOf("state" to JsValue.Str("error"), "error" to JsValue.Obj(linkedMapOf("name" to JsValue.Str(name), "message" to JsValue.Str(message))))))

	private fun settleWith(cell: String, value: JsValue): List<JournalEntry> {
		if (payload.cells.none { it.id == cell && it.task != null }) throw MarklessRuntimeError("\"$cell\" is not a task cell")
		return change(null, null) { values[cell] = value; emptyList() }
	}

	/** The calls a host starts at mount, one per task cell. */
	fun tasks(): List<JournalEntry.Call> = payload.cells.mapNotNull { c -> c.task?.let { t -> JournalEntry.Call(t.call, t.arguments.map { evaluate(it) }, c.id) } }

	/** Runs [apply] (cell writes, returning its calls or a navigation) and journals styled cells, changed nodes, released objects, then the calls. */
	private inline fun change(host: String?, value: String?, apply: () -> List<JournalEntry>): List<JournalEntry> {
		val cellsBefore = HashMap(values)
		val beforeTexts = texts().toMap()
		val beforeAttributes = attributes().associate { (n, a, v) -> (n to a) to v }
		val beforeProperties = properties().associate { (n, a, v) -> (n to a) to v }.toMutableMap()
		// The edited field already shows what was typed, so its own value counts as written.
		if (value != null && host != null) beforeProperties[host to "value"] = value
		val beforeArms = arms().toMap()
		val beforeRows = rows().toMap()
		val beforeTitle = title()
		val dialogsBefore = HashMap(dialogs)
		val beforeSheets = sheets().toMap()
		val ownedBefore = liveObjects()
		val calls = apply()
		if (calls.firstOrNull() is JournalEntry.Navigate) return calls
		// A row that left takes its state with it; a later row with the same key starts from the first values.
		val kept = rows().flatMap { (list, keys) -> keys.map { "$list\u0000$it" } }.toSet()
		values.keys.removeAll { slot ->
			val list = rowOfCell[slot.substringBefore('@')]
			list != null && '@' in slot && "$list\u0000${slot.substringAfter('@')}" !in kept
		}
		forgetHidden()
		val afterTexts = texts().toMap()
		val afterAttributes = attributes().associate { (n, a, v) -> (n to a) to v }
		val afterProperties = properties().associate { (n, a, v) -> (n to a) to v }
		val afterArms = arms().toMap()
		val afterRows = rows().toMap()
		val afterSheets = sheets().toMap()
		val journal = ArrayList<JournalEntry>()
		for (c in payload.cells) if (c.styled && !Js.strictEquals(cellsBefore.getValue(c.id), values.getValue(c.id))) journal.add(JournalEntry.State(c.id, values.getValue(c.id)))
		for (node in payload.nodes) when (node) {
			is Node.Repeat -> {
				val b = beforeRows[node.id]; val a = afterRows[node.id]
				if (b != null && a != null && b != a) journal.add(JournalEntry.Rows(node.id, a))
			}
			is Node.Sheet -> afterSheets.getValue(node.id).let { if (beforeSheets[node.id] != it) journal.add(JournalEntry.Sheet(node.id, it)) }
			is Node.Branch -> if (node.id in beforeArms && node.id in afterArms && beforeArms[node.id] != afterArms[node.id]) journal.add(JournalEntry.Arm(node.id, afterArms[node.id]))
			is Node.Text -> for (inst in instances(node)) {
				val b = beforeTexts[inst.id]; val a = afterTexts[inst.id]
				if (b != null && a != null && a != b) journal.add(JournalEntry.Text(inst.id, a))
			}
			is Node.Element -> for (inst in instances(node)) {
				dialogs[node.id]?.let { open -> if (open != dialogsBefore[node.id]) journal.add(JournalEntry.Dialog(node.id, open)) }
				for (binding in node.bindings) {
				val key = inst.id to binding.name
				if (binding.property) {
					if (key in beforeProperties && key in afterProperties && beforeProperties[key] != afterProperties[key]) journal.add(JournalEntry.Property(inst.id, binding.name, afterProperties.getValue(key)))
				} else if (key in beforeAttributes && key in afterAttributes && beforeAttributes[key] != afterAttributes[key]) journal.add(JournalEntry.Attribute(inst.id, binding.name, afterAttributes[key]))
				}
			}
		}
		val afterTitle = title()
		if (afterTitle != null && afterTitle != beforeTitle) journal.add(JournalEntry.Title(afterTitle))
		val owned = liveObjects()
		for (o in payload.objects) if (o.id in ownedBefore && o.id !in owned) journal.add(JournalEntry.Release(o.id))
		journal.addAll(calls)
		return journal
	}
}
