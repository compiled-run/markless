// An arm that changes is redrawn from fixed HTML, so children a caller projects into it stop responding; a build joins both sides.
import { PROTOCOL_PROP_GRAPH_NODE_PREFIX, PROTOCOL_PROPS_GRAPH_NODE_ID } from '@markless/serializer';
import { propsDeciding, rowsDecidedBy } from '../artifact-helpers/prop-deciders.ts';
import type {
	ProjectionArmsArtifact,
	ProjectionLiveness,
	RenderDataArtifact,
	SemanticGraphArtifact,
	SemanticKeyedRepeat,
	SemanticMarkupChunk,
	SemanticMarkupResidue,
	SemanticMarkupSlot,
} from '../artifacts.ts';
import type { CompilerDiagnostic, SourceSpan } from '../diagnostics.ts';

export const PROJECTION_ARMS_PASS_ID = 'projection-arms' as const;
export const PROJECTION_LIVE_IN_BRANCH_CODE = 'MARKLESS_PROJECTION_LIVE_IN_BRANCH' as const;
export const PROJECTION_LIVE_IN_TRY_CODE = 'MARKLESS_PROJECTION_LIVE_IN_TRY' as const;

type Input = {
	readonly semanticGraph: SemanticGraphArtifact;
	readonly renderData: RenderDataArtifact;
};

type Site = {
	readonly code: typeof PROJECTION_LIVE_IN_BRANCH_CODE | typeof PROJECTION_LIVE_IN_TRY_CODE;
	readonly construct: string;
	readonly componentName: string;
	readonly props: ReadonlyArray<string> | null;
	readonly span?: SourceSpan;
};

export function planProjectionArms(input: Input): ProjectionArmsArtifact {
	const graph = input.semanticGraph;
	const chunks = new Map(graph.markup.chunks.map((chunk) => [chunk.id, chunk]));
	return {
		passId: PROJECTION_ARMS_PASS_ID,
		liveChildren: graph.markup.chunks.flatMap((chunk) =>
			chunk.slots.flatMap((slot) => {
				if (slot.kind !== 'child-component' || !slot.projectionChunkId) return [];
				const live = liveness([slot.projectionChunkId], chunks, input);
				if (!live) return [];
				// A keyed @for retargeted into the child's hole re-grows its rows when an @if/@switch arm redraws.
				const inBranch = liveness([slot.projectionChunkId], chunks, input, undefined, true) ?? {};
				return [
					{
						componentEdgeId: slot.componentEdgeId,
						...live,
						...(JSON.stringify(inBranch) === JSON.stringify(live) ? {} : { inBranch }),
					},
				];
			}),
		),
		components: (graph.components ?? []).flatMap((component): ProjectionArmsArtifact['components'] => {
			const own = graph.markup.chunks
				.filter((chunk) => chunk.componentName === component.name)
				.map((chunk) => chunk.id);
			const live = liveness(own, chunks, input, component.name);
			// Its props are judged where a caller passes them, so only what it does on its own counts here.
			if (live?.reason) return [{ componentName: component.name, reason: live.reason }];
			return live?.componentEdgeIds
				? [{ componentName: component.name, componentEdgeIds: live.componentEdgeIds }]
				: [];
		}),
		diagnostics: graph.markup.chunks.flatMap((chunk) =>
			chunk.kind === 'template' ? changingSites(chunk, chunks, input).map(siteDiagnostic) : [],
		),
	};
}

// Every @if/@switch/@try a component's `{children}` sits inside, with what can change it.
function changingSites(
	template: SemanticMarkupChunk,
	chunks: ReadonlyMap<string, SemanticMarkupChunk>,
	input: Input,
): Site[] {
	const sites: Site[] = [];
	const seen = new Set<string>();
	const visit = (chunkId: string | undefined, enclosing: ReadonlyArray<Site>): void => {
		const chunk = chunkId ? chunks.get(chunkId) : undefined;
		if (!chunk || seen.has(chunk.id)) return;
		seen.add(chunk.id);
		for (const slot of chunk.slots) {
			if (slot.kind === 'text' && readsChildren(slot.residue)) {
				for (const site of enclosing) if (!sites.includes(site)) sites.push(site);
				continue;
			}
			const site = slotSite(slot, template.componentName, input);
			for (const nested of nestedChunkIds(slot)) visit(nested, site ? [...enclosing, site] : enclosing);
		}
	};
	visit(template.id, []);
	return sites;
}

function slotSite(slot: SemanticMarkupSlot, componentName: string, input: Input): Site | undefined {
	const graph = input.semanticGraph;
	if (slot.kind === 'async') {
		const boundary = graph.asyncBoundaries.find((candidate) => candidate.id === slot.boundaryId);
		return {
			code: PROJECTION_LIVE_IN_TRY_CODE,
			construct: '@try',
			componentName,
			props: null,
			...(boundary?.keywordSpan ? { span: boundary.keywordSpan } : {}),
		};
	}
	if (slot.kind !== 'branch') return undefined;
	const site = graph.branchSites.find((candidate) => candidate.id === slot.branchSiteId);
	const branch = input.renderData.branches.find(
		(candidate) => candidate.branchSiteId === slot.branchSiteId,
	);
	// A test that reads nothing picks its arm once.
	if (branch && branch.testReads.length === 0) return undefined;
	let props: ReadonlyArray<string> | null = branch ? [] : null;
	for (const read of branch?.testReads ?? []) {
		const deciding = propsDeciding(read.graphNodeId, read.path, graph);
		props = deciding && props ? [...new Set([...props, ...deciding])] : null;
	}
	// What a caller projects is fixed for the life of the arm, so `@if (children)` never changes.
	props = props?.filter((prop) => prop !== 'children') ?? null;
	if (props?.length === 0) return undefined;
	const label = site?.kind === 'switch' ? '@switch' : '@if';
	return {
		code: PROJECTION_LIVE_IN_BRANCH_CODE,
		construct: `${label} (${site?.testSource ?? branch?.testSource ?? ''})`,
		componentName,
		props,
		...(site?.keywordSpan ? { span: site.keywordSpan } : {}),
	};
}

function nestedChunkIds(slot: SemanticMarkupSlot): ReadonlyArray<string | undefined> {
	switch (slot.kind) {
		case 'branch':
			return slot.armTemplateIds;
		case 'async':
			return Object.values(slot.armTemplateIds);
		case 'repeat':
			return [slot.rowTemplateId, slot.emptyTemplateId];
		case 'child-component':
			return [slot.projectionChunkId];
		case 'dynamic-host':
			return [slot.childChunkId];
		default:
			return [];
	}
}

function readsChildren(residue: SemanticMarkupResidue): boolean {
	return (
		residue.kind === 'graph-read' &&
		((residue.graphNodeId === PROTOCOL_PROPS_GRAPH_NODE_ID && residue.path[0] === 'children') ||
			residue.graphNodeId === `${PROTOCOL_PROP_GRAPH_NODE_PREFIX}children`)
	);
}

// What in these chunks would stop working after a redraw from fixed HTML; undefined when nothing would.
function liveness(
	chunkIds: ReadonlyArray<string | undefined>,
	chunks: ReadonlyMap<string, SemanticMarkupChunk>,
	input: Input,
	ownerName?: string,
	skipProjectedRepeats = false,
): ProjectionLiveness | undefined {
	const graph = input.semanticGraph;
	const props = new Set<string>();
	const componentEdgeIds: string[] = [];
	let reason: string | undefined;
	let forwardsChildren = false;
	const seen = new Set<string>();
	const read = (residue: SemanticMarkupResidue, what: string) => {
		if (residue.kind !== 'graph-read') return;
		if (readsChildren(residue)) {
			forwardsChildren = true;
			return;
		}
		// A whole-props read is a forward, which the edge it reaches already judges.
		if (residue.graphNodeId === PROTOCOL_PROPS_GRAPH_NODE_ID && residue.path[0] === undefined) return;
		const deciding = propsDeciding(residue.graphNodeId, residue.path, graph);
		if (deciding) for (const prop of deciding) props.add(prop);
		else reason ??= `${what} \`${bindingName(residue.graphNodeId, graph)}\`, which changes`;
	};
	const visit = (chunkId: string | undefined): void => {
		const chunk = chunkId ? chunks.get(chunkId) : undefined;
		if (!chunk || seen.has(chunk.id)) return;
		// A component's own markup stops at the children a caller projects into it.
		if (ownerName && chunk.componentName !== ownerName) return;
		seen.add(chunk.id);
		for (const host of chunk.hosts) {
			const event = graph.events.find(
				(candidate) =>
					candidate.hostNodeId === host.hostNodeId &&
					candidate.handlerSource !== undefined &&
					(!candidate.componentName || candidate.componentName === chunk.componentName),
			);
			if (event) reason ??= `its <${host.tagName}> handles ${event.eventName}`;
		}
		for (const slot of chunk.slots) {
			switch (slot.kind) {
				case 'text':
					read(slot.residue, 'it shows');
					break;
				case 'attribute':
				case 'spread-attributes':
					read(slot.residue, 'an attribute reads');
					break;
				case 'dynamic-host':
					read(slot.tag, 'its tag reads');
					break;
				case 'async':
					reason ??= 'it holds a @try';
					break;
				case 'branch':
					branchReads(slot.branchSiteId, input, props, (name) => {
						reason ??= `it holds an @if that reads \`${name}\`, which changes`;
					});
					break;
				case 'repeat': {
					const repeat = graph.keyedRepeats.find((candidate) => candidate.id === slot.repeatId);
					if (skipProjectedRepeats && repeat && retargetedIntoChild(repeat, chunk, chunks)) continue;
					const deciding = repeat ? rowsDecidedBy(repeat, graph) : [];
					if (deciding) for (const prop of deciding) props.add(prop);
					else reason ??= `it lists \`${repeat?.collectionSource ?? ''}\`, which changes`;
					break;
				}
				case 'child-component':
					componentEdgeIds.push(slot.componentEdgeId);
					edgeProps(slot.componentEdgeId, graph, props, (why) => {
						reason ??= why;
					});
					break;
			}
			for (const nested of nestedChunkIds(slot)) visit(nested);
		}
	};
	for (const chunkId of chunkIds) visit(chunkId);
	const found: ProjectionLiveness = {
		...(reason ? { reason } : {}),
		...(!reason && props.size ? { props: [...props] } : {}),
		...(!reason && forwardsChildren ? { forwardsChildren: true as const } : {}),
		...(!reason && componentEdgeIds.length ? { componentEdgeIds } : {}),
	};
	return Object.keys(found).length ? found : undefined;
}

// The repeat sits straight in a caller's projection and renders into the child's own element.
function retargetedIntoChild(
	repeat: SemanticKeyedRepeat,
	chunk: SemanticMarkupChunk,
	chunks: ReadonlyMap<string, SemanticMarkupChunk>,
): boolean {
	if (chunk.kind !== 'component-projection') return false;
	if (repeat.ownerHostNodeId !== undefined) return true;
	for (const candidate of chunks.values())
		if (
			candidate.componentName === chunk.componentName &&
			candidate.hosts.some((host) => host.hostNodeId === repeat.parentHostNodeId)
		)
			return false;
	return repeat.parentHostNodeId !== '';
}

function branchReads(
	branchSiteId: string,
	input: Input,
	props: Set<string>,
	changes: (name: string) => void,
): void {
	const branch = input.renderData.branches.find((candidate) => candidate.branchSiteId === branchSiteId);
	for (const read of branch?.testReads ?? []) {
		const deciding = propsDeciding(read.graphNodeId, read.path, input.semanticGraph);
		if (deciding) for (const prop of deciding) props.add(prop);
		else changes(bindingName(read.graphNodeId, input.semanticGraph));
	}
}

// What a call site hands a component that keeps it live: a callback, or a value that changes.
function edgeProps(
	componentEdgeId: string,
	graph: SemanticGraphArtifact,
	props: Set<string>,
	live: (why: string) => void,
): void {
	const edge = graph.componentEdges.find((candidate) => candidate.id === componentEdgeId);
	for (const prop of edge?.props ?? []) {
		if (prop.kind === 'callback') live(`it hands <${edge!.childComponentName}> the callback \`${prop.name}\``);
		if (prop.kind !== 'graph-reference' || prop.graphBindingKind === 'element') continue;
		const deciding = propsDeciding(prop.graphNodeId, prop.path, graph);
		if (deciding) for (const name of deciding) props.add(name);
		else live(`it hands <${edge!.childComponentName}> \`${prop.source}\`, which changes`);
	}
	if (edge?.children.text) {
		const deciding = propsDeciding(edge.children.text.graphNodeId, edge.children.text.path, graph);
		if (deciding) for (const name of deciding) props.add(name);
		else live(`it shows \`${edge.children.text.source}\`, which changes`);
	}
}

// The authored name behind a read; a computed the compiler wrote for a text run is named by what it reads.
function bindingName(graphNodeId: string, graph: SemanticGraphArtifact, seen = new Set<string>()): string {
	const binding = graph.graphBindings.find((candidate) => candidate.id === graphNodeId);
	if (binding && /^[A-Za-z_$][\w$]*$/.test(binding.name)) return binding.name;
	seen.add(graphNodeId);
	const next = binding?.dependencies?.find((dependency) => !seen.has(dependency.graphNodeId));
	return next ? bindingName(next.graphNodeId, graph, seen) : 'state';
}

function siteDiagnostic(site: Site): CompilerDiagnostic {
	return {
		code: site.code,
		severity: 'info',
		phase: 'semantic-graph',
		title: `<${site.componentName}> renders its children inside ${site.construct}`,
		message: `<${site.componentName}> renders {children} inside ${site.construct}. When that arm changes, the browser redraws it from fixed HTML, so children that handle events or show changing state stop responding. A build refuses each caller that passes such children.`,
		why: 'The arm is rebuilt from the markup this file compiled, and the children a caller wrote are part of that markup, not something the browser can wire again.',
		...(site.span ? { primarySpan: site.span } : {}),
		passId: PROJECTION_ARMS_PASS_ID,
		artifactKeys: ['semanticGraph', 'renderData', 'projectionArms'],
		suggestions: [
			{
				message: `Render {children} outside ${site.construct} and hide it with an attribute, or move the state into <${site.componentName}>. If the arm never changes after the page loads, write \`// markless-allow ${site.code}: reason\` above it.`,
			},
		],
		docsUrl: `https://markless.dev/errors/${site.code}`,
		projectionArm: { componentName: site.componentName, construct: site.construct, props: site.props },
	};
}
