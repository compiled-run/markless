// A warning that holds only while some props never change is safe only if no caller this build compiled can change them.
import { propDecidedArm, propsDeciding, rowsDecidedBy, type KnownPropValue } from '@markless/compiler';
import type {
	CompileTsrxModuleResult,
	CompilerDiagnostic,
	SemanticBranchArm,
	SemanticBranchSite,
	SemanticComponentPropBinding,
} from '@markless/compiler';
import { PROTOCOL_PROP_GRAPH_NODE_PREFIX } from '@markless/serializer';

type PassedProp =
	// `value` is set when the build knows what the caller passes.
	| { readonly kind: 'fixed'; readonly value?: { readonly value: unknown } }
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
		readonly childCount?: number;
		readonly branchArms?: ReadonlyArray<SemanticBranchArm>;
	}>;
	// The @if/@switch sites whose test reads only props, so each caller's props pick the arm.
	readonly branches?: ReadonlyArray<
		Pick<SemanticBranchSite, 'id' | 'kind' | 'armCount' | 'propTest' | 'armTests'> & {
			readonly componentName: string;
		}
	>;
};

/** A component a non-TSRX page renders with literal props, as an MDX page does. */
export type LiteralComponentInstance = {
	readonly childSource: string;
	readonly exportName?: string;
	readonly props: Readonly<Record<string, unknown>>;
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
				childCount: edge.children.childCount,
				...(edge.branchArms?.length ? { branchArms: edge.branchArms } : {}),
			};
		}),
		branches: (graph.branchSites ?? []).flatMap((site) =>
			site.propTest && site.componentName
				? [
						{
							id: site.id,
							componentName: site.componentName,
							kind: site.kind,
							armCount: site.armCount,
							propTest: site.propTest,
							...(site.armTests ? { armTests: site.armTests } : {}),
						},
					]
				: [],
		),
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
			return 'value' in prop ? { kind: 'fixed', value: { value: prop.value } } : { kind: 'fixed' };
		case 'callback':
		case 'element-handle-id':
			return { kind: 'fixed' };
		case 'opaque':
			return prop.buildTimeValue
				? { kind: 'fixed', value: prop.buildTimeValue }
				: { kind: 'unknown', source: prop.source };
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

	/** Records the components a page outside TSRX renders, each with props fixed at build time. */
	recordLiteralInstances(source: string, instances: ReadonlyArray<LiteralComponentInstance>): void {
		const edges = instances.map((instance, index) => ({
			id: `literal-instance:${index}`,
			parentComponentName: '',
			childComponentName: '',
			importSource: instance.childSource,
			importedName: instance.exportName ?? 'default',
			props: Object.fromEntries(
				Object.entries(instance.props).map(([name, value]) => [
					name,
					{ kind: 'fixed', value: { value } } as const,
				]),
			),
			childCount: 0,
		}));
		this.record(
			source,
			{ components: [], decided: [], edges },
			new Map(edges.map((edge, index) => [edge.id, instances[index]!.childSource])),
		);
	}

	/**
	 * Per component file among `files`: the child files it imports only for arms that no caller among `files` renders.
	 * An arm counts as rendered unless every caller's props are known and pick another one. A component keeps every
	 * arm when it is in `roots`, has no recorded caller, or is imported from a file this registry has no record of.
	 */
	unreachableChildren(
		files: ReadonlySet<string>,
		roots: ReadonlySet<string>,
		importers: ReadonlyMap<string, ReadonlySet<string>>,
	): Map<string, Set<string>> {
		const unreachable = new Map<string, Set<string>>();
		for (const source of files) {
			const recorded = this.#modules.get(source);
			if (!recorded?.flow.branches?.length || roots.has(source)) continue;
			if ([...(importers.get(source) ?? [])].some((importer) => !this.#modules.has(importer)))
				continue;
			const live = new Map<string, Set<number>>();
			for (const branch of recorded.flow.branches) {
				const callers = this.#callers(source, branch.componentName, files);
				if (!callers.length) continue;
				const arms = new Set<number>();
				let decided = true;
				for (const caller of callers) {
					const arm = propDecidedArm(branch, (path) => passedValue(caller, path));
					if (arm === undefined) {
						decided = false;
						break;
					}
					if (arm !== null) arms.add(arm);
				}
				if (decided) live.set(branch.id, arms);
			}
			if (!live.size) continue;
			const dead = new Set<string>();
			const kept = new Set<string>();
			for (const edge of recorded.flow.edges) {
				const child = recorded.childSources.get(edge.id);
				if (!child || child === source) continue;
				const ruledOut = (edge.branchArms ?? []).some(
					({ branchSiteId, arm }) => live.get(branchSiteId)?.has(arm) === false,
				);
				(ruledOut ? dead : kept).add(child);
			}
			for (const child of kept) dead.delete(child);
			if (dead.size) unreachable.set(source, dead);
		}
		return unreachable;
	}

	#callers(
		source: string,
		componentName: string,
		files: ReadonlySet<string>,
	): Array<ModulePropFlow['edges'][number]> {
		const callers: Array<ModulePropFlow['edges'][number]> = [];
		for (const callerSource of files) {
			const caller = this.#modules.get(callerSource);
			if (!caller) continue;
			for (const edge of caller.flow.edges)
				if (this.#targets(callerSource, edge, caller.childSources, source, componentName))
					callers.push(edge);
		}
		return callers;
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

// What one caller passes at a prop path; a spread or a prop without a build-time value is unknown.
function passedValue(edge: ModulePropFlow['edges'][number], path: ReadonlyArray<string>): KnownPropValue {
	const [name, ...rest] = path;
	if (name === undefined || edge.spread) return { known: false };
	// Projected children replace a `children` attribute when the child renders.
	if (name === 'children' && edge.childCount !== 0) return { known: false };
	const passed = edge.props[name];
	let value: unknown;
	if (passed) {
		if (passed.kind !== 'fixed' || !passed.value) return { known: false };
		value = passed.value.value;
	}
	for (const key of rest) {
		if (value === null || value === undefined) return { known: true, value: undefined };
		if (typeof value !== 'object') return { known: false };
		value = (value as Record<string, unknown>)[key];
	}
	return { known: true, value };
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
		case 'MARKLESS_TEMPLATE_EXPRESSION_STATIC':
			return `MARKLESS_TEMPLATE_EXPRESSION_STATIC: ${at} It holds only while the prop \`${prop}\` never changes, and ${reason} Pass \`${prop}\` a value that does not change, or read a plain value from the prop.`;
		default:
			return `${decided.code}: ${at} It holds only while the prop \`${prop}\` never changes, and ${reason} Pass \`${prop}\` a value that does not change.`;
	}
}
