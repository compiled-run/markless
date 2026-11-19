package dev.markless.mobile.view

import android.graphics.Canvas
import android.graphics.ColorFilter
import android.graphics.Paint
import android.graphics.PixelFormat
import android.graphics.drawable.Drawable
import dev.markless.mobile.style.TextLine

/** A text node's lines drawn glyph for glyph where Dragon placed them: Minikin reshapes at spaces and loses contextual advances. */
internal class GlyphLines(private val fonts: FontSource) : Drawable() {
	private class Run(val font: android.graphics.fonts.Font, val size: Float, val glyphs: IntArray, val positions: FloatArray)

	private val paint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.SUBPIXEL_TEXT_FLAG or Paint.LINEAR_TEXT_FLAG).apply { hinting = Paint.HINTING_OFF }
	private var runs: List<Run> = emptyList()
	var color: Int = 0
		private set

	/** [dx] and [dy] place the node's frame origin in the view, in device px. */
	fun set(lines: List<TextLine>, dx: Double, dy: Double, color: Int) {
		this.color = color
		runs = lines.flatMap { l ->
			l.runs.map { r ->
				val positions = FloatArray(r.glyphs.size * 2)
				for (k in r.glyphs.indices) {
					positions[2 * k] = (dx + r.xs[k]).toFloat()
					positions[2 * k + 1] = (dy + l.baseline).toFloat()
				}
				Run(fonts.font(r.face), r.size.toFloat(), r.glyphs.toIntArray(), positions)
			}
		}
		invalidateSelf()
	}

	override fun draw(canvas: Canvas) {
		paint.color = color
		for (r in runs) {
			paint.textSize = r.size
			canvas.drawGlyphs(r.glyphs, 0, r.positions, 0, r.glyphs.size, r.font, paint)
		}
	}

	override fun setAlpha(alpha: Int) {}
	override fun setColorFilter(colorFilter: ColorFilter?) {}
	@Deprecated("Deprecated in Java")
	override fun getOpacity(): Int = PixelFormat.TRANSLUCENT
}
