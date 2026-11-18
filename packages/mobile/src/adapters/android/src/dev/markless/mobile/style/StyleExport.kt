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

const val STYLE_EXPORT_SCHEMA_0 = "dragon.native-style-export/0"
const val STYLE_EXPORT_SCHEMA = "dragon.native-style-export/1"
const val APP_STYLE_VERSION = "markless.native-app-style/0"

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

/** One media feature the host evaluates; only `prefers-color-scheme` is implemented. */
data class BandAtom(val feature: String, val keyword: String) {
	fun holds(dark: Boolean): Boolean = when (keyword) {
		"any" -> true
		"dark" -> dark
		"light" -> !dark
		else -> throw MarklessDecodeError("prefers-color-scheme has no keyword \"$keyword\"")
	}
}

/** The sheet's @media bands: per band, the truth value of every atom. */
data class Bands(val atoms: List<BandAtom>, val bands: List<List<Boolean>>) {
	/** The band whose truth vector is the device's. */
	fun band(dark: Boolean): Int {
		val reading = atoms.map { it.holds(dark) }
		val at = bands.indexOf(reading)
		if (at < 0) throw MarklessDecodeError("no @media band holds the device's reading $reading")
		return at
	}
}

/**
 * One platform's slice of a Dragon style export: per state assignment, frames (device px, relative to the parent box) and
 * lowered writes per node id; [next] is `next[a][s][v]`, the assignment reached by setting state s to its v-th value (-1: none).
 */
/** A system sheet's content at one resting height: its own document, laid out in the sheet's content area. */
data class SheetHeight(val snapPoint: Double, val style: StyleExport)

data class StyleExport(val dpr: Double, val viewportWidth: Double, val viewportHeight: Double, val states: List<StyleState>, val initial: Int, val assignments: List<Assignment>, val next: List<List<List<Int>>>, val bands: Bands? = null, val pageScrollUndecided: String? = null, val sheets: Map<String, List<SheetHeight>> = emptyMap()) {

	/** The index of [BAND_KEY] among [states], or -1 for an export without @media. */
	val bandState: Int = states.indexOfFirst { it.key == BAND_KEY }

	init {
		if ((bandState >= 0) != (bands != null)) throw MarklessDecodeError("style export has ${if (bands == null) "no band table" else "a band table"} but ${if (bandState >= 0) "a" else "no"} $BAND_KEY state")
		if (bands != null && states[bandState].domain != bands.bands.indices.map { JsValue.Num(it.toDouble()) }) throw MarklessDecodeError("$BAND_KEY's domain does not name every band")
	}

	/** The band for the device's appearance; 0 without @media. */
	fun band(dark: Boolean): Int = bands?.band(dark) ?: 0

	/**
	 * The assignment matching the cells' values at mount and the device's band, [initial] when it matches. Every state but the
	 * band must follow exactly one of [cells] (the payload's styled cells); with [everyCell], every styled cell must have a state
	 * (a page's export), else only the cells its nodes read do (a sheet's).
	 */
	fun start(cells: List<String>, value: (String) -> JsValue, dark: Boolean, everyCell: Boolean = true): Int {
		val wanted = states.mapIndexed { s, st -> if (s == bandState) JsValue.Num(band(dark).toDouble()) else value(cellOf(st, cells)) }
		if (everyCell) for (c in cells) stateFor(c)
		fun matches(a: Int) = states.withIndex().all { (s, st) -> assignments[a].values[st.key]?.let { Js.strictEquals(it, wanted[s]) } == true }
		if (matches(initial)) return initial
		return assignments.indices.firstOrNull(::matches) ?: throw MarklessDecodeError("no style assignment matches the values ${states.map { it.key }.zip(wanted)}")
	}

	private fun cellOf(state: StyleState, cells: List<String>): String {
		val named = cells.filter { state.key == it || state.key.endsWith("#$it") }
		if (named.size != 1) throw MarklessDecodeError("style state \"${state.key}\" follows ${named.size} styled cells of the payload")
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
				val nodes = t.field("nodes", target).arr("nodes").mapIndexed { n, v -> node(v, "nodes[$n]") { w, what -> writes(w, what) } }
				return StyleExport(dpr, width, height, emptyList(), 0, listOf(Assignment(emptyMap(), nodes)), listOf(emptyList()))
			}
			// Dragon's reason, for this target, when it leaves the page's scroll range undecided.
			val undecided = root["warnings"]?.arr("warnings")?.map { it.obj("warnings[]") }?.firstOrNull { w ->
				w.field("code", "warning").str("code") == "DRAGON_PAGE_SCROLL_UNDECIDED" && w.field("message", "warning").str("message").startsWith("$target: ")
			}?.let { it.getValue("message").str("message").removePrefix("$target: ") }
			return program(t, target, dpr, width, height, undecided) { w, what -> writes(w, what) }
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
				if (feature != "prefers-color-scheme") throw MarklessDecodeError("$what.atoms[$n]: @media ($feature) is not implemented on Android; this host reads prefers-color-scheme only")
				if (f.field("comparisons", what).arr("comparisons").isNotEmpty()) throw MarklessDecodeError("$what.atoms[$n]: prefers-color-scheme with comparisons")
				BandAtom(feature, f.field("keyword", what).str("keyword")).also { it.holds(false) }
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
			root.only(setOf("version", "units", "warnings", "fonts", "targets"), "app style")
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
				o.only(setOf("pattern", "component", "compiler", "readiness", "states", "initial", "next", "bands", "assignments", "sheets"), "routes[$n]")
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
				routes[pattern] = program(o, "routes[$n] ($pattern)", dpr, width, height, null, listed).copy(sheets = sheets)
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
