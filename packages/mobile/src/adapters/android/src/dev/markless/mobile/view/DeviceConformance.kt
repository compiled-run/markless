package dev.markless.mobile.view

import android.content.Context
import android.widget.EditText
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
		val host = MarklessHost(context, canonical(vector.field("payload", "vector")).toByteArray(), store = dev.markless.mobile.core.MemoryStore(), params = vector["params"]?.obj("params")?.mapValues { (k, v) -> v.str("params.$k") } ?: emptyMap())
		val failures = ArrayList<String>()
		fun shownTexts(): String = host.runtime.texts().joinToString(",", "[", "]") { (id, _) -> "[${jsonString(id)},${jsonString(if (host.hasView(id)) host.textView(id).text.toString() else "<no view>")}]" }
		fun structure(where: String) {
			val wanted = host.payload.nodes.filter { it is Node.Element || it is Node.Text }.flatMap(host.runtime::instances).mapTo(HashSet()) { it.id }
			if (host.viewIds() != wanted) failures.add("$where: views exist for ${(host.viewIds() - wanted).sorted()} and are missing for ${(wanted - host.viewIds()).sorted()}")
			for ((repeat, keys) in host.runtime.rows()) {
				val r = host.runtime.node(repeat)
				val top = host.payload.nodes.first { it.row == repeat && it.parent == r.parent }
				val parent = host.view(r.parent ?: continue) as android.view.ViewGroup
				val at = keys.map { k -> parent.indexOfChild(host.view("${top.id}@$k")) }
				if (at != at.sorted() || at.any { it < 0 }) failures.add("$where: rows of $repeat sit at child indexes $at for keys $keys")
			}
		}
		structure("initial")
		val initial = canonical(vector.field("initial", "vector"))
		if (shownTexts() != initial) failures.add("initial: views show ${shownTexts()}, expected $initial")
		for (item in vector["initialAttributes"]?.arr("initialAttributes").orEmpty()) {
			val (node, name, value) = item.arr("initialAttributes[]")
			mismatch(host, node.str("node"), name.str("name"), (value as? Json.Str)?.value)?.let { failures.add("initial: $it") }
		}
		for (item in vector["initialProperties"]?.arr("initialProperties").orEmpty()) {
			val (node, _, value) = item.arr("initialProperties[]")
			val shown = (host.view(node.str("node")) as EditText).text.toString()
			if (shown != value.str("value")) failures.add("initial: ${node.str("node")} field shows \"$shown\", expected \"${value.str("value")}\"")
		}
		val journal = ArrayList<JournalEntry>()
		host.onJournal = { journal.addAll(it) }
		host.onNavigate = { _, _ -> }
		for ((n, step) in vector.field("steps", "vector").arr("steps").withIndex()) {
			val s = step.obj("steps[$n]")
			val action = s.field("action", "step").obj("action")
			val target = host.view(action.field("host", "action").str("host"))
			journal.clear()
			when (val event = action.field("event", "action").str("event")) {
				"activate" -> if (!target.performClick()) failures.add("steps[$n]: the view took no click")
				"cancel" -> host.apply(host.runtime.dispatch(action.field("host", "action").str("host"), dev.markless.mobile.core.EventName.Cancel))
				"input" -> (target as? EditText ?: throw MarklessHostError("steps[$n] types into a view that is not an input")).setText(action.field("value", "action").str("value"))
				else -> throw MarklessHostError("steps[$n] has an action this check cannot perform: $event")
			}
			val actual = journal.joinToString(",", "[", "]") { it.toJson() }
			val expected = canonical(s.field("journal", "step"))
			if (actual != expected) failures.add("steps[$n]: journal $actual, expected $expected")
			for (e in journal) if (e is JournalEntry.Attribute) mismatch(host, e.node, e.name, e.value)?.let { failures.add("steps[$n]: $it") }
			for ((node, _, value) in host.runtime.properties()) {
				val shown = (host.view(node) as EditText).text.toString()
				if (shown != value) failures.add("steps[$n]: $node field shows \"$shown\", the runtime holds \"$value\"")
			}
			val runtimeTexts = host.runtime.texts().joinToString(",", "[", "]") { (id, t) -> "[${jsonString(id)},${jsonString(t)}]" }
			if (shownTexts() != runtimeTexts) failures.add("steps[$n]: views show ${shownTexts()}, the runtime shows $runtimeTexts")
			if (journal.none { it is JournalEntry.Navigate }) structure("steps[$n]")
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
