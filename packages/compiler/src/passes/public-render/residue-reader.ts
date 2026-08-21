import { parseModule } from '../../yuku-tsrx-adapter.ts';
import type { PublicRenderModuleInput } from '../../artifacts.ts';
import type { AnyNode } from '../../ast/nodes.ts';
import {
	componentEdgesFor,
	componentPropNames,
	emitValueImport,
	moduleScopeDeclarations,
	publicRenderValueImports,
	sameModuleComponentMap,
} from './shared.ts';

type RenderChunks = PublicRenderModuleInput['renderData']['chunks'];

// The single description of which authored expressions a chunk set still owes
// the renderer. Both the server render module and the client render-data
// surface compile their reader from this one collection.
export function authoredResidueSources(chunks: RenderChunks): ReadonlyArray<string> {
	const sources = new Set<string>();
	for (const chunk of chunks) {
		for (const slot of chunk.slots) {
			if ('residue' in slot && slot.residue.kind === 'authored-expression')
				sources.add(slot.residue.source);
			if (slot.kind !== 'dynamic-host') continue;
			if (slot.tag.kind === 'authored-expression') sources.add(slot.tag.source);
			for (const attribute of slot.attributeSlots)
				if (attribute.residue.kind === 'authored-expression')
					sources.add(attribute.residue.source);
		}
	}
	return [...sources];
}

// One case per authored expression, keyed by the authored source text that the
// render data carries as the residue's identity.
export function authoredResidueReadCases(sources: ReadonlyArray<string>): string[] {
	return sources.map((source) => `case ${JSON.stringify(source)}:return (${source});`);
}

/**
 * The authored expressions a component still owes the RENDERER's decisions,
 * rather than its markup: an arm test the compiler could not reduce to a single
 * graph read, and a child prop whose value is an expression. The server render
 * body evaluates both from component scope; the browser has no body, so its
 * reader answers them through the same compiled switch as markup residue.
 */
export function renderDecisionSources(
	input: PublicRenderModuleInput,
	componentName: string,
): ReadonlyArray<string> {
	const chunks = input.renderData.chunks.filter((chunk) => chunk.componentName === componentName);
	const branchIds = new Set(
		chunks.flatMap((chunk) =>
			chunk.slots.flatMap((slot) => (slot.kind === 'branch' ? [slot.branchSiteId] : [])),
		),
	);
	const sources = new Set<string>();
	for (const branch of input.renderData.branches)
		if (branchIds.has(branch.branchSiteId) && branch.testReads.length !== 1 && branch.testSource)
			sources.add(branch.testSource);
	for (const edge of componentEdgesFor(input, componentName))
		for (const prop of edge.props)
			if (prop.kind === 'opaque' && prop.source) sources.add(prop.source);
	return [...sources];
}

/**
 * The seed-map key a widget root's instance token travels under. It is not a
 * graph node id: it names WHICH rendered widget the parts seeded from this map
 * belong to, which is what a shared() handle's minted id has to carry.
 */
export const MARKLESS_WIDGET_INSTANCE_KEY = 'markless:widget-instance';

/** Every element() handle whose minted id one chunk set has to spell. */
export function elementHandleIdSources(chunks: RenderChunks): ReadonlyArray<string> {
	const handles = new Set<string>();
	for (const chunk of chunks) {
		for (const slot of chunk.slots) {
			if ('residue' in slot && slot.residue.kind === 'element-handle-id')
				handles.add(slot.residue.handleGraphNodeId);
			if (slot.kind !== 'dynamic-host') continue;
			for (const attribute of slot.attributeSlots)
				if (attribute.residue.kind === 'element-handle-id')
					handles.add(attribute.residue.handleGraphNodeId);
		}
	}
	return [...handles];
}

/**
 * The one spelling of a minted element() id, compiled into the server module's
 * reader and the client one from this single description: the element that
 * carries the id and every IDREF that names it read the same residue, so the
 * two sides of the relationship cannot be spelled differently.
 *
 * A component-local handle is one element per rendered component, so the
 * render's own id prefix names it. A shared() factory handle is one element per
 * rendered WIDGET, so it takes the token the widget root registered before the
 * parts placed inside it rendered. A missing token means the part rendered
 * outside any widget root: it throws instead of minting an id that a second
 * widget on the page would also mint.
 */
export function elementHandleIdReadCase(input: {
	readonly idPrefixSource: string;
	readonly widgetInstanceSource: string | null;
}): string {
	const prefix = input.widgetInstanceSource
		? `(residue.handleGraphNodeId.startsWith('shared:')?(${input.widgetInstanceSource}??${MISSING_WIDGET_INSTANCE}):${input.idPrefixSource})`
		: input.idPrefixSource;
	return `if(residue.kind==='element-handle-id')return 'mx-'+(${prefix}+residue.handleGraphNodeId).replace(/\\W+/g,'-');`;
}

// A part rendered outside every widget root has no token; refusing loudly is
// the only alternative to minting an id a second widget would mint too.
const MISSING_WIDGET_INSTANCE =
	"(()=>{throw new Error('MARKLESS_ELEMENT_HANDLE_WIDGET_INSTANCE_MISSING: '+residue.handleGraphNodeId)})()";

/** Whether any of these handles is declared by a shared() factory. */
export function hasSharedElementHandle(handles: ReadonlyArray<string>): boolean {
	return handles.some((handle) => handle.startsWith('shared:'));
}

// A component's shared-instance local (`const checkbox = checkboxState()`) is
// not a graph binding: it names a factory whose returned properties each stand
// for one graph node. A composite residue over that local (`checkbox.checked
// === true`) can only run once the local is rebuilt from those nodes, so both
// readers declare it from the same description.
export function sharedInstancePreludeLines(
	semanticGraph: PublicRenderModuleInput['semanticGraph'],
	text: string,
	bound: ReadonlySet<string>,
	readSource: (graphNodeId: string, path: ReadonlyArray<string>) => string,
): string[] {
	const lines: string[] = [];
	const declared = new Set<string>();
	for (const instance of semanticGraph.sharedInstances ?? []) {
		if (declared.has(instance.localName) || bound.has(instance.localName)) continue;
		if (!references(text, instance.localName)) continue;

		const definition = semanticGraph.sharedDefinitions.find(
			(candidate) => candidate.id === instance.definitionId,
		);
		const members = (definition?.returnProperties ?? []).flatMap((property) =>
			property.kind === 'graph'
				? [
						`${JSON.stringify(property.name)}: ${readSource(
							property.graphNodeId,
							property.path,
						)}`,
					]
				: [],
		);
		if (members.length === 0) continue;

		declared.add(instance.localName);
		lines.push(`const ${instance.localName} = {${members.join(', ')}};`);
	}
	return lines;
}

const CONTEXT = 'marklessResidueContext';

// The client reader is the same compiled switch the server module emits; only
// its prelude differs, because the browser has no render body to stand in for
// component scope and must bind each referenced name from the evaluated graph.
export function emitClientResidueReader(
	input: PublicRenderModuleInput,
	componentName: string,
	rootComponentName: string | undefined,
	componentAst: AnyNode | undefined,
): string | null {
	const componentChunks = input.renderData.chunks.filter(
		(chunk) => chunk.componentName === componentName,
	);
	const sources = [
		...new Set([
			...authoredResidueSources(componentChunks),
			...renderDecisionSources(input, componentName),
		]),
	];
	const handles = elementHandleIdSources(componentChunks);
	if (sources.length === 0 && handles.length === 0) return null;
	const text = sources.join('\n');
	const bound = new Set<string>();
	const lines: string[] = [];
	for (const repeat of input.semanticGraph.keyedRepeats) {
		if (references(text, repeat.itemName) && !bound.has(repeat.itemName)) {
			bound.add(repeat.itemName);
			lines.push(`const ${repeat.itemName}=${CONTEXT}.repeatItem;`);
		}
		if (
			repeat.indexName &&
			references(text, repeat.indexName) &&
			!bound.has(repeat.indexName)
		) {
			bound.add(repeat.indexName);
			lines.push(`const ${repeat.indexName}=${CONTEXT}.repeatIndex;`);
		}
	}
	if (references(text, 'error') && !bound.has('error')) {
		bound.add('error');
		lines.push(`const error=${CONTEXT}.asyncError;`);
	}
	for (const binding of input.semanticGraph.graphBindings) {
		const owned =
			binding.componentName === componentName ||
			(!binding.componentName && componentName === rootComponentName);
		if (!owned || bound.has(binding.name) || !references(text, binding.name)) continue;
		bound.add(binding.name);
		lines.push(`const ${binding.name}=${CONTEXT}.read(${JSON.stringify(binding.id)});`);
	}
	for (const propName of componentPropNames(componentAst)) {
		if (bound.has(propName) || !references(text, propName)) continue;
		bound.add(propName);
		lines.push(`const ${propName}=${CONTEXT}.read(${JSON.stringify(`prop:${propName}`)});`);
	}
	lines.push(
		...sharedInstancePreludeLines(
			input.semanticGraph,
			text,
			bound,
			(graphNodeId, path) =>
				`${CONTEXT}.read(${JSON.stringify(graphNodeId)}, ${JSON.stringify(path)})`,
		),
	);
	const mintCase =
		handles.length > 0
			? elementHandleIdReadCase({
					idPrefixSource: `(${CONTEXT}.idPrefix??'')`,
					widgetInstanceSource: hasSharedElementHandle(handles)
						? `${CONTEXT}.read(${JSON.stringify(MARKLESS_WIDGET_INSTANCE_KEY)})`
						: null,
				})
			: '';
	return [
		`(residue,${CONTEXT})=>{`,
		mintCase,
		lines.join(''),
		`switch(residue.source){`,
		authoredResidueReadCases(sources).join(''),
		`default:throw new Error('MARKLESS_PRERENDER_RESIDUE_MISSING: '+residue.source);}}`,
	].join('');
}

// Module-scope names an authored expression may call (imported helpers, module
// constants). Only the reachable set ships, so a module whose residues touch
// nothing at module scope adds no bytes to the client render-data module.
export function emitClientResidueReaderPrelude(
	input: PublicRenderModuleInput,
	componentNames: ReadonlyArray<string>,
): {
	readonly imports: ReadonlyArray<{ readonly source: string; readonly line: string }>;
	readonly declarations: ReadonlyArray<string>;
} {
	const sources = componentNames.flatMap((componentName) => [
		...authoredResidueSources(
			input.renderData.chunks.filter((chunk) => chunk.componentName === componentName),
		),
		...renderDecisionSources(input, componentName),
	]);
	if (sources.length === 0) return { imports: [], declarations: [] };
	const declarations = moduleScopeDeclarations(input.source.source, input.source.filename);
	const moduleImports = publicRenderValueImports(
		input.semanticGraph.moduleImports,
		input.semanticGraph.componentEdges,
	).filter((moduleImport) => moduleImport.source !== '@markless/core');
	const kept: string[] = [];
	const keptImports: Array<{ readonly source: string; readonly line: string }> = [];
	let text = sources.join('\n');
	let changed = true;
	while (changed) {
		changed = false;
		for (const declaration of declarations) {
			if (kept.includes(declaration.source)) continue;
			if (!declaration.names.some((name) => references(text, name))) continue;
			kept.push(declaration.source);
			text += `\n${declaration.source}`;
			changed = true;
		}
		for (const moduleImport of moduleImports) {
			const line = emitValueImport(moduleImport);
			if (
				keptImports.some((entry) => entry.line === line) ||
				!references(text, moduleImport.localName)
			)
				continue;
			keptImports.push({ source: moduleImport.source, line });
			changed = true;
		}
	}
	return { imports: keptImports, declarations: kept };
}

export function componentAstsForResidueReaders(source: string, filename: string) {
	return sameModuleComponentMap(parseModule(source, filename) as unknown as AnyNode);
}

function references(text: string, name: string): boolean {
	if (!/^[A-Za-z_$][\w$]*$/.test(name)) return false;
	return new RegExp(`(^|[^\\w$.])${name}([^\\w$]|$)`).test(text);
}
