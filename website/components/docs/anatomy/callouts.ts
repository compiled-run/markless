import type { AnatomyScene } from './scenes.ts';

export function calloutsFor(family: string, scene: AnatomyScene) {
	const distinct = scene.shapes.filter((shape, index) =>
		scene.shapes.findIndex((candidate) => candidate.part === shape.part) === index,
	);
	const root = distinct.find((shape) => shape.part === 'root');
	const ordered = distinct.filter((shape) => shape.part !== 'root')
		.sort((a, b) => a.x + a.width / 2 - b.x - b.width / 2);
	const leftCount = Math.ceil(distinct.length / 2) - (root ? 1 : 0);
	const margins = [
		{ side: 'left', shapes: [...(root ? [root] : []), ...ordered.slice(0, leftCount)] },
		{ side: 'right', shapes: ordered.slice(leftCount) },
	];
	return margins.flatMap(({ side, shapes }) => shapes
		.sort((a, b) => {
			if (a.part === 'root') return -1;
			if (b.part === 'root') return 1;
			return a.y + a.height / 2 - b.y - b.height / 2;
		})
		.map((shape, index) => {
		const y = shapes.length === 1 ? 205 : 105 + index * 260 / (shapes.length - 1);
		const targetX = 160 + (shape.x + (side === 'right' ? shape.width : 0)) * .75;
		const targetY = 65 + (shape.y + (shape.part === 'root' ? 0 : shape.height / 2)) * .75;
		const x = side === 'left' ? 20 : 640;
		const startX = side === 'left' ? 155 : 635;
		const elbowX = side === 'left' ? 185 : 615;
		return {
			part: shape.part,
			name: `${family}.${shape.part}`,
			namespace: `${family}.`,
			size: `${shape.width} × ${shape.height}`,
			side, x, y, targetX, targetY,
			path: `M ${startX} ${y + 5} H ${elbowX} L ${targetX} ${targetY}`,
		};
	}));
}
