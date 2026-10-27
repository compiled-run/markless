// A warning that holds only while some props never change is safe only if no caller this build compiled can change them.
import { propsDeciding, rowsDecidedBy } from '@markless/compiler';
import type {
	CompileTsrxModuleResult,
	CompilerDiagnostic,
	SemanticComponentPropBinding,
} from '@markless/compiler';
import { PROTOCOL_PROP_GRAPH_NODE_PREFIX } from '@markless/serializer';

type PassedProp =
	| { readonly kind: 'fixed' }
	| { readonly kind: 'changing'; readonly source: string }
	| { readonly kind: 'forwarded'; readonly props: ReadonlyArray<string>; readonly source: string }
	| { readonly kind: 'unknown'; readonly source: string };

export type ModulePropFlow = {
	readonly components: ReadonlyArray<{ readonly name: string; readonly exportName?: string }>;
	readonly decided: ReadonlyArray<{
		readonly code: string;
		readonly componentName: string;
		readonly props: ReadonlyArray<string>;
		readonly message: string;
	}>;
	readonly edges: ReadonlyArray<{
		readonly id: string;
		readonly parentComponentName: string;
		readonly childComponentName: string;
		readonly importSource?: string;
		readonly importedName?: string;
		readonly props: Readonly<Record<string, PassedProp>>;
		readonly spread?: PassedProp;
	}>;
};

export function modulePropFlow(
	compiled: CompileTsrxModuleResult,
	diagnostics: ReadonlyArray<CompilerDiagnostic>,
): ModulePropFlow {
	const graph = compiled.semanticGraph;
	return {
		components: (graph.components ?? []).map((component) => ({
			name: component.name,
			...(component.exportName ? { exportName: component.exportName } : {}),
		})),
		decided: diagnostics.flatMap((diagnostic) =>
			diagnostic.decidedByProps && diagnostic.suppressed !== true
				? [
						{
							code: diagnostic.code,
							componentName: diagnostic.decidedByProps.componentName,
							props: diagnostic.decidedByProps.props,
							message: diagnostic.message,
						},
					]
				: [],
		),
		edges: (graph.componentEdges ?? []).map((edge) => {
			const spread = edge.props.find((prop) => prop.kind === 'spread');
			return {
				id: edge.id,
				parentComponentName: edge.parentComponentName,
				childComponentName: edge.childComponentName,
				...(edge.importSource ? { importSource: edge.importSource } : {}),
				...(edge.importedName ? { importedName: edge.importedName } : {}),
				props: Object.fromEntries(
					edge.props.flatMap((prop) =>
						prop.kind === 'spread' ? [] : [[prop.name, passedProp(prop, graph, edge.keyedRepeatScopeIds)]],
					),
				),
				...(spread ? { spread: passedProp(spread, graph, edge.keyedRepeatScopeIds) } : {}),
			};
		}),
	};
}

function passedProp(
	prop: SemanticComponentPropBinding,
	graph: CompileTsrxModuleResult['semanticGraph'],
	repeatIds: ReadonlyArray<string> = [],
): PassedProp {
	const row = rowValue(prop, graph, repeatIds);
	if (row !== undefined)
		return !row
			? { kind: 'changing', source: prop.source }
			: row.length === 0
				? { kind: 'fixed' }
				: { kind: 'forwarded', props: row, source: prop.source };
	switch (prop.kind) {
		case 'serializable':
		case 'callback':
		case 'element-handle-id':
			return { kind: 'fixed' };
		case 'opaque':
			return prop.buildTimeValue ? { kind: 'fixed' } : { kind: 'unknown', source: prop.source };
		case 'graph-reference':
		case 'spread': {
			if (prop.kind === 'graph-reference' && prop.graphBindingKind === 'element')
				return { kind: 'fixed' };
			if (prop.kind === 'spread' && prop.graphNodeId.startsWith(PROTOCOL_PROP_GRAPH_NODE_PREFIX))
				return { kind: 'forwarded', props: [], source: prop.source };
			const deciding = propsDeciding(prop.graphNodeId, prop.path, graph);
			if (!deciding) return { kind: 'changing', source: prop.source };
			return deciding.length === 0
				? { kind: 'fixed' }
				: { kind: 'forwarded', props: deciding, source: prop.source };
		}
		default:
			return { kind: 'unknown', source: (prop as { source?: string }).source ?? '' };
	}
}

// A value read off a @for row changes only when the list it comes from does.
function rowValue(
	prop: SemanticComponentPropBinding,
	graph: CompileTsrxModuleResult['semanticGraph'],
	repeatIds: ReadonlyArray<string>,
): ReadonlyArray<string> | null | undefined {
	if (prop.kind !== 'opaque' || prop.buildTimeValue) return undefined;
	const root = /^[A-Za-z_$][\w$]*/.exec(prop.source)?.[0];
	if (!root || !/^[A-Za-z_$][\w$]*(?:(?:\?\.|\.)[A-Za-z_$][\w$]*)*$/.test(prop.source)) return undefined;
	for (const id of [...repeatIds].reverse()) {
		const repeat = graph.keyedRepeats.find((candidate) => candidate.id === id);
		if (repeat && (repeat.itemName === root || repeat.indexName === root))
			return rowsDecidedBy(repeat, graph);
	}
	return undefined;
}

type Recorded = {
	readonly flow: ModulePropFlow;
	// A component edge's id to the file its child component lives in.
	readonly childSources: ReadonlyMap<string, string>;
};

export class PropFlowRegistry {
	readonly #modules = new Map<string, Recorded>();

	record(source: string, flow: ModulePropFlow, childSources: ReadonlyMap<string, string>): void {
		this.#modules.set(source, { flow, childSources });
	}

	clear(): void {
		this.#modules.clear();
	}

	/** One message per prop-decided @if some caller can change, or whose caller the build cannot see. */
	refusals(): ReadonlyArray<string> {
		const refusals: string[] = [];
		for (const [source, { flow }] of this.#modules)
			for (const decided of flow.decided)
				for (const prop of decided.props) {
					const reason = this.#changes(source, decided.componentName, prop, new Set());
					if (reason)
						refusals.push(refusalMessage(decided, source, prop, reason));
				}
		return refusals;
	}

	#changes(
		source: string,
		componentName: string,
		prop: string,
		seen: Set<string>,
	): string | undefined {
		const key = `${source}\0${componentName}\0${prop}`;
		if (seen.has(key)) return undefined;
		seen.add(key);
		for (const [callerSource, { flow, childSources }] of this.#modules)
			for (const edge of flow.edges) {
				if (!this.#targets(callerSource, edge, childSources, source, componentName)) continue;
				const passed = edge.props[prop] ?? edge.spread;
				if (!passed || passed.kind === 'fixed') continue;
				const where = `<${edge.parentComponentName}> in ${callerSource}`;
				if (passed.kind === 'changing')
					return `${where} passes it \`${passed.source}\`, which changes.`;
				if (passed.kind === 'unknown')
					return `${where} passes it \`${passed.source}\`, which the build cannot prove never changes.`;
				for (const forwarded of passed.props.length > 0 ? passed.props : [prop]) {
					const deeper = this.#changes(callerSource, edge.parentComponentName, forwarded, seen);
					if (deeper) return `${where} hands it its own prop \`${forwarded}\`; ${deeper}`;
				}
			}
		return undefined;
	}

	#targets(
		callerSource: string,
		edge: ModulePropFlow['edges'][number],
		childSources: ReadonlyMap<string, string>,
		source: string,
		componentName: string,
	): boolean {
		if (!edge.importSource)
			return callerSource === source && edge.childComponentName === componentName;
		if (childSources.get(edge.id) !== source) return false;
		const target = this.#modules.get(source);
		const exportName = edge.importedName ?? 'default';
		return (
			target?.flow.components.some(
				(component) =>
					component.name === componentName &&
					(component.exportName === exportName ||
						(exportName !== 'default' && component.name === exportName)),
			) ?? false
		);
	}
}

function refusalMessage(
	decided: ModulePropFlow['decided'][number],
	source: string,
	prop: string,
	reason: string,
): string {
	const at = `${source}: <${decided.componentName}>: ${decided.message}`;
	switch (decided.code) {
		case 'MARKLESS_BRANCH_ARM_UPDATE_UNSUPPORTED':
			return `MARKLESS_BRANCH_ARM_UPDATE_UNSUPPORTED: ${at} Its test reads the prop \`${prop}\`, and ${reason} Pass \`${prop}\` a value that does not change, or show the content outside the @if and hide it with an attribute.`;
		case 'MARKLESS_KEYED_REPEAT_ROW_MINT_UNSUPPORTED':
			return `MARKLESS_KEYED_REPEAT_ROW_MINT_UNSUPPORTED: ${at} The list comes from the prop \`${prop}\`, and ${reason} Pass \`${prop}\` a value that does not change, or keep the row to markup the browser can build.`;
		case 'MARKLESS_ROW_BRANCH_FLIP_UNSUPPORTED':
			return `MARKLESS_ROW_BRANCH_FLIP_UNSUPPORTED: ${at} The rows come from the prop \`${prop}\`, and ${reason} Pass \`${prop}\` a value that does not change, or keep the row to markup the browser can build.`;
		default:
			return `${decided.code}: ${at} It holds only while the prop \`${prop}\` never changes, and ${reason} Pass \`${prop}\` a value that does not change.`;
	}
}
