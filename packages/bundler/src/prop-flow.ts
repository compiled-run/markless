// An @if whose arms cannot be rebuilt but whose test reads only props is safe only if no caller this build compiled can change them.
import type { CompileTsrxModuleResult, SemanticComponentPropBinding } from '@markless/compiler';

type PassedProp =
	| { readonly kind: 'fixed' }
	| { readonly kind: 'changing'; readonly source: string }
	| { readonly kind: 'forwarded'; readonly prop: string; readonly source: string }
	| { readonly kind: 'unknown'; readonly source: string };

export type ModulePropFlow = {
	readonly components: ReadonlyArray<{ readonly name: string; readonly exportName?: string }>;
	readonly decided: ReadonlyArray<{
		readonly componentName: string;
		readonly props: ReadonlyArray<string>;
		readonly message: string;
		readonly test: string;
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

export function modulePropFlow(compiled: CompileTsrxModuleResult): ModulePropFlow {
	const graph = compiled.semanticGraph;
	return {
		components: (graph.components ?? []).map((component) => ({
			name: component.name,
			...(component.exportName ? { exportName: component.exportName } : {}),
		})),
		decided: (compiled.symbolModules.propDecidedBranches ?? []).map((branch) => ({
			componentName: branch.componentName,
			props: branch.props,
			message: branch.diagnostic.message,
			test: branch.diagnostic.source ?? '',
		})),
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
						prop.kind === 'spread' ? [] : [[prop.name, passedProp(prop)]],
					),
				),
				...(spread ? { spread: passedProp(spread) } : {}),
			};
		}),
	};
}

function passedProp(prop: SemanticComponentPropBinding): PassedProp {
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
			const forwarded =
				prop.graphNodeId === 'prop:props'
					? prop.path[0]
					: prop.graphNodeId.startsWith('prop:')
						? prop.graphNodeId.slice('prop:'.length)
						: undefined;
			if (prop.kind === 'spread' && prop.graphNodeId.startsWith('prop:'))
				return { kind: 'forwarded', prop: '', source: prop.source };
			return forwarded !== undefined
				? { kind: 'forwarded', prop: forwarded, source: prop.source }
				: { kind: 'changing', source: prop.source };
		}
		default:
			return { kind: 'unknown', source: (prop as { source?: string }).source ?? '' };
	}
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
						refusals.push(
							`MARKLESS_BRANCH_ARM_UPDATE_UNSUPPORTED: ${source}: <${decided.componentName}>: ${decided.message} Its test reads the prop \`${prop}\`, and ${reason} Pass \`${prop}\` a value that does not change, or show the content outside the @if and hide it with an attribute.`,
						);
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
				const forwarded = passed.prop || prop;
				const deeper = this.#changes(callerSource, edge.parentComponentName, forwarded, seen);
				if (deeper) return `${where} hands it its own prop \`${forwarded}\`; ${deeper}`;
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
