package dev.markless.mobile.style

import dev.markless.mobile.core.MarklessDecodeError

// Factored states (dragon.native-style-export/2): a page whose states Dragon splits into groups ships the page's table, each
// group's (only the nodes it owns), and their product; the host shows a combination as Dragon's state-groups.ts composes it.

const val STYLE_EXPORT_SCHEMA_GROUPS = "dragon.native-style-export/2"

/** A list whose items are made on first read and kept: a factored page has thousands of combinations, a host shows a few. */
class LazyList<T>(override val size: Int, private val make: (Int) -> T) : AbstractList<T>() {
	private val made = arrayOfNulls<Any?>(size)
	private val have = BooleanArray(size)

	@Suppress("UNCHECKED_CAST")
	override fun get(index: Int): T {
		if (index !in 0 until size) throw IndexOutOfBoundsException("entry $index of $size")
		if (!have[index]) {
			made[index] = make(index)
			have[index] = true
		}
		return made[index] as T
	}
}

/**
 * What one table shows: its nodes (a group's, only those it owns), the laid-out children of the parents [order] names in their
 * order, and its root paint.
 */
data class TableShown(val nodes: List<StyledNode>, val order: Map<String, List<String>>, val canvas: Rgba?, val body: Rgba?)

/** A slim interaction state: the nodes it changes, the ids it has no node for, a parent's children it adds to, its root paint if its own. */
data class SlimState(val nodes: List<StyledNode>, val removed: Set<String>, val order: Map<String, List<String>>, val canvas: Rgba?, val body: Rgba?, val ownBody: Boolean)

/** A table in one of its interaction states (state-groups.ts shownState). */
fun shownState(base: TableShown, state: SlimState): TableShown {
	val changed = state.nodes.associateBy { it.id }
	val kept = base.nodes.filter { it.id !in state.removed }.map { changed[it.id] ?: it }
	val have = kept.mapTo(HashSet()) { it.id }
	return TableShown(kept + state.nodes.filter { it.id !in have }, base.order + state.order, state.canvas ?: base.canvas, if (state.ownBody) state.body else base.body)
}

/** One order holding every list's ids in each list's order (state-groups.ts mergedOrder); two lists ordering ids both ways fail. */
fun mergedOrder(lists: List<List<String>>): List<String> {
	val after = LinkedHashMap<String, MutableSet<String>>()
	for (list in lists) list.forEachIndexed { i, id ->
		val before = after.getOrPut(id) { LinkedHashSet() }
		if (i > 0) before.add(list[i - 1])
	}
	val out = ArrayList<String>()
	val placed = HashSet<String>()
	fun place(id: String, path: List<String>) {
		if (id in placed) return
		if (id in path) throw MarklessDecodeError("the tables of a factored page order $id both before and after ${path.last()}")
		for (before in after.getValue(id)) place(before, path + id)
		placed.add(id)
		out.add(id)
	}
	for (id in after.keys) place(id, emptyList())
	return out
}

/**
 * The nodes of a combination (state-groups.ts composedNodes): a node from the table that owns it ([owner], 0 the page's), each
 * parent's children in the order every table gives them, laid-out ones first, then the boxless ones as the tables list them.
 */
fun composedNodes(shown: List<TableShown>, owner: (String) -> Int): List<StyledNode> {
	val byId = shown.map { t -> t.nodes.associateBy { it.id } }
	val laid = shown.map { t ->
		val lists = LinkedHashMap<String?, List<String>>()
		for ((parent, ids) in t.nodes.filter { it.frame != null }.groupBy { it.parent }) lists[parent] = ids.map { it.id }
		lists.putAll(t.order)
		lists
	}
	val boxless = shown.map { t -> t.nodes.filter { it.frame == null }.groupBy { it.parent }.mapValues { (_, ns) -> ns.map { it.id } } }
	fun own(id: String): StyledNode? = byId.getOrNull(owner(id))?.get(id)
	val out = ArrayList<StyledNode>()
	val seen = HashSet<String>()
	fun visit(parent: String?, laidOut: Boolean) {
		for (id in mergedOrder(shown.indices.map { k -> (if (laidOut) laid[k][parent] else boxless[k][parent]) ?: emptyList() })) {
			val n = own(id) ?: continue
			if (n.parent != parent || id in seen || (n.frame != null) != laidOut) continue
			seen.add(id)
			out.add(n)
			visit(id, laidOut)
		}
	}
	visit(null, true)
	for (t in shown) for (n in t.nodes) if (n.id !in seen && n.frame == null && own(n.id) === n) {
		seen.add(n.id)
		out.add(n)
	}
	return restacked(out)
}

// The order of a stacking context's layer items (Dragon's lower/paint/stacking.ts): z < 0, the normal-flow layers, z auto and 0, z > 0, the top layer.
private val LAYER_CLASS = mapOf("negative" to 0, "normal-flow" to 1, "positioned" to 1, "positive" to 2, "top-layer" to 3)

/** A combination's paint order: each host's layer items sorted by layer, z-index and tree order, and ranked again. */
private fun restacked(nodes: List<StyledNode>): List<StyledNode> {
	val items = LinkedHashMap<String, MutableList<Triple<Int, StyledNode, StyleWrite.PaintOrder>>>()
	nodes.forEachIndexed { at, n ->
		val order = n.writes.firstNotNullOfOrNull { it as? StyleWrite.PaintOrder } ?: return@forEachIndexed
		if (order.layer == null) throw MarklessDecodeError("\"${n.id}\"'s paint order has no layer, which a factored page's combination sorts by")
		items.getOrPut(order.host) { ArrayList() }.add(Triple(at, n, order))
	}
	if (items.isEmpty()) return nodes
	val ranked = HashMap<String, StyleWrite.PaintOrder>()
	for (present in items.values) {
		fun key(o: StyleWrite.PaintOrder): Pair<Int, Double> = (LAYER_CLASS[o.layer] ?: 3) to when (o.layer) {
			"normal-flow" -> -1.0
			"negative", "positive" -> o.z ?: 0.0
			else -> 0.0
		}
		present.sortedWith(compareBy<Triple<Int, StyledNode, StyleWrite.PaintOrder>>({ key(it.third).first }, { key(it.third).second }, { it.first }))
			.forEachIndexed { k, (_, n, o) -> ranked[n.id] = o.copy(rank = k) }
	}
	return nodes.map { n -> ranked[n.id]?.let { o -> n.copy(writes = n.writes.map { w -> if (w is StyleWrite.PaintOrder) o else w }) } ?: n }
}
