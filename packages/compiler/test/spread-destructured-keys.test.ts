import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

/**
 * A prop the part took out of its own parameters must not come back through the
 * spread of what is left. `({ value, recovery, children, ...rest })` means
 * `rest` is the props MINUS those three, so `<div {...rest}>` can never write
 * `value=`. Which names a spread may not write is compile-time knowledge, and
 * the emitted record is where it is stated: `renderSpreadAttributes` in
 * `packages/web/src/ssr-data/renderer.ts` skips every name in the slot's
 * `excludeNames`, and both modes reach it through the same `renderSsrData`
 * (SSR from the emitted module, CSR through `renderPrerenderDataSurface`). So a
 * compiler that puts the destructured names in `excludeNames` closes the leak
 * in both modes with no runtime code and no web change.
 */

type SpreadSlot = {
	readonly kind: 'spread-attributes';
	readonly excludeNames: ReadonlyArray<string>;
	readonly destructuredNames?: ReadonlyArray<string>;
};

async function spreadSlots(source: string): Promise<ReadonlyArray<SpreadSlot>> {
	const result = await compileTsrxModule({
		filename: '/parts/family.tsrx',
		source,
		symbols: [],
		importedModuleInterfaces: {},
	});
	return result.renderData.chunks
		.flatMap((chunk) => chunk.slots)
		.filter((slot): slot is typeof slot & SpreadSlot => slot.kind === 'spread-attributes');
}

// The qr-code root, reduced to the two things that matter: a signature that
// takes three names out of the props, and an element that spreads the rest.
const qrCodeRoot = `import { shared, state } from '@markless/core';
export const qrState = shared(() => {
	const qr = state({ value: '' });
	return { ...qr };
}, { scope: 'widget' });
export function Root({ value, recovery = 'medium', children, ...rest }) @{
	const qr = qrState();
	qr.value = value;
	<div {...rest} role="img">{children}</div>
}
`;

// The same structure with every name, tag and ordering changed: proof the
// exclusion is read off the signature rather than off these fixtures.
const progressRoot = `import { shared, state } from '@markless/core';
export const barState = shared(() => {
	const bar = state({ amount: 0 });
	return { ...bar };
}, { scope: 'widget' });
export function Bar({ min, max, amount, kids, ...others }) @{
	const bar = barState();
	bar.amount = amount;
	<section {...others} aria-busy="false">{kids}</section>
}
`;

test('the signature reaches the emitted record, so a reader can tell what the spread may not write', async () => {
	const [slot] = await spreadSlots(qrCodeRoot);
	expect(slot, 'the element spread must emit one spread-attributes slot').toBeTruthy();
	// The element's own attribute is already excluded today; that is the channel
	// the destructured names have to join.
	expect(slot?.excludeNames).toContain('role');
	expect(slot?.destructuredNames).toEqual(['value', 'recovery', 'children']);
});

// --- the defect this unit was cut for ------------------------------------
//
// `destructuredNames` reached the emitted slot but nothing subtracted it: the
// renderer only consults `excludeNames`, so `<div {...rest} role="img">` served
// `value="otpauth://…secret…" recovery="quartile"` in both modes. The fix folds
// the destructured names into `excludeNames` at the one origin of this slot,
// `packages/compiler/src/passes/semantic-graph/collect-markup.ts` (the
// `spread-attributes` case); `passes/render-data/index.ts` hands
// `semanticGraph.markup.chunks` through untouched.

test('a destructured prop is excluded from the spread it was taken out of', async () => {
	const [slot] = await spreadSlots(qrCodeRoot);
	expect(slot?.excludeNames).toEqual(
		expect.arrayContaining(['role', 'value', 'recovery', 'children']),
	);
});

test('the exclusion is structural, not the qr-code names', async () => {
	const [slot] = await spreadSlots(progressRoot);
	expect(slot?.excludeNames).toEqual(
		expect.arrayContaining(['aria-busy', 'min', 'max', 'amount', 'kids']),
	);
});

// --- the contract the fix must not break ---------------------------------
//
// Only a spread OF THE REST BINDING carries consumer props. An object the
// author built themselves shadows nothing they did not write, so it must keep
// every key - the same rule `collectSpreadEventShadowDiagnostics` already
// applies in `passes/semantic-graph/spread-event-guard.ts`.

test('a spread of the author own object keeps the names the signature destructured', async () => {
	const [slot] = await spreadSlots(`import { shared, state } from '@markless/core';
export const boxState = shared(() => {
	const box = state({ on: false });
	return { ...box };
}, { scope: 'widget' });
export function Root({ value, children, ...rest }) @{
	const box = boxState();
	const mine = { value: 'kept', title: 'kept' };
	<div {...mine} role="img">{children}</div>
}
`);
	expect(slot, 'the element spread must emit one spread-attributes slot').toBeTruthy();
	expect(slot?.excludeNames).not.toContain('value');
	expect(slot?.excludeNames).not.toContain('children');
});

test('a part that destructures nothing still spreads its whole props', async () => {
	const [slot] = await spreadSlots(`export function Path({ ...rest }) @{
	<path {...rest} />
}
`);
	expect(slot, 'the element spread must emit one spread-attributes slot').toBeTruthy();
	expect(slot?.excludeNames).toEqual([]);
});
