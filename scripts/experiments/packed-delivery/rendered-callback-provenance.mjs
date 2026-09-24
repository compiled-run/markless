import { parseSync } from 'rolldown/experimental';

export function createCallbackProbe() {
	const slotMarker = Symbol('rendered-callback-probe');
	const renders = [];
	return {
		renders,
		slot(state, graphNodeId) {
			const cell = state.cells?.find((candidate) => candidate.graphNodeId === graphNodeId);
			if (cell) cell[slotMarker] = true;
		},
		composed(state, children) {
			if (!state) return;
			const callbacks = [];
			const unknownCells = [];
			for (const cell of state.cells ?? []) {
				if (cell[slotMarker]) {
					if (cell.directValue !== undefined && typeof cell.directValue !== 'string')
						throw new Error(`Unexpected callback value for ${cell.graphNodeId}`);
					if (cell.value !== undefined)
						throw new Error(
							`Callback was serialized before inspection: ${cell.graphNodeId}`,
						);
					callbacks.push({ graphNodeId: cell.graphNodeId, symbolId: cell.directValue });
				} else if (cell.valueKind === 'unknown') unknownCells.push(cell.graphNodeId);
			}
			renders.push({
				callbacks,
				unknownCells,
				prefixes: children.map((child) => child.symbolPrefix),
			});
		},
	};
}

export function instrumentCallbackProvenance(source) {
	const parsed = parseSync('callback-probe.js', source);
	if (parsed.errors.length)
		throw new Error(`Cannot parse SSR source: ${JSON.stringify(parsed.errors)}`);
	const edits = [];
	const instrumented = [];
	visit(parsed.program, (node) => {
		if (node.type !== 'FunctionDeclaration') return;
		const method =
			node.id?.name === 'marklessSsrCallbackSlot'
				? 'slot'
				: node.id?.name === 'composeMdxState'
					? 'composed'
					: undefined;
		if (!method) return;
		if (
			node.async ||
			node.generator ||
			node.params.some((param) => param.type !== 'Identifier') ||
			node.params.length !== (method === 'slot' ? 3 : 1)
		)
			throw new Error(`Unexpected helper parameters: ${node.id.name}`);
		const names = node.params.map((param) => param.name);
		const args = method === 'slot' ? names.join(',') : ['__probeResult', ...names].join(',');
		edits.push({
			start: node.body.start + 1,
			end: node.body.start + 1,
			text: 'const __probeResult=(()=>{',
		});
		edits.push({
			start: node.body.end - 1,
			end: node.body.end - 1,
			text: `})();globalThis.__marklessRenderedCallbackProbe.${method}(${args});return __probeResult;`,
		});
		instrumented.push(node.id.name);
	});
	let transformed = source;
	for (const edit of edits.sort((left, right) => right.start - left.start))
		transformed = transformed.slice(0, edit.start) + edit.text + transformed.slice(edit.end);
	if (parseSync('callback-probe.js', transformed).errors.length)
		throw new Error('Invalid instrumented SSR source');
	return { source: transformed, instrumented };
}

function visit(value, callback) {
	if (!value || typeof value !== 'object') return;
	if (Array.isArray(value)) {
		for (const item of value) visit(item, callback);
		return;
	}
	callback(value);
	for (const [key, child] of Object.entries(value)) if (key !== 'parent') visit(child, callback);
}
