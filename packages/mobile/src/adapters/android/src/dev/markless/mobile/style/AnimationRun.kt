package dev.markless.mobile.style

import dev.markless.mobile.core.EventName
import dev.markless.mobile.core.Json
import dev.markless.mobile.core.MarklessDecodeError
import dev.markless.mobile.core.arr
import dev.markless.mobile.core.jsonNumber
import dev.markless.mobile.core.str
import dev.markless.mobile.core.text

/** One CSS animation event a run of Dragon's animator gives, by the export's node id. */
data class AnimationEvent(val event: EventName, val node: String, val name: String, val elapsedTime: Double)

/**
 * A page's transitions and animations, run by Dragon's animator (`runMarklessAnimation`) from the assignment at mount through
 * every style change and frame since; each run answers the events not yet given and whether the animator still runs.
 */
class AnimationRun(private val style: StyleExport, private val initial: Int, private val run: (String) -> String) {
	private val steps = ArrayList<String>()
	private var given = 0
	private var assignment = initial

	/** The style program moved to [to]: one style change event. */
	fun moved(to: Int) {
		if (to == assignment) return
		assignment = to
		steps.add("[\"event\",$to]")
	}

	/** Time passed. */
	fun advanced(ms: Double) {
		if (ms > 0) steps.add("[\"advance\",${jsonNumber(ms)}]")
	}

	/** Runs the animator over every step so far: the events it has not given yet, and whether it still runs. */
	fun next(dpr: Double, width: Double, height: Double): Pair<List<AnimationEvent>, Boolean> {
		val plan = style.plan ?: return emptyList<AnimationEvent>() to false
		val anim = style.anim ?: return emptyList<AnimationEvent>() to false
		val line = "{\"dpr\":${jsonNumber(dpr)},\"viewport\":{\"width\":${jsonNumber(width)},\"height\":${jsonNumber(height)}},\"plan\":${plan.text},\"anim\":$anim,\"initial\":$initial,\"steps\":[${steps.joinToString(",")}]}"
		val result = Json.parse(run(line))
		val answer = result.arr("animation")
		if (answer.size != 6 || answer[0] != Json.Str("ok")) throw MarklessDecodeError("Dragon's animator failed: ${result.text().take(300)}")
		val all = answer[1].arr("animation events")
		val names = style.planNames.getOrNull(assignment) ?: emptyMap()
		val events = all.drop(given).map { e ->
			val f = e.arr("animation event")
			if (f.size != 5) throw MarklessDecodeError("animation event: expected [step, type, node, name, elapsedTime]")
			val type = f[1].str("animation event type")
			val event = EventName.entries.firstOrNull { it.wire == type } ?: throw MarklessDecodeError("animation event: unknown type $type")
			val dragon = f[2].str("animation event node")
			AnimationEvent(event, names[dragon] ?: dragon, f[3].str("animation event name"), StyleExport.planNumber(f[4]))
		}
		given = all.size
		val busy = answer[5] as? Json.Bool ?: throw MarklessDecodeError("animation: expected whether the animator runs")
		return events to busy.value
	}
}
