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
 * literals chosen by conditions, in first-seen order; null for any other binding.
 */
fun rowAttributeOptions(name: String, expr: Expr, booleanCells: Set<String> = emptySet()): List<String?>? = when {
	givesBoolean(expr, booleanCells) -> listOf(AttributeValue.of(name, JsValue.Bool(true)), AttributeValue.of(name, JsValue.Bool(false))).distinct()
	else -> literalOptions(name, expr, booleanCells)
}

/** The payload's cells whose first value is true or false. */
fun booleanCellsOf(payload: Payload): Set<String> = payload.cells.filter { it.initial is JsValue.Bool }.map { it.id }.toSet()

private fun literalOptions(name: String, expr: Expr, booleanCells: Set<String>): List<String?>? = when (expr) {
	is Expr.Literal -> listOf(AttributeValue.of(name, expr.value))
	is Expr.If -> {
		val a = rowAttributeOptions(name, expr.whenTrue, booleanCells)
		val b = rowAttributeOptions(name, expr.whenFalse, booleanCells)
		if (a == null || b == null) null else (a + b).distinct()
	}
	else -> null
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
	data class RowState(val state: Int, val node: String, val attribute: String, val options: List<String?>, val list: String)
	val rowStates = states.mapIndexedNotNull { index, state ->
		val hash = state.key.lastIndexOf('#')
		if (hash < 0) return@mapIndexedNotNull null
		val nodeId = state.key.substring(0, hash)
		val attribute = state.key.substring(hash + 1)
		val node = payload.nodes.firstOrNull { it.id == nodeId } as? Node.Element ?: return@mapIndexedNotNull null
		val list = node.row ?: return@mapIndexedNotNull null
		val binding = node.bindings.firstOrNull { !it.property && it.name == attribute } ?: return@mapIndexedNotNull null
		val options = rowAttributeOptions(attribute, binding.value, booleanCellsOf(payload)) ?: return@mapIndexedNotNull null
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
				LaidOutRow(key, reached, rowTexts.filter { it.row == list.id }.associate { it.id to (texts["${it.id}@$key"] ?: "") })
			}
		}
	}
}
