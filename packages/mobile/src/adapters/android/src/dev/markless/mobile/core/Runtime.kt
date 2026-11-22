package dev.markless.mobile.core

class MarklessRuntimeError(message: String) : RuntimeException(message)

/** The overlay protocol of `@markless/web/overlay-protocol`: the marker attribute, the hint mark, and what makes an overlay modal. */
const val OVERLAY_ATTRIBUTE = "overlay"
const val OVERLAY_HINT_ATTRIBUTE = "overlay-hint"

/** How deep events raised from JavaScript may nest. */
const val RAISE_DEPTH = 32

/** How many dialog close events one change runs, so close handlers that reopen and close their dialog end. */
const val CLOSE_DEPTH = 16
const val OVERLAY_MODAL_ATTRIBUTE = "aria-modal"
const val OVERLAY_MODAL_VALUE = "true"

/** The events that carry a string: an `input` or `commit` the field's text, a `keydown` or `keyup` its key, a `paste` the pasted text. */
private val VALUED = setOf(EventName.Input, EventName.Commit, EventName.Keydown, EventName.Keyup, EventName.Paste)

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

	/** A style slot's new value: the page is laid out again with it. */
	data class Slot(val slot: String, val value: Double) : JournalEntry {
		override val node get() = slot
		override fun toJson() = "{\"op\":\"slot\",\"slot\":${jsonString(slot)},\"value\":${jsonValue(JsValue.Num(value))}}"
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

	/** An option's selectedness changed; a row's new option arrives unselected. */
	data class Selected(override val node: String, val selected: Boolean) : JournalEntry {
		override fun toJson() = "{\"op\":\"property\",\"node\":${jsonString(node)},\"name\":\"selected\",\"value\":$selected}"
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

	/** The script aborted request [id] (its async value was superseded or left the screen): cancel it and send no response. */
	data class Abort(val id: Int) : JournalEntry {
		override val node get() = ""
		override fun toJson() = "{\"op\":\"abort\",\"id\":$id}"
	}
}

/** A request as the script made it: an absolute [url], and a text [body] or none. */
data class FetchRequest(val url: String, val method: String, val headers: List<Pair<String, String>>, val body: String?) {
	fun toJson() = "{\"url\":${jsonString(url)},\"method\":${jsonString(method)},\"headers\":${headers.joinToString(",", "[", "]") { "[${jsonString(it.first)},${jsonString(it.second)}]" }},\"body\":${body?.let(::jsonString) ?: "null"}}"
}

/** An element's box in CSS pixels from the screen's top left, and its text direction, as its view has them now. */
data class ElementBox(val x: Double, val y: Double, val width: Double, val height: Double, val rightToLeft: Boolean)

/** `JSON.stringify` of a value: non-finite numbers are `null`. */
/** What a touch adds to a script pointer handler's event, in the order the reference writes them. */
private val TOUCH_FIELDS = listOf("button", "buttons", "clientX", "clientY", "pointerId", "pointerType", "isPrimary", "timeStamp", "shiftKey", "ctrlKey", "altKey", "metaKey", "isTrusted", "detail", "key")

fun jsonValue(v: JsValue): String = when (v) {
	JsValue.Null -> "null"
	is JsValue.Str -> jsonString(v.value)
	is JsValue.Bool -> v.value.toString()
	is JsValue.Num -> if (v.value.isNaN() || v.value.isInfinite()) "null" else JsString.number(v.value)
	is JsValue.Arr -> v.items.joinToString(",", "[", "]", transform = ::jsonValue)
	is JsValue.Obj -> v.fields.entries.joinToString(",", "{", "}") { "${jsonString(it.key)}:${jsonValue(it.value)}" }
}

/** JSON writes Infinity, -Infinity and NaN as null ([jsonValue]): each one's path and name, as JSON (nativeNonFiniteSplit). */
fun nonFiniteJson(v: JsValue): String {
	val found = ArrayList<String>()
	fun walk(x: JsValue, path: List<String>) {
		when (x) {
			is JsValue.Num -> if (x.value.isNaN() || x.value.isInfinite()) found.add("[[${path.joinToString(",")}],${jsonString(if (x.value.isNaN()) "NaN" else if (x.value > 0) "Infinity" else "-Infinity")}]")
			is JsValue.Arr -> x.items.forEachIndexed { k, item -> walk(item, path + k.toString()) }
			is JsValue.Obj -> x.fields.forEach { (key, item) -> walk(item, path + jsonString(key)) }
			else -> {}
		}
	}
	walk(v, emptyList())
	return found.joinToString(",", "[", "]")
}

/** A value JSON carried, with the non-finite numbers [nonFinite] lists put back at their paths (nativeNonFiniteJoin). */
fun nonFiniteJoin(json: Json, nonFinite: Json?): JsValue {
	var value = JsValue.fromJson(json)
	for (entry in nonFinite?.arr("nonFinite").orEmpty()) {
		val pair = entry.arr("a non-finite entry")
		if (pair.size != 2) throw MarklessDecodeError("a non-finite entry is [path, name]")
		val path = pair[0].arr("a non-finite path")
		val number = when (val name = pair[1].str("a non-finite name")) {
			"Infinity" -> Double.POSITIVE_INFINITY
			"-Infinity" -> Double.NEGATIVE_INFINITY
			"NaN" -> Double.NaN
			else -> throw MarklessDecodeError("$name is not Infinity, -Infinity or NaN")
		}
		if (path.isEmpty()) { value = JsValue.Num(number); continue }
		var at = value
		for ((k, key) in path.withIndex()) {
			val last = k == path.size - 1
			when {
				at is JsValue.Arr && key is Json.Num && key.value.toInt() in at.items.indices -> if (last) at.items[key.value.toInt()] = JsValue.Num(number) else at = at.items[key.value.toInt()]
				at is JsValue.Obj && key is Json.Str && at.fields.containsKey(key.value) -> if (last) at.fields[key.value] = JsValue.Num(number) else at = at.fields[key.value]!!
				else -> throw MarklessDecodeError("the non-finite path names nothing in the value")
			}
		}
	}
	return value
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
/** [positions]: each row's place in its list by repeat id, from 0, which a `@for`'s `index` reads. */
data class Scope(val items: Map<String, JsValue> = emptyMap(), val locals: Map<String, JsValue> = emptyMap(), val keys: Map<String, String> = emptyMap(), val positions: Map<String, Int> = emptyMap()) {
	companion object {
		val EMPTY = Scope()
	}
}

/** A touch as a host reports it: [pointerId] numbers it (from 1, as a phone browser does), [x] and [y] are its place in points or dp from the screen's top left, [time] the milliseconds since the screen appeared. */
data class TouchPoint(val pointerId: Double = 1.0, val x: Double = 0.0, val y: Double = 0.0, val time: Double = 0.0)

/** One shown copy of a node: the node itself outside lists, one per row inside one (`<id>@<key>`). */
data class Instance(val id: String, val node: Node, val scope: Scope, val rowKey: String? = null)

/** A list row: its key (`String()` of the item at the key path) and item. */
data class Row(val key: String, val item: JsValue)

/** Runs handler ops on cells and reports what changed on shown nodes as journal entries, in document order. Free of android.*. */
/** [now]: the device's clock, in ms since 1970 (UTC); a conformance run fixes it. */
/** Each screen's async values run under their own number in an engine the app's screens share. */
private var screens = 0

class Runtime(
	val payload: Payload,
	private val store: Store = MemoryStore(),
	val params: Map<String, String> = emptyMap(),
	/** The device's preferred languages, most preferred first: the web's messages show in the first one the payload has. */
	preferredLanguages: List<String> = listOf("en"),
	private val now: () -> Double = { System.currentTimeMillis().toDouble() },
	/** Where a page with a script gets the app's engine; never asked for a page without one. */
	private val scriptHost: ScriptHost? = null,
	/** The app's values of its app-wide `shared()` cells, one for every page. */
	private val session: AppSession = AppSession.shared,
) {
	private val opened = now()
	private val computed = HashMap<String, JsValue>()
	private var computedCells: String? = null
	/** Cells still `undefined` on the web: a script reads them so until one is written. */
	private val unset = HashSet<String>().apply { for (c in payload.cells) if (c.unset && c.storageKey?.let(store::get) == null && !(c.app && c.id in session.values)) add(c.id) }
	private val values = LinkedHashMap<String, JsValue>().apply { for (c in payload.cells) put(c.id, if (c.clock) JsValue.Num(opened) else (if (c.app) session.values[c.id] else null) ?: c.storageKey?.let(store::get) ?: c.initial) }
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

	fun value(cell: String): JsValue = values[cell] ?: styleCases().firstOrNull { it.first == cell }?.let { JsValue.Bool(it.second) } ?: throw MarklessRuntimeError("unknown cell \"$cell\"")

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
			is Expr.Shown -> JsValue.Bool(byId[e.node]?.let { isShown(it) } ?: false)
			is Expr.ById -> when (val wanted = eval(e.value)) {
				JsValue.Null -> JsValue.Null
				else -> elementById(Js.toStr(wanted))?.let { JsValue.Str(it) } ?: JsValue.Null
			}
			is Expr.Drawn -> {
				val chosen = drawnArms ?: arms().toMap()
				var at = byId[e.node]?.arm
				var shown = true
				while (at != null && shown) {
					shown = chosen.containsKey(at.branch) && chosen[at.branch] == at.index
					at = byId[at.branch]?.arm
				}
				if (shown) JsValue.Str(e.node) else JsValue.Null
			}
			is Expr.Captures -> {
				val node = eval(e.node)
				val pointer = eval(e.pointer)
				JsValue.Bool(node is JsValue.Str && touching(pointer)?.capture == node.value)
			}
			is Expr.Contains -> {
				val within = eval(e.within)
				val node = eval(e.node)
				JsValue.Bool(within is JsValue.Str && node is JsValue.Str && contains(within.value, node.value))
			}
			is Expr.Literal -> e.value
			is Expr.Item -> scope.items[e.repeat] ?: throw MarklessRuntimeError("the row item of ${e.repeat} read outside its row")
			is Expr.Index -> JsValue.Num((scope.positions[e.repeat] ?: throw MarklessRuntimeError("the row index of ${e.repeat} read outside its row")).toDouble())
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
					e.optional && v == JsValue.Null -> JsValue.Null
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
			is Expr.Merge -> JsValue.Obj(LinkedHashMap<String, JsValue>().apply {
				for (part in e.parts) when (val value = eval(part)) {
					JsValue.Null -> {}
					is JsValue.Obj -> putAll(value.fields)
					else -> throw MarklessRuntimeError("a spread of a value that is not an object")
				}
			})
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
					val result = Json.parse(scriptCall("enter", entry)).obj("compute")
					val value = nonFiniteJoin(result.field("json", "compute"), result["nonFinite"])
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

	/** The screen's views: the box of an element (its node id, `<node>@<key>` in a row) a script reads, measured as an entry begins; null when it has no view. */
	var measure: ((id: String) -> ElementBox?)? = null
	/** The device's answers to the media features a script's `matchMedia` reads, read as each entry begins; the web's defaults when the host gives none. */
	var media: () -> List<Pair<String, String>> = { listOf("prefers-reduced-motion" to "no-preference", "prefers-color-scheme" to "light") }

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

	/** A script function's name as its engine entry spells it: a slot of this scope's cell, slots by field, or a value. */
	private sealed interface Bound {
		data class Slot(val slot: String) : Bound
		data class Fields(val fields: Map<String, String>) : Bound
		data class Value(val value: JsValue) : Bound
		data class Device(val device: String, val obj: String) : Bound
		data class Callback(val fn: String) : Bound
		data class Elements(val value: JsValue) : Bound
		data class Object(val members: Map<String, Bound>) : Bound
		data class Shared(val members: Map<String, Bound>) : Bound
		data class Method(val fn: String, val members: Map<String, Bound>) : Bound
	}

	private fun bind(bindings: Map<String, ScriptBinding>, scope: Scope): Map<String, Bound> = bindings.mapValuesTo(LinkedHashMap()) { (_, b) ->
		when (b) {
			is ScriptBinding.Cell -> Bound.Slot(slot(b.cell, scope))
			is ScriptBinding.Fields -> Bound.Fields(b.fields.mapValuesTo(LinkedHashMap()) { slot(it.value, scope) })
			is ScriptBinding.Value -> Bound.Value(evaluate(b.value, scope))
			is ScriptBinding.Device -> Bound.Device(b.device, b.obj)
			is ScriptBinding.Callback -> Bound.Callback(b.fn)
			is ScriptBinding.Elements -> Bound.Elements(evaluate(b.value, scope))
			is ScriptBinding.Object -> Bound.Object(bind(b.members, scope))
			is ScriptBinding.Shared -> Bound.Shared(bind(b.members, scope))
			is ScriptBinding.Method -> Bound.Method(b.fn, bind(b.members, scope))
		}
	}

	private fun frameJson(frame: Map<String, Bound>): String = frame.entries.joinToString(",", "{", "}") { (name, b) ->
		jsonString(name) + ":" + when (b) {
			is Bound.Slot -> "{\"slot\":${jsonString(b.slot)}}"
			is Bound.Fields -> "{\"fields\":${b.fields.entries.joinToString(",", "{", "}") { "${jsonString(it.key)}:${jsonString(it.value)}" }}}"
			is Bound.Value -> "{\"value\":${jsonValue(b.value)}}"
			is Bound.Device -> "{\"device\":${jsonString(b.device)},\"object\":${jsonString(b.obj)}}"
			is Bound.Callback -> "{\"callback\":${jsonString(b.fn)}}"
			is Bound.Elements -> "{\"elements\":${jsonValue(b.value)}}"
			is Bound.Object -> "{\"object\":${frameJson(b.members)}}"
			is Bound.Shared -> "{\"shared\":${frameJson(b.members)}}"
			is Bound.Method -> "{\"method\":${jsonString(b.fn)},\"frame\":${frameJson(b.members)}}"
		}
	}

	/** The names a script function reads, as its engine entry spells them: slots of this scope's cells, and values. */
	private fun frameOf(bindings: Map<String, ScriptBinding>, scope: Scope): String = frameJson(bind(bindings, scope))

	private fun nullish(v: JsValue?): JsValue? = v?.takeIf { it != JsValue.Null }

	/** A frame's names as the values they hold now. */
	private fun readFrame(frame: Map<String, Bound>): String = frame.values.joinToString(",", "[", "]") { b ->
		when (b) {
			is Bound.Slot -> jsonValue(nullish(values[b.slot]) ?: nullish(values[b.slot.substringBefore('@')]) ?: JsValue.Null)
			is Bound.Fields -> b.fields.values.joinToString(",", "[", "]") { jsonValue(values[it] ?: values[it.substringBefore('@')] ?: JsValue.Null) }
			is Bound.Value -> jsonValue(b.value)
			is Bound.Device -> jsonString(b.obj)
			is Bound.Callback -> "null"
			is Bound.Elements -> jsonValue(b.value)
			is Bound.Object -> readFrame(b.members)
			is Bound.Shared -> readFrame(b.members)
			is Bound.Method -> readFrame(b.members)
		}
	}

	/** What the host tells a script about the elements its frame passes as proxies: each one's attributes now and the elements it is inside, nearest first. */
	private fun elementFacts(bindings: Map<String, ScriptBinding>, scope: Scope, also: List<String> = emptyList()): String {
		val facts = LinkedHashMap<String, String>()
		fun add(value: JsValue) {
			if (value !is JsValue.Str) return
			val id = value.value
			if (id in facts || id == NATIVE_DOCUMENT_BODY || !isElement(id)) return
			val key = if ('@' in id) id.substring(id.indexOf('@')) else ""
			val node = elementOf(id.substringBefore('@'))
			val names = LinkedHashSet<String>(node.attributes.keys.sorted()).apply { addAll(node.bindings.filter { !it.property }.map { it.name }) }
			val at = instances(node).firstOrNull { it.id == id }?.scope ?: Scope.EMPTY
			val attributes = names.mapNotNull { name -> attributeIn(node, name, at)?.let { "${jsonString(name)}:${jsonString(it)}" } }
			val ancestors = ArrayList<String>()
			var up = node.parent
			while (up != null) {
				ancestors.add(jsonString(if (key.isNotEmpty() && byId[up]?.row != null) up + key else up))
				up = byId[up]?.parent
			}
			val captures = touches.filterValues { it.capture == id }.keys.sorted().map { jsonValue(JsValue.Num(it)) }
			val held = if (captures.isEmpty()) "" else ",\"captures\":${captures.joinToString(",", "[", "]")}"
			val box = measure?.invoke(id)?.let { b ->
				val n = { v: Double -> jsonValue(JsValue.Num(v)) }
				",\"box\":{\"x\":${n(b.x)},\"y\":${n(b.y)},\"width\":${n(b.width)},\"height\":${n(b.height)}},\"direction\":\"${if (b.rightToLeft) "rtl" else "ltr"}\""
			} ?: ""
			facts[id] = "{\"attributes\":${attributes.joinToString(",", "{", "}")},\"ancestors\":${ancestors.joinToString(",", "[", "]")}$held$box}"
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
		also.forEach { add(JsValue.Str(it)) }
		return facts.entries.joinToString(",", "{", "}") { "${jsonString(it.key)}:${it.value}" }
	}

	/** Every current value by slot, the seed `crypto` draws from when the script uses it, the route params for `navigate`, and the device's media answers for `media`. */
	private fun entryCells(): String = buildString {
		append(",\"cells\":")
		append(values.entries.joinToString(",", "{", "}") { "${jsonString(it.key)}:${jsonValue(it.value)}" })
		if (unset.isNotEmpty()) append(",\"unset\":${unset.sorted().joinToString(",", "[", "]") { jsonString(it) }}")
		// JSON writes Infinity and NaN as null: the entry lists where they were, each path starting with its slot.
		val nonFinite = nonFiniteJson(JsValue.Obj(LinkedHashMap(values)))
		if (nonFinite != "[]") append(",\"nonFinite\":$nonFinite")
		if (payload.script?.services?.contains("crypto") == true) scriptHost?.seed()?.let { append(",\"seed\":${jsonString(it)}") }
		if (payload.script?.services?.contains("navigate") == true)
			append(",\"params\":" + params.entries.joinToString(",", "{", "}") { "${jsonString(it.key)}:${jsonString(it.value)}" })
		if (payload.script?.services?.contains("media") == true)
			append(",\"media\":" + media().joinToString(",", "{", "}") { "${jsonString(it.first)}:${jsonString(it.second)}" })
	}

	/** Submissions held by a script promise not settled yet, by the engine's run number. */
	private val scriptRuns = HashMap<Int, Submission>()

	/** One engine entry, then what it asked for: its writes land in cells; clears, timers and requests become entries, in that order. */
	private fun enter(fields: String, submission: Submission? = null): List<JournalEntry> {
		// A handler may read the focused element; a computed, which renders, never does, so only entries carry it.
		val focus = focused?.takeIf { it != NATIVE_DOCUMENT_BODY }?.let { ",\"focused\":${jsonString(it)},\"focusElements\":${elementFacts(emptyMap(), Scope.EMPTY, listOf(it))}" } ?: ""
		val entry = "{$fields$focus${entryCells()}}"
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
			val v = nonFiniteJoin(pair[1], pair.getOrNull(2))
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
		// A submit handler's promise keeps its submission running until the entry it settles in, as the web keeps the form busy.
		for (run in list("pending")) if (submission != null) {
			submission.pending++
			scriptRuns[id(run)] = submission
		}
		for (run in list("settled")) scriptRuns.remove(id(run))?.let { it.pending--; settled(it) }
		val raised = ArrayList<JournalEntry>()
		for (event in result["raises"]?.arr("leave().raises") ?: emptyList()) {
			val taken = raise(event.obj("leave().raises[]"))
			if (taken.firstOrNull() is JournalEntry.Navigate) return taken
			raised.addAll(taken)
		}
		return list("aborts").map { JournalEntry.Abort(id(it)) } +
			list("clears").map { JournalEntry.ClearTimer("$SCRIPT_TIMER${id(it)}") } +
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
			(result["calls"]?.arr("leave().calls") ?: emptyList()).map { c ->
				val o = c.obj("leave().calls[]")
				o.only(setOf("id", "call", "object", "arguments"), "leave().calls[]")
				JournalEntry.Call(
					o.field("call", "leave().calls[]").str("leave().calls[].call"),
					o.field("arguments", "leave().calls[]").arr("leave().calls[].arguments").map { JsValue.fromJson(it) },
					null,
					o["object"]?.str("leave().calls[].object"),
					o["id"]?.let { "$SCRIPT_CALL${id(it)}" },
				)
			} +
			(if (result.containsKey("commands")) list("commands") else emptyList()).mapNotNull { c ->
				val parts = c.arr("leave().commands[]")
				val node = parts[0].str("leave().commands[][0]")
				val command = parts[1].str("leave().commands[][1]")
				if (command == "setPointerCapture" || command == "releasePointerCapture") {
					val touch = (parts[2] as? Json.Num)?.let { touches[it.value + 0.0] } ?: return@mapNotNull null
					if (command == "setPointerCapture") touch.capture = node else if (touch.capture == node) touch.capture = null
					return@mapNotNull null
				}
				// A dialog's showModal() and close() change what the views show; the journal's dialog entry says so.
				if (command == "showModal" || command == "close") {
					if (node !in dialogs) throw MarklessRuntimeError("$command() on $node, which is not a dialog")
					setDialog(node, command == "showModal")
					return@mapNotNull null
				}
				if (command == "focus") focused = node
				JournalEntry.Command(node, command, (parts[2] as? Json.Bool)?.value == true)
			} +
			// A key or paste handler called preventDefault() before it first awaited.
			(if ((result["prevented"] as? Json.Bool)?.value == true) listOf(JournalEntry.PreventDefault) else emptyList()) +
			// An input handler that set its field's value (`event.target.value = …`) writes the field, as the DOM's setter does.
			listOfNotNull(typing?.let { field -> result["value"]?.str("leave().value")?.let { text -> edited[field] = text; JournalEntry.Property(field, "value", text) } }) +
			raised +
			listOfNotNull(result["navigate"]?.let { n ->
				val o = n.obj("leave().navigate")
				o.only(setOf("route", "params", "replace"), "leave().navigate")
				JournalEntry.Navigate(
					o.field("route", "leave().navigate").str("leave().navigate.route"),
					o.field("params", "leave().navigate").obj("leave().navigate.params").mapValues { it.value.str("a route param") },
					(o.field("replace", "leave().navigate") as? Json.Bool)?.value ?: throw MarklessDecodeError("leave().navigate.replace must be a boolean"),
				)
			})
	}

	/** How deep events raised from JavaScript nest now. */
	private var raising = 0
	/** The text field whose input event is running, which a handler's `event.target.value` write lands on. */
	private var typing: String? = null

	/**
	 * An event a script dispatched on an element (or its `click()`), raised once the script returned: `click` as a press on
	 * the innermost element from it outwards that has one; any other type on the element, then its ancestors when it
	 * bubbles, each running its own handler for that type.
	 */
	private fun raise(event: Map<String, Json>): List<JournalEntry> {
		if (raising >= RAISE_DEPTH) throw MarklessRuntimeError("events raised from JavaScript nest deeper than $RAISE_DEPTH")
		raising++
		try {
			val target = (event["node"] ?: Json.Null).str("a raised event's node")
			val type = (event["type"] ?: Json.Null).str("a raised event's type")
			val chain = chain(target)
			fun scopeOf(id: String): Scope? = byId[id.substringBefore('@')]?.let { node -> instances(node).firstOrNull { it.id == id }?.scope }
			if (type == "click") {
				val pressed = chain.firstOrNull { handlerFor(it.substringBefore('@'), EventName.Activate) != null } ?: return emptyList()
				val scope = scopeOf(pressed) ?: return emptyList()
				return withFields(clickFields(trusted = false)) { run(handlers[handlerFor(pressed.substringBefore('@'), EventName.Activate)]?.ops.orEmpty(), scope) }
			}
			val name = EventName.entries.firstOrNull { it.wire == type } ?: return emptyList()
			fun optional(key: String, fallback: JsValue): JsValue = event[key]?.let { JsValue.fromJson(it) } ?: fallback
			val calls = ArrayList<JournalEntry>()
			for (node in if ((event["bubbles"] as? Json.Bool)?.value == true) chain else chain.take(1)) {
				val own = handlerFor(node.substringBefore('@'), name) ?: continue
				val scope = scopeOf(node) ?: continue
				val f = if (name == EventName.Dismiss) mapOf("reason" to optional("reason", JsValue.Str("")), "pressTarget" to JsValue.Null, "isTrusted" to JsValue.Bool(false))
				else if (name == EventName.Keydown) mapOf("isTrusted" to JsValue.Bool(false), "key" to optional("key", JsValue.Str("")), "target" to JsValue.Str(target), "currentTarget" to JsValue.Str(node))
				else mapOf(
					"isTrusted" to JsValue.Bool(false),
					"target" to JsValue.Str(target), "currentTarget" to JsValue.Str(node), "relatedTarget" to optional("relatedTarget", JsValue.Null),
					"button" to optional("button", JsValue.Num(0.0)), "buttons" to optional("buttons", JsValue.Num(0.0)),
					"clientX" to optional("clientX", JsValue.Num(0.0)), "clientY" to optional("clientY", JsValue.Num(0.0)),
					"pointerId" to optional("pointerId", JsValue.Num(0.0)), "pointerType" to optional("pointerType", JsValue.Str("")),
					"isPrimary" to optional("isPrimary", JsValue.Bool(false)), "timeStamp" to JsValue.Num(0.0),
				)
				val taken = withFields(f) { run(handlers[own]?.ops.orEmpty(), scope) }
				if (taken.firstOrNull() is JournalEntry.Navigate) return taken
				calls.addAll(taken)
			}
			return calls
		} finally {
			raising--
		}
	}


	private val screen = ++screens
	private val asyncCells = payload.cells.filter { it.async != null }
	/** What the async values' runs depend on as last told to the engine; null before the first. */
	private var asyncSent: String? = null
	/** Async values a `reset` asked to run again, by slot: sent with the next `tasks` entry. */
	private val retry = LinkedHashSet<String>()

	/** Tells the engine which async values are shown and what they read, when that moved; it starts and aborts runs. */
	private fun syncAsync(): List<JournalEntry> {
		if (asyncCells.isEmpty()) return emptyList()
		val out = ArrayList<JournalEntry>()
		// A run that settles at once can show another; the engine is asked again until nothing moves.
		repeat(16) {
			val shown = asyncCells.flatMap { c ->
				val at = LinkedHashMap<String, Scope>()
				for (id in c.async!!.boundaries) for (inst in byId[id]?.let(::instances).orEmpty()) at.putIfAbsent(slot(c.id, inst.scope), inst.scope)
				at.map { (slot, scope) -> Triple(c, slot, bind(c.async.bindings, scope)) }
			}
			val frames = shown.map { it.third }
			val tasks = shown.joinToString(",", "[", "]") { (c, slot, frame) -> "{\"slot\":${jsonString(slot)},\"fn\":${jsonString(c.async!!.fn)},\"frame\":${frameJson(frame)}}" }
			val sent = "[$tasks,${frames.joinToString(",", "[", "]", transform = ::readFrame)}]"
			if (sent == asyncSent && retry.isEmpty()) return out
			asyncSent = sent
			val again = if (retry.isEmpty()) "" else retry.joinToString(",", ",\"retry\":[", "]", transform = ::jsonString)
			retry.clear()
			out.addAll(enter("\"kind\":\"tasks\",\"screen\":$screen,\"tasks\":$tasks$again"))
		}
		throw MarklessRuntimeError("async values that keep starting each other")
	}

	/** Starts the async values the script computes, once the screen is built; the host applies its journal as an action's. */
	/** The screen shows again (Back): app-scoped shared fields take the values the app holds now; the journal of what moved. */
	fun start(): List<JournalEntry> = if (asyncCells.isEmpty()) emptyList() else change(null, null) { emptyList() }

	/** The screen shows again after Back: it takes the app's values of its app-wide cells that a page above it changed. */
	fun resume(): List<JournalEntry> {
		val moved = payload.cells.filter { c -> c.app && session.values[c.id]?.let { it != values[c.id] } == true }
		if (moved.isEmpty()) return emptyList()
		return change(null, null) { for (c in moved) values[c.id] = session.values.getValue(c.id); emptyList() }
	}

	/** The screen is gone: its async values' runs are aborted; the journal holds the requests to cancel. */
	fun leave(): List<JournalEntry> =
		if (asyncSent == null) emptyList()
		else enter("\"kind\":\"tasks\",\"screen\":$screen,\"tasks\":[],\"leave\":true").filter { it is JournalEntry.Abort }

	/** The host's answer to a `fetch` entry: `{ status, statusText, headers, body }`, or `{ error }` for a network failure. */
	fun response(id: Int, response: JsValue): List<JournalEntry> =
		change(null, null) { enter("\"kind\":\"response\",\"request\":$id,\"response\":${jsonValue(response)}") }

	fun armOf(branch: Node.Branch, scope: Scope = Scope.EMPTY): Int? {
		val tests = branch.tests ?: return if (Js.truthy(evaluate(branch.test!!, scope))) 0 else if (branch.arms > 1) 1 else null
		for ((i, t) in tests.withIndex()) if (t != null && Js.truthy(evaluate(t, scope))) return i
		return tests.indexOfFirst { it == null }.takeIf { it >= 0 }
	}

	/** Whether [node] shows where [scope] is: in a list row, the arms around it are that row's. */
	fun shownIn(node: Node, scope: Scope): Boolean = armShown(node.arm, scope)

	/** Whether an arm place shows: its branch shows and has that arm chosen; no place always shows. */
	private fun armShown(a: ArmPlace?, scope: Scope = Scope.EMPTY): Boolean {
		if (a == null) return true
		val b = byId[a.branch] as? Node.Branch ?: return false
		return shownIn(b, scope) && armOf(b, scope) == a.index
	}

	/** Whether any instance of [node] shows. */
	fun isShown(node: Node): Boolean = instances(node).isNotEmpty()

	fun rowsOf(repeat: Node.Repeat, scope: Scope = Scope.EMPTY): List<Row> {
		val list = evaluate(repeat.list, scope) as? JsValue.Arr ?: throw MarklessRuntimeError("${repeat.id} lists a value that is not an array")
		val keyPath = repeat.key ?: return list.items.mapIndexed { index, item -> Row(index.toString(), item) }
		fun valueAt(item: JsValue, path: List<String>): JsValue {
			var key = item
			for (step in path) key = (key as? JsValue.Obj)?.fields?.get(step) ?: throw MarklessRuntimeError("${repeat.id}: a row has no key at ${path.joinToString(".")}")
			return key
		}
		return list.items.map { item ->
			@Suppress("UNCHECKED_CAST")
			val key = repeat.keyParts?.joinToString("") { if (it is String) it else Js.toStr(valueAt(item, it as List<String>)) } ?: Js.toStr(valueAt(item, keyPath))
			Row(key, item)
		}
	}

	/**
	 * Every shown instance of [node]: one outside lists, one per row inside one; a row of a list inside another list's row
	 * is keyed by both (`<id>@<outer>@<key>`), and its [Instance.rowKey] is that whole suffix.
	 */
	fun instances(node: Node): List<Instance> {
		val r = node.row ?: return if (shownIn(node, Scope.EMPTY)) listOf(Instance(node.id, node, Scope.EMPTY)) else emptyList()
		val repeat = byId[r] as? Node.Repeat ?: return emptyList()
		return instances(repeat).flatMap { copy ->
			val outer = repeat.row?.let { copy.scope.keys[it] }
			rowsOf(repeat, copy.scope).mapIndexed { position, it ->
				val suffix = if (outer == null) it.key else "$outer@${it.key}"
				Instance("${node.id}@$suffix", node, copy.scope.copy(items = copy.scope.items + (repeat.id to it.item), keys = copy.scope.keys + (repeat.id to suffix), positions = copy.scope.positions + (repeat.id to position)), suffix)
			}
		}.filter { shownIn(node, it.scope) }
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
	fun textOf(id: String): String {
		val text = edited[id] ?: propertyBinding(id, "value")?.let(::property) ?: attributeNow(id, "value") ?: ""
		// A range keeps a number in its range and on its step, whatever it is given.
		return if (attributeNow(id, "type") == "range") nativeRangeValue(text, attributeNow(id, "min"), attributeNow(id, "max"), attributeNow(id, "step")) else text
	}

	/** Every non-row checkbox and radio button, in payload order. */
	private val ticked = payload.nodes.filterIsInstance<Node.Element>().filter { it.element == "input" && it.row == null && it.attributes["type"].let { t -> t == "checkbox" || t == "radio" } }

	/** A box an arm hides is not built yet, so its binding (which may read what the arm's test guards) is not read. */
	private fun checkedBinding(id: String): Boolean? {
		if (byId[id]?.let { !isShown(it) } == true) return null
		return propertyBinding(id, "checked")?.let { Js.truthy(evaluate(it.value)) }
	}

	/** Each checkbox's and radio button's checkedness: its `checked` binding sets it, as does a person's tick. */
	private val checkedness = LinkedHashMap<String, Boolean>().apply { for (n in ticked) put(n.id, checkedBinding(n.id) ?: ("checked" in n.attributes)) }

	fun checkedOf(id: String): Boolean = checkedness[id] ?: throw MarklessRuntimeError("\"$id\" is not a checkbox or radio button")

	/** Every shown checkbox's and radio button's checkedness. */
	fun checks(): List<Pair<String, Boolean>> = ticked.filter(::isShown).map { it.id to checkedOf(it.id) }

	private class OptionInstance(val id: String, val node: Node.Element, val scope: Scope)

	/** Every `<select>`, in payload order. */
	private val selects = payload.nodes.filterIsInstance<Node.Element>().filter { it.element == "select" }

	/** The first shown element whose `id` attribute is [wanted] now, as `document.getElementById` finds it. */
	private fun elementById(wanted: String): String? {
		for (node in payload.nodes) {
			if (node !is Node.Element) continue
			for (instance in instances(node)) if (attributeIn(node, "id", instance.scope) == wanted) return instance.id
		}
		return null
	}

	/** An attribute of one instance as the web has it now: a binding's value in its row, else the attribute as built. */
	private fun attributeIn(node: Node.Element, name: String, scope: Scope): String? {
		val binding = node.bindings.firstOrNull { !it.property && it.name == name }
		return if (binding != null) attribute(binding, scope) else node.attributes[name]
	}

	/** A select's shown options in tree order: a list's rows where the list stands, each row's options in order. */
	private fun optionsOf(select: String): List<OptionInstance> {
		val children = payload.nodes.filterIsInstance<Node.Element>().filter { it.element == "option" && it.parent == select }
		val listed = HashSet<String>()
		val found = ArrayList<OptionInstance>()
		for (node in children) {
			val row = node.row
			if (row == null) {
				instances(node).mapTo(found) { OptionInstance(it.id, node, it.scope) }
				continue
			}
			if (!listed.add(row)) continue
			val repeat = byId[row] as? Node.Repeat ?: continue
			if (!isShown(repeat)) continue
			val siblings = children.filter { it.row == row }
			val shown = HashMap<String, OptionInstance>()
			for (child in siblings) for (inst in instances(child)) shown[inst.id] = OptionInstance(inst.id, child, inst.scope)
			for (r in rowsOf(repeat)) for (child in siblings) shown["${child.id}@${r.key}"]?.let(found::add)
		}
		return found
	}

	/** An option's text: its text with ASCII whitespace stripped and collapsed, as `option.text` gives it. */
	private fun optionText(option: OptionInstance): String =
		payload.nodes.filterIsInstance<Node.Text>().filter { it.parent == option.node.id }.joinToString("") { text(it, option.scope) }
			.split('\t', '\n', '\u000C', '\r', ' ').filter { it.isNotEmpty() }.joinToString(" ")

	private fun optionValue(option: OptionInstance): String = attributeIn(option.node, "value", option.scope) ?: optionText(option)

	private fun selectedBinding(option: OptionInstance): Boolean? =
		option.node.bindings.firstOrNull { it.property && it.name == "selected" }?.let { Js.truthy(evaluate(it.value, option.scope)) }

	/** Each shown option's selectedness, kept as the web keeps it (HTML's selectedness setting algorithm). */
	private val selectedness = HashMap<String, Boolean>()
	/** What each option's `selected` binding last wrote: a binding sets the selectedness only when its value changes. */
	private val selectedBound = HashMap<String, Boolean?>()
	/** The option a person chose in the action being dispatched. */
	private var chosenNow: String? = null

	/** Brings each select's options up to date: rows that came or left, `selected` bindings that changed, then the rule. */
	private fun settleSelects(chosen: String? = null) {
		for (select in selects) {
			val options = optionsOf(select.id)
			val ids = options.mapTo(HashSet()) { it.id }
			for (id in selectedBound.keys.filter { byId[it.substringBefore('@')]?.parent == select.id && it !in ids }) {
				selectedBound.remove(id)
				selectedness.remove(id)
			}
			fun choose(id: String) { for (o in options) selectedness[o.id] = o.id == id }
			for (option in options) {
				if (!selectedBound.containsKey(option.id)) {
					val first = selectedBinding(option)
					selectedBound[option.id] = first
					val selected = first ?: (attributeIn(option.node, "selected", option.scope) != null)
					selectedness[option.id] = selected
					if (selected) choose(option.id)
					continue
				}
				val bound = selectedBinding(option)
				if (bound != null && bound != selectedBound[option.id]) {
					selectedBound[option.id] = bound
					selectedness[option.id] = bound
					if (bound) choose(option.id)
				}
			}
			if (chosen != null && chosen in ids) choose(chosen)
			if (options.none { selectedness[it.id] == true })
				options.firstOrNull { attributeIn(it.node, "disabled", it.scope) == null }?.let { selectedness[it.id] = true }
		}
	}

	init {
		settleSelects()
	}

	/** Each shown option of each `<select>`, in tree order, and whether it is selected. */
	fun selections(): List<Pair<String, Boolean>> = selects.flatMap { s -> optionsOf(s.id).map { it.id to (selectedness[it.id] ?: false) } }

	/** One option as a select's list shows it: its instance id, its label, whether it cannot be chosen, whether it is chosen. */
	data class Choice(val option: String, val label: String, val disabled: Boolean, val selected: Boolean)

	/** What [select]'s list shows: each shown option in tree order; a label is its `label` attribute when not empty, else its text. */
	fun choices(select: String): List<Choice> = optionsOf(select).map { o ->
		Choice(o.id, attributeIn(o.node, "label", o.scope)?.takeIf { it.isNotEmpty() } ?: optionText(o), attributeIn(o.node, "disabled", o.scope) != null, selectedness[o.id] ?: false)
	}

	private fun formOf(id: String): String? = payload.forms.firstOrNull { f -> f.fields.any { it.node == id } }?.node

	/** The radio buttons of [id]'s group: the same `name`, in the same form or in none. */
	private fun groupOf(id: String): List<Node.Element> {
		val name = attributeNow(id, "name")
		val form = formOf(id)
		return ticked.filter { it.id == id || (it.attributes["type"] == "radio" && !name.isNullOrEmpty() && attributeNow(it.id, "name") == name && formOf(it.id) == form) }
	}

	private val missing: ValueMissing? = payload.valueMissing[nativeLocale(preferredLanguages, payload.valueMissing.keys)]
	private val tooLong: TooLong? = payload.tooLong[nativeLocale(preferredLanguages, payload.tooLong.keys)]
	private val numberMessages: NumberMessages? = payload.numberMessages[nativeLocale(preferredLanguages, payload.numberMessages.keys)]
	private val emailMismatch: EmailMismatch? = payload.typeMismatch[nativeLocale(preferredLanguages, payload.typeMismatch.keys)]

	/** A text field's value as the web keeps it: an email field drops line breaks and trims its ends. */
	private fun valueOf(node: String): String = textOf(node).let { if (attributeNow(node, "type") == "email") emailValue(it) else it }

	private fun entriesOf(id: String): JsValue {
		val form = forms[id] ?: throw MarklessRuntimeError("\"$id\" is not a form")
		val out = ArrayList<JsValue>()
		for ((node, kind) in form.fields) {
			val name = attributeNow(node, "name")
			if (!isShown(elementOf(node)) || attributeNow(node, "disabled") != null || name.isNullOrEmpty()) continue
			val value = when (kind) {
				FieldKind.Checkbox, FieldKind.Radio -> if (checkedOf(node)) attributeNow(node, "value") ?: "on" else continue
				FieldKind.Hidden -> attributeNow(node, "value") ?: ""
				FieldKind.Text -> valueOf(node)
				FieldKind.Number -> nativeNumberValue(textOf(node))
				FieldKind.Select -> optionsOf(node).firstOrNull { selectedness[it.id] == true }?.let(::optionValue) ?: continue
			}
			out.add(JsValue.Arr(mutableListOf(JsValue.Str(name), JsValue.Str(value))))
		}
		return JsValue.Arr(out)
	}

	/** The first field that stops a submit, or null when none does. */
	private fun firstInvalid(form: Form, submitter: String?): Pair<String, String>? {
		if (form.noValidate || (submitter != null && attributeNow(submitter, "formnovalidate") != null)) return null
		for (field in form.fields) invalidity(field)?.let { return field.node to it }
		return null
	}

	/** Why a field stops a submit, as the web says it, or null when it does not. */
	private fun invalidity(field: Field): String? {
		val (node, kind) = field
		if (kind == FieldKind.Hidden || kind == FieldKind.Select || !isShown(elementOf(node)) || attributeNow(node, "disabled") != null) return null
		// A readonly text field is barred from constraint validation.
		if (kind == FieldKind.Text && attributeNow(node, "readonly") != null) return null
		// A radio button is missing its value when any button of its group is required and none is checked.
		val required = if (kind == FieldKind.Radio) groupOf(node).any { attributeNow(it.id, "required") != null } else attributeNow(node, "required") != null
		val absent = required && when (kind) {
			FieldKind.Radio -> groupOf(node).none { checkedOf(it.id) }
			FieldKind.Text, FieldKind.Number -> valueOf(node) == ""
			else -> !checkedOf(node)
		}
		if (absent) {
			val messages = missing ?: throw MarklessRuntimeError("the payload has no message for a ${kind.wire} missing its value")
			return when (kind) { FieldKind.Radio -> messages.radio; FieldKind.Checkbox -> messages.checkbox; else -> messages.text }
		}
		if (kind == FieldKind.Number) {
			val problem = nativeNumberProblem(textOf(node), attributeNow(node, "min"), attributeNow(node, "max"), attributeNow(node, "step"), attributeNow(node, "value")) ?: return null
			return (numberMessages ?: throw MarklessRuntimeError("the payload has no messages for a number field")).message(problem)
		}
		// Only text a person typed is too long: a value the app set is kept whole and passes.
		if (kind != FieldKind.Text) return null
		if (attributeNow(node, "type") == "email")
			(emailMismatch ?: throw MarklessRuntimeError("the payload has no message for an email field")).message(valueOf(node))?.let { return it }
		// Only text a person typed is too long: a value the app set is kept whole and passes.
		val max = nativeMaxLength(attributeNow(node, "maxlength")) ?: return null
		val typed = edited[node] ?: return null
		if (typed.length <= max) return null
		return (tooLong ?: throw MarklessRuntimeError("the payload has no message for a field longer than its maxlength")).message(max, typed.length)
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
	/** A branch's style state: the arm it shows ("0", "1", …, or "none"); null while it is not shown. */
	fun styleArm(branch: String): JsValue? = arms().firstOrNull { it.first == branch }?.let { JsValue.Str(it.second?.toString() ?: "none") }

	fun arms(): List<Pair<String, Int?>> = payload.nodes.filterIsInstance<Node.Branch>().flatMap { b -> instances(b).map { it.id to armOf(b, it.scope) } }

	/** Every shown list's row keys, in order. */
	fun rows(): List<Pair<String, List<String>>> = payload.nodes.filterIsInstance<Node.Repeat>().flatMap { r -> instances(r).map { it.id to rowsOf(r, it.scope).map { row -> row.key } } }

	/** Every system sheet shown (its arm, if any, showing) and whether its `open` is truthy. */
	fun sheets(): List<Pair<String, Boolean>> = payload.nodes.filterIsInstance<Node.Sheet>().filter { isShown(it) }.map { it.id to Js.truthy(evaluate(it.open)) }

	/** Each `<dialog>`'s top-layer state; every dialog mounts closed. */
	private val dialogs = LinkedHashMap<String, Boolean>().apply {
		for (n in payload.nodes) if (n is Node.Element && n.element == "dialog") put(n.id, false)
	}

	fun dialogs(): List<Pair<String, Boolean>> = dialogs.entries.map { it.key to it.value }

	fun isDialogOpen(id: String): Boolean = dialogs[id] == true

	/** Dialogs that closed during the current change, in order; each fires its `close` once the change's handler ends. */
	private val closing = ArrayDeque<String>()

	private fun setDialog(node: String, open: Boolean) {
		if (dialogs[node] == true && !open) closing.addLast(node)
		dialogs[node] = open
	}

	private var focused: String? = null
	/** The arms on screen when the running action began; null between actions, when what shows is what the cells say. */
	private var drawnArms: Map<String, Int?>? = null
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

	/** Whether [overlay] is a hint (a tooltip, a hovercard): `overlay-hint` beside `overlay`, as authored. */
	private fun isHint(overlay: String): Boolean = (byId[overlay] as? Node.Element)?.attributes?.containsKey(OVERLAY_HINT_ATTRIBUTE) == true

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
		// A box's `checked` binding reads cells only now settled (a group's value following its prop): it sets the box again.
		for (n in ticked) checkedBinding(n.id)?.let { checkedness[n.id] = it }
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
	 * row. A `dismiss` with a [reason] is an overlay's Escape; without one, a sheet's platform close. A touch
	 * ([EventName.touch], at [point]) raises the browser's pointer events, after a `dismiss` of the topmost overlay when a
	 * `pointerdown` lands outside it.
	 */
	fun dispatch(host: String, event: EventName, value: String? = null, reason: String? = null, detail: Int? = null, point: TouchPoint? = null): List<JournalEntry> {
		if (event == EventName.Choose) {
			val option = byId[host.substringBefore('@')] as? Node.Element
			val select = option?.parent
			if (option?.element != "option" || select == null) throw MarklessRuntimeError("\"$host\" is not an option of a select")
			val instance = optionsOf(select).firstOrNull { it.id == host } ?: throw MarklessRuntimeError("\"$host\" is not shown")
			return change(null, null) {
				if (attributeNow(select, "disabled") != null || attributeIn(option, "disabled", instance.scope) != null) return@change emptyList()
				val before = optionsOf(select).firstOrNull { selectedness[it.id] == true }?.id
				chosenNow = host
				// A different choice fires the select's `change` (an `input` event here), its value the new option's.
				val changed = handlerFor(select, EventName.Input)
				if (before == host || changed == null) return@change emptyList()
				for (one in optionsOf(select)) selectedness[one.id] = one.id == host
				withFields(mapOf("value" to JsValue.Str(optionValue(instance)))) { run(handlers[changed]?.ops.orEmpty(), instance.scope) }
			}
		}
		if (detail != null && event != EventName.Activate) throw MarklessRuntimeError("a ${event.wire} event carries no press count")
		if ((event in VALUED) != (value != null)) throw MarklessRuntimeError("an ${event.wire} event ${if (value == null) "needs" else "carries no"} a value")
		if (reason != null && event != EventName.Dismiss) throw MarklessRuntimeError("a ${event.wire} event carries no reason")
		if (point != null && !event.touch && event != EventName.ContextMenu) throw MarklessRuntimeError("a ${event.wire} event carries no touch")
		if (event == EventName.Dismiss && reason != null) {
			if (stack.lastOrNull() != host) throw MarklessRuntimeError("\"$host\" is not the topmost overlay")
			val dismiss = handlerFor(host, event)?.let { handlers[it] ?: throw MarklessRuntimeError("unknown handler \"$it\"") }
			return change(null, null) {
				dismiss?.let { withFields(mapOf("reason" to JsValue.Str(reason), "pressTarget" to JsValue.Null)) { run(it.ops, Scope.EMPTY) } } ?: emptyList()
			}
		}
		if (event.touch) return touch(host, event, point ?: TouchPoint())
		if (event == EventName.ContextMenu) return contextMenu(host, point ?: TouchPoint())
		if (event.pointer || event == EventName.Close) throw MarklessRuntimeError("${event.wire} is raised by the runtime, not dispatched")
		if (event == EventName.Cancel) {
			if (dialogs[host] != true) throw MarklessRuntimeError("\"$host\" is not an open dialog")
			val cancel = handlerFor(host, event)?.let { handlers[it] ?: throw MarklessRuntimeError("unknown handler \"$it\"") }
			return change(host, null) {
				setDialog(host, false)
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
		// A number field keeps what was typed, and its handlers read its value, which is empty while that is no number.
		val numeric = event == EventName.Input && (node(template) as? Node.Element)?.attributes?.get("type") == "number"
		val carried = when (event) {
			EventName.Input, EventName.Commit -> value?.let { mapOf("value" to JsValue.Str(if (numeric) nativeNumberValue(it) else it)) }
			// A key's or paste's script handler reads the field's text then as `event.target.value`.
			EventName.Keydown, EventName.Keyup -> mapOf("key" to JsValue.Str(value!!), "value" to JsValue.Str(textOf(host)))
			EventName.Paste -> mapOf("text" to JsValue.Str(value!!), "value" to JsValue.Str(textOf(host)))
			EventName.Activate -> clickFields(trusted = true) + ("detail" to JsValue.Num((detail ?: 1).toDouble()))
			else -> null
		}
		return change(host, if (event == EventName.Input || event == EventName.Commit) value else null) {
			withFields(carried) { run(handler.ops, scope) }
		}
	}

	/** Where the last touch came up, which the click it makes reports; a click no touch made is at 0, 0. */
	private var tapPoint: Pair<Double, Double>? = null

	/** The element a phone browser's mouse is over: the last one tapped, until a tap elsewhere moves it. */
	private var mouseOver: String? = null

	private fun clickFields(trusted: Boolean): Map<String, JsValue> {
		val at = if (trusted) tapPoint else null
		tapPoint = null
		return mapOf(
			"isTrusted" to JsValue.Bool(trusted), "clientX" to JsValue.Num(at?.first ?: 0.0), "clientY" to JsValue.Num(at?.second ?: 0.0),
			"shiftKey" to JsValue.Bool(false), "ctrlKey" to JsValue.Bool(false), "altKey" to JsValue.Bool(false), "metaKey" to JsValue.Bool(false),
			"detail" to JsValue.Num(0.0),
		)
	}

	private class Touching(var capture: String?, var over: String, val primary: Boolean)

	/** Each touch that is down: the element it is captured to (null after a release), the one under it, and whether it was first. */
	private val touches = LinkedHashMap<Double, Touching>()

	// Last, once every field a script entry reads is set: a first value the build could not know is taken when the screen
	// opens, in cell order, as the body runs once on the web.
	/** Seeded cells whose arm is hidden: their seed runs again when the arm shows, as its component renders then. */
	private val reseed = HashSet<String>()

	init {
		for (c in payload.cells) c.seed?.let { if (armShown(c.arm)) values[c.id] = evaluate(it) else reseed.add(c.id) }
	}

	private fun touching(pointer: JsValue): Touching? = (pointer as? JsValue.Num)?.let { touches[it.value + 0.0] }

	/** The elements from [id] out to the root, innermost first; those in its row keep its row's key. */
	private fun chain(id: String): List<String> {
		val base = id.substringBefore('@')
		val key = if ('@' in id) id.substring(id.indexOf('@')) else ""
		val out = ArrayList<String>()
		var at: String? = base
		while (!at.isNullOrEmpty()) {
			out.add(if (at == base) id else if (key.isNotEmpty() && byId[at]?.row != null) at + key else at)
			at = byId[at]?.parent
		}
		return out
	}

	/** A long press on [host]: its `contextmenu` handler, then each one of the elements it is inside, innermost first. */
	private fun contextMenu(host: String, point: TouchPoint): List<JournalEntry> {
		val scope = (instances(node(host.substringBefore('@'))).firstOrNull { it.id == host } ?: throw MarklessRuntimeError("\"$host\" is not shown")).scope
		return change(null, null) {
			val calls = ArrayList<JournalEntry>()
			for (node in chain(host)) {
				val id = handlerFor(node.substringBefore('@'), EventName.ContextMenu) ?: continue
				val handler = handlers[id] ?: throw MarklessRuntimeError("unknown handler \"$id\"")
				val fields = mapOf(
					"target" to JsValue.Str(host),
					"currentTarget" to JsValue.Str(node),
					"clientX" to JsValue.Num(point.x),
					"clientY" to JsValue.Num(point.y),
					"timeStamp" to JsValue.Num(point.time),
				)
				val out = withFields(fields) { run(handler.ops, scope) }
				if (out.firstOrNull() is JournalEntry.Navigate) return@change out
				calls.addAll(out)
			}
			calls
		}
	}

	private fun touch(host: String, event: EventName, point: TouchPoint): List<JournalEntry> {
		val scope = (instances(node(host.substringBefore('@'))).firstOrNull { it.id == host } ?: throw MarklessRuntimeError("\"$host\" is not shown")).scope
		val pointerId = point.pointerId + 0.0
		val down = touches[pointerId]
		if (if (event == EventName.PointerDown) down != null else down == null) throw MarklessRuntimeError("touch ${JsString.number(pointerId)} is ${if (down != null) "already" else "not"} down")
		return change(null, null) {
			val calls = ArrayList<JournalEntry>()
			val state = down ?: Touching(host, host, touches.values.none { it.primary }).also { touches[pointerId] = it }
			if (event != EventName.PointerMove) tapPoint = if (event == EventName.PointerUp) point.x to point.y else null
			fun fieldsOf(type: EventName, target: String, currentTarget: String, related: String?): Map<String, JsValue> {
				val lifted = type == EventName.PointerUp || type == EventName.PointerCancel || type == EventName.PointerOut || type == EventName.PointerLeave
				val cancelled = event == EventName.PointerCancel
				return mapOf(
					"target" to JsValue.Str(target),
					"currentTarget" to JsValue.Str(currentTarget),
					"relatedTarget" to (related?.let(JsValue::Str) ?: JsValue.Null),
					// Safari's values, which the Pointer Events spec gives; Chrome on Android reports 0 for over, enter, out and leave.
					"button" to JsValue.Num(if (type == EventName.PointerDown || type == EventName.PointerUp) 0.0 else -1.0),
					"buttons" to JsValue.Num(if (lifted) 0.0 else 1.0),
					"clientX" to JsValue.Num(if (cancelled) 0.0 else point.x),
					"clientY" to JsValue.Num(if (cancelled) 0.0 else point.y),
					"pointerId" to JsValue.Num(pointerId),
					"pointerType" to JsValue.Str("touch"),
					"isPrimary" to JsValue.Bool(state.primary),
					"timeStamp" to JsValue.Num(point.time),
				)
			}
			val runs = ArrayList<Triple<String, Map<String, JsValue>, Scope?>>()
			fun raise(type: EventName, target: String, related: String? = null) {
				for (node in chain(target)) handlerFor(node.substringBefore('@'), type)?.let { runs.add(Triple(it, fieldsOf(type, target, node, related), null)) }
			}
			/** `pointerenter` on each element [target] is in that [from] is not, outermost first; `pointerleave` the other way. */
			fun crossing(type: EventName, target: String, from: String?, related: String?) {
				val outside = if (from == null) emptySet() else chain(from).toSet()
				val nodes = chain(target).filter { it !in outside }
				for (node in if (type == EventName.PointerEnter) nodes.asReversed() else nodes)
					handlerFor(node.substringBefore('@'), type)?.let { runs.add(Triple(it, fieldsOf(type, node, node, related), null)) }
			}
			fun flush(): List<JournalEntry>? {
				val taken = runs.toList()
				runs.clear()
				for ((id, f, at) in taken) {
					val handler = handlers[id] ?: throw MarklessRuntimeError("unknown handler \"$id\"")
					val out = withFields(f) { run(handler.ops, at ?: scope) }
					if (out.firstOrNull() is JournalEntry.Navigate) return out
					calls.addAll(out)
				}
				return null
			}
			if (event == EventName.PointerDown) {
				raise(EventName.PointerOver, host)
				crossing(EventName.PointerEnter, host, null, null)
				// The overlay behaviour's document listener hears the press: the topmost hint and the topmost other overlay it landed outside are told.
				for (top in listOf(stack.lastOrNull { isHint(it) }, stack.lastOrNull { !isHint(it) })) {
					if (top == null || contains(top, host)) continue
					handlerFor(top, EventName.Dismiss)?.let { runs.add(Triple(it, mapOf("reason" to JsValue.Str("outside-press"), "pressTarget" to JsValue.Str(host)), null)) }
				}
				raise(EventName.PointerDown, host)
				return@change flush() ?: calls
			}
			// Before the next event the touch counts as over its capturing element (or, released, the one under it), as browsers do.
			val target = state.capture ?: host
			if (target != state.over) {
				val from = state.over
				raise(EventName.PointerOut, from, target)
				crossing(EventName.PointerLeave, from, target, target)
				raise(EventName.PointerOver, target, from)
				crossing(EventName.PointerEnter, target, from, from)
				state.over = target
			}
			if (event == EventName.PointerMove) {
				raise(EventName.PointerMove, target)
				return@change flush() ?: calls
			}
			raise(event, target)
			val early = flush()
			touches.remove(pointerId)
			if (early != null) return@change early
			raise(EventName.PointerOut, target)
			crossing(EventName.PointerLeave, target, null, null)
			flush()?.let { return@change it }
			if (event != EventName.PointerUp) return@change calls
			// A tap's compatibility mouse events, as a phone browser fires them before its click.
			fun scopeOf(id: String): Scope? = byId[id.substringBefore('@')]?.let { at -> instances(at).firstOrNull { it.id == id }?.scope }
			fun mouseRun(type: EventName, target: String, node: String, related: String?) {
				val handler = handlerFor(node.substringBefore('@'), type) ?: return
				val f = mapOf(
					"target" to JsValue.Str(target),
					"currentTarget" to JsValue.Str(node),
					"relatedTarget" to (related?.let(JsValue::Str) ?: JsValue.Null),
					"button" to JsValue.Num(0.0),
					"buttons" to JsValue.Num(if (type == EventName.MouseDown) 1.0 else 0.0),
					"clientX" to JsValue.Num(point.x),
					"clientY" to JsValue.Num(point.y),
					"timeStamp" to JsValue.Num(point.time),
				)
				runs.add(Triple(handler, f, scopeOf(target)))
			}
			fun mouse(type: EventName, target: String, related: String? = null) {
				for (node in chain(target)) mouseRun(type, target, node, related)
			}
			fun mouseCrossing(type: EventName, target: String, from: String?, related: String?) {
				val outside = if (from == null) emptySet() else chain(from).toSet()
				val nodes = chain(target).filter { it !in outside }
				for (node in if (type == EventName.MouseEnter) nodes.asReversed() else nodes) mouseRun(type, node, node, related)
			}
			// An element that left the screen took the mouse with it.
			val from = mouseOver?.takeIf { scopeOf(it) != null }
			if (from != host) {
				if (from != null) {
					mouse(EventName.MouseOut, from, host)
					mouseCrossing(EventName.MouseLeave, from, host, host)
				}
				mouse(EventName.MouseOver, host, from)
				mouseCrossing(EventName.MouseEnter, host, from, from)
				mouseOver = host
			}
			mouse(EventName.MouseMove, host)
			mouse(EventName.MouseDown, host)
			mouse(EventName.MouseUp, host)
			flush() ?: calls
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

	private fun shownInstance(id: String): Boolean = byId[id.substringBefore('@')]?.let { node -> instances(node).any { it.id == id } } ?: false

	/** A field an arm hid is a new element when it shows again: it starts from its markup, as the web builds it. */
	private fun forgetHidden() {
		fired.removeAll { !shownInstance(it.substringAfter('\u0000')) }
		edited.keys.removeAll { !shownInstance(it) }
		for (n in ticked) if (!isShown(n)) checkedness[n.id] = checkedBinding(n.id) ?: ("checked" in n.attributes)
		// A component an arm hid renders anew when it shows again, so its state starts over (a seed runs again then).
		for (c in payload.cells) {
			if (c.arm == null) continue
			if (!armShown(c.arm)) {
				values[c.id] = c.initial
				if (c.seed != null) reseed.add(c.id)
			} else if (c.seed != null && reseed.remove(c.id)) values[c.id] = evaluate(c.seed)
		}
	}

	/** A device call a handler awaited answered: its continuation runs with the answer as its local. */
	fun resume(continuation: String, value: JsValue): List<JournalEntry> {
		scriptCallId(continuation)?.let { id ->
			return change(null, null) { enter("\"kind\":\"answer\",\"call\":$id,\"value\":${jsonValue(value)}") }
		}
		val then = continuations[continuation] ?: throw MarklessRuntimeError("no continuation \"$continuation\"")
		return change(null, null) { run(then.ops, Scope(locals = mapOf(then.local to value))) }
	}

	/** That call failed: the handler ends, and the nearest `@catch` around it (if any) takes `{ name, message }`. */
	fun reject(continuation: String, name: String, message: String): List<JournalEntry> {
		scriptCallId(continuation)?.let { id ->
			val error = "{\"name\":${jsonString(name)},\"message\":${jsonString(message)}}"
			return change(null, null) { enter("\"kind\":\"answer\",\"call\":$id,\"error\":$error") }
		}
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
				setDialog(op.node, op.open)
			}
			is Op.Capture -> {
				val node = evaluate(op.node, scope)
				val touch = touching(evaluate(op.pointer, scope))
				if (node !is JsValue.Str || touch == null) continue
				if (!op.release) touch.capture = node.value
				else if (touch.capture == node.value) touch.capture = null
			}
			is Op.Command -> {
				val node = evaluate(op.node, scope)
				if (node == JsValue.Null || node == JsValue.Str(NATIVE_DOCUMENT_BODY)) continue
				if (node !is JsValue.Str || !isElement(node.value)) throw MarklessRuntimeError("${op.command}() on a value that is not an element")
				if (op.command == "focus") focused = node.value
				calls.add(JournalEntry.Command(node.value, op.command, op.preventScroll))
			}
			is Op.Script -> {
				val pressed = (fields?.get("pressTarget") as? JsValue.Str)?.value
				val detail = (fields?.get("reason") as? JsValue.Str)?.let {
					",\"detail\":{\"reason\":${jsonString(it.value)},\"pressTarget\":${pressed?.let(::jsonString) ?: "null"}}"
				} ?: ""
				val touch = TOUCH_FIELDS.mapNotNull { f -> fields?.get(f)?.let { ",${jsonString(f)}:${jsonValue(it)}" } }.joinToString("")
				val typed = listOf("key", "text").mapNotNull { f -> (fields?.get(f) as? JsValue.Str)?.let { ",${jsonString(f)}:${jsonString(it.value)}" } }.joinToString("")
				val named = if (fields?.get("currentTarget") is JsValue.Str) listOf("target", "currentTarget", "relatedTarget").associateWith { (fields?.get(it) as? JsValue.Str)?.value } else null
				val nodes = named?.let { n -> ",\"nodes\":" + n.entries.joinToString(",", "{", "}") { "${jsonString(it.key)}:${it.value?.let(::jsonString) ?: "null"}" } } ?: ""
				val event = "{\"type\":${jsonString(op.type)}${(fields?.get("value") as? JsValue.Str)?.let { ",\"value\":${jsonString(it.value)}" } ?: ""}$typed$touch$nodes$detail}"
				val catch = op.catch?.let { ",\"catch\":${jsonString(slot(it, scope))}" } ?: ""
				calls.addAll(enter("\"kind\":\"dispatch\",\"fn\":${jsonString(op.fn)},\"frame\":${frameOf(op.bindings, scope)},\"elements\":${elementFacts(op.bindings, scope, named?.values?.filterNotNull().orEmpty() + listOfNotNull(pressed))},\"event\":$event$catch", submission))
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
			is Op.Reset -> {
				op.catch?.let { values[it] = JsValue.Null }
				for (cell in op.cells) {
					val shown = read(cell, scope) as? JsValue.Obj ?: continue
					val state = shown.fields["state"]
					val error = shown.fields["error"]
					if (state == JsValue.Str("error") || (state == JsValue.Str("value") && error != null && error != JsValue.Null)) retry.add(slot(cell, scope))
				}
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
	/** Each style slot's current value, in payload order; a slot that is not a finite number (or not whole when integer) is an error, as no layout of it was proven. */
	fun slots(): List<Pair<String, Double>> {
		val cases = styleCases().toMap()
		return payload.slots.map { slot ->
			// Its expression may not hold while its style case hides the text (`point.x`), so it keeps its last value.
			val w = slot.whenCase
			if (w != null && cases[w.case] != w.value) return@map slot.id to (keptSlots[slot.id] ?: 0.0)
			val v = evaluate(slot.value)
			if (v !is JsValue.Num || !v.value.isFinite()) throw MarklessRuntimeError("style slot ${slot.id} is ${jsonValue(v)}, not a finite number")
			if (slot.integer && v.value != Math.rint(v.value)) throw MarklessRuntimeError("style slot ${slot.id} is ${JsString.number(v.value)}, not a whole number")
			keptSlots[slot.id] = v.value
			slot.id to v.value
		}
	}

	/** Whether each style case's test holds now, in payload order: which of Dragon's assignments the style is in. */
	fun styleCases(): List<Pair<String, Boolean>> = payload.styleCases.map { it.id to Js.truthy(evaluate(it.value)) }

	private val keptSlots = HashMap<String, Double>()

	fun tasks(): List<JournalEntry.Call> = payload.cells.mapNotNull { c -> c.task?.let { t -> JournalEntry.Call(t.call, t.arguments.map { evaluate(it) }, c.id) } }

	/** Runs [apply] (cell writes, returning its calls or a navigation) and journals styled cells, changed nodes, released objects, then the calls. */
	private inline fun change(host: String?, value: String?, apply: () -> List<JournalEntry>): List<JournalEntry> {
		seedRows()
		val cellsBefore = HashMap(values)
		val slotsBefore = slots().toMap()
		val casesBefore = styleCases().toMap()
		val beforeTexts = texts().toMap()
		val beforeAttributes = boundAttributes().associate { (n, a, v) -> (n to a) to v }
		val beforeMarks = marks()
		val checkedBefore = HashMap(checkedness)
		val selectedBefore = HashMap(selectedness)
		val bindingsBefore = ticked.associate { it.id to checkedBinding(it.id) }
		val beforeProperties = properties().associate { (n, a, v) -> (n to a) to v }
		if (value != null && host != null) edited[host] = value
		typing = if (value != null) host else null
		val beforeArms = arms().toMap()
		val beforeRows = rows().toMap()
		val beforeTitle = title()
		val dialogsBefore = HashMap(dialogs)
		val beforeSheets = sheets().toMap()
		val ownedBefore = liveObjects()
		val focusBefore = focused
		val stackBefore = stack
		val signaturesBefore = rowSignatures()
		drawnArms = beforeArms
		val calls = try { apply().toMutableList() } finally { drawnArms = null }
		if (calls.firstOrNull() is JournalEntry.Navigate) return calls
		// As the browser queues a dialog's close event, it runs after the handler that closed it.
		var fired = 0
		while (closing.isNotEmpty() && fired < CLOSE_DEPTH) {
			fired++
			val node = closing.removeFirst()
			val handler = handlerFor(node, EventName.Close)?.let { handlers[it] } ?: continue
			val scope = byId[node]?.let { at -> instances(at).firstOrNull { it.id == node }?.scope } ?: Scope.EMPTY
			val taken = run(handler.ops, scope)
			if (taken.firstOrNull() is JournalEntry.Navigate) return taken
			calls.addAll(taken)
		}
		closing.clear()
		// A row that left takes its state with it; a later row with the same key starts from the first values.
		val kept = rows().flatMap { (list, keys) -> keys.map { "$list\u0000$it" } }.toSet()
		values.keys.removeAll { slot ->
			val list = rowOfCell[slot.substringBefore('@')]
			list != null && '@' in slot && "$list\u0000${slot.substringAfter('@')}" !in kept
		}
		resetChangedRows(signaturesBefore)
		seedRows()
		follow()
		val synced = (calls + syncAsync()).toMutableList()
		// An overlay becoming shown supersedes every shown hint it is not inside, before it joins the stack.
		val shownFirst = shownOverlays()
		val working = stackBefore.filter { it in shownFirst }.toMutableList()
		for (newcomer in shownFirst.filter { it !in stackBefore }) {
			for (hint in working.filter { isHint(it) && !contains(it, newcomer) }) {
				val handler = handlerFor(hint, EventName.Dismiss)?.let { handlers[it] } ?: continue
				val taken = withFields(mapOf("reason" to JsValue.Str("superseded"), "pressTarget" to JsValue.Null)) { run(handler.ops, Scope.EMPTY) }
				if (taken.firstOrNull() is JournalEntry.Navigate) return taken
				synced.addAll(taken)
			}
			working.add(newcomer)
		}
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
		for ((id, v) in styleCases()) if (casesBefore[id] != v) journal.add(JournalEntry.State(id, JsValue.Bool(v)))
		for ((id, v) in slots()) if (slotsBefore[id]?.toRawBits() != v.toRawBits()) journal.add(JournalEntry.Slot(id, v))
		for (node in payload.nodes) when (node) {
			// Each shown copy of the list: an inner list has one per row of its outer list (`<id>@<key>`).
			is Node.Repeat -> for ((id, a) in afterRows) {
				if (id != node.id && !id.startsWith("${node.id}@")) continue
				val b = beforeRows[id]
				if (b != null && b != a) journal.add(JournalEntry.Rows(id, a))
			}
			is Node.Sheet -> {
				val before = beforeSheets[node.id]
				val after = afterSheets[node.id]
				if (before != null && after != null && before != after) journal.add(JournalEntry.Sheet(node.id, after))
			}
			is Node.Branch -> for (inst in instances(node)) if (inst.id in beforeArms && inst.id in afterArms && beforeArms[inst.id] != afterArms[inst.id]) journal.add(JournalEntry.Arm(inst.id, afterArms[inst.id]))
			is Node.Text -> for (inst in instances(node)) {
				val b = beforeTexts[inst.id]; val a = afterTexts[inst.id]
				if (b != null && a != null && a != b) journal.add(JournalEntry.Text(inst.id, a))
			}
			is Node.Element -> for (inst in instances(node)) {
				dialogs[node.id]?.let { open -> if (open != dialogsBefore[node.id]) journal.add(JournalEntry.Dialog(node.id, open)) }
				for (binding in node.bindings) {
				val key = inst.id to binding.name
				if (binding.property) {
					// A `value` binding writes the field only when its own value changes, as on the web: typing alone never resets it.
					val typedNow = value != null && inst.id == host && afterProperties[key] == value
					if (key in beforeProperties && key in afterProperties && beforeProperties[key] != afterProperties[key] && !typedNow) journal.add(JournalEntry.Property(inst.id, binding.name, afterProperties.getValue(key)))
				} else if (key in beforeAttributes && key in afterAttributes && beforeAttributes[key] != afterAttributes[key]) {
					journal.add(JournalEntry.Attribute(inst.id, binding.name, afterAttributes[key]))
					// A textarea nobody edited and no `value` property sets shows its `value` attribute, as the web's default value.
					if (binding.name == "value" && node.element == "textarea" && inst.id !in edited && node.bindings.none { it.property && it.name == "value" })
						journal.add(JournalEntry.Property(inst.id, "value", afterAttributes[key] ?: ""))
				}
				}
			}
		}
		// A `checked` binding whose value changed sets the checkedness, as the web's property write does.
		for (n in ticked) checkedBinding(n.id)?.let { if (it != bindingsBefore[n.id]) checkedness[n.id] = it }
		for (n in ticked) if (isShown(n) && checkedBefore[n.id] != checkedness[n.id]) journal.add(JournalEntry.Check(n.id, checkedness.getValue(n.id)))
		settleSelects(chosenNow)
		chosenNow = null
		// An option a new row builds starts unselected on the host, so only a selected one is sent.
		for ((id, selected) in selections()) if ((selectedBefore[id] ?: false) != selected) journal.add(JournalEntry.Selected(id, selected))
		for ((key, v) in marks()) if (beforeMarks[key] != v) journal.add(JournalEntry.Attribute(key.first, key.second, v))
		// A field whose binding wrote it shows that value now, not what was typed before.
		for (entry in journal) if (entry is JournalEntry.Property) edited.remove(entry.node)
		val afterTitle = title()
		if (afterTitle != null && afterTitle != beforeTitle) journal.add(JournalEntry.Title(afterTitle))
		val owned = liveObjects()
		for (o in payload.objects) if (o.id in ownedBefore && o.id !in owned) journal.add(JournalEntry.Release(o.id))
		for (o in released) journal.add(JournalEntry.Overlay(o, open = false, modal = isModal(o)))
		for (o in enlisted) journal.add(JournalEntry.Overlay(o, open = true, modal = isModal(o)))
		journal.addAll(synced)
		for (c in payload.cells) if (c.app && c.id !in unset) session.values[c.id] = values.getValue(c.id)
		return journal
	}

	/** A `submit` op as the web runs it: nothing for a disabled submitter, an `invalid` entry for the first field missing its value, nothing for the same entries from the same button as a submission still running, else the form's handler. */
	private fun submit(op: Op.Submit, scope: Scope, calls: MutableList<JournalEntry>): List<JournalEntry> {
		val form = forms[op.form] ?: throw MarklessRuntimeError("\"${op.form}\" is not a form")
		if (op.submitter != null && attributeNow(op.submitter, "disabled") != null) return emptyList()
		firstInvalid(form, op.submitter)?.let { (node, message) ->
			calls.add(JournalEntry.Invalid(node, message))
			return emptyList()
		}
		form.opens?.let { opens ->
			val entries = (entriesOf(op.form) as JsValue.Arr).items.map { (it as JsValue.Arr).items.let { pair -> Js.toStr(pair[0]) to Js.toStr(pair[1]) } }
			calls.add(JournalEntry.Call("browser.open", listOf(JsValue.Str(nativeFormUrl(opens, entries))), null))
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
