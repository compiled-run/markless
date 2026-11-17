package dev.markless.mobile.style

import dev.markless.mobile.core.Json
import dev.markless.mobile.core.MarklessDecodeError
import dev.markless.mobile.core.Js
import dev.markless.mobile.core.Scalar
import dev.markless.mobile.core.arr
import dev.markless.mobile.core.field
import dev.markless.mobile.core.num
import dev.markless.mobile.core.obj
import dev.markless.mobile.core.str

const val STYLE_EXPORT_SCHEMA_0 = "dragon.native-style-export/0"
const val STYLE_EXPORT_SCHEMA = "dragon.native-style-export/1"

data class Rgba(val r: Int, val g: Int, val b: Int, val alpha: Int) {
	val argb: Int get() = (alpha shl 24) or (r shl 16) or (g shl 8) or b
}

data class Frame(val x: Double, val y: Double, val width: Double, val height: Double)

data class Edges(val top: Double, val right: Double, val bottom: Double, val left: Double)

sealed interface StyleWrite {
	data class BackgroundColor(val color: Rgba) : StyleWrite
	data object BorderWidths : StyleWrite
	data class BorderStyles(val styles: List<String>) : StyleWrite
	data class BorderColors(val colors: List<Rgba>) : StyleWrite
	/** Eight lengths, x then y radius for top-left, top-right, bottom-right, bottom-left, in CSS px. */
	data class BorderRadius(val radii: List<Double>) : StyleWrite
	/** [size] in CSS px. */
	data class Font(val family: String, val size: Double) : StyleWrite
	data class TextColor(val color: Rgba) : StyleWrite
}

data class StyledNode(val id: String, val parent: String?, val kind: String, val frame: Frame?, val borderWidths: Edges?, val writes: List<StyleWrite>)

/** One reachable combination of style states: every node's frame and writes, complete. */
data class Assignment(val values: Map<String, Scalar>, val nodes: List<StyledNode>) {
	val byId: Map<String, StyledNode> = nodes.associateBy { it.id }
}

data class StyleState(val key: String, val domain: List<Scalar>)

/**
 * One platform's slice of a Dragon style export: per state assignment, frames (device px, relative to the parent box) and
 * lowered writes per node id; [next] is `next[a][s][v]`, the assignment reached by setting state s to its v-th value (-1: none).
 */
data class StyleExport(val dpr: Double, val viewportWidth: Double, val viewportHeight: Double, val states: List<StyleState>, val initial: Int, val assignments: List<Assignment>, val next: List<List<List<Int>>>) {

	/** The export state for a payload cell: its key is the cell id, or ends in `#<cell id>`. */
	fun stateFor(cell: String): Int {
		val matches = states.withIndex().filter { (_, st) -> st.key == cell || st.key.endsWith("#$cell") }
		if (matches.size != 1) throw MarklessDecodeError("style export has ${matches.size} states for cell \"$cell\" (keys ${states.map { it.key }})")
		return matches[0].index
	}

	/** The assignment reached from [current] when state [state] takes [value]; an unreachable or unknown value is an error. */
	fun next(current: Int, state: Int, value: Scalar): Int {
		val v = states[state].domain.indexOfFirst { Js.strictEquals(it, value) }
		if (v < 0) throw MarklessDecodeError("style state \"${states[state].key}\" has no value $value in its domain")
		val to = next[current][state][v]
		if (to < 0) throw MarklessDecodeError("style state \"${states[state].key}\" = $value is unreachable from assignment $current")
		return to
	}

	companion object {
		const val ANDROID_BACKEND = "android-views"

		fun decode(bytes: ByteArray, target: String = "android"): StyleExport {
			val root = Json.parse(bytes).obj("style export")
			val schema = root.field("schema", "style export").str("schema")
			if (schema != STYLE_EXPORT_SCHEMA && schema != STYLE_EXPORT_SCHEMA_0) throw MarklessDecodeError("unknown style export schema \"$schema\" (this host reads $STYLE_EXPORT_SCHEMA_0 and $STYLE_EXPORT_SCHEMA)")
			val t = root.field("targets", "style export").obj("targets").field(target, "targets").obj("targets.$target")
			val backend = t.field("backend", target).str("backend")
			if (backend != ANDROID_BACKEND) throw MarklessDecodeError("style export backend is \"$backend\", not $ANDROID_BACKEND")
			val viewport = t.field("viewport", target).obj("viewport")
			val dpr = t.field("dpr", target).num("dpr")
			val width = viewport.field("width", "viewport").num("width")
			val height = viewport.field("height", "viewport").num("height")
			if (schema == STYLE_EXPORT_SCHEMA_0) {
				val nodes = t.field("nodes", target).arr("nodes").mapIndexed { n, v -> node(v, "nodes[$n]") }
				return StyleExport(dpr, width, height, emptyList(), 0, listOf(Assignment(emptyMap(), nodes)), listOf(emptyList()))
			}
			val states = t.field("states", target).arr("states").mapIndexed { n, v ->
				val o = v.obj("states[$n]")
				StyleState(o.field("key", "states[$n]").str("key"), o.field("domain", "states[$n]").arr("domain").map { scalar(it, "states[$n].domain[]") })
			}
			val assignments = t.field("assignments", target).arr("assignments").mapIndexed { a, v ->
				val o = v.obj("assignments[$a]")
				val values = o.field("values", "assignments[$a]").obj("values").mapValues { (k, x) -> scalar(x, "assignments[$a].values.$k") }
				Assignment(values, o.field("nodes", "assignments[$a]").arr("nodes").mapIndexed { n, x -> node(x, "assignments[$a].nodes[$n]") })
			}
			val initial = t.field("initial", target).num("initial").toInt()
			val next = t.field("next", target).arr("next").map { row -> row.arr("next[]").map { col -> col.arr("next[][]").map { it.num("next[][][]").toInt() } } }
			if (initial !in assignments.indices) throw MarklessDecodeError("style export initial $initial names no assignment")
			if (next.size != assignments.size || next.any { r -> r.size != states.size || r.withIndex().any { (si, c) -> c.size != states[si].domain.size || c.any { it != -1 && it !in assignments.indices } } }) throw MarklessDecodeError("style export next table does not match its assignments and states")
			return StyleExport(dpr, width, height, states, initial, assignments, next)
		}

		private fun node(v: Json, what: String): StyledNode {
			val o = v.obj(what)
			val id = o.field("id", what).str("$what.id")
			val parent = o.field("parent", what).let { if (it == Json.Null) null else it.str("$what.parent") }
			val frame = o.field("frame", what).takeIf { it != Json.Null }?.obj("$what.frame")?.let { f -> Frame(f.field("x", what).num("x"), f.field("y", what).num("y"), f.field("width", what).num("width"), f.field("height", what).num("height")) }
			val kind = o.field("kind", what).str("$what.kind")
			if (kind !in setOf("element", "text", "anonymous")) throw MarklessDecodeError("$what has unknown node kind \"$kind\"")
			val bw = o["borderWidths"]?.takeIf { it != Json.Null }?.obj("$what.borderWidths")?.let { Edges(it.field("top", what).num("top"), it.field("right", what).num("right"), it.field("bottom", what).num("bottom"), it.field("left", what).num("left")) }
			val writes = o.field("writes", what).arr("$what.writes").mapIndexed { n, w -> write(w, "$id writes[$n]") }
			return StyledNode(id, parent, kind, frame, bw, writes)
		}

		private fun scalar(v: Json, what: String): Scalar = when (v) {
			is Json.Bool -> Scalar.Bool(v.value)
			is Json.Num -> Scalar.Num(v.value)
			is Json.Str -> Scalar.Str(v.value)
			Json.Null -> Scalar.Null
			else -> throw MarklessDecodeError("$what is not a scalar")
		}

		private fun color(v: Json, what: String): Rgba {
			val c = v.obj(what)
			fun channel(k: String): Int {
				val x = c.field(k, what).num("$what.$k")
				if (x != Math.floor(x) || x < 0 || x > 255) throw MarklessDecodeError("$what.$k is $x, not a byte")
				return x.toInt()
			}
			return Rgba(channel("r"), channel("g"), channel("b"), channel("alpha"))
		}

		private fun write(v: Json, what: String): StyleWrite {
			val o = v.obj(what)
			return when (val kind = o.field("kind", what).str("$what.kind")) {
				"background-color" -> StyleWrite.BackgroundColor(color(o.field("color", what), "$what.color"))
				"border-widths" -> StyleWrite.BorderWidths
				"border-styles" -> StyleWrite.BorderStyles(o.field("styles", what).arr("styles").map { it.str("$what.styles[]") })
				"border-colors" -> StyleWrite.BorderColors(o.field("colors", what).arr("colors").map { color(it, "$what.colors[]") })
				"border-radius" -> StyleWrite.BorderRadius(o.field("lengths", what).arr("lengths").map {
					val l = it.obj("$what.lengths[]")
					if (l.field("percent", what) != Json.Bool(false)) throw MarklessDecodeError("$what: percentage corner radii are not implemented on Android")
					l.field("value", what).num("value")
				}.also { if (it.size != 8) throw MarklessDecodeError("$what has ${it.size} radius lengths, not 8") })
				"font" -> {
					val f = o.field("font", what).obj("$what.font")
					StyleWrite.Font(f.field("family", what).str("family"), f.field("size", what).num("size"))
				}
				"text-color" -> StyleWrite.TextColor(color(o.field("color", what), "$what.color"))
				else -> throw MarklessDecodeError("$what has unknown style write kind \"$kind\"")
			}
		}
	}
}
