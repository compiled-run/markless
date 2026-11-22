package dev.markless.mobile.style

/**
 * A box's padding box: the border box inset by each side's border width (px), with each corner's radii (x, y per corner from
 * the top left) the outer radii less the adjacent border widths, never below 0, as CSS shapes inner corners.
 */
data class PaddingBox(val top: Double, val right: Double, val bottom: Double, val left: Double, val radii: List<Double>) {
	val rounded get() = radii.any { it > 0.0 }
}

/** [widths] and the border box's corner radii (8 lengths, or null for square) as the padding box they enclose. */
fun paddingBox(widths: Edges, radii: List<Double>?): PaddingBox {
	val outer = radii ?: List(8) { 0.0 }
	require(outer.size == 8) { "${outer.size} radius lengths, not 8" }
	val beside = listOf(widths.left, widths.top, widths.right, widths.top, widths.right, widths.bottom, widths.left, widths.bottom)
	return PaddingBox(widths.top, widths.right, widths.bottom, widths.left, outer.zip(beside) { r, w -> maxOf(0.0, r - w) })
}
