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

test('a module with no style block emits the same class bytes it always did', async () => {
	const text = await statics(UNSCOPED);

	expect(text).not.toContain('mk-');
	expect(text).toContain('<p class="box">static</p>');
	expect(text).toContain('<p>plain</p>');
	expect(text).toContain('<p class="§">dynamic</p>');
	expect(await classTargets(UNSCOPED)).toContainEqual({
		kind: 'class',
		trueValue: 'box lit',
		falseValue: 'box',
	});
});
