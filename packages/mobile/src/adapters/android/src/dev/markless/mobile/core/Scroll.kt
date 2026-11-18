package dev.markless.mobile.core

// scrollIntoView() and focus() as Chrome scrolls, the same function as packages/mobile/src/scroll.ts (vectors: conformance/scroll).

enum class ScrollAlign(val css: String) {
	Start("start"), Center("center"), End("end"), Nearest("nearest"),
	/** focus(): no scroll when fully shown, the closest edge when partly shown, centred when hidden. */
	IfNeeded("if-needed");

	companion object {
		fun of(css: String): ScrollAlign = entries.firstOrNull { it.css == css } ?: throw MarklessDecodeError("unknown scroll alignment \"$css\"")
	}
}

data class ScrollRect(val x: Double, val y: Double, val width: Double, val height: Double)

/** An offset range in CSS scroll-offset terms: 0 is the start position, and the user scrolls between min and max. */
data class ScrollRange(val minX: Double, val maxX: Double, val minY: Double, val maxY: Double)

/** One scrolling box: its scrollport at offset 0 in the content coordinates of the box around it, its offset and its range. */
data class ScrollBox(val port: ScrollRect, val offsetX: Double, val offsetY: Double, val range: ScrollRange)

data class ScrollAlignment(val block: ScrollAlign, val inline: ScrollAlign)

val SCROLL_INTO_VIEW = ScrollAlignment(ScrollAlign.Start, ScrollAlign.Nearest)
val FOCUS_INTO_VIEW = ScrollAlignment(ScrollAlign.IfNeeded, ScrollAlign.IfNeeded)

private fun axis(offset: Double, start: Double, size: Double, port: Double, align: ScrollAlign): Double {
	val shownStart = start - offset
	val shownEnd = shownStart + size
	val toStart = offset + shownStart
	val toEnd = offset + shownEnd - port
	val toCenter = offset + shownStart + size / 2 - port / 2
	when (align) {
		ScrollAlign.Start -> return toStart
		ScrollAlign.End -> return toEnd
		ScrollAlign.Center -> return toCenter
		else -> {}
	}
	val fullyShown = shownStart >= 0 && shownEnd <= port
	if (align == ScrollAlign.IfNeeded) {
		if (fullyShown) return offset
		if (shownEnd <= 0 || shownStart >= port) return toCenter
	}
	if ((shownStart <= 0 && shownEnd >= port) || fullyShown) return offset
	return if ((shownStart < 0) == (size <= port)) toStart else toEnd
}

/**
 * The offsets of [chain] (innermost box first, the page last) after bringing [target], in the innermost box's content
 * coordinates, into view; each box sees the element where the previous box's scroll left it.
 */
fun scrollIntoView(chain: List<ScrollBox>, target: ScrollRect, align: ScrollAlignment): List<Pair<Double, Double>> {
	var rect = target
	return chain.map { box ->
		val x = axis(box.offsetX, rect.x, rect.width, box.port.width, align.inline).coerceIn(box.range.minX, box.range.maxX)
		val y = axis(box.offsetY, rect.y, rect.height, box.port.height, align.block).coerceIn(box.range.minY, box.range.maxY)
		rect = ScrollRect(box.port.x + rect.x - x, box.port.y + rect.y - y, rect.width, rect.height)
		x to y
	}
}
