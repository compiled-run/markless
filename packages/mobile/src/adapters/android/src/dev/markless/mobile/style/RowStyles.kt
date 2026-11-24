package dev.markless.mobile.style

import dev.markless.mobile.core.AttributeValue
import dev.markless.mobile.core.Expr
import dev.markless.mobile.core.JsValue
import dev.markless.mobile.core.Node
import dev.markless.mobile.core.Payload
import dev.markless.mobile.core.MarklessDecodeError
import dev.markless.mobile.core.Runtime

/**
 * The values a row's `class` or `ui-*` binding can give, as the style input lists them (style-input.ts `rowAttributeOptions`):
 * literals chosen by conditions, or a field of the row's item whose values its list lists, in first-seen order; null for any
 * other binding.
 */
fun rowAttributeOptions(name: String, expr: Expr, booleanCells: Set<String> = emptySet(), itemValues: (Expr) -> List<JsValue>? = { null }): List<String?>? = when {
	givesBoolean(expr, booleanCells) -> listOf(AttributeValue.of(name, JsValue.Bool(true)), AttributeValue.of(name, JsValue.Bool(false))).distinct()
	else -> literalOptions(name, expr, booleanCells, itemValues)
}

/** Reads each repeat's `itemValues` for [rowAttributeOptions]: a field path read off a row's item. */
fun itemValuesOf(payload: Payload): (Expr) -> List<JsValue>? {
	val lists = payload.nodes.filterIsInstance<Node.Repeat>().mapNotNull { node -> node.itemValues?.let { node.id to it } }.toMap()
	return { expr ->
		val path = ArrayList<String>()
		var at = expr
		while (at is Expr.Member) {
			path.add(0, at.property)
			at = at.value
		}
		if (at is Expr.Item && path.isNotEmpty()) lists[at.repeat]?.get(path.joinToString(".")) else null
	}
}

/** The payload's cells whose first value is true or false. */
fun booleanCellsOf(payload: Payload): Set<String> = payload.cells.filter { it.initial is JsValue.Bool }.map { it.id }.toSet()

private fun literalOptions(name: String, expr: Expr, booleanCells: Set<String>, itemValues: (Expr) -> List<JsValue>?): List<String?>? = when (expr) {
	is Expr.Literal -> listOf(AttributeValue.of(name, expr.value))
	is Expr.If -> {
		val a = rowAttributeOptions(name, expr.whenTrue, booleanCells, itemValues)
		val b = rowAttributeOptions(name, expr.whenFalse, booleanCells, itemValues)
		if (a == null || b == null) null else (a + b).distinct()
	}
	else -> itemValues(expr)?.map { AttributeValue.of(name, it) }?.distinct()
}

/** The export's states of each row: a row's class or ui-* values (`<node>#<attribute>`) and each @if or @try inside a row. */
fun StyleExport.rowStates(payload: Payload): Set<String> {
	val inRows = payload.nodes.filter { it.row != null }.map { it.id }.toSet()
	return states.map { it.key }.filter { key -> key in inRows || key.substringBeforeLast('#', "") in inRows }.toSet()
}

/** Whether an expression's value is always true or false: a comparison, a negation, a boolean cell, or `&&`, `||` and `?:` of those. */
private fun givesBoolean(expr: Expr, booleanCells: Set<String>): Boolean = when (expr) {
	is Expr.Literal -> expr.value is JsValue.Bool
	is Expr.CellRef -> expr.cell in booleanCells
	is Expr.Unary -> expr.op == "!"
	is Expr.Binary -> expr.op in setOf("===", "!==", "<", "<=", ">", ">=")
	is Expr.Logical -> expr.op != "??" && givesBoolean(expr.left, booleanCells) && givesBoolean(expr.right, booleanCells)
	is Expr.If -> givesBoolean(expr.whenTrue, booleanCells) && givesBoolean(expr.whenFalse, booleanCells)
	else -> false
}

/**
 * The rows each list of the page shows now, for laying the page out at assignment k: each row's key, the assignment its own
 * states (the value its `class` or `ui-*` binding gives) reach from k, and its texts by the template's text node id.
 */
fun StyleExport.shownRows(payload: Payload, runtime: Runtime): (Int) -> Map<String, List<LaidOutRow>> {
	val texts = runtime.texts().toMap()
	val attributes = runtime.attributes().associate { (node, name, value) -> "$node\u0000$name" to value }
	val lists = runtime.rows().toMap()
	val slotValues = runtime.slots().toMap()
	data class RowState(val state: Int, val node: String, val attribute: String, val options: List<String?>, val list: String)
	val rowStates = states.mapIndexedNotNull { index, state ->
		val hash = state.key.lastIndexOf('#')
		if (hash < 0) return@mapIndexedNotNull null
		val nodeId = state.key.substring(0, hash)
		val attribute = state.key.substring(hash + 1)
		val node = payload.nodes.firstOrNull { it.id == nodeId } as? Node.Element ?: return@mapIndexedNotNull null
		val list = node.row ?: return@mapIndexedNotNull null
		val binding = node.bindings.firstOrNull { !it.property && it.name == attribute } ?: return@mapIndexedNotNull null
		val options = rowAttributeOptions(attribute, binding.value, booleanCellsOf(payload), itemValuesOf(payload)) ?: return@mapIndexedNotNull null
		RowState(index, nodeId, attribute, options, list)
	}
	val rowTexts = payload.nodes.filterIsInstance<Node.Text>().filter { it.row != null }
	return { k ->
		payload.nodes.filterIsInstance<Node.Repeat>().filter { it.row == null }.associate { list ->
			list.id to (lists[list.id] ?: emptyList()).map { key ->
				var reached = k
				for (row in rowStates.filter { it.list == list.id }) {
					val value = attributes["${row.node}@$key\u0000${row.attribute}"]
					val option = row.options.indexOf(value)
					if (option < 0) throw MarklessDecodeError("${row.node}@$key has ${row.attribute} ${value ?: "absent"}, which its style lists no state for")
					reached = next(reached, row.state, JsValue.Str(option.toString()))
				}
				val ownSlots = payload.slots.filter { it.row == list.id }.mapNotNull { s -> slotValues["${s.id}@$key"]?.let { s.id to it } }.toMap()
				LaidOutRow(key, reached, rowTexts.filter { it.row == list.id }.associate { it.id to (texts["${it.id}@$key"] ?: "") }, ownSlots)
			}
		}
	}
}
