import type { ModuleGraphInterfaceArtifact, PublicRenderModuleInput } from '../../artifacts.ts';
import { derivedPropKeys } from '../public-render/prop-cell-seed.ts';

/** Publishes each component's `derivedProps`, so a module forwarding its own prop into one serves that prop too. */
export function withDerivedProps(
	moduleGraphInterface: ModuleGraphInterfaceArtifact,
	input: PublicRenderModuleInput,
): ModuleGraphInterfaceArtifact {
	const byComponent = new Map(
		moduleGraphInterface.render.components.map((component) => [
			component.componentName,
			[...derivedPropKeys(input, component.componentName)],
		]),
	);
	if (![...byComponent.values()].some((keys) => keys.length > 0)) return moduleGraphInterface;
	return {
		...moduleGraphInterface,
		render: {
			...moduleGraphInterface.render,
			components: moduleGraphInterface.render.components.map((component) => {
				const derivedProps = byComponent.get(component.componentName) ?? [];
				return derivedProps.length > 0 ? { ...component, derivedProps } : component;
			}),
		},
	};
}
