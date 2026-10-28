import type { RenderDataArtifact } from '../../artifacts.ts';

// Markup the browser builds from these chunks carries property-only attributes, so the step that moves them onto properties comes with it.
export function propertySeedImport(renderData: Pick<RenderDataArtifact, 'chunks'>): string {
	return renderData.chunks.some((chunk) => chunk.propertyMembers)
		? "import { installMarklessPropertySeeds } from '@markless/web/fns/property-seeds';\ninstallMarklessPropertySeeds();\n"
		: '';
}
