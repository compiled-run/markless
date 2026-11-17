package dev.markless.mobile.view

import android.content.Context
import android.widget.TextView
import dev.markless.mobile.core.Json
import dev.markless.mobile.core.JournalEntry
import dev.markless.mobile.core.Node
import dev.markless.mobile.core.arr
import dev.markless.mobile.core.field
import dev.markless.mobile.core.jsonString
import dev.markless.mobile.core.obj
import dev.markless.mobile.core.str

/** Runs one `markless.native-conformance/0` vector through real views: clicks each action's view and reads the TextViews back. */
object DeviceConformance {
	fun run(context: Context, vectorBytes: ByteArray): List<String> {
		val vector = Json.parse(vectorBytes).obj("vector")
		val payloadJson = vector.field("payload", "vector")
		val host = MarklessHost(context, canonical(payloadJson).toByteArray())
		val failures = ArrayList<String>()
		val texts = host.payload.nodes.filterIsInstance<Node.Text>()
		fun shown(id: String): String = (host.view(id) as TextView).text.toString()
		val mounted = texts.joinToString(",", "[", "]") { "[${jsonString(it.id)},${jsonString(shown(it.id))}]" }
		val initial = canonical(vector.field("initial", "vector"))
		if (mounted != initial) failures.add("initial: views show $mounted, expected $initial")
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
			for (e in journal) if (shown(e.node) != e.value) failures.add("steps[$n]: ${e.node} shows \"${shown(e.node)}\" after its journal entry \"${e.value}\"")
		}
		return failures
	}

	private fun canonical(j: Json): String = when (j) {
		is Json.Obj -> j.fields.entries.joinToString(",", "{", "}") { "${jsonString(it.key)}:${canonical(it.value)}" }
		is Json.Arr -> j.items.joinToString(",", "[", "]") { canonical(it) }
		is Json.Str -> jsonString(j.value)
		is Json.Num -> dev.markless.mobile.core.JsString.number(j.value)
		is Json.Bool -> j.value.toString()
		Json.Null -> "null"
	}
}
