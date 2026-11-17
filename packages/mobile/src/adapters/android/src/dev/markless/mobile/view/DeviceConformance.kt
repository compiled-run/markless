package dev.markless.mobile.view

import android.content.Context
import dev.markless.mobile.core.Json
import dev.markless.mobile.core.JournalEntry
import dev.markless.mobile.core.JsString
import dev.markless.mobile.core.Node
import dev.markless.mobile.core.arr
import dev.markless.mobile.core.field
import dev.markless.mobile.core.jsonString
import dev.markless.mobile.core.obj
import dev.markless.mobile.core.str

/** Runs one `markless.native-conformance/0` vector through real views: clicks each action's view and reads the views back. */
object DeviceConformance {
	fun run(context: Context, vectorBytes: ByteArray): List<String> {
		val vector = Json.parse(vectorBytes).obj("vector")
		val host = MarklessHost(context, canonical(vector.field("payload", "vector")).toByteArray(), store = dev.markless.mobile.core.MemoryStore())
		val failures = ArrayList<String>()
		fun shownTexts(): String = host.payload.nodes.filter { it is Node.Text && host.hasView(it.id) }.joinToString(",", "[", "]") { "[${jsonString(it.id)},${jsonString(host.textView(it.id).text.toString())}]" }
		val initial = canonical(vector.field("initial", "vector"))
		if (shownTexts() != initial) failures.add("initial: views show ${shownTexts()}, expected $initial")
		for (item in vector["initialAttributes"]?.arr("initialAttributes").orEmpty()) {
			val (node, name, value) = item.arr("initialAttributes[]")
			mismatch(host, node.str("node"), name.str("name"), (value as? Json.Str)?.value)?.let { failures.add("initial: $it") }
		}
		val journal = ArrayList<JournalEntry>()
		host.onJournal = { journal.addAll(it) }
		for ((n, step) in vector.field("steps", "vector").arr("steps").withIndex()) {
			val s = step.obj("steps[$n]")
			val action = s.field("action", "step").obj("action")
			if (action.field("event", "action").str("event") != "activate") throw MarklessHostError("steps[$n] has an action this check cannot perform")
			journal.clear()
			if (!host.view(action.field("host", "action").str("host")).performClick()) failures.add("steps[$n]: the view took no click")
			val actual = journal.joinToString(",", "[", "]") { it.toJson() }
			val expected = canonical(s.field("journal", "step"))
			if (actual != expected) failures.add("steps[$n]: journal $actual, expected $expected")
			for (e in journal) if (e is JournalEntry.Attribute) mismatch(host, e.node, e.name, e.value)?.let { failures.add("steps[$n]: $it") }
			val runtimeTexts = host.runtime.texts().joinToString(",", "[", "]") { (id, t) -> "[${jsonString(id)},${jsonString(t)}]" }
			if (shownTexts() != runtimeTexts) failures.add("steps[$n]: views show ${shownTexts()}, the runtime shows $runtimeTexts")
			for (node in host.payload.nodes) if (node !is Node.Branch && host.hasView(node.id) != host.runtime.isShown(node)) failures.add("steps[$n]: \"${node.id}\" ${if (host.hasView(node.id)) "has a view but is hidden" else "is shown but has no view"}")
		}
		return failures
	}

	/** What the view shows for a bound attribute that has an Android meaning, if it disagrees with [value]. */
	private fun mismatch(host: MarklessHost, node: String, name: String, value: String?): String? {
		val view = host.view(node)
		return when (name) {
			"aria-label" -> if (view.contentDescription?.toString() != value) "$node contentDescription is ${view.contentDescription}, expected $value" else null
			"disabled" -> if (view.isEnabled != (value == null)) "$node isEnabled is ${view.isEnabled} with disabled=$value" else null
			"aria-pressed", "aria-selected" -> if (view.isSelected != (value == "true")) "$node isSelected is ${view.isSelected} with $name=$value" else null
			else -> null
		}
	}

	private fun canonical(j: Json): String = when (j) {
		is Json.Obj -> j.fields.entries.joinToString(",", "{", "}") { "${jsonString(it.key)}:${canonical(it.value)}" }
		is Json.Arr -> j.items.joinToString(",", "[", "]") { canonical(it) }
		is Json.Str -> jsonString(j.value)
		is Json.Num -> JsString.number(j.value)
		is Json.Bool -> j.value.toString()
		Json.Null -> "null"
	}
}
