package dev.markless.mobile.view

import android.graphics.Canvas
import android.graphics.ColorFilter
import android.graphics.Paint
import android.graphics.PixelFormat
import android.graphics.drawable.Drawable

/** A square box whose solid border sides differ (`border-left: 6px solid`): the fill, then each side, in device px (top, right, bottom, left). */
class SideBorders(private val fill: Int, private val widths: List<Float>, private val colors: List<Int>) : Drawable() {
	private val paint = Paint()

	override fun draw(canvas: Canvas) {
		val b = bounds
		val (top, right, bottom, left) = widths
		paint.color = fill
		canvas.drawRect(b.left.toFloat(), b.top.toFloat(), b.right.toFloat(), b.bottom.toFloat(), paint)
		// Chrome joins adjacent sides on a diagonal; each side here is its own rectangle, which differs only at a corner where two sides of different colours meet.
		side(canvas, colors[0], b.left.toFloat(), b.top.toFloat(), b.right.toFloat(), b.top + top)
		side(canvas, colors[1], b.right - right, b.top.toFloat(), b.right.toFloat(), b.bottom.toFloat())
		side(canvas, colors[2], b.left.toFloat(), b.bottom - bottom, b.right.toFloat(), b.bottom.toFloat())
		side(canvas, colors[3], b.left.toFloat(), b.top.toFloat(), b.left + left, b.bottom.toFloat())
	}

	private fun side(canvas: Canvas, color: Int, l: Float, t: Float, r: Float, b: Float) {
		if (r <= l || b <= t) return
		paint.color = color
		canvas.drawRect(l, t, r, b, paint)
	}

	override fun setAlpha(alpha: Int) {}
	override fun setColorFilter(colorFilter: ColorFilter?) {}
	@Deprecated("Deprecated in Java")
	override fun getOpacity(): Int = PixelFormat.TRANSLUCENT
}
