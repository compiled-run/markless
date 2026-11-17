import type {
	NativePlace,
	NativeBuiltin,
	NativeExpr,
	NativeNode,
	NativeOp,
	NativeMethod,
	NativeScalar,
	NativeValue,
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
	SemanticHandlerStatement,
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
	'input',
]);

const SEMANTIC_EVENTS: Readonly<Record<string, NativeViewPayload['events'][number]['event']>> = {
	click: 'activate',
	input: 'input',
};

type Item =
	| { readonly kind: 'host'; readonly id: string; readonly path: ReadonlyArray<number> }
	| { readonly kind: 'part'; readonly part: NativeTextPart; readonly path: ReadonlyArray<number> }
	| {
			readonly kind: 'branch';
			readonly id: string;
			readonly arms: ReadonlyArray<string>;
			readonly path: ReadonlyArray<number>;
	  }
	| {
			readonly kind: 'repeat';
			readonly id: string;
			readonly row: string;
			readonly path: ReadonlyArray<number>;
	  }
	| { readonly kind: 'child'; readonly edge: string; readonly template: string; readonly projection?: string; readonly path: ReadonlyArray<number> };

const isNativeValue = (value: unknown): value is NativeValue =>
	value === null ||
	typeof value === 'string' ||
	typeof value === 'boolean' ||
	(typeof value === 'number' && Number.isFinite(value)) ||
	(Array.isArray(value) && value.every(isNativeValue)) ||
	(typeof value === 'object' &&
		Object.getPrototypeOf(value) === Object.prototype &&
		Object.values(value as object).every(isNativeValue));

/** What names mean where an expression is: an input handler's event, arrow parameters, and enclosing rows' items. */
/** A prop as an instance sees it: a value lowered where it was passed, or a callback lowered where it is called. */
type Prop =
	| { readonly kind: 'value'; readonly expr: NativeExpr }
	| {
			readonly kind: 'callback';
			readonly statements: ReadonlyArray<SemanticHandlerStatement> | undefined;
			readonly scope: Scope;
	  };

/** What names mean where an expression is: the component whose state it reads, its props, rows' items and parameters. */
type Scope = {
	readonly component: string;
	/** Prefix of every id this component instance emits (`component-edge:0/` inside a child, empty at the root). */
	readonly prefix: string;
	readonly event?: string;
	readonly locals: ReadonlySet<string>;
	readonly items: ReadonlyMap<string, string>;
	readonly props: ReadonlyMap<string, Prop>;
};

/** Methods with JavaScript meaning that return a new value; `reverse` mutates, so only a fresh array may take it. */
const METHODS = new Set<string>([
	'filter', 'map', 'findIndex', 'some', 'every', 'includes', 'indexOf', 'join', 'concat', 'slice',
	'reverse', 'toReversed', 'toUpperCase', 'toLowerCase', 'trim',
]);

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
	if (graph.asyncBoundaries.length > 0) refuse('@try');
	if (graph.behaviors.length > 0) refuse('attach behaviours');
	const chunks = new Map(graph.markup.chunks.map((chunk) => [chunk.id, chunk]));
	const rootChunk = chunks.get(root.templateId);
	if (!rootChunk) return done(refuse('the root template has no markup'));

	const cells = graph.graphBindings.flatMap((binding) => {
		if (binding.kind !== 'state') return [];
		const value = binding.initialValue;
		if (binding.initialValueKnown !== true || !isNativeValue(value)) {
			refuse(`state \`${binding.name}\` needs a JSON initial value known at build time`);
			return [];
		}
		return [
			{
				id: binding.id,
				name: binding.name,
				initial: value,
				...(binding.storage ? { storage: { key: binding.storage.key } } : {}),
			},
		];
	});
	const cellIds = new Set(cells.map((cell) => cell.id));
	const cellsByComponent = new Map<string, Map<string, string>>();
	for (const binding of graph.graphBindings) {
		if (binding.kind !== 'state' || !cellIds.has(binding.id)) continue;
		const owner = binding.componentName ?? root.componentName;
		if (owner !== root.componentName) refuse(`state \`${binding.name}\` declared in the child component ${owner}`);
		const names = cellsByComponent.get(owner) ?? new Map<string, string>();
		names.set(binding.name, binding.id);
		cellsByComponent.set(owner, names);
	}
	const cellOf = (name: string, scope: Scope): string | undefined =>
		(cellsByComponent.get(scope.component) ?? cellsByComponent.get(root.componentName))?.get(name);
	const propNames = new Map<string, Map<string, string>>();
	for (const binding of graph.componentPropBindings) {
		const names = propNames.get(binding.componentName) ?? new Map<string, string>();
		if (binding.propPath?.length === 1) names.set(binding.localName, binding.propPath[0]!);
		propNames.set(binding.componentName, names);
	}
	const TOP: Scope = { component: root.componentName, prefix: '', locals: new Set(), items: new Map(), props: new Map() };

	const exprOf = (
		expression: SemanticExpression | undefined,
		what: string,
		scope: Scope,
	): NativeExpr | null => {
		if (!expression) return refuse(`${what} has no expression the compiler recorded`);
		const all = (list: ReadonlyArray<SemanticExpression>): NativeExpr[] | null => {
			const lowered = list.map((item) => exprOf(item, what, scope));
			return lowered.every((item) => item !== null) ? (lowered as NativeExpr[]) : null;
		};
		switch (expression.kind) {
			case 'read': {
				if (scope.locals.has(expression.name)) return { local: expression.name };
				const repeat = scope.items.get(expression.name);
				if (repeat) return { item: repeat };
				const prop = scope.props.get(propNames.get(scope.component)?.get(expression.name) ?? '');
				if (prop?.kind === 'value') return prop.expr;
				if (prop) return refuse(`${what} reads the callback \`${expression.name}\` as a value`);
				const cell = cellOf(expression.name, scope);
				return cell
					? { cell }
					: refuse(
							`${what} reads \`${expression.name}\`, which is not state of this component`,
						);
			}
			case 'literal':
				return { literal: expression.value };
			case 'unary': {
				const value = exprOf(expression.value, what, scope);
				return value && { unary: expression.operator, value };
			}
			case 'binary':
			case 'logical': {
				const left = exprOf(expression.left, what, scope);
				const right = exprOf(expression.right, what, scope);
				if (!left || !right) return null;
				return expression.kind === 'binary'
					? { binary: expression.operator, left, right }
					: { logical: expression.operator, left, right };
			}
			case 'conditional': {
				const test = exprOf(expression.test, what, scope);
				const whenTrue = exprOf(expression.consequent, what, scope);
				const whenFalse = exprOf(expression.alternate, what, scope);
				return test && whenTrue && whenFalse ? { if: test, whenTrue, whenFalse } : null;
			}
			case 'template': {
				const parts = expression.parts.map((part) =>
					typeof part === 'string' ? part : exprOf(part, what, scope),
				);
				return parts.every((part) => part !== null)
					? { template: parts as (string | NativeExpr)[] }
					: null;
			}
			case 'member': {
				const holder = expression.object;
				if (
					scope.event !== undefined &&
					expression.property === 'value' &&
					holder.kind === 'member' &&
					(holder.property === 'currentTarget' || holder.property === 'target') &&
					holder.object.kind === 'read' &&
					holder.object.name === scope.event
				)
					return { event: 'value' };
				const object = exprOf(expression.object, what, scope);
				return object && { member: object, property: expression.property };
			}
			case 'call': {
				const args = all(expression.arguments);
				return args && { call: expression.callee as NativeBuiltin, arguments: args };
			}
			case 'array': {
				const items = expression.items.map((item) => {
					const value = exprOf(item.value, what, scope);
					return value && { spread: item.spread, value };
				});
				return items.every((item) => item !== null)
					? { array: items as { spread: boolean; value: NativeExpr }[] }
					: null;
			}
			case 'object': {
				const entries = expression.entries.map(([key, value]) => {
					const lowered = exprOf(value, what, scope);
					return lowered && ([key, lowered] as const);
				});
				return entries.every((entry) => entry !== null)
					? { object: entries as (readonly [string, NativeExpr])[] }
					: null;
			}
			case 'method': {
				if (!METHODS.has(expression.method)) return refuse(`${what} calls \`.${expression.method}()\``);
				if (expression.method === 'reverse' && expression.object.kind !== 'array')
					return refuse(`${what} reverses an array in place; reverse a copy (\`[...list].reverse()\`)`);
				const target = exprOf(expression.object, what, scope);
				const args = expression.arguments.map((argument) => {
					if (argument.kind !== 'lambda') return exprOf(argument, what, scope);
					const inner: Scope = { ...scope, locals: new Set([...scope.locals, ...argument.parameters]) };
					const lambdaBody = exprOf(argument.body, what, inner);
					return lambdaBody && { lambda: argument.parameters, body: lambdaBody };
				});
				return target && args.every((argument) => argument !== null)
					? { method: expression.method as NativeMethod, target, arguments: args as NativeExpr[] }
					: null;
			}
			case 'lambda':
				return refuse(`${what} uses a function value outside a method call`);
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
	const bindingsOf = (host: string, scope: Scope): ElementBindings =>
		(readsByHost.get(host) ?? []).flatMap((read): ElementBindings => {
			const target = read.target;
			if (target.kind === 'text') return [];
			if (target.kind === 'property' && target.name === 'value') {
				const value = exprOf(read.expression, 'the `value` property', scope);
				return value ? [{ property: 'value' as const, value }] : [];
			}
			if (target.kind === 'attribute') {
				const value = exprOf(read.expression, `the \`${target.name}\` attribute`, scope);
				return value ? [{ attribute: target.name, value }] : [];
			}
			if (
				target.kind === 'class' &&
				target.trueValue !== undefined &&
				target.falseValue !== undefined &&
				target.constantClass === undefined &&
				target.leadingClass === undefined
			) {
				const test = exprOf(read.expression, 'the class test', scope);
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
	const textPartOf = (graphNodeId: string, scope: Scope): NativeTextPart | null => {
		if (cellIds.has(graphNodeId)) return { cell: graphNodeId };
		const read = computedReads.get(graphNodeId);
		const expr = read
			? exprOf(read.expression, 'a text expression', scope)
			: refuse('a text binding that is not state');
		return expr && { expr };
	};

	const tagOf = new Map(graph.hostNodes.map((host) => [host.id, host.tagName]));
	const branchSites = new Map(graph.branchSites.map((site) => [site.id, site]));
	const nodes: NativeNode[] = [];
	const textRuns = new Map<string, number>();
	const lowered = new Set<string>();

	const propBindingIds = new Set(
		graph.graphBindings.flatMap((binding) => (binding.kind === 'prop' ? [binding.id] : [])),
	);
	const edgesById = new Map(graph.componentEdges.map((edge) => [edge.id, edge]));
	const eventsByHost = new Map<string, SemanticEvent[]>();
	for (const event of graph.events) {
		const list = eventsByHost.get(event.hostNodeId) ?? [];
		list.push(event);
		eventsByHost.set(event.hostNodeId, list);
	}
	const events: NativeViewPayload['events'][number][] = [];
	const handlers: NativeViewPayload['handlers'][number][] = [];
	const loweredEvents = new Set<string>();
	const repeatsById = new Map(graph.keyedRepeats.map((repeat) => [repeat.id, repeat]));
	const lowerChunk = (
		chunk: SemanticMarkupChunk,
		baseParent: string | null,
		place: NativePlace,
		scope: Scope,
	) => {
		lowered.add(chunk.id);
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
			if (slot.kind === 'child-component') {
				items.push({
					kind: 'child',
					edge: slot.componentEdgeId,
					template: slot.childTemplateId,
					...(slot.projectionChunkId ? { projection: slot.projectionChunkId } : {}),
					path: slot.coordinate.path,
				});
				continue;
			}
			if (slot.kind === 'repeat') {
				items.push({ kind: 'repeat', id: slot.repeatId, row: slot.rowTemplateId, path: slot.coordinate.path });
				if (slot.emptyTemplateId) refuse('@empty');
				continue;
			}
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
			if (slot.residue.kind === 'repeat-item') {
				const repeatId = slot.residue.repeatId;
				const expr = slot.residue.path.reduce<NativeExpr>(
					(object, property) => ({ member: object, property }),
					{ item: repeatId },
				);
				items.push({ kind: 'part', part: { expr }, path: slot.coordinate.path });
				continue;
			}
			if (slot.residue.kind !== 'graph-read') {
				refuse(`a text binding the compiler renders once (${slot.residue.kind})`);
				continue;
			}
			const path = slot.residue.path;
			if (propBindingIds.has(slot.residue.graphNodeId)) {
				const [name, ...rest] = path;
				const prop = name === undefined ? undefined : scope.props.get(name);
				if (prop?.kind !== 'value') {
					refuse(`a text binding that reads the prop \`${name ?? ''}\` this instance was not given as a value`);
					continue;
				}
				const expr = rest.reduce<NativeExpr>((object, property) => ({ member: object, property }), prop.expr);
				items.push({ kind: 'part', part: 'cell' in expr ? { cell: expr.cell } : { expr }, path: slot.coordinate.path });
				continue;
			}
			if (path.length > 1 || (path.length === 1 && path[0] !== 'length')) {
				refuse(`a text binding that reads \`.${path.join('.')}\` of state`);
				continue;
			}
			const read = textPartOf(slot.residue.graphNodeId, scope);
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
			return parent ? scope.prefix + parent.id : baseParent;
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
				const bindings = bindingsOf(item.id, scope);
				const id = scope.prefix + item.id;
				nodes.push({
					kind: 'element',
					id,
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
				for (const event of eventsByHost.get(item.id) ?? []) {
					loweredEvents.add(event.id);
					const semantic = SEMANTIC_EVENTS[event.eventName];
					if (!semantic) {
						refuse(`the ${event.eventName} event has no native meaning yet`, event.handlerSpan);
						continue;
					}
					if (place.row) {
						refuse(`the ${event.eventName} handler inside a @for row`, event.handlerSpan);
						continue;
					}
					const handler = `handler:${scope.prefix}${event.id}`;
					events.push({ host: id, event: semantic, handler });
					handlers.push({ id: handler, ops: handlerOps(event, scope) });
				}
				continue;
			}
			if (item.kind === 'child') {
				close();
				const edge = edgesById.get(item.edge);
				const template = chunks.get(item.template);
				if (!edge || !template) {
					refuse(`<${edge?.childComponentName ?? item.edge}>, a component from another module`);
					continue;
				}
				if (item.projection) {
					refuse(`children passed to <${edge.childComponentName}>`);
					continue;
				}
				const props = new Map<string, Prop>();
				for (const prop of edge.props) {
					if (prop.kind === 'callback') {
						props.set(prop.name, { kind: 'callback', statements: prop.nativeStatements, scope });
					} else if (prop.kind === 'serializable' && isNativeValue(prop.value)) {
						props.set(prop.name, { kind: 'value', expr: { literal: prop.value as NativeScalar } });
					} else if (prop.kind === 'graph-reference' && cellIds.has(prop.graphNodeId) && prop.path.length === 0) {
						props.set(prop.name, { kind: 'value', expr: { cell: prop.graphNodeId } });
					} else {
						refuse(`the \`${prop.name}\` prop of <${edge.childComponentName}>`);
					}
				}
				lowerChunk(template, parent, place, {
					component: edge.childComponentName,
					prefix: `${scope.prefix}${edge.id}/`,
					locals: new Set(),
					items: new Map(),
					props,
				});
				continue;
			}
			if (item.kind === 'repeat') {
				close();
				const repeat = repeatsById.get(item.id);
				const rowChunk = chunks.get(item.row);
				if (place.arm || place.row) {
					refuse('@for inside an @if arm or another @for');
					continue;
				}
				if (!repeat || !rowChunk || repeat.collectionGraphNodeId === undefined || !cellIds.has(repeat.collectionGraphNodeId) || (repeat.collectionPath?.length ?? 0) > 0 || !repeat.keyPath) {
					refuse('a @for over something other than a state list keyed by a path of its item');
					continue;
				}
				const repeatId = scope.prefix + item.id;
				nodes.push({ kind: 'repeat', id: repeatId, parent, list: { cell: repeat.collectionGraphNodeId }, key: repeat.keyPath });
				lowerChunk(rowChunk, parent, { row: repeatId }, { ...scope, items: new Map([...scope.items, [repeat.itemName, repeatId]]) });
				continue;
			}
			if (item.kind === 'branch') {
				close();
				if (place.row) {
					refuse('@if inside a @for row');
					continue;
				}
				const site = branchSites.get(item.id);
				if (!site || site.kind !== 'if' || site.armIndexSource !== undefined) {
					refuse('@else if chains and @switch');
					continue;
				}
				const test = exprOf(site.testExpression, 'the @if test', scope);
				if (!test) continue;
				const branchId = scope.prefix + item.id;
				nodes.push({
					kind: 'branch',
					id: branchId,
					parent,
					test,
					arms: item.arms.length,
					...place,
				});
				item.arms.forEach((armId, index) => {
					const armChunk = chunks.get(armId);
					if (armChunk) lowerChunk(armChunk, parent, { arm: { branch: branchId, index } }, scope);
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
	function handlerOps(event: SemanticEvent, scope: Scope): NativeOp[] {
		const what = `the ${event.eventName} handler`;
		const eventParameter = event.eventName === 'input' ? event.handlerParameters[0] : undefined;
		if (event.handlerParameters.length > (eventParameter === undefined ? 0 : 1)) {
			refuse(`${what} reads its event`, event.handlerSpan);
			return [];
		}
		if (!event.handlerStatements) {
			refuse(`${what} is defined elsewhere (a named or factory function)`, event.handlerSpan);
			return [];
		}
		return statementOps(
			event.handlerStatements,
			eventParameter === undefined ? scope : { ...scope, event: eventParameter },
			what,
			event.handlerSpan,
			0,
		);
	}

	function statementOps(
		statements: ReadonlyArray<SemanticHandlerStatement>,
		scope: Scope,
		what: string,
		span: SourceSpan | undefined,
		depth: number,
	): NativeOp[] {
		return statements.flatMap((statement): NativeOp[] => {
			if (statement.kind === 'unsupported') {
				refuse(`${what} uses ${statement.construct}, which needs a script engine`, span);
				return [];
			}
			if (statement.kind === 'invoke') {
				const prop = scope.props.get(propNames.get(scope.component)?.get(statement.name) ?? '');
				if (prop?.kind !== 'callback' || !prop.statements || depth > 8) {
					refuse(`${what} uses a call to \`${statement.name}\`, which needs a script engine`, span);
					return [];
				}
				return statementOps(prop.statements, prop.scope, what, span, depth + 1);
			}
			const cell = cellOf(statement.target, scope);
			if (!cell) {
				refuse(`${what} assigns \`${statement.target}\`, which is not state of this component`, span);
				return [];
			}
			const value = exprOf(statement.value, what, scope);
			return value ? [{ op: 'assign', cell, value }] : [];
		});
	}

	lowerChunk(rootChunk, null, {}, TOP);
	if (graph.markup.chunks.some((chunk) => chunk.kind !== 'template' && !lowered.has(chunk.id)))
		refuse('markup outside the root template, its @if arms and its @for rows');
	for (const event of graph.events)
		if (!loweredEvents.has(event.id)) refuse(`the ${event.eventName} handler on an element this build does not show`);

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
				if ('attribute' in binding && binding.attribute === 'class')
					collectCells(binding.value);

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
