package dev.markless.mobile.style

import dev.markless.mobile.core.Json
import dev.markless.mobile.core.MarklessDecodeError
import dev.markless.mobile.core.Js
import dev.markless.mobile.core.JsValue
import dev.markless.mobile.core.arr
import dev.markless.mobile.core.field
import dev.markless.mobile.core.num
import dev.markless.mobile.core.obj
import dev.markless.mobile.core.only
import dev.markless.mobile.core.ScrollRange
import dev.markless.mobile.core.str
import dev.markless.mobile.core.jsonNumber
import dev.markless.mobile.core.jsonString
import dev.markless.mobile.core.text

const val STYLE_EXPORT_SCHEMA_0 = "dragon.native-style-export/0"
const val STYLE_EXPORT_SCHEMA = "dragon.native-style-export/1"
const val APP_STYLE_VERSION = "markless.native-app-style/0"
const val PLAN_VERSION = "dragon.markless-plan/1"

/** The export state that holds the @media band; the host sets it from the device, never from a payload cell. */
const val BAND_KEY = "@env#band"

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
	/** `overflow-x` / `overflow-y` `auto` or `scroll`: the box hosts its children in a scroll view over its padding box. */
	data class ScrollContainer(val x: Boolean, val y: Boolean) : StyleWrite
	/** `scrollbar-width: none`. */
	data object ScrollIndicatorsHidden : StyleWrite
	/** Children clipped to the padding box (`overflow` other than visible); a scroll container's scroll view is that clip. */
	data object PaddingBoxClip : StyleWrite
	/** `overscroll-behavior: none` on an axis; Android draws no bounce, so it is read and kept only. */
	data class ScrollBounce(val x: Boolean, val y: Boolean) : StyleWrite
	/** clip-path: inset(): top, right, bottom, left, each in CSS px or (percent) of the border box's width or height. */
	data class ClipPathInset(val edges: List<Pair<Double, Boolean>>) : StyleWrite
	/** The text a clip-path leaves exposed to the screen reader; a canvas clip does not change accessibility, so nothing to apply. */
	data object ClipText : StyleWrite
	/** The box paints in another stacking context's order (Dragon's re-hosting); [host] is that context's node. */
	data class PaintOrder(val host: String, val bucket: Int, val rank: Int) : StyleWrite
}

/** One drawing operation of a dashed or dotted border, in device px; [side] names the side whose colour it takes (-1: none). */
data class BorderOp(val op: String, val side: Int, val alpha: Double, val antialias: Boolean, val points: List<Double>)

/** A dashed or dotted border as Dragon's own native paint draws it, the snapped border box at the origin (relative to the node's frame). */
data class BorderOps(val originX: Double, val originY: Double, val ops: List<BorderOp>)

/** Consecutive glyphs of a text line in one face at one instance size in device px; [xs] are pen origins in device px from the node's frame. */
data class GlyphRun(val face: String, val size: Double, val glyphs: List<Int>, val xs: List<Double>)

/** One line of a text node as Dragon shaped and placed it; [top] and [baseline] in device px from the node's frame. */
data class TextLine(val top: Double, val baseline: Double, val runs: List<GlyphRun>)

/** [scrollRange], device px, only on a scroll container; [lines], only on a framed text node, the glyphs Dragon draws for its [text]. */
data class StyledNode(val id: String, val parent: String?, val kind: String, val frame: Frame?, val borderWidths: Edges?, val writes: List<StyleWrite>, val scrollRange: ScrollRange? = null, val borderOps: BorderOps? = null, val lines: List<TextLine>? = null, val text: String? = null)

/**
 * One reachable combination of style states: every node's frame and writes, complete, the canvas behind the page (null: white),
 * body's own background in its box when html's background is the canvas (null: body paints none), and [pageScroll] in device px,
 * null when Dragon leaves it undecided.
 */
data class Assignment(val values: Map<String, JsValue>, val nodes: List<StyledNode>, val canvas: Rgba? = null, val body: Rgba? = null, val pageScroll: ScrollRange? = null) {
	val byId: Map<String, StyledNode> = nodes.associateBy { it.id }
}

data class StyleState(val key: String, val domain: List<JsValue>)

/** A payload slot Dragon's plan reads, with the value the export is laid out at; [integer] when Dragon sampled whole numbers only. */
data class ExportSlot(val id: String, val initial: Double, val integer: Boolean)

/** One media feature the host evaluates; only `prefers-color-scheme` is implemented. */
/** One comparison of a media feature, as Dragon's `rt-band` reads it. */
data class BandComparison(val op: String, val value: Double, val num: Double, val den: Double)

/** One media feature of the sheet's @media bands, as Dragon wrote it for the device to evaluate. */
data class BandAtom(val feature: String, val keyword: String, val comparisons: List<BandComparison> = emptyList()) {
	/** Whether the atom holds by the colour scheme alone; any other feature needs the page's size. */
	fun holds(dark: Boolean): Boolean {
		if (feature != "prefers-color-scheme" || comparisons.isNotEmpty()) throw MarklessDecodeError("the media feature $feature needs the page's size")
		return when (keyword) {
			"any" -> true
			"dark" -> dark
			"light" -> !dark
			else -> throw MarklessDecodeError("prefers-color-scheme has no keyword \"$keyword\"")
		}
	}
}

/** The sheet's @media bands: per band, the truth value of every atom. */
data class Bands(val atoms: List<BandAtom>, val bands: List<List<Boolean>>) {
	/** The band whose truth vector is the device's, by the colour scheme alone. */
	fun band(dark: Boolean): Int {
		val reading = atoms.map { it.holds(dark) }
		val at = bands.indexOf(reading)
		if (at < 0) throw MarklessDecodeError("no @media band holds the device's reading $reading")
		return at
	}

	/**
	 * The band of a page area [widthPx] x [heightPx] device px at [scale]: Dragon's own lookup (Chrome's media evaluation) when any
	 * atom reads more than the colour scheme, else the colour scheme alone.
	 */
	fun band(dark: Boolean, widthPx: Double, heightPx: Double, scale: Double): Int {
		if (atoms.all { it.feature == "prefers-color-scheme" }) return band(dark)
		val lookup = library ?: throw MarklessDecodeError("@media ${atoms.map { it.feature }} needs Dragon's band lookup, which this host does not link")
		fun bits(v: Double) = "\"${java.lang.Long.toHexString(v.toRawBits()).padStart(16, '0')}\""
		val atomsText = atoms.joinToString(",") { a -> "[${jsonString(a.feature)},${jsonString(a.keyword)},[${a.comparisons.joinToString(",") { "[${jsonString(it.op)},${bits(it.value)},${bits(it.num)},${bits(it.den)}]" }}]]" }
		val bandsText = bands.joinToString(",") { "[${it.joinToString(",")}]" }
		// A phone's readings: a coarse primary pointer that does not hover, and no fine pointer.
		val readings = "[\"coarse\",false,true,false,false,false,$dark]"
		val line = "[\"rt-band\",[[$atomsText],[$bandsText]],[[${bits(Math.rint(widthPx))},${bits(Math.rint(heightPx))},${bits(scale)},$readings]]]"
		val answer = lookup(line)
		val result = Json.parse(answer).arr("band lookup")
		val size = (result.getOrNull(1) as? Json.Arr)?.items?.firstOrNull()?.arr("band lookup size")
		if (result.size != 2 || result[0] != Json.Str("ok") || size?.size != 3) throw MarklessDecodeError("Dragon's band lookup failed at $widthPx x $heightPx px: $answer")
		val hex = (size[2] as? Json.Str)?.value?.takeIf { it.length == 16 } ?: throw MarklessDecodeError("band lookup: ${size[2].text()} is not a number's bit pattern")
		val index = Double.fromBits(java.lang.Long.parseUnsignedLong(hex, 16))
		if (index < 0 || index >= bands.size || index != Math.rint(index)) throw MarklessDecodeError("band lookup: band $index is not a band")
		return index.toInt()
	}

	companion object {
		/** Dragon's translated `runLibraryCase`, when the app is built with Dragon's engine; `rt-band` looks a band up by the page's size. */
		var library: ((String) -> String)? = try {
			val run = Class.forName("dev.dragon.layout.HarnessKt").getMethod("harness_runLibraryCase", String::class.java)
			({ line: String ->
				try {
					run.invoke(null, line) as String
				} catch (e: java.lang.reflect.InvocationTargetException) {
					throw e.cause ?: e
				}
			})
		} catch (_: ClassNotFoundException) {
			null
		}
	}
}

/**
 * One platform's slice of a Dragon style export: per state assignment, frames (device px, relative to the parent box) and
 * lowered writes per node id; [next] is `next[a][s][v]`, the assignment reached by setting state s to its v-th value (-1: none).
 */
/** A system face of a style export (`system:<role>:<weight>`): a file of `/system/fonts` at the fonts.xml instance Dragon measured. */
data class SystemFace(val file: String, val index: Int, val axes: Map<String, Double>)

/** A system sheet's content at one resting height: its own document, laid out in the sheet's content area. */
data class SheetHeight(val snapPoint: Double, val style: StyleExport)

data class StyleExport(val dpr: Double, val viewportWidth: Double, val viewportHeight: Double, val states: List<StyleState>, val initial: Int, val assignments: List<Assignment>, val next: List<List<List<Int>>>, val bands: Bands? = null, val pageScrollUndecided: String? = null, val sheets: Map<String, List<SheetHeight>> = emptyMap(), val systemFaces: Map<String, SystemFace> = emptyMap(),
	/** Dragon's layout plan ([PLAN_VERSION]) as JSON text: with it the page lays out at the screen's own size. */
	val plan: String? = null,
	/** Per assignment: each Dragon id the plan's geometry names, with the export's id for it (empty: no ids differ). */
	val planNames: List<Map<String, String>> = emptyList(),
	/** The payload slots the plan reads, in the order [laidOut] takes their values. */
	val slots: List<ExportSlot> = emptyList(),
	/** Each list whose rows the phone lays out: the box its rows hang from and the Dragon ids of one row's top boxes, in order. */
	val planRepeats: List<PlanRepeat> = emptyList(),
) {

	/** The index of [BAND_KEY] among [states], or -1 for an export without @media. */
	val bandState: Int = states.indexOfFirst { it.key == BAND_KEY }

	init {
		if ((bandState >= 0) != (bands != null)) throw MarklessDecodeError("style export has ${if (bands == null) "no band table" else "a band table"} but ${if (bandState >= 0) "a" else "no"} $BAND_KEY state")
		if (bands != null && states[bandState].domain != bands.bands.indices.map { JsValue.Num(it.toDouble()) }) throw MarklessDecodeError("$BAND_KEY's domain does not name every band")
	}

	/** The band for the device's appearance and the page area this export is laid out at; 0 without @media. */
	fun band(dark: Boolean): Int = bands?.band(dark, viewportWidth * dpr, viewportHeight * dpr, dpr) ?: 0

	/**
	 * The assignment matching the cells' values at mount and the device's band, [initial] when it matches. Every state but the
	 * band must follow exactly one of [cells] (the payload's styled cells); with [everyCell], every styled cell must have a state
	 * (a page's export), else only the cells its nodes read do (a sheet's).
	 */
	fun start(cells: List<String>, value: (String) -> JsValue, dark: Boolean, everyCell: Boolean = true, branches: List<String> = emptyList(), arm: (String) -> JsValue? = { null }, rowStates: Set<String> = emptySet()): Int {
		// A branch's state is the arm it shows; one no arm around it shows keeps a value no box reads: its first.
		val wanted = states.mapIndexed { s, st ->
			when {
				s == bandState -> JsValue.Num(band(dark).toDouble())
				// A state of each row styles only the rows, which take their own; the page keeps the template's.
				st.key in rowStates -> assignments[initial].values[st.key] ?: st.domain[0]
				else -> cellOf(st, cells + branches).let { c -> if (c in branches) arm(c) ?: st.domain[0] else value(c) }
			}
		}
		if (everyCell) for (c in cells) stateFor(c)
		fun matches(a: Int) = states.withIndex().all { (s, st) -> assignments[a].values[st.key]?.let { Js.strictEquals(it, wanted[s]) } == true }
		if (matches(initial)) return initial
		return assignments.indices.firstOrNull(::matches) ?: throw MarklessDecodeError("no style assignment matches the values ${states.map { it.key }.zip(wanted)}")
	}

	private fun cellOf(state: StyleState, cells: List<String>): String {
		val named = cells.filter { state.key == it || state.key.endsWith("#$it") }
		if (named.size != 1) throw MarklessDecodeError("style state \"${state.key}\" follows ${named.size} styled cells or branches of the payload")
		return named[0]
	}

	/** The export state for a payload cell, or -1 when no state follows it. */
	fun stateOrNone(cell: String): Int = if (states.none { it.key == cell || it.key.endsWith("#$cell") }) -1 else stateFor(cell)

	/** The layouts of a system sheet's content, one per resting height in [snapPoints] order; a sheet without them is refused. */
	fun sheetHeights(sheet: String, snapPoints: List<Double>): List<StyleExport> {
		val heights = sheets[sheet] ?: throw MarklessDecodeError("the page is styled but its style export has no styles for the content of system sheet \"$sheet\"")
		if (heights.map { it.snapPoint } != snapPoints) throw MarklessDecodeError("system sheet \"$sheet\" rests at $snapPoints but its styles are laid out at ${heights.map { it.snapPoint }}")
		return heights.map { it.style }
	}

	/** The export state for a payload cell: its key is the cell id, or ends in `#<cell id>`. */
	fun stateFor(cell: String): Int {
		val matches = states.withIndex().filter { (_, st) -> st.key == cell || st.key.endsWith("#$cell") }
		if (matches.size != 1) throw MarklessDecodeError("style export has ${matches.size} states for cell \"$cell\" (keys ${states.map { it.key }})")
		return matches[0].index
	}

	/** The assignment reached from [current] when state [state] takes [value]; an unreachable or unknown value is an error. */
	fun next(current: Int, state: Int, value: JsValue): Int {
		val v = states[state].domain.indexOfFirst { Js.strictEquals(it, value) }
		if (v < 0) throw MarklessDecodeError("style state \"${states[state].key}\" has no value $value in its domain")
		val to = next[current][state][v]
		if (to < 0) throw MarklessDecodeError("style state \"${states[state].key}\" = $value is unreachable from assignment $current")
		return to
	}

	/**
	 * This export laid out again by Dragon's plan for a page [width] x [height] dp at [scale]: every assignment's frames, border
	 * widths, text lines, dashed borders and scroll ranges, in this screen's device px. [layout] is Dragon's translated
	 * `runMarklessLayout`; [slotValues] are the current values of [slots], in their order, and the writes they move are written
	 * in. Without a plan the export is returned as it is.
	 */
	fun laidOut(width: Double, height: Double, scale: Double, layout: (String) -> String, slotValues: List<Double> = emptyList(), rows: ((Int) -> Map<String, List<LaidOutRow>>)? = null, rowsLayout: ((String) -> String)? = null): StyleExport {
		val plan = plan ?: return this
		if (slotValues.size != slots.size) throw MarklessDecodeError("the style export reads ${slots.size} slots; the layout was given ${slotValues.size} values")
		val slotsText = if (slots.isEmpty()) "" else slotValues.joinToString(",", ",\"slots\":[", "]") { "\"${java.lang.Long.toHexString(it.toRawBits()).padStart(16, '0')}\"" }
		val laid = assignments.indices.map { k ->
			val names = planNames.getOrNull(k) ?: emptyMap()
			val dragonId = names.entries.associate { (d, m) -> m to d }
			val shown = if (planRepeats.isEmpty()) null else rows?.invoke(k)
			val lists = shown?.let { byList ->
				Json.Arr(planRepeats.map { r ->
					// A list whose parent this assignment does not lay out (its arm is closed there) has no rows in it.
					val open = assignments[k].byId[names[r.parent] ?: r.parent]?.frame != null
					obj("parent" to Json.Str(r.parent), "template" to Json.Arr(r.template.map { Json.Str(it) }), "rows" to Json.Arr((if (open) byList[r.id] ?: emptyList() else emptyList()).map { row ->
						obj("key" to Json.Str(row.key), "assignment" to Json.Num(row.assignment.toDouble()), "texts" to Json.Arr(row.texts.entries.sortedBy { it.key }.map { (id, text) -> Json.Arr(listOf(Json.Str(dragonId[id] ?: id), Json.Str(text))) }))
					}))
				}).text()
			}
			val line = "{\"assignment\":$k,\"dpr\":${jsonNumber(scale)},\"viewport\":{\"width\":${jsonNumber(width)},\"height\":${jsonNumber(height)}},\"safeArea\":{\"top\":0,\"right\":0,\"bottom\":0,\"left\":0},\"plan\":$plan$slotsText${if (lists != null) ",\"rows\":$lists" else ""}}"
			if (lists != null && slots.isNotEmpty()) throw MarklessDecodeError("a page with rows and style values that follow state, which Dragon's rows layout does not take yet")
			if (lists != null && rowsLayout == null) throw MarklessDecodeError("a page with rows needs Dragon's rows layout")
			val result = Json.parse(if (lists == null) layout(line) else rowsLayout!!(line))
			val parts = result.arr("plan layout")
			if (parts.size != (if (slots.isEmpty()) 3 else 4) || parts[0] != Json.Str("ok")) throw MarklessDecodeError("Dragon's layout at $width x $height dp and ${scale}x failed: ${result.text()}")
			val page = parts[1].arr("plan layout page scroll")
			val pageScroll = if (page.size == 3) null else range(rangeJson(page, "plan layout page scroll"), "plan layout page scroll")
			val geometry = HashMap<String, List<Json>>()
			for (g in parts[2].arr("plan layout nodes")) {
				val f = g.arr("plan layout node")
				val id = f.firstOrNull()?.str("plan layout node id") ?: throw MarklessDecodeError("plan layout node has no id")
				// A row's copy is named "<Dragon id>@<key>": the export names it by the template's export id and the key.
				val at = id.indexOf('@')
				if (at < 0) geometry[names[id] ?: id] = f else geometry[(names[id.substring(0, at)] ?: id.substring(0, at)) + id.substring(at)] = f
			}
			val assignment = assignments[k]
			val moved = HashMap<String, MutableList<List<Json>>>()
			if (slots.isNotEmpty()) for (w in parts[3].arr("plan layout writes")) {
				val f = w.arr("plan layout write")
				if (f.size != 4) throw MarklessDecodeError("plan layout write ${w.text()}: expected node, write kind, path and value")
				val id = f[0].str("plan layout write node")
				if (assignment.byId[id] == null) throw MarklessDecodeError("Dragon's layout moves a write of $id, which assignment $k has no node for")
				moved.getOrPut(id) { ArrayList() }.add(f)
			}
			// The template of each list: one row's nodes, which no view shows; each row is a copy of them laid out here.
			val template = HashMap<String, Pair<PlanRepeat, Boolean>>()
			if (shown != null) for (r in planRepeats) {
				val tops = r.template.map { names[it] ?: it }.toSet()
				for (node in assignment.nodes) {
					var at: String? = node.id
					while (at != null && at !in tops) at = assignment.byId[at]?.parent
					if (at != null) template[node.id] = r to (node.id in tops)
				}
			}
			val withRows = ArrayList<StyledNode>()
			for (node in assignment.nodes) {
				val place = template[node.id]
				if (place == null || shown == null) {
					withRows.add(node)
					continue
				}
				withRows.add(node.copy(frame = null, borderWidths = null, borderOps = null, scrollRange = null, lines = null))
				for (row in shown[place.first.id] ?: emptyList()) {
					val own = assignments[row.assignment].byId[node.id] ?: throw MarklessDecodeError("assignment ${row.assignment} has no node ${node.id} for row ${row.key}")
					withRows.add(own.copy(id = "${node.id}@${row.key}", parent = if (place.second) node.parent else node.parent?.let { "$it@${row.key}" }, text = if (own.kind == "text") (row.texts[node.id] ?: own.text) else own.text))
				}
			}
			assignment.copy(pageScroll = pageScroll, nodes = withRows.map { slotted ->
				val node = moved[slotted.id]?.let { slotted.copy(writes = slotWrites(slotted, it)) } ?: slotted
				if (node.frame == null) return@map node
				val f = geometry[node.id] ?: throw MarklessDecodeError("Dragon's layout has no box for ${node.id}")
				val what = "plan layout of ${node.id}"
				if (f.size != 6) throw MarklessDecodeError("$what: expected id, frame, border widths, lines, border operations and scroll range")
				val frame = f[1].arr(what).map { planNumber(it) }
				if (frame.size != 4) throw MarklessDecodeError("$what: expected x, y, width and height")
				val widths = if (f[2] == Json.Null) null else f[2].arr(what).map { planNumber(it) }.also { if (it.size != 4) throw MarklessDecodeError("$what: border widths are not four sides") }
				val lines = if (f[3] == Json.Null) null else textLines(Json.Arr(f[3].arr(what).map { l ->
					val line = l.arr("$what.lines[]")
					obj("top" to planNumbers(line[0]), "baseline" to planNumbers(line[1]), "runs" to Json.Arr(line[2].arr("$what.runs").map { r ->
						val run = r.arr("$what.runs[]")
						obj("face" to run[0], "size" to planNumbers(run[1]), "glyphs" to planNumbers(run[2]), "xs" to planNumbers(run[3]))
					}))
				}), "$what.lines")
				val ops = if (f[4] == Json.Null) null else borderOps(planBorderOps(f[4], what), "$what.borderOps")
				val scroll = if (f[5] == Json.Null) null else range(rangeJson(f[5].arr(what), what), what)
				node.copy(
					frame = Frame(frame[0], frame[1], frame[2], frame[3]), borderWidths = widths?.let { Edges(it[0], it[1], it[2], it[3]) },
					borderOps = ops, scrollRange = scroll, lines = if (node.kind == "text") lines else null,
				)
			})
		}
		return copy(dpr = scale, viewportWidth = width, viewportHeight = height, assignments = laid)
	}

	companion object {
		const val ANDROID_BACKEND = "android-views"

		/** A number of Dragon's plan layout: its IEEE 754 bit pattern as 16 hex digits. */
		private fun planNumber(v: Json): Double {
			val hex = (v as? Json.Str)?.value?.takeIf { it.length == 16 } ?: throw MarklessDecodeError("plan layout: ${v.text()} is not a number's bit pattern")
			return Double.fromBits(java.lang.Long.parseUnsignedLong(hex, 16))
		}

		/** [node]'s writes with the numbers Dragon's layout moved, each `[node, kind, path, value]` naming one write by kind. */
		private fun slotWrites(node: StyledNode, moves: List<List<Json>>): List<StyleWrite> {
			val writes = node.writes.toMutableList()
			for (m in moves) {
				val kind = m[1].str("plan layout write kind")
				val path = m[2].arr("plan layout write path")
				val value = planNumber(m[3])
				val refused = { MarklessDecodeError("Dragon's layout moves ${Json.Arr(path).text()} of ${node.id}'s $kind write, which this host cannot write") }
				val at = writes.indices.filter { kindOf(writes[it]) == kind }.singleOrNull() ?: throw refused()
				if (value != Math.rint(value) || value < 0 || value > 255) throw MarklessDecodeError("Dragon's layout gives ${node.id}'s $kind ${Json.Arr(path).text()} $value, not a byte")
				val byte = value.toInt()
				fun channel(c: Rgba, ch: Json): Rgba = when ((ch as? Json.Str)?.value) {
					"r" -> c.copy(r = byte)
					"g" -> c.copy(g = byte)
					"b" -> c.copy(b = byte)
					"alpha" -> c.copy(alpha = byte)
					else -> throw refused()
				}
				writes[at] = when (val w = writes[at]) {
					is StyleWrite.BackgroundColor -> if (path.size == 2 && path[0] == Json.Str("color")) StyleWrite.BackgroundColor(channel(w.color, path[1])) else throw refused()
					is StyleWrite.TextColor -> if (path.size == 2 && path[0] == Json.Str("color")) StyleWrite.TextColor(channel(w.color, path[1])) else throw refused()
					is StyleWrite.BorderColors -> {
						val i = (path.getOrNull(1) as? Json.Num)?.value
						if (path.size != 3 || path[0] != Json.Str("colors") || i == null || i != Math.rint(i) || i < 0 || i >= w.colors.size) throw refused()
						StyleWrite.BorderColors(w.colors.toMutableList().also { it[i.toInt()] = channel(it[i.toInt()], path[2]) })
					}
					else -> throw refused()
				}
			}
			return writes
		}

		/** The export's `kind` of the writes a slot can move. */
		private fun kindOf(w: StyleWrite): String? = when (w) {
			is StyleWrite.BackgroundColor -> "background-color"
			is StyleWrite.TextColor -> "text-color"
			is StyleWrite.BorderColors -> "border-colors"
			else -> null
		}

		/** Bit patterns as numbers, arrays element by element. */
		private fun planNumbers(v: Json): Json = if (v is Json.Arr) Json.Arr(v.items.map(::planNumbers)) else Json.Num(planNumber(v))

		private fun obj(vararg fields: Pair<String, Json>): Json = Json.Obj(linkedMapOf(*fields))

		private fun rangeJson(v: List<Json>, what: String): Json {
			if (v.size != 4) throw MarklessDecodeError("$what: expected minX, maxX, minY and maxY")
			return obj("minX" to planNumbers(v[0]), "maxX" to planNumbers(v[1]), "minY" to planNumbers(v[2]), "maxY" to planNumbers(v[3]))
		}

		/** Dragon's border operations of a box, [[origin x, y], [width, height], widths, [[op, side, alpha, antialias, points]]], in the export's shape. */
		private fun planBorderOps(v: Json, what: String): Json {
			val p = v.arr("$what.borderOps")
			if (p.size != 4) throw MarklessDecodeError("$what: expected origin, size, widths and border operations")
			val origin = p[0].arr(what).map(::planNumber)
			val size = p[1].arr(what).map(::planNumber)
			if (origin.size != 2 || size.size != 2) throw MarklessDecodeError("$what: expected a border origin and size")
			return obj(
				"origin" to obj("x" to Json.Num(origin[0]), "y" to Json.Num(origin[1])),
				"size" to obj("width" to Json.Num(size[0]), "height" to Json.Num(size[1])),
				"widths" to planNumbers(p[2]),
				"ops" to Json.Arr(p[3].arr(what).map { op ->
					val o = op.arr("$what.ops[]")
					if (o.size != 5) throw MarklessDecodeError("$what: expected op, side, alpha, antialias and points")
					obj("op" to o[0], "side" to o[1], "alpha" to planNumbers(o[2]), "antialias" to o[3], "points" to planNumbers(o[4]))
				}),
			)
		}

		/** A target's or route's optional `plan` and `planNames`. */
		private fun withPlan(style: StyleExport, t: Map<String, Json>, what: String): StyleExport {
			val plan = t["plan"]?.let { p ->
				val version = p.obj("$what.plan").field("version", "$what.plan").str("$what.plan.version")
				if (version != PLAN_VERSION) throw MarklessDecodeError("$what.plan is $version; this host reads $PLAN_VERSION")
				p.text()
			}
			val names = t["planNames"]?.arr("$what.planNames")?.mapIndexed { a, assignment ->
				assignment.arr("$what.planNames[$a]").associate { pair ->
					val n = pair.arr("$what.planNames[$a][]")
					if (n.size != 2) throw MarklessDecodeError("$what.planNames[$a]: expected a Dragon id and the export's id")
					n[0].str("$what.planNames[$a][][0]") to n[1].str("$what.planNames[$a][][1]")
				}
			} ?: emptyList()
			if (t.containsKey("planNames") && names.size != style.assignments.size) throw MarklessDecodeError("$what.planNames names ${names.size} assignments; the export has ${style.assignments.size}")
			val repeats = t["planRepeats"]?.arr("$what.planRepeats")?.mapIndexed { i, r ->
				val o = r.obj("$what.planRepeats[$i]")
				o.only(setOf("id", "parent", "template"), "$what.planRepeats[$i]")
				val template = o.field("template", "$what.planRepeats[$i]").arr("$what.planRepeats[$i].template").map { it.str("$what.planRepeats[$i].template[]") }
				if (template.isEmpty()) throw MarklessDecodeError("$what.planRepeats[$i]: a row has at least one box")
				PlanRepeat(o.field("id", "$what.planRepeats[$i]").str("id"), o.field("parent", "$what.planRepeats[$i]").str("parent"), template)
			} ?: emptyList()
			return style.copy(plan = plan, planNames = names, planRepeats = repeats)
		}

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
				val nodes = t.field("nodes", target).arr("nodes").mapIndexed { n, v -> node(v, "nodes[$n]") { w, what -> writes(w, what) } }
				return StyleExport(dpr, width, height, emptyList(), 0, listOf(Assignment(emptyMap(), nodes)), listOf(emptyList()))
			}
			// Dragon's reason, for this target, when it leaves the page's scroll range undecided.
			val undecided = root["warnings"]?.arr("warnings")?.map { it.obj("warnings[]") }?.firstOrNull { w ->
				w.field("code", "warning").str("code") == "DRAGON_PAGE_SCROLL_UNDECIDED" && w.field("message", "warning").str("message").startsWith("$target: ")
			}?.let { it.getValue("message").str("message").removePrefix("$target: ") }
			val style = withPlan(program(t, target, dpr, width, height, undecided) { w, what -> writes(w, what) }.copy(systemFaces = root["systemFonts"]?.let { systemFaces(it, target) } ?: emptyMap()), t, target)
			val slots = root["slots"]?.let { exportSlots(it) } ?: return style
			if (slots.isNotEmpty() && style.plan == null) throw MarklessDecodeError("style export has slots but $target has no layout plan to apply them")
			return style.copy(slots = slots)
		}

		/** The export's `slots`: each slot Dragon's plan reads, once, with the finite value it is laid out at. */
		private fun exportSlots(v: Json): List<ExportSlot> {
			val seen = HashSet<String>()
			return v.arr("slots").mapIndexed { n, x ->
				val what = "slots[$n]"
				val o = x.obj(what)
				o.only(setOf("id", "initial", "integer"), what)
				val id = o.field("id", what).str("$what.id")
				if (!seen.add(id)) throw MarklessDecodeError("$what lists slot $id twice")
				val integer = o["integer"]?.let { if (it != Json.Bool(true)) throw MarklessDecodeError("$what.integer must be true") else true } ?: false
				val initial = o.field("initial", what).num("$what.initial")
				if (!initial.isFinite() || (integer && initial != Math.rint(initial))) throw MarklessDecodeError("$what.initial is $initial, not a ${if (integer) "whole" else "finite"} number")
				ExportSlot(id, initial, integer)
			}
		}

		/** `systemFonts`: each system face with this target's file, face index and axes; an entry without this target is an error. */
		private fun systemFaces(v: Json, target: String): Map<String, SystemFace> {
			val out = LinkedHashMap<String, SystemFace>()
			for ((n, e) in v.arr("systemFonts").withIndex()) {
				val what = "systemFonts[$n]"
				val o = e.obj(what)
				o.only(setOf("id", "ios", "android"), what)
				val id = o.field("id", what).str("$what.id")
				if (!id.startsWith("system:")) throw MarklessDecodeError("$what.id \"$id\" is not a system face id")
				if (id in out) throw MarklessDecodeError("$what lists $id twice")
				val f = (o[target] ?: throw MarklessDecodeError("$what ($id) has no $target face")).obj("$what.$target")
				f.only(setOf("file", "index", "axes", "sha256"), "$what.$target")
				val file = f.field("file", what).str("$what.$target.file")
				if (file.isEmpty() || file.contains('/') || file.startsWith(".")) throw MarklessDecodeError("$what.$target.file \"$file\" is not a file name in /system/fonts")
				val index = f.field("index", what).num("$what.$target.index")
				if (index < 0 || index != Math.floor(index)) throw MarklessDecodeError("$what.$target.index is $index, not a face index")
				f.field("sha256", what).str("$what.$target.sha256")
				val axes = f.field("axes", what).obj("$what.$target.axes").mapValues { (tag, x) ->
					if (tag.length != 4) throw MarklessDecodeError("$what.$target.axes names \"$tag\", not a four-letter axis tag")
					x.num("$what.$target.axes.$tag")
				}
				out[id] = SystemFace(file, index.toInt(), axes)
			}
			return out
		}

		/** One target's states, assignments and next table; [writesOf] reads a node's `writes` field. */
		private fun program(t: Map<String, Json>, target: String, dpr: Double, width: Double, height: Double, undecided: String?, writesOf: (Json, String) -> List<StyleWrite>): StyleExport {
			val states = t.field("states", target).arr("states").mapIndexed { n, v ->
				val o = v.obj("states[$n]")
				StyleState(o.field("key", "states[$n]").str("key"), o.field("domain", "states[$n]").arr("domain").map { scalar(it, "states[$n].domain[]") })
			}
			val assignments = t.field("assignments", target).arr("assignments").mapIndexed { a, v ->
				val o = v.obj("assignments[$a]")
				val values = o.field("values", "assignments[$a]").obj("values").mapValues { (k, x) -> scalar(x, "assignments[$a].values.$k") }
				val canvas = o["canvas"]?.let { color(it, "assignments[$a].canvas") }
				if (canvas != null && canvas.alpha != 255) throw MarklessDecodeError("assignments[$a].canvas is not opaque")
				val body = o["bodyBackground"]?.takeIf { it != Json.Null }?.let { color(it, "assignments[$a].bodyBackground") }
				if (body != null && body.alpha != 255) throw MarklessDecodeError("assignments[$a].bodyBackground is not opaque")
				Assignment(values, o.field("nodes", "assignments[$a]").arr("nodes").mapIndexed { n, x -> node(x, "assignments[$a].nodes[$n]", writesOf) }, canvas, body, o["pageScroll"]?.let { range(it, "assignments[$a].pageScroll") })
			}
			val initial = t.field("initial", target).num("initial").toInt()
			val next = t.field("next", target).arr("next").map { row -> row.arr("next[]").map { col -> col.arr("next[][]").map { it.num("next[][][]").toInt() } } }
			if (initial !in assignments.indices) throw MarklessDecodeError("style export initial $initial names no assignment")
			if (next.size != assignments.size || next.any { r -> r.size != states.size || r.withIndex().any { (si, c) -> c.size != states[si].domain.size || c.any { it != -1 && it !in assignments.indices } } }) throw MarklessDecodeError("style export next table does not match its assignments and states")
			return StyleExport(dpr, width, height, states, initial, assignments, next, t["bands"]?.let { bands(it, "$target.bands") }, undecided)
		}

		private fun bands(v: Json, what: String): Bands {
			val o = v.obj(what)
			o.only(setOf("atoms", "bands", "conditions"), what)
			val atoms = o.field("atoms", what).arr("$what.atoms").mapIndexed { n, a ->
				val f = a.obj("$what.atoms[$n]")
				f.only(setOf("feature", "comparisons", "keyword"), "$what.atoms[$n]")
				val feature = f.field("feature", what).str("feature")
				val comparisons = f.field("comparisons", what).arr("$what.atoms[$n].comparisons").mapIndexed { k, c ->
					val at = "$what.atoms[$n].comparisons[$k]"
					val o = c.obj(at)
					o.only(setOf("op", "value", "num", "den"), at)
					BandComparison(o.field("op", at).str("$at.op"), o.field("value", at).num("$at.value"), o.field("num", at).num("$at.num"), o.field("den", at).num("$at.den"))
				}
				if (feature == "prefers-color-scheme" && comparisons.isNotEmpty()) throw MarklessDecodeError("$what.atoms[$n]: prefers-color-scheme with comparisons")
				BandAtom(feature, f.field("keyword", what).str("keyword"), comparisons).also { if (feature == "prefers-color-scheme") it.holds(false) }
			}
			val table = o.field("bands", what).arr("$what.bands").mapIndexed { n, b -> b.arr("$what.bands[$n]").map { (it as? Json.Bool)?.value ?: throw MarklessDecodeError("$what.bands[$n] holds a non-boolean") } }
			if (table.isEmpty() || table.any { it.size != atoms.size }) throw MarklessDecodeError("$what: every band needs one truth value per atom")
			o.field("conditions", what).arr("$what.conditions").forEach { it.str("$what.conditions[]") }
			return Bands(atoms, table)
		}

		private fun range(v: Json, what: String): ScrollRange? {
			if (v == Json.Null) return null
			val o = v.obj(what)
			return ScrollRange(o.field("minX", what).num("minX"), o.field("maxX", what).num("maxX"), o.field("minY", what).num("minY"), o.field("maxY", what).num("maxY"))
		}

		/**
		 * Every route's styles in a `markless.native-app-style/0` file, by route pattern, each expanded to the export Dragon wrote
		 * for that page (a node's `writes` index replaced by the list it names). A route absent from the file has no styles.
		 */
		fun decodeApp(bytes: ByteArray, target: String = "android"): Map<String, StyleExport> {
			val root = Json.parse(bytes).obj("app style")
			root.only(setOf("version", "units", "warnings", "fonts", "systemFonts", "targets"), "app style")
			val faces = root["systemFonts"]?.let { systemFaces(it, target) } ?: emptyMap()
			val version = root.field("version", "app style").str("version")
			if (version != APP_STYLE_VERSION) throw MarklessDecodeError("unknown app style version \"$version\" (this host reads $APP_STYLE_VERSION)")
			val t = root.field("targets", "app style").obj("targets").field(target, "targets").obj("targets.$target")
			t.only(setOf("backend", "viewport", "dpr", "writes", "routes"), "targets.$target")
			val backend = t.field("backend", target).str("backend")
			if (backend != ANDROID_BACKEND) throw MarklessDecodeError("app style backend is \"$backend\", not $ANDROID_BACKEND")
			val viewport = t.field("viewport", target).obj("viewport")
			val dpr = t.field("dpr", target).num("dpr")
			val width = viewport.field("width", "viewport").num("width")
			val height = viewport.field("height", "viewport").num("height")
			val lists = t.field("writes", target).arr("writes").mapIndexed { n, w -> writes(w, "writes[$n]") }
			val routes = LinkedHashMap<String, StyleExport>()
			for ((n, r) in t.field("routes", target).arr("routes").withIndex()) {
				val o = r.obj("routes[$n]")
				o.only(setOf("pattern", "component", "compiler", "readiness", "states", "initial", "next", "bands", "assignments", "sheets", "plan", "planNames", "planRepeats", "slots"), "routes[$n]")
				val pattern = o.field("pattern", "routes[$n]").str("pattern")
				if (pattern in routes) throw MarklessDecodeError("app style lists route $pattern twice")
				val listed = { w: Json, what: String ->
					val i = w.num("$what.writes")
					if (i != Math.floor(i) || i.toInt() !in lists.indices) throw MarklessDecodeError("$what.writes is $i, not an index of the app's write lists")
					lists[i.toInt()]
				}
				val sheets = LinkedHashMap<String, List<SheetHeight>>()
				for ((k, sv) in (o["sheets"]?.arr("routes[$n].sheets") ?: emptyList()).withIndex()) {
					val where = "routes[$n].sheets[$k]"
					val so = sv.obj(where)
					so.only(setOf("node", "heights"), where)
					val node = so.field("node", where).str("$where.node")
					if (node in sheets) throw MarklessDecodeError("$where lists sheet $node twice")
					sheets[node] = so.field("heights", where).arr("$where.heights").mapIndexed { h, hv ->
						val at = "$where.heights[$h]"
						val ho = hv.obj(at)
						ho.only(setOf("snapPoint", "viewport", "readiness", "states", "initial", "next", "bands", "assignments"), at)
						val hp = ho.field("viewport", at).obj("$at.viewport")
						hp.only(setOf("width", "height"), "$at.viewport")
						SheetHeight(ho.field("snapPoint", at).num("$at.snapPoint"), program(ho, at, dpr, hp.field("width", at).num("width"), hp.field("height", at).num("height"), null, listed))
					}.also { if (it.isEmpty() || it.map { h -> h.snapPoint }.distinct().size != it.size) throw MarklessDecodeError("$where needs one layout per resting height") }
				}
				val planned = withPlan(program(o, "routes[$n] ($pattern)", dpr, width, height, null, listed).copy(sheets = sheets, systemFaces = faces), o, "routes[$n]")
				val slots = o["slots"]?.let { exportSlots(it) } ?: emptyList()
				if (slots.isNotEmpty() && planned.plan == null) throw MarklessDecodeError("routes[$n] ($pattern) has slots but no layout plan to apply them")
				routes[pattern] = planned.copy(slots = slots)
				val missing = routes.getValue(pattern).assignments.indexOfFirst { it.canvas == null }
				if (missing >= 0) throw MarklessDecodeError("routes[$n] ($pattern).assignments[$missing] has no canvas")
			}
			return routes
		}

		private fun writes(v: Json, what: String): List<StyleWrite> = v.arr(what).mapIndexed { n, w -> write(w, "$what[$n]") }

		private fun node(v: Json, what: String, writesOf: (Json, String) -> List<StyleWrite>): StyledNode {
			val o = v.obj(what)
			val id = o.field("id", what).str("$what.id")
			val parent = o.field("parent", what).let { if (it == Json.Null) null else it.str("$what.parent") }
			val frame = o.field("frame", what).takeIf { it != Json.Null }?.obj("$what.frame")?.let { f -> Frame(f.field("x", what).num("x"), f.field("y", what).num("y"), f.field("width", what).num("width"), f.field("height", what).num("height")) }
			val kind = o.field("kind", what).str("$what.kind")
			if (kind !in setOf("element", "text", "anonymous")) throw MarklessDecodeError("$what has unknown node kind \"$kind\"")
			val bw = o["borderWidths"]?.takeIf { it != Json.Null }?.obj("$what.borderWidths")?.let { Edges(it.field("top", what).num("top"), it.field("right", what).num("right"), it.field("bottom", what).num("bottom"), it.field("left", what).num("left")) }
			val writes = writesOf(o.field("writes", what), id)
			val scroll = o["scrollRange"]?.let { range(it, "$what.scrollRange") }
			if ((scroll != null) != writes.any { it is StyleWrite.ScrollContainer }) throw MarklessDecodeError("$what: a scroll range comes with a scroll-container write, and only then")
			val lines = o["lines"]?.let { textLines(it, "$what.lines") }
			if (lines != null && (kind != "text" || frame == null)) throw MarklessDecodeError("$what: only a framed text node has lines")
			val text = o["text"]?.takeIf { it != Json.Null }?.str("$what.text")
			if (lines != null && text == null) throw MarklessDecodeError("$what has lines but no text")
			return StyledNode(id, parent, kind, frame, bw, writes, scroll, o["borderOps"]?.let { borderOps(it, "$what.borderOps") }, lines, text)
		}

		private fun textLines(v: Json, what: String): List<TextLine> = v.arr(what).mapIndexed { n, x ->
			val at = "$what[$n]"
			val l = x.obj(at)
			l.only(setOf("top", "baseline", "runs"), at)
			val runs = l.field("runs", at).arr("$at.runs").mapIndexed { k, r ->
				val where = "$at.runs[$k]"
				val o = r.obj(where)
				o.only(setOf("face", "size", "glyphs", "xs"), where)
				val size = o.field("size", where).num("$where.size")
				if (!(size > 0) || size.isInfinite()) throw MarklessDecodeError("$where.size is $size, not a positive size")
				val glyphs = o.field("glyphs", where).arr("$where.glyphs").map {
					val g = it.num("$where.glyphs[]")
					if (g != Math.floor(g) || g < 0 || g > 65535) throw MarklessDecodeError("$where.glyphs holds $g, not a glyph id")
					g.toInt()
				}
				val xs = o.field("xs", where).arr("$where.xs").map { it.num("$where.xs[]").also { x -> if (x.isNaN() || x.isInfinite()) throw MarklessDecodeError("$where.xs holds $x") } }
				if (glyphs.isEmpty() || xs.size != glyphs.size) throw MarklessDecodeError("$where needs one x per glyph and at least one glyph")
				GlyphRun(o.field("face", where).str("$where.face"), size, glyphs, xs)
			}
			TextLine(l.field("top", at).num("$at.top"), l.field("baseline", at).num("$at.baseline"), runs)
		}

		private fun borderOps(v: Json, what: String): BorderOps {
			val o = v.obj(what)
			o.only(setOf("origin", "size", "widths", "ops"), what)
			val origin = o.field("origin", what).obj("$what.origin")
			o.field("size", what).obj("$what.size")
			if (o.field("widths", what).arr("$what.widths").size != 4) throw MarklessDecodeError("$what.widths is not four sides")
			val ops = o.field("ops", what).arr("$what.ops").mapIndexed { n, x ->
				val at = "$what.ops[$n]"
				val f = x.obj(at)
				f.only(setOf("op", "side", "alpha", "antialias", "points"), at)
				val op = f.field("op", at).str("$at.op")
				val side = f.field("side", at).num("$at.side").toInt()
				val points = f.field("points", at).arr("$at.points").map { it.num("$at.points[]") }
				val shaped = when (op) {
					"begin-layer", "end-layer", "save", "restore" -> points.isEmpty()
					"clip" -> points.size >= 6 && points.size % 2 == 0
					"fill" -> points.size >= 6 && points.size % 2 == 0 && side in 0..3
					"dot" -> points.size == 3 && side in 0..3
					else -> throw MarklessDecodeError("$at is an unknown border operation \"$op\"")
				}
				if (!shaped) throw MarklessDecodeError("$at ($op) has the wrong points or side")
				val antialias = f.field("antialias", at).let { if (it is Json.Bool) it.value else throw MarklessDecodeError("$at.antialias is not true or false") }
				BorderOp(op, side, f.field("alpha", at).num("$at.alpha"), antialias, points)
			}
			return BorderOps(origin.field("x", what).num("$what.origin.x"), origin.field("y", what).num("$what.origin.y"), ops)
		}

		private fun scalar(v: Json, what: String): JsValue = when (v) {
			is Json.Bool -> JsValue.Bool(v.value)
			is Json.Num -> JsValue.Num(v.value)
			is Json.Str -> JsValue.Str(v.value)
			Json.Null -> JsValue.Null
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
				"scroll-container" -> StyleWrite.ScrollContainer((o.field("x", what) as? Json.Bool ?: throw MarklessDecodeError("$what.x must be a boolean")).value, (o.field("y", what) as? Json.Bool ?: throw MarklessDecodeError("$what.y must be a boolean")).value)
				"scroll-indicators-hidden" -> StyleWrite.ScrollIndicatorsHidden
				"padding-box-clip" -> StyleWrite.PaddingBoxClip
				"scroll-bounce" -> StyleWrite.ScrollBounce((o.field("bounceX", what) as? Json.Bool ?: throw MarklessDecodeError("$what.bounceX must be a boolean")).value, (o.field("bounceY", what) as? Json.Bool ?: throw MarklessDecodeError("$what.bounceY must be a boolean")).value)
				"clip-path-inset" -> StyleWrite.ClipPathInset(o.field("edges", what).arr("edges").map {
					val e = it.obj("$what.edges[]")
					val unit = e.field("unit", what).str("unit")
					if (unit != "px" && unit != "%") throw MarklessDecodeError("$what: clip-path inset unit $unit is not px or %")
					e.field("value", what).num("value") to (unit == "%")
				}.also { if (it.size != 4) throw MarklessDecodeError("$what has ${it.size} inset edges, not 4") })
				"clip-text" -> StyleWrite.ClipText.also { o.field("texts", what).arr("texts").forEach { t -> t.str("$what.texts[]") } }
				"paint-order" -> StyleWrite.PaintOrder(o.field("host", what).str("host"), o.field("bucket", what).num("bucket").toInt(), o.field("rank", what).num("rank").toInt())
				else -> throw MarklessDecodeError("$what has unknown style write kind \"$kind\"")
			}
		}
	}
}

/** A list whose rows a phone lays out (Dragon's `planRepeats`): the box its rows hang from and one row's top boxes, by Dragon id. */
data class PlanRepeat(val id: String, val parent: String, val template: List<String>)

/** A row a page shows now: its key, the assignment its own states reach from the page's, and its texts by text node id. */
data class LaidOutRow(val key: String, val assignment: Int, val texts: Map<String, String>)
