import type { AnatomyScene } from './scenes.ts';

export function layersFor(scene: AnatomyScene, levels?: readonly number[]) {
	const shapes = scene.shapes;
	const depths = new Map<number, number>();
	const depthOf = (index: number): number => {
		if (levels) return levels[index]!;
		const cached = depths.get(index);
		if (cached !== undefined) return cached;
		const shape = shapes[index]!;
		const containers = shapes.map((candidate, parent) => ({ candidate, parent }))
			.filter(({ candidate }) => candidate.width * candidate.height > shape.width * shape.height
				&& candidate.x <= shape.x && candidate.y <= shape.y
				&& candidate.x + candidate.width >= shape.x + shape.width
				&& candidate.y + candidate.height >= shape.y + shape.height)
			.sort((a, b) => a.candidate.width * a.candidate.height - b.candidate.width * b.candidate.height);
		const depth = shape.part === 'root' ? 0 : containers[0] ? depthOf(containers[0].parent) + 1 : 1;
		depths.set(index, depth);
		return depth;
	};
	const project = (x: number, y: number, depth: number) => ({ x: .88 * x - .38 * y, y: .22 * x + .55 * y - depth * 65 });
	const projected = shapes.map((shape, index) => {
		const depth = depthOf(index);
		const corners = [[shape.x, shape.y], [shape.x + shape.width, shape.y],
			[shape.x + shape.width, shape.y + shape.height], [shape.x, shape.y + shape.height]]
			.map(([x, y]) => project(x!, y!, depth));
		return { depth, corners };
	});
	const points = projected.flatMap((layer) => layer.corners);
	const minX = Math.min(...points.map((point) => point.x));
	const minY = Math.min(...points.map((point) => point.y));
	const width = Math.max(...points.map((point) => point.x)) - minX;
	const height = Math.max(...points.map((point) => point.y)) - minY;
	const scale = Math.min(420 / width, 305 / height);
	const x = 190 + (420 - width * scale) / 2 - minX * scale;
	const y = 80 + (305 - height * scale) / 2 - minY * scale;
	const flatLeft = Math.min(...shapes.map((shape) => shape.x));
	const flatTop = Math.min(...shapes.map((shape) => shape.y));
	const flatWidth = Math.max(...shapes.map((shape) => shape.x + shape.width)) - flatLeft;
	const flatHeight = Math.max(...shapes.map((shape) => shape.y + shape.height)) - flatTop;
	const flatScale = Math.min(420 / flatWidth, 305 / flatHeight);
	const flatX = 190 + (420 - flatWidth * flatScale) / 2 - flatLeft * flatScale;
	const flatY = 80 + (305 - flatHeight * flatScale) / 2 - flatTop * flatScale;
	return projected.map(({ depth, corners }) => {
		const fitted = corners.map((point) => ({ x: point.x * scale + x, y: point.y * scale + y }));
		return {
			depth,
			style: `--flat-scale: ${flatScale}; --flat-x: ${flatX}; --flat-y: ${flatY}; --layer-a: ${.88 * scale}; --layer-b: ${.22 * scale}; --layer-c: ${-.38 * scale}; --layer-d: ${.55 * scale}; --layer-x: ${x}; --layer-y: ${y - depth * 65 * scale}`,
			transform: `matrix(${.88 * scale} ${.22 * scale} ${-.38 * scale} ${.55 * scale} ${x} ${y - depth * 65 * scale})`,
			corners: fitted,
			topLeft: fitted[0]!,
			left: { x: (fitted[0]!.x + fitted[3]!.x) / 2, y: (fitted[0]!.y + fitted[3]!.y) / 2 },
			right: { x: (fitted[1]!.x + fitted[2]!.x) / 2, y: (fitted[1]!.y + fitted[2]!.y) / 2 },
		};
	});
}
