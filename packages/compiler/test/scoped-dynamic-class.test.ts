import { expect, test } from 'vitest';
import { renderSsrData } from '../../web/src/ssr-data/renderer.ts';
import { compileTsrxModule } from '../src/index.ts';
import { compileTsrxModulesWithInterfaces } from './multi-module-compile-support.ts';

/**
 * A scoped module's `<style>` rewrites every selector to `.group.mk-xxx`, so a
 * rule only matches an element that carries the scope class. A static
 * `class="group"` gets it; a DYNAMIC `class={expr}` on a family part only got it
 * when the expression reduced to one synthetic computed. A `@for` row read
 * (`group.danger ? ... : ...`) never does, so the value crossed the edge bare and
 * the module's own rule silently missed the part it named.
 */

const FAMILY = `import { element, shared, state } from '@markless/core';
export const boxState = shared(() => {
	const box = state({ open: false });
	const boxEl = element();
	return { ...box, boxEl };
}, { scope: 'widget' });
export function Item({ children, ...rest }) @{
	const box = boxState();
	<div {...rest} el={box.boxEl} ui-open={box.open}>
		<style>
			@layer markless {
				div { border: 1px solid; }
			}
		</style>
		{children}
	</div>
}`;

const CONSUMER = `import { state } from '@markless/core';
import { Item } from './item.tsrx';
export function Page() @{
	let danger = state(false);
	let groups = state([
		{ id: 'a', danger: true, tone: 'warm' },
		{ id: 'b', danger: false, tone: 'cool' },
	]);
	<main>
		<style>
			.group { border-width: 2px; }
		</style>
		<div class={danger ? 'group is-danger' : 'group'}>host ternary</div>
		<div class={\`group \${danger ? 'is-danger' : 'is-calm'}\`}>host template</div>
		<Item class={danger ? 'group is-danger' : 'group'}>state ternary</Item>
		<Item class={\`group \${danger ? 'is-danger' : 'is-calm'}\`}>state template</Item>
		<div>
			@for (const group of groups; key group.id) {
				<div>
					<Item class={group.danger ? 'group is-danger' : 'group'}>row ternary</Item>
					<Item class={\`group \${group.tone}\`}>row template</Item>
				</div>
			}
		</div>
		<button onClick={() => { danger = !danger; }}>t</button>
	</main>
}`;

// The same structure with every name, tag and literal changed, so the
// composition is read off the shape rather than these fixtures.
const CONSUMER_ALTERNATE = `import { state } from '@markless/core';
import { Item } from './item.tsrx';
export function Board() @{
	let lit = state(true);
	let lamps = state([
		{ key: 'x', lit: false, hue: 'amber' },
		{ key: 'y', lit: true, hue: 'ice' },
	]);
	<section>
		<style>
			.lamp { outline-width: 3px; }
		</style>
		<ul>
			@for (const lamp of lamps; key lamp.key) {
				<li>
					<Item class={\`lamp \${lamp.hue}\`}>row template</Item>
					<Item class={lamp.lit ? 'lamp lamp-on' : 'lamp'}>row ternary</Item>
				</li>
			}
		</ul>
		<Item class={\`lamp \${lit ? 'lamp-on' : 'lamp-off'}\`}>state template</Item>
		<Item class={lit ? 'lamp lamp-on' : 'lamp'}>state ternary</Item>
		<p class={\`lamp \${lit ? 'lamp-on' : 'lamp-off'}\`}>host template</p>
		<p class={lit ? 'lamp lamp-on' : 'lamp'}>host ternary</p>
	</section>
}`;

type Compiled = Awaited<ReturnType<typeof compileTsrxModule>>;
type ClassProp = Compiled['semanticGraph']['componentEdges'][number]['props'][number];

function scopeOf(result: Compiled): string {
	const scope = result.publicRenderPlan.styleScopes[0]?.scopeId;
	expect(scope).toMatch(/^mk-/);
	return scope!;
}

function statics(result: Compiled, component: string): string {
	const chunks = result.renderData.chunks.filter((chunk) => chunk.componentName === component);
	return chunks.map((chunk) => chunk.statics.join('§')).join('\n');
}

function classProps(result: Compiled, component: string): ReadonlyArray<ClassProp | undefined> {
	return result.semanticGraph.componentEdges
		.filter((edge) => edge.parentComponentName === component)
		.map((edge) => edge.props.find((prop) => prop.name === 'class'));
}

/**
 * The string the edge hands the child for one class prop, evaluated the way the
 * renderer does: a literal is its value, a computed runs its function over the
 * reads it declares, and an authored expression runs in the row it was written
 * in. Whatever the kind, the scope must be inside the result.
 */
function evaluateClassProp(
	result: Compiled,
	prop: ClassProp | undefined,
	scopeVariables: Readonly<Record<string, unknown>>,
): string {
	expect(prop).toBeDefined();
	const names = Object.keys(scopeVariables);
	const values = names.map((name) => scopeVariables[name]);
	if (prop!.kind === 'serializable') return String(prop!.value);
	if (prop!.kind === 'graph-reference') {
		const computed = result.semanticGraph.graphBindings.find(
			(binding) => binding.id === prop!.graphNodeId,
		);
		expect(computed?.functionSource).toBeDefined();
		return String(new Function(...names, `return (${computed!.functionSource})();`)(...values));
	}
	expect(prop!.kind).toBe('opaque');
	return String(new Function(...names, `return (${prop!.source});`)(...values));
}

async function renderItem(family: Compiled, props: Readonly<Record<string, unknown>>) {
	const output = await renderSsrData({
		renderData: { ...family.renderData, root: { templateId: 'template:Item' } },
		read: (residue) => {
			if (residue.kind === 'graph-read' && residue.graphNodeId === 'prop:props') {
				let value: unknown = props;
				for (const key of residue.path) value = (value as Record<string, unknown>)?.[key];
				return value;
			}
			if (residue.kind === 'element-handle-id') return 'mx-test';
			return undefined;
		},
	});
	return output.html;
}

async function compilePair(consumer: string) {
	const [family, page] = await compileTsrxModulesWithInterfaces([
		{ filename: '/parts/item.tsrx', source: FAMILY, importSource: './item.tsrx' },
		{ filename: '/pages/page.tsrx', source: consumer },
	]);
	return { family: family!, page: page! };
}

test('a host element with a dynamic class keeps the scope in the statics and in its update', async () => {
	const { page } = await compilePair(CONSUMER);
	const scope = scopeOf(page);
	const text = statics(page, 'Page');
	expect(text).toContain(`<div class="§ ${scope}">host ternary</div>`);
	expect(text).toContain(`<div class="§ ${scope}">host template</div>`);

	const targets = page.semanticGraph.templateReads.flatMap((read) =>
		read.target?.kind === 'class' ? [read.target] : [],
	);
	expect(targets).toContainEqual({
		kind: 'class',
		trueValue: `group is-danger ${scope}`,
		falseValue: `group ${scope}`,
	});
	expect(targets).toContainEqual({ kind: 'class', constantClass: scope });
});

test('every dynamic class handed to a family part carries the consumer scope', async () => {
	const { family, page } = await compilePair(CONSUMER);
	const scope = scopeOf(page);
	const familyScope = scopeOf(family);
	const props = classProps(page, 'Page');
	expect(props).toHaveLength(4);

	const rendered: string[] = [];
	const cases: ReadonlyArray<readonly [Readonly<Record<string, unknown>>, string]> = [
		[{ danger: true }, 'group is-danger'],
		[{ danger: false }, 'group is-calm'],
		[{ group: { id: 'a', danger: true, tone: 'warm' } }, 'group is-danger'],
		[{ group: { id: 'b', danger: false, tone: 'cool' } }, 'group cool'],
	];
	for (const [index, [variables, expected]] of cases.entries()) {
		const value = evaluateClassProp(page, props[index], variables);
		expect(value, `edge ${index}`).toBe(`${expected} ${scope}`);
		rendered.push(await renderItem(family, { class: value, children: 'x' }));
	}
	// Rendered through the part's one class slot, both scopes sit on the element.
	for (const [index, html] of rendered.entries()) {
		expect(html.match(/ class="/g), `edge ${index}`).toHaveLength(1);
		expect(html, `edge ${index}`).toContain(`class="${familyScope} ${cases[index]![1]} ${scope}"`);
	}
});

test('the alternate-shaped consumer composes the same way', async () => {
	const { page } = await compilePair(CONSUMER_ALTERNATE);
	const scope = scopeOf(page);
	const props = classProps(page, 'Board');
	expect(props).toHaveLength(4);

	expect(evaluateClassProp(page, props[0], { lamp: { key: 'x', lit: false, hue: 'amber' } })).toBe(
		`lamp amber ${scope}`,
	);
	expect(evaluateClassProp(page, props[1], { lamp: { key: 'y', lit: true, hue: 'ice' } })).toBe(
		`lamp lamp-on ${scope}`,
	);
	expect(evaluateClassProp(page, props[2], { lit: false })).toBe(`lamp lamp-off ${scope}`);
	expect(evaluateClassProp(page, props[3], { lit: true })).toBe(`lamp lamp-on ${scope}`);

	const text = statics(page, 'Board');
	expect(text).toContain(`<p class="§ ${scope}">host template</p>`);
	expect(text).toContain(`<p class="§ ${scope}">host ternary</p>`);
});

test('an unscoped consumer hands the part exactly what it wrote', async () => {
	const unscoped = CONSUMER.replace(/\t*<style>[\s\S]*?<\/style>\n/, '');
	const { page } = await compilePair(unscoped);
	expect(page.publicRenderPlan.styleScopes).toHaveLength(0);
	const props = classProps(page, 'Page');
	expect(props).toHaveLength(4);
	expect(evaluateClassProp(page, props[0], { danger: true })).toBe('group is-danger');
	expect(evaluateClassProp(page, props[2], { group: { danger: false } })).toBe('group');
	expect(evaluateClassProp(page, props[3], { group: { tone: 'cool' } })).toBe('group cool');
	expect(props[2]).toMatchObject({ kind: 'opaque', source: "group.danger ? 'group is-danger' : 'group'" });
	expect(statics(page, 'Page')).not.toContain('mk-');
});
