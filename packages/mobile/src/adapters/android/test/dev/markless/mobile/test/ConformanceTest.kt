package dev.markless.mobile.test

import dev.markless.mobile.core.AppPayload
import dev.markless.mobile.core.AppRuntime
import dev.markless.mobile.core.AttributeValue
import dev.markless.mobile.core.EventName
import dev.markless.mobile.core.Js
import dev.markless.mobile.core.MemoryStore
import dev.markless.mobile.core.JsValue
import dev.markless.mobile.core.Json
import dev.markless.mobile.core.JsString
import dev.markless.mobile.core.MarklessDecodeError
import dev.markless.mobile.core.Node
import dev.markless.mobile.core.Payload
import dev.markless.mobile.core.Runtime
import dev.markless.mobile.core.arr
import dev.markless.mobile.core.field
import dev.markless.mobile.core.num
import dev.markless.mobile.core.ScrollAlign
import dev.markless.mobile.core.ScrollAlignment
import dev.markless.mobile.core.ScrollBox
import dev.markless.mobile.core.ScrollRange
import dev.markless.mobile.core.ScrollRect
import dev.markless.mobile.core.scrollIntoView
import dev.markless.mobile.core.jsonString
import dev.markless.mobile.core.jsonValue
import dev.markless.mobile.core.num
import dev.markless.mobile.core.obj
import dev.markless.mobile.core.str
import dev.markless.mobile.style.BAND_KEY
import dev.markless.mobile.style.Rgba
import dev.markless.mobile.style.StyleExport
import dev.markless.mobile.style.StyleWrite
import java.io.File
import kotlin.system.exitProcess

const val CONFORMANCE_VERSION = "markless.native-conformance/0"
const val APP_CONFORMANCE_VERSION = "markless.native-app-conformance/0"

private var failures = 0
private var passes = 0

private fun check(name: String, ok: Boolean, detail: () -> String) {
	if (ok) { passes++; println("pass $name") } else { failures++; println("FAIL $name: ${detail()}") }
}

fun canonical(j: Json): String = when (j) {
	is Json.Obj -> j.fields.entries.joinToString(",", "{", "}") { "${jsonString(it.key)}:${canonical(it.value)}" }
	is Json.Arr -> j.items.joinToString(",", "[", "]") { canonical(it) }
	is Json.Str -> jsonString(j.value)
	is Json.Num -> JsString.number(j.value)
	is Json.Bool -> j.value.toString()
	Json.Null -> "null"
}

private fun field(o: Map<String, Json>, name: String, where: String): Json = o[name] ?: throw IllegalStateException("$where has no \"$name\"")

/** One `markless.native-conformance/0` vector: the mounted texts must read `initial`, then each action's journal must match, byte for byte. */
private fun runVector(file: File) {
	val vector = Json.parse(file.readBytes()).obj(file.name)
	val version = field(vector, "version", file.name).str("version")
	if (version == APP_CONFORMANCE_VERSION) return runAppVector(file, vector)
	check("${file.name} version", version == CONFORMANCE_VERSION) { "vector version is $version, this test reads $CONFORMANCE_VERSION" }
	val payload = Payload.decode(field(vector, "payload", file.name))
	val params = vector["params"]?.obj("params")?.mapValues { (k, v) -> v.str("params.$k") } ?: emptyMap()
	val languages = vector["preferredLanguages"]?.arr("preferredLanguages")?.map { it.str("preferredLanguages[]") } ?: listOf("en")
	val now = (vector["now"] as? Json.Num)?.value
	val runtime = if (now == null) Runtime(payload, params = params, preferredLanguages = languages) else Runtime(payload, params = params, preferredLanguages = languages, now = { now })
	val mounted = runtime.texts().joinToString(",", "[", "]") { (n, t) -> "[${jsonString(n)},${jsonString(t)}]" }
	val initial = canonical(field(vector, "initial", file.name))
	check("${file.name} initial", mounted == initial) { "expected $initial\n  actual   $mounted" }
	val attributes = runtime.attributes().joinToString(",", "[", "]") { (n, a, v) -> "[${jsonString(n)},${jsonString(a)},${v?.let(::jsonString) ?: "null"}]" }
	val initialAttributes = vector["initialAttributes"]?.let(::canonical) ?: "[]"
	check("${file.name} initialAttributes", attributes == initialAttributes) { "expected $initialAttributes\n  actual   $attributes" }
	val properties = runtime.properties().joinToString(",", "[", "]") { (n, a, v) -> "[${jsonString(n)},${jsonString(a)},${jsonString(v)}]" }
	val initialProperties = vector["initialProperties"]?.let(::canonical) ?: "[]"
	check("${file.name} initialProperties", properties == initialProperties) { "expected $initialProperties\n  actual   $properties" }
	val rows = runtime.rows().joinToString(",", "[", "]") { (n, keys) -> "[${jsonString(n)},${keys.joinToString(",", "[", "]", transform = ::jsonString)}]" }
	val initialRows = vector["initialRows"]?.let(::canonical) ?: "[]"
	check("${file.name} initialRows", rows == initialRows) { "expected $initialRows\n  actual   $rows" }
	val checks = runtime.checks().joinToString(",", "[", "]") { (n, c) -> "[${jsonString(n)},$c]" }
	val initialChecks = vector["initialChecks"]?.let(::canonical) ?: "[]"
	check("${file.name} initialChecks", checks == initialChecks) { "expected $initialChecks\n  actual   $checks" }
	val arms = runtime.arms().joinToString(",", "[", "]") { (n, i) -> "[${jsonString(n)},${i ?: "null"}]" }
	val initialArms = vector["initialArms"]?.let(::canonical) ?: "[]"
	check("${file.name} initialArms", arms == initialArms) { "expected $initialArms\n  actual   $arms" }
	val sheets = runtime.sheets().joinToString(",", "[", "]") { (n, open) -> "[${jsonString(n)},$open]" }
	val initialSheets = vector["initialSheets"]?.let(::canonical) ?: "[]"
	check("${file.name} initialSheets", sheets == initialSheets) { "expected $initialSheets\n  actual   $sheets" }
	val tasks = runtime.tasks().joinToString(",", "[", "]") { it.toJson() }
	val initialTasks = vector["tasks"]?.let(::canonical) ?: "[]"
	check("${file.name} tasks", tasks == initialTasks) { "expected $initialTasks\n  actual   $tasks" }
	for ((n, step) in field(vector, "steps", file.name).arr("steps").withIndex()) {
		val s = step.obj("steps[$n]")
		val action = field(s, "action", "steps[$n]").obj("action")
		val event = field(action, "event", "action").str("event")
		if (event == "resume") {
			val journal = runtime.resume(field(action, "continuation", "action").str("action.continuation"), JsValue.fromJson(field(action, "value", "action")))
			val expected = canonical(field(s, "journal", "steps[$n]"))
			val actual = journal.joinToString(",", "[", "]") { it.toJson() }
			check("${file.name} step $n", actual == expected) { "expected $expected\n  actual   $actual" }
			continue
		}
		if (event == "reject") {
			val error = field(action, "error", "action").obj("action.error")
			val journal = runtime.reject(field(action, "continuation", "action").str("action.continuation"), field(error, "name", "error").str("name"), field(error, "message", "error").str("message"))
			val expected = canonical(field(s, "journal", "steps[$n]"))
			val actual = journal.joinToString(",", "[", "]") { it.toJson() }
			check("${file.name} step $n", actual == expected) { "expected $expected\n  actual   $actual" }
			continue
		}
		if (event == "device" || event == "settle") {
			val cell = field(action, "cell", "action").str("action.cell")
			val error = action["error"]?.obj("action.error")
			val journal = when {
				event == "device" -> runtime.device(cell, JsValue.fromJson(field(action, "value", "action")))
				error != null -> runtime.settleError(cell, field(error, "name", "error").str("name"), field(error, "message", "error").str("message"))
				else -> runtime.settle(cell, JsValue.fromJson(field(action, "value", "action")))
			}
			val expected = canonical(field(s, "journal", "steps[$n]"))
			val actual = journal.joinToString(",", "[", "]") { it.toJson() }
			check("${file.name} step $n", actual == expected) { "expected $expected\n  actual   $actual" }
			continue
		}
		if (event == "timer") {
			val journal = runtime.timer(field(action, "timer", "action").str("timer"))
			val expected = canonical(field(s, "journal", "steps[$n]"))
			val actual = journal.joinToString(",", "[", "]") { it.toJson() }
			check("${file.name} step $n", actual == expected) { "expected $expected\n  actual   $actual" }
			continue
		}
		val name = EventName.entries.firstOrNull { it.wire == event } ?: throw IllegalStateException("steps[$n] has unknown event $event")
		val carried = when (name) { EventName.Keydown -> "key"; EventName.Paste -> "text"; else -> "value" }
		val value = action[carried]?.str("action.$carried")
		val actual = runtime.dispatch(field(action, "host", "action").str("host"), name, value).joinToString(",", "[", "]") { it.toJson() }
		val expected = canonical(field(s, "journal", "steps[$n]"))
		check("${file.name} step $n", actual == expected) { "expected $expected\n  actual   $actual" }
	}
}

/** One `markless.native-app-conformance/0` vector: after opening and after each action, the stack's paths, the top screen's title and texts, and the journal. */
private fun runAppVector(file: File, vector: Map<String, Json>) {
	val app = AppPayload.decodeOrNull(field(vector, "app", file.name)) ?: throw IllegalStateException("${file.name}: app is a single page payload")
	val runtime = AppRuntime(app, field(vector, "open", file.name).str("open"))
	fun look(where: String, expected: Map<String, Json>) {
		val stack = runtime.screens.joinToString(",", "[", "]") { jsonString(it.path) }
		check("${file.name} $where stack", stack == canonical(field(expected, "stack", where))) { "expected ${canonical(field(expected, "stack", where))}\n  actual   $stack" }
		val top = runtime.screens.last().runtime
		val title = top.title()?.let(::jsonString) ?: "null"
		check("${file.name} $where title", title == canonical(field(expected, "title", where))) { "expected ${canonical(field(expected, "title", where))}\n  actual   $title" }
		val texts = top.texts().joinToString(",", "[", "]") { (n, t) -> "[${jsonString(n)},${jsonString(t)}]" }
		check("${file.name} $where texts", texts == canonical(field(expected, "texts", where))) { "expected ${canonical(field(expected, "texts", where))}\n  actual   $texts" }
	}
	look("initial", field(vector, "initial", file.name).obj("initial"))
	for ((n, step) in field(vector, "steps", file.name).arr("steps").withIndex()) {
		val s = step.obj("steps[$n]")
		val action = field(s, "action", "steps[$n]").obj("action")
		val event = field(action, "event", "action").str("event")
		val journal = if (event == "back") runtime.back() else {
			val name = EventName.entries.firstOrNull { it.wire == event } ?: throw IllegalStateException("steps[$n] has unknown event $event")
			runtime.dispatch(field(action, "host", "action").str("host"), name, action["value"]?.str("action.value"))
		}
		val actual = journal.joinToString(",", "[", "]") { it.toJson() }
		val expected = canonical(field(s, "journal", "steps[$n]"))
		check("${file.name} step $n journal", actual == expected) { "expected $expected\n  actual   $actual" }
		look("step $n", s)
	}
}

private fun numberFormatting() {
	val cases = listOf(
		1.0 to "1", 0.0 to "0", -0.0 to "0", -7.0 to "-7", 100.0 to "100", 1e21 to "1e+21", 1e20 to "100000000000000000000",
		Math.pow(2.0, 60.0) to "1152921504606847000", 9007199254740993.0 to "9007199254740992", 0.1 to "0.1", 1.5 to "1.5",
		1e-7 to "1e-7", 0.000001 to "0.000001", 123e-20 to "1.23e-18", 5e-324 to "5e-324", Double.MAX_VALUE to "1.7976931348623157e+308",
		Double.NaN to "NaN", Double.POSITIVE_INFINITY to "Infinity",
	)
	for ((v, want) in cases) check("String($v)", JsString.number(v) == want) { "got ${JsString.number(v)}, want $want" }
}

private fun refuses(name: String, json: String, fragment: String) {
	val err = try { Payload.decode(json.toByteArray()); null } catch (e: MarklessDecodeError) { e.message }
	check("refuses $name", err != null && err.contains(fragment)) { "error was: $err" }
}

private fun decoderStrictness() {
	val ok = """{"version":"markless.native-view/0","component":"C","cells":[{"id":"c","name":"c","initial":0}],"nodes":[{"kind":"element","id":"h0","element":"div","parent":null},{"kind":"text","id":"h0:text0","parent":"h0","parts":[{"cell":"c"}]}],"events":[{"host":"h0","event":"activate","handler":"x"}],"handlers":[{"id":"x","ops":[{"op":"assign","cell":"c","value":{"literal":1}}]}]}"""
	check("decodes a minimal payload", runCatching { Payload.decode(ok.toByteArray()) }.isSuccess) { runCatching { Payload.decode(ok.toByteArray()) }.exceptionOrNull().toString() }
	refuses("an unknown version", ok.replace("native-view/0", "native-view/9"), "unknown payload version")
	refuses("an unknown node kind", ok.replace("\"kind\":\"text\"", "\"kind\":\"image\""), "unknown node kind \"image\"")
	refuses("an unknown op", ok.replace("\"op\":\"assign\"", "\"op\":\"multiply\""), "unknown op \"multiply\"")
	refuses("an unknown event", ok.replace("\"activate\"", "\"hover\""), "unknown event \"hover\"")
	refuses("an unknown field", ok.replace("\"component\":\"C\"", "\"component\":\"C\",\"extra\":1"), "unknown field \"extra\"")
	refuses("a parent that does not precede", ok.replace("\"parent\":\"h0\"", "\"parent\":\"h9\""), "does not precede")
	refuses("an unknown cell read", ok.replace("\"parts\":[{\"cell\":\"c\"}]", "\"parts\":[{\"cell\":\"d\"}]"), "unknown cell \"d\"")
	refuses("trailing bytes", "$ok x", "trailing data")
	val sheet = ok.replace("]}],\"events\"", "]},{\"kind\":\"sheet\",\"id\":\"s\",\"parent\":\"h0\",\"open\":{\"cell\":\"c\"},\"snapPoints\":[1],\"dismissible\":true,\"modal\":true},{\"kind\":\"element\",\"id\":\"h1\",\"element\":\"p\",\"parent\":\"s\"}],\"events\"")
		.replace("\"handler\":\"x\"}]", "\"handler\":\"x\"},{\"host\":\"s\",\"event\":\"dismiss\",\"handler\":\"x\"}]")
	check("decodes a sheet and its content", runCatching { Payload.decode(sheet.toByteArray()) }.getOrNull()?.nodes?.any { it is Node.Sheet && it.snapPoints == listOf(1.0) } == true) { runCatching { Payload.decode(sheet.toByteArray()) }.exceptionOrNull().toString() }
	refuses("a sheet resting at one height below full", sheet.replace("\"snapPoints\":[1]", "\"snapPoints\":[0.5]"), "snapPoints")
	refuses("a sheet whose largest height is not full", sheet.replace("\"snapPoints\":[1]", "\"snapPoints\":[0.3,0.8]"), "snapPoints")
	refuses("a sheet in an arm", sheet.replace("\"modal\":true", "\"modal\":true,\"arm\":{\"branch\":\"b\",\"index\":0}"), "unknown field \"arm\"")
	refuses("a sheet inside a sheet", sheet.replace("\"parent\":\"s\"}", "\"parent\":\"s\"},{\"kind\":\"sheet\",\"id\":\"s2\",\"parent\":\"s\",\"open\":{\"literal\":false},\"snapPoints\":[1],\"dismissible\":false,\"modal\":true}"), "has a Sheet node as its parent")
	refuses("a dismiss event on an element", sheet.replace("\"host\":\"s\",\"event\":\"dismiss\"", "\"host\":\"h0\",\"event\":\"dismiss\""), "names no sheet")
	refuses("an activate event on a sheet", sheet.replace("\"host\":\"s\",\"event\":\"dismiss\"", "\"host\":\"s\",\"event\":\"activate\""), "names no element")
}

private fun styleExport(fixtures: File) {
	val bytes = File(fixtures, "counter.native-style.json").readBytes()
	val export = runCatching { StyleExport.decode(bytes) }
	check("decodes Dragon's counter export", export.isSuccess) { export.exceptionOrNull().toString() }
	export.getOrNull()?.let { e -> check("counter export button frame", e.assignments[0].byId["h2"]?.frame?.width == 311.953125) { "${e.assignments[0].byId["h2"]}" } }
	val toggle = runCatching { StyleExport.decode(File(fixtures, "ms-toggle.native-style.json").readBytes()) }
	check("decodes Dragon's /1 toggle export", toggle.isSuccess) { toggle.exceptionOrNull().toString() }
	toggle.getOrNull()?.let { t ->
		val s = t.stateFor("selected")
		val on = t.next(t.initial, s, JsValue.Bool(true))
		check("/1 next moves to the selected assignment", t.assignments[on].values.values.single() == JsValue.Bool(true)) { "${t.assignments[on].values}" }
		check("/1 next moves back", t.next(on, s, JsValue.Bool(false)) == t.initial) { "" }
		val err = runCatching { t.stateFor("other") }.exceptionOrNull()?.message
		check("/1 refuses a cell with no state", err?.contains("0 states") == true) { "$err" }
	}
	val text = String(bytes, Charsets.UTF_8)
	fun refusesStyle(name: String, changed: String, fragment: String) {
		val err = try { StyleExport.decode(changed.toByteArray()); null } catch (e: MarklessDecodeError) { e.message }
		check("style export refuses $name", err != null && err.contains(fragment)) { "error was: $err" }
	}
	refusesStyle("an unknown write kind", text.replace("\"kind\": \"text-color\"", "\"kind\": \"box-shadow\""), "unknown style write kind \"box-shadow\"")
	refusesStyle("an unknown schema", text.replace("native-style-export/0", "native-style-export/9"), "unknown style export schema")
}

private fun ops() {
	val payload = """{"version":"markless.native-view/0","component":"C","cells":[{"id":"n","name":"n","initial":0,"storage":{"key":"visits"}},{"id":"s","name":"s","initial":"a"}],"nodes":[{"kind":"element","id":"h0","element":"div","parent":null,"attributes":{"class":"x mk-1"}},{"kind":"text","id":"h0:text0","parent":"h0","parts":[{"cell":"n"},{"text":"/"},{"expr":{"template":["<",{"cell":"s"},">"]}}]},{"kind":"element","id":"h1","element":"button","parent":"h0"},{"kind":"element","id":"h2","element":"button","parent":"h0"}],"events":[{"host":"h1","event":"activate","handler":"t"},{"host":"h2","event":"activate","handler":"same"}],"handlers":[{"id":"t","ops":[{"op":"assign","cell":"n","value":{"binary":"+","left":{"unary":"+","value":{"cell":"n"}},"right":{"literal":1}}},{"op":"assign","cell":"s","value":{"binary":"+","left":{"cell":"s"},"right":{"cell":"n"}}}]},{"id":"same","ops":[{"op":"assign","cell":"s","value":{"cell":"s"}}]}]}"""
	val decoded = Payload.decode(payload.toByteArray())
	check("element attributes decode", (decoded.nodes[0] as Node.Element).attributes == mapOf("class" to "x mk-1")) { "${decoded.nodes[0]}" }
	val store = MemoryStore()
	val r = Runtime(decoded, store)
	check("initial template", r.text("h0:text0") == "0/<a>") { r.text("h0:text0") }
	val step = r.dispatch("h1", EventName.Activate).joinToString(",") { it.toJson() }
	check("each assign reads the values before it", step == """{"op":"text","node":"h0:text0","value":"1/<a1>"}""") { step }
	check("an assign that changes nothing journals nothing", r.dispatch("h2", EventName.Activate).isEmpty()) { "" }
	check("a storage cell writes its store", store.get("visits") == JsValue.Num(1.0)) { "${store.get("visits")}" }
	val again = Runtime(decoded, store)
	check("a storage cell reads its store at mount", again.text("h0:text0") == "1/<a>") { again.text("h0:text0") }
	val nulls = Runtime(Payload.decode("""{"version":"markless.native-view/0","component":"C","cells":[{"id":"n","name":"n","initial":null}],"nodes":[{"kind":"element","id":"h0","element":"p","parent":null},{"kind":"text","id":"h0:text0","parent":"h0","parts":[{"text":"a"},{"cell":"n"},{"expr":{"template":["<",{"cell":"n"},">"]}}]}],"events":[],"handlers":[]}""".toByteArray()))
	check("a null text part renders empty, a null inside a template reads null", nulls.text("h0:text0") == "a<null>") { nulls.text("h0:text0") }
	refuses("an unknown builtin", payload.replace("\"template\":[", "\"call\":\"eval\",\"arguments\":[{\"literal\":1}],\"x\":[").replace(",\"x\":[\"<\",{\"cell\":\"s\"},\">\"]", ""), "unknown call \"eval\"")
	refuses("an unknown binary operator", payload.replace("\"binary\":\"+\",\"left\":{\"unary\"", "\"binary\":\"**\",\"left\":{\"unary\""), "unknown binary \"**\"")
}

private fun jsOps() {
	fun n(x: Double) = JsValue.Num(x)
	fun str(x: String) = JsValue.Str(x)
	val cases = listOf(
		Js.binary("+", str("5"), n(1.0)) to str("51"), Js.binary("+", n(1.0), JsValue.Bool(true)) to n(2.0), Js.binary("+", JsValue.Null, str("x")) to str("nullx"),
		Js.binary("-", str("5"), n(2.0)) to n(3.0), Js.binary("<", str("10"), str("9")) to JsValue.Bool(true), Js.binary("<", str("10"), n(9.0)) to JsValue.Bool(false),
		Js.binary("<=", n(Double.NaN), n(1.0)) to JsValue.Bool(false), Js.binary(">=", JsValue.Null, n(0.0)) to JsValue.Bool(true), Js.binary("%", n(-5.0), n(3.0)) to n(-2.0),
		Js.call("Number", listOf(str(" 12 "))) to n(12.0), Js.call("Number", listOf(str("5x"))) to n(Double.NaN), Js.call("Number", listOf(str(""))) to n(0.0),
		Js.call("Number", listOf(str("0x1F"))) to n(31.0), Js.call("Number", listOf(str("-0x1F"))) to n(Double.NaN), Js.call("Number", listOf(str("1e3"))) to n(1000.0),
		Js.call("Number", listOf(str("1f"))) to n(Double.NaN), Js.call("Number", listOf(str(".5"))) to n(0.5), Js.call("Number", listOf(str("5."))) to n(5.0), Js.call("Number", listOf(str("-Infinity"))) to n(Double.NEGATIVE_INFINITY),
		Js.call("Math.round", listOf(n(-2.5))) to n(-2.0), Js.call("Math.round", listOf(n(2.5))) to n(3.0), Js.call("Math.round", listOf(n(0.49999999999999994))) to n(0.0),
		Js.call("Math.round", listOf(n(4503599627370497.0))) to n(4503599627370497.0), Js.call("Math.max", listOf()) to n(Double.NEGATIVE_INFINITY), Js.call("Math.max", listOf(n(1.0), n(Double.NaN))) to n(Double.NaN),
		Js.call("String", listOf()) to str(""), Js.call("Boolean", listOf(str("0"))) to JsValue.Bool(true), Js.call("Math.abs", listOf(str("-3"))) to n(3.0),
	)
	for ((n2, pair) in cases.withIndex()) {
		val (got, want) = pair
		val same = if (got is JsValue.Num && want is JsValue.Num) got.value.equals(want.value) else got == want
		check("js op $n2", same) { "got $got, want $want" }
	}
	val negZero = Js.call("Math.min", listOf(n(0.0), n(-0.0))) as JsValue.Num
	check("Math.min(0, -0) is -0", 1 / negZero.value < 0) { "${negZero.value}" }
	val posZero = Js.call("Math.max", listOf(n(-0.0), n(0.0))) as JsValue.Num
	check("Math.max(-0, 0) is 0", 1 / posZero.value > 0) { "${posZero.value}" }
	check("round keeps -0 for -0.4", 1 / Js.round(-0.4) < 0) { "${Js.round(-0.4)}" }
}

private fun attributeRule() {
	val t = JsValue.Bool(true); val f = JsValue.Bool(false)
	val cases = listOf(
		Triple("disabled", t, ""), Triple("disabled", f, null), Triple("aria-pressed", f, "false"), Triple("aria-pressed", t, "true"),
		Triple("aria-hidden", f, null), Triple("aria-hidden", t, "true"), Triple("data-on", t, "true"), Triple("data-on", f, null),
		Triple("draggable", f, "false"), Triple("spellcheck", t, "true"), Triple("title", JsValue.Num(2.0), "2"), Triple("title", JsValue.Str(""), ""),
	)
	for ((name, value, want) in cases) check("attribute $name=$value", AttributeValue.of(name, value) == want) { "got ${AttributeValue.of(name, value)}, want $want" }
	check("=== is false across types", !Js.strictEquals(JsValue.Num(1.0), JsValue.Str("1"))) { "" }
	check("=== holds 0 and -0 equal", Js.strictEquals(JsValue.Num(0.0), JsValue.Num(-0.0))) { "" }
	check("=== holds NaN unequal", !Js.strictEquals(JsValue.Num(Double.NaN), JsValue.Num(Double.NaN))) { "" }
}

private fun routes() {
	val r = dev.markless.mobile.core.Route("/[fruit]", listOf("fruit"))
	check("route matches one segment", r.match("/apple") == mapOf("fruit" to "apple")) { "${r.match("/apple")}" }
	check("route decodes a segment", r.match("/p%C3%A9ar") == mapOf("fruit" to "péar")) { "${r.match("/p%C3%A9ar")}" }
	check("route keeps a plus", r.match("/a+b") == mapOf("fruit" to "a+b")) { "${r.match("/a+b")}" }
	check("route refuses another depth", r.match("/a/b") == null && r.match("/") == null) { "" }
	check("a static route matches itself", dev.markless.mobile.core.Route("/about", emptyList()).match("/about/") == emptyMap<String, String>()) { "" }
}

private fun arrays() {
	fun n(x: Double) = JsValue.Num(x)
	fun str(x: String) = JsValue.Str(x)
	fun arr(vararg v: JsValue) = JsValue.Arr(v.toMutableList())
	fun v(x: JsValue) = Js.Arg.Value(x)
	fun show(x: JsValue) = jsonValue(x)
	val a = arr(n(1.0), arr(n(2.0), JsValue.Null), str("x"))
	val cases = listOf(
		"String([1,[2,null],'x'])" to (JsString.of(a) to "1,2,,x"),
		"[1]+1" to (show(Js.binary("+", arr(n(1.0)), n(1.0))) to "\"11\""),
		"[]+[]" to (show(Js.binary("+", arr(), arr())) to "\"\""),
		"Number([5])" to (show(Js.call("Number", listOf(arr(n(5.0))))) to "5"),
		"Number({})" to (show(Js.call("Number", listOf(JsValue.Obj(LinkedHashMap())))) to "null"),
		"[2] < [10]" to (show(Js.binary("<", arr(n(2.0)), arr(n(10.0)))) to "false"),
		"[NaN].includes(NaN)" to (show(Js.method("includes", arr(n(Double.NaN)), listOf(v(n(Double.NaN))))) to "true"),
		"[NaN].indexOf(NaN)" to (show(Js.method("indexOf", arr(n(Double.NaN)), listOf(v(n(Double.NaN))))) to "-1"),
		"[1,2,3].slice(-2)" to (show(Js.method("slice", arr(n(1.0), n(2.0), n(3.0)), listOf(v(n(-2.0))))) to "[2,3]"),
		"[1,2,3].slice(2,1)" to (show(Js.method("slice", arr(n(1.0), n(2.0), n(3.0)), listOf(v(n(2.0)), v(n(1.0))))) to "[]"),
		"[1,null].join('-')" to (show(Js.method("join", arr(n(1.0), JsValue.Null), listOf(v(str("-"))))) to "\"1-\""),
		"[1].concat(2,[3,[4]])" to (show(Js.method("concat", arr(n(1.0)), listOf(v(n(2.0)), v(arr(n(3.0), arr(n(4.0))))))) to "[1,2,3,[4]]"),
		"map with index" to (show(Js.method("map", arr(str("a"), str("b")), listOf(Js.Arg.Callback { (item, i) -> Js.binary("+", item, i) }))) to "[\"a0\",\"b1\"]"),
		"'abc'.slice(-2)" to (show(Js.method("slice", str("abc"), listOf(v(n(-2.0))))) to "\"bc\""),
		"'abc'.includes('')" to (show(Js.method("includes", str("abc"), listOf(v(str(""))))) to "true"),
		"'  a '.trim()" to (show(Js.method("trim", str("\u00a0 a \n"), listOf())) to "\"a\""),
		"'ß'.toUpperCase()" to (show(Js.method("toUpperCase", str("ß"), listOf())) to "\"SS\""),
		"'a'.concat(1,null)" to (show(Js.method("concat", str("a"), listOf(v(n(1.0)), v(JsValue.Null)))) to "\"a1null\""),
	)
	for ((name, pair) in cases) check(name, pair.first == pair.second) { "got ${pair.first}, want ${pair.second}" }
	val fresh = arr(n(1.0), n(2.0))
	check("reverse is in place and returns its array", Js.method("reverse", fresh, listOf()) === fresh && show(fresh) == "[2,1]") { show(fresh) }
	check("arrays compare by identity", !Js.strictEquals(arr(), arr()) && Js.strictEquals(fresh, fresh)) { "" }
	val err = runCatching { Js.method("toUpperCase", arr(), listOf()) }.exceptionOrNull()?.message
	check("a method the target lacks is an error", err == ".toUpperCase() of a array") { "$err" }
}

/** The S5 rung's app style: body's background, light and dark, is each assignment's canvas. */
private fun appCanvas(fixtures: File) {
	val bytes = File(fixtures, "s5-page-canvas.native-app-style.json").readBytes()
	val decoded = runCatching { StyleExport.decodeApp(bytes) }
	check("decodes the S5 app style", decoded.isSuccess) { decoded.exceptionOrNull().toString() }
	val routes = decoded.getOrNull() ?: return
	val paper = Rgba(244, 239, 230, 255)
	val night = Rgba(29, 27, 22, 255)
	for (pattern in listOf("/", "/notes")) {
		val style = routes.getValue(pattern)
		check("$pattern has a light and a dark assignment", style.assignments.size == 2) { "${style.assignments.size}" }
		for (a in style.assignments) {
			val dark = a.values[BAND_KEY] == JsValue.Num(1.0)
			check("$pattern's ${if (dark) "dark" else "light"} canvas", a.canvas == (if (dark) night else paper)) { "${a.canvas}" }
		}
	}
	val text = canonical(Json.parse(bytes))
	val changed = text.replace("\"canvas\":{\"r\":244,\"g\":239,\"b\":230,\"alpha\":255}", "\"canvas\":{\"r\":244,\"g\":239,\"b\":230,\"alpha\":128}")
	check("the translucent edit applied", changed != text) { "" }
	val err = try { StyleExport.decodeApp(changed.toByteArray()); null } catch (e: MarklessDecodeError) { e.message }
	check("app style refuses a translucent canvas", err != null && err.contains("canvas is not opaque")) { "error was: $err" }
}

private fun appStyle(fixtures: File) {
	val bytes = File(fixtures, "s3-app.native-app-style.json").readBytes()
	val decoded = runCatching { StyleExport.decodeApp(bytes) }
	check("decodes the S3 app style", decoded.isSuccess) { decoded.exceptionOrNull().toString() }
	val routes = decoded.getOrNull() ?: return
	check("app style routes", routes.keys == setOf("/", "/settings", "/help")) { "${routes.keys}" }
	val raw = Json.parse(bytes).obj("root").getValue("targets").obj("targets").getValue("android").obj("android")
	val lists = raw.getValue("writes").arr("writes")
	val settingsRaw = raw.getValue("routes").arr("routes").map { it.obj("route") }.single { it.getValue("pattern") == Json.Str("/settings") }
	val rawNodes = settingsRaw.getValue("assignments").arr("a")[0].obj("a0").getValue("nodes").arr("nodes").map { it.obj("node") }
	val settings = routes.getValue("/settings")
	for (n in rawNodes) {
		val id = n.getValue("id").str("id")
		val listed = lists[n.getValue("writes").num("writes").toInt()].arr("list").map { it.obj("w").getValue("kind").str("kind") }
		val expanded = settings.assignments[0].byId.getValue(id).writes.map { it::class.simpleName }
		check("$id's write index expands to the list it names", listed.size == expanded.size) { "$listed vs $expanded" }
	}
	check("the settings page has a band state", settings.bandState >= 0 && settings.bands != null) { "${settings.states}" }
	val cells = listOf("state:on")
	val light = settings.start(cells, { JsValue.Bool(false) }, dark = false)
	val dark = settings.start(cells, { JsValue.Bool(false) }, dark = true)
	check("light picks band 0", settings.assignments[light].values["@env#band"] == JsValue.Num(0.0)) { "${settings.assignments[light].values}" }
	check("dark picks band 1", settings.assignments[dark].values["@env#band"] == JsValue.Num(1.0) && settings.assignments[dark].values["state:on"] == JsValue.Bool(false)) { "${settings.assignments[dark].values}" }
	val onLight = settings.next(light, settings.stateFor("state:on"), JsValue.Bool(true))
	val onDark = settings.next(onLight, settings.bandState, JsValue.Num(1.0))
	check("next over the band keeps the cell", settings.assignments[onDark].values == mapOf("state:on" to JsValue.Bool(true), "@env#band" to JsValue.Num(1.0))) { "${settings.assignments[onDark].values}" }
	check("the dark band paints the page dark", settings.assignments[onDark].byId.getValue("h0").writes != settings.assignments[onLight].byId.getValue("h0").writes) { "" }
	check("a page without @media has no band state", routes.getValue("/").bandState == -1 && routes.getValue("/").start(emptyList(), { JsValue.Null }, true) == routes.getValue("/").initial) { "" }
	val text = canonical(Json.parse(bytes))
	fun refusesApp(name: String, changed: String, fragment: String) {
		check("$name: the edit applied", changed != text) { "" }
		val err = try { StyleExport.decodeApp(changed.toByteArray()); null } catch (e: MarklessDecodeError) { e.message }
		check("app style refuses $name", err != null && err.contains(fragment)) { "error was: $err" }
	}
	// The fixture may be compact or formatted: each edit allows whitespace after a colon.
	refusesApp("an atom of another media feature", text.replace(Regex("\"feature\":\\s*\"prefers-color-scheme\""), "\"feature\":\"width\""), "@media (width) is not implemented on Android")
	refusesApp("an unknown version", text.replace("markless.native-app-style/0", "markless.native-app-style/9"), "unknown app style version")
	refusesApp("a write index out of range", text.replace(Regex("\"writes\":\\s*\\d+(\\s*)}"), "\"writes\":99999$1}"), "not an index of the app's write lists")
	refusesApp("an unknown route field", text.replace(Regex("\"pattern\":\\s*\"/help\""), "\"pattern\":\"/help\",\"extra\":1"), "unknown field \"extra\"")
}

/** A system sheet's styled content: its own layout per resting height, and state that reaches it. */
private fun sheetStyles(fixtures: File) {
	val sheet = "sheet:component-edge:0"
	val z3 = runCatching { StyleExport.decodeApp(File(fixtures, "z3-sheet-size.native-app-style.json").readBytes()).getValue("/") }
	check("decodes Z3's app style with its sheet", z3.isSuccess) { z3.exceptionOrNull().toString() }
	val page = z3.getOrNull() ?: return
	val heights = runCatching { page.sheetHeights(sheet, listOf(0.5, 1.0)) }
	check("Z3's sheet has a layout per resting height", heights.getOrNull()?.size == 2) { heights.exceptionOrNull().toString() }
	val (half, full) = heights.getOrNull() ?: return
	check("half height is laid out in the measured 411 x 371 dp", Math.abs(half.viewportWidth - 411.43) < 1 && Math.abs(half.viewportHeight - 371.43) < 1) { "${half.viewportWidth}x${half.viewportHeight}" }
	check("full height is laid out in the measured 411 x 790 dp", Math.abs(full.viewportWidth - 411.43) < 1 && Math.abs(full.viewportHeight - 790.48) < 1) { "${full.viewportWidth}x${full.viewportHeight}" }
	check("the page's export holds no sheet content", page.assignments.all { a -> a.byId["h9"] == null && a.byId[sheet] == null }) { "" }
	val footer = { st: StyleExport -> st.assignments[st.start(emptyList(), { JsValue.Null }, false, everyCell = false)].byId.getValue("h9").frame }
	check("the footer sits lower at full height than at half", (footer(full)?.y ?: 0.0) > (footer(half)?.y ?: 0.0)) { "${footer(half)} vs ${footer(full)}" }
	val refused = try { page.sheetHeights(sheet, listOf(1.0)); null } catch (e: MarklessDecodeError) { e.message }
	check("a sheet resting elsewhere than its layouts is refused", refused?.contains("rests at [1.0]") == true) { "$refused" }
	val missing = try { page.copy(sheets = emptyMap()).sheetHeights(sheet, listOf(0.5, 1.0)); null } catch (e: MarklessDecodeError) { e.message }
	check("a styled page with an unstyled sheet is refused by name", missing?.contains("no styles for the content of system sheet \"$sheet\"") == true) { "$missing" }

	val z5 = StyleExport.decodeApp(File(fixtures, "z5-sheet-state-style.native-app-style.json").readBytes()).getValue("/")
	val options = z5.sheetHeights(sheet, listOf(1.0)).single()
	val cells = listOf("state:express")
	val off = options.start(cells, { JsValue.Bool(false) }, false, everyCell = false)
	val on = options.next(off, options.stateFor("state:express"), JsValue.Bool(true))
	val fill = { a: Int -> options.assignments[a].byId.getValue("h4").writes.filterIsInstance<StyleWrite.BackgroundColor>().singleOrNull()?.color }
	check("express on paints the toggle teal", fill(on) == Rgba(42, 157, 143, 255) && fill(off) == Rgba(255, 255, 255, 255)) { "${fill(off)} -> ${fill(on)}" }
	check("a sheet's export lists only the cells its content reads", z3.getOrThrow().sheetHeights(sheet, listOf(0.5, 1.0)).all { it.states.isEmpty() } && options.stateOrNone("state:choosing") == -1) { "" }
}

/** The scroll-into-view vectors (`conformance/scroll/`), which ladder-web checks against Chrome. */
private fun scrollVectors(dir: File) {
	val file = File(dir, "scroll/scroll-into-view.json")
	val root = Json.parse(file.readBytes()).obj("scroll vectors")
	check("scroll vectors version", root.field("version", "scroll").str("version") == "markless.native-scroll/0") { "" }
	val rect = { v: Json -> v.obj("rect").let { ScrollRect(it.field("x", "rect").num("x"), it.field("y", "rect").num("y"), it.field("width", "rect").num("width"), it.field("height", "rect").num("height")) } }
	val cases = root.field("cases", "scroll").arr("cases")
	check("scroll vectors have cases", cases.isNotEmpty()) { "" }
	for (c in cases) {
		val o = c.obj("case")
		val name = o.field("name", "case").str("name")
		val chain = o.field("chain", name).arr("chain").map { b ->
			val box = b.obj("box")
			val offset = box.field("offset", name).obj("offset")
			val range = box.field("range", name).obj("range")
			ScrollBox(rect(box.field("port", name)), offset.field("x", name).num("x"), offset.field("y", name).num("y"), ScrollRange(range.field("minX", name).num("minX"), range.field("maxX", name).num("maxX"), range.field("minY", name).num("minY"), range.field("maxY", name).num("maxY")))
		}
		val align = o.field("align", name).obj("align")
		val got = scrollIntoView(chain, rect(o.field("target", name)), ScrollAlignment(ScrollAlign.of(align.field("block", name).str("block")), ScrollAlign.of(align.field("inline", name).str("inline"))))
		val want = o.field("offsets", name).arr("offsets").map { it.obj("offset").let { p -> p.field("x", name).num("x") to p.field("y", name).num("y") } }
		check("scroll: $name", got == want) { "$got, expected $want" }
	}
}

fun main(args: Array<String>) {
	routes()
	arrays()
	attributeRule()
	ops()
	jsOps()
	numberFormatting()
	styleExport(File(System.getProperty("markless.fixtures") ?: error("set -Dmarkless.fixtures")))
	appStyle(File(System.getProperty("markless.fixtures") ?: error("set -Dmarkless.fixtures")))
	appCanvas(File(System.getProperty("markless.fixtures") ?: error("set -Dmarkless.fixtures")))
	sheetStyles(File(System.getProperty("markless.fixtures") ?: error("set -Dmarkless.fixtures")))
	decoderStrictness()
	val dirs = args.map(::File)
	for (d in dirs) if (File(d, "scroll").isDirectory) scrollVectors(d)
	val files = dirs.flatMap { d -> d.listFiles { f -> f.name.endsWith(".json") }?.sortedBy { it.name } ?: error("no vector directory $d") }
	if (files.isEmpty()) { println("FAIL no conformance vectors in ${args.joinToString()}"); failures++ }
	for (f in files) try { runVector(f) } catch (e: Exception) { failures++; println("FAIL ${f.name}: $e") }
	println("$passes passed, $failures failed")
	exitProcess(if (failures == 0) 0 else 1)
}
