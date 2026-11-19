package dev.markless.mobile.core

class MarklessRuntimeError(message: String) : RuntimeException(message)

/** The overlay protocol of `@markless/web/overlay-protocol`: the marker attribute and what makes an overlay modal. */
const val OVERLAY_ATTRIBUTE = "overlay"
const val OVERLAY_MODAL_ATTRIBUTE = "aria-modal"
const val OVERLAY_MODAL_VALUE = "true"

/** The events that carry a string: an `input` the field's text, a `keydown` its key, a `paste` the pasted text. */
private val VALUED = setOf(EventName.Input, EventName.Keydown, EventName.Paste)

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

	/** The `keydown` or `paste` handler called `preventDefault()`: the host leaves out what the key or paste does. */
	data object PreventDefault : JournalEntry {
		override val node get() = ""
		override fun toJson() = "{\"op\":\"preventDefault\"}"
	}

	/** Dispatch a `timer` action for the timer [node] in [ms] milliseconds. */
	data class Timer(override val node: String, val ms: Double) : JournalEntry {
		override fun toJson() = "{\"op\":\"timer\",\"timer\":${jsonString(node)},\"ms\":${jsonValue(JsValue.Num(ms))}}"
	}

	/** A checkbox's or radio button's checkedness changed. */
	data class Check(override val node: String, val checked: Boolean) : JournalEntry {
		override fun toJson() = "{\"op\":\"property\",\"node\":${jsonString(node)},\"name\":\"checked\",\"value\":$checked}"
	}

	/** An element marked `overlay` joined the overlay stack ([open]) or left it; a [modal] one goes in the host's top layer. */
	data class Overlay(override val node: String, val open: Boolean, val modal: Boolean) : JournalEntry {
		override fun toJson() = "{\"op\":\"overlay\",\"node\":${jsonString(node)},\"open\":$open,\"modal\":$modal}"
	}

	/** Shows arm [index] of a branch (null: none). */
	data class Arm(override val node: String, val index: Int?) : JournalEntry {
		override fun toJson() = "{\"op\":\"arm\",\"node\":${jsonString(node)},\"index\":${index ?: "null"}}"
	}

	/** A system sheet's `open` turned truthy (present it) or falsy (dismiss it, unless the platform already has). */
	data class Sheet(override val node: String, val open: Boolean) : JournalEntry {
		override fun toJson() = "{\"op\":\"sheet\",\"node\":${jsonString(node)},\"open\":$open}"
	}

	/** The script cleared the timer [node] (`script:<n>`) it set: the host drops it. */
	data class ClearTimer(override val node: String) : JournalEntry {
		override fun toJson() = "{\"op\":\"clearTimer\",\"timer\":${jsonString(node)}}"
	}

	/** The script called `fetch`: the host sends [request] and answers with [Runtime.response]. */
	data class Fetch(val id: Int, val request: FetchRequest) : JournalEntry {
		override val node get() = ""
		override fun toJson() = "{\"op\":\"fetch\",\"id\":$id,\"request\":${request.toJson()}}"
	}
}

/** A request as the script made it: an absolute [url], and a text [body] or none. */
data class FetchRequest(val url: String, val method: String, val headers: List<Pair<String, String>>, val body: String?) {
	fun toJson() = "{\"url\":${jsonString(url)},\"method\":${jsonString(method)},\"headers\":${headers.joinToString(",", "[", "]") { "[${jsonString(it.first)},${jsonString(it.second)}]" }},\"body\":${body?.let(::jsonString) ?: "null"}}"
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
	/** Where a page with a script gets the app's engine; never asked for a page without one. */
	private val scriptHost: ScriptHost? = null,
) {
	private val opened = now()
	private val computed = HashMap<String, JsValue>()
	private var computedCells: String? = null
	/** Cells still `undefined` on the web: a script reads them so until one is written. */
	private val unset = HashSet<String>().apply { for (c in payload.cells) if (c.unset && c.storageKey?.let(store::get) == null) add(c.id) }
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
	/** The fields of the event whose handler is running, by the name an `event` expression reads. */
	private var fields: Map<String, JsValue>? = null

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

	/** For each row's state that has `rebuiltBy`, by slot (`<cell>@<key>`): those values now, as JSON. */
	private fun rowSignatures(): Map<String, String> {
		val signatures = HashMap<String, String>()
		for (cell in payload.cells) {
			val row = cell.row ?: continue
			val rebuiltBy = cell.rebuiltBy ?: continue
			val list = byId[row] as? Node.Repeat ?: continue
			if (!isShown(list)) continue
			for (r in rowsOf(list)) {
				val scope = Scope(items = mapOf(row to r.item), keys = mapOf(row to r.key))
				signatures["${cell.id}@${r.key}"] = rebuiltBy.joinToString(",") { jsonValue(evaluate(it, scope)) }
			}
		}
		return signatures
	}

	/** As on the web, a part a row passes a changed value to is built again: that row's state starts over. */
	private fun resetChangedRows(before: Map<String, String>) {
		for ((slot, now) in rowSignatures()) if (before[slot]?.let { it != now } == true) values.remove(slot)
	}

	/** A row's state with a `first` takes it once, from the row's item, when the row is built. */
	/** Each following cell's last value of what it follows: the write runs again only when that value changes, as on the web. */
	private val followed = HashMap<String, JsValue>()

	private fun follow() {
		repeat(payload.cells.size + 1) {
			var moved = false
			for (c in payload.cells) {
				val follows = c.follows ?: continue
				val now = evaluate(follows, Scope.EMPTY)
				if (followed[c.id] == now) continue
				followed[c.id] = now
				if ((values[c.id] ?: JsValue.Null) == now) continue
				values[c.id] = now
				unset.remove(c.id)
				moved = true
			}
			if (!moved) return
		}
		throw MarklessRuntimeError("following cells kept changing each other")
	}

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
			is Expr.Event -> fields?.get(e.field) ?: throw MarklessRuntimeError("the event's ${e.field} read where the event has none")
			is Expr.FormData -> entriesOf(e.form)
			is Expr.Checked -> JsValue.Bool(checkedOf(e.node))
			is Expr.Field -> JsValue.Str(textOf(e.node))
			is Expr.CellRef -> read(e.cell, scope)
			Expr.Focused -> JsValue.Str(focused ?: NATIVE_DOCUMENT_BODY)
			is Expr.FocusOrigin -> (eval(e.overlay) as? JsValue.Str)?.let { o -> origins[o.value]?.let(JsValue::Str) } ?: JsValue.Null
			is Expr.IsElement -> JsValue.Bool((eval(e.value) as? JsValue.Str)?.let { isElement(it.value) } ?: false)
			is Expr.Contains -> {
				val within = eval(e.within)
				val node = eval(e.node)
				JsValue.Bool(within is JsValue.Str && node is JsValue.Str && contains(within.value, node.value))
			}
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
			is Expr.Script -> {
				val cells = entryCells()
				// As on the web, a computed is not run again while nothing it reads has changed.
				if (cells != computedCells) {
					computed.clear()
					computedCells = cells
				}
				val entry = "{\"kind\":\"compute\",\"fn\":${jsonString(e.fn)},\"frame\":${frameOf(e.bindings, scope)},\"elements\":${elementFacts(e.bindings, scope)}$cells}"
				computed[entry] ?: run {
					val started = System.nanoTime()
					val value = JsValue.fromJson(Json.parse(scriptCall("enter", entry)))
					onScriptEntry?.invoke(System.nanoTime() - started)
					computed[entry] = value
					value
				}
			}
		}
	}

	/** The engine this screen's script runs in: none until a script op or script computed first needs it. */
	private var engine: ScriptEngine? = null

	/** How many times this screen asked its host for the engine: 0 for a page whose handlers all ran as data, else 1. */
	var engineStarts = 0
		private set

	/** What the script wrote to `console`, in order, as `level to text`. */
	val logs = ArrayList<Pair<String, String>>()

	/** Called with each line the script logs. */
	var onScriptLog: ((level: String, text: String) -> Unit)? = null

	/** Called with each engine entry's duration in nanoseconds, including starting the engine when the entry had to. */
	var onScriptEntry: ((nanos: Long) -> Unit)? = null

	/** Starts the engine and loads this screen's script ahead of its first entry; false when there was nothing to load (no script, or already loaded). */
	fun warm(): Boolean {
		val script = payload.script ?: return false
		if (engine != null) return false
		load(script)
		return true
	}

	private fun load(script: ScriptSource): ScriptEngine {
		val host = scriptHost ?: throw MarklessRuntimeError("a script op with no script engine to run it")
		val started = host.start()
		engineStarts++
		// A shared engine may hold this script already, from another screen of the same page.
		started.evaluate(script.source)
		engine = started
		return started
	}

	private fun scriptCall(method: String, argument: String?): String {
		val script = payload.script ?: throw MarklessRuntimeError("a script op in a payload with no script")
		val target = "globalThis.__markless[${jsonString(script.id)}].$method"
		return (engine ?: load(script)).evaluate(if (argument == null) "$target()" else "$target(${jsonString(argument)})")
	}

	/** The names a script function reads, as its engine entry spells them: slots of this scope's cells, and values. */
	private fun frameOf(bindings: Map<String, ScriptBinding>, scope: Scope): String = bindings.entries.joinToString(",", "{", "}") { (name, b) ->
		jsonString(name) + ":" + when (b) {
			is ScriptBinding.Cell -> "{\"slot\":${jsonString(slot(b.cell, scope))}}"
			is ScriptBinding.Fields -> "{\"fields\":${b.fields.entries.joinToString(",", "{", "}") { "${jsonString(it.key)}:${jsonString(slot(it.value, scope))}" }}}"
			is ScriptBinding.Value -> "{\"value\":${jsonValue(evaluate(b.value, scope))}}"
			is ScriptBinding.Elements -> "{\"elements\":${jsonValue(evaluate(b.value, scope))}}"
			is ScriptBinding.Object -> "{\"object\":${frameOf(b.members, scope)}}"
			is ScriptBinding.Shared -> "{\"shared\":${frameOf(b.members, scope)}}"
			is ScriptBinding.Method -> "{\"method\":${jsonString(b.fn)},\"frame\":${frameOf(b.members, scope)}}"
		}
	}

	/** What the host tells a script about the elements its frame passes as proxies: each one's attributes now and the elements it is inside, nearest first. */
	private fun elementFacts(bindings: Map<String, ScriptBinding>, scope: Scope): String {
		val facts = LinkedHashMap<String, String>()
		fun add(value: JsValue) {
			if (value !is JsValue.Str) return
			val id = value.value
			if (id in facts || id == NATIVE_DOCUMENT_BODY || !isElement(id)) return
			val key = if ('@' in id) id.substring(id.indexOf('@')) else ""
			val node = elementOf(id.substringBefore('@'))
			val names = LinkedHashSet<String>(node.attributes.keys.sorted()).apply { addAll(node.bindings.filter { !it.property }.map { it.name }) }
			val attributes = names.mapNotNull { name -> attributeNow(id, name)?.let { "${jsonString(name)}:${jsonString(it)}" } }
			val ancestors = ArrayList<String>()
			var up = node.parent
			while (up != null) {
				ancestors.add(jsonString(if (key.isNotEmpty() && byId[up]?.row != null) up + key else up))
				up = byId[up]?.parent
			}
			facts[id] = "{\"attributes\":${attributes.joinToString(",", "{", "}")},\"ancestors\":${ancestors.joinToString(",", "[", "]")}}"
		}
		fun visit(named: Map<String, ScriptBinding>) {
			for (b in named.values) when (b) {
				is ScriptBinding.Elements -> when (val v = evaluate(b.value, scope)) {
					is JsValue.Arr -> v.items.forEach(::add)
					else -> add(v)
				}
				is ScriptBinding.Object -> visit(b.members)
				is ScriptBinding.Shared -> visit(b.members)
				is ScriptBinding.Method -> visit(b.members)
				else -> {}
			}
		}
		visit(bindings)
		return facts.entries.joinToString(",", "{", "}") { "${jsonString(it.key)}:${it.value}" }
	}

	/** Every current value by slot, and the seed `crypto` draws from when the script uses it. */
	private fun entryCells(): String = buildString {
		append(",\"cells\":")
		append(values.entries.joinToString(",", "{", "}") { "${jsonString(it.key)}:${jsonValue(it.value)}" })
		if (unset.isNotEmpty()) append(",\"unset\":${unset.sorted().joinToString(",", "[", "]") { jsonString(it) }}")
		if (payload.script?.services?.contains("crypto") == true) scriptHost?.seed()?.let { append(",\"seed\":${jsonString(it)}") }
	}

	/** One engine entry, then what it asked for: its writes land in cells; clears, timers and requests become entries, in that order. */
	private fun enter(fields: String): List<JournalEntry> {
		val entry = "{$fields${entryCells()}}"
		val started = System.nanoTime()
		scriptCall("enter", entry)
		val result = Json.parse(scriptCall("leave", null)).obj("leave()")
		onScriptEntry?.invoke(System.nanoTime() - started)
		fun list(name: String) = result.field(name, "leave()").arr("leave().$name")
		fun id(j: Json) = j.num("an id").toInt()
		for (w in list("writes")) {
			val pair = w.arr("leave().writes[]")
			val slot = pair[0].str("leave().writes[][0]")
			val cell = slot.substringBefore('@')
			if (payload.cells.none { it.id == cell }) throw MarklessRuntimeError("the script wrote unknown cell $cell")
			val v = JsValue.fromJson(pair[1])
			values[slot] = v
			unset.remove(slot)
			storageKeys[cell]?.let { store.set(it, v) }
		}
		for (l in list("logs")) {
			val pair = l.arr("leave().logs[]")
			val level = pair[0].str("leave().logs[][0]")
			val text = pair[1].str("leave().logs[][1]")
			logs.add(level to text)
			onScriptLog?.invoke(level, text)
		}
		return list("clears").map { JournalEntry.ClearTimer("$SCRIPT_TIMER${id(it)}") } +
			list("timers").map { t -> t.arr("leave().timers[]").let { JournalEntry.Timer("$SCRIPT_TIMER${id(it[0])}", it[1].num("leave().timers[][1]")) } } +
			list("requests").map { r ->
				val o = r.obj("leave().requests[]")
				val q = o.field("request", "leave().requests[]").obj("request")
				val request = FetchRequest(
					q.field("url", "request").str("request.url"),
					q.field("method", "request").str("request.method"),
					q.field("headers", "request").arr("request.headers").map { h -> h.arr("request.headers[]").let { it[0].str("a header name") to it[1].str("a header value") } },
					q.field("body", "request").let { if (it == Json.Null) null else it.str("request.body") },
				)
				JournalEntry.Fetch(id(o.field("id", "leave().requests[]")), request)
			} +
			(if (result.containsKey("commands")) list("commands") else emptyList()).mapNotNull { c ->
				val parts = c.arr("leave().commands[]")
				val node = parts[0].str("leave().commands[][0]")
				val command = parts[1].str("leave().commands[][1]")
				// A dialog's showModal() and close() change what the views show; the journal's dialog entry says so.
				if (command == "showModal" || command == "close") {
					if (node !in dialogs) throw MarklessRuntimeError("$command() on $node, which is not a dialog")
					dialogs[node] = command == "showModal"
					return@mapNotNull null
				}
				if (command == "focus") focused = node
				JournalEntry.Command(node, command, (parts[2] as? Json.Bool)?.value == true)
			} +
			(if ((result["prevented"] as? Json.Bool)?.value == true) listOf(JournalEntry.PreventDefault) else emptyList())
	}


	/** The host's answer to a `fetch` entry: `{ status, statusText, headers, body }`, or `{ error }` for a network failure. */
	fun response(id: Int, response: JsValue): List<JournalEntry> =
		change(null, null) { enter("\"kind\":\"response\",\"request\":$id,\"response\":${jsonValue(response)}") }

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
		val e = elementOf(id.substringBefore('@'))
		val binding = e.bindings.firstOrNull { !it.property && it.name == name } ?: return e.attributes[name]
		// A row's copy (`<node>@<key>`) reads its own row.
		return attribute(binding, if (id == e.id) Scope.EMPTY else instances(e).firstOrNull { it.id == id }?.scope ?: Scope.EMPTY)
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

	private var focused: String? = null
	/** The overlay stack, topmost last, and the focus each overlay was shown from. */
	private var stack: List<String> = emptyList()
	private val origins = HashMap<String, String>()

	fun isElement(id: String): Boolean = id == NATIVE_DOCUMENT_BODY || byId[id.substringBefore('@')] is Node.Element

	/** Whether [node] is [within] or inside it, by the payload's parent chain; everything is inside the body. */
	fun contains(within: String, node: String): Boolean {
		if (within == NATIVE_DOCUMENT_BODY) return true
		val target = within.substringBefore('@')
		var at: String? = node.substringBefore('@')
		while (!at.isNullOrEmpty()) {
			if (at == target) return true
			at = byId[at]?.parent
		}
		return false
	}

	// An element marked `overlay` joins the stack while its `hidden` binding shows it; one with no such binding never does.
	private val overlayNodes = payload.nodes.filterIsInstance<Node.Element>().filter { e -> e.row == null && OVERLAY_ATTRIBUTE in e.attributes && e.bindings.any { !it.property && it.name == "hidden" } }

	private fun shownOverlays(): List<String> =
		overlayNodes.filter { instances(it).isNotEmpty() && attributeNow(it.id, "hidden") == null }.map { it.id }

	/** Whether [overlay] or an element inside it has `aria-modal="true"`, its bound value first, else its static one. */
	fun isModal(overlay: String): Boolean = payload.nodes.any { n ->
		if (n !is Node.Element || !contains(overlay, n.id)) return@any false
		// A row's copies are keyed by row, so a row element is read as it was built.
		(if (n.row != null) n.attributes[OVERLAY_MODAL_ATTRIBUTE] else attributeNow(n.id, OVERLAY_MODAL_ATTRIBUTE)) == OVERLAY_MODAL_VALUE
	}

	init {
		// Rows take their first values, and following cells theirs, before anything reads them, the overlays shown at mount included.
		seedRows()
		follow()
		stack = shownOverlays()
		for (o in stack) origins[o] = NATIVE_DOCUMENT_BODY
	}

	/** The overlay stack, topmost last, each with whether it is modal. */
	fun overlays(): List<Pair<String, Boolean>> = stack.map { it to isModal(it) }

	/** The element that has focus, or null. */
	fun focused(): String? = focused

	fun handlerFor(host: String, event: EventName): String? = payload.events.firstOrNull { it.host == host && it.event == event }?.handler

	/** The page's `<title>` text, null when it has none. */
	fun title(): String? = payload.title?.let { text(it, Scope.EMPTY) }

	/**
	 * Runs the handler for [event] on [host] (a row instance as `<node>@<key>`); an `input` event carries the field's whole
	 * text as [value], a `keydown` its key and a `paste` the pasted text; a press carries [detail], how many presses in a
	 * row. A `dismiss` with a [reason] is an overlay's Escape; without one, a sheet's platform close. A pointer
	 * event reaches [host] and each element it is inside, innermost first, after a `dismiss` of the topmost overlay when a
	 * `pointerdown` lands outside it; after a `pointerup` or `pointercancel`, `pointerleave` reaches the same elements.
	 */
	fun dispatch(host: String, event: EventName, value: String? = null, reason: String? = null, detail: Int? = null): List<JournalEntry> {
		if (detail != null && event != EventName.Activate) throw MarklessRuntimeError("a ${event.wire} event carries no press count")
		if ((event in VALUED) != (value != null)) throw MarklessRuntimeError("an ${event.wire} event ${if (value == null) "needs" else "carries no"} a value")
		if (reason != null && event != EventName.Dismiss) throw MarklessRuntimeError("a ${event.wire} event carries no reason")
		if (event == EventName.Dismiss && reason != null) {
			if (stack.lastOrNull() != host) throw MarklessRuntimeError("\"$host\" is not the topmost overlay")
			val dismiss = handlerFor(host, event)?.let { handlers[it] ?: throw MarklessRuntimeError("unknown handler \"$it\"") }
			return change(null, null) {
				dismiss?.let { withFields(mapOf("reason" to JsValue.Str(reason), "pressTarget" to JsValue.Null)) { run(it.ops, Scope.EMPTY) } } ?: emptyList()
			}
		}
		if (event == EventName.PointerDown || event == EventName.PointerUp || event == EventName.PointerCancel) {
			val template = host.substringBefore('@')
			val scope = (instances(node(template)).firstOrNull { it.id == host } ?: throw MarklessRuntimeError("\"$host\" is not shown")).scope
			return change(null, null) {
				val calls = ArrayList<JournalEntry>()
				val runs = ArrayList<Pair<String, Map<String, JsValue>>>()
				// The overlay behaviour's document listener hears the press first: the topmost overlay it landed outside is told.
				val top = stack.lastOrNull()
				if (top != null && event == EventName.PointerDown && !contains(top, host))
					handlerFor(top, EventName.Dismiss)?.let { runs.add(it to mapOf("reason" to JsValue.Str("outside-press"), "pressTarget" to JsValue.Str(host))) }
				var at: String? = template
				while (!at.isNullOrEmpty()) {
					handlerFor(at, event)?.let { runs.add(it to mapOf("target" to JsValue.Str(host), "button" to JsValue.Num(0.0))) }
					at = byId[at]?.parent
				}
				// A finger that lifts or is cancelled leaves the element and each element it is inside, innermost first.
				if (event != EventName.PointerDown) {
					at = template
					while (!at.isNullOrEmpty()) {
						val leaving: String = at
						handlerFor(leaving, EventName.PointerLeave)?.let { runs.add(it to mapOf("target" to JsValue.Str(leaving), "button" to JsValue.Num(0.0))) }
						at = byId[leaving]?.parent
					}
				}
				for ((id, f) in runs) {
					val handler = handlers[id] ?: throw MarklessRuntimeError("unknown handler \"$id\"")
					val out = withFields(f) { run(handler.ops, scope) }
					if (out.firstOrNull() is JournalEntry.Navigate) return@change out
					calls.addAll(out)
				}
				calls
			}
		}
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
		// A press focuses the control it presses, as the browser does.
		if (event == EventName.Activate) focused = host
		val carried = when (event) {
			EventName.Input -> value?.let { mapOf("value" to JsValue.Str(it)) }
			EventName.Keydown -> mapOf("key" to JsValue.Str(value!!))
			EventName.Paste -> mapOf("text" to JsValue.Str(value!!))
			EventName.Activate -> mapOf("detail" to JsValue.Num((detail ?: 1).toDouble()))
			else -> null
		}
		return change(host, if (event == EventName.Input) value else null) {
			withFields(carried) { run(handler.ops, scope) }
		}
	}

	private inline fun <T> withFields(f: Map<String, JsValue>?, block: () -> T): T {
		val outer = fields
		fields = f
		try {
			return block()
		} finally {
			fields = outer
		}
	}

	/** Runs the ops of the `after` that the `timer` entry [timer] scheduled, with the values it captured, or fires the script's timer (`script:<n>`). */
	fun timer(timer: String): List<JournalEntry> {
		if (timer.startsWith(SCRIPT_TIMER)) {
			val id = timer.removePrefix(SCRIPT_TIMER).toIntOrNull() ?: throw MarklessRuntimeError("no timer $timer is set")
			return change(null, null) { enter("\"kind\":\"timer\",\"timer\":$id") }
		}
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
			unset.remove(cell)
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
			is Op.Command -> {
				val node = evaluate(op.node, scope)
				if (node == JsValue.Null || node == JsValue.Str(NATIVE_DOCUMENT_BODY)) continue
				if (node !is JsValue.Str || !isElement(node.value)) throw MarklessRuntimeError("${op.command}() on a value that is not an element")
				if (op.command == "focus") focused = node.value
				calls.add(JournalEntry.Command(node.value, op.command, op.preventScroll))
			}
			is Op.Script -> {
				val given = StringBuilder("{\"type\":${jsonString(op.type)}")
				(fields?.get("value") as? JsValue.Str)?.let { given.append(",\"value\":${jsonString(it.value)}") }
				(fields?.get("key") as? JsValue.Str)?.let { given.append(",\"key\":${jsonString(it.value)}") }
				(fields?.get("text") as? JsValue.Str)?.let { given.append(",\"text\":${jsonString(it.value)}") }
				(fields?.get("detail") as? JsValue.Num)?.let { given.append(",\"detail\":${jsonValue(it)}") }
				val event = given.append("}").toString()
				val catch = op.catch?.let { ",\"catch\":${jsonString(slot(it, scope))}" } ?: ""
				calls.addAll(enter("\"kind\":\"dispatch\",\"fn\":${jsonString(op.fn)},\"frame\":${frameOf(op.bindings, scope)},\"elements\":${elementFacts(op.bindings, scope)},\"event\":$event$catch"))
			}
			Op.PreventDefault -> calls.add(JournalEntry.PreventDefault)
			is Op.FieldText -> {
				val node = evaluate(op.node, scope)
				if (node == JsValue.Null) continue
				if (node !is JsValue.Str || !isElement(node.value)) throw MarklessRuntimeError("a field text written to a value that is not an element")
				val value = evaluate(op.value, scope)
				val text = if (value == JsValue.Null) "" else Js.toStr(value)
				edited[node.value] = text
				calls.add(JournalEntry.Property(node.value, "value", text))
			}
			is Op.Assign -> {
				val v = evaluate(op.value, scope)
				values[slot(op.cell, scope)] = v
				unset.remove(op.cell)
				storageKeys[op.cell]?.let { store.set(it, v) }
			}
		}
		return calls
	}

	/** A live device value changed: writes its device cell and returns the journal. */
	fun device(cell: String, value: JsValue): List<JournalEntry> {
		if (payload.cells.none { it.id == cell && it.device != null }) throw MarklessRuntimeError("\"$cell\" is not a device cell")
		return change(null, null) { values[cell] = value; unset.remove(cell); emptyList() }
	}

	/** A device call answered: the task cell takes `{ state: 'value', value }`. */
	fun settle(cell: String, value: JsValue): List<JournalEntry> =
		settleWith(cell, JsValue.Obj(linkedMapOf("state" to JsValue.Str("value"), "value" to value)))

	/** A device call failed (`NotAllowedError` when refused): the task cell takes `{ state: 'error', error: { name, message } }`. */
	fun settleError(cell: String, name: String, message: String): List<JournalEntry> =
		settleWith(cell, JsValue.Obj(linkedMapOf("state" to JsValue.Str("error"), "error" to JsValue.Obj(linkedMapOf("name" to JsValue.Str(name), "message" to JsValue.Str(message))))))

	private fun settleWith(cell: String, value: JsValue): List<JournalEntry> {
		if (payload.cells.none { it.id == cell && it.task != null }) throw MarklessRuntimeError("\"$cell\" is not a task cell")
		return change(null, null) { values[cell] = value; unset.remove(cell); emptyList() }
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
		val focusBefore = focused
		val stackBefore = stack
		val signaturesBefore = rowSignatures()
		val calls = apply()
		if (calls.firstOrNull() is JournalEntry.Navigate) return calls
		// A row that left takes its state with it; a later row with the same key starts from the first values.
		val kept = rows().flatMap { (list, keys) -> keys.map { "$list\u0000$it" } }.toSet()
		values.keys.removeAll { slot ->
			val list = rowOfCell[slot.substringBefore('@')]
			list != null && '@' in slot && "$list\u0000${slot.substringAfter('@')}" !in kept
		}
		resetChangedRows(signaturesBefore)
		seedRows()
		follow()
		val shownNow = shownOverlays()
		val released = stackBefore.filter { it !in shownNow }
		val enlisted = shownNow.filter { it !in stackBefore }
		stack = stackBefore.filter { it in shownNow } + enlisted
		for (o in enlisted) origins[o] = focusBefore ?: NATIVE_DOCUMENT_BODY
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
		for (o in released) journal.add(JournalEntry.Overlay(o, open = false, modal = isModal(o)))
		for (o in enlisted) journal.add(JournalEntry.Overlay(o, open = true, modal = isModal(o)))
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
