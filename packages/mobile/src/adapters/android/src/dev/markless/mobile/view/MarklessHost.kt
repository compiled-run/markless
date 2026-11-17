package dev.markless.mobile.view

import android.content.Context
import android.graphics.Rect
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.util.Log
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.accessibility.AccessibilityNodeInfo
import android.widget.Button
import android.widget.TextView
import dev.markless.mobile.core.EventName
import dev.markless.mobile.core.JournalEntry
import dev.markless.mobile.core.Node
import dev.markless.mobile.core.Payload
import dev.markless.mobile.core.Runtime
import dev.markless.mobile.style.StyleExport
import dev.markless.mobile.style.StyleWrite
import dev.markless.mobile.style.StyledNode
import kotlin.math.roundToInt

class MarklessHostError(message: String) : RuntimeException(message)

/** Looks up a font face by the id a style export names it with (`sha256:<hex>` of the font file). */
fun interface FontSource {
	fun typeface(id: String): Typeface
}

/** Faces bundled as APK assets at `markless-fonts/<hex>.ttf`, the hex of the font file's SHA-256. */
class AssetFonts(private val context: Context) : FontSource {
	private val cache = HashMap<String, Typeface>()
	override fun typeface(id: String): Typeface = cache.getOrPut(id) {
		if (!id.startsWith("sha256:")) throw MarklessHostError("font id \"$id\" is not a sha256 id")
		Typeface.createFromAsset(context.assets, "markless-fonts/${id.removePrefix("sha256:")}.ttf")
	}
}

/**
 * Builds the retained views for one payload and keeps them current. After [root] is built, views change only through
 * journal entries from the [runtime]. Pass the Dragon style export to place and paint the views; without it children stack.
 */
class MarklessHost(
	context: Context,
	payloadBytes: ByteArray,
	styleExportBytes: ByteArray? = null,
	fonts: FontSource = AssetFonts(context),
) {
	val payload: Payload = Payload.decode(payloadBytes)
	val runtime = Runtime(payload)
	val style: StyleExport? = styleExportBytes?.let { StyleExport.decode(it) }
	private val views = LinkedHashMap<String, View>()
	private val textViews = HashMap<String, TextView>()
	val root: View

	init {
		var top: View? = null
		for (node in payload.nodes) {
			val view = when (node) {
				is Node.Element -> element(context, node)
				is Node.Text -> text(context, node)
			}
			views[node.id] = view
			val parentId = node.parent
			if (parentId == null) {
				if (top != null) throw MarklessHostError("payload has more than one root element")
				top = view
			} else if (view !== views[parentId]) {
				(views.getValue(parentId) as? MarklessBox ?: throw MarklessHostError("\"${node.id}\" is inside \"$parentId\", which cannot hold children on Android")).addView(view)
			}
		}
		root = top ?: throw MarklessHostError("payload has no root element")
		for (e in payload.events) when (e.event) {
			EventName.Activate -> views.getValue(e.host).setOnClickListener { apply(runtime.dispatch(e.host, EventName.Activate)) }
		}
		style?.let { applyStyle(context, it, fonts) }
	}

	fun view(id: String): View = views[id] ?: throw MarklessHostError("no view for \"$id\"")

	/** The journal applier: the only code that changes a retained view after the first build. */
	fun apply(journal: List<JournalEntry>) {
		for (entry in journal) {
			val tv = textViews[entry.node] ?: throw MarklessHostError("journal names \"${entry.node}\", which is not a text node")
			tv.text = entry.value
			Log.i(TAG, "journal ${entry.toJson()}")
		}
	}

	private fun named(view: View, id: String, heading: Boolean = false) {
		view.isAccessibilityHeading = heading
		view.accessibilityDelegate = object : View.AccessibilityDelegate() {
			override fun onInitializeAccessibilityNodeInfo(host: View, info: AccessibilityNodeInfo) {
				super.onInitializeAccessibilityNodeInfo(host, info)
				info.viewIdResourceName = id
			}
		}
	}

	private fun element(context: Context, node: Node.Element): View = when (node.element) {
		"button" -> Button(context).apply {
			background = null
			minWidth = 0; minHeight = 0; minimumWidth = 0; minimumHeight = 0
			isAllCaps = false
			stateListAnimator = null
			includeFontPadding = false
			setPadding(0, 0, 0, 0)
			gravity = Gravity.TOP or Gravity.START
			named(this, node.id)
		}
		else -> MarklessBox(context).apply { named(this, node.id, heading = node.element in HEADINGS) }
	}

	private fun text(context: Context, node: Node.Text): View {
		val parent = views.getValue(node.parent)
		val view: TextView = if (parent is Button) {
			if (textViews.values.any { it === parent }) throw MarklessHostError("button \"${node.parent}\" has more than one text run; Android holds one per button")
			parent
		} else TextView(context).apply {
			includeFontPadding = false
			isClickable = false
			isFocusable = false
			named(this, node.id, heading = (parent.isAccessibilityHeading))
		}
		view.text = runtime.text(node.id)
		textViews[node.id] = view
		return view
	}

	private fun applyStyle(context: Context, style: StyleExport, fonts: FontSource) {
		val dpr = context.resources.displayMetrics.density.toDouble()
		if (Math.abs(dpr - style.dpr) > 1e-3) throw MarklessHostError("style export is for pixel ratio ${style.dpr}; this device is $dpr")
		val absolute = HashMap<String, Pair<Double, Double>>()
		for (s in style.nodes) {
			val p = s.parent?.let { absolute[it] ?: throw MarklessHostError("style node \"${s.id}\" precedes its parent") } ?: (0.0 to 0.0)
			absolute[s.id] = (p.first + s.frame.x) to (p.second + s.frame.y)
		}
		for (node in payload.nodes) {
			val s = style.byId[node.id] ?: throw MarklessHostError("style export has no node \"${node.id}\"")
			if (s.kind != (if (node is Node.Text) "text" else "element")) throw MarklessHostError("style node \"${node.id}\" is a ${s.kind}")
			val view = views.getValue(node.id)
			val (ax, ay) = absolute.getValue(s.id)
			if (node is Node.Text && view is Button) {
				val (bx, by) = absolute.getValue(node.parent)
				val box = style.byId.getValue(node.parent).frame
				val l = (ax - bx).roundToInt(); val t = (ay - by).roundToInt()
				view.setPadding(l, t, (bx + box.width).roundToInt() - (ax + s.frame.width).roundToInt(), (by + box.height).roundToInt() - (ay + s.frame.height).roundToInt())
			} else {
				val parentId = node.parent
				val rect = if (parentId == null) {
					Rect(ax.roundToInt(), ay.roundToInt(), (ax + s.frame.width).roundToInt(), (ay + s.frame.height).roundToInt())
				} else {
					val (px, py) = absolute.getValue(parentId)
					val ox = px.roundToInt(); val oy = py.roundToInt()
					Rect(ax.roundToInt() - ox, ay.roundToInt() - oy, (ax + s.frame.width).roundToInt() - ox, (ay + s.frame.height).roundToInt() - oy)
				}
				if (parentId == null) rootFrame = rect else (views.getValue(parentId) as MarklessBox).frames[view] = rect
			}
			paint(view, s, fonts, dpr)
		}
	}

	/** The root's frame inside the viewport, when a style export placed it. */
	var rootFrame: Rect? = null
		private set

	private fun paint(view: View, s: StyledNode, fonts: FontSource, dpr: Double) {
		var fill: Int? = null
		var styles: List<String>? = null
		var colors: List<Int>? = null
		var radii: List<Double>? = null
		for (w in s.writes) when (w) {
			is StyleWrite.BackgroundColor -> fill = w.color.argb
			StyleWrite.BorderWidths -> if (s.borderWidths == null) throw MarklessHostError("\"${s.id}\" writes border widths but has none")
			is StyleWrite.BorderStyles -> styles = w.styles
			is StyleWrite.BorderColors -> colors = w.colors.map { it.argb }
			is StyleWrite.BorderRadius -> radii = w.radii.map { it * dpr }
			is StyleWrite.Font -> (view as? TextView ?: throw MarklessHostError("font on \"${s.id}\", which is not text")).apply {
				typeface = fonts.typeface(w.family)
				setTextSize(TypedValue.COMPLEX_UNIT_PX, (w.size * dpr).toFloat())
			}
			is StyleWrite.TextColor -> (view as? TextView ?: throw MarklessHostError("text colour on \"${s.id}\", which is not text")).setTextColor(w.color.argb)
		}
		if (s.kind == "text") {
			if (view !is Button) view.background = null
			return
		}
		val bw = s.borderWidths ?: throw MarklessHostError("element \"${s.id}\" has no border widths")
		val st = styles ?: listOf("none", "none", "none", "none")
		val drawn = st.map { it != "none" && it != "hidden" }
		for (x in st) if (x != "none" && x != "hidden" && x != "solid") throw MarklessHostError("\"${s.id}\" has border style \"$x\"; Android draws solid borders only")
		val widths = listOf(bw.top, bw.right, bw.bottom, bw.left).mapIndexed { i, w -> if (drawn[i]) w else 0.0 }
		val anyBorder = widths.any { it > 0 }
		if (anyBorder && (widths.distinct().size != 1 || colors?.distinct()?.size != 1)) throw MarklessHostError("\"${s.id}\" has unequal border sides; not implemented on Android")
		val transparentFill = fill == null || (fill ushr 24) == 0
		if (transparentFill && !anyBorder) { view.background = null; return }
		view.background = GradientDrawable().apply {
			setColor(fill ?: 0)
			if (anyBorder) setStroke(widths[0].roundToInt(), colors!![0])
			radii?.let { r -> cornerRadii = r.map { it.toFloat() }.toFloatArray() }
		}
	}

	companion object {
		const val TAG = "MarklessHost"
		private val HEADINGS = setOf("h1", "h2", "h3", "h4", "h5", "h6")
	}
}
