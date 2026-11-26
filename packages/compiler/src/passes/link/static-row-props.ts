import type { ModuleGraphInterfaceArtifact, PublicRenderModuleInput } from '../../artifacts.ts';
import { staticRowProps } from '../public-render/static-rows.ts';

/** Publishes each component's `staticRowProps`, so a module passing one a fixed value tells the render. */
export function withStaticRowProps(
	moduleGraphInterface: ModuleGraphInterfaceArtifact,
	input: PublicRenderModuleInput,
): ModuleGraphInterfaceArtifact {
	const byComponent = new Map(
		moduleGraphInterface.render.components.map((component) => [
			component.componentName,
			[...staticRowProps(input, component.componentName)],
		]),
	);
	if (![...byComponent.values()].some((props) => props.length > 0)) return moduleGraphInterface;
	return {
		...moduleGraphInterface,
		render: {
			...moduleGraphInterface.render,
			components: moduleGraphInterface.render.components.map((component) => {
				const props = byComponent.get(component.componentName) ?? [];
				return props.length > 0 ? { ...component, staticRowProps: props } : component;
			}),
		},
	};
}
