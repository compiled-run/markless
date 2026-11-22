package dev.markless.mobile.view

import android.graphics.Canvas
import android.graphics.ColorFilter
import android.graphics.Paint
import android.graphics.Path
import android.graphics.PixelFormat
import android.graphics.RectF
import android.graphics.drawable.Drawable
import dev.markless.mobile.style.CheckboxColors
import dev.markless.mobile.style.CheckboxMarks

/**
 * A themed checkbox as Dragon's `dragonPaintCheckbox` draws Chrome's: the marks in device px from the checkbox's snapped border box,
 * in the checkedness the checkbox's own state says (the runtime sets it; a tap does not toggle the widget).
 */
class ThemedCheckbox(private val marks: CheckboxMarks, private val colors: CheckboxColors) : Drawable() {
	private var checked = false
	private val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
	private val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply {
		style = Paint.Style.STROKE
		strokeCap = Paint.Cap.BUTT
		strokeJoin = Paint.Join.MITER
		strokeMiter = 4f
	}

	override fun isStateful() = true

	override fun onStateChange(state: IntArray): Boolean {
		val now = android.R.attr.state_checked in state
		if (now == checked) return false
		checked = now
		invalidateSelf()
		return true
	}

	override fun draw(canvas: Canvas) {
		val m = marks
		val left = bounds.left + m.x.toFloat()
		val top = bounds.top + m.y.toFloat()
		val square = RectF(left, top, left + m.side.toFloat(), top + m.side.toFloat())
		fun rounded(r: RectF, paint: Paint) {
			val k = minOf(m.radius.toFloat(), minOf(r.width(), r.height()) / 2)
			canvas.drawRoundRect(r, k, k, paint)
		}
		if (m.plain) {
			fill.color = (if (checked) colors.check else colors.uncheckedBorder).argb
			canvas.drawRect(square, fill)
			return
		}
		val inset = m.backgroundInset.toFloat()
		fill.color = (if (checked) colors.checkedBackground else colors.uncheckedBackground).argb
		rounded(RectF(square.left + inset, square.top + inset, square.right - inset, square.bottom - inset), fill)
		if (checked) {
			fill.color = colors.fill.argb
			rounded(square, fill)
			val p = m.check
			val path = Path().apply {
				moveTo(bounds.left + p[0].toFloat(), bounds.top + p[1].toFloat())
				lineTo(bounds.left + p[2].toFloat(), bounds.top + p[3].toFloat())
				lineTo(bounds.left + p[4].toFloat(), bounds.top + p[5].toFloat())
			}
			stroke.strokeWidth = m.checkWidth.toFloat()
			stroke.color = colors.check.argb
			canvas.drawPath(path, stroke)
		} else {
			val border = m.borderInset.toFloat()
			stroke.strokeWidth = m.borderWidth.toFloat()
			stroke.color = colors.uncheckedBorder.argb
			rounded(RectF(square.left + border, square.top + border, square.right - border, square.bottom - border), stroke)
		}
	}

	override fun setAlpha(alpha: Int) {}
	override fun setColorFilter(colorFilter: ColorFilter?) {}
	@Deprecated("Deprecated in Java")
	override fun getOpacity(): Int = PixelFormat.TRANSLUCENT
}
