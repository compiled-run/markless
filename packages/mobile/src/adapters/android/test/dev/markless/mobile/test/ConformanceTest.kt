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
import dev.markless.mobile.core.jsonString
import dev.markless.mobile.core.jsonValue
import dev.markless.mobile.core.obj
import dev.markless.mobile.core.str
import dev.markless.mobile.style.StyleExport
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
	val runtime = Runtime(payload, params = params)
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
	val arms = runtime.arms().joinToString(",", "[", "]") { (n, i) -> "[${jsonString(n)},${i ?: "null"}]" }
	val initialArms = vector["initialArms"]?.let(::canonical) ?: "[]"
	check("${file.name} initialArms", arms == initialArms) { "expected $initialArms\n  actual   $arms" }
	for ((n, step) in field(vector, "steps", file.name).arr("steps").withIndex()) {
		val s = step.obj("steps[$n]")
		val action = field(s, "action", "steps[$n]").obj("action")
		val event = field(action, "event", "action").str("event")
		val name = EventName.entries.firstOrNull { it.wire == event } ?: throw IllegalStateException("steps[$n] has unknown event $event")
		val value = action["value"]?.str("action.value")
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

fun main(args: Array<String>) {
	routes()
	arrays()
	attributeRule()
	ops()
	jsOps()
	numberFormatting()
	styleExport(File(System.getProperty("markless.fixtures") ?: error("set -Dmarkless.fixtures")))
	decoderStrictness()
	val dirs = args.map(::File)
	val files = dirs.flatMap { d -> d.listFiles { f -> f.name.endsWith(".json") }?.sortedBy { it.name } ?: error("no vector directory $d") }
	if (files.isEmpty()) { println("FAIL no conformance vectors in ${args.joinToString()}"); failures++ }
	for (f in files) try { runVector(f) } catch (e: Exception) { failures++; println("FAIL ${f.name}: $e") }
	println("$passes passed, $failures failed")
	exitProcess(if (failures == 0) 0 else 1)
}
