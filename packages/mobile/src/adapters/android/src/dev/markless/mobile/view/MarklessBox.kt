package dev.markless.mobile.view

import android.content.Context
import android.graphics.Rect
import android.view.View
import android.widget.EditText
import android.widget.FrameLayout

/** The element view: children stack vertically until a style export assigns frames, then each child sits at its frame. */
class MarklessBox(context: Context) : FrameLayout(context) {
	internal val frames = HashMap<View, Rect>()
	/** A scroll container's content box: its size in px whatever its scroll view offers, so the scroll view has a range. */
	internal var fixedSize: Pair<Int, Int>? = null

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
		var y = paddingTop
		for (i in 0 until childCount) {
			val child = getChildAt(i)
			if (child.visibility == View.GONE) continue
			child.layout(paddingLeft, y, paddingLeft + child.measuredWidth, y + child.measuredHeight)
			y += child.measuredHeight
		}
	}
}
