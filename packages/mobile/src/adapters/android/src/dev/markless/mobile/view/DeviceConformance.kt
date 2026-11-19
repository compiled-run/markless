package dev.markless.mobile.view

import android.content.Context
import android.view.inputmethod.EditorInfo
import android.widget.EditText
import dev.markless.mobile.core.Json
import dev.markless.mobile.core.JournalEntry
import dev.markless.mobile.core.JsString
import dev.markless.mobile.core.Node
import dev.markless.mobile.core.Payload
import dev.markless.mobile.core.arr
import dev.markless.mobile.core.field
import dev.markless.mobile.core.jsonString
import dev.markless.mobile.core.obj
import dev.markless.mobile.core.str

/** Runs one `markless.native-conformance/0` vector through real views: clicks each action's view and reads the views back. */
object DeviceConformance {
	fun run(context: Context, vectorBytes: ByteArray): List<String> {
		val vector = Json.parse(vectorBytes).obj("vector")
		val fixed = (vector["now"] as? Json.Num)?.value
		val payload = Payload.decode(canonical(vector.field("payload", "vector")).toByteArray())
		val params = vector["params"]?.obj("params")?.mapValues { (k, v) -> v.str("params.$k") } ?: emptyMap()
		val languages = vector["preferredLanguages"]?.arr("preferredLanguages")?.map { it.str("preferredLanguages[]") } ?: listOf("en")
		val host = if (fixed == null) MarklessHost(context, payload, null, store = dev.markless.mobile.core.MemoryStore(), params = params, preferredLanguages = languages)
			else MarklessHost(context, payload, null, store = dev.markless.mobile.core.MemoryStore(), params = params, preferredLanguages = languages, now = { fixed })
		val failures = ArrayList<String>()
		fun shownTexts(): String = host.runtime.texts().joinToString(",", "[", "]") { (id, _) -> "[${jsonString(id)},${jsonString(if (host.hasView(id)) host.shownText(id) else "<no view>")}]" }
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
		for (node in host.payload.nodes) {
			val live = (node as? Node.Element)?.live ?: continue
			val wanted = if (live.assertive) android.view.View.ACCESSIBILITY_LIVE_REGION_ASSERTIVE else android.view.View.ACCESSIBILITY_LIVE_REGION_POLITE
			for (inst in host.runtime.instances(node)) if (host.view(inst.id).accessibilityLiveRegion != wanted) failures.add("initial: ${inst.id} is not ${if (live.assertive) "an assertive" else "a polite"} live region")
		}
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
		fun checks(where: String) {
			for ((node, checked) in host.runtime.checks()) {
				val box = host.view(node) as? android.widget.CompoundButton ?: continue
				if (box.isChecked != checked) failures.add("$where: $node shows checked=${box.isChecked}, the runtime holds $checked")
			}
		}
		checks("initial")
		val journal = ArrayList<JournalEntry>()
		host.onJournal = { journal.addAll(it) }
		host.onNavigate = { }
		// Timers fire when a step says so, not on the clock.
		host.scheduleTimer = { _, _ -> }
		for ((n, step) in vector.field("steps", "vector").arr("steps").withIndex()) {
			val s = step.obj("steps[$n]")
			val action = s.field("action", "step").obj("action")
			val target by lazy { host.view(action.field("host", "action").str("host")) }
			journal.clear()
			when (val event = action.field("event", "action").str("event")) {
				"activate" -> if (!target.performClick()) failures.add("steps[$n]: the view took no click")
				"cancel" -> host.apply(host.runtime.dispatch(action.field("host", "action").str("host"), dev.markless.mobile.core.EventName.Cancel))
				"input" -> (target as? EditText ?: throw MarklessHostError("steps[$n] types into a view that is not an input")).setText(action.field("value", "action").str("value"))
				"dismiss" -> host.closedByPlatform(action.field("host", "action").str("host"))
				"enter" -> (target as? EditText ?: throw MarklessHostError("steps[$n] presses return in a view that is not an input")).onEditorAction(EditorInfo.IME_ACTION_GO)
				"timer" -> host.apply(host.runtime.timer(action.field("timer", "action").str("timer")))
				"focus" -> if (!target.requestFocus()) failures.add("steps[$n]: the field took no focus")
				"blur" -> target.clearFocus()
				"idle" -> host.apply(host.runtime.dispatch(action.field("host", "action").str("host"), dev.markless.mobile.core.EventName.Idle))
				"visible" -> host.apply(host.runtime.dispatch(action.field("host", "action").str("host"), dev.markless.mobile.core.EventName.Visible))
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
			if (journal.none { it is JournalEntry.Navigate }) { structure("steps[$n]"); checks("steps[$n]") }
		}
		host.dismissMessage()
		return failures
	}

	/** What the view shows for a bound attribute that has an Android meaning, if it disagrees with [value]. */
	private fun mismatch(host: MarklessHost, node: String, name: String, value: String?): String? {
		val view = host.view(node)
		return when (name) {
			"aria-label" -> if (view.contentDescription?.toString() != value) "$node contentDescription is ${view.contentDescription}, expected $value" else null
			"disabled" -> if (view.isEnabled != (value == null)) "$node isEnabled is ${view.isEnabled} with disabled=$value" else null
			"aria-pressed", "aria-selected" -> if (view.isSelected != (value == "true")) "$node isSelected is ${view.isSelected} with $name=$value" else null
			"aria-disabled" -> view.createAccessibilityNodeInfo().isEnabled.let { if (view.isEnabled && it == (value == "true")) "$node reads enabled=$it to accessibility with aria-disabled=$value" else null }
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
