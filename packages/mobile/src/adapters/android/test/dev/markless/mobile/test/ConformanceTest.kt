package dev.markless.mobile.test

import dev.markless.mobile.core.AppPayload
import dev.markless.mobile.core.AppRuntime
import dev.markless.mobile.core.AttributeValue
import dev.markless.mobile.core.ElementBox
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
import dev.markless.mobile.core.ScriptEngine
import dev.markless.mobile.core.ScriptHost
import dev.markless.mobile.core.TouchPoint
import dev.markless.mobile.core.arr
import dev.markless.mobile.core.text
import dev.markless.mobile.core.field
import dev.markless.mobile.core.num
import dev.markless.mobile.core.ScrollAlign
import dev.markless.mobile.core.ScrollAlignment
import dev.markless.mobile.core.ScrollBox
import dev.markless.mobile.core.ScrollRange
import dev.markless.mobile.core.ScrollRect
import dev.markless.mobile.core.scrollIntoView
import dev.markless.mobile.core.jsonString
import dev.markless.mobile.core.ConformanceEngine
import dev.markless.mobile.core.jsonValue
import dev.markless.mobile.core.num
import dev.markless.mobile.core.obj
import dev.markless.mobile.core.str
import dev.markless.mobile.core.text
import dev.markless.mobile.style.BAND_KEY
import dev.markless.mobile.style.Edges
import dev.markless.mobile.style.PaddingBox
import dev.markless.mobile.style.paddingBox
import dev.markless.mobile.style.BandAtom
import dev.markless.mobile.style.BandComparison
import dev.markless.mobile.style.Bands
import dev.markless.mobile.style.Rgba
import dev.markless.mobile.style.Shadow
import dev.markless.mobile.style.ShadowPaint
import dev.markless.mobile.style.CheckboxColors
import dev.markless.mobile.style.CheckboxMarks
import dev.markless.mobile.style.GlyphRun
import dev.markless.mobile.style.StyleExport
import dev.markless.mobile.style.shownRows
import dev.markless.mobile.style.rowStates
import dev.markless.mobile.style.SystemFace
import dev.markless.mobile.style.TextLine
import dev.markless.mobile.style.StyleWrite
import dev.markless.mobile.style.stackingParent
import dev.markless.mobile.style.SelectArrow
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

/** The JVM has no Hermes: each source runs in one `vm` context of a long-lived `node`, as the reference engine runs it. */
class NodeEngine : ScriptEngine, AutoCloseable {
	private val process = ProcessBuilder("node", "-e", REPL).redirectError(ProcessBuilder.Redirect.INHERIT).start()
	private val input = process.outputStream.bufferedWriter(Charsets.UTF_8)
	private val output = process.inputStream.bufferedReader(Charsets.UTF_8)

	override fun evaluate(source: String): String {
		input.write(jsonString(source))
		input.newLine()
		input.flush()
		val reply = Json.parse(output.readLine() ?: throw IllegalStateException("node exited")).obj("node's reply")
		reply["error"]?.let { throw IllegalStateException(it.str("error")) }
		return field(reply, "ok", "node's reply").str("ok")
	}

	override fun close() {
		input.close()
		process.waitFor()
	}

	companion object {
		private const val REPL = "const vm = require('node:vm'); const context = vm.createContext({}, { microtaskMode: 'afterEvaluate' }); require('node:readline').createInterface({ input: process.stdin }).on('line', (line) => { let reply; try { reply = { ok: String(vm.runInContext(JSON.parse(line), context)) }; } catch (error) { reply = { error: String(error) }; } process.stdout.write(JSON.stringify(reply) + '\\n'); });"
	}
}

/** One app's engine, started on first ask; `crypto` draws from all-zero seed bytes, as the vectors were written with. */
class TestScriptHost : ScriptHost, AutoCloseable {
	private var engine: NodeEngine? = null
	val started get() = engine != null

	override fun start(): ScriptEngine = engine ?: NodeEngine().also { engine = it }

	override fun seed() = "00".repeat(32)

	override fun close() {
		engine?.close()
	}
}

private fun field(o: Map<String, Json>, name: String, where: String): Json = o[name] ?: throw IllegalStateException("$where has no \"$name\"")

/** An action's touch fields, or null when it names none. */
private fun touchOf(action: Map<String, Json>): TouchPoint? {
	if (listOf("pointerId", "x", "y", "time").none { it in action }) return null
	fun n(name: String, default: Double) = action[name]?.num("action.$name") ?: default
	return TouchPoint(n("pointerId", 1.0), n("x", 0.0), n("y", 0.0), n("time", 0.0))
}

/** A vector's JSON with the engine text put back from conformance/engine, beside the vector. */
private fun vectorBytes(file: File): ByteArray =
	ConformanceEngine.put(file.readText()) { name -> File(File(file.parentFile, "engine"), name).readText() }.toByteArray()

/** One `markless.native-conformance/0` vector: the mounted texts must read `initial`, then each action's journal must match, byte for byte. */
private fun runVector(file: File) {
	val vector = Json.parse(vectorBytes(file)).obj(file.name)
	val version = field(vector, "version", file.name).str("version")
	if (version == APP_CONFORMANCE_VERSION) return runAppVector(file, vector)
	check("${file.name} version", version == CONFORMANCE_VERSION) { "vector version is $version, this test reads $CONFORMANCE_VERSION" }
	val payload = Payload.decode(field(vector, "payload", file.name))
	val params = vector["params"]?.obj("params")?.mapValues { (k, v) -> v.str("params.$k") } ?: emptyMap()
	val languages = vector["preferredLanguages"]?.arr("preferredLanguages")?.map { it.str("preferredLanguages[]") } ?: listOf("en")
	val now = (vector["now"] as? Json.Num)?.value
	TestScriptHost().use { host ->
		val runtime = if (now == null) Runtime(payload, params = params, preferredLanguages = languages, scriptHost = host) else Runtime(payload, params = params, preferredLanguages = languages, now = { now }, scriptHost = host)
		val layout = vector["layout"]?.obj("layout")?.mapValues { (id, box) ->
			val b = box.obj("layout.$id")
			fun number(key: String) = (b[key] as? Json.Num)?.value ?: throw IllegalStateException("layout.$id.$key is not a number")
			ElementBox(number("x"), number("y"), number("width"), number("height"), (b["direction"] as? Json.Str)?.value == "rtl")
		}
		if (layout != null) runtime.measure = { layout[it] }
		runVector(file, vector, runtime)
		if (payload.script == null) check("${file.name} starts no engine", !host.started) { "a payload without a script started the engine" }
	}
}

private fun runVector(file: File, vector: Map<String, Json>, runtime: Runtime) {
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
	val selections = runtime.selections().joinToString(",", "[", "]") { (n, s) -> "[${jsonString(n)},$s]" }
	val initialSelections = vector["initialSelections"]?.let(::canonical) ?: "[]"
	check("${file.name} initialSelections", selections == initialSelections) { "expected $initialSelections\n  actual   $selections" }
	val arms = runtime.arms().joinToString(",", "[", "]") { (n, i) -> "[${jsonString(n)},${i ?: "null"}]" }
	val initialArms = vector["initialArms"]?.let(::canonical) ?: "[]"
	check("${file.name} initialArms", arms == initialArms) { "expected $initialArms\n  actual   $arms" }
	val sheets = runtime.sheets().joinToString(",", "[", "]") { (n, open) -> "[${jsonString(n)},$open]" }
	val initialSheets = vector["initialSheets"]?.let(::canonical) ?: "[]"
	check("${file.name} initialSheets", sheets == initialSheets) { "expected $initialSheets\n  actual   $sheets" }
	val tasks = runtime.tasks().joinToString(",", "[", "]") { it.toJson() }
	val initialTasks = vector["tasks"]?.let(::canonical) ?: "[]"
	check("${file.name} tasks", tasks == initialTasks) { "expected $initialTasks\n  actual   $tasks" }
	val start = runtime.start().joinToString(",", "[", "]") { it.toJson() }
	val expectedStart = vector["start"]?.let(::canonical) ?: "[]"
	check("${file.name} start", start == expectedStart) { "expected $expectedStart\n  actual   $start" }
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
		if (event == "response") {
			val id = field(action, "id", "action").num("action.id").toInt()
			val journal = runtime.response(id, JsValue.fromJson(field(action, "response", "action")))
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
		val carried = when (name) {
			EventName.Keydown, EventName.Keyup -> "key"
			EventName.Paste -> "text"
			EventName.AnimationStart, EventName.AnimationIteration, EventName.AnimationEnd, EventName.AnimationCancel -> "animationName"
			else -> "value"
		}
		val elapsed = (action["elapsedTime"] as? Json.Num)?.value
		val value = action[carried]?.str("action.$carried")
		val reason = action["reason"]?.str("action.reason")
		val detail = (action["detail"] as? Json.Num)?.value?.toInt()
		val actual = runtime.dispatch(field(action, "host", "action").str("host"), name, if (name == EventName.Activate) null else value, reason, detail, touchOf(action), elapsed).joinToString(",", "[", "]") { it.toJson() }
		val expected = canonical(field(s, "journal", "steps[$n]"))
		check("${file.name} step $n", actual == expected) { "expected $expected\n  actual   $actual" }
	}
	if (runtime.payload.cells.any { it.async != null }) {
		val leave = runtime.leave().joinToString(",", "[", "]") { it.toJson() }
		val expectedLeave = vector["leave"]?.let(::canonical) ?: "[]"
		check("${file.name} leave", leave == expectedLeave) { "expected $expectedLeave\n  actual   $leave" }
	}
}

/** One `markless.native-app-conformance/0` vector: after opening and after each action, the stack's paths, the top screen's title and texts, and the journal. */
private fun runAppVector(file: File, vector: Map<String, Json>) {
	val app = AppPayload.decodeOrNull(field(vector, "app", file.name)) ?: throw IllegalStateException("${file.name}: app is a single page payload")
	TestScriptHost().use { runAppVector(file, vector, AppRuntime(app, field(vector, "open", file.name).str("open"), scriptHost = it)) }
}

private fun runAppVector(file: File, vector: Map<String, Json>, runtime: AppRuntime) {
	fun look(where: String, expected: Map<String, Json>) {
		val stack = runtime.screens.joinToString(",", "[", "]") { jsonString(it.path) }
		check("${file.name} $where stack", stack == canonical(field(expected, "stack", where))) { "expected ${canonical(field(expected, "stack", where))}\n  actual   $stack" }
		val top = runtime.screens.last().runtime
		val title = top.title()?.let(::jsonString) ?: "null"
		check("${file.name} $where title", title == canonical(field(expected, "title", where))) { "expected ${canonical(field(expected, "title", where))}\n  actual   $title" }
		val texts = top.texts().joinToString(",", "[", "]") { (n, t) -> "[${jsonString(n)},${jsonString(t)}]" }
		check("${file.name} $where texts", texts == canonical(field(expected, "texts", where))) { "expected ${canonical(field(expected, "texts", where))}\n  actual   $texts" }
	}
	val started = runtime.started.joinToString(",", "[", "]") { it.toJson() }
	val expectedStarted = vector["started"]?.let(::canonical) ?: "[]"
	check("${file.name} started", started == expectedStarted) { "expected $expectedStarted\n  actual   $started" }
	look("initial", field(vector, "initial", file.name).obj("initial"))
	for ((n, step) in field(vector, "steps", file.name).arr("steps").withIndex()) {
		val s = step.obj("steps[$n]")
		val action = field(s, "action", "steps[$n]").obj("action")
		val event = field(action, "event", "action").str("event")
		val journal = if (event == "back") runtime.back() else {
			val name = EventName.entries.firstOrNull { it.wire == event } ?: throw IllegalStateException("steps[$n] has unknown event $event")
			runtime.dispatch(field(action, "host", "action").str("host"), name, action["value"]?.str("action.value"), touchOf(action))
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
	check("decodes a sheet resting at one height below full", runCatching { Payload.decode(sheet.replace("\"snapPoints\":[1]", "\"snapPoints\":[0.5]").toByteArray()) }.getOrNull()?.nodes?.any { it is Node.Sheet && it.snapPoints == listOf(0.5) } == true) { "a sheet at [0.5] did not decode" }
	refuses("a sheet resting at no height", sheet.replace("\"snapPoints\":[1]", "\"snapPoints\":[0]"), "snapPoints")
	refuses("a sheet whose largest height is not full", sheet.replace("\"snapPoints\":[1]", "\"snapPoints\":[0.3,0.8]"), "snapPoints")
	refuses("a sheet in an arm of no branch", sheet.replace("\"modal\":true", "\"modal\":true,\"arm\":{\"branch\":\"b\",\"index\":0}"), "not a preceding branch")
	refuses("a sheet inside a sheet", sheet.replace("\"parent\":\"s\"}", "\"parent\":\"s\"},{\"kind\":\"sheet\",\"id\":\"s2\",\"parent\":\"s\",\"open\":{\"literal\":false},\"snapPoints\":[1],\"dismissible\":false,\"modal\":true}"), "has a Sheet node as its parent")
	refuses("a dismiss event on an element", sheet.replace("\"host\":\"s\",\"event\":\"dismiss\"", "\"host\":\"h0\",\"event\":\"dismiss\""), "names no sheet")
	val script = ok.replace("{\"op\":\"assign\",\"cell\":\"c\",\"value\":{\"literal\":1}}", "{\"op\":\"script\",\"fn\":\"fn:0\",\"type\":\"click\",\"bindings\":{\"c\":{\"cell\":\"c\"}}}")
		.replace("\"component\":\"C\"", "\"component\":\"C\",\"script\":{\"id\":\"s\",\"source\":\"\",\"services\":[\"timers\"]}")
	check("decodes a script op", runCatching { Payload.decode(script.toByteArray()) }.getOrNull()?.script?.services == listOf("timers")) { runCatching { Payload.decode(script.toByteArray()) }.exceptionOrNull().toString() }
	refuses("a script op with no script", script.replace(",\"script\":{\"id\":\"s\",\"source\":\"\",\"services\":[\"timers\"]}", ""), "no script")
	refuses("an unknown script service", script.replace("[\"timers\"]", "[\"workers\"]"), "unknown service \"workers\"")
	refuses("a script binding of an unknown cell", script.replace("{\"cell\":\"c\"}}}", "{\"cell\":\"d\"}}}"), "unknown cell \"d\"")
	refuses("an unknown script binding", script.replace("{\"cell\":\"c\"}}}", "{\"slot\":\"c\"}}}"), "unknown script binding")
	refuses("an unknown script op field", script.replace("\"fn\":\"fn:0\"", "\"fn\":\"fn:0\",\"this\":1"), "unknown field \"this\"")
	refuses("an activate event on a sheet", sheet.replace("\"host\":\"s\",\"event\":\"dismiss\"", "\"host\":\"s\",\"event\":\"activate\""), "names no element")
	pointerDecoding()
}

private fun pointerDecoding() {
	fun page(ops: String, host: String = "h0", event: String = "pointermove") = """{"version":"markless.native-view/0","component":"C","cells":[{"id":"c","name":"c","initial":0}],"nodes":[{"kind":"element","id":"h0","element":"div","parent":null},{"kind":"text","id":"h0:text0","parent":"h0","parts":[{"cell":"c"}]}],"events":[{"host":"$host","event":"$event","handler":"x"}],"handlers":[{"id":"x","ops":[$ops]}]}"""
	fun read(field: String, captures: String = """{"captures":{"event":"target"},"pointer":{"event":"pointerId"}}""") = """{"op":"assign","cell":"c","value":{"if":$captures,"whenTrue":{"event":"$field"},"whenFalse":{"literal":"free"}}}"""
	val capture = """{"op":"capture","node":{"event":"currentTarget"},"pointer":{"event":"pointerId"}}"""
	val release = """{"op":"capture","node":"h0","pointer":{"literal":1},"release":true}"""
	val fields = listOf("target", "currentTarget", "relatedTarget", "button", "buttons", "clientX", "clientY", "pointerId", "pointerType", "isPrimary", "timeStamp")
	val decoded = runCatching { Payload.decode(page((listOf(capture) + fields.map { read(it) } + release).joinToString(",")).toByteArray()) }
	check("decodes every pointer field, captures and the capture op", decoded.getOrNull()?.handlers?.single()?.ops?.size == fields.size + 2) { decoded.exceptionOrNull().toString() }
	for (name in listOf("pointerdown", "pointermove", "pointerup", "pointercancel", "pointerover", "pointerout", "pointerenter", "pointerleave"))
		check("decodes the $name event", runCatching { Payload.decode(page(read("clientX"), event = name).toByteArray()) }.isSuccess) { "" }
	val placed = Runtime(Payload.decode(page("""{"op":"assign","cell":"c","value":{"event":"clientX"}}""", event = "contextmenu").toByteArray()))
	val at = placed.dispatch("h0", EventName.ContextMenu, point = TouchPoint(x = 30.5, y = 4.0)).joinToString(",") { it.toJson() }
	check("a contextmenu handler reads the long press's place", at == """{"op":"text","node":"h0:text0","value":"30.5"}""") { at }
	refuses("a pointer event on a text", page(read("clientX"), host = "h0:text0"), "names no element")
	refuses("an unknown pointer field", page(read("offsetX")), "unknown event \"offsetX\"")
	refuses("captures without a pointer", page(read("clientX", """{"captures":{"event":"target"}}""")), "is missing \"pointer\"")
	refuses("captures with another field", page(read("clientX", """{"captures":{"event":"target"},"pointer":{"literal":1},"node":{"literal":1}}""")), "unknown field \"node\"")
	refuses("a capture op without a pointer", page("""{"op":"capture","node":"h0"}"""), "is missing \"pointer\"")
	refuses("a capture op without a node", page("""{"op":"capture","pointer":{"literal":1}}"""), "is missing \"node\"")
	refuses("a capture op with release false", page("""{"op":"capture","node":"h0","pointer":{"literal":1},"release":false}"""), "release must be true")
	refuses("a capture op with another field", page("""{"op":"capture","node":"h0","pointer":{"literal":1},"capture":true}"""), "unknown field \"capture\"")
	refuses("a capture op with a numeric node", page("""{"op":"capture","node":1,"pointer":{"literal":1}}"""), "must be an object")
	refuses("a capture op reading an unknown cell", page("""{"op":"capture","node":"h0","pointer":{"cell":"d"}}"""), "unknown cell \"d\"")
	val r = Runtime(Payload.decode(page("${read("clientX")},$release").toByteArray()))
	check("a move with no touch down is an error", runCatching { r.dispatch("h0", EventName.PointerMove) }.exceptionOrNull()?.message == "touch 1 is not down") { "" }
	check("pointerover is not dispatched", runCatching { r.dispatch("h0", EventName.PointerOver) }.exceptionOrNull()?.message == "pointerover is raised by the runtime, not dispatched") { "" }
	check("an activate carries no touch", runCatching { r.dispatch("h0", EventName.Activate, point = TouchPoint()) }.exceptionOrNull()?.message == "a activate event carries no touch") { "" }
	r.dispatch("h0", EventName.PointerDown)
	check("a second down of one touch is an error", runCatching { r.dispatch("h0", EventName.PointerDown) }.exceptionOrNull()?.message == "touch 1 is already down") { "" }
	val held = r.dispatch("h0", EventName.PointerMove, point = TouchPoint(1.0, 12.5, 3.0)).joinToString(",") { it.toJson() }
	check("a touch is captured to the element it went down on", held == """{"op":"text","node":"h0:text0","value":"12.5"}""") { held }
	val freed = r.dispatch("h0", EventName.PointerMove, point = TouchPoint(1.0, 20.0)).joinToString(",") { it.toJson() }
	check("a release frees it", freed == """{"op":"text","node":"h0:text0","value":"free"}""") { freed }
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
	refusesStyle("an unknown write kind", text.replace("\"kind\": \"text-color\"", "\"kind\": \"text-shadow\""), "unknown style write kind \"text-shadow\"")
	refusesStyle("an unknown schema", text.replace("native-style-export/0", "native-style-export/9"), "unknown style export schema")
	fun withVisibility(value: String) = text.replace("\"writes\": [\n      {", "\"writes\": [\n      { \"kind\": \"visibility\", \"value\": \"$value\", \"canvas\": false, \"key\": \"visibility\" },\n      {")
	check("the fixture gains visibility writes", withVisibility("hidden") != text) { "" }
	val hidden = runCatching { StyleExport.decode(withVisibility("hidden").toByteArray()) }
	check("decodes a visibility write", hidden.getOrNull()?.assignments?.get(0)?.byId?.get("h2")?.writes?.contains(StyleWrite.Visibility("hidden")) == true) { "${hidden.exceptionOrNull() ?: hidden.getOrNull()?.assignments?.get(0)?.byId?.get("h2")}" }
	refusesStyle("a visibility it does not know", withVisibility("gone"), "visibility")
}

private fun dashedBorders(fixtures: File) {
	val text = File(fixtures, "u17-borders-dashed.native-style.json").readText()
	val export = runCatching { StyleExport.decode(text.toByteArray()) }
	check("decodes the u17 export's border operations", export.isSuccess) { export.exceptionOrNull().toString() }
	export.getOrNull()?.let { e ->
		val byId = e.assignments[0].byId
		check("a dashed box carries Dragon's fills", (byId["h2"]?.borderOps?.ops?.count { it.op == "fill" } ?: 0) > 20) { "${byId["h2"]?.borderOps}" }
		check("a dotted box carries dots", byId["h3"]?.borderOps?.ops?.any { it.op == "dot" } == true) { "${byId["h3"]?.borderOps}" }
		check("a solid box carries none", byId["h5"]?.borderOps == null) { "${byId["h5"]?.borderOps}" }
	}
	val err = try { StyleExport.decode(text.replace("\"op\": \"dot\"", "\"op\": \"arc\"").toByteArray()); null } catch (e: MarklessDecodeError) { e.message }
	check("style export refuses an unknown border operation", err?.contains("unknown border operation \"arc\"") == true) { "error was: $err" }
}

// The u122 rung's export (proofs/u122-box-shadow): an outer, an inset and a rounded spread shadow.
private fun boxShadows(fixtures: File) {
	val text = File(fixtures, "u122-box-shadow.native-style.json").readText()
	val export = runCatching { StyleExport.decode(text.toByteArray()) }
	check("decodes the u122 export's box-shadow writes", export.isSuccess) { export.exceptionOrNull().toString() }
	export.getOrNull()?.let { e ->
		val short = e.assignments[0]
		val outer = ShadowPaint.of(short.byId.getValue("h2"), short, e.dpr)
		check("an outer shadow keeps its computed values", outer?.shadows == listOf(Shadow(false, 0.0, 2.0, 6.0, 0.0, Rgba(0, 0, 0, 51)))) { "$outer" }
		check("an outer shadow is only outer", outer?.hasOuter == true && outer.hasInset == false) { "$outer" }
		// 52.5 and 222.03125 device px from the page, 974 by 125.5: the snapped border box.
		check("the box is snapped in page device px", outer?.box?.edges == listOf(53.0, 222.0, 1027.0, 348.0)) { "${outer?.box}" }
		// The white canvas, then main's background; html's and body's transparent writes paint nothing.
		check("the backdrop is the canvas and main", outer?.backdrop?.map { it.background } == listOf(Rgba(255, 255, 255, 255), Rgba(244, 241, 234, 255))) { "${outer?.backdrop}" }
		val inset = ShadowPaint.of(short.byId.getValue("h3"), short, e.dpr)
		check("an inset shadow is only inset", inset?.hasInset == true && inset.hasOuter == false) { "$inset" }
		val rounded = ShadowPaint.of(short.byId.getValue("h4"), short, e.dpr)
		check("a rounded shadow has its radii and spread", rounded?.box?.radii == List(8) { 14.0 } && rounded.shadows.single().spread == 3.0) { "$rounded" }
		check("a box without box-shadow has none", ShadowPaint.of(short.byId.getValue("h5"), short, e.dpr) == null) { "" }
		val tall = e.assignments[1]
		check("the shadow follows the box into another assignment", ShadowPaint.of(tall.byId.getValue("h4"), tall, e.dpr) != rounded) { "" }
	}
	val err = try { StyleExport.decode(text.replace("\"dragonShadow.shadows\"", "\"dragonShadow.list\"").toByteArray()); null } catch (e: MarklessDecodeError) { e.message }
	check("style export refuses a box-shadow write with another key", err?.contains("dragonShadow.shadows") == true) { "error was: $err" }
}

private fun paddingBoxes() {
	val even = paddingBox(Edges(6.0, 6.0, 6.0, 6.0), List(8) { 16.0 })
	check("an even border insets the padding box and rounds it by the radius less the border", even == PaddingBox(6.0, 6.0, 6.0, 6.0, List(8) { 10.0 })) { "$even" }
	val uneven = paddingBox(Edges(2.0, 10.0, 2.0, 10.0), List(8) { 16.0 })
	check("an uneven border shapes each corner per axis", uneven.radii == listOf(6.0, 14.0, 6.0, 14.0, 6.0, 14.0, 6.0, 14.0)) { "${uneven.radii}" }
	val thick = paddingBox(Edges(4.0, 20.0, 30.0, 1.0), listOf(8.0, 8.0, 12.0, 12.0, 16.0, 16.0, 0.0, 0.0))
	check("an inner radius never goes below 0", thick.radii == listOf(7.0, 4.0, 0.0, 8.0, 0.0, 0.0, 0.0, 0.0) && thick.rounded) { "${thick.radii}" }
	val square = paddingBox(Edges(3.0, 3.0, 3.0, 3.0), null)
	check("a square box's padding box is square", !square.rounded && square.left == 3.0) { "$square" }
}

private fun textLines(fixtures: File) {
	val text = File(fixtures, "u17-borders-dashed.native-style.json").readText()
	val run = """{ "face": "sha256:ab", "size": 39.37, "glyphs": [65, 1501], "xs": [0, 26.048019409179688] }"""
	fun withLines(lines: String) = text.replace("\"text\": \"Borders\",", "\"text\": \"Borders\", \"lines\": $lines,")
	val good = withLines("""[{ "top": -0.1875, "baseline": 37.8125, "runs": [$run] }]""")
	check("the fixture gains lines", good != text) { "" }
	val decoded = runCatching { StyleExport.decode(good.toByteArray()) }
	check("decodes a text node's lines", decoded.isSuccess) { decoded.exceptionOrNull().toString() }
	decoded.getOrNull()?.let { e ->
		val lines = e.assignments[0].byId["h1:text0"]?.lines
		check("a line keeps Dragon's glyphs, xs and baseline", lines == listOf(TextLine(-0.1875, 37.8125, listOf(GlyphRun("sha256:ab", 39.37, listOf(65, 1501), listOf(0.0, 26.048019409179688)))))) { "$lines" }
		check("a text node without lines has none", e.assignments[0].byId["h2:text0"]?.lines == null) { "${e.assignments[0].byId["h2:text0"]?.lines}" }
	}
	fun refusesLines(name: String, changed: String, fragment: String) {
		val err = try { StyleExport.decode(changed.toByteArray()); null } catch (e: MarklessDecodeError) { e.message }
		check("style export refuses $name", err != null && err.contains(fragment)) { "error was: $err" }
	}
	refusesLines("lines that are not a list", withLines("{}"), "lines must be an array")
	refusesLines("a line with an unknown field", withLines("""[{ "top": 0, "baseline": 1, "runs": [], "width": 3 }]"""), "unknown field")
	refusesLines("a line without a baseline", withLines("""[{ "top": 0, "runs": [] }]"""), "baseline")
	refusesLines("a run with fewer xs than glyphs", withLines("""[{ "top": 0, "baseline": 1, "runs": [{ "face": "sha256:ab", "size": 10, "glyphs": [1, 2], "xs": [0] }] }]"""), "one x per glyph")
	refusesLines("an empty run", withLines("""[{ "top": 0, "baseline": 1, "runs": [{ "face": "sha256:ab", "size": 10, "glyphs": [], "xs": [] }] }]"""), "at least one glyph")
	refusesLines("a fractional glyph id", withLines("""[{ "top": 0, "baseline": 1, "runs": [{ "face": "sha256:ab", "size": 10, "glyphs": [1.5], "xs": [0] }] }]"""), "not a glyph id")
	refusesLines("a glyph id past 16 bits", withLines("""[{ "top": 0, "baseline": 1, "runs": [{ "face": "sha256:ab", "size": 10, "glyphs": [70000], "xs": [0] }] }]"""), "not a glyph id")
	refusesLines("a zero size", withLines("""[{ "top": 0, "baseline": 1, "runs": [{ "face": "sha256:ab", "size": 0, "glyphs": [1], "xs": [0] }] }]"""), "not a positive size")
	refusesLines("a run without a face", withLines("""[{ "top": 0, "baseline": 1, "runs": [{ "size": 10, "glyphs": [1], "xs": [0] }] }]"""), "face")
	refusesLines("lines on an element", text.replace("\"text\": null,", "\"text\": null, \"lines\": [],"), "only a framed text node has lines")
}

private fun systemFonts(fixtures: File) {
	val text = File(fixtures, "u17-borders-dashed.native-style.json").readText()
	val roboto = """{ "file": "Roboto-Regular.ttf", "index": 0, "axes": { "ital": 0, "wdth": 100, "wght": 700 }, "sha256": "9ca9" }"""
	fun withFaces(faces: String) = text.replaceFirst("\n \"fonts\": [", "\n \"systemFonts\": $faces,\n \"fonts\": [")
	val good = withFaces("""[{ "id": "system:system-ui:700", "ios": { "face": { "kind": "system", "weight": 0.4, "design": "default" } }, "android": $roboto }]""")
	check("the fixture gains system fonts", good != text) { "" }
	val decoded = runCatching { StyleExport.decode(good.toByteArray()) }
	check("decodes the system fonts", decoded.isSuccess) { decoded.exceptionOrNull().toString() }
	check("a system face keeps its file, index and axes", decoded.getOrNull()?.systemFaces == mapOf("system:system-ui:700" to SystemFace("Roboto-Regular.ttf", 0, mapOf("ital" to 0.0, "wdth" to 100.0, "wght" to 700.0)))) { "${decoded.getOrNull()?.systemFaces}" }
	check("an export without system fonts has none", StyleExport.decode(text.toByteArray()).systemFaces.isEmpty()) { "" }
	fun refuses(name: String, faces: String, fragment: String) {
		val err = try { StyleExport.decode(withFaces(faces).toByteArray()); null } catch (e: MarklessDecodeError) { e.message }
		check("style export refuses $name", err != null && err.contains(fragment)) { "error was: $err" }
	}
	refuses("system fonts that are not a list", "{}", "systemFonts must be an array")
	refuses("a system face without an Android face", """[{ "id": "system:serif:400", "ios": {} }]""", "has no android face")
	refuses("a system face id that is not one", """[{ "id": "sha256:ab", "android": $roboto }]""", "not a system face id")
	refuses("a system face listed twice", """[{ "id": "system:serif:400", "android": $roboto }, { "id": "system:serif:400", "android": $roboto }]""", "twice")
	refuses("a path for a file", """[{ "id": "system:serif:400", "android": { "file": "../etc/x.ttf", "index": 0, "axes": {}, "sha256": "a" } }]""", "not a file name")
	refuses("an unknown field", """[{ "id": "system:serif:400", "android": { "file": "a.ttf", "index": 0, "axes": {}, "sha256": "a", "weight": 4 } }]""", "unknown field")
	refuses("a fractional face index", """[{ "id": "system:serif:400", "android": { "file": "a.ttf", "index": 0.5, "axes": {}, "sha256": "a" } }]""", "not a face index")
	refuses("an axis tag that is not four letters", """[{ "id": "system:serif:400", "android": { "file": "a.ttf", "index": 0, "axes": { "weight": 4 }, "sha256": "a" } }]""", "four-letter axis tag")
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
	val widthBands = Bands(listOf(BandAtom("width", "none", listOf(BandComparison("ge", 600.0, 0.0, 0.0)))), listOf(listOf(false), listOf(true)))
	val byScheme = runCatching { widthBands.band(dark = false) }.exceptionOrNull()
	check("a width band needs the page's size", byScheme is MarklessDecodeError && byScheme.message!!.contains("needs the page's size")) { "error was: $byScheme" }
	val bySize = runCatching { widthBands.band(dark = false, widthPx = 1080.0, heightPx = 2203.0, scale = 2.625) }.exceptionOrNull()
	check("a width band needs Dragon's lookup, which the JVM test does not link", Bands.library == null && bySize is MarklessDecodeError && bySize.message!!.contains("needs Dragon's band lookup")) { "error was: $bySize" }
	refusesApp("an unknown version", text.replace("markless.native-app-style/0", "markless.native-app-style/9"), "unknown app style version")
	refusesApp("slots on a route without a plan", text.replace("\"pattern\":", "\"slots\":[{\"id\":\"slot:h0#0\",\"initial\":25}],\"pattern\":"), "has slots but no layout plan")
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

private fun overlays() {
	val payload = """{"version":"markless.native-view/0","component":"C","cells":[{"id":"open","name":"open","initial":true},{"id":"r","name":"r","initial":""}],"nodes":[{"kind":"element","id":"h0","element":"div","parent":null},{"kind":"element","id":"h1","element":"div","parent":"h0","attributes":{"overlay":""},"bindings":[{"attribute":"hidden","value":{"unary":"!","value":{"cell":"open"}}}]},{"kind":"element","id":"h2","element":"button","parent":"h0"},{"kind":"text","id":"h0:text0","parent":"h0","parts":[{"cell":"r"}]}],"events":[{"host":"h1","event":"dismiss","handler":"d"},{"host":"h2","event":"activate","handler":"a"}],"handlers":[{"id":"d","ops":[{"op":"assign","cell":"r","value":{"template":[{"event":"reason"}," ",{"event":"pressTarget"}]}},{"op":"assign","cell":"open","value":{"literal":false}},{"op":"command","node":{"focusOrigin":{"literal":"h1"}},"command":"focus"}]},{"id":"a","ops":[{"op":"assign","cell":"r","value":{"event":"target"}}]}]}"""
	val r = Runtime(Payload.decode(payload.toByteArray()))
	check("an overlay shown at mount is enlisted", r.overlays() == listOf("h1" to false) && r.focused() == null) { "${r.overlays()} ${r.focused()}" }
	val outside = r.dispatch("h2", EventName.PointerDown).joinToString(",") { it.toJson() }
	check("a press outside dismisses the topmost overlay; focus on the body moves nothing", outside == """{"op":"attribute","node":"h1","name":"hidden","value":""},{"op":"text","node":"h0:text0","value":"outside-press h2"},{"op":"overlay","node":"h1","open":false,"modal":false}""") { outside }
	check("a released overlay leaves the stack", r.overlays().isEmpty()) { "${r.overlays()}" }
	val err = runCatching { r.dispatch("h2", EventName.Activate) }.exceptionOrNull()?.message
	check("an event field the event lacks is an error", err == "the event's target read where the event has none") { "$err" }
	check("a press focuses its control", r.focused() == "h2") { "${r.focused()}" }
	refuses("focused other than true", payload.replace("{\"focusOrigin\":{\"literal\":\"h1\"}}", "{\"focused\":false}"), "focused must be true")
}

/** A page text whose current string is not the one laid out goes to the live layout as `texts`, beside no rows. */
private fun planTexts() {
	fun hex(v: Double) = "\"${java.lang.Long.toHexString(v.toRawBits()).padStart(16, '0')}\""
	val export = """{"schema":"dragon.native-style-export/1","targets":{"android":{"backend":"android-views","viewport":{"width":100,"height":100},"dpr":2,"states":[],"initial":0,"next":[[]],"assignments":[{"values":{},"nodes":[{"id":"h0","parent":null,"kind":"element","frame":{"x":0,"y":0,"width":10,"height":10},"writes":[]},{"id":"h0:text0","parent":"h0","kind":"text","text":"Home","frame":{"x":0,"y":0,"width":10,"height":10},"writes":[]}]}],"plan":{"version":"dragon.markless-plan/1"}}}}"""
	val style = StyleExport.decode(export.toByteArray())
	fun answer(height: Double): String {
		val zero = hex(0.0)
		val box = "[$zero,$zero,${hex(10.0)},${hex(height)}]"
		return """["ok",[$zero,$zero,$zero,$zero],[["h0",$box,null,null,null,null],["h0:text0",$box,null,null,null,null]]]"""
	}
	var live: String? = null
	val laid = style.laidOut(100.0, 100.0, 2.0, { answer(10.0) }, rowsLayout = { line -> live = line; answer(30.0) }, texts = mapOf("h0:text0" to "Home and the garden shed"))
	check("a changed page text goes to the live layout beside no rows", live?.endsWith(""","rows":[],"texts":[["h0:text0","Home and the garden shed"]]}""") == true) { "$live" }
	check("the live layout's boxes are the page's", laid.assignments[0].byId.getValue("h0").frame?.height == 30.0) { "${laid.assignments[0].byId.getValue("h0").frame}" }
	var replayed: String? = null
	style.laidOut(100.0, 100.0, 2.0, { line -> replayed = line; answer(10.0) }, rowsLayout = { throw AssertionError("used the live layout") }, texts = mapOf("h0:text0" to "Home"))
	check("a page text at its laid-out string keeps the recorded layout", replayed != null && "texts" !in replayed!!) { "$replayed" }
}

/** A style slot journals its new value; the plan's layout gets slot values and its moved write numbers patch the export. */
private fun styleSlots() {
	val payload = """{"version":"markless.native-view/0","component":"C","cells":[{"id":"c","name":"c","initial":1}],"slots":[{"id":"slot:x","value":{"binary":"*","left":{"cell":"c"},"right":{"literal":10}},"integer":true}],"nodes":[{"kind":"element","id":"h0","element":"div","parent":null,"style":["--x: ",{"slot":"slot:x"},"%"]},{"kind":"element","id":"h1","element":"button","parent":"h0"},{"kind":"element","id":"h2","element":"button","parent":"h0"},{"kind":"element","id":"h3","element":"button","parent":"h0"}],"events":[{"host":"h1","event":"activate","handler":"up"},{"host":"h2","event":"activate","handler":"same"},{"host":"h3","event":"activate","handler":"half"}],"handlers":[{"id":"up","ops":[{"op":"assign","cell":"c","value":{"binary":"+","left":{"cell":"c"},"right":{"literal":1}}}]},{"id":"same","ops":[{"op":"assign","cell":"c","value":{"cell":"c"}}]},{"id":"half","ops":[{"op":"assign","cell":"c","value":{"literal":0.25}}]}]}"""
	val r = Runtime(Payload.decode(payload.toByteArray()), MemoryStore())
	check("slots start at their values", r.slots() == listOf("slot:x" to 10.0)) { "${r.slots()}" }
	val up = r.dispatch("h1", EventName.Activate).joinToString(",") { it.toJson() }
	check("a slot whose value changed is journalled", up == """{"op":"slot","slot":"slot:x","value":20}""") { up }
	val same = r.dispatch("h2", EventName.Activate).joinToString(",") { it.toJson() }
	check("a slot whose value is the same is not", same == "") { same }
	val half = runCatching { r.dispatch("h3", EventName.Activate) }.exceptionOrNull()?.message
	check("an integer slot refuses a fraction", half == "style slot slot:x is 2.5, not a whole number") { "$half" }
	refuses("a style hole naming no slot", payload.replace("{\"slot\":\"slot:x\"}", "{\"slot\":\"slot:y\"}"), "unknown slot \"slot:y\"")
	refuses("a slot reading an unknown cell", payload.replace("\"left\":{\"cell\":\"c\"},\"right\":{\"literal\":10}", "\"left\":{\"cell\":\"d\"},\"right\":{\"literal\":10}"), "slot \"slot:x\" reads unknown cell \"d\"")

	fun hex(v: Double) = "\"${java.lang.Long.toHexString(v.toRawBits()).padStart(16, '0')}\""
	val export = """{"schema":"dragon.native-style-export/1","slots":[{"id":"slot:x","initial":10,"integer":true}],"targets":{"android":{"backend":"android-views","viewport":{"width":100,"height":100},"dpr":2,"states":[],"initial":0,"next":[[]],"assignments":[{"values":{},"nodes":[{"id":"h0","parent":null,"kind":"element","frame":{"x":0,"y":0,"width":10,"height":10},"writes":[{"kind":"background-color","color":{"r":1,"g":2,"b":3,"alpha":255}}]}]}],"plan":{"version":"dragon.markless-plan/1"}}}}"""
	val style = StyleExport.decode(export.toByteArray())
	check("export slots decode", style.slots.map { it.id to it.initial } == listOf("slot:x" to 10.0) && style.slots[0].integer) { "${style.slots}" }
	var given: Json? = null
	fun layout(path: String) = { line: String ->
		given = Json.parse(line).obj("line")["slots"]
		val zero = hex(0.0)
		"""["ok",[$zero,$zero,$zero,$zero],[["h0",[$zero,$zero,${hex(10.0)},${hex(10.0)}],null,null,null,null]],[["h0","background-color",$path,${hex(200.0)}]]]"""
	}
	val laid = style.laidOut(100.0, 100.0, 2.0, layout("[\"color\",\"g\"]"), listOf(20.0))
	check("the layout line carries each slot's bit pattern", given == Json.Arr(listOf(Json.Str(hex(20.0).trim('"'))))) { "$given" }
	val writes = laid.assignments[0].byId.getValue("h0").writes
	check("a moved channel patches its write", writes == listOf(StyleWrite.BackgroundColor(Rgba(1, 200, 3, 255)))) { "$writes" }
	val undecided = style.laidOut(100.0, 100.0, 2.0, { _ ->
		val zero = hex(0.0)
		"""["ok",["undecided","m3","an overflow clip on a box the page scrolls"],[["h0",[$zero,$zero,${hex(10.0)},${hex(10.0)}],null,null,null,null]],[]]"""
	}, listOf(20.0))
	check("a layout that leaves the page range undecided keeps Dragon's reason", undecided.assignments[0].pageScroll == null && undecided.pageScrollUndecided == "m3: an overflow clip on a box the page scrolls") { "${undecided.pageScrollUndecided}" }
	val bad = runCatching { style.laidOut(100.0, 100.0, 2.0, layout("[\"colour\",\"g\"]"), listOf(20.0)) }.exceptionOrNull()?.message
	check("a write path the host cannot write is refused by name", bad != null && "h0" in bad && "background-color" in bad && "[\"colour\",\"g\"]" in bad) { "$bad" }
	val count = runCatching { style.laidOut(100.0, 100.0, 2.0, layout("[\"color\",\"g\"]")) }.exceptionOrNull()?.message
	check("a layout without the slot values is refused", count != null && "1 slots" in count) { "$count" }
	val plain = StyleExport.decode(export.replace(",\"plan\":{\"version\":\"dragon.markless-plan/1\"}", "").replace("\"slots\":[{\"id\":\"slot:x\",\"initial\":10,\"integer\":true}],", "").toByteArray())
	check("an export without slots has none", plain.slots.isEmpty()) { "${plain.slots}" }
	val unplanned = runCatching { StyleExport.decode(export.replace(",\"plan\":{\"version\":\"dragon.markless-plan/1\"}", "").toByteArray()) }.exceptionOrNull()?.message
	check("an export with slots needs a plan", unplanned != null && "no layout plan" in unplanned) { "$unplanned" }
}

/** The S21 rung's app style and payload as the harness builds them (proofs/s21-styled-rows, Dragon branch cw/markless-rows). */
private fun rowStyles(fixtures: File) {
	val style = StyleExport.decodeApp(File(fixtures, "s21-styled-rows.native-app-style.json").readBytes()).getValue("/")
	val page = AppPayload.decodeOrNull(Json.parse(File(fixtures, "s21-styled-rows.payload.json").readBytes()))!!.routes.single { it.route.pattern == "/" }.page
	val runtime = Runtime(page)
	val cells = page.cells.filter { it.styled }.map { it.id }
	val branches = page.nodes.filter { it is Node.Branch && it.row == null }.map { it.id }
	val rowStates = style.rowStates(page)
	check("the export's row state is the row class", rowStates == setOf("h5#class")) { "$rowStates" }
	val start = runCatching { style.start(cells, runtime::value, false, true, branches, runtime::styleArm, rowStates) }
	check("a page with styled rows starts at the template's own row state", start.isSuccess) { start.exceptionOrNull().toString() }
	val k = start.getOrNull() ?: return
	val rows = style.shownRows(page, runtime)(k).getValue("repeat:0")
	check("each row is listed by its key", rows.map { it.key } == listOf("a", "b")) { "${rows.map { it.key }}" }
	// The template is laid out at the first value the class lists, `note pinned`: row b's.
	check("each row takes the assignment its own class reaches", rows[1].assignment == k && rows[0].assignment != k) { "${rows.map { it.assignment }} from $k" }
	check("a row's text is its own", rows[1].texts["h6:text0"] == "Call the plumber about the kitchen tap before Friday") { "${rows[1].texts}" }
}

/** The S23 rung's: each size's aria-pressed is a comparison with the picked size, so its row state lists "true" and "false". */
private fun rowPressedStyles(fixtures: File) {
	val style = StyleExport.decodeApp(File(fixtures, "s23-styled-row-pressed.native-app-style.json").readBytes()).getValue("/")
	val page = AppPayload.decodeOrNull(Json.parse(File(fixtures, "s23-styled-row-pressed.payload.json").readBytes()))!!.routes.single { it.route.pattern == "/" }.page
	val runtime = Runtime(page)
	val branches = page.nodes.filter { it is Node.Branch && it.row == null }.map { it.id }
	val start = runCatching { style.start(page.cells.filter { it.styled }.map { it.id }, runtime::value, false, true, branches, runtime::styleArm, style.rowStates(page)) }
	check("a page whose rows' aria-pressed follows a comparison starts", start.isSuccess) { start.exceptionOrNull().toString() }
	val k = start.getOrNull() ?: return
	val rows = runCatching { style.shownRows(page, runtime)(k).getValue("repeat:0") }
	check("each row's aria-pressed is a value its row state lists", rows.isSuccess) { rows.exceptionOrNull().toString() }
	// The template is laid out pressed, the first value the comparison gives: the picked Medium's row.
	check("only the picked row takes the pressed assignment", rows.getOrNull()?.map { it.assignment == k } == listOf(false, true, false)) { "${rows.getOrNull()?.map { it.key to it.assignment }} from $k" }
}

/** The S28 rung's: a z-index box in .actions in .card, both with later siblings, which Dragon paints in html's stacking order. */
private fun rehostedStacking(fixtures: File) {
	val text = File(fixtures, "s28-rehosted-stacking.native-app-style.json").readText()
	val page = StyleExport.decodeApp(text.toByteArray()).getValue("/")
	val styled = page.assignments[page.initial]
	val views = setOf("h0", "h2", "h2:text0", "h3", "h4", "h5", "h5:text0", "h6", "h6:text0", "h7", "h7:text0")
	fun place(id: String, parent: String?) = styled.byId.getValue(id).let { s -> s.writes.filterIsInstance<StyleWrite.PaintOrder>().firstOrNull()?.let { stackingParent(s, it, styled, views::contains, parent) } }
	check("a box html orders past .actions and .card, which have later siblings, is placed in the page's top box", place("h5", "h4") == "h0") { "${place("h5", "h4")}" }
	check("a box without an order stays where it is", place("h7", "h0") == null) { "" }
	val writesIndex = Json.parse(text).obj("app").field("targets", "app").obj("targets").field("android", "targets").obj("android")
	val h4 = (writesIndex.field("routes", "android").arr("routes")[0].obj("route").field("assignments", "route").arr("assignments")[0].obj("a").field("nodes", "a").arr("nodes").first { it.obj("n")["id"] == Json.Str("h4") }).obj("n").field("writes", "n").num("writes").toInt()
	val lists = writesIndex.field("writes", "android").arr("writes")
	val clipped = Json.Obj(LinkedHashMap(Json.parse(text).obj("app")).also { app ->
		val targets = LinkedHashMap(app.getValue("targets").obj("targets"))
		val android = LinkedHashMap(targets.getValue("android").obj("android"))
		android["writes"] = Json.Arr(lists.mapIndexed { i, l -> if (i == h4) Json.Arr(l.arr("w") + Json.parse("""{"kind":"padding-box-clip","key":"dragonClip.frame"}""")) else l })
		targets["android"] = Json.Obj(android)
		app["targets"] = Json.Obj(targets)
	}).text()
	val clippedPage = StyleExport.decodeApp(clipped.toByteArray()).getValue("/")
	val c = clippedPage.assignments[clippedPage.initial]
	val err = runCatching { c.byId.getValue("h5").let { s -> stackingParent(s, s.writes.filterIsInstance<StyleWrite.PaintOrder>().first(), c, views::contains, "h4") } }.exceptionOrNull()?.message
	check("a box painted past an ancestor that clips is refused by name", err == "\"h5\" paints in html's stacking order past h4, which clips or scrolls; not implemented on Android") { "$err" }
}

/** The S24 rung's: a styled select's arrow write, and the arrow geometry Dragon's plan layout gives as a 4th element. */
private fun selectArrows(fixtures: File) {
	val bytes = File(fixtures, "s24-styled-select.native-app-style.json").readBytes()
	val style = StyleExport.decodeApp(bytes).getValue("/")
	val laid = File(fixtures, "s24-styled-select.layout.json").readText()
	val select = style.assignments[0].byId.getValue("h3")
	check("decodes a select's arrow write", select.writes.filterIsInstance<StyleWrite.SelectArrow>().map { it.color } == listOf(Rgba(29, 42, 36, 255))) { "${select.writes}" }
	check("a select with appearance: none draws no arrow", !style.assignments[0].byId.getValue("h5").drawsSelectArrow) { "" }
	check("the export plans no rows for a select's options", style.planRepeats.isEmpty()) { "${style.planRepeats}" }
	val out = runCatching { style.laidOut(412.0, 870.0, 2.625, { laid }) }
	check("reads the plan layout's menulist arrows", out.isSuccess) { out.exceptionOrNull().toString() }
	out.getOrNull()?.let { e ->
		check("the select takes Dragon's arrow", e.assignments[0].byId.getValue("h3").selectArrow == SelectArrow(2.0, listOf(923.0, 55.0, 933.0, 65.0, 944.0, 55.0))) { "${e.assignments[0].byId.getValue("h3").selectArrow}" }
		check("only the select that draws one has an arrow", e.assignments[0].nodes.count { it.selectArrow != null } == 1) { "" }
	}
	val parts = (Json.parse(laid) as Json.Arr).items
	fun layoutFails(name: String, result: String, fragment: String) {
		val err = runCatching { style.laidOut(412.0, 870.0, 2.625, { result }) }.exceptionOrNull()?.message
		check(name, err != null && err.contains(fragment)) { "error was: $err" }
	}
	layoutFails("a select-arrow write with no arrow geometry names the node", Json.Arr(parts.take(3)).text(), "\"h3\" draws a drop-down arrow, but Dragon's layout gives it no arrow geometry")
	layoutFails("a 4th element other than menulist-arrows is refused", Json.Arr(parts.take(3) + Json.Arr(listOf(Json.Str("other"), Json.Arr(emptyList())))).text(), "unknown tag other")
	val root = Json.parse(bytes) as Json.Obj
	val target = (root.fields.getValue("targets") as Json.Obj).fields.getValue("android") as Json.Obj
	val route = ((target.fields.getValue("routes") as Json.Arr).items[0] as Json.Obj).fields
	route.remove("plan")
	route.remove("planNames")
	route.remove("planRepeats")
	val err = runCatching { StyleExport.decodeApp(root.text().toByteArray()) }.exceptionOrNull()?.message
	check("a select-arrow write in an export with no plan names the node", err?.contains("\"h3\" draws a drop-down arrow, whose geometry only Dragon's plan layout gives, and the export has no plan") == true) { "error was: $err" }
}

/** The S27 rung's: a themed checkbox's colours, and the marks Dragon's plan layout gives in its tagged checkbox-marks suffix. */
private fun checkboxMarks(fixtures: File) {
	val bytes = File(fixtures, "s27-styled-checkbox.native-app-style.json").readBytes()
	val style = StyleExport.decodeApp(bytes).getValue("/")
	val laid = File(fixtures, "s27-styled-checkbox.layout.json").readText()
	val box = style.assignments[0].byId.getValue("h3")
	val white = Rgba(255, 255, 255, 255)
	check("decodes a themed checkbox's colours", box.writes.filterIsInstance<StyleWrite.Checkbox>().map { it.colors } == listOf(CheckboxColors(white, Rgba(118, 118, 118, 255), white, Rgba(194, 65, 12, 255), white))) { "${box.writes}" }
	val out = runCatching { style.laidOut(412.0, 870.0, 2.625, { laid }) }
	check("reads the plan layout's checkbox marks", out.isSuccess) { out.exceptionOrNull().toString() }
	fun bits(hex: String) = java.lang.Double.longBitsToDouble(java.lang.Long.parseUnsignedLong(hex, 16))
	val expected = CheckboxMarks(0.0, bits("3ff5000000000000"), bits("404b900000000000"), false, bits("4015000000000000"), bits("3fe0cccccccccccd"), bits("3ff5000000000000"), bits("4005000000000000"),
		listOf("40260ccccccccccd", "403ce00000000000", "40360ccccccccccd", "4043f33333333333", "40460ccccccccccd", "4028accccccccccd").map(::bits), bits("4021a3d70a3d70a4"))
	out.getOrNull()?.let { e ->
		for ((k, a) in e.assignments.withIndex()) {
			check("assignment $k's checkbox takes Dragon's marks", a.byId.getValue("h3").checkboxMarks == expected) { "${a.byId.getValue("h3").checkboxMarks}" }
			check("assignment $k: only the checkbox has marks", a.nodes.count { it.checkboxMarks != null } == 1) { "" }
		}
	}
	val parts = (Json.parse(laid) as Json.Arr).items
	fun layoutFails(name: String, result: String, fragment: String) {
		val err = runCatching { style.laidOut(412.0, 870.0, 2.625, { result }) }.exceptionOrNull()?.message
		check(name, err != null && err.contains(fragment)) { "error was: $err" }
	}
	layoutFails("a checkbox write with no marks names the node", Json.Arr(parts.take(3)).text(), "\"h3\" draws a themed checkbox, but Dragon's layout gives it no marks")
	layoutFails("a tag given twice is refused", Json.Arr(parts + parts[3]).text(), "checkbox-marks is given twice")
	val suffix = (parts[3] as Json.Arr).items
	val entry = ((suffix[1] as Json.Arr).items[0] as Json.Arr).items
	val stray = Json.Arr(listOf(Json.Str("h9")) + entry.drop(1))
	layoutFails("marks for a node with no box are refused", Json.Arr(parts.take(3) + Json.Arr(listOf(suffix[0], Json.Arr((suffix[1] as Json.Arr).items + stray)))).text(), "gives checkbox marks for h9")
	val arrows = Json.Arr(listOf(Json.Str("menulist-arrows"), Json.Arr(emptyList())))
	for ((name, order) in listOf("before" to parts.take(3) + arrows + parts[3], "after" to parts + arrows)) {
		val r = runCatching { style.laidOut(412.0, 870.0, 2.625, { Json.Arr(order).text() }) }
		check("the tagged suffixes are read by tag, the arrows $name the marks", r.getOrNull()?.assignments?.get(0)?.byId?.getValue("h3")?.checkboxMarks == expected) { r.exceptionOrNull().toString() }
	}
	val root = Json.parse(bytes) as Json.Obj
	val target = (root.fields.getValue("targets") as Json.Obj).fields.getValue("android") as Json.Obj
	val route = ((target.fields.getValue("routes") as Json.Arr).items[0] as Json.Obj).fields
	route.remove("plan")
	route.remove("planNames")
	route.remove("planRepeats")
	val err = runCatching { StyleExport.decodeApp(root.text().toByteArray()) }.exceptionOrNull()?.message
	check("a checkbox write in an export with no plan names the node", err?.contains("\"h3\" draws a themed checkbox, whose marks only Dragon's plan layout gives, and the export has no plan") == true) { "error was: $err" }
}

/** A slotted page with a menulist-button select (Dragon's slots example and a select): the plan layout gives the slot writes, then the arrows, tagged and last. */
private fun slottedSelectArrows(fixtures: File) {
	val style = StyleExport.decodeApp(File(fixtures, "slotted-select.native-app-style.json").readBytes()).getValue("/")
	val laid = File(fixtures, "slotted-select.android.layout.json").readText()
	val values = style.slots.map { it.initial }
	val out = runCatching { style.laidOut(411.0, 818.0, 2.625, { laid }, values) }
	check("a slotted layout with arrows decodes", out.isSuccess) { out.exceptionOrNull().toString() }
	out.getOrNull()?.let { e ->
		check("the slotted page's select takes its arrow", e.assignments[0].byId.getValue("h20").selectArrow == SelectArrow(2.0, listOf(1004.0, 34.0, 1014.0, 44.0, 1025.0, 34.0))) { "${e.assignments[0].byId.getValue("h20").selectArrow}" }
		check("the slot writes still patch their writes", e.assignments[0].byId.getValue("h8").writes.filterIsInstance<StyleWrite.BackgroundColor>().single().color.r == 200) { "${e.assignments[0].byId.getValue("h8").writes}" }
	}
	val parts = (Json.parse(laid) as Json.Arr).items
	fun fails(name: String, result: List<Json>, fragment: String) {
		val err = runCatching { style.laidOut(411.0, 818.0, 2.625, { Json.Arr(result).text() }, values) }.exceptionOrNull()?.message
		check(name, err != null && fragment in err) { "error was: $err" }
	}
	fails("a slotted layout's arrows must be tagged", parts.take(4) + Json.Arr(listOf(Json.Str("other"), Json.Arr(emptyList()))), "unknown tag other")
	fails("a slotted layout without its slot writes is refused", parts.take(3) + parts[4], "plan layout")
	fails("a slotted layout with no arrows leaves its select without one", parts.take(4), "\"h20\" draws a drop-down arrow, but Dragon's layout gives it no arrow geometry")
}

fun main(args: Array<String>) {
	routes()
	arrays()
	attributeRule()
	ops()
	overlays()
	jsOps()
	numberFormatting()
	styleExport(File(System.getProperty("markless.fixtures") ?: error("set -Dmarkless.fixtures")))
	appStyle(File(System.getProperty("markless.fixtures") ?: error("set -Dmarkless.fixtures")))
	appCanvas(File(System.getProperty("markless.fixtures") ?: error("set -Dmarkless.fixtures")))
	dashedBorders(File(System.getProperty("markless.fixtures") ?: error("set -Dmarkless.fixtures")))
	boxShadows(File(System.getProperty("markless.fixtures") ?: error("set -Dmarkless.fixtures")))
	paddingBoxes()
	textLines(File(System.getProperty("markless.fixtures") ?: error("set -Dmarkless.fixtures")))
	systemFonts(File(System.getProperty("markless.fixtures") ?: error("set -Dmarkless.fixtures")))
	sheetStyles(File(System.getProperty("markless.fixtures") ?: error("set -Dmarkless.fixtures")))
	rowStyles(File(System.getProperty("markless.fixtures") ?: error("set -Dmarkless.fixtures")))
	rowPressedStyles(File(System.getProperty("markless.fixtures") ?: error("set -Dmarkless.fixtures")))
	selectArrows(File(System.getProperty("markless.fixtures") ?: error("set -Dmarkless.fixtures")))
	slottedSelectArrows(File(System.getProperty("markless.fixtures") ?: error("set -Dmarkless.fixtures")))
	checkboxMarks(File(System.getProperty("markless.fixtures") ?: error("set -Dmarkless.fixtures")))
	decoderStrictness()
	styleSlots()
	rehostedStacking(File(System.getProperty("markless.fixtures") ?: error("set -Dmarkless.fixtures")))
	planTexts()
	val dirs = args.map(::File)
	for (d in dirs) if (File(d, "scroll").isDirectory) scrollVectors(d)
	val files = dirs.flatMap { d -> d.listFiles { f -> f.name.endsWith(".json") }?.sortedBy { it.name } ?: error("no vector directory $d") }
	if (files.isEmpty()) { println("FAIL no conformance vectors in ${args.joinToString()}"); failures++ }
	for (f in files) try { runVector(f) } catch (e: Exception) { failures++; println("FAIL ${f.name}: $e") }
	println("$passes passed, $failures failed")
	exitProcess(if (failures == 0) 0 else 1)
}
