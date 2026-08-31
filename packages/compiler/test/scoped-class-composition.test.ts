import { expect, test } from 'vitest';
import { buildSemanticGraph } from '../src/passes/semantic-graph/index.ts';

/**
 * A scoped `<style>` block rewrites every selector to `.foo.mk-xxx`, so a rule
 * only matches an element that actually carries the scope class. Nothing pinned
 * that elements carry it, and a dynamic `class` never got it: the served HTML
 * was unscoped and the first toggle stripped the scope from the ones that had it.
 */

const SCOPED = `import { state } from '@markless/core';
export function Box({ cls }) @{
	let on = state(false);
	<div>
		<style>
			.box { color: red; }
			.lit { color: blue; }
		</style>
		<p class="box">static</p>
		<p class={on ? 'box lit' : 'box'}>dynamic</p>
		<p class={cls}>prop</p>
		<p>plain</p>
		<button onClick={() => { on = !on; }}>t</button>
	</div>
}`;

const UNSCOPED = SCOPED.replace(/\t*<style>[\s\S]*?<\/style>\n/, '');

/**
 * A class written on a component call-site lands in the DOM through the child's
 * own rest spread, so without the scope class the caller's own `<style>` cannot
 * match the element it just named.
 */
const CALL_SITES = `import { state } from '@markless/core';
import * as accordion from '@markless/ui/accordion';

export function Page({ cls }) @{
	let on = state(false);
	<div>
		<style>
			.card { color: red; }
		</style>
		<accordion.item class="card">a</accordion.item>
		<accordion.item class={cls}>b</accordion.item>
		<accordion.item value="one">c</accordion.item>
		<button onClick={() => { on = !on; }}>t</button>
	</div>
}`;

const UNSCOPED_CALL_SITES = CALL_SITES.replace(/\t*<style>[\s\S]*?<\/style>\n/, '');

async function callSiteClassProps(source: string) {
	const graph = await buildSemanticGraph({ filename: 'src/Page.tsrx', source });
	const scope = /mk-[a-z0-9]+/.exec(
		graph.markup.chunks.find((chunk) => chunk.id === 'template:Page')?.statics.join('') ?? '',
	)?.[0];
	return {
		scope,
		props: graph.componentEdges.map((edge) =>
			edge.props.find((prop) => prop.name === 'class'),
		),
		computeds: graph.graphBindings.filter((binding) =>
			binding.id.startsWith('computed:templateExpression:'),
		),
	};
}

async function statics(source: string, filename = 'src/Box.tsrx'): Promise<string> {
	const graph = await buildSemanticGraph({ filename, source });
	return graph.markup.chunks.find((chunk) => chunk.id === 'template:Box')?.statics.join('§') ?? '';
}

async function classTargets(source: string, filename = 'src/Box.tsrx') {
	const graph = await buildSemanticGraph({ filename, source });
	return graph.templateReads.flatMap((read) => (read.target?.kind === 'class' ? [read.target] : []));
}

test('every element of a scoped module carries the scope class, dynamic class included', async () => {
	const text = await statics(SCOPED);
	const scope = /mk-[a-z0-9]+/.exec(text)?.[0];
	expect(scope).toBeDefined();

	// Static literal: the scope joins the authored value.
	expect(text).toContain(`<p class="box ${scope}">static</p>`);
	// No class at all: the fallback writes the scope on its own.
	expect(text).toContain(`<p class="${scope}">plain</p>`);
	expect(text).toContain(`<button class="${scope}">t</button>`);
	// Dynamic: the name and quotes stay in the statics and the scope rides after
	// the slot, so the expression composes with the constant.
	expect(text).toContain(`<p class="§ ${scope}">dynamic</p>`);
	expect(text).toContain(`<p class="§ ${scope}">prop</p>`);
	// No element is left unscoped.
	expect(text.match(/<(?:p|div|button)(?![^>]*class=)/g)).toBeNull();
});

test('a scoped class toggle carries the scope in both arms of its dom update', async () => {
	const targets = await classTargets(SCOPED);
	const scope = /mk-[a-z0-9]+/.exec(await statics(SCOPED))?.[0];

	expect(targets).toContainEqual({
		kind: 'class',
		trueValue: `box lit ${scope}`,
		falseValue: `box ${scope}`,
	});
});

test('a dynamic class that is not a two-literal conditional carries the scope as a constant', async () => {
	const targets = await classTargets(SCOPED);
	const scope = /mk-[a-z0-9]+/.exec(await statics(SCOPED))?.[0];

	expect(targets).toContainEqual({ kind: 'class', constantClass: scope });
});

test('a class prop on a component call-site carries the calling module scope', async () => {
	const { scope, props, computeds } = await callSiteClassProps(CALL_SITES);
	expect(scope).toBeDefined();

	// Static: composed at build time, exactly as a host element's class is.
	expect(props[0]).toMatchObject({ kind: 'serializable', value: `card ${scope}` });
	// Dynamic: the value is only known at runtime, so the scope rides in a
	// computed of its own - the edge carries no constant beside a graph read.
	expect(props[1]).toMatchObject({ kind: 'graph-reference', graphBindingKind: 'computed' });
	expect(computeds).toHaveLength(1);
	expect(computeds[0]?.functionSource).toContain(scope);
	expect(computeds[0]?.dependencies).toContainEqual({
		source: 'cls',
		graphNodeId: 'prop:props',
		path: ['cls'],
	});
	// A call-site that wrote no class gets none synthesized.
	expect(props[2]).toBeUndefined();
});

test('a module with no style block leaves its call-site class props alone', async () => {
	const { scope, props, computeds } = await callSiteClassProps(UNSCOPED_CALL_SITES);

	expect(scope).toBeUndefined();
	expect(props[0]).toMatchObject({ kind: 'serializable', value: 'card', source: '"card"' });
	expect(props[1]).toMatchObject({
		kind: 'graph-reference',
		graphNodeId: 'prop:props',
		path: ['cls'],
	});
	expect(computeds).toHaveLength(0);
	expect(props[2]).toBeUndefined();
});

test('a module with no style block emits the same class bytes it always did', async () => {
	const text = await statics(UNSCOPED);

	expect(text).not.toContain('mk-');
	expect(text).toContain('<p class="box">static</p>');
	expect(text).toContain('<p>plain</p>');
	expect(text).toContain('<p class="§">dynamic</p>');

	const targets = await classTargets(UNSCOPED);
	expect(targets).toContainEqual({
		kind: 'class',
		trueValue: 'box lit',
		falseValue: 'box',
	});
	// No scope to keep, so the plain target stays the bare shape it always was.
	expect(targets).toContainEqual({ kind: 'class' });
	expect(targets.some((target) => 'constantClass' in target)).toBe(false);
});
