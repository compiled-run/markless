import type {
	ElementOnlyAttribute,
	ModuleGraphInterfaceArtifact,
	SemanticComponentEdge,
	SemanticGraphDiagnostic,
} from '../../artifacts.ts';

export const ELEMENT_ONLY_ATTRIBUTE_MISPLACED_CODE = 'MARKLESS_ELEMENT_ONLY_ATTRIBUTE_MISPLACED';

/**
 * A component given an element-only attribute must spread it onto that element.
 * The child's module-graph interface lists every element its props spread onto,
 * with the names that spread can never carry, so the answer is a build-time join;
 * a child whose interface this compile does not have cannot show it, and fails too.
 */
export function elementOnlyAttributeDiagnostics(input: {
	readonly attributes: readonly ElementOnlyAttribute[];
	readonly componentEdges: ReadonlyArray<SemanticComponentEdge>;
	readonly ownInterface: ModuleGraphInterfaceArtifact;
	readonly importedModuleInterfaces?: Readonly<Record<string, ModuleGraphInterfaceArtifact>>;
}): SemanticGraphDiagnostic[] {
	if (input.attributes.length === 0) return [];
	return input.componentEdges.flatMap((edge) =>
		input.attributes.flatMap((attribute) => {
			const prop = edge.props.find((candidate) => candidate.name === attribute.name);
			if (!prop) return [];
			const moduleInterface = edge.importSource
				? input.importedModuleInterfaces?.[edge.importSource]
				: input.ownInterface;
			const spreads =
				moduleInterface?.render.components.find(
					(component) => component.componentName === edge.childComponentName,
				)?.spreadHosts ?? [];
			const reaches = spreads.some(
				(spread) =>
					spread.tagName === attribute.tagName &&
					!spread.excludeNames.includes(attribute.name) &&
					!spread.destructuredNames.includes(attribute.name),
			);
			return reaches ? [] : [misplaced(attribute, edge, prop.sourceSpan, moduleInterface !== undefined)];
		}),
	);
}

function misplaced(
	attribute: ElementOnlyAttribute,
	edge: SemanticComponentEdge,
	span: SemanticComponentEdge['sourceSpan'],
	known: boolean,
): SemanticGraphDiagnostic {
	const tag = `<${attribute.tagName}>`;
	return {
		code: ELEMENT_ONLY_ATTRIBUTE_MISPLACED_CODE,
		severity: 'error',
		phase: 'semantic-graph',
		title: `${attribute.authored} only works on an ${tag}`,
		message: known
			? `\`${attribute.authored}\` on <${edge.childComponentName}> does nothing: ${edge.childComponentName} does not pass its props to an ${tag}.`
			: `\`${attribute.authored}\` on <${edge.childComponentName}> cannot be checked: this build does not know what ${edge.childComponentName} renders.`,
		why: `Only an ${tag} acts on \`${attribute.authored}\`. On a component, it works when the component spreads its props (\`{...rest}\`) onto an ${tag} that does not set it itself; anywhere else nothing would act on it and the page would behave as if it were not there.`,
		...(span ? { primarySpan: span } : edge.sourceSpan ? { primarySpan: edge.sourceSpan } : {}),
		passId: 'tsrx-semantic-graph',
		artifactKeys: ['semanticGraph'],
		suggestions: [
			{
				message: `Put \`${attribute.authored}\` on the ${tag} itself, or on a component that spreads its props onto one.`,
			},
		],
		docsUrl: `https://markless.dev/errors/${ELEMENT_ONLY_ATTRIBUTE_MISPLACED_CODE}`,
	};
}
