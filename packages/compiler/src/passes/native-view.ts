import type {
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
	SourceSpan,
} from '../artifacts.ts';

export const NATIVE_UNSUPPORTED_CODE = 'MARKLESS_NATIVE_UNSUPPORTED';

export type NativeViewArtifact = {
	readonly passId: 'native-view';
	readonly payload: NativeViewPayload | null;
	readonly diagnostics: ReadonlyArray<CompilerDiagnostic>;
};

const SEMANTIC_EVENTS: Readonly<Record<string, NativeViewPayload['events'][number]['event']>> = {
	click: 'activate',
};

type Item =
	| { readonly kind: 'host'; readonly id: string; readonly path: ReadonlyArray<number> }
	| { readonly kind: 'part'; readonly part: NativeTextPart; readonly path: ReadonlyArray<number> };

const comparePaths = (a: ReadonlyArray<number>, b: ReadonlyArray<number>): number => {
	for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i]! - b[i]!;
	return a.length - b.length;
};

const isPrefix = (prefix: ReadonlyArray<number>, path: ReadonlyArray<number>): boolean =>
	prefix.length < path.length && prefix.every((step, i) => path[i] === step);

const within = (inner: SourceSpan | undefined, outer: SourceSpan | undefined): boolean =>
	inner !== undefined &&
	outer !== undefined &&
	inner.filename === outer.filename &&
	inner.start >= outer.start &&
	inner.end <= outer.end;

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
	if (graph.branchSites.length > 0) refuse('@if and @switch');
	if (graph.keyedRepeats.length > 0) refuse('@for');
	if (graph.asyncBoundaries.length > 0) refuse('@try');
	if (graph.behaviors.length > 0) refuse('attach behaviours');
	const chunk: SemanticMarkupChunk | undefined = graph.markup.chunks.find(
		(candidate) => candidate.id === root.templateId,
	);
	if (!chunk || graph.markup.chunks.length !== 1) return done(refuse('markup outside the root template'));

	const cells = graph.graphBindings.flatMap((binding) => {
		if (binding.kind !== 'state') return [];
		const value = binding.initialValue;
		if (
			binding.initialValueKnown !== true ||
			!(
				typeof value === 'string' ||
				typeof value === 'boolean' ||
				(typeof value === 'number' && Number.isInteger(value))
			)
		) {
			refuse(`state \`${binding.name}\` needs an integer, string or boolean initial value known at build time`);
			return [];
		}
		return [{ id: binding.id, name: binding.name, initial: value as NativeScalar }];
	});
	const cellIds = new Set(cells.map((cell) => cell.id));
	const cellOfName = new Map(cells.map((cell) => [cell.name, cell.id]));

	const items: Item[] = [
		...chunk.hosts.map((host): Item => ({ kind: 'host', id: host.hostNodeId, path: host.coordinate.path })),
		...(chunk.texts ?? []).map(
			(text): Item => ({ kind: 'part', part: { text: text.text }, path: text.coordinate.path }),
		),
	];
	for (const slot of chunk.slots) {
		if (slot.kind !== 'text') {
			refuse(`a ${slot.kind} binding`);
			continue;
		}
		if (slot.residue.kind !== 'graph-read' || slot.residue.path.length > 0 || !cellIds.has(slot.residue.graphNodeId)) {
			refuse('a text binding that is not a plain state read');
			continue;
		}
		items.push({ kind: 'part', part: { cell: slot.residue.graphNodeId }, path: slot.coordinate.path });
	}
	items.sort((a, b) => comparePaths(a.path, b.path));

	const hostPaths = items.filter((item) => item.kind === 'host');
	const parentOf = (path: ReadonlyArray<number>): string | null => {
		let parent: (typeof hostPaths)[number] | null = null;
		for (const host of hostPaths) {
			if (isPrefix(host.path, path) && (!parent || host.path.length > parent.path.length)) parent = host;
		}
		return parent?.id ?? null;
	};
	const tagOf = new Map(graph.hostNodes.map((host) => [host.id, host.tagName]));

	const nodes: NativeNode[] = [];
	const textRuns = new Map<string, number>();
	let open: { parent: string; parts: NativeTextPart[]; last: ReadonlyArray<number> } | null = null;
	const close = () => {
		if (!open) return;
		const index = textRuns.get(open.parent) ?? 0;
		textRuns.set(open.parent, index + 1);
		nodes.push({ kind: 'text', id: `${open.parent}:text${index}`, parent: open.parent, parts: open.parts });
		open = null;
	};
	for (const item of items) {
		const parent = parentOf(item.path);
		if (item.kind === 'host') {
			close();
			const element = tagOf.get(item.id);
			if (!element || element === '*') refuse(`host ${item.id} has no static tag`);
			const attributes = (chunk.attributes ?? []).filter(
				(attribute) => comparePaths(attribute.coordinate.path, item.path) === 0,
			);
			nodes.push({
				kind: 'element',
				id: item.id,
				element: element ?? '*',
				parent,
				...(attributes.length > 0
					? { attributes: Object.fromEntries(attributes.map((a) => [a.name, a.value])) }
					: {}),
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

	const handlerOps = (event: SemanticEvent): NativeOp[] => {
		if (event.handlerParameters.length > 0 || event.handlerReturnsPromise || event.handlerMayReject) {
			refuse(`the ${event.eventName} handler reads its event or may be async`, event.handlerSpan);
			return [];
		}
		const writes = graph.stateWrites.filter((write) => within(write.targetSpan, event.handlerSpan));
		if (event.handlerWriteStatements === undefined || event.handlerWriteStatements !== writes.length) {
			refuse(`the ${event.eventName} handler does more than write state`, event.handlerSpan);
			return [];
		}
		return writes.flatMap((write): NativeOp[] => {
			const cell = cellOfName.get(write.target);
			if (cell !== undefined && write.through === undefined && write.passedTo === undefined) {
				if (write.operation === 'update') {
					return [{ op: 'add', cell, value: write.updateOperator === '--' ? -1 : 1 }];
				}
				if (write.operation === 'assign' && write.valueShape?.kind === 'literal') {
					return [{ op: 'set', cell, value: write.valueShape.value }];
				}
				if (write.operation === 'assign' && write.valueShape?.kind === 'not-target') {
					return [{ op: 'toggle', cell }];
				}
			}
			refuse(`a ${write.operation} write to \`${write.target}\` needs a script engine`, write.targetSpan);
			return [];
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

	return done({
		version: NATIVE_VIEW_VERSION,
		component: root.componentName,
		cells,
		nodes,
		events,
		handlers,
	});
}
