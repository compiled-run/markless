import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

const compile = (source: string) =>
	compileTsrxModule({ filename: 'src/Gate.tsrx', source, symbols: [] });

test('an async value read only inside attach on a @try element settles the block', async () => {
	const result = await compile(`
import { computed } from '@markless/core';
import { draw, loadPoints } from './data.ts';
export function Chart() @{
	const points = computed(async () => loadPoints());
	<main>@try {
		<div attach={(el) => draw(el, points)} onIdle={() => {}}></div>
	} @pending { <p>Loading</p> }</main>
}
`);
	expect(result.renderData.boundaries.map((boundary) => boundary.runnerGraphNodeId)).toEqual([
		'computed:points',
	]);
});

test('attach gating is structural across names, elements and member reads', async () => {
	const result = await compile(`
import { computed, state } from '@markless/core';
import { mount, fetchUnits } from './map.ts';
export function Fleet() @{
	let zoom = state(3);
	const fleet = computed(async () => fetchUnits());
	<section>@try {
		<figure>
			<button onClick={() => (zoom += 1)}>Zoom</button>
			<canvas attach={(canvas) => mount(canvas, fleet.units, zoom)} onVisible={() => {}} />
		</figure>
	} @pending { <span>Wait</span> }</section>
}
`);
	expect(result.renderData.boundaries.map((boundary) => boundary.runnerGraphNodeId)).toEqual([
		'computed:fleet',
	]);
});

test('attach in the @pending arm does not gate the block it waits for', async () => {
	const result = await compile(`
import { computed } from '@markless/core';
import { spin, load } from './data.ts';
export function Feed() @{
	const feed = computed(async () => load());
	<main>@try {
		<p>{feed.title}</p>
	} @pending { <div attach={(el) => spin(el, feed)} onIdle={() => {}}></div> }</main>
}
`);
	const [boundary] = result.renderData.boundaries;
	expect(boundary?.runnerGraphNodeId).toBe('computed:feed');
	expect(boundary?.reads.map((read) => read.graphNodeId)).toEqual(['computed:feed']);
});

test('attach reading only imports in a @try with no async value of its own builds clean', async () => {
	const result = await compile(`
import { mount } from './map.ts';
import Child from './Child.tsrx';
export function Plain() @{
	<main>@try {
		<div attach={(el) => mount(el)} onIdle={() => {}}><Child /></div>
	} @pending { <p>Loading</p> }</main>
}
`);
	expect(result.publicRenderPlan.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([]);
	expect(result.renderData.boundaries.map((boundary) => boundary.unresolvedSources)).toEqual([[]]);
});
