import type { PublicRenderPlanArtifact } from '../../artifacts.ts';
import { graphReadExpression } from './source-expressions.ts';

export function emitPublicStaticEvents(publicRenderPlan: PublicRenderPlanArtifact): string {
	return `[${publicRenderPlan.staticEventControls
		.map(
			(event) =>
				`[${JSON.stringify(event.hostPath)},${JSON.stringify(event.eventName)},${JSON.stringify(event.symbolIds)}]`,
		)
		.join(',')}]`;
}

export function emitStaticTextSyncFunction(publicRenderPlan: PublicRenderPlanArtifact): string {
	const writes = publicRenderPlan.staticTextWrites.flatMap((write, index) => [
		`	const textTarget${index} = nodeAtPath(root, ${JSON.stringify(write.nodePath)});`,
		`	if (textTarget${index}) textTarget${index}.nodeValue = stringifyArcadePublicValue(${graphReadExpression(write.graphNodeId, write.path)});`,
	]);
	if (writes.length === 0) return '';

	return ['function syncArcadePublicStaticText(root, graph) {', ...writes, '}'].join('\n');
}
