package dev.markless.mobile.view

import android.content.Context
import android.view.MotionEvent
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

class BoxScrollView(context: Context) : ScrollView(context) {
	private val latch = Latch(context)
	private var released = false
	override fun dispatchTouchEvent(e: MotionEvent): Boolean {
		if (e.actionMasked == MotionEvent.ACTION_DOWN) released = false
		if (!released && !latch.keep(this, e, vertical = true)) released = true
		return if (released) false else super.dispatchTouchEvent(e)
	}
}

class BoxHorizontalScrollView(context: Context) : HorizontalScrollView(context) {
	private val latch = Latch(context)
	private var released = false
	override fun dispatchTouchEvent(e: MotionEvent): Boolean {
		if (e.actionMasked == MotionEvent.ACTION_DOWN) released = false
		if (!released && !latch.keep(this, e, vertical = false)) released = true
		return if (released) false else super.dispatchTouchEvent(e)
	}
}
