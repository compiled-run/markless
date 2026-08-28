import { parseModule } from '../../js-ast.ts';
import type { PublicRenderModuleInput, SemanticMarkupResidue } from '../../artifacts.ts';
import type { AnyNode } from '../../ast/nodes.ts';
import { sharedInstanceVisibleFrom } from '../semantic-graph/collect-shared.ts';
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
/**
 * The case LABEL stays authored: it is the id `renderData` names the residue by,
 * and rewriting it would stop the switch matching. Only the returned expression
 * is stripped, and only when a caller asks (the SSR module, which is loaded as
 * JavaScript). The client reader ships through the bundler's own strip.
 */
export function authoredResidueReadCases(
	sources: ReadonlyArray<string>,
	strip?: (source: string) => string,
): string[] {
	return sources.map(
		(source) => `case ${JSON.stringify(source)}:return (${strip ? strip(source) : source});`,
	);
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

/**
 * The seed-map key under which a widget's seed phase files "some part of this
 * instance binds that element() handle", one entry per handle. The phase runs
 * before any part renders, so an IDREF position written on the FIRST part can
 * still be told whether the element it names is going to exist.
 *
 * The answer is positive by construction: an entry is filed only because a
 * placed part declared the binding. A handle that is never bound anywhere is a
 * build error long before this map exists, so a missing entry means exactly one
 * thing - this widget renders no element for that handle - and the IDREF
 * attribute is omitted rather than left naming nothing.
 */
export const MARKLESS_ELEMENT_BOUND_KEY_PREFIX = 'markless:element-bound|';

/**
 * The full roster key: the prefix, the widget-instance token the minting side
 * uses, then the handle.
 *
 * The token is what makes the entry per instance. An enclosing widget's seed
 * walk descends THROUGH a nested family's root and files that family's handles
 * onto its own map, which every nested instance then inherits; keyed by the
 * enclosing instance's token, such an entry answers only for the widget that
 * filed it, and a nested instance that bound nothing still reads "unbound".
 */
export function elementBoundKeySource(tokenSource: string, handleSource: string): string {
	return `${JSON.stringify(MARKLESS_ELEMENT_BOUND_KEY_PREFIX)}+${tokenSource}+'|'+${handleSource}`;
}

/** Every element() handle one chunk set spells as a minted `mx-` id. */
export function elementHandleIdSources(chunks: RenderChunks): ReadonlyArray<string> {
	const handles = new Set<string>();
	const add = (residue: SemanticMarkupResidue) => {
		if (residue.kind === 'element-handle-id') handles.add(residue.handleGraphNodeId);
		if (residue.kind === 'element-handle-id-list')
			for (const handle of residue.handleGraphNodeIds) handles.add(handle);
	};
	for (const chunk of chunks) {
		for (const slot of chunk.slots) {
			if ('residue' in slot) add(slot.residue);
			if (slot.kind !== 'dynamic-host') continue;
			for (const attribute of slot.attributeSlots) add(attribute.residue);
		}
	}
	return [...handles];
}

/** The arm index one branch takes, from an expression that reads its test. */
export function branchArmIndexSource(
	branch: PublicRenderModuleInput['renderData']['branches'][number],
	testSource: string | undefined,
): string {
	return branch.kind === 'switch' && branch.armTests
		? `(()=>{const value=(${testSource});const tests=${JSON.stringify(branch.armTests)};const match=tests.findIndex((test)=>test!==null&&Object.is(test,value));return match===-1?Math.max(0,tests.indexOf(null)):match;})()`
		: `((${testSource})?0:1)`;
}

export type ArmBoundIdrefHandle = {
	readonly handleGraphNodeId: string;
	readonly branchSiteId: string;
	readonly armIndex: number;
};

/**
 * A handle bound inside a flippable arm that an IDREF outside the arms names.
 *
 * The seed-time roster cannot promise an element for one of these — it is filed
 * before the render decides which arm it takes — so the roster answers "no" and
 * the IDREF is omitted. That is right for the arm the render did NOT take and
 * wrong for the one it did: a served-open disclosure must name its panel in the
 * markup, before any script runs. The arm this render took is the only honest
 * answer, and the module that owns the IDREF owns the branch that decides it.
 */
export function armBoundIdrefHandles(
	chunks: RenderChunks,
	branches: PublicRenderModuleInput['renderData']['branches'],
): ReadonlyArray<ArmBoundIdrefHandle> {
	const named = new Set<string>();
	for (const chunk of chunks)
		for (const slot of chunk.slots)
			if (
				slot.kind === 'attribute' &&
				slot.residue.kind === 'element-handle-id' &&
				slot.residue.idref === true
			)
				named.add(slot.residue.handleGraphNodeId);
	if (named.size === 0) return [];
	const entries: ArmBoundIdrefHandle[] = [];
	for (const branch of branches)
		for (const [armIndex, chunkId] of branch.armChunkIds.entries())
			for (const slot of chunks.find((candidate) => candidate.id === chunkId)?.slots ?? []) {
				if (slot.kind !== 'attribute' || slot.residue.kind !== 'element-handle-id') continue;
				const handleGraphNodeId = slot.residue.handleGraphNodeId;
				if (slot.residue.idref === true || !named.has(handleGraphNodeId)) continue;
				if (entries.some((entry) => entry.handleGraphNodeId === handleGraphNodeId)) continue;
				entries.push({ handleGraphNodeId, branchSiteId: branch.branchSiteId, armIndex });
			}
	return entries;
}

/** Reading "is this handle's arm the one this render took", or undefined for any other handle. */
export function armBoundHandleReadSource(
	entries: ReadonlyArray<ArmBoundIdrefHandle & { readonly armSource: string }>,
): ((handleExpression: string) => string) | undefined {
	if (entries.length === 0) return undefined;
	return (handle) =>
		`(${entries
			.map(
				(entry) =>
					`${handle}===${JSON.stringify(entry.handleGraphNodeId)}?(${entry.armSource})===${String(entry.armIndex)}:`,
			)
			.join('')}undefined)`;
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
	readonly widgetInstanceRead: ((handleExpression: string) => string) | null;
	/** Reads one seed-map key; supplied wherever a shared() IDREF can be omitted. */
	readonly boundRead?: (keyExpression: string) => string;
	/** Answers for a handle an arm binds, ahead of the roster; undefined for any other. */
	readonly armBoundRead?: (handleExpression: string) => string;
	/** Emitted only for a chunk set that writes an IDREF list somewhere. */
	readonly lists?: boolean;
}): string {
	const slug = (handle: string) => {
		const prefix = input.widgetInstanceRead
			? `(${handle}.startsWith('shared:')?(${input.widgetInstanceRead(handle)}??${missingWidgetInstance(handle)}):${input.idPrefixSource})`
			: input.idPrefixSource;
		return `(${prefix}+${handle}).replace(/\\W+/g,'-')`;
	};
	// The token is read WITHOUT the mint's throw: an omitted IDREF is the right
	// answer for a part that resolved no instance, and the mint still refuses.
	const unbound = (handle: string) => {
		if (!input.widgetInstanceRead || !input.boundRead) return null;
		const roster = input.boundRead(
			elementBoundKeySource(input.widgetInstanceRead(handle), handle),
		);
		return `${handle}.startsWith('shared:')&&${
			input.armBoundRead ? `(${input.armBoundRead(handle)}??${roster})` : roster
		}!==true`;
	};
	// Only an IDREF position can be omitted. The element that CARRIES the id mints
	// unconditionally: it renders only when its own part renders, and an omission
	// there would write `id="undefined"` instead of nothing.
	const singleUnbound = unbound('residue.handleGraphNodeId');
	const omitUnbound = singleUnbound ? `if(residue.idref&&${singleUnbound})return undefined;` : '';
	const single = `if(residue.kind==='element-handle-id'){${omitUnbound}return 'mx-'+${slug('residue.handleGraphNodeId')};}`;
	if (!input.lists) return single;
	// A list is a referencing side by construction, so every entry is omitted on
	// the same terms; an attribute naming nothing at all is absent rather than
	// empty, which is what the single form already does.
	const entryUnbound = unbound('h');
	const kept = entryUnbound
		? `residue.handleGraphNodeIds.filter(h=>!(${entryUnbound}))`
		: 'residue.handleGraphNodeIds';
	return `${single}if(residue.kind==='element-handle-id-list'){const ids=${kept}.map(h=>'mx-'+${slug('h')});return ids.length?ids.join(' '):undefined;}`;
}

/** Whether a chunk set writes any IDREF list, so its reader needs the branch. */
export function hasElementHandleIdList(chunks: RenderChunks): boolean {
	const isList = (residue: SemanticMarkupResidue) =>
		residue.kind === 'element-handle-id-list';
	return chunks.some((chunk) =>
		chunk.slots.some(
			(slot) =>
				('residue' in slot && isList(slot.residue)) ||
				(slot.kind === 'dynamic-host' &&
					slot.attributeSlots.some((attribute) => isList(attribute.residue))),
		),
	);
}

/**
 * Which rendered widget a MINTING handle belongs to, asked of its own family.
 *
 * One element routinely carries handles declared by two different widget
 * families now, so a single "the widget instance I am inside" token cannot
 * answer for both. A handle's graph node id is `<definitionId>/element:<name>`,
 * so the family is read off the handle itself and the per-definition token is
 * asked for first; the plain token answers a page that files only one.
 */
export function widgetInstanceReadSource(
	get: (keyExpression: string) => string,
): (handleExpression: string) => string {
	const plain = JSON.stringify(MARKLESS_WIDGET_INSTANCE_KEY);
	// The LAST slash: a definition id carries its module's path, so cutting at the
	// first one names a directory, and every family under it collapses to one key.
	return (handle) =>
		`(${get(`${plain}+'|'+${handle}.slice(0,${handle}.lastIndexOf('/'))`)}??${get(plain)})`;
}

// A part rendered outside every widget root has no token; refusing loudly is
// the only alternative to minting a name a second widget would mint too.
const missingWidgetInstance = (handle: string) =>
	`(()=>{throw new Error('MARKLESS_ELEMENT_HANDLE_WIDGET_INSTANCE_MISSING: '+${handle})})()`;

/** Whether any of these handles is declared by a shared() factory. */
export function hasSharedElementHandle(handles: ReadonlyArray<string>): boolean {
	return handles.some((handle) => handle.startsWith('shared:'));
}

type SharedInstanceMember = {
	readonly name: string;
	readonly graphNodeId: string;
	readonly path: ReadonlyArray<string>;
};

type SharedInstanceRebuild = {
	readonly localName: string;
	readonly members: ReadonlyArray<SharedInstanceMember>;
};

/**
 * A component's shared-instance local (`const checkbox = checkboxState()`) is
 * not a graph binding: it names a factory whose returned properties each stand
 * for one graph node. A composite residue over that local (`checkbox.checked
 * === true`) can only run once the local is rebuilt from those nodes, so every
 * reader takes the members from this one description.
 *
 * Only the cells the text names: a member is read out of the state map by its
 * own node, never through a sibling member, so the reachable set is the reads
 * themselves.
 */
function sharedInstanceReads(
	semanticGraph: PublicRenderModuleInput['semanticGraph'],
	componentName: string | undefined,
	text: string,
	bound: ReadonlySet<string>,
): ReadonlyArray<SharedInstanceRebuild> {
	const rebuilds: SharedInstanceRebuild[] = [];
	const declared = new Set<string>();
	for (const instance of semanticGraph.sharedInstances ?? []) {
		if (declared.has(instance.localName) || bound.has(instance.localName)) continue;
		// Only the locals this component's body actually declares: a sibling
		// component's same-named instance would rebuild the wrong widget's members
		// under that name, and the emitted scope would read them.
		if (!sharedInstanceVisibleFrom(instance, componentName)) continue;
		if (!references(text, instance.localName)) continue;

		const definition = semanticGraph.sharedDefinitions.find(
			(candidate) => candidate.id === instance.definitionId,
		);
		const reads = instanceMemberReads(text, instance.localName);
		const members = (definition?.returnProperties ?? []).flatMap((property) =>
			property.kind === 'graph' && (reads === null || reads.has(property.name))
				? [{ name: property.name, graphNodeId: property.graphNodeId, path: property.path }]
				: [],
		);
		if (members.length === 0) continue;

		declared.add(instance.localName);
		rebuilds.push({ localName: instance.localName, members });
	}
	return rebuilds;
}

export function sharedInstancePreludeLines(
	semanticGraph: PublicRenderModuleInput['semanticGraph'],
	componentName: string | undefined,
	text: string,
	bound: ReadonlySet<string>,
	readSource: (graphNodeId: string, path: ReadonlyArray<string>) => string,
): string[] {
	return sharedInstanceReads(semanticGraph, componentName, text, bound).map(
		(rebuild) =>
			`const ${rebuild.localName} = {${rebuild.members
				.map(
					(member) =>
						`${JSON.stringify(member.name)}: ${readSource(member.graphNodeId, member.path)}`,
				)
				.join(', ')}};`,
	);
}

/**
 * The graph nodes this text reads through a shared instance local. A composite
 * residue names no node the render data can see, so without these the server
 * derived nothing for it and the rebuilt local read undefined.
 */
export function sharedInstanceReadGraphNodeIds(
	semanticGraph: PublicRenderModuleInput['semanticGraph'],
	componentName: string | undefined,
	text: string,
): ReadonlyArray<string> {
	return sharedInstanceReads(semanticGraph, componentName, text, new Set()).flatMap((rebuild) =>
		rebuild.members.map((member) => member.graphNodeId),
	);
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
			componentName,
			text,
			bound,
			(graphNodeId, path) =>
				`${CONTEXT}.read(${JSON.stringify(graphNodeId)}, ${JSON.stringify(path)})`,
		),
	);
	// The browser has no render body, so only a test the graph answers on its own
	// can decide an arm here; any other keeps the roster's answer.
	const armBoundRead = armBoundHandleReadSource(
		armBoundIdrefHandles(componentChunks, input.renderData.branches).flatMap((entry) => {
			const branch = input.renderData.branches.find(
				(candidate) => candidate.branchSiteId === entry.branchSiteId,
			);
			const testRead = branch?.testReads.length === 1 ? branch.testReads[0] : undefined;
			return branch && testRead
				? [
						{
							...entry,
							armSource: branchArmIndexSource(
								branch,
								`${CONTEXT}.read(${JSON.stringify(testRead.graphNodeId)},${JSON.stringify(testRead.path)})`,
							),
						},
					]
				: [];
		}),
	);
	const mintCase =
		handles.length > 0
			? elementHandleIdReadCase({
					idPrefixSource: `(${CONTEXT}.idPrefix??'')`,
					widgetInstanceRead: hasSharedElementHandle(handles)
						? widgetInstanceReadSource((key) => `${CONTEXT}.read(${key})`)
						: null,
					boundRead: (key) => `${CONTEXT}.read(${key})`,
					...(armBoundRead ? { armBoundRead } : {}),
					...(hasElementHandleIdList(componentChunks) ? { lists: true } : {}),
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

/**
 * Which members of `localName` this text reads, or null when it cannot be said.
 *
 * Every mention has to be a plain `.member` read for the answer to be complete.
 * A spread, a bare mention passed on, or an indexed read can reach any member,
 * so those give up and the whole instance is rebuilt.
 */
function instanceMemberReads(text: string, localName: string): ReadonlySet<string> | null {
	if (!/^[A-Za-z_$][\w$]*$/.test(localName)) return null;
	const members = new Set<string>();
	for (const match of text.matchAll(new RegExp(`(^|[^\\w$.])${localName}(?![\\w$])`, 'g'))) {
		const member = /^\s*\??\.\s*([A-Za-z_$][\w$]*)/.exec(
			text.slice((match.index ?? 0) + match[0].length),
		);
		if (!member?.[1]) return null;
		members.add(member[1]);
	}
	return members;
}
