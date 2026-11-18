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

	/** A submit stopped at the field [node]: focus moves there and [message] shows until the next action. */
	data class Invalid(override val node: String, val message: String) : JournalEntry {
		override fun toJson() = "{\"op\":\"invalid\",\"node\":${jsonString(node)},\"message\":${jsonString(message)}}"
	}

	/** Dispatch a `timer` action for the timer [node] in [ms] milliseconds. */
	data class Timer(override val node: String, val ms: Double) : JournalEntry {
		override fun toJson() = "{\"op\":\"timer\",\"timer\":${jsonString(node)},\"ms\":${jsonValue(JsValue.Num(ms))}}"
	}

	/** A checkbox's or radio button's checkedness changed. */
	data class Check(override val node: String, val checked: Boolean) : JournalEntry {
		override fun toJson() = "{\"op\":\"property\",\"node\":${jsonString(node)},\"name\":\"checked\",\"value\":$checked}"
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

/**
 * The locale a browser with these preferred languages shows its own text in, among [available]: the first preference that
 * matches exactly, then without its script (`zh-Hant-TW` as `zh-TW`), then by language alone; else `en`.
 */
fun nativeLocale(preferred: List<String>, available: Collection<String>): String {
	val byLower = available.associateBy { it.lowercase() }
	for (wanted in preferred) {
		val parts = wanted.replace('_', '-').lowercase().split('-')
		val language = parts[0]
		val region = parts.drop(1).firstOrNull { it.length != 4 }
		for (candidate in listOf(parts.joinToString("-"), if (region != null) "$language-$region" else language, language)) byLower[candidate]?.let { return it }
	}
	return "en"
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
class Runtime(
	val payload: Payload,
	private val store: Store = MemoryStore(),
	val params: Map<String, String> = emptyMap(),
	/** The device's preferred languages, most preferred first: the web's messages show in the first one the payload has. */
	preferredLanguages: List<String> = listOf("en"),
	private val now: () -> Double = { System.currentTimeMillis().toDouble() },
) {
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

	private val firstOfCell = payload.cells.mapNotNull { c -> c.first?.let { c.id to it } }.toMap()

	/**
	 * A row's state reads its first value until the row writes it; one taken from the row's item is seeded before any change
	 * ([seedRows]), so until the first change it reads the item as the row was built.
	 */
	private fun read(cell: String, scope: Scope): JsValue {
		val initial = value(cell)
		values[slot(cell, scope)]?.let { return it }
		firstOfCell[cell]?.let { return evaluate(it, scope) }
		return initial
	}

	/** A row's state with a `first` takes it once, from the row's item, when the row is built. */
	private fun seedRows() {
		for (cell in payload.cells) {
			val row = cell.row ?: continue
			val first = cell.first ?: continue
			val list = byId[row] as? Node.Repeat ?: continue
			if (!isShown(list)) continue
			for (r in rowsOf(list)) {
				val slot = "${cell.id}@${r.key}"
				if (slot !in values) values[slot] = evaluate(first, Scope(items = mapOf(row to r.item), keys = mapOf(row to r.key)))
			}
		}
	}

	fun node(id: String): Node = byId[id] ?: throw MarklessRuntimeError("unknown node \"$id\"")

	fun evaluate(e: Expr, scope: Scope = Scope.EMPTY): JsValue {
		fun eval(x: Expr) = evaluate(x, scope)
		return when (e) {
			Expr.RouteParams -> JsValue.Obj(params.entries.associateTo(LinkedHashMap()) { it.key to JsValue.Str(it.value) })
			Expr.EventValue -> JsValue.Str(eventValue ?: throw MarklessRuntimeError("the event value read outside an input handler"))
			is Expr.FormData -> entriesOf(e.form)
			is Expr.Checked -> JsValue.Bool(checkedOf(e.node))
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
		instances(e).flatMap { inst -> e.bindings.filter { it.property == property && (!property || it.name == "value") }.map { b -> Triple(inst.id, b.name, if (property) property(b, inst.scope) else attribute(b, inst.scope)) } }
	}

	@Suppress("UNCHECKED_CAST")
	private fun boundAttributes(): List<Triple<String, String, String?>> = bound(false) as List<Triple<String, String, String?>>

	/** Every shown element's bound attributes as written, then each form's busy and sending marks. */
	fun attributes(): List<Triple<String, String, String?>> = boundAttributes() + marks().map { (key, v) -> Triple(key.first, key.second, v) }

	/** Every shown input's bound `value`. */
	@Suppress("UNCHECKED_CAST")
	fun properties(): List<Triple<String, String, String>> = bound(true) as List<Triple<String, String, String>>

	private val forms = payload.forms.associateBy { it.node }
	/** A field's text a person typed since its `value` binding last wrote it. */
	private val edited = HashMap<String, String>()

	private class Submission(val sent: String, val submitter: String?, val marks: Boolean) {
		var pending = 0
	}

	private class Pending(val ops: List<Op>, val locals: Map<String, JsValue>, val submission: Submission?)

	private val running = LinkedHashMap<String, List<Submission>>()
	private val timers = HashMap<String, Pending>()
	private var timerCount = 0

	private fun elementOf(id: String): Node.Element = byId[id] as? Node.Element ?: throw MarklessRuntimeError("\"$id\" is not an element")

	/** An attribute as the web has it now: a binding's value as written, else the attribute the element was built with. */
	fun attributeNow(id: String, name: String): String? {
		val e = elementOf(id)
		val binding = e.bindings.firstOrNull { !it.property && it.name == name }
		return if (binding != null) attribute(binding) else e.attributes[name]
	}

	private fun propertyBinding(id: String, name: String) = elementOf(id).bindings.firstOrNull { it.property && it.name == name }

	/** A text field's text: what was typed since its binding last wrote it, else its `value` binding, else its `value` attribute. */
	fun textOf(id: String): String = edited[id] ?: propertyBinding(id, "value")?.let(::property) ?: attributeNow(id, "value") ?: ""

	/** Every non-row checkbox and radio button, in payload order. */
	private val ticked = payload.nodes.filterIsInstance<Node.Element>().filter { it.element == "input" && it.row == null && it.attributes["type"].let { t -> t == "checkbox" || t == "radio" } }

	private fun checkedBinding(id: String): Boolean? = propertyBinding(id, "checked")?.let { Js.truthy(evaluate(it.value)) }

	/** Each checkbox's and radio button's checkedness: its `checked` binding sets it, as does a person's tick. */
	private val checkedness = LinkedHashMap<String, Boolean>().apply { for (n in ticked) put(n.id, checkedBinding(n.id) ?: ("checked" in n.attributes)) }

	fun checkedOf(id: String): Boolean = checkedness[id] ?: throw MarklessRuntimeError("\"$id\" is not a checkbox or radio button")

	/** Every shown checkbox's and radio button's checkedness. */
	fun checks(): List<Pair<String, Boolean>> = ticked.filter(::isShown).map { it.id to checkedOf(it.id) }

	private fun formOf(id: String): String? = payload.forms.firstOrNull { f -> f.fields.any { it.node == id } }?.node

	/** The radio buttons of [id]'s group: the same `name`, in the same form or in none. */
	private fun groupOf(id: String): List<Node.Element> {
		val name = attributeNow(id, "name")
		val form = formOf(id)
		return ticked.filter { it.id == id || (it.attributes["type"] == "radio" && !name.isNullOrEmpty() && attributeNow(it.id, "name") == name && formOf(it.id) == form) }
	}

	private val missing: ValueMissing? = payload.valueMissing[nativeLocale(preferredLanguages, payload.valueMissing.keys)]

	private fun entriesOf(id: String): JsValue {
		val form = forms[id] ?: throw MarklessRuntimeError("\"$id\" is not a form")
		val out = ArrayList<JsValue>()
		for ((node, kind) in form.fields) {
			val name = attributeNow(node, "name")
			if (!isShown(elementOf(node)) || attributeNow(node, "disabled") != null || name.isNullOrEmpty()) continue
			val value = when (kind) {
				FieldKind.Checkbox, FieldKind.Radio -> if (checkedOf(node)) attributeNow(node, "value") ?: "on" else continue
				FieldKind.Hidden -> attributeNow(node, "value") ?: ""
				FieldKind.Text -> textOf(node)
			}
			out.add(JsValue.Arr(mutableListOf(JsValue.Str(name), JsValue.Str(value))))
		}
		return JsValue.Arr(out)
	}

	/** The first field that stops a submit, or null when none does. */
	private fun firstInvalid(form: Form, submitter: String?): Field? {
		if (form.noValidate || (submitter != null && attributeNow(submitter, "formnovalidate") != null)) return null
		return form.fields.firstOrNull { (node, kind) ->
			if (kind == FieldKind.Hidden || !isShown(elementOf(node)) || attributeNow(node, "disabled") != null) return@firstOrNull false
			// A radio button is missing its value when any button of its group is required and none is checked.
			val required = if (kind == FieldKind.Radio) groupOf(node).any { attributeNow(it.id, "required") != null } else attributeNow(node, "required") != null
			required && when (kind) {
				FieldKind.Radio -> groupOf(node).none { checkedOf(it.id) }
				FieldKind.Text -> textOf(node) == ""
				else -> !checkedOf(node)
			}
		}
	}

	/** `aria-busy` on a form while a submission of it runs, `aria-disabled` on the button that sent a marking one. */
	private fun marks(): LinkedHashMap<Pair<String, String>, String?> {
		val now = LinkedHashMap<Pair<String, String>, String?>()
		for (form in payload.forms) {
			val runs = running[form.node].orEmpty()
			now[form.node to "aria-busy"] = if (runs.isNotEmpty()) "true" else null
			if (form.authoredAriaDisabled) continue
			for (submitter in form.submitters) now[submitter to "aria-disabled"] = if (runs.any { it.marks && it.submitter == submitter }) "true" else null
		}
		return now
	}

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

	/** Runs the ops of the `after` that the `timer` entry [timer] scheduled, with the values it captured. */
	fun timer(timer: String): List<JournalEntry> {
		val pending = timers.remove(timer) ?: throw MarklessRuntimeError("no timer $timer is set")
		return change(null, null) {
			val taken = run(pending.ops, Scope(locals = pending.locals), pending.submission)
			pending.submission?.let { it.pending--; settled(it) }
			taken
		}
	}

	/** A submission whose handler and timers have all run is no longer running. */
	private fun settled(submission: Submission?) {
		if (submission == null || submission.pending > 0) return
		for ((form, runs) in running.entries.toList()) {
			val left = runs.filter { it !== submission }
			if (left.isNotEmpty()) running[form] = left else running.remove(form)
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
	private fun run(ops: List<Op>, scope: Scope, submission: Submission? = null): List<JournalEntry> {
		val calls = ArrayList<JournalEntry>()
		for (op in ops) when (op) {
			is Op.Submit -> {
				val taken = submit(op, scope, calls)
				if (taken.firstOrNull() is JournalEntry.Navigate) return taken
				calls.addAll(taken)
			}
			is Op.Tick -> {
				val group = if (elementOf(op.node).attributes["type"] == "radio") groupOf(op.node) else emptyList()
				if (group.isEmpty()) checkedness[op.node] = !checkedOf(op.node)
				else for (member in group) checkedness[member.id] = member.id == op.node
			}
			is Op.After -> {
				val ms = evaluate(op.ms, scope)
				val captured = LinkedHashMap(scope.locals)
				for ((name, x) in op.capture) captured[name] = evaluate(x, scope)
				val id = "timer:${timerCount++}"
				timers[id] = Pending(op.ops, captured, submission)
				submission?.let { it.pending++ }
				calls.add(JournalEntry.Timer(id, if (ms is JsValue.Num && ms.value > 0) ms.value else 0.0))
			}
			is Op.Navigate -> return listOf(JournalEntry.Navigate(op.route, op.params.mapValues { Js.toStr(evaluate(it.value, scope)) }, op.replace))
			is Op.Call -> calls.add(JournalEntry.Call(op.call, op.arguments.map { evaluate(it, scope) }, op.result, op.obj, op.after?.id))
			is Op.If -> {
				val taken = run(if (Js.truthy(evaluate(op.test, scope))) op.then else op.otherwise, scope, submission)
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
		seedRows()
		val cellsBefore = HashMap(values)
		val beforeTexts = texts().toMap()
		val beforeAttributes = boundAttributes().associate { (n, a, v) -> (n to a) to v }
		val beforeMarks = marks()
		val checkedBefore = HashMap(checkedness)
		val bindingsBefore = ticked.associate { it.id to checkedBinding(it.id) }
		val beforeProperties = properties().associate { (n, a, v) -> (n to a) to v }.toMutableMap()
		// The edited field already shows what was typed, so its own value counts as written.
		if (value != null && host != null) {
			beforeProperties[host to "value"] = value
			edited[host] = value
		}
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
		seedRows()
		forgetHidden()
		val afterTexts = texts().toMap()
		val afterAttributes = boundAttributes().associate { (n, a, v) -> (n to a) to v }
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
		// A `checked` binding whose value changed sets the checkedness, as the web's property write does.
		for (n in ticked) checkedBinding(n.id)?.let { if (it != bindingsBefore[n.id]) checkedness[n.id] = it }
		for (n in ticked) if (isShown(n) && checkedBefore[n.id] != checkedness[n.id]) journal.add(JournalEntry.Check(n.id, checkedness.getValue(n.id)))
		for ((key, v) in marks()) if (beforeMarks[key] != v) journal.add(JournalEntry.Attribute(key.first, key.second, v))
		// A field whose binding wrote it shows that value now, not what was typed before.
		for (entry in journal) if (entry is JournalEntry.Property) edited.remove(entry.node)
		val afterTitle = title()
		if (afterTitle != null && afterTitle != beforeTitle) journal.add(JournalEntry.Title(afterTitle))
		val owned = liveObjects()
		for (o in payload.objects) if (o.id in ownedBefore && o.id !in owned) journal.add(JournalEntry.Release(o.id))
		journal.addAll(calls)
		return journal
	}

	/** A `submit` op as the web runs it: nothing for a disabled submitter, an `invalid` entry for the first field missing its value, nothing for the same entries from the same button as a submission still running, else the form's handler. */
	private fun submit(op: Op.Submit, scope: Scope, calls: MutableList<JournalEntry>): List<JournalEntry> {
		val form = forms[op.form] ?: throw MarklessRuntimeError("\"${op.form}\" is not a form")
		if (op.submitter != null && attributeNow(op.submitter, "disabled") != null) return emptyList()
		firstInvalid(form, op.submitter)?.let { field ->
			val messages = missing ?: throw MarklessRuntimeError("the payload has no message for a ${field.kind.wire} missing its value")
			calls.add(JournalEntry.Invalid(field.node, when (field.kind) { FieldKind.Radio -> messages.radio; FieldKind.Checkbox -> messages.checkbox; else -> messages.text }))
			return emptyList()
		}
		val sent = jsonValue(entriesOf(op.form))
		val runs = running[op.form].orEmpty()
		// The same entries from the same button as a submission still running: the web drops it before any handler hears it.
		if (runs.any { it.sent == sent && it.submitter == op.submitter }) return emptyList()
		val handler = handlerFor(op.form, EventName.Submit) ?: throw MarklessRuntimeError("\"${op.form}\" has no submit handler")
		val submission = Submission(sent, op.submitter, op.submitter != null && !form.authoredAriaDisabled)
		running[op.form] = runs + submission
		val taken = run(handlers[handler]?.ops.orEmpty(), Scope(locals = scope.locals), submission)
		settled(submission)
		return taken
	}
}
