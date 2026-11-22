package dev.markless.mobile.view

import android.graphics.Canvas
import android.graphics.ColorFilter
import android.graphics.Paint
import android.graphics.Path
import android.graphics.PixelFormat
import android.graphics.drawable.Drawable
import dev.markless.mobile.style.BorderOp
import dev.markless.mobile.style.BorderOps
import kotlin.math.roundToInt

/**
 * A box with a dashed or dotted side: its fill, then Dragon's border operations (paint-dash.ts, Blink's side painter) in device px,
 * drawn as Dragon's own Android paint draws them (dragonDrawBorderOps); the snapped border box sits at the operations' origin.
 */
class DashedBorder(private val fill: Int, private val border: BorderOps, private val colors: List<Int>) : Drawable() {
	private val paint = Paint()

	override fun draw(canvas: Canvas) {
		val b = bounds
		paint.color = fill
		paint.isAntiAlias = false
		canvas.drawRect(b.left.toFloat(), b.top.toFloat(), b.right.toFloat(), b.bottom.toFloat(), paint)
		drawBorderOps(canvas, border.ops, colors, b.left + border.originX, b.top + border.originY, paint)
	}

	override fun setAlpha(alpha: Int) {}
	override fun setColorFilter(colorFilter: ColorFilter?) {}
	@Deprecated("Deprecated in Java")
	override fun getOpacity(): Int = PixelFormat.TRANSLUCENT
}

/** Dragon's side-painter operations (paint-dash.ts) in device px, shifted by [dx], [dy], as Dragon's own Android paint draws them. */
internal fun drawBorderOps(canvas: Canvas, ops: List<BorderOp>, colors: List<Int>, dx: Double, dy: Double, paint: Paint) {
	canvas.save()
	canvas.translate(dx.toFloat(), dy.toFloat())
	for (o in ops) {
		when (o.op) {
			"begin-layer" -> canvas.saveLayerAlpha(null, (o.alpha * 255.0).roundToInt())
			"end-layer", "restore" -> canvas.restore()
			"save" -> canvas.save()
			"clip" -> canvas.clipPath(polygon(o.points))
			else -> {
				paint.isAntiAlias = o.antialias
				paint.style = Paint.Style.FILL
				paint.color = colors[o.side] or (0xFF shl 24)
				paint.alpha = (o.alpha * 255.0).roundToInt()
				if (o.op == "fill") canvas.drawPath(polygon(o.points), paint)
				else canvas.drawCircle(o.points[0].toFloat(), o.points[1].toFloat(), o.points[2].toFloat(), paint)
			}
		}
	}
	canvas.restore()
}

private fun polygon(pts: List<Double>): Path = Path().apply {
	moveTo(pts[0].toFloat(), pts[1].toFloat())
	var i = 2
	while (i + 1 < pts.size) {
		lineTo(pts[i].toFloat(), pts[i + 1].toFloat())
		i += 2
	}
	close()
}
