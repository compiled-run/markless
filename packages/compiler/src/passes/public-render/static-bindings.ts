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
	const writes = publicRenderPlan.staticTextWrites.flatMap((write, index) => {
		const value = `stringifyMarklessPublicValue(${graphReadExpression(write.graphNodeId, write.path)})`;
		return [
			`	const textTarget${index} = nodeAtPath(root, ${JSON.stringify(write.nodePath)});`,
			write.prefix !== undefined || write.suffix !== undefined
				? `	if (textTarget${index}) textTarget${index}.textContent = ${JSON.stringify(write.prefix ?? '')} + ${value} + ${JSON.stringify(write.suffix ?? '')};`
				: `	if (textTarget${index}) textTarget${index}.nodeValue = ${value};`,
		];
	});
	if (writes.length === 0) return '';

	return ['function syncMarklessPublicStaticText(root, graph) {', ...writes, '}'].join('\n');
}
