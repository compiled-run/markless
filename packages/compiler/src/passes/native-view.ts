import type {
	NativeArmPlace,
	NativeBuiltin,
	NativeExpr,
	NativeNode,
	NativeOp,
	NativeScalar,
	NativeTextPart,
	NativeViewPayload,
} from '@markless/serializer';
import { NATIVE_VIEW_VERSION } from '@markless/serializer/native-view';
import type {
	CompilerDiagnostic,
	SemanticEvent,
	SemanticGraphArtifact,
	SemanticMarkupChunk,
	SemanticTemplateRead,
	SemanticExpression,
	SourceSpan,
} from '../artifacts.ts';

export const NATIVE_UNSUPPORTED_CODE = 'MARKLESS_NATIVE_UNSUPPORTED';

export type NativeViewArtifact = {
	readonly passId: 'native-view';
	readonly payload: NativeViewPayload | null;
	readonly diagnostics: ReadonlyArray<CompilerDiagnostic>;
};

type ElementBindings = NonNullable<Extract<NativeNode, { kind: 'element' }>['bindings']>;

/** Elements every native host maps; anything else is refused here once, not in each host. */
const PORTABLE_ELEMENTS = new Set([
	'main',
	'div',
	'section',
	'article',
	'header',
	'footer',
	'nav',
	'aside',
	'h1',
	'h2',
	'h3',
	'h4',
	'h5',
	'h6',
	'p',
	'span',
	'b',
	'strong',
	'em',
	'i',
	'ul',
	'ol',
	'li',
	'button',
]);

const SEMANTIC_EVENTS: Readonly<Record<string, NativeViewPayload['events'][number]['event']>> = {
	click: 'activate',
};

type Item =
	| { readonly kind: 'host'; readonly id: string; readonly path: ReadonlyArray<number> }
	| { readonly kind: 'part'; readonly part: NativeTextPart; readonly path: ReadonlyArray<number> }
	| {
			readonly kind: 'branch';
			readonly id: string;
			readonly arms: ReadonlyArray<string>;
			readonly path: ReadonlyArray<number>;
	  };

const comparePaths = (a: ReadonlyArray<number>, b: ReadonlyArray<number>): number => {
	for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i]! - b[i]!;
	return a.length - b.length;
};

const isPrefix = (prefix: ReadonlyArray<number>, path: ReadonlyArray<number>): boolean =>
	prefix.length < path.length && prefix.every((step, i) => path[i] === step);

/** Builds the native view of a module's root component from its semantic graph, or refuses with diagnostics. */
export function createNativeViewPayload(graph: SemanticGraphArtifact): NativeViewArtifact {
	const diagnostics: CompilerDiagnostic[] = [];
	const refuse = (message: string, span?: SourceSpan): null => {
		diagnostics.push({
			code: NATIVE_UNSUPPORTED_CODE,
			severity: 'error',
			phase: 'serialization',
			title: 'This component cannot be built for a native target yet',
			message,
			why: 'Native hosts build retained views from compiler facts and run handlers as data; this construct has no native lowering yet.',
			...(span ? { primarySpan: span } : {}),
			passId: 'native-view',
			suggestions: [],
			docsUrl: `https://markless.dev/errors/${NATIVE_UNSUPPORTED_CODE}`,
		});
		return null;
	};
	const done = (payload: NativeViewPayload | null): NativeViewArtifact => ({
		passId: 'native-view',
		payload: diagnostics.length > 0 ? null : payload,
		diagnostics,
	});

	const root = graph.markup.root;
	if (!root) return done(refuse('the module has no root component'));
	if (graph.components.length !== 1) refuse('a module with more than one component');
	if (graph.componentEdges.length > 0) refuse('child components');
	if (graph.keyedRepeats.length > 0) refuse('@for');
	if (graph.asyncBoundaries.length > 0) refuse('@try');
	if (graph.behaviors.length > 0) refuse('attach behaviours');
	const chunks = new Map(graph.markup.chunks.map((chunk) => [chunk.id, chunk]));
	const rootChunk = chunks.get(root.templateId);
	if (!rootChunk) return done(refuse('the root template has no markup'));

	const cells = graph.graphBindings.flatMap((binding) => {
		if (binding.kind !== 'state') return [];
		const value = binding.initialValue;
		if (
			binding.initialValueKnown !== true ||
			!(
				typeof value === 'string' ||
				typeof value === 'boolean' ||
				(typeof value === 'number' && Number.isFinite(value))
			)
		) {
			refuse(
				`state \`${binding.name}\` needs a number, string or boolean initial value known at build time`,
			);
			return [];
		}
		return [
			{
				id: binding.id,
				name: binding.name,
				initial: value as NativeScalar,
				...(binding.storage ? { storage: { key: binding.storage.key } } : {}),
			},
		];
	});
	const cellIds = new Set(cells.map((cell) => cell.id));
	const cellOfName = new Map(cells.map((cell) => [cell.name, cell.id]));

	const exprOf = (
		expression: SemanticExpression | undefined,
		what: string,
	): NativeExpr | null => {
		if (!expression) return refuse(`${what} has no expression the compiler recorded`);
		const all = (list: ReadonlyArray<SemanticExpression>): NativeExpr[] | null => {
			const lowered = list.map((item) => exprOf(item, what));
			return lowered.every((item) => item !== null) ? (lowered as NativeExpr[]) : null;
		};
		switch (expression.kind) {
			case 'read': {
				const cell = cellOfName.get(expression.name);
				return cell
					? { cell }
					: refuse(
							`${what} reads \`${expression.name}\`, which is not state of this component`,
						);
			}
			case 'literal':
				return { literal: expression.value };
			case 'unary': {
				const value = exprOf(expression.value, what);
				return value && { unary: expression.operator, value };
			}
			case 'binary':
			case 'logical': {
				const left = exprOf(expression.left, what);
				const right = exprOf(expression.right, what);
				if (!left || !right) return null;
				return expression.kind === 'binary'
					? { binary: expression.operator, left, right }
					: { logical: expression.operator, left, right };
			}
			case 'conditional': {
				const test = exprOf(expression.test, what);
				const whenTrue = exprOf(expression.consequent, what);
				const whenFalse = exprOf(expression.alternate, what);
				return test && whenTrue && whenFalse ? { if: test, whenTrue, whenFalse } : null;
			}
			case 'template': {
				const parts = expression.parts.map((part) =>
					typeof part === 'string' ? part : exprOf(part, what),
				);
				return parts.every((part) => part !== null)
					? { template: parts as (string | NativeExpr)[] }
					: null;
			}
			case 'member': {
				if (expression.property !== 'length')
					return refuse(`${what} reads \`.${expression.property}\` of a value`);
				const object = exprOf(expression.object, what);
				return object && { member: object, property: 'length' };
			}
			case 'call': {
				const args = all(expression.arguments);
				return args && { call: expression.callee as NativeBuiltin, arguments: args };
			}
			case 'unsupported':
				return refuse(`${what} uses ${expression.construct}, which needs a script engine`);
		}
	};

	const readsByHost = new Map<string, SemanticTemplateRead[]>();
	for (const read of graph.templateReads) {
		const list = readsByHost.get(read.hostNodeId) ?? [];
		list.push(read);
		readsByHost.set(read.hostNodeId, list);
	}
	const bindingsOf = (host: string): ElementBindings =>
		(readsByHost.get(host) ?? []).flatMap((read): ElementBindings => {
			const target = read.target;
			if (target.kind === 'text') return [];
			if (target.kind === 'attribute') {
				const value = exprOf(read.expression, `the \`${target.name}\` attribute`);
				return value ? [{ attribute: target.name, value }] : [];
			}
			if (
				target.kind === 'class' &&
				target.trueValue !== undefined &&
				target.falseValue !== undefined &&
				target.constantClass === undefined &&
				target.leadingClass === undefined
			) {
				const test = exprOf(read.expression, 'the class test');
				return test
					? [
							{
								attribute: 'class',
								value: {
									if: test,
									whenTrue: { literal: target.trueValue },
									whenFalse: { literal: target.falseValue },
								},
							},
						]
					: [];
			}
			refuse(`a ${target.kind} binding${'name' in target ? ` (\`${target.name}\`)` : ''}`);
			return [];
		});
	const computedReads = new Map(
		graph.templateReads.flatMap((read) =>
			read.computedGraphNodeId && read.target.kind === 'text'
				? [[read.computedGraphNodeId, read] as const]
				: [],
		),
	);
	const textPartOf = (graphNodeId: string): NativeTextPart | null => {
		if (cellIds.has(graphNodeId)) return { cell: graphNodeId };
		const read = computedReads.get(graphNodeId);
		const expr = read
			? exprOf(read.expression, 'a text expression')
			: refuse('a text binding that is not state');
		return expr && { expr };
	};

	const tagOf = new Map(graph.hostNodes.map((host) => [host.id, host.tagName]));
	const branchSites = new Map(graph.branchSites.map((site) => [site.id, site]));
	const nodes: NativeNode[] = [];
	const textRuns = new Map<string, number>();
	const lowered = new Set<string>();

	const lowerChunk = (
		chunk: SemanticMarkupChunk,
		baseParent: string | null,
		arm: NativeArmPlace | undefined,
	) => {
		lowered.add(chunk.id);
		const place = arm ? { arm } : {};
		const items: Item[] = [
			...chunk.hosts.map((host): Item => ({
				kind: 'host',
				id: host.hostNodeId,
				path: host.coordinate.path,
			})),
			...(chunk.texts ?? []).map((text): Item => ({
				kind: 'part',
				part: { text: text.text },
				path: text.coordinate.path,
			})),
		];
		for (const slot of chunk.slots) {
			if (slot.kind === 'attribute') continue;
			if (slot.kind === 'branch') {
				items.push({
					kind: 'branch',
					id: slot.branchSiteId,
					arms: slot.armTemplateIds,
					path: slot.coordinate.path,
				});
				continue;
			}
			if (slot.kind !== 'text') {
				refuse(`a ${slot.kind} binding`);
				continue;
			}
			if (slot.residue.kind !== 'graph-read') {
				refuse(`a text binding the compiler renders once (${slot.residue.kind})`);
				continue;
			}
			const path = slot.residue.path;
			if (path.length > 1 || (path.length === 1 && path[0] !== 'length')) {
				refuse(`a text binding that reads \`.${path.join('.')}\` of state`);
				continue;
			}
			const read = textPartOf(slot.residue.graphNodeId);
			const part: NativeTextPart | null =
				read && path.length === 1 && 'cell' in read
					? { expr: { member: { cell: read.cell }, property: 'length' } }
					: read;
			if (part) items.push({ kind: 'part', part, path: slot.coordinate.path });
		}
		items.sort((a, b) => comparePaths(a.path, b.path));

		const hostPaths = items.filter((item) => item.kind === 'host');
		const parentOf = (path: ReadonlyArray<number>): string | null => {
			let parent: (typeof hostPaths)[number] | null = null;
			for (const host of hostPaths) {
				if (isPrefix(host.path, path) && (!parent || host.path.length > parent.path.length))
					parent = host;
			}
			return parent?.id ?? baseParent;
		};

		let open: { parent: string; parts: NativeTextPart[]; last: ReadonlyArray<number> } | null =
			null;
		const close = () => {
			if (!open) return;
			const index = textRuns.get(open.parent) ?? 0;
			textRuns.set(open.parent, index + 1);
			nodes.push({
				kind: 'text',
				id: `${open.parent}:text${index}`,
				parent: open.parent,
				parts: open.parts,
				...place,
			});
			open = null;
		};
		for (const item of items) {
			const parent = parentOf(item.path);
			if (item.kind === 'host') {
				close();
				const element = tagOf.get(item.id);
				if (!element || element === '*') refuse(`host ${item.id} has no static tag`);
				else if (!PORTABLE_ELEMENTS.has(element)) refuse(`the <${element}> element`);
				const attributes = (chunk.attributes ?? []).filter(
					(attribute) => comparePaths(attribute.coordinate.path, item.path) === 0,
				);
				const bindings = bindingsOf(item.id);
				nodes.push({
					kind: 'element',
					id: item.id,
					element: element ?? '*',
					parent,
					...(attributes.length > 0
						? {
								attributes: Object.fromEntries(
									attributes.map((a) => [a.name, a.value]),
								),
							}
						: {}),
					...(bindings.length > 0 ? { bindings } : {}),
					...place,
				});
				continue;
			}
			if (item.kind === 'branch') {
				close();
				const site = branchSites.get(item.id);
				if (!site || site.kind !== 'if' || site.armIndexSource !== undefined) {
					refuse('@else if chains and @switch');
					continue;
				}
				const test = exprOf(site.testExpression, 'the @if test');
				if (!test) continue;
				nodes.push({
					kind: 'branch',
					id: item.id,
					parent,
					test,
					arms: item.arms.length,
					...place,
				});
				item.arms.forEach((armId, index) => {
					const armChunk = chunks.get(armId);
					if (armChunk) lowerChunk(armChunk, parent, { branch: item.id, index });
					else refuse(`arm ${armId} has no markup`);
				});
				continue;
			}
			if (parent === null) {
				refuse('text outside an element');
				continue;
			}
			const adjacent =
				open !== null &&
				open.parent === parent &&
				open.last.length === item.path.length &&
				item.path[item.path.length - 1] === open.last[open.last.length - 1]! + 1;
			if (!adjacent) close();
			if (open === null) open = { parent, parts: [], last: item.path };
			open.parts.push(item.part);
			open.last = item.path;
		}
		close();
	};
	lowerChunk(rootChunk, null, undefined);
	if (graph.markup.chunks.some((chunk) => !lowered.has(chunk.id)))
		refuse('markup outside the root template and its @if arms');

	const handlerOps = (event: SemanticEvent): NativeOp[] => {
		const what = `the ${event.eventName} handler`;
		if (event.handlerParameters.length > 0) {
			refuse(`${what} reads its event`, event.handlerSpan);
			return [];
		}
		if (!event.handlerStatements) {
			refuse(
				`${what} is defined elsewhere (a named, passed-in or factory function)`,
				event.handlerSpan,
			);
			return [];
		}
		return event.handlerStatements.flatMap((statement): NativeOp[] => {
			if (statement.kind === 'unsupported') {
				refuse(
					`${what} uses ${statement.construct}, which needs a script engine`,
					event.handlerSpan,
				);
				return [];
			}
			const cell = cellOfName.get(statement.target);
			if (!cell) {
				refuse(
					`${what} assigns \`${statement.target}\`, which is not state of this component`,
					event.handlerSpan,
				);
				return [];
			}
			const value = exprOf(statement.value, what);
			return value ? [{ op: 'assign', cell, value }] : [];
		});
	};

	const events: NativeViewPayload['events'][number][] = [];
	const handlers: NativeViewPayload['handlers'][number][] = [];
	for (const event of graph.events) {
		const semantic = SEMANTIC_EVENTS[event.eventName];
		if (!semantic) {
			refuse(`the ${event.eventName} event has no native meaning yet`, event.handlerSpan);
			continue;
		}
		const handler = `handler:${event.id}`;
		events.push({ host: event.hostNodeId, event: semantic, handler });
		handlers.push({ id: handler, ops: handlerOps(event) });
	}

	const styledCells = new Set<string>();
	const collectCells = (expr: NativeExpr): void => {
		if ('cell' in expr) styledCells.add(expr.cell);
		for (const child of Object.values(expr)) {
			if (Array.isArray(child))
				for (const item of child)
					if (item && typeof item === 'object') collectCells(item as NativeExpr);
			if (child && typeof child === 'object' && !Array.isArray(child))
				collectCells(child as NativeExpr);
		}
	};
	for (const node of nodes)
		if (node.kind === 'element')
			for (const binding of node.bindings ?? [])
				if (binding.attribute === 'class') collectCells(binding.value);

	return done({
		version: NATIVE_VIEW_VERSION,
		component: root.componentName,
		cells: cells.map((cell) =>
			styledCells.has(cell.id) ? { ...cell, styled: true as const } : cell,
		),
		nodes,
		events,
		handlers,
	});
}
