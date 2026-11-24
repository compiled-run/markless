package dev.markless.mobile.view

import android.content.Context
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.widget.HorizontalScrollView
import android.widget.ScrollView
import kotlin.math.abs

// A drag belongs to the box it starts in while the box can scroll that way, and to the page otherwise, decided once when
// the drag starts: as Chrome latches a gesture, so a fling that reaches the box's end does not carry on into the page.
private class Latch(context: Context) {
	private val slop = ViewConfiguration.get(context).scaledTouchSlop
	private var x = 0f
	private var y = 0f
	private var decided = false

	/** False once this drag goes to the scroll view around the box. */
	fun keep(view: android.view.View, e: MotionEvent, vertical: Boolean): Boolean {
		when (e.actionMasked) {
			MotionEvent.ACTION_DOWN -> {
				x = e.x; y = e.y; decided = false
				view.parent?.requestDisallowInterceptTouchEvent(true)
			}
			MotionEvent.ACTION_MOVE -> if (!decided) {
				val dx = e.x - x
				val dy = e.y - y
				if (abs(dx) < slop && abs(dy) < slop) return true
				decided = true
				val along = if (vertical) abs(dy) >= abs(dx) else abs(dx) > abs(dy)
				val d = if (vertical) dy else dx
				val can = if (vertical) view.canScrollVertically(if (d < 0) 1 else -1) else view.canScrollHorizontally(if (d < 0) 1 else -1)
				if (!along || !can) {
					view.parent?.requestDisallowInterceptTouchEvent(false)
					return false
				}
			}
		}
		return true
	}
}

/**
 * A scroll view that reports the moment it takes a touch to scroll, which is when Chrome sends `pointercancel`: it
 * intercepts a drag from the views under it, or a drag it already holds starts moving its content.
 */
interface TakesTouches {
	var onTake: (() -> Unit)?
}

private fun interceptTook(e: MotionEvent, took: Boolean, onTake: (() -> Unit)?): Boolean {
	if (took && e.actionMasked == MotionEvent.ACTION_MOVE) onTake?.invoke()
	return took
}

private fun scrollTook(view: View, e: MotionEvent, x: Int, y: Int, onTake: (() -> Unit)?) {
	if (e.actionMasked == MotionEvent.ACTION_MOVE && (view.scrollX != x || view.scrollY != y)) onTake?.invoke()
}

/** The page's own scroll view, as a browser's viewport. */
class PageScrollView(context: Context) : ScrollView(context), TakesTouches {
	override var onTake: (() -> Unit)? = null
	override fun onInterceptTouchEvent(e: MotionEvent) = interceptTook(e, super.onInterceptTouchEvent(e), onTake)
	override fun onTouchEvent(e: MotionEvent): Boolean {
		val x = scrollX; val y = scrollY
		return super.onTouchEvent(e).also { scrollTook(this, e, x, y, onTake) }
	}
}

class BoxScrollView(context: Context) : ScrollView(context), TakesTouches, SkipsBackdrop {
	override fun drawChild(canvas: android.graphics.Canvas, child: View, drawingTime: Long): Boolean =
		if (child in Backdrop.skip) false else super.drawChild(canvas, child, drawingTime)
	private val latch = Latch(context)
	private var released = false
	override var onTake: (() -> Unit)? = null
	override fun dispatchTouchEvent(e: MotionEvent): Boolean {
		if (e.actionMasked == MotionEvent.ACTION_DOWN) released = false
		if (!released && !latch.keep(this, e, vertical = true)) released = true
		return if (released) false else super.dispatchTouchEvent(e)
	}
	override fun onInterceptTouchEvent(e: MotionEvent) = interceptTook(e, super.onInterceptTouchEvent(e), onTake)
	override fun onTouchEvent(e: MotionEvent): Boolean {
		val x = scrollX; val y = scrollY
		return super.onTouchEvent(e).also { scrollTook(this, e, x, y, onTake) }
	}
}

class BoxHorizontalScrollView(context: Context) : HorizontalScrollView(context), TakesTouches, SkipsBackdrop {
	override fun drawChild(canvas: android.graphics.Canvas, child: View, drawingTime: Long): Boolean =
		if (child in Backdrop.skip) false else super.drawChild(canvas, child, drawingTime)
	private val latch = Latch(context)
	private var released = false
	override var onTake: (() -> Unit)? = null
	override fun dispatchTouchEvent(e: MotionEvent): Boolean {
		if (e.actionMasked == MotionEvent.ACTION_DOWN) released = false
		if (!released && !latch.keep(this, e, vertical = false)) released = true
		return if (released) false else super.dispatchTouchEvent(e)
	}
	override fun onInterceptTouchEvent(e: MotionEvent) = interceptTook(e, super.onInterceptTouchEvent(e), onTake)
	override fun onTouchEvent(e: MotionEvent): Boolean {
		val x = scrollX; val y = scrollY
		return super.onTouchEvent(e).also { scrollTook(this, e, x, y, onTake) }
	}
}
