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
fun rowAttributeOptions(name: String, expr: Expr): List<String?>? = when (expr) {
	is Expr.Literal -> listOf(AttributeValue.of(name, expr.value))
	is Expr.If -> {
		val a = rowAttributeOptions(name, expr.whenTrue)
		val b = rowAttributeOptions(name, expr.whenFalse)
		if (a == null || b == null) null else (a + b).distinct()
	}
	else -> null
}

/** The export's states of each row: a row's class or ui-* values (`<node>#<attribute>`) and each @if or @try inside a row. */
fun StyleExport.rowStates(payload: Payload): Set<String> {
	val inRows = payload.nodes.filter { it.row != null }.map { it.id }.toSet()
	return states.map { it.key }.filter { key -> key in inRows || key.substringBeforeLast('#', "") in inRows }.toSet()
}

/**
 * The rows each list of the page shows now, for laying the page out at assignment k: each row's key, the assignment its own
 * states (the value its `class` or `ui-*` binding gives, the arm each @if inside it shows) reach from k, and its texts by the
 * template's text node id.
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
		val options = rowAttributeOptions(attribute, binding.value) ?: return@mapIndexedNotNull null
		RowState(index, nodeId, attribute, options, list)
	}
	// Each @if or @try inside a row: its state is the arm the row's own copy of it shows.
	val rowBranches = payload.nodes.filterIsInstance<Node.Branch>().mapNotNull { b -> b.row?.let { list -> states.indexOfFirst { it.key == b.id }.takeIf { it >= 0 }?.let { Triple(it, b.id, list) } } }
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
				for ((state, branch, of) in rowBranches) {
					if (of != list.id) continue
					val arm = runtime.styleArm("$branch@$key") ?: throw MarklessDecodeError("$branch@$key is not a branch the page shows")
					reached = next(reached, state, arm)
				}
				LaidOutRow(key, reached, rowTexts.filter { it.row == list.id }.associate { it.id to (texts["${it.id}@$key"] ?: "") })
			}
		}
	}
}
