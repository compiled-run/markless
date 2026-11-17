import { analyze, BindingFlags, generate, parse } from '@tsrx/yuku';
import type { SemanticGraphArtifact } from '@markless/compiler';
import type { NativeViewPayload } from '@markless/serializer';

type AnyNode = { readonly type: string; readonly [key: string]: unknown };

const PRINT = { strip: true, format: 'pretty', indent: 1 } as const;
const FRAMEWORK = '@markless/core';

/**
 * Proof only (handler-boundary.md): the script for a payload's `script` ops. Each handler is its authored source with
 * types erased and every reference to a state binding (resolved by yuku) renamed to its cell, `$cells["state:count"]`;
 * the module's own helpers are copied beside it. Timers are the engine's only host service.
 */
export function nativeScript(
	payload: NativeViewPayload,
	graph: SemanticGraphArtifact,
	module: { readonly filename: string; readonly source: string },
): string | undefined {
	const handlers = payload.handlers.flatMap((handler) =>
		handler.ops.flatMap((op) => (op.op === 'script' ? [op.handler] : [])),
	);
	if (handlers.length === 0) return undefined;
	const { program, diagnostics } = parse(module.source, {}) as unknown as {
		program: AnyNode & { body: AnyNode[] };
		diagnostics: ReadonlyArray<{ message: string }>;
	};
	if (diagnostics.length > 0) throw new Error(`${module.filename}: ${diagnostics[0]!.message}`);

	const components = new Set(graph.components.map((component) => component.name));
	const frameworkNames = new Set(
		graph.moduleImports.filter((entry) => entry.source === FRAMEWORK).map((entry) => entry.localName),
	);
	const valueImports = graph.moduleImports.filter(
		(entry) => !entry.typeOnly && !entry.source.startsWith('@markless/'),
	);
	if (valueImports.length > 0)
		throw new Error(`${module.filename}: a script handler module imports ${valueImports[0]!.source}; the proof copies only same-module helpers`);

	const helpers = program.body.flatMap((statement): AnyNode[] => {
		const declaration =
			statement.type === 'ExportNamedDeclaration' || statement.type === 'ExportDefaultDeclaration'
				? (statement.declaration as AnyNode | null)
				: statement;
		if (!declaration || declaration.type === 'ImportDeclaration') return [];
		if (declaration.type === 'FunctionDeclaration' && components.has(String((declaration.id as AnyNode | null)?.name)))
			return [];
		if (declaration.type === 'VariableDeclaration') {
			const kept = (declaration.declarations as AnyNode[]).filter((declarator) => {
				const init = declarator.init as AnyNode | null;
				const callee = init?.type === 'CallExpression' ? (init.callee as AnyNode) : undefined;
				return !(callee?.type === 'Identifier' && frameworkNames.has(String(callee.name)));
			});
			return kept.length > 0 ? [{ ...declaration, declarations: kept }] : [];
		}
		return [declaration];
	});
	const helperSource = generate({ ...program, body: helpers } as never, PRINT).code;

	const cellOf = stateCells(payload, module.source);
	const handlerSource = handlers.map((id) => {
		const event = graph.events.find((candidate) => candidate.id === id);
		const span = event?.handlerSpan;
		if (!span) throw new Error(`${module.filename}: ${id} has no handler source`);
		const renamed = cellOf.renamed(span.start, span.end);
		const wrapped = parse(`const handler = (${renamed});`, {}) as unknown as { program: AnyNode };
		const printed = generate(wrapped.program as never, PRINT).code.trim();
		return `\t${JSON.stringify(id)}: function (event) {\n\t\t${printed}\n\t\treturn handler(event);\n\t}`;
	});

	return `var __markless = (function () {
var $cells = {};
var timers = {};
var nextTimer = 1;
var scheduled = [];
function setTimeout(fn, ms) { var id = nextTimer++; timers[id] = { fn: fn, ms: +ms || 0, repeat: false }; scheduled.push([id, +ms || 0]); return id; }
function setInterval(fn, ms) { var id = nextTimer++; timers[id] = { fn: fn, ms: +ms || 0, repeat: true }; scheduled.push([id, +ms || 0]); return id; }
function clearTimeout(id) { delete timers[id]; }
var clearInterval = clearTimeout;
var window = { setTimeout: setTimeout, setInterval: setInterval, clearTimeout: clearTimeout, clearInterval: clearInterval };
${helperSource}
var handlers = {
${handlerSource.join(',\n')}
};
function run(cells, body) {
	$cells = JSON.parse(cells);
	var before = {};
	for (var key in $cells) before[key] = JSON.stringify($cells[key]);
	scheduled = [];
	body();
	var writes = [];
	for (var cell in $cells) if (JSON.stringify($cells[cell]) !== before[cell]) writes.push([cell, $cells[cell]]);
	return JSON.stringify({ writes: writes, timers: scheduled });
}
return {
	dispatch: function (handler, cells, event) {
		var given = JSON.parse(event);
		var target = { value: given.value };
		var e = { target: target, currentTarget: target, key: given.key, preventDefault: function () {}, stopPropagation: function () {} };
		return run(cells, function () { handlers[handler](e); });
	},
	fire: function (id, cells) {
		return run(cells, function () {
			var timer = timers[id];
			if (!timer) return;
			if (timer.repeat) scheduled.push([id, timer.ms]);
			else delete timers[id];
			timer.fn();
		});
	}
};
})();
`;
}

/**
 * The root component's state bindings as yuku resolves them: a `const`/`let` whose value is a call to `state` or `storage`
 * imported from `@markless/core`, matched to the payload cell of that name. `renamed` gives a span of the module with each
 * reference to one of them spelled as its cell.
 */
function stateCells(payload: NativeViewPayload, source: string) {
	const semantic = analyze(source, {});
	const cells = new Map(payload.cells.filter((cell) => !cell.id.includes('/')).map((cell) => [cell.name, cell.id]));
	const byBinding = new Map<number, string>();
	for (const binding of semantic.bindings) {
		const declaration = binding.declarations[0] as unknown as AnyNode | undefined;
		const declarator = declaration && (semantic.parentOf(declaration as never) as unknown as AnyNode | null);
		const init = declarator?.type === 'VariableDeclarator' ? (declarator.init as AnyNode | null) : null;
		const callee = init?.type === 'CallExpression' ? (init.callee as AnyNode) : undefined;
		const api = callee?.type === 'Identifier' ? semantic.referenceOf(callee as never)?.binding : undefined;
		if (!api?.has(BindingFlags.Import)) continue;
		const imported = semantic.imports.find((entry) => entry.local?.id === api.id);
		if (imported?.specifier !== FRAMEWORK || (imported.name !== 'state' && imported.name !== 'storage')) continue;
		const cell = cells.get(binding.name);
		if (cell) byBinding.set(binding.id, cell);
	}
	return {
		renamed(start: number, end: number): string {
			const edits = semantic.references
				.filter((reference) => reference.node.start >= start && reference.node.end <= end)
				.flatMap((reference) => {
					const cell = reference.binding && byBinding.get(reference.binding.id);
					if (!cell) return [];
					const parent = semantic.parentOf(reference.node as never) as unknown as AnyNode | null;
					const access = `$cells[${JSON.stringify(cell)}]`;
					const shorthand = parent?.type === 'Property' && parent.shorthand === true;
					return [{ start: reference.node.start, end: reference.node.end, text: shorthand ? `${reference.name}: ${access}` : access }];
				})
				.sort((a, b) => b.start - a.start);
			let text = source.slice(start, end);
			for (const edit of edits) text = text.slice(0, edit.start - start) + edit.text + text.slice(edit.end - start);
			return text;
		},
	};
}
