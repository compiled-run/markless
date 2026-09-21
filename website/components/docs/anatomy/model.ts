import type { ManifestFamily } from '../api-derive/manifest.ts';
import type { AnatomyScene } from './scenes.ts';
import { calloutsFor } from './callouts.ts';
import { layersFor } from './layers.ts';
import { compositions, hierarchyFor, type AnatomyNode } from './hierarchy.ts';

export function deriveAnatomy(
	family: string,
	metadata: ManifestFamily,
	scene: AnatomyScene,
	order: readonly string[] = [],
) {
	const exported = new Map(metadata.parts.map((part) => [part.part, part]));
	for (const part of [...order, ...scene.shapes.map((shape) => shape.part), ...Object.keys(scene.descriptions ?? {})]) {
		if (!exported.has(part)) throw new Error(`Anatomy: ${family}.${part} is not an exported component part.`);
	}
	const remaining = metadata.parts.map((part) => part.part).filter((part) => !order.includes(part))
		.sort((a, b) => a === 'root' ? -1 : b === 'root' ? 1 : a.localeCompare(b));
	const parts = [...new Set([...order, ...remaining])].map((part, index) => {
		const declaration = exported.get(part)!;
		return {
			part,
			name: `${family}.${part}`,
			component: declaration.component,
			number: String(index + 1).padStart(2, '0'),
			description: scene.descriptions?.[part] ?? (declaration.doc ?? '')
				.replace(/\s+/g, ' ').replaceAll('`', '').replaceAll('**', '').trim()
				.split(/(?<=[.!?])\s+/)[0] ?? '',
		};
	});
	const hierarchy = compositions[family] ? hierarchyFor(family, scene) : undefined;
	const nodes: AnatomyNode[] = [];
	const collect = (node: AnatomyNode) => { nodes.push(node); node.children.forEach(collect); };
	if (hierarchy) collect(hierarchy);
	const layers = layersFor(scene, hierarchy ? scene.shapes.map((shape, index) =>
		(nodes.find((node) => node.shapeId === `${family}-${index}`) ?? nodes.find((node) => node.part === shape.part))!.level - 1,
	) : undefined);
	const shapes = scene.shapes.map((shape, index) => ({
		...shape,
		layerStyle: layers[index]!.style,
		id: `${family}-${index}`,
		selectionId: nodes.filter((node) => node.part === shape.part).length === 1
			? nodes.find((node) => node.part === shape.part)!.shapeId : `${family}-${index}`,
		radius: shape.kind === 'round' ? shape.height / 2 : 2,
		iconTransform: `translate(${shape.text ? shape.x + 6 : shape.x + shape.width / 2 - 12} ${shape.y + shape.height / 2 - 12})`,
		iconRotation: `rotate(${shape.icon === 'chevron-down' ? 90 : shape.icon === 'chevron-left' ? 180 : 0} 12 12)`,
		textX: shape.icon && shape.text ? shape.x + 34 : shape.x + shape.width / 2,
		textAnchor: shape.icon && shape.text ? 'start' : 'middle',
	}));
	const root = parts.find((part) => part.part === 'root');
	const rootShape = shapes.find((shape) => shape.part === 'root');
	if (!root || !rootShape) throw new Error(`Anatomy: ${family} needs its exported root and a root drawing.`);
	const callouts = calloutsFor(family, scene).map((callout) => {
		const layer = layers[shapes.findIndex((shape) => shape.part === callout.part)]!;
		const target = callout.side === 'left' ? layer.left : layer.right;
		const startX = callout.side === 'left' ? 155 : 635;
		const startY = callout.y + 5;
		return { ...callout,
			guideTransform: `translate(${startX} ${startY})`,
			guideStyle: `--flat-x: ${callout.targetX - startX}; --flat-y: ${callout.targetY - startY}; --layer-x: ${target.x - startX}; --layer-y: ${target.y - startY}`,
		};
	});
	return {
		parts, shapes, root, rootShape, callouts, hierarchy,
		supporting: parts.filter((part) => !shapes.some((shape) => shape.part === part.part)),
		diagramLabel: scene.caption + ' Parts: ' + parts.map((part) => part.name).join(', ') + '.',
	};
}
