import type { ModuleGraphInterfaceArtifact, PublicRenderModuleInput } from '../../artifacts.ts';
import { derivedProps } from '../public-render/prop-cell-seed.ts';

/** Publishes each component's `derivedProps`, so a module forwarding its own prop into one serves that prop too. */
export function withDerivedProps(
	moduleGraphInterface: ModuleGraphInterfaceArtifact,
	input: PublicRenderModuleInput,
): ModuleGraphInterfaceArtifact {
	const byComponent = new Map(
		moduleGraphInterface.render.components.map((component) => [
			component.componentName,
			[...derivedProps(input, component.componentName)],
		]),
	);
	if (![...byComponent.values()].some((props) => props.length > 0)) return moduleGraphInterface;
	return {
		...moduleGraphInterface,
		render: {
			...moduleGraphInterface.render,
			components: moduleGraphInterface.render.components.map((component) => {
				const props = byComponent.get(component.componentName) ?? [];
				if (props.length === 0) return component;
				const narrowed = props.filter(([, paths]) =>
					paths.every((path) => path.length > 0),
				);
				return {
					...component,
					derivedProps: props.map(([key]) => key),
					...(narrowed.length > 0
						? { derivedPropPaths: Object.fromEntries(narrowed) }
						: {}),
				};
			}),
		},
	};
}
