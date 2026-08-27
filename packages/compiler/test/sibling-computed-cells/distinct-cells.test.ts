import { expect, test } from 'vitest';
import { compileModule, emitted, errorCodes, idOf } from './support.ts';

/**
 * A component-local cell's graph node id is a serialized wire key. Two components
 * in one module declaring the same local name have to mint DIFFERENT keys, or the
 * later formula answers for both at runtime. Qualifying costs emitted bytes, so it
 * happens only where the collision is real: a module with no second declarer of
 * the name keeps the bare `kind:name` key it has always emitted.
 */

const COLLIDING = `
import { computed, element, state } from '@markless/core';

function Back() @{
	const s = state({ tick: 0 });
	const boxEl = element<HTMLDivElement>();
	const isOff = computed(() => {
		const at = s.tick;
		return at <= 0;
	});

	<div data-back={isOff} el={boxEl}>back</div>
}

export default function Forward() @{
	const s = state({ tick: 0, total: 3 });
	const boxEl = element<HTMLDivElement>();
	const isOff = computed(() => {
		const at = s.tick;
		const total = s.total;
		return at >= total - 1;
	});

	<section data-forward={isOff}>
		<div el={boxEl}>forward</div>
		<Back />
	</section>
}
`;

const UNCOLLIDING = `
import { computed, element, state } from '@markless/core';

function Back() @{
	const backCount = state({ tick: 0 });
	const backEl = element<HTMLDivElement>();
	const isBackOff = computed(() => {
		const at = backCount.tick;
		return at <= 0;
	});

	<div data-back={isBackOff} el={backEl}>back</div>
}

export default function Forward() @{
	const forwardCount = state({ tick: 0, total: 3 });
	const forwardEl = element<HTMLDivElement>();
	const isForwardOff = computed(() => {
		const at = forwardCount.tick;
		const total = forwardCount.total;
		return at >= total - 1;
	});

	<section data-forward={isForwardOff}>
		<div el={forwardEl}>forward</div>
		<Back />
	</section>
}
`;

test('same-named sibling cells mint distinct graph node ids', async () => {
	const compiled = await compileModule('src/Colliding.tsrx', COLLIDING);

	expect(errorCodes(compiled)).toEqual([]);
	expect(idOf(compiled, 'Back', 'isOff')).not.toBe(idOf(compiled, 'Forward', 'isOff'));
	expect(idOf(compiled, 'Back', 's')).not.toBe(idOf(compiled, 'Forward', 's'));
	expect(idOf(compiled, 'Back', 'boxEl')).not.toBe(idOf(compiled, 'Forward', 'boxEl'));
});

test('the qualified id names the declaring component after the kind prefix', async () => {
	const compiled = await compileModule('src/Colliding.tsrx', COLLIDING);

	expect(idOf(compiled, 'Back', 'isOff')).toBe('computed:Back.isOff');
	expect(idOf(compiled, 'Forward', 'isOff')).toBe('computed:Forward.isOff');
	expect(idOf(compiled, 'Back', 's')).toBe('state:Back.s');
	expect(idOf(compiled, 'Back', 'boxEl')).toBe('element:Back.boxEl');
});

test('each sibling cell carries its own formula into the emitted bytes', async () => {
	const compiled = await compileModule('src/Colliding.tsrx', COLLIDING);
	const source = emitted(compiled);

	expect(source).toContain('"computed:Back.isOff"');
	expect(source).toContain('"computed:Forward.isOff"');
	expect(source).not.toContain('"computed:isOff"');
});

test('a name only one component declares keeps its bare wire key', async () => {
	const compiled = await compileModule('src/Uncolliding.tsrx', UNCOLLIDING);

	expect(errorCodes(compiled)).toEqual([]);
	expect(idOf(compiled, 'Back', 'isBackOff')).toBe('computed:isBackOff');
	expect(idOf(compiled, 'Forward', 'isForwardOff')).toBe('computed:isForwardOff');
	expect(idOf(compiled, 'Back', 'backCount')).toBe('state:backCount');
	expect(idOf(compiled, 'Back', 'backEl')).toBe('element:backEl');
	expect(emitted(compiled)).not.toContain('computed:Back.');
});

test('a module with one component is untouched', async () => {
	const compiled = await compileModule(
		'src/Single.tsrx',
		`
import { computed, state } from '@markless/core';

export default function Only() @{
	const s = state({ tick: 0 });
	const isOff = computed(() => {
		const at = s.tick;
		return at <= 0;
	});

	<div data-only={isOff}>only</div>
}
`,
	);

	expect(errorCodes(compiled)).toEqual([]);
	expect(idOf(compiled, 'Only', 'isOff')).toBe('computed:isOff');
	expect(idOf(compiled, 'Only', 's')).toBe('state:s');
});

test('only the colliding name is qualified, not its whole component', async () => {
	const compiled = await compileModule(
		'src/Mixed.tsrx',
		`
import { computed, state } from '@markless/core';

function Back() @{
	const shared = state({ tick: 0 });
	const backOnly = state({ beat: 0 });
	const label = computed(() => {
		const at = shared.tick;
		return \`back \${at}\`;
	});

	<div data-back={label} data-beat={backOnly.beat}>back</div>
}

export default function Forward() @{
	const shared = state({ tick: 1 });
	const forwardOnly = state({ beat: 1 });
	const caption = computed(() => {
		const at = shared.tick;
		return \`forward \${at}\`;
	});

	<section data-forward={caption} data-beat={forwardOnly.beat}>
		<Back />
	</section>
}
`,
	);

	expect(errorCodes(compiled)).toEqual([]);
	expect(idOf(compiled, 'Back', 'shared')).toBe('state:Back.shared');
	expect(idOf(compiled, 'Forward', 'shared')).toBe('state:Forward.shared');
	expect(idOf(compiled, 'Back', 'backOnly')).toBe('state:backOnly');
	expect(idOf(compiled, 'Forward', 'forwardOnly')).toBe('state:forwardOnly');
	expect(idOf(compiled, 'Back', 'label')).toBe('computed:label');
	expect(idOf(compiled, 'Forward', 'caption')).toBe('computed:caption');
});

test('a colliding name in one kind does not qualify the other kind', async () => {
	const compiled = await compileModule(
		'src/CrossKind.tsrx',
		`
import { computed, state } from '@markless/core';

function Back() @{
	const gate = state({ tick: 0 });

	<div data-back={gate.tick}>back</div>
}

export default function Forward() @{
	const source = state({ tick: 1 });
	const gate = computed(() => {
		const at = source.tick;
		return at > 0;
	});

	<section data-forward={gate}>
		<Back />
	</section>
}
`,
	);

	expect(errorCodes(compiled)).toEqual([]);
	expect(idOf(compiled, 'Back', 'gate')).toBe('state:gate');
	expect(idOf(compiled, 'Forward', 'gate')).toBe('computed:gate');
});

test('two compiles of the colliding module emit the same bytes', async () => {
	const first = await compileModule('src/Colliding.tsrx', COLLIDING);
	const second = await compileModule('src/Colliding.tsrx', COLLIDING);

	expect(emitted(second)).toBe(emitted(first));
});
