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
class MarklessBox(context: Context) : FrameLayout(context) {
	internal val frames = HashMap<View, Rect>()
	/** A scroll container's content box: its size in px whatever its scroll view offers, so the scroll view has a range. */
	internal var fixedSize: Pair<Int, Int>? = null

	/** Without a style export: a `table` lines its rows' cells up in columns; a `row` lays its cells side by side. */
	internal var table: String? = null
	/** A row's column widths, set by its table while measuring. */
	private var columns: IntArray? = null
	private val gap = (8 * context.resources.displayMetrics.density).toInt()

	/** A list's markers (`•`, `1.`), drawn in its start padding beside each item's first line; not text a reader reaches. */
	internal var markers: Map<View, String> = emptyMap()
		set(value) { field = value; invalidate() }
	private val markerPaint = TextView(context).let { t -> Paint(Paint.ANTI_ALIAS_FLAG).apply { textSize = t.textSize; color = t.currentTextColor } }

	init {
		setWillNotDraw(false)
	}

	override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
		fixedSize?.let { (w, h) ->
			for ((child, f) in frames) child.measure(MeasureSpec.makeMeasureSpec(f.width(), MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(f.height(), MeasureSpec.EXACTLY))
			setMeasuredDimension(w, h)
			return
		}
		if (frames.isNotEmpty()) {
			for (i in 0 until childCount) {
				val child = getChildAt(i)
				if (child.visibility == View.GONE) continue
				val f = frames[child] ?: throw IllegalStateException("a child of a framed box has no frame")
				child.measure(MeasureSpec.makeMeasureSpec(f.width(), MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(f.height(), MeasureSpec.EXACTLY))
			}
			setMeasuredDimension(MeasureSpec.getSize(widthMeasureSpec), MeasureSpec.getSize(heightMeasureSpec))
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
		var height = paddingTop + paddingBottom
		var widest = 0
		for (i in 0 until childCount) {
			val child = getChildAt(i)
			if (child.visibility == View.GONE) continue
			// Text fields span the stack's width, as platform fields do; everything else takes its content width.
			child.measure(MeasureSpec.makeMeasureSpec(width, if (child is EditText) MeasureSpec.EXACTLY else MeasureSpec.AT_MOST), MeasureSpec.makeMeasureSpec(0, MeasureSpec.UNSPECIFIED))
			height += child.measuredHeight
			widest = maxOf(widest, child.measuredWidth)
		}
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
		var y = paddingTop
		for (i in 0 until childCount) {
			val child = getChildAt(i)
			if (child.visibility == View.GONE) continue
			child.layout(paddingLeft, y, paddingLeft + child.measuredWidth, y + child.measuredHeight)
			y += child.measuredHeight
		}
	}

	override fun dispatchDraw(canvas: Canvas) {
		super.dispatchDraw(canvas)
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
