package dev.markless.mobile.view

import android.content.Context
import android.graphics.Canvas
import android.graphics.Rect
import android.view.View
import android.widget.EditText
import android.widget.FrameLayout

/** The element view: children stack vertically until a style export assigns frames, then each child sits at its frame. */
class MarklessBox(context: Context) : FrameLayout(context) {
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
	/** clip-path: inset(): the rect in px, relative to the box, it and its children draw inside; empty draws nothing. Accessibility is untouched. */
	internal var clip: Rect? = null
		set(value) {
			if (field != value) invalidate()
			field = value
		}

	override fun draw(canvas: Canvas) {
		val c = clip ?: return super.draw(canvas)
		if (c.isEmpty) return
		val saved = canvas.save()
		canvas.clipRect(c)
		super.draw(canvas)
		canvas.restoreToCount(saved)
	}

	override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
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
		setMeasuredDimension(w, resolveSize(height, heightMeasureSpec))
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
		var y = paddingTop
		for (i in 0 until childCount) {
			val child = getChildAt(i)
			if (child.visibility == View.GONE) continue
			child.layout(paddingLeft, y, paddingLeft + child.measuredWidth, y + child.measuredHeight)
			y += child.measuredHeight
		}
	}
}
