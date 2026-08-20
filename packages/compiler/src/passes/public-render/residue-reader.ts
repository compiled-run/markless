import { parseModule } from '@tsrx/core';
import type { PublicRenderModuleInput } from '../../artifacts.ts';
import type { AnyNode } from '../../ast/nodes.ts';
import {
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
	const sources = authoredResidueSources(
		input.renderData.chunks.filter((chunk) => chunk.componentName === componentName),
	);
	if (sources.length === 0) return null;
	const text = sources.join('\n');
	const bound = new Set<string>();
	const lines: string[] = [];
	for (const repeat of input.semanticGraph.keyedRepeats) {
		if (references(text, repeat.itemName) && !bound.has(repeat.itemName)) {
			bound.add(repeat.itemName);
			lines.push(`const ${repeat.itemName}=${CONTEXT}.repeatItem;`);
		}
		if (repeat.indexName && references(text, repeat.indexName) && !bound.has(repeat.indexName)) {
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
	return [
		`(residue,${CONTEXT})=>{`,
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
