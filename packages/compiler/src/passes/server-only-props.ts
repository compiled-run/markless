import {
	PROTOCOL_PROP_GRAPH_NODE_PREFIX,
	PROTOCOL_PROPS_GRAPH_NODE_ID,
} from '@markless/serializer';
import type {
	CaptureSlot,
	CaptureSlotRoute,
	ExtractedCaptureSymbol,
	PlannedSymbol,
	PublicRenderModuleInput,
	SemanticComponentPropDeclaration,
	ServerOnlyProp,
	ServerOnlyPropsArtifact,
	ServerOnlyPropsDiagnostic,
} from '../artifacts.ts';
import type { SourceSpan } from '../diagnostics.ts';
import { createSymbolSourceSemanticsReader } from './capture-semantics.ts';
import { ssrPropCellSeedsForCell } from './public-render/prop-cell-seed.ts';

export const SERVER_ONLY_PROPS_PASS_ID = 'server-only-props' as const;
export const SERVER_ONLY_PROP_BROWSER_READ_CODE = 'MARKLESS_SERVER_ONLY_PROP_BROWSER_READ' as const;

type ServerOnlyComponent = {
	readonly declared: ServerOnlyProp;
	readonly componentId: string;
	readonly componentName: string;
	readonly range: { readonly start: number; readonly end: number } | undefined;
	readonly declarations: ReadonlyArray<SemanticComponentPropDeclaration>;
	readonly hostNodeIds: ReadonlySet<string>;
	// Component-local names whose value is the server-only prop or a path into it.
	readonly taintedNames: ReadonlySet<string>;
};

type BrowserRead = {
	readonly role: string;
	readonly source: string;
	readonly span?: SourceSpan;
	readonly symbolId?: string;
};

export function checkServerOnlyProps(input: PublicRenderModuleInput): ServerOnlyPropsArtifact {
	const declared = input.source.serverOnlyProps ?? [];
	const diagnostics = declared.flatMap((prop) => {
		const component = serverOnlyComponent(input, prop);
		if (!component) return [];
		const reads = [...symbolReads(input, component), ...payloadSeedReads(input, component)];
		const seen = new Set<string>();
		return reads.flatMap((read) => {
			const key = read.symbolId ?? `${read.role}:${read.source}`;
			if (seen.has(key)) return [];
			seen.add(key);
			return [browserReadDiagnostic(component, read)];
		});
	});
	return { passId: SERVER_ONLY_PROPS_PASS_ID, diagnostics };
}

function serverOnlyComponent(
	input: PublicRenderModuleInput,
	declared: ServerOnlyProp,
): ServerOnlyComponent | undefined {
	const semantic = input.semanticGraph.components.find(
		(component) => component.exportName === declared.exportName,
	);
	if (!semantic) return undefined;
	const declarations = input.semanticGraph.componentPropBindings.filter(
		(declaration) => declaration.componentName === semantic.name,
	);
	const componentId = declarations[0]?.componentId ?? '';
	const range = componentSourceRange(componentId);
	const wholeProps = new Set(
		declarations.flatMap((declaration) =>
			declaration.propPath.length === 0 ? [declaration.localName] : [],
		),
	);
	const tainted = new Set(
		declarations.flatMap((declaration) =>
			declaration.propPath[0] === declared.propName ? [declaration.localName] : [],
		),
	);
	const aliases = input.semanticGraph.aliases.filter((alias) =>
		alias.componentName !== undefined
			? alias.componentName === semantic.name
			: Boolean(alias.sourceSpan && range && spanWithin(alias.sourceSpan, range)),
	);
	for (let grew = true; grew;) {
		grew = false;
		for (const alias of aliases) {
			if (tainted.has(alias.name)) continue;
			const [root, member] = alias.target.split(/[.[]/);
			if (
				(root !== undefined && tainted.has(root)) ||
				(root !== undefined && wholeProps.has(root) && member === declared.propName)
			) {
				tainted.add(alias.name);
				grew = true;
			}
		}
	}
	return {
		declared,
		componentId,
		componentName: semantic.name,
		range,
		declarations,
		hostNodeIds: new Set(
			input.renderData.chunks.flatMap((chunk) =>
				chunk.componentName === semantic.name
					? chunk.hosts.map((host) => host.hostNodeId)
					: [],
			),
		),
		taintedNames: tainted,
	};
}

function symbolReads(
	input: PublicRenderModuleInput,
	component: ServerOnlyComponent,
): BrowserRead[] {
	const plans = new Map(input.symbolResolver.symbols.map((symbol) => [symbol.id, symbol]));
	const semantics = createSymbolSourceSemanticsReader();
	return input.captureAnalysis.extractedSymbols.flatMap((symbol) => {
		const plan = plans.get(symbol.symbolId);
		const read = (span?: SourceSpan): BrowserRead[] => [
			{
				role: symbolRole(symbol.kind),
				source: symbol.source,
				span: span ?? planSpan(plan),
				symbolId: symbol.symbolId,
			},
		];
		const slot = symbol.captureSlots.find((candidate) => slotReadsProp(candidate, component));
		if (slot) return read(slot.sourceSpan);
		if (!ownedBy(symbol, plan, component) || !symbol.source) return [];
		const { freeNames, staticMemberKeys } = semantics.read(symbol.source);
		const readsDirectly = [...freeNames].some((name) => component.taintedNames.has(name));
		const readsThroughProps = component.declarations.some(
			(declaration) =>
				declaration.propPath.length === 0 &&
				freeNames.has(declaration.localName) &&
				staticMemberKeys(declaration.localName)?.has(component.declared.propName),
		);
		return readsDirectly || readsThroughProps ? read() : [];
	});
}

function slotReadsProp(slot: CaptureSlot, component: ServerOnlyComponent): boolean {
	const { propName } = component.declared;
	if (slot.owner.componentName === component.componentName && slot.propName === propName)
		return true;
	return slot.routes.some((route) => routeReadsProp(route, component));
}

function routeReadsProp(route: CaptureSlotRoute, component: ServerOnlyComponent): boolean {
	const { propName } = component.declared;
	if (route.kind === 'graph-reference')
		return (
			(route.graphNodeId === PROTOCOL_PROPS_GRAPH_NODE_ID && route.path[0] === propName) ||
			route.graphNodeId === `${PROTOCOL_PROP_GRAPH_NODE_PREFIX}${propName}`
		);
	if (route.kind === 'passthrough-route')
		return (
			route.propName === propName &&
			component.declarations.some((declaration) => declaration.bindingId === route.bindingId)
		);
	return false;
}

function payloadSeedReads(
	input: PublicRenderModuleInput,
	component: ServerOnlyComponent,
): BrowserRead[] {
	const { propName } = component.declared;
	const seeds = ssrPropCellSeedsForCell(
		input,
		PROTOCOL_PROPS_GRAPH_NODE_ID,
		component.componentName,
	);
	const carried = seeds.some((seed) =>
		seed.graphNodeId === PROTOCOL_PROPS_GRAPH_NODE_ID
			? [...(seed.keys ?? []), ...(seed.scalarKeys ?? []), ...(seed.rowKeys ?? [])].includes(
					propName,
				)
			: seed.graphNodeId === `${PROTOCOL_PROP_GRAPH_NODE_PREFIX}${propName}`,
	);
	if (!carried) return [];
	const declaration = component.declarations.find(
		(candidate) => candidate.propPath[0] === propName || candidate.propPath.length === 0,
	);
	return [
		{
			role: 'markup the browser re-renders (an @if, @for or @try arm)',
			source: propName,
			span: declaration?.sourceSpan,
		},
	];
}

function ownedBy(
	symbol: ExtractedCaptureSymbol,
	plan: PlannedSymbol | undefined,
	component: ServerOnlyComponent,
): boolean {
	if (symbol.owner?.componentName !== undefined)
		return symbol.owner.componentName === component.componentName;
	if (plan && 'hostNodeId' in plan) return component.hostNodeIds.has(plan.hostNodeId);
	const span = planSpan(plan);
	return Boolean(span && component.range && spanWithin(span, component.range));
}

function planSpan(plan: PlannedSymbol | undefined): SourceSpan | undefined {
	return plan && 'sourceSpan' in plan ? (plan.sourceSpan as SourceSpan | undefined) : undefined;
}

function symbolRole(kind: string | undefined): string {
	if (kind === 'event-handler') return 'an event handler';
	if (kind === 'behavior') return 'an attach behavior';
	if (kind === 'sync-computed-derive') return 'a computed that re-runs in the browser';
	if (kind === 'async-computed-runner') return 'an async computed that re-runs in the browser';
	if (kind === 'dom-update') return 'a DOM update';
	return 'code that runs in the browser';
}

function browserReadDiagnostic(
	component: ServerOnlyComponent,
	read: BrowserRead,
): ServerOnlyPropsDiagnostic {
	const { propName, description } = component.declared;
	return {
		code: SERVER_ONLY_PROP_BROWSER_READ_CODE,
		severity: 'error',
		phase: 'serialization',
		passId: SERVER_ONLY_PROPS_PASS_ID,
		artifactKeys: ['source', 'semanticGraph', 'captureAnalysis'],
		title: 'A server-only prop is read by browser code',
		message: `"${component.componentName}" reads its server-only prop "${propName}" (${description}) in ${read.role}: \`${read.source}\`. That code runs in the browser after resume.`,
		why: `"${propName}" exists only while "${component.componentName}" renders on the server. Everything browser code reads is serialized into the page's HTML, so this read would send ${description} to the browser, where anyone viewing the page can read it.`,
		...(read.span ? { primarySpan: read.span } : {}),
		...(read.symbolId ? { symbolId: read.symbolId } : {}),
		componentName: component.componentName,
		propName,
		source: read.source,
		suggestions: [
			{
				message: `Read "${propName}" in the component body, which runs only on the server, and hand the browser just the plain value it needs, for example \`let value = state(${propName}.someField)\`. The state() copy is serialized, and nothing else of "${propName}" is.`,
			},
		],
		docsUrl: `https://markless.dev/errors/${SERVER_ONLY_PROP_BROWSER_READ_CODE}`,
	};
}

function componentSourceRange(componentId: string) {
	const match = /^component:(\d+):(\d+)$/.exec(componentId);
	return match ? { start: Number(match[1]), end: Number(match[2]) } : undefined;
}

function spanWithin(span: SourceSpan, range: { readonly start: number; readonly end: number }) {
	return range.start <= span.start && range.end >= span.end;
}
