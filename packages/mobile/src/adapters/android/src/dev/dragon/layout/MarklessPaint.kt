// Compiled with Dragon's translated engine, which every app build compiles beside the host; the host finds it by name.
package dev.dragon.layout

/**
 * `runtimeImagePaint` for an img whose src is set at run time, without its leaf, which it reads only for object-fit and
 * object-position: each axis x then y (a percent, or CSS px zoomed as the zoomed leaf's), [content] the content box in absolute
 * layout units. Gives the destination, the snapped content box and the drawn part (NaN when none), in device px.
 */
fun marklessRuntimeImagePaint(fit: String, percent: BooleanArray, position: DoubleArray, content: DoubleArray, width: Double, height: Double, zoom: Double): DoubleArray {
	fun axis(k: Int): U_LengthCalc_Percent_Px = if (percent[k]) Percent("percent", position[k]) else environment_lengthPx(Px("px", position[k]), zoom)
	val w = units_fromCssPx(units_zoomCssPx(width, zoom))
	val h = units_fromCssPx(units_zoomCssPx(height, zoom))
	val box = ObjectRect(content[0], content[1], content[2], content[3])
	val dest = replaced_objectFitRect(box, NaturalSizing(w, h, if (w > 0.0 && h > 0.0) LayoutRatio(w, h) else null), fit, ObjectPosition(axis(0), axis(1)), block_NO_ENGINE_FAULTS)
	fun rect(r: PixelRect) = doubleArrayOf(r.x, r.y, r.width, r.height)
	return rect(replaced_pixelSnappedRect(dest)) + rect(replaced_pixelSnappedRect(box)) + (replaced_drawnObjectRect(dest, box)?.let(::rect) ?: DoubleArray(4) { Double.NaN })
}
