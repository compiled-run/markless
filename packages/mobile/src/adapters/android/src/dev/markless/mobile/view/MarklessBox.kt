package dev.markless.mobile.view

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import android.graphics.Rect
import android.graphics.RectF
import android.view.View
import android.view.ViewGroup
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.TextView
import dev.markless.mobile.style.PaddingBox

/** The element view: children stack vertically until a style export assigns frames, then each child sits at its frame. */
open class MarklessBox(context: Context) : FrameLayout(context), SkipsBackdrop {
	internal val frames = HashMap<View, Rect>()
	/** Each child's place in paint order: 0 in flow, below 0 under it, above 0 a positioned box in its stacking context's order. */
	private val orderKeys = HashMap<View, Int>()

	init {
		isChildrenDrawingOrderEnabled = true
	}

	internal fun order(child: View, key: Int) {
		if ((orderKeys[child] ?: 0) == key) return
		if (key == 0) orderKeys.remove(child) else orderKeys[child] = key
		invalidate()
	}

	// Stable: children with equal keys keep tree order; touch dispatch follows the same order.
	override fun getChildDrawingOrder(childCount: Int, drawingPosition: Int): Int =
		(0 until childCount).sortedBy { orderKeys[getChildAt(it)] ?: 0 }[drawingPosition]

	/** The children in the order they are drawn. */
	internal fun drawingOrder(): List<View> = (0 until childCount).sortedBy { orderKeys[getChildAt(it)] ?: 0 }.map(::getChildAt)

	/** The children drawn after [child], in drawing order. */
	internal fun drawnAfter(child: View): List<View> {
		val order = drawingOrder()
		return order.drop(order.indexOf(child) + 1)
	}


	/** clip-path: inset(): the rect in px, relative to the box, it and its children draw inside; empty draws nothing. Accessibility is untouched. */
	internal var clip: Rect? = null
		set(value) {
			if (field != value) invalidate()
			field = value
		}

	/** Each child's outer shadows: a bitmap drawn just before the child, at a device px offset from its top-left. */
	private val childShadows = HashMap<View, Triple<Bitmap, Int, Int>>()

	internal fun childShadow(child: View, shadow: Triple<Bitmap, Int, Int>?) {
		if (childShadows[child] == shadow) return
		if (shadow == null) childShadows.remove(child) else childShadows[child] = shadow
		invalidate()
	}

	/** This box's inset shadows, over its background and under its children, at a device px offset from its top-left. */
	internal var insetShadow: Triple<Bitmap, Int, Int>? = null
		set(value) {
			if (field != value) invalidate()
			field = value
		}


	override fun onDraw(canvas: Canvas) {
		super.onDraw(canvas)
		insetShadow?.let { (bitmap, dx, dy) -> canvas.drawBitmap(bitmap, dx.toFloat(), dy.toFloat(), null) }
	}

	override fun onViewRemoved(child: View) {
		super.onViewRemoved(child)
		childShadows.remove(child)
	}

	override fun draw(canvas: Canvas) {
		val c = clip ?: return super.draw(canvas)
		if (c.isEmpty) return
		val saved = canvas.save()
		canvas.clipRect(c)
		super.draw(canvas)
		canvas.restoreToCount(saved)
	}

	/** A scroll container's content box, or a sheet's styled content: its size in px whatever its parent offers. */
	internal var fixedSize: Pair<Int, Int>? = null

	/** Without a style export: a `table` lines its rows' cells up in columns; a `row` lays its cells side by side. */
	internal var table: String? = null
	/** A row's column widths, set by its table while measuring. */
	private var columns: IntArray? = null
	private val gap = (8 * context.resources.displayMetrics.density).toInt()

	/** A list's markers (`•`, `1.`), drawn in its start padding beside each item's first line; not text a reader reaches. */
	internal var markers: Map<View, String> = emptyMap()
		set(value) { field = value; invalidate() }
	/** Inside a `<center>`: each child sits in the middle of the line. */
	internal var centred = false
	/** A summary's triangle, ▸ collapsed or ▾ expanded, drawn in a start inset beside its first line; null on any other box. */
	internal var disclosure: Boolean? = null
		set(value) {
			if (field == null && value != null) setPadding(disclosureInset(), paddingTop, paddingRight, paddingBottom)
			field = value
			invalidate()
		}
	private val markerPaint = TextView(context).let { t -> Paint(Paint.ANTI_ALIAS_FLAG).apply { textSize = t.textSize; color = t.currentTextColor } }

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
		val w = if (MeasureSpec.getMode(widthMeasureSpec) == MeasureSpec.EXACTLY || centred) MeasureSpec.getSize(widthMeasureSpec) else widest + paddingLeft + paddingRight
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
			val x = if (centred) paddingLeft + (width - paddingLeft - paddingRight - child.measuredWidth) / 2 else paddingLeft
			child.layout(x, y, x + child.measuredWidth, y + child.measuredHeight)
			y += child.measuredHeight
		}
	}

	/** Overflow other than visible: the padding box its children, and their shadows, draw inside; null when overflow is visible. */
	internal var childClip: PaddingBox? = null
		set(value) {
			if (field != value) invalidate()
			field = value
		}

	private fun disclosureInset(): Int =
		kotlin.math.ceil(maxOf(markerPaint.measureText(DISCLOSURE_CLOSED), markerPaint.measureText(DISCLOSURE_OPEN)) + gap).toInt()

	// A box that clips draws its own outline outside the clip: Dragon refuses any other outline under an overflow clip.
	override fun drawChild(canvas: Canvas, child: View, drawingTime: Long): Boolean {
		if (child in Backdrop.skip) return false
		val box = childClip?.takeIf { child !is OutlineView }
		val saved = canvas.save()
		if (box != null) {
			val inner = RectF(box.left.toFloat(), box.top.toFloat(), width - box.right.toFloat(), height - box.bottom.toFloat())
			if (box.rounded) canvas.clipPath(Path().apply { addRoundRect(inner, box.radii.map { it.toFloat() }.toFloatArray(), Path.Direction.CW) })
			else canvas.clipRect(inner)
		}
		childShadows[child]?.let { (bitmap, dx, dy) -> canvas.drawBitmap(bitmap, (child.left + dx).toFloat(), (child.top + dy).toFloat(), null) }
		val drawn = super.drawChild(canvas, child, drawingTime)
		canvas.restoreToCount(saved)
		return drawn
	}

	override fun dispatchDraw(canvas: Canvas) {
		super.dispatchDraw(canvas)
		disclosure?.let { open ->
			val first = (0 until childCount).map(::getChildAt).firstOrNull { it.visibility != View.GONE }
			val baseline = first?.let { (it.top + (baselineIn(it) ?: markerPaint.textSize.toInt())).toFloat() } ?: markerPaint.textSize
			canvas.drawText(if (open) DISCLOSURE_OPEN else DISCLOSURE_CLOSED, 0f, baseline, markerPaint)
		}
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

private const val DISCLOSURE_CLOSED = "\u25B8"
private const val DISCLOSURE_OPEN = "\u25BE"
