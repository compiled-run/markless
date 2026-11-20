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
	/** Each shown child's top, worked out while measuring. */
	private var tops = IntArray(0)

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
		var y = paddingTop
		var pending = body
		var leading = collapses
		for ((i, child) in kids.withIndex()) {
			if (child.through()) { pending = maxOf(pending, child.marginAbove(), child.marginBelow()); tops[i] = y; continue }
			if (!leading) y += maxOf(pending, child.marginAbove())
			leading = false
			tops[i] = y
			y += child.measuredHeight
			pending = child.marginBelow()
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
			child.layout(paddingLeft, y, paddingLeft + child.measuredWidth, y + child.measuredHeight)
		}
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
