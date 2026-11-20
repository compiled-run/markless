package dev.markless.mobile.view

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.Path
import android.graphics.Typeface
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.style.BackgroundColorSpan
import android.text.style.ForegroundColorSpan
import android.text.style.RelativeSizeSpan
import android.text.style.StrikethroughSpan
import android.text.style.StyleSpan
import android.text.style.SubscriptSpan
import android.text.style.SuperscriptSpan
import android.text.style.TypefaceSpan
import android.text.style.UnderlineSpan
import android.view.View
import dev.markless.mobile.core.DefaultStyle
import dev.markless.mobile.core.Drawing
import dev.markless.mobile.core.Node
import dev.markless.mobile.core.Payload
import dev.markless.mobile.core.ShapePaint

/** The text style a block gives the text inside it: its own default style and its ancestors', combined. */
data class BlockText(val bold: Boolean, val italic: Boolean, val monospace: Boolean, val size: Double, val preformatted: Boolean)

/**
 * Text flow without a style export, as `nativeParagraphs` (packages/mobile/src/paragraphs.ts) defines it: among one parent's
 * children in one place, each run of text nodes and flowing elements is one paragraph, shown as one text view.
 */
class TextFlow(payload: Payload) {
	private val byId = payload.nodes.associateBy { it.id }
	private val children = payload.nodes.groupBy { it.parent }
	/** Each paragraph's nodes in order, by its first node. */
	val paragraphs = LinkedHashMap<String, List<String>>()
	/** The first node of the paragraph a node belongs to, for every node a paragraph holds (descendants included). */
	val leadOf = HashMap<String, String>()

	init {
		val open = HashMap<String, MutableList<String>>()
		val inFlow = HashSet<String>()
		fun key(n: Node) = "${n.parent ?: ""}\u0000${n.arm?.let { "${it.branch}#${it.index}" } ?: ""}\u0000${n.row ?: ""}"
		for (node in payload.nodes) {
			val p = node.parent
			if (p != null && p in inFlow) {
				if (node is Node.Text || flowing(node)) inFlow.add(node.id)
				continue
			}
			val k = key(node)
			if (node is Node.Text || flowing(node)) {
				if (node is Node.Element) inFlow.add(node.id)
				val run = open.getOrPut(k) { ArrayList<String>().also { paragraphs[node.id] = it } }
				run.add(node.id)
			} else {
				open.remove(k)
				val prefix = "${p ?: ""}\u0000"
				open.keys.removeAll { it.startsWith(prefix) }
			}
		}
		for ((lead, nodes) in paragraphs) {
			fun mark(id: String) { leadOf[id] = lead; for (c in children[id].orEmpty()) mark(c.id) }
			for (id in nodes) mark(id)
		}
	}

	fun flowing(node: Node?): Boolean = node is Node.Element && node.defaultStyle?.flow != null

	fun node(id: String): Node? = byId[id]

	/** The style text inherits inside [parent]: every non-flowing ancestor's default style, nearest last. */
	fun blockText(parent: String?): BlockText {
		var bold = false; var italic = false; var mono = false; var size = 1.0; var pre = false
		var at = parent
		while (at != null) {
			val n = byId[at] ?: break
			if (n is Node.Element && !flowing(n)) n.defaultStyle?.let { s ->
				bold = bold || s.bold; italic = italic || s.italic; mono = mono || s.monospace; size *= s.size; pre = pre || s.preformatted
			}
			at = n.parent
		}
		return BlockText(bold, italic, mono, size, pre)
	}

	/**
	 * The paragraph that starts at [lead], for the row instance [suffix] (`@key` or ""): its texts from [text], whitespace
	 * collapsed as CSS `white-space: normal` unless [preformatted], each flowing element's look as spans.
	 */
	fun render(lead: String, suffix: String, preformatted: Boolean, text: (String) -> String?): CharSequence {
		val out = SpannableStringBuilder()
		var pending = false
		var spaceAt = -1
		fun chars(s: String) {
			for (c in s) {
				if (!preformatted && (c == ' ' || c == '\t' || c == '\n' || c == '\r' || c == '\u000c')) { pending = true; continue }
				if (pending && out.isNotEmpty() && out[out.length - 1] != '\n') { spaceAt = out.length; out.append(' ') }
				pending = false
				out.append(c)
			}
		}
		fun emit(node: Node) {
			when (node) {
				is Node.Text -> chars(text(node.id + suffix) ?: "")
				is Node.Element -> {
					val s = node.defaultStyle ?: DefaultStyle()
					if (s.flow == "break") { out.append('\n'); pending = false; return }
					var start = out.length
					if (s.quotes) chars("“")
					for (c in children[node.id].orEmpty()) emit(c)
					if (s.quotes) chars("”")
					if (spaceAt == start) start += 1
					if (out.length > start) spans(s).forEach { out.setSpan(it, start, out.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE) }
				}
				else -> {}
			}
		}
		for (id in paragraphs.getValue(lead)) emit(byId.getValue(id))
		return out
	}

	private fun spans(s: DefaultStyle): List<Any> = buildList {
		if (s.bold && s.italic) add(StyleSpan(Typeface.BOLD_ITALIC)) else if (s.bold) add(StyleSpan(Typeface.BOLD)) else if (s.italic) add(StyleSpan(Typeface.ITALIC))
		if (s.monospace) add(TypefaceSpan("monospace"))
		if (s.size != 1.0) add(RelativeSizeSpan(s.size.toFloat()))
		when (s.line) { "underline" -> add(UnderlineSpan()); "line-through" -> add(StrikethroughSpan()) }
		when (s.shift) { "sub" -> add(SubscriptSpan()); "super" -> add(SuperscriptSpan()) }
		if (s.highlight) { add(BackgroundColorSpan(Color.YELLOW)); add(ForegroundColorSpan(Color.BLACK)) }
	}
}

/** A paragraph's text view: with no text it takes no space, as an empty paragraph has no height on the web, unless a style export sizes it. */
class FlowText(context: Context) : android.widget.TextView(context) {
	override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
		if (text.isEmpty() && MeasureSpec.getMode(heightMeasureSpec) != MeasureSpec.EXACTLY) setMeasuredDimension(0, 0)
		else super.onMeasure(widthMeasureSpec, heightMeasureSpec)
	}

	/** TextView skips a new layout when the text changes inside a fixed box; one that empties or fills changes height here. */
	override fun onTextChanged(text: CharSequence?, start: Int, lengthBefore: Int, lengthAfter: Int) {
		super.onTextChanged(text, start, lengthBefore, lengthAfter)
		if ((lengthBefore == 0) != (this.text.isEmpty())) requestLayout()
	}
}

/** `<hr>`: a thin gray line across the available width, with space above and below. */
class RuleView(context: Context) : View(context) {
	private val density = context.resources.displayMetrics.density
	private val paint = Paint().apply { color = 0xFF808080.toInt(); strokeWidth = density }

	override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
		setMeasuredDimension(MeasureSpec.getSize(widthMeasureSpec), resolveSize((17 * density).toInt(), heightMeasureSpec))
	}

	override fun onDraw(canvas: Canvas) {
		val y = height / 2f
		canvas.drawLine(0f, y, width.toFloat(), y, paint)
	}
}

/**
 * An inline `<svg>`: draws the shapes the compiler compiled, its viewBox centred and fitted in the view (xMidYMid meet).
 * [emPx] is the font size of the text it sits in, in device px, which sizes a drawing measured in ems.
 */
class DrawingView(context: Context, private val drawing: Drawing, emPx: Double) : View(context) {
	private val density = context.resources.displayMetrics.density
	/** Device px per unit of the drawing's width and height. */
	private val unit: Double = if (drawing.em) emPx else density.toDouble()
	/** What `currentColor` paints: the svg's text colour from a style export, else black. */
	var currentColor: Int = Color.BLACK
		set(value) { field = value; invalidate() }
	private val paths = drawing.shapes.map { shape ->
		Path().apply {
			fillType = if (shape.evenOdd) Path.FillType.EVEN_ODD else Path.FillType.WINDING
			val v = shape.path
			var i = 0
			while (i < v.size) {
				when (v[i].toInt()) {
					0 -> { moveTo(v[i + 1].toFloat(), v[i + 2].toFloat()); i += 3 }
					1 -> { lineTo(v[i + 1].toFloat(), v[i + 2].toFloat()); i += 3 }
					3 -> { cubicTo(v[i + 1].toFloat(), v[i + 2].toFloat(), v[i + 3].toFloat(), v[i + 4].toFloat(), v[i + 5].toFloat(), v[i + 6].toFloat()); i += 7 }
					4 -> { close(); i += 1 }
					else -> throw MarklessHostError("unknown path verb ${v[i]}")
				}
			}
		}
	}
	private val paint = Paint(Paint.ANTI_ALIAS_FLAG)

	/** The width over the height the web gives it without a size: the viewBox's, else 300 by 150. */
	private val ratio: Double = drawing.viewBox?.let { it[3] / it[2] } ?: 0.5

	override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
		val available = MeasureSpec.getSize(widthMeasureSpec).toDouble()
		val w = drawing.width?.let { it * unit } ?: drawing.height?.let { it * unit / ratio } ?: if (MeasureSpec.getMode(widthMeasureSpec) == MeasureSpec.UNSPECIFIED) 300.0 * density else available
		val h = drawing.height?.let { it * unit } ?: (w * ratio)
		setMeasuredDimension(w.toInt(), h.toInt())
	}

	override fun onDraw(canvas: Canvas) {
		canvas.save()
		drawing.viewBox?.let { (x, y, w, h) ->
			val scale = minOf(width / w, height / h)
			canvas.translate((-x * scale + (width - w * scale) / 2).toFloat(), (-y * scale + (height - h * scale) / 2).toFloat())
			canvas.scale(scale.toFloat(), scale.toFloat())
		} ?: canvas.scale(density, density)
		for ((index, shape) in drawing.shapes.withIndex()) {
			canvas.save()
			shape.transform?.let { (a, b, c, d, e, f) ->
				canvas.concat(Matrix().apply { setValues(floatArrayOf(a.toFloat(), c.toFloat(), e.toFloat(), b.toFloat(), d.toFloat(), f.toFloat(), 0f, 0f, 1f)) })
			}
			shape.fill?.let { fill ->
				paint.reset(); paint.isAntiAlias = true
				paint.style = Paint.Style.FILL
				paint.color = colorOf(fill)
				canvas.drawPath(paths[index], paint)
			}
			shape.stroke?.let { stroke ->
				paint.reset(); paint.isAntiAlias = true
				paint.style = Paint.Style.STROKE
				paint.color = colorOf(stroke)
				paint.strokeWidth = shape.width.toFloat()
				paint.strokeCap = when (shape.cap) { "round" -> Paint.Cap.ROUND; "square" -> Paint.Cap.SQUARE; else -> Paint.Cap.BUTT }
				paint.strokeJoin = when (shape.join) { "round" -> Paint.Join.ROUND; "bevel" -> Paint.Join.BEVEL; else -> Paint.Join.MITER }
				paint.strokeMiter = shape.miterLimit.toFloat()
				canvas.drawPath(paths[index], paint)
			}
			canvas.restore()
		}
		canvas.restore()
	}

	private fun colorOf(paint: ShapePaint): Int = when (paint) {
		is ShapePaint.Color -> paint.color.argb
		ShapePaint.Current -> currentColor
	}
}

private operator fun <T> List<T>.component6(): T = this[5]
