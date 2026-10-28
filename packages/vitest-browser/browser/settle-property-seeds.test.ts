import { expect, test } from 'vitest';
import { marklessApplySettlePlan, type SettlePlanBoundary } from '../../web/src/fns/settle-plan.ts';
import {
	SETTLE_TEMPLATE_PROPERTY_SEEDS_SOURCE,
	templatePropertySeeds,
} from '../../web/src/served-property-seeds.ts';

// The prerendered settle path fills an arm from build-time templates with no resume code loaded.
// Members with no live attribute, constant or filled from the settled value, hold once it lands.
const ARM =
	'<section><label><input data-all type="checkbox" indeterminate="">All mail</label><!--mh:0--><audio data-chime></audio><ul><!--mh:1--></ul></section>';
const ROW =
	'<li><!--mh:2--><div data-pane style="height: 20px; overflow: auto"><div style="height: 200px"><!--mh:3--></div></div></li>';
const EMPTY = '<li data-empty><input type="checkbox" indeterminate="">No mail</li>';

const plan: SettlePlanBoundary = {
	id: 'boundary:0',
	arm: 'try',
	holes: [{ coordinate: 0, kind: 'attribute', name: 'volume', from: ['level'] }],
	repeat: {
		id: 'repeat:0',
		coordinate: 1,
		from: ['mails'],
		holes: [
			{ coordinate: 2, kind: 'attribute', name: 'scrollTop', from: ['offset'] },
			{ coordinate: 3, kind: 'text', from: ['subject'] },
		],
		emptyHoles: [],
	},
};

function mount(): { readonly host: HTMLElement; readonly settle: (value: unknown) => void } {
	const host = document.createElement('div');
	document.body.appendChild(host);
	host.innerHTML = `<main><!--markless:async:boundary:0--><p data-loading>Loading mail</p><!--/markless:async:boundary:0--></main><template m:arm="boundary:0">${ARM}</template><template m:row="boundary:0">${ROW}</template><template m:empty="boundary:0">${EMPTY}</template>`;
	const seeds = (
		[
			['arm', templatePropertySeeds(ARM, plan.holes)],
			['row', templatePropertySeeds(ROW, plan.repeat!.holes)],
			['empty', templatePropertySeeds(EMPTY, [])],
		] as const
	).filter(([, list]) => list.length > 0);
	new Function(
		`(${SETTLE_TEMPLATE_PROPERTY_SEEDS_SOURCE})("boundary:0",${JSON.stringify(seeds)})`,
	)();
	const main = host.querySelector('main')!;
	const anchors = [...main.childNodes].filter((node) => node.nodeType === 8) as [
		Comment,
		Comment,
	];
	const template = (kind: string) =>
		host.querySelector<HTMLTemplateElement>(`template[m\\:${kind}="boundary:0"]`)!;
	return {
		host,
		settle: (value) =>
			marklessApplySettlePlan({
				plan,
				templates: { arm: template('arm'), row: template('row'), empty: template('empty') },
				value,
				anchors,
			}),
	};
}

test('a settled template arm sets its constant and filled property-only members, with no resume code', async () => {
	const { host, settle } = mount();
	try {
		settle({
			level: 0.25,
			mails: [
				{ subject: 'Hello', offset: 60 },
				{ subject: 'Lunch?', offset: 0 },
			],
		});
		const all = host.querySelector<HTMLInputElement>('[data-all]')!;
		const chime = host.querySelector<HTMLAudioElement>('[data-chime]')!;
		const panes = [...host.querySelectorAll<HTMLElement>('[data-pane]')];
		await expect
			.poll(() => [all.indeterminate, chime.volume, panes.map((pane) => pane.scrollTop)])
			.toEqual([true, 0.25, [60, 0]]);
		expect(host.querySelector('main')!.innerHTML).not.toMatch(
			/\s(?:indeterminate|volume|scrolltop)[=\s>]/i,
		);
		expect(
			(globalThis as { __marklessPropertySeeds?: unknown }).__marklessPropertySeeds,
		).toBeUndefined();
	} finally {
		host.remove();
	}
});

test('the empty arm of a settled template carries its mixed checkbox too', async () => {
	const { host, settle } = mount();
	try {
		settle({ level: 1, mails: [] });
		await expect
			.poll(() => host.querySelector<HTMLInputElement>('[data-empty] input')?.indeterminate)
			.toBe(true);
	} finally {
		host.remove();
	}
});
