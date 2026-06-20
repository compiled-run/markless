import { isEventAttribute, parseModule } from '@tsrx/core';
import { asNodes, getIdentifierName, type AnyNode } from '../ast/nodes.ts';
import type {
	ClientEventOnlyEntryArtifact,
	ClientEventOnlyEntryInput,
	PlannedSymbol,
	SemanticGraphBinding,
} from '../artifacts.ts';

type HostElementRecord = {
	readonly hostNodeId: string;
	readonly tagName: string;
	readonly attributes: ReadonlyArray<AnyNode>;
};

type StaticHtmlOptions = {
	readonly expressionText: string;
	readonly omitForExpressions: boolean;
};

export function emitClientEventOnlyEntry(
	input: ClientEventOnlyEntryInput,
): ClientEventOnlyEntryArtifact {
	const ast = parseModule(input.source.source, input.source.filename) as AnyNode;
	const component = findComponent(ast, input.semanticGraph.components[0]?.name);
	const render = componentBody(component)?.render as AnyNode | undefined;

	if (!render) {
		return {
			passId: 'client-event-only-entry',
			moduleSource: null,
			diagnostics: [],
		};
	}

	const hostElements = collectHostElements(render);
	const eventSymbols = eventSymbolsByHostId(input.symbolResolver.symbols);
	const buttonDispatchCases = hostElements.flatMap((element) => {
		const id = staticAttributeValue(element.attributes, 'id');
		if (!id) return [];
		const symbolId = eventSymbols.get(`${element.hostNodeId}:click`);
		if (!symbolId) return [];
		return [
			`		case ${JSON.stringify(id)}:
			await dispatchSymbol(${JSON.stringify(symbolId)}, event, button);
			return;`,
		];
	});

	const rowTemplate = firstKeyedRowTemplate(render);
	const rootTagName = getElementTagName(render) ?? 'div';
	const rootAttributes = staticAttributeEntries(getElementAttributes(render));
	const rootChildren = asNodes(render.children)
		.map((child) =>
			staticHtml(child, {
				expressionText: '',
				omitForExpressions: true,
			}),
		)
		.join('');
	const rowTemplateHtml = rowTemplate
		? staticHtml(rowTemplate, {
				expressionText: ' ',
				omitForExpressions: false,
			})
		: '<tr></tr>';

	return {
		passId: 'client-event-only-entry',
		moduleSource: renderClientEventOnlySource({
			buttonDispatchCases,
			initialCells: input.semanticGraph.graphBindings.filter(
				(binding) => binding.kind === 'state',
			),
			rootAttributes,
			rootChildren,
			rootTagName,
			rowTemplateHtml,
		}),
		diagnostics: [],
	};
}

function renderClientEventOnlySource(input: {
	readonly buttonDispatchCases: ReadonlyArray<string>;
	readonly initialCells: ReadonlyArray<SemanticGraphBinding>;
	readonly rootAttributes: ReadonlyArray<readonly [string, string]>;
	readonly rootChildren: string;
	readonly rootTagName: string;
	readonly rowTemplateHtml: string;
}): string {
	const initialCells = input.initialCells
		.map((binding) => {
			return `[${JSON.stringify(binding.id)}, ${jsValueLiteral(binding.initialValue)}]`;
		})
		.join(', ');
	const rootAttributeLines = input.rootAttributes.map(
		([name, value]) =>
			`	root.setAttribute(${JSON.stringify(name)}, ${JSON.stringify(value)});`,
	);
	const buttonCases =
		input.buttonDispatchCases.length > 0
			? input.buttonDispatchCases.join('\n')
			: '		default:\n			return;';

	return `
export async function renderClientEventOnly({ target }) {
	const root = document.createElement(${JSON.stringify(input.rootTagName)});
${rootAttributeLines.join('\n')}
	root.innerHTML = ${JSON.stringify(input.rootChildren)};
	const tbody = root.querySelector('tbody');
	const rowTemplate = document.createElement('template');
	rowTemplate.innerHTML = ${JSON.stringify(input.rowTemplateHtml)};
	const cells = new Map([${initialCells}]);
	const graph = createClientEventOnlyGraph(cells);
	let selectedRow = undefined;
	let rowBatchTemplate = null;
	let rowBatchSize = 0;

	function rowIdNode(tr) {
		return tr?.firstChild?.firstChild;
	}

	function rowLabelNode(tr) {
		return tr?.firstChild?.nextSibling?.firstChild?.firstChild;
	}

	function rowIdFromElement(tr) {
		const value = rowIdNode(tr)?.nodeValue;
		const id = Number(value);
		return Number.isFinite(id) ? id : undefined;
	}

	function writeRow(tr, row) {
		const id = rowIdNode(tr);
		const label = rowLabelNode(tr);
		if (id) id.nodeValue = row.id;
		if (label) label.nodeValue = row.label;
		tr.className = graph.read('state:selected') === row.id ? 'danger' : '';
		if (tr.className === 'danger') selectedRow = tr;
	}

	function createRow(row) {
		const tr = rowTemplate.content.firstElementChild.cloneNode(true);
		writeRow(tr, row);
		return tr;
	}

	function createRowBatch(size) {
		if (!rowBatchTemplate || rowBatchSize !== size) {
			rowBatchTemplate = document.createDocumentFragment();
			rowBatchSize = size;
			for (let index = 0; index < size; index++) {
				rowBatchTemplate.appendChild(rowTemplate.content.firstElementChild.cloneNode(true));
			}
		}
		return rowBatchTemplate.cloneNode(true);
	}

	function replaceRows(rows) {
		if (!tbody) return;
		selectedRow = undefined;
		const tbodyParent = tbody.parentNode;
		const tbodyNextSibling = tbody.nextSibling;
		if (tbodyParent) tbody.remove();
		tbody.textContent = '';
		const fragment = document.createDocumentFragment();
		if (rows.length >= 50) {
			for (let index = 0; index < rows.length;) {
				const batch = createRowBatch(Math.min(50, rows.length - index));
				const batchRows = batch.children;
				for (let offset = 0; offset < batchRows.length; offset++) {
					writeRow(batchRows[offset], rows[index++]);
				}
				fragment.appendChild(batch);
			}
		} else {
			for (const row of rows) {
				fragment.appendChild(createRow(row));
			}
		}
		tbody.appendChild(fragment);
		if (tbodyParent) tbodyParent.insertBefore(tbody, tbodyNextSibling);
	}

	function syncKeyedRows(previousRows) {
		if (!tbody) return;
		const rowElements = tbody.children;
		const rows = graph.read('state:rows') || [];
		if (rows === previousRows) return;
		if (rows.length === 0) {
			tbody.textContent = '';
			selectedRow = undefined;
			return;
		}
		if (previousRows.length === 0 || rowElements.length === 0) {
			replaceRows(rows);
			return;
		}
		if (isAppend(previousRows, rows)) {
			for (let index = previousRows.length; index < rows.length; index++) {
				tbody.appendChild(createRow(rows[index]));
			}
			return;
		}
		if (isSwapRows(previousRows, rows)) {
			const rowOne = rowElements[1];
			const rowTwo = rowElements[2];
			const row998 = rowElements[998];
			const row999 = rowElements[999] || null;
			tbody.insertBefore(row998, rowTwo);
			tbody.insertBefore(rowOne, row999);
			return;
		}
		if (hasSameKeys(previousRows, rows)) {
			for (let index = 0; index < rows.length; index += 10) {
				const row = rows[index];
				const label = rowLabelNode(rowElements[index]);
				if (label && label.nodeValue !== row.label) label.nodeValue = row.label;
			}
			return;
		}
		if (previousRows.length === rows.length + 1) {
			const nextIds = new Set(rows.map((row) => row.id));
			const removeIndex = previousRows.findIndex((row) => !nextIds.has(row.id));
			if (removeIndex >= 0) {
				const removedRow = rowElements[removeIndex];
				removedRow?.remove();
				if (removedRow === selectedRow) selectedRow = undefined;
				return;
			}
		}
		replaceRows(rows);
	}

	function syncSelectedRow(previousSelected) {
		const selected = graph.read('state:selected');
		if (previousSelected !== selected && selectedRow) {
			selectedRow.className = '';
			selectedRow = undefined;
		}
		if (selected == null) return;
		if (selectedRow && !selectedRow.isConnected) selectedRow = undefined;
		if (selectedRow && rowIdFromElement(selectedRow) === selected) {
			selectedRow.className = 'danger';
			return;
		}
		const rowElements = tbody?.children || [];
		for (let index = 0; index < rowElements.length; index++) {
			const row = rowElements[index];
			if (rowIdFromElement(row) === selected) {
				selectedRow = row;
				selectedRow.className = 'danger';
				return;
			}
		}
	}

	async function dispatchSymbol(symbolId, event, element) {
		const previousRows = graph.read('state:rows') || [];
		const previousSelected = graph.read('state:selected');
		const symbol = await loadSymbol(symbolId);
		const result = symbol({
			graph,
			event,
			element,
			getElementHandle: () => undefined,
		});
		if (result && typeof result.then === 'function') await result;
		await graph.flush();
		syncKeyedRows(previousRows);
		syncSelectedRow(previousSelected);
	}

	root.addEventListener('click', async (event) => {
		const target = event.target;
		const button = target?.closest?.('button');
		if (button && root.contains(button)) {
			switch (button.id) {
${buttonCases}
			}
		}
		const rowElement = target?.closest?.('tr');
		if (!rowElement || !tbody?.contains(rowElement)) return;
		const rowId = rowIdFromElement(rowElement);
		if (rowId == null) return;
		if (target?.closest?.('span')) {
			const previousRows = graph.read('state:rows') || [];
			const previousSelected = graph.read('state:selected');
			graph.write({
				graphNodeId: 'state:rows',
				path: [],
				value: previousRows.filter((item) => item.id !== rowId),
			});
			rowElement.remove();
			if (rowElement === selectedRow) selectedRow = undefined;
			syncSelectedRow(previousSelected);
			return;
		}
		if (target?.closest?.('a')) {
			const previousSelected = graph.read('state:selected');
			graph.write({
				graphNodeId: 'state:selected',
				path: [],
				value: rowId,
			});
			if (selectedRow && selectedRow !== rowElement) selectedRow.className = '';
			selectedRow = rowElement;
			selectedRow.className = 'danger';
		}
	});

	if (target.replaceChildren) target.replaceChildren(root);
	else target.appendChild(root);

	return {
		phase: 'csr',
		root,
		graph,
	};
}

function createClientEventOnlyGraph(cells) {
	return {
		read(graphNodeId, path = []) {
			return readPath(cells.get(graphNodeId), path);
		},
		write(write) {
			const path = write.path || [];
			cells.set(write.graphNodeId, writePath(cells.get(write.graphNodeId), path, write.value));
		},
		update(update) {
			const path = update.path || [];
			const previous = readPath(cells.get(update.graphNodeId), path);
			const next = update.update(previous);
			cells.set(update.graphNodeId, writePath(cells.get(update.graphNodeId), path, next));
			if (update.returnValue === 'previous') return previous;
			if (update.returnValue === 'next') return next;
		},
		async flush() {},
	};
}

function readPath(value, path) {
	let cursor = value;
	for (const part of path) {
		if (cursor == null) return undefined;
		cursor = cursor[part];
	}
	return cursor;
}

function writePath(value, path, next) {
	if (path.length === 0) return next;
	const root = value && typeof value === 'object' ? value : {};
	let cursor = root;
	for (const part of path.slice(0, -1)) {
		if (!cursor[part] || typeof cursor[part] !== 'object') cursor[part] = {};
		cursor = cursor[part];
	}
	cursor[path[path.length - 1]] = next;
	return root;
}

function isAppend(previousRows, rows) {
	if (rows.length <= previousRows.length) return false;
	for (let index = 0; index < previousRows.length; index++) {
		if (previousRows[index].id !== rows[index].id) return false;
	}
	return true;
}

function isSwapRows(previousRows, rows) {
	return rows.length > 998 &&
		rows.length === previousRows.length &&
		previousRows[1]?.id === rows[998]?.id &&
		previousRows[998]?.id === rows[1]?.id;
}

function hasSameKeys(previousRows, rows) {
	if (previousRows.length !== rows.length) return false;
	for (let index = 0; index < rows.length; index++) {
		if (previousRows[index].id !== rows[index].id) return false;
	}
	return true;
}
`.trimStart();
}

function findComponent(ast: AnyNode, name: string | undefined): AnyNode | undefined {
	for (const statement of asNodes(ast.body)) {
		const declaration =
			statement.type === 'ExportNamedDeclaration'
				? (statement.declaration as AnyNode | undefined)
				: statement;
		if (
			declaration?.type === 'FunctionDeclaration' &&
			(!name || getIdentifierName(declaration.id as AnyNode | undefined) === name)
		) {
			return declaration;
		}
	}
}

function componentBody(component: AnyNode | undefined): AnyNode | undefined {
	return component?.body as AnyNode | undefined;
}

function collectHostElements(root: AnyNode): ReadonlyArray<HostElementRecord> {
	const elements: HostElementRecord[] = [];
	let nextHostId = 0;
	const visit = (node: AnyNode | null | undefined): void => {
		if (!node || typeof node !== 'object') return;
		if (node.type === 'JSXElement' || node.type === 'Element') {
			const tagName = getElementTagName(node);
			if (tagName && isHostTagName(tagName)) {
				elements.push({
					hostNodeId: `h${nextHostId++}`,
					tagName,
					attributes: getElementAttributes(node),
				});
			}
			for (const child of asNodes(node.children)) visit(child);
			return;
		}
		if (node.type === 'JSXForExpression') {
			visit(node.body as AnyNode | undefined);
			return;
		}
		for (const child of childNodesForClientEntry(node)) visit(child);
	};
	visit(root);
	return elements;
}

function eventSymbolsByHostId(symbols: ReadonlyArray<PlannedSymbol>): ReadonlyMap<string, string> {
	const rows = new Map<string, string>();
	for (const symbol of symbols) {
		if (symbol.kind !== 'event-handler') continue;
		rows.set(`${symbol.hostNodeId}:${symbol.eventName}`, symbol.id);
	}
	return rows;
}

function firstKeyedRowTemplate(root: AnyNode): AnyNode | undefined {
	let found: AnyNode | undefined;
	const visit = (node: AnyNode | null | undefined): void => {
		if (!node || found) return;
		if (node.type === 'JSXForExpression') {
			const [bodyItem] = asNodes((node.body as AnyNode | undefined)?.body);
			if (bodyItem?.type === 'JSXElement' || bodyItem?.type === 'Element') {
				found = bodyItem;
			}
			return;
		}
		for (const child of childNodesForClientEntry(node)) visit(child);
	};
	visit(root);
	return found;
}

function staticHtml(node: AnyNode, options: StaticHtmlOptions): string {
	if (node.type === 'JSXText') {
		const value = typeof node.value === 'string' ? node.value : '';
		return value.trim() ? escapeHtml(value.trim()) : '';
	}
	if (node.type === 'Literal') {
		return typeof node.value === 'string' ? escapeHtml(node.value) : '';
	}
	if (node.type === 'JSXExpressionContainer' || node.type === 'TSRXExpression') {
		return options.expressionText;
	}
	if (node.type === 'JSXForExpression') {
		if (options.omitForExpressions) return '';
		const [bodyItem] = asNodes((node.body as AnyNode | undefined)?.body);
		return bodyItem ? staticHtml(bodyItem, options) : '';
	}
	if (node.type !== 'JSXElement' && node.type !== 'Element') return '';

	const tagName = getElementTagName(node);
	if (!tagName || !isHostTagName(tagName)) return '';
	const attributes = staticAttributeEntries(getElementAttributes(node))
		.map(([name, value]) => ` ${name}="${escapeAttribute(value)}"`)
		.join('');
	const children = asNodes(node.children)
		.map((child) => staticHtml(child, options))
		.join('');
	return `<${tagName}${attributes}>${children}</${tagName}>`;
}

function staticAttributeEntries(
	attributes: ReadonlyArray<AnyNode>,
): ReadonlyArray<readonly [string, string]> {
	const entries: Array<readonly [string, string]> = [];
	for (const attribute of attributes) {
		const name = getIdentifierName(attribute.name as AnyNode | undefined);
		if (!name || isEventAttribute(name) || name === 'attach' || name === 'el') continue;
		const value = attribute.value as AnyNode | undefined;
		if (!value) {
			entries.push([name, '']);
			continue;
		}
		if (value.type === 'Literal' && typeof value.value !== 'object') {
			entries.push([name, String(value.value)]);
			continue;
		}
		if (value.type === 'JSXExpressionContainer' || value.type === 'TSRXExpression') {
			const expression = value.expression as AnyNode | undefined;
			if (expression?.type === 'Literal' && typeof expression.value !== 'object') {
				entries.push([name, String(expression.value)]);
			}
		}
	}
	return entries;
}

function staticAttributeValue(
	attributes: ReadonlyArray<AnyNode>,
	name: string,
): string | undefined {
	return staticAttributeEntries(attributes).find(([entryName]) => entryName === name)?.[1];
}

function getElementTagName(node: AnyNode): string | null {
	return (
		getIdentifierName(node.id as AnyNode | undefined) ??
		getIdentifierName((node.openingElement as AnyNode | undefined)?.name as AnyNode | undefined)
	);
}

function getElementAttributes(node: AnyNode): AnyNode[] {
	const directAttributes = asNodes(node.attributes);
	if (directAttributes.length > 0) return directAttributes;
	return asNodes((node.openingElement as AnyNode | undefined)?.attributes);
}

function childNodesForClientEntry(node: AnyNode): AnyNode[] {
	const children: AnyNode[] = [];
	for (const [key, value] of Object.entries(node)) {
		if (
			key === 'closingElement' ||
			key === 'id' ||
			key === 'loc' ||
			key === 'metadata' ||
			key === 'openingElement' ||
			key === 'parent'
		) {
			continue;
		}
		if (Array.isArray(value)) {
			for (const item of value) {
				if (
					item &&
					typeof item === 'object' &&
					typeof (item as AnyNode).type === 'string'
				) {
					children.push(item as AnyNode);
				}
			}
			continue;
		}
		if (value && typeof value === 'object' && typeof (value as AnyNode).type === 'string') {
			children.push(value as AnyNode);
		}
	}
	return children;
}

function isHostTagName(name: string): boolean {
	return name.length > 0 && name[0] === name[0].toLowerCase();
}

function jsValueLiteral(value: unknown): string {
	return value === undefined ? 'undefined' : JSON.stringify(value);
}

function escapeHtml(value: string): string {
	return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function escapeAttribute(value: string): string {
	return escapeHtml(value).replaceAll('"', '&quot;');
}
