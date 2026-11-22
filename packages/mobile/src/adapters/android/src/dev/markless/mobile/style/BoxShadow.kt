package dev.markless.mobile.style

import dev.markless.mobile.core.MarklessDecodeError

/** One computed shadow: CSS px at zoom 1 and an sRGB RGBA8 colour. */
data class Shadow(val inset: Boolean, val x: Double, val y: Double, val blur: Double, val spread: Double, val color: Rgba)

/**
 * A box in page device px: its snapped border box (left, top, right, bottom), its size before snapping, its border widths (top,
 * right, bottom, left), its eight corner radii in CSS px and its background.
 */
data class ShadowBox(val edges: List<Double>, val size: List<Double>, val borders: List<Double>, val radii: List<Double>, val background: Rgba)

/**
 * A box's `box-shadow` and everything Dragon's translated painter (paint-shadow.ts) reads to raster it as Chrome does: the box,
 * and the backgrounds beneath it (outermost first, over the white root) that each shadow is blitted onto.
 */
data class ShadowPaint(val shadows: List<Shadow>, val box: ShadowBox, val backdrop: List<ShadowBox>, val dpr: Double) {
	val hasOuter: Boolean get() = shadows.any { !it.inset }
	val hasInset: Boolean get() = shadows.any { it.inset }

	companion object {
		private val SQUARE = List(8) { 0.0 }

		/** The shadow of [node] in an assignment (frames in device px, relative to the parent box); null without one. */
		fun of(node: StyledNode, styled: Assignment, dpr: Double): ShadowPaint? {
			val shadows = node.writes.filterIsInstance<StyleWrite.BoxShadow>().firstOrNull()?.shadows?.takeIf { it.isNotEmpty() } ?: return null
			if (node.frame == null) return null
			fun origin(id: String?): Pair<Double, Double> {
				val n = id?.let { styled.byId[it] } ?: return 0.0 to 0.0
				val p = origin(n.parent)
				return (p.first + (n.frame?.x ?: 0.0)) to (p.second + (n.frame?.y ?: 0.0))
			}
			fun box(n: StyledNode, background: Rgba): ShadowBox {
				val f = n.frame ?: throw MarklessDecodeError("\"${n.id}\" paints beneath a shadow but has no box")
				val (x, y) = origin(n.id)
				val w = n.borderWidths
				return ShadowBox(
					listOf(Math.round(x).toDouble(), Math.round(y).toDouble(), Math.round(x + f.width).toDouble(), Math.round(y + f.height).toDouble()),
					listOf(f.width, f.height), w?.let { listOf(it.top, it.right, it.bottom, it.left) } ?: listOf(0.0, 0.0, 0.0, 0.0),
					n.writes.filterIsInstance<StyleWrite.BorderRadius>().lastOrNull()?.radii ?: SQUARE, background,
				)
			}
			fun background(n: StyledNode): Rgba? = n.writes.filterIsInstance<StyleWrite.BackgroundColor>().firstOrNull()?.color?.takeIf { it.alpha > 0 }
			val backdrop = ArrayList<ShadowBox>()
			styled.canvas?.let { backdrop.add(ShadowBox(listOf(-PAGE, -PAGE, PAGE, PAGE), listOf(2 * PAGE, 2 * PAGE), listOf(0.0, 0.0, 0.0, 0.0), SQUARE, it)) }
			val chain = generateSequence(node.parent?.let { styled.byId[it] }) { n -> n.parent?.let { styled.byId[it] } }.toList().asReversed()
			// html's and body's backgrounds reach the page as the canvas and body's own; neither paints its box's write again.
			for (n in chain) when (n.id) {
				"html" -> {}
				"body" -> styled.body?.let { backdrop.add(box(n, it)) }
				else -> background(n)?.let { backdrop.add(box(n, it)) }
			}
			return ShadowPaint(shadows, box(node, background(node) ?: Rgba(0, 0, 0, 0)), backdrop, dpr)
		}

		private const val PAGE = 1e7
	}
}
