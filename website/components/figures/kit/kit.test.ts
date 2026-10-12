import { renderToString, type SsrRenderable } from '@markless/core';
import { describe, expect, it } from 'vitest';
import * as A from './audit.ts';
import {
	cylinder,
	depthOf,
	extrude,
	fitProjection,
	iso,
	pathOf,
	SHADES,
	slabOf,
	towardViewer,
	type Plane,
	type Projection,
} from './iso-kit.ts';
import {
	BASE,
	BASE_TOP,
	HEIGHT,
	P,
	PAINT_ORDER,
	proofArt,
	recordProof,
	WIDTH,
} from './kit-proof.ts';
import KitProof from './kit-proof.tsrx';
import { lineInk } from './sketch.ts';

const UNIT: Projection = { origin: [0, 0], scale: 1 };
const close = (actual: readonly number[], expected: readonly number[]) =>
	actual.forEach((value, index) => expect(value).toBeCloseTo(expected[index]!, 6));

describe('projection', () => {
	it('maps the floor axes to the classic isometric diagonals', () => {
		const k = Math.sqrt(1.6);
		const s = Math.SQRT1_2;
		close(iso([0, 0, 0], UNIT), [0, 0]);
		close(iso([1, 0, 0], UNIT), [s * k, s * 0.5 * k]);
		close(iso([0, 1, 0], UNIT), [-s * k, s * 0.5 * k]);
		close(iso([0, 0, 1], UNIT), [0, -Math.cos(Math.PI / 6) * k]);
	});

	it('scales about the origin and honours a turned camera', () => {
		const moved: Projection = { origin: [100, 50], scale: 2 };
		const [x, y] = iso([3, 4, 5], UNIT);
		close(iso([3, 4, 5], moved), [100 + 2 * x, 50 + 2 * y]);
		close(towardViewer({ ...UNIT, azimuth: 0 }), [1, 0]);
		close(iso([0, 1, 0], { ...UNIT, azimuth: 90 }), [0, 0.5 * Math.sqrt(1.6)]);
	});

	it('fits every extreme point inside the padded viewBox', () => {
		const points = [
			[0, 0, 0],
			[BASE.w, BASE.d, 0],
			[BASE.w, 0, 44],
			[0, BASE.d, 44],
		] as const;
		const fit = fitProjection(
			points.map((point) => [...point]),
			WIDTH,
			HEIGHT,
			{ pad: 30 },
		);
		for (const point of points) {
			const [x, y] = iso([...point], fit);
			expect(x).toBeGreaterThanOrEqual(30 - 1e-6);
			expect(x).toBeLessThanOrEqual(WIDTH - 30 + 1e-6);
			expect(y).toBeGreaterThanOrEqual(30 - 1e-6);
			expect(y).toBeLessThanOrEqual(HEIGHT - 30 + 1e-6);
		}
	});

	it('rounds path coordinates to a tenth and never prints -0', () => {
		expect(
			pathOf(
				[
					[1.04, -0.04],
					[2.26, 3],
				],
				true,
			),
		).toBe('M1 0L2.3 3Z');
	});
});

describe('extrude tones', () => {
	const square: Plane[] = [
		[0, 0],
		[10, 0],
		[10, 10],
		[0, 10],
	];

	it('shades only the two sides that face the viewer, one per light bucket', () => {
		const paths = extrude(square, 0, 5, UNIT);
		expect(paths.shades).toHaveLength(SHADES);
		const filled = paths.shades
			.map((d, shade) => (d ? shade : -1))
			.filter((shade) => shade >= 0);
		expect(filled).toHaveLength(2);
		expect(paths.shades.join('').match(/M/g)).toHaveLength(2);
		expect(paths.top).toMatch(/Z$/);
		expect(paths.crease).not.toBe('');
		expect(paths.outline).not.toBe('');
	});

	it('flat slabs have no side faces and keep the bevel only when asked', () => {
		const flat = extrude(square, 0, 0, UNIT);
		expect(flat.shades.every((d) => d === '')).toBe(true);
		expect(extrude(square, 0, 5, UNIT).bevel).toBeUndefined();
		expect(extrude(square, 0, 5, UNIT, { bevel: 0.8 }).bevel).toMatch(/^M/);
	});

	it('spreads a cylinder across the light buckets', () => {
		const paths = cylinder(0, 0, 10, 0, 10, UNIT, 32);
		expect(paths.shades.filter(Boolean).length).toBeGreaterThanOrEqual(3);
	});

	it('gives the proof base slab a rounded hull fill and a bevel', () => {
		const base = slabOf(BASE, 0, BASE_TOP, P, 8, 0.8);
		expect(base.fill).toMatch(/^M.*Z$/);
		expect(base.bevel).toMatch(/^M/);
	});
});

describe('depth ordering', () => {
	it('puts nearer points later in painter order', () => {
		expect(depthOf([10, 10, 0], UNIT)).toBeGreaterThan(depthOf([0, 0, 0], UNIT));
		expect(depthOf([0, 0, 10], UNIT)).toBeGreaterThan(depthOf([0, 0, 0], UNIT));
		expect(depthOf([10, -10, 0], UNIT)).toBeCloseTo(depthOf([0, 0, 0], UNIT), 9);
	});

	it('settles the proof parts into the order the figure paints them', () => {
		const R = recordProof();
		R.items.reverse();
		A.settle(R, P);
		const order = [...R.items]
			.sort((a: { key: number }, b: { key: number }) => a.key - b.key)
			.map((item: { name: string }) => item.name);
		expect(order).toEqual(PAINT_ORDER);
	});
});

describe('audit', () => {
	it('passes on the proof geometry', () => {
		const R = recordProof();
		A.settle(R, P);
		const result = A.audit(R, P);
		expect(A.report(result)).not.toMatch(/fail/i);
		expect(A.failures(result)).toBe(0);
	});

	it('catches a post that floats above the base', () => {
		const R = recordProof();
		R.put({
			name: 'floating',
			at: [70, 10, 30],
			shapes: [R.solid(A.cylinder(70, 10, 4, BASE_TOP + 6, 10, { name: 'post.floating' }))],
		});
		A.settle(R, P);
		expect(A.failures(A.audit(R, P))).toBeGreaterThan(0);
	});
});

describe('proof figure', () => {
	it('freezes its paths into a plain-data module the compiler can read (run with -u after editing)', async () => {
		const module = `// Written by kit.test.ts from kit-proof.ts. Run \`vp test -u\` to refresh.
export const art = ${JSON.stringify(proofArt, null, '\t')};
`;
		await expect(module).toMatchFileSnapshot('./kit-proof.art.ts');
	});

	it('lays four inked solids straight on the page with the marker on the rod', async () => {
		// The compiled module is an SSR artifact; its editor type is the authored component.
		const html = await renderToString(KitProof as unknown as SsrRenderable);
		expect(html.match(/<g class="iso-solid[ "]/g)).toHaveLength(4);
		expect(html.match(/data-lit="true"/g)).toHaveLength(1);
		expect(html).toContain('<svg class="iso-svg');
		expect(html).toContain('viewBox="0 0 640 340"');
		expect(html).toContain('<figure class="iso-sheet');
		expect(html.match(/class="iso-marker[ "]/g)).toHaveLength(1);
		expect(html.match(/class="iso-pencil[ "]/g)).toHaveLength(1);
		expect(html).toContain(lineInk(proofArt.coil.front));
	});
});
