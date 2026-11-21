package dev.markless.mobile.view

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.widget.CheckBox
import android.widget.CompoundButton
import android.widget.RadioButton

private const val SIDE = 13f

/** The margins Chrome gives a checkbox (3 3 3 4) and a radio button (3 3 0 5): left, top, right, bottom. */
private fun marginsOf(radio: Boolean) = if (radio) floatArrayOf(5f, 3f, 3f, 0f) else floatArrayOf(4f, 3f, 3f, 3f)

private fun measureTick(view: CompoundButton, radio: Boolean): Pair<Int, Int> {
	val d = view.resources.displayMetrics.density
	val (left, top, right, bottom) = marginsOf(radio).toList()
	return Pair(((SIDE + left + right) * d).toInt(), ((SIDE + top + bottom) * d).toInt())
}

/** Draws [view] as Chrome draws an unstyled checkbox or radio button, unchecked in a field's colours, checked in its accent. */
private fun drawTick(view: CompoundButton, canvas: Canvas, radio: Boolean) {
	val d = view.resources.displayMetrics.density
	val dark = isDark(view.resources.configuration)
	val fill = if (dark) 0xFF3B3B3B.toInt() else 0xFFFFFFFF.toInt()
	val line = if (dark) 0xFF858585.toInt() else 0xFF767676.toInt()
	val accent = if (dark) 0xFF99C8FF.toInt() else 0xFF0075FF.toInt()
	val (left, top) = marginsOf(radio).toList()
	val box = RectF(left * d, top * d, (left + SIDE) * d, (top + SIDE) * d)
	val paint = Paint(Paint.ANTI_ALIAS_FLAG)
	if (radio) {
		val r = SIDE / 2 * d
		paint.color = if (view.isChecked) accent else fill
		canvas.drawCircle(box.centerX(), box.centerY(), r, paint)
		if (view.isChecked) {
			paint.color = fill
			canvas.drawCircle(box.centerX(), box.centerY(), r - 1.5f * d, paint)
			paint.color = accent
			canvas.drawCircle(box.centerX(), box.centerY(), r - 3f * d, paint)
		} else {
			paint.style = Paint.Style.STROKE
			paint.strokeWidth = d
			paint.color = line
			canvas.drawCircle(box.centerX(), box.centerY(), r - d / 2, paint)
		}
		return
	}
	val corner = 2 * d
	paint.color = if (view.isChecked) accent else fill
	canvas.drawRoundRect(box, corner, corner, paint)
	paint.style = Paint.Style.STROKE
	if (!view.isChecked) {
		paint.strokeWidth = d
		paint.color = line
		canvas.drawRoundRect(RectF(box.left + d / 2, box.top + d / 2, box.right - d / 2, box.bottom - d / 2), corner, corner, paint)
		return
	}
	paint.strokeWidth = 1.6f * d
	paint.strokeCap = Paint.Cap.ROUND
	paint.strokeJoin = Paint.Join.ROUND
	paint.color = fill
	val tick = Path().apply {
		moveTo(box.left + 3.5f * d, box.top + 6.8f * d)
		lineTo(box.left + 5.6f * d, box.top + 9f * d)
		lineTo(box.left + 9.8f * d, box.top + 4.2f * d)
	}
	canvas.drawPath(tick, paint)
}

/** An unstyled checkbox: Chrome's 13 px box with its margins, its bottom margin edge on the line's baseline. The runtime owns checkedness. */
class ChromeCheckBox(context: Context) : CheckBox(context) {
	override fun toggle() {}
	override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) = measureTick(this, false).let { setMeasuredDimension(it.first, it.second) }
	override fun onDraw(canvas: Canvas) = drawTick(this, canvas, false)
	override fun getBaseline(): Int = measuredHeight
}

/** An unstyled radio button: Chrome's 13 px circle with its margins, its bottom on the line's baseline. */
class ChromeRadio(context: Context) : RadioButton(context) {
	override fun toggle() {}
	override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) = measureTick(this, true).let { setMeasuredDimension(it.first, it.second) }
	override fun onDraw(canvas: Canvas) = drawTick(this, canvas, true)
	override fun getBaseline(): Int = measuredHeight
}

