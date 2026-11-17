package dev.markless.mobile.test

import dev.markless.mobile.core.EventName
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
	val mounted = payload.nodes.filterIsInstance<Node.Text>().joinToString(",", "[", "]") { "[${jsonString(it.id)},${jsonString(runtime.text(it.id))}]" }
	val initial = canonical(field(vector, "initial", file.name))
	check("${file.name} initial", mounted == initial) { "expected $initial\n  actual   $mounted" }
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
	val ok = """{"version":"markless.native-view/0","component":"C","cells":[{"id":"c","name":"c","initial":0}],"nodes":[{"kind":"element","id":"h0","element":"div","parent":null},{"kind":"text","id":"h0:text0","parent":"h0","parts":[{"cell":"c"}]}],"events":[{"host":"h0","event":"activate","handler":"x"}],"handlers":[{"id":"x","ops":[{"op":"add","cell":"c","value":1}]}]}"""
	check("decodes a minimal payload", runCatching { Payload.decode(ok.toByteArray()) }.isSuccess) { runCatching { Payload.decode(ok.toByteArray()) }.exceptionOrNull().toString() }
	refuses("an unknown version", ok.replace("native-view/0", "native-view/9"), "unknown payload version")
	refuses("an unknown node kind", ok.replace("\"kind\":\"text\"", "\"kind\":\"image\""), "unknown node kind \"image\"")
	refuses("an unknown op", ok.replace("\"op\":\"add\"", "\"op\":\"multiply\""), "unknown op \"multiply\"")
	refuses("an unknown event", ok.replace("\"activate\"", "\"hover\""), "unknown event \"hover\"")
	refuses("an unknown field", ok.replace("\"component\":\"C\"", "\"component\":\"C\",\"extra\":1"), "unknown field \"extra\"")
	refuses("a non-integer initial", ok.replace("\"initial\":0", "\"initial\":0.5"), "integers only")
	refuses("a parent that does not precede", ok.replace("\"parent\":\"h0\"", "\"parent\":\"h9\""), "does not precede")
	refuses("an unknown cell read", ok.replace("\"parts\":[{\"cell\":\"c\"}]", "\"parts\":[{\"cell\":\"d\"}]"), "unknown cell \"d\"")
	refuses("trailing bytes", "$ok x", "trailing data")
}

fun main(args: Array<String>) {
	numberFormatting()
	decoderStrictness()
	val dirs = args.map(::File)
	val files = dirs.flatMap { d -> d.listFiles { f -> f.name.endsWith(".json") }?.sortedBy { it.name } ?: error("no vector directory $d") }
	if (files.isEmpty()) { println("FAIL no conformance vectors in ${args.joinToString()}"); failures++ }
	for (f in files) try { runVector(f) } catch (e: Exception) { failures++; println("FAIL ${f.name}: $e") }
	println("$passes passed, $failures failed")
	exitProcess(if (failures == 0) 0 else 1)
}
