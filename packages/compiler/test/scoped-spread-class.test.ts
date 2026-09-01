import { expect, test } from 'vitest';
import { renderSsrData } from '../../web/src/ssr-data/renderer.ts';
import { compileTsrxModule } from '../src/index.ts';
import { compileTsrxModulesWithInterfaces } from './multi-module-compile-support.ts';

/**
 * A family part's `<style>` compiles against the family MODULE's scope class,
 * and the part writes that class on its element. A consumer's `class="x"`
 * reaches the same element through the part's rest spread, carrying the
 * CONSUMER module's scope class. Emitted as two `class` attributes, HTML keeps
 * the first and the family's layered defaults never match the part. The spread
 * must leave `class` to one slot that composes the family scope beside whatever
 * the consumer passed, so both modules' scoped rules match the one element.
 */

const FAMILY = `import { element, shared, state } from '@markless/core';
export const tipState = shared(() => {
	const tip = state({ open: false });
	const triggerEl = element();
	return { ...tip, triggerEl };
}, { scope: 'widget' });
export function Trigger({ children, ...rest }) @{
	const tip = tipState();
	<button {...rest} el={tip.triggerEl} type="button" ui-open={tip.open}>
		<style>
			@layer markless {
				button { anchor-name: --ui-tip; }
			}
		</style>
		{children}
	</button>
}`;

// The same structure with every name, tag and attribute order changed, so the
// composition is read off the spread and the scope rather than these fixtures.
const FAMILY_ALTERNATE = `import { element, shared, state } from '@markless/core';
export const lampState = shared(() => {
	const lamp = state({ lit: true });
	const bulbEl = element();
	return { ...lamp, bulbEl };
}, { scope: 'widget' });
export function Bulb({ kids, ...others }) @{
	const lamp = lampState();
	<span role="status" ui-lit={lamp.lit} el={lamp.bulbEl} {...others}>
		{kids}
		<style>
			@layer markless {
				span { position: relative; }
			}
		</style>
	</span>
}`;

const CONSUMER = `import { Trigger } from './tip.tsrx';
export function Page() @{
	<main>
		<style>
			.pg-dot { border-radius: 50%; }
		</style>
		<Trigger class="pg-dot">Save</Trigger>
	</main>
}`;

type AttributeSlot = {
	readonly kind: 'attribute';
	readonly name: string;
	readonly residue: unknown;
	readonly alwaysPresent?: true;
};
type SpreadSlot = { readonly kind: 'spread-attributes'; readonly excludeNames: ReadonlyArray<string> };

async function compile(source: string, filename: string) {
	return compileTsrxModule({ filename, source, symbols: [], importedModuleInterfaces: {} });
}

function templateChunk(result: Awaited<ReturnType<typeof compile>>, component: string) {
	const chunk = result.renderData.chunks.find((candidate) => candidate.id === `template:${component}`);
	expect(chunk).toBeDefined();
	return chunk!;
}

function scopeOf(result: Awaited<ReturnType<typeof compile>>): string {
	const scope = result.publicRenderPlan.styleScopes[0]?.scopeId;
	expect(scope).toMatch(/^mk-/);
	return scope!;
}

// Renders one part's template through the same renderer SSR and CSR share,
// with the props a consumer's call site would hand it.
async function renderPart(
	result: Awaited<ReturnType<typeof compile>>,
	component: string,
	props: Readonly<Record<string, unknown>>,
): Promise<string> {
	const output = await renderSsrData({
		renderData: { ...result.renderData, root: { templateId: `template:${component}` } },
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

test('a scoped part leaves class to one slot that composes the family scope after the consumer class', async () => {
	const result = await compile(FAMILY, '/parts/tip.tsrx');
	const scope = scopeOf(result);
	const chunk = templateChunk(result, 'Trigger');

	const spread = chunk.slots.find((slot): slot is typeof slot & SpreadSlot => slot.kind === 'spread-attributes');
	expect(spread?.excludeNames).toContain('class');

	const classSlot = chunk.slots.find(
		(slot): slot is typeof slot & AttributeSlot => slot.kind === 'attribute' && slot.name === 'class',
	);
	expect(classSlot).toMatchObject({
		alwaysPresent: true,
		residue: { kind: 'graph-read', graphNodeId: 'prop:props', path: ['class'] },
	});
	// The scope rides the statics: the family class is written whether or not
	// the consumer passed one, and only one class attribute exists.
	const text = chunk.statics.join('§');
	expect(text).toContain(`class="${scope} §"`);
	expect(text.match(/ class="/g)).toHaveLength(1);
});

test('the alternate-shaped part composes the same way', async () => {
	const result = await compile(FAMILY_ALTERNATE, '/parts/lamp.tsrx');
	const scope = scopeOf(result);
	const chunk = templateChunk(result, 'Bulb');

	const spread = chunk.slots.find((slot): slot is typeof slot & SpreadSlot => slot.kind === 'spread-attributes');
	expect(spread?.excludeNames).toContain('class');
	const classSlot = chunk.slots.find(
		(slot): slot is typeof slot & AttributeSlot => slot.kind === 'attribute' && slot.name === 'class',
	);
	expect(classSlot).toMatchObject({
		alwaysPresent: true,
		residue: { kind: 'graph-read', graphNodeId: 'prop:props', path: ['class'] },
	});
	const text = chunk.statics.join('§');
	expect(text).toContain(`class="${scope} §"`);
	expect(text.match(/ class="/g)).toHaveLength(1);
});

test('rendered, a part handed a consumer class carries both scope classes in one attribute', async () => {
	const [family, consumer] = await compileTsrxModulesWithInterfaces([
		{ filename: '/parts/tip.tsrx', source: FAMILY, importSource: './tip.tsrx' },
		{ filename: '/pages/page.tsrx', source: CONSUMER },
	]);
	const familyScope = scopeOf(family!);
	const consumerScope = scopeOf(consumer!);
	expect(familyScope).not.toBe(consumerScope);

	// What the consumer's call site hands the part: its class already carries
	// the consumer's own scope (pinned in scoped-class-composition).
	const edge = consumer!.semanticGraph.componentEdges[0];
	const classProp = edge?.props.find((prop) => prop.name === 'class');
	expect(classProp).toMatchObject({ kind: 'serializable', value: `pg-dot ${consumerScope}` });

	const html = await renderPart(family!, 'Trigger', { class: `pg-dot ${consumerScope}`, children: 'Save' });
	expect(html.match(/ class="/g)).toHaveLength(1);
	expect(html).toContain(`class="${familyScope} pg-dot ${consumerScope}"`);
	// The family's scoped selector `button.mk-…` and the consumer's `.pg-dot.mk-…`
	// now both name this element.
	expect(family!.publicRenderPlan.styleScopes[0]?.cssText).toContain(`button.${familyScope}`);
	expect(consumer!.publicRenderPlan.styleScopes[0]?.cssText).toContain(`.pg-dot.${consumerScope}`);
});

test('rendered without a consumer class, the part still carries the family scope class once', async () => {
	const result = await compile(FAMILY, '/parts/tip.tsrx');
	const scope = scopeOf(result);
	const html = await renderPart(result, 'Trigger', { children: 'Save' });
	expect(html.match(/ class="/g)).toHaveLength(1);
	expect(html).toContain(`class="${scope} "`);
	expect(html).toContain('type="button"');
});

test('an unscoped part leaves its spread alone', async () => {
	const result = await compile(FAMILY.replace(/\t*<style>[\s\S]*?<\/style>\n/, ''), '/parts/tip.tsrx');
	const chunk = templateChunk(result, 'Trigger');
	const spread = chunk.slots.find((slot): slot is typeof slot & SpreadSlot => slot.kind === 'spread-attributes');
	expect(spread?.excludeNames).not.toContain('class');
	expect(chunk.slots.some((slot) => slot.kind === 'attribute' && slot.name === 'class')).toBe(false);
	expect(chunk.statics.join('')).not.toContain('class=');
});
