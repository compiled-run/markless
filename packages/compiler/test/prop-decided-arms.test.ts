import { describe, expect, test } from 'vitest';
import { buildSemanticGraphSync } from '../src/passes/semantic-graph/index.ts';
import { propDecidedArm, type KnownPropValue } from '../src/index.ts';

function graph(body: string, signature = '{ label, tone, mode }') {
	return buildSemanticGraphSync({
		filename: 'src/Card.tsrx',
		source: `import { computed, state } from '@markless/core';
import Badge from './badge.tsrx';
export default function Card(${signature}) @{
	let open = state(false);
	const loud = computed(() => open);
	${body}
}
`,
	});
}

const known =
	(props: Record<string, unknown>) =>
	(path: ReadonlyArray<string>): KnownPropValue => {
		let value: unknown = props;
		for (const key of path) value = (value as Record<string, unknown> | undefined)?.[key];
		return { known: true, value };
	};

describe('the semantic graph names the arm each component edge sits in', () => {
	test('an edge inside the @else arm, and one in a @switch case inside it', () => {
		const built = graph(`<div>
		@if (label) {
			<p>{label}</p>
		} @else {
			@switch (mode) {
				@case 'compact': { <Badge text="compact" /> }
				@default: { <Badge text="full" /> }
			}
		}
	</div>`);
		expect(built.componentEdges.map((edge) => edge.branchArms)).toEqual([
			[
				{ branchSiteId: 'branch-site:0', arm: 1 },
				{ branchSiteId: 'branch-site:1', arm: 0 },
			],
			[
				{ branchSiteId: 'branch-site:0', arm: 1 },
				{ branchSiteId: 'branch-site:1', arm: 1 },
			],
		]);
	});

	test('an edge outside every branch carries no arms', () => {
		expect(
			graph('<div><Badge text="always" /></div>').componentEdges[0]!.branchArms,
		).toBeUndefined();
	});
});

describe('a branch whose test reads only props and literals records it as a prop test', () => {
	test.each([
		['label', { kind: 'prop', path: ['label'] }],
		['!label', { kind: 'not', operand: { kind: 'prop', path: ['label'] } }],
		[
			"tone === 'loud' && label",
			{
				kind: 'logical',
				operator: '&&',
				left: {
					kind: 'compare',
					operator: '===',
					left: { kind: 'prop', path: ['tone'] },
					right: { kind: 'value', value: 'loud' },
				},
				right: { kind: 'prop', path: ['label'] },
			},
		],
	])('@if (%s)', (condition, propTest) => {
		const built = graph(`<div>@if (${condition}) { <Badge text="x" /> }</div>`);
		expect(built.branchSites[0]!.propTest).toEqual(propTest);
	});

	test('a member read through the props object', () => {
		const built = graph('<div>@if (props.tone) { <Badge text="x" /> }</div>', 'props');
		expect(built.branchSites[0]!.propTest).toEqual({ kind: 'prop', path: ['tone'] });
	});

	test.each([
		['state', 'open'],
		['a computed', 'loud'],
		['a prop mixed with state', 'label && open'],
		['a call', 'label.includes("x")'],
	])('a test reading %s has none', (_, condition) => {
		const built = graph(`<div>@if (${condition}) { <Badge text="x" /> }</div>`);
		expect(built.branchSites[0]!.propTest).toBeUndefined();
	});

	test('a prop with a destructuring default has none: the default stands in when the caller passes nothing', () => {
		const built = graph(
			'<div>@if (label) { <Badge text="x" /> }</div>',
			"{ label = 'fallback' }",
		);
		expect(built.branchSites[0]!.propTest).toBeUndefined();
	});
});

describe('the props one caller passes decide which arm it renders', () => {
	const site = (condition: string, signature?: string) =>
		graph(
			`<div>@if (${condition}) { <Badge text="a" /> } @else { <Badge text="b" /> }</div>`,
			signature,
		).branchSites[0]!;

	test('an absent prop picks the @else arm, a passed one the @if arm', () => {
		expect(propDecidedArm(site('label'), known({}))).toBe(1);
		expect(propDecidedArm(site('label'), known({ label: 'shown' }))).toBe(0);
		expect(propDecidedArm(site("tone !== 'quiet'"), known({ tone: 'quiet' }))).toBe(1);
	});

	test('a prop the caller passes without a build-time value decides nothing', () => {
		expect(propDecidedArm(site('label'), () => ({ known: false }))).toBeUndefined();
	});

	test('a @switch picks the matching case, else its default', () => {
		const built = graph(`<div>@switch (mode) {
			@case 'compact': { <Badge text="compact" /> }
			@case 'wide': { <Badge text="wide" /> }
			@default: { <Badge text="full" /> }
		}</div>`).branchSites[0]!;
		expect(propDecidedArm(built, known({ mode: 'wide' }))).toBe(1);
		expect(propDecidedArm(built, known({}))).toBe(2);
	});
});
