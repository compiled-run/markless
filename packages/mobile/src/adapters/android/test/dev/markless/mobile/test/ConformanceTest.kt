package dev.markless.mobile.test

import dev.markless.mobile.core.AttributeValue
import dev.markless.mobile.core.EventName
import dev.markless.mobile.core.Js
import dev.markless.mobile.core.MemoryStore
import dev.markless.mobile.core.Scalar
import dev.markless.mobile.core.Json
import dev.markless.mobile.core.JsString
import dev.markless.mobile.core.MarklessDecodeError
import dev.markless.mobile.core.Node
import dev.markless.mobile.core.Payload
import dev.markless.mobile.core.Runtime
import dev.markless.mobile.core.arr
import dev.markless.mobile.core.jsonString
import dev.markless.mobile.core.obj
import dev.markless.mobile.core.str
import dev.markless.mobile.style.StyleExport
import java.io.File
import kotlin.system.exitProcess

const val CONFORMANCE_VERSION = "markless.native-conformance/0"

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
	check("${file.name} version", version == CONFORMANCE_VERSION) { "vector version is $version, this test reads $CONFORMANCE_VERSION" }
	val payload = Payload.decode(field(vector, "payload", file.name))
	val runtime = Runtime(payload)
	val mounted = runtime.texts().joinToString(",", "[", "]") { (n, t) -> "[${jsonString(n)},${jsonString(t)}]" }
	val initial = canonical(field(vector, "initial", file.name))
	check("${file.name} initial", mounted == initial) { "expected $initial\n  actual   $mounted" }
	val attributes = runtime.attributes().joinToString(",", "[", "]") { (n, a, v) -> "[${jsonString(n)},${jsonString(a)},${v?.let(::jsonString) ?: "null"}]" }
	val initialAttributes = vector["initialAttributes"]?.let(::canonical) ?: "[]"
	check("${file.name} initialAttributes", attributes == initialAttributes) { "expected $initialAttributes\n  actual   $attributes" }
	val arms = runtime.arms().joinToString(",", "[", "]") { (n, i) -> "[${jsonString(n)},${i ?: "null"}]" }
	val initialArms = vector["initialArms"]?.let(::canonical) ?: "[]"
	check("${file.name} initialArms", arms == initialArms) { "expected $initialArms\n  actual   $arms" }
	for ((n, step) in field(vector, "steps", file.name).arr("steps").withIndex()) {
		val s = step.obj("steps[$n]")
		val action = field(s, "action", "steps[$n]").obj("action")
		val event = field(action, "event", "action").str("event")
		val name = EventName.entries.firstOrNull { it.wire == event } ?: throw IllegalStateException("steps[$n] has unknown event $event")
		val actual = runtime.dispatch(field(action, "host", "action").str("host"), name).joinToString(",", "[", "]") { it.toJson() }
		val expected = canonical(field(s, "journal", "steps[$n]"))
		check("${file.name} step $n", actual == expected) { "expected $expected\n  actual   $actual" }
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
	export.getOrNull()?.let { e -> check("counter export button frame", e.byId["h2"]?.frame?.width == 311.953125) { "${e.byId["h2"]}" } }
	val text = String(bytes, Charsets.UTF_8)
	fun refusesStyle(name: String, changed: String, fragment: String) {
		val err = try { StyleExport.decode(changed.toByteArray()); null } catch (e: MarklessDecodeError) { e.message }
		check("style export refuses $name", err != null && err.contains(fragment)) { "error was: $err" }
	}
	refusesStyle("an unknown write kind", text.replace("\"kind\": \"text-color\"", "\"kind\": \"box-shadow\""), "unknown style write kind \"box-shadow\"")
	refusesStyle("an unknown schema", text.replace("native-style-export/0", "native-style-export/1"), "unknown style export schema")
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
	check("a storage cell writes its store", store.get("visits") == Scalar.Num(1.0)) { "${store.get("visits")}" }
	val again = Runtime(decoded, store)
	check("a storage cell reads its store at mount", again.text("h0:text0") == "1/<a>") { again.text("h0:text0") }
	refuses("an unknown builtin", payload.replace("\"template\":[", "\"call\":\"eval\",\"arguments\":[{\"literal\":1}],\"x\":[").replace(",\"x\":[\"<\",{\"cell\":\"s\"},\">\"]", ""), "unknown call \"eval\"")
	refuses("an unknown binary operator", payload.replace("\"binary\":\"+\",\"left\":{\"unary\"", "\"binary\":\"**\",\"left\":{\"unary\""), "unknown binary \"**\"")
}

private fun jsOps() {
	fun n(x: Double) = Scalar.Num(x)
	fun str(x: String) = Scalar.Str(x)
	val cases = listOf(
		Js.binary("+", str("5"), n(1.0)) to str("51"), Js.binary("+", n(1.0), Scalar.Bool(true)) to n(2.0), Js.binary("+", Scalar.Null, str("x")) to str("nullx"),
		Js.binary("-", str("5"), n(2.0)) to n(3.0), Js.binary("<", str("10"), str("9")) to Scalar.Bool(true), Js.binary("<", str("10"), n(9.0)) to Scalar.Bool(false),
		Js.binary("<=", n(Double.NaN), n(1.0)) to Scalar.Bool(false), Js.binary(">=", Scalar.Null, n(0.0)) to Scalar.Bool(true), Js.binary("%", n(-5.0), n(3.0)) to n(-2.0),
		Js.call("Number", listOf(str(" 12 "))) to n(12.0), Js.call("Number", listOf(str("5x"))) to n(Double.NaN), Js.call("Number", listOf(str(""))) to n(0.0),
		Js.call("Number", listOf(str("0x1F"))) to n(31.0), Js.call("Number", listOf(str("-0x1F"))) to n(Double.NaN), Js.call("Number", listOf(str("1e3"))) to n(1000.0),
		Js.call("Number", listOf(str("1f"))) to n(Double.NaN), Js.call("Number", listOf(str(".5"))) to n(0.5), Js.call("Number", listOf(str("5."))) to n(5.0), Js.call("Number", listOf(str("-Infinity"))) to n(Double.NEGATIVE_INFINITY),
		Js.call("Math.round", listOf(n(-2.5))) to n(-2.0), Js.call("Math.round", listOf(n(2.5))) to n(3.0), Js.call("Math.round", listOf(n(0.49999999999999994))) to n(0.0),
		Js.call("Math.round", listOf(n(4503599627370497.0))) to n(4503599627370497.0), Js.call("Math.max", listOf()) to n(Double.NEGATIVE_INFINITY), Js.call("Math.max", listOf(n(1.0), n(Double.NaN))) to n(Double.NaN),
		Js.call("String", listOf()) to str(""), Js.call("Boolean", listOf(str("0"))) to Scalar.Bool(true), Js.call("Math.abs", listOf(str("-3"))) to n(3.0),
	)
	for ((n2, pair) in cases.withIndex()) {
		val (got, want) = pair
		val same = if (got is Scalar.Num && want is Scalar.Num) got.value.equals(want.value) else got == want
		check("js op $n2", same) { "got $got, want $want" }
	}
	val negZero = Js.call("Math.min", listOf(n(0.0), n(-0.0))) as Scalar.Num
	check("Math.min(0, -0) is -0", 1 / negZero.value < 0) { "${negZero.value}" }
	val posZero = Js.call("Math.max", listOf(n(-0.0), n(0.0))) as Scalar.Num
	check("Math.max(-0, 0) is 0", 1 / posZero.value > 0) { "${posZero.value}" }
	check("round keeps -0 for -0.4", 1 / Js.round(-0.4) < 0) { "${Js.round(-0.4)}" }
}

private fun attributeRule() {
	val t = Scalar.Bool(true); val f = Scalar.Bool(false)
	val cases = listOf(
		Triple("disabled", t, ""), Triple("disabled", f, null), Triple("aria-pressed", f, "false"), Triple("aria-pressed", t, "true"),
		Triple("aria-hidden", f, null), Triple("aria-hidden", t, "true"), Triple("data-on", t, "true"), Triple("data-on", f, null),
		Triple("draggable", f, "false"), Triple("spellcheck", t, "true"), Triple("title", Scalar.Num(2.0), "2"), Triple("title", Scalar.Str(""), ""),
	)
	for ((name, value, want) in cases) check("attribute $name=$value", AttributeValue.of(name, value) == want) { "got ${AttributeValue.of(name, value)}, want $want" }
	check("=== is false across types", !Runtime.strictEquals(Scalar.Num(1.0), Scalar.Str("1"))) { "" }
	check("=== holds 0 and -0 equal", Runtime.strictEquals(Scalar.Num(0.0), Scalar.Num(-0.0))) { "" }
	check("=== holds NaN unequal", !Runtime.strictEquals(Scalar.Num(Double.NaN), Scalar.Num(Double.NaN))) { "" }
}

fun main(args: Array<String>) {
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
