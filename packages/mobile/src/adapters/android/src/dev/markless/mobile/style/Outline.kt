package dev.markless.mobile.style

import dev.markless.mobile.core.MarklessDecodeError

/**
 * A box's `outline` and what Dragon's translated ring and side painters (paint-radius.ts, paint-dash.ts) read to draw it as Chrome
 * does, with the view it is drawn in: after that view's flow children and before the boxes its stacking context paints later
 * (Chrome's outline phase of the paint layer). [tones] are the colours the side painter names by index: the outline colour, then
 * a 3D style's lighter and darker ones. The box is in page device px: its snapped border box ([edges]: left, top, right, bottom),
 * its [size] before snapping, its [borders] (top, right, bottom, left) and its eight corner [radii] lengths (percent, value).
 * [host] is the view node it is drawn in, at the unsnapped page device px origin [hostX], [hostY]; [order] is its place among the
 * outlines drawn there, each box's descendants' outlines before its own, boxes in tree order.
 */
data class OutlinePaint(
	val style: String, val width: Double, val offset: Double, val tones: List<Rgba>, val edges: List<Double>, val size: List<Double>,
	val borders: List<Double>, val radii: List<Pair<Boolean, Double>>, val host: String, val hostX: Double, val hostY: Double,
	val order: Int, val dpr: Double,
) {
	val color: Rgba get() = tones[0]

	companion object {
		/** The outline of [node], drawn in its layer's view or the page's top view; one that view would clip or misorder is refused. */
		fun of(node: StyledNode, styled: Assignment, isView: (String) -> Boolean, postOrder: Map<String, Int>, dpr: Double): OutlinePaint? {
			val write = node.writes.filterIsInstance<StyleWrite.Outline>().firstOrNull() ?: return null
			val frame = node.frame ?: return null
			fun ancestors(n: StyledNode): List<StyledNode> = generateSequence(n.parent?.let { styled.byId[it] }) { p -> p.parent?.let { styled.byId[it] } }.toList()
			fun layerView(above: StyledNode): String? = if (isView(write.layer)) write.layer else ancestors(above).lastOrNull { isView(it.id) }?.id
			val chain = listOf(node) + ancestors(node)
			val host = (if (isView(write.layer)) write.layer else chain.lastOrNull { isView(it.id) }?.id)
				?: throw MarklessDecodeError("\"${node.id}\": its outline has no view to be drawn in")
			val hostIndex = chain.indexOfFirst { it.id == host }
			if (hostIndex < 0) throw MarklessDecodeError("\"${node.id}\": its outline's layer ${write.layer} is not around it")
			for (box in chain.subList(if (hostIndex == 0) 0 else 1, hostIndex + 1)) {
				if (box.writes.any { it == StyleWrite.PaddingBoxClip || it is StyleWrite.ClipPathInset || it is StyleWrite.ScrollContainer })
					throw MarklessDecodeError("\"${node.id}\": its outline is drawn in $host, past ${box.id}, which clips or scrolls; not implemented on Android")
			}
			if (!isView(write.layer)) {
				val at = styled.nodes.indexOfFirst { it.id == host }
				val next = styled.nodes.drop(at + 1).firstOrNull { n -> n.frame != null && isView(n.id) && ancestors(n).none { isView(it.id) } }
				if (next != null) throw MarklessDecodeError("\"${node.id}\": its outline is drawn in $host, and ${next.id}, a later box at the top of the page, would cover it; not implemented on Android")
			}
			for (item in styled.nodes) {
				if (item.frame == null || item.writes.none { it is StyleWrite.PaintOrder && it.host == write.layer && it.bucket >= 1 }) continue
				val parent = if ('@' in item.id) ancestors(item).firstOrNull { isView(it.id) }?.id else layerView(item)
				if (parent != host) throw MarklessDecodeError("\"${node.id}\": its outline is drawn in $host, but ${item.id}, which ${write.layer} paints over outlines, is placed in ${parent ?: "the page"}; not implemented on Android")
			}
			fun origin(id: String?): Pair<Double, Double> {
				val n = id?.let { styled.byId[it] } ?: return 0.0 to 0.0
				val p = origin(n.parent)
				return (p.first + (n.frame?.x ?: 0.0)) to (p.second + (n.frame?.y ?: 0.0))
			}
			val (x, y) = origin(node.id)
			val (hx, hy) = origin(host)
			val w = node.borderWidths
			val order = postOrder[node.id] ?: throw MarklessDecodeError("\"${node.id}\" has no place in the export's tree")
			return OutlinePaint(
				write.style, write.width, write.offset, write.tones?.let { listOf(write.color, it.first, it.second) } ?: List(3) { write.color },
				listOf(Math.round(x).toDouble(), Math.round(y).toDouble(), Math.round(x + frame.width).toDouble(), Math.round(y + frame.height).toDouble()),
				listOf(frame.width, frame.height), w?.let { listOf(it.top, it.right, it.bottom, it.left) } ?: listOf(0.0, 0.0, 0.0, 0.0),
				write.radii ?: List(8) { false to 0.0 }, host, hx, hy, order, dpr,
			)
		}

		/** Each export node's place in a post-order walk of the tree: a box after its descendants, siblings in tree order. */
		fun postOrder(nodes: List<StyledNode>): Map<String, Int> {
			val ids = nodes.map { it.id }.toSet()
			val children = HashMap<String, MutableList<String>>()
			val roots = ArrayList<String>()
			for (n in nodes) if (n.parent != null && n.parent in ids) children.getOrPut(n.parent) { ArrayList() }.add(n.id) else roots.add(n.id)
			val out = HashMap<String, Int>()
			fun visit(id: String) {
				for (c in children[id].orEmpty()) visit(c)
				out[id] = out.size
			}
			for (r in roots) visit(r)
			return out
		}
	}
}
