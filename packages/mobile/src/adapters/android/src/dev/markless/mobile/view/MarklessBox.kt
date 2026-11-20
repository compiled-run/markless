package dev.markless.mobile.view

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Rect
import android.view.View
import android.view.ViewGroup
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.TextView

/**
 * Views of inline-level boxes (`<a>`, `<button>`, `<input>`, `<img>`) laid out without a style export: in their parent's
 * stack they share lines with each other and with the paragraphs beside them, as the web's inline formatting context does.
 */
internal val inlineLevel: MutableSet<View> = java.util.Collections.newSetFromMap(java.util.WeakHashMap())

/** The element view: children stack vertically until a style export assigns frames, then each child sits at its frame. */
open class MarklessBox(context: Context) : FrameLayout(context) {
	internal val frames = HashMap<View, Rect>()
	/** A scroll container's content box, or a sheet's styled content: its size in px whatever its parent offers. */
	internal var fixedSize: Pair<Int, Int>? = null

	/** Without a style export: a `table` lines its rows' cells up in columns; a `row` lays its cells side by side. */
	internal var table: String? = null
	/** A row's column widths, set by its table while measuring. */
	private var columns: IntArray? = null
	private val gap = (8 * context.resources.displayMetrics.density).toInt()

	/** Without a style export: the element's default margins above and below, in px, before they collapse. */
	internal var marginTop = 0
	internal var marginBottom = 0
	/** The page's body: its margin in px on every side, which its children's margins collapse into (`body { margin: 8px }`). */
	internal var body = 0
	/** Each shown child's top and start offset, worked out while measuring. */
	private var tops = IntArray(0)
	private var lefts = IntArray(0)

	/** Whether a first and last child's margins pass through this box, as they do through a block with no border or padding. */
	private val collapses get() = frames.isEmpty() && table == null && body == 0 && fixedSize == null && paddingTop == 0 && paddingBottom == 0

	private fun shown(): List<View> = (0 until childCount).map { getChildAt(it) }.filter { it.visibility != View.GONE }

	/** An empty paragraph, or a box with nothing shown in it: it has no height and margins collapse through it. */
	private fun View.through(): Boolean = measuredHeight == 0 && (this is FlowText || (this is MarklessBox && collapses))

	private fun View.marginAbove(): Int = (this as? MarklessBox)?.let { if (it.collapses) maxOf(it.marginTop, it.leading()) else it.marginTop } ?: 0
	private fun View.marginBelow(): Int = (this as? MarklessBox)?.let { if (it.collapses) maxOf(it.marginBottom, it.trailing()) else it.marginBottom } ?: 0

	/** The margins that reach this box's top edge from its first children. */
	private fun leading(): Int {
		var m = 0
		for (c in shown()) { m = maxOf(m, c.marginAbove()); if (!c.through()) break; m = maxOf(m, c.marginBelow()) }
		return m
	}

	private fun trailing(): Int {
		var m = 0
		for (c in shown().asReversed()) { m = maxOf(m, c.marginBelow()); if (!c.through()) break; m = maxOf(m, c.marginAbove()) }
		return m
	}

	/** A list's markers (`•`, `1.`), drawn in its start padding beside each item's first line; not text a reader reaches. */
	internal var markers: Map<View, String> = emptyMap()
		set(value) { field = value; invalidate() }
	private val markerPaint = TextView(context).let { t -> Paint(Paint.ANTI_ALIAS_FLAG).apply { textSize = t.textSize } }

	init {
		setWillNotDraw(false)
	}

	override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
		if (frames.isNotEmpty()) {
			for (i in 0 until childCount) {
				val child = getChildAt(i)
				if (child.visibility == View.GONE) continue
				val f = frames[child] ?: throw IllegalStateException("a child of a framed box has no frame")
				child.measure(MeasureSpec.makeMeasureSpec(f.width(), MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(f.height(), MeasureSpec.EXACTLY))
			}
			val fixed = fixedSize
			if (fixed != null) setMeasuredDimension(fixed.first, fixed.second)
			else setMeasuredDimension(MeasureSpec.getSize(widthMeasureSpec), MeasureSpec.getSize(heightMeasureSpec))
			return
		}
		val width = MeasureSpec.getSize(widthMeasureSpec) - paddingLeft - paddingRight
		if (table == "row") {
			val cells = (0 until childCount).map { getChildAt(it) }.filter { it.visibility != View.GONE }
			val cols = columns
			var x = 0
			var tallest = 0
			for ((i, cell) in cells.withIndex()) {
				val w = cols?.getOrNull(i)
				cell.measure(if (w != null) MeasureSpec.makeMeasureSpec(w, MeasureSpec.EXACTLY) else MeasureSpec.makeMeasureSpec(width, MeasureSpec.AT_MOST), MeasureSpec.makeMeasureSpec(0, MeasureSpec.UNSPECIFIED))
				x += cell.measuredWidth + if (i > 0) gap else 0
				tallest = maxOf(tallest, cell.measuredHeight)
			}
			setMeasuredDimension(x + paddingLeft + paddingRight, resolveSize(tallest + paddingTop + paddingBottom, heightMeasureSpec))
			return
		}
		if (table == "table") {
			val rows = ArrayList<MarklessBox>()
			fun collect(group: ViewGroup) {
				for (i in 0 until group.childCount) {
					val child = group.getChildAt(i) as? MarklessBox ?: continue
					if (child.visibility == View.GONE || child.table == "table") continue
					if (child.table == "row") rows.add(child) else collect(child)
				}
			}
			collect(this)
			val widths = ArrayList<Int>()
			for (row in rows) {
				val cells = (0 until row.childCount).map { row.getChildAt(it) }.filter { it.visibility != View.GONE }
				for ((i, cell) in cells.withIndex()) {
					cell.measure(MeasureSpec.makeMeasureSpec(width, MeasureSpec.AT_MOST), MeasureSpec.makeMeasureSpec(0, MeasureSpec.UNSPECIFIED))
					if (i < widths.size) widths[i] = maxOf(widths[i], cell.measuredWidth) else widths.add(cell.measuredWidth)
				}
			}
			for (row in rows) row.columns = widths.toIntArray()
		}
		var widest = 0
		val kids = shown()
		for (child in kids) {
			// Text fields span the stack's width, as platform fields do; everything else takes its content width.
			child.measure(MeasureSpec.makeMeasureSpec(width, if (child is EditText) MeasureSpec.EXACTLY else MeasureSpec.AT_MOST), MeasureSpec.makeMeasureSpec(0, MeasureSpec.UNSPECIFIED))
			widest = maxOf(widest, child.measuredWidth)
		}
		// Margins between siblings meet at the larger; the first and last child's leave through the box when it collapses.
		tops = IntArray(kids.size)
		lefts = IntArray(kids.size)
		var y = paddingTop
		var pending = body
		var leading = collapses
		var i = 0
		while (i < kids.size) {
			val run = runAt(kids, i)
			if (run > i + 1 || kids[i] in inlineLevel) {
				// A line box: no margins of its own, so the margin waiting above it is the whole gap.
				val lines = lineUp(kids, i, run, width, if (leading) y else y + pending)
				if (lines.height > 0) { y = lines.bottom; leading = false; pending = 0; widest = maxOf(widest, lines.widest) }
				i = run
				continue
			}
			val child = kids[i]
			if (child.through()) { pending = maxOf(pending, child.marginAbove(), child.marginBelow()); tops[i] = y; i++; continue }
			if (!leading) y += maxOf(pending, child.marginAbove())
			leading = false
			tops[i] = y
			y += child.measuredHeight
			pending = child.marginBelow()
			i++
		}
		if (!collapses) y += maxOf(pending, body)
		val height = y + paddingBottom
		val w = if (MeasureSpec.getMode(widthMeasureSpec) == MeasureSpec.EXACTLY) MeasureSpec.getSize(widthMeasureSpec) else widest + paddingLeft + paddingRight
		setMeasuredDimension(maxOf(w, minimumWidth), resolveSize(maxOf(height, minimumHeight), heightMeasureSpec))
	}

	override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
		if (frames.isNotEmpty()) {
			for (i in 0 until childCount) {
				val child = getChildAt(i)
				if (child.visibility == View.GONE) continue
				val f = frames.getValue(child)
				child.layout(f.left, f.top, f.right, f.bottom)
			}
			return
		}
		if (table == "row") {
			var x = paddingLeft
			for (i in 0 until childCount) {
				val child = getChildAt(i)
				if (child.visibility == View.GONE) continue
				child.layout(x, paddingTop, x + child.measuredWidth, paddingTop + child.measuredHeight)
				x += child.measuredWidth + gap
			}
			return
		}
		for ((i, child) in shown().withIndex()) {
			val y = tops.getOrElse(i) { paddingTop }
			val x = paddingLeft + lefts.getOrElse(i) { 0 }
			child.layout(x, y, x + child.measuredWidth, y + child.measuredHeight)
		}
	}

	/** Where the run of line-sharing children that starts at [start] ends: inline-level boxes and the paragraphs beside them. */
	private fun runAt(kids: List<View>, start: Int): Int {
		var end = start
		while (end < kids.size && (kids[end] in inlineLevel || kids[end] is FlowText)) end++
		return if ((start until end).any { kids[it] in inlineLevel }) end else start + 1
	}

	private class Lines(val bottom: Int, val height: Int, val widest: Int)

	/**
	 * Places kids [from] until [to] in lines [width] wide from [top], as the web's inline formatting context places inline
	 * boxes: side by side, a space between two only where the text there has whitespace, a new line when the next one does
	 * not fit, and each line's items on one baseline.
	 */
	private fun lineUp(kids: List<View>, from: Int, to: Int, width: Int, top: Int): Lines {
		val line = ArrayList<Int>()
		var lineTop = top
		var x = 0
		var widest = 0
		var spaced = false
		val space = (from until to).map { kids[it] }.firstNotNullOfOrNull { (it as? TextView)?.paint?.measureText(" ") }?.toInt() ?: markerPaint.measureText(" ").toInt()
		fun close() {
			if (line.isEmpty()) return
			val base = line.maxOf { baselineOf(kids[it]) }
			val below = line.maxOf { kids[it].measuredHeight - baselineOf(kids[it]) }
			for (k in line) tops[k] = lineTop + base - baselineOf(kids[k])
			widest = maxOf(widest, x)
			lineTop += base + below
			line.clear()
			x = 0
		}
		for (k in from until to) {
			val child = kids[k]
			val text = child as? FlowText
			if (child.measuredHeight == 0 && child.measuredWidth == 0) {
				// Whitespace alone between two boxes is a space; an empty paragraph is nothing.
				if (text?.spaceBefore == true) spaced = true
				tops[k] = lineTop
				continue
			}
			val gap = if (x > 0 && (spaced || text?.spaceBefore == true)) space else 0
			if (x > 0 && x + gap + child.measuredWidth > width) close()
			lefts[k] = if (x > 0) x + gap else 0
			x = lefts[k] + child.measuredWidth
			line.add(k)
			spaced = text?.spaceAfter == true
		}
		close()
		return Lines(lineTop, lineTop - top, widest)
	}

	/** Where [view]'s first line of text sits from its top once measured; a box with no text sits on its bottom edge, as an image does. */
	private fun baselineOf(view: View): Int = when (view) {
		is TextView -> view.baseline.takeIf { it >= 0 } ?: view.measuredHeight
		is MarklessBox -> view.firstBaseline() ?: view.measuredHeight
		else -> view.measuredHeight
	}

	/** This box's first line's baseline from its top, after measuring. */
	private fun firstBaseline(): Int? {
		val kids = shown()
		for ((i, child) in kids.withIndex()) {
			if (child.measuredHeight == 0) continue
			val inner = when (child) {
				is TextView -> child.baseline.takeIf { it >= 0 }
				is MarklessBox -> child.firstBaseline()
				else -> null
			} ?: return null
			return tops.getOrElse(i) { paddingTop } + inner
		}
		return null
	}

	override fun dispatchDraw(canvas: Canvas) {
		super.dispatchDraw(canvas)
		markerPaint.color = canvasText(resources.configuration)
		for ((child, marker) in markers) {
			if (child.parent !== this || child.visibility == View.GONE) continue
			val baseline = baselineIn(child) ?: markerPaint.textSize.toInt()
			val x = child.left - gap / 2f - markerPaint.measureText(marker)
			canvas.drawText(marker, x, (child.top + baseline).toFloat(), markerPaint)
		}
	}

	/** The first line's baseline inside [view], from its top. */
	private fun baselineIn(view: View): Int? = when (view) {
		is TextView -> view.baseline.takeIf { it >= 0 }
		is ViewGroup -> (0 until view.childCount).map { view.getChildAt(it) }.firstOrNull { it.visibility != View.GONE }?.let { c -> baselineIn(c)?.plus(c.top) }
		else -> null
	}
}
