import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stringify } from 'yaml';

/** One person's action between two looks at the screen. Every target is a visible text or an accessible name. */
export type LadderAction =
	| { readonly tap: string }
	| {
			readonly type: {
				readonly field: string;
				readonly text: string;
				/** Leave the keyboard up afterwards, so the screenshot after the step shows what it covers. */
				readonly keepKeyboard?: true;
			};
	  }
	| { readonly relaunch: true }
	| { readonly wait: number }
	/**
	 * Close the open system sheet the platform's way: `swipe` pulls it down; `back` is Android's back gesture (an edge
	 * swipe). iOS has no back for a sheet, so there `back` is the pull down too; on the web both are Escape, the
	 * browser's close request.
	 */
	| { readonly dismiss: 'swipe' | 'back' }
	/** Pull the open system sheet up to its next resting height. The web's dialog has none, so there it does nothing. */
	| { readonly swipe: 'up' }
	/** Scroll until this text is on screen. */
	| { readonly scrollTo: string };

/** What the screen shows after a step's action (or at launch, for the first step). */
export type LadderStep = {
	readonly do?: LadderAction;
	/** Texts or accessible names that are on screen. */
	readonly visible: readonly string[];
	/** Texts or accessible names that are not on screen. */
	readonly absent?: readonly string[];
	/** Controls, by text or accessible name, that are on screen and cannot be activated. */
	readonly disabled?: readonly string[];
	/** Texts that are on screen in this order, top to bottom. */
	readonly order?: readonly string[];
	/** Text fields, by accessible name, and the value each holds. */
	readonly fields?: Readonly<Record<string, string>>;
};

export type LadderRung = {
	readonly rung: number;
	readonly name: string;
	/** The route pattern App.tsrx is the page for, relative to the app root; the index route when absent. */
	readonly route?: string;
	/** The path the app opens at; `/` when absent. */
	readonly start?: string;
	readonly steps: readonly LadderStep[];
};

export const proofsDir = import.meta.dirname;

export const rungFolders = (): string[] =>
	readdirSync(proofsDir, { withFileTypes: true })
		.filter((entry) => entry.isDirectory() && /^(\d\d[a-z]?|y\d+)-/.test(entry.name))
		.map((entry) => entry.name)
		.sort();

export const readRung = (folder: string): LadderRung =>
	JSON.parse(readFileSync(join(proofsDir, folder, 'expected.json'), 'utf8')) as LadderRung;

// Maestro reads a selector's text as a regular expression over the whole label.
const selector = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The expectations of `step` that the previous step's screen contradicts. An action step needs at
 * least one, or a look taken before the action lands would pass; a relaunch is the exception, since
 * it ends only once the app is back.
 */
export function changeWitness(previous: LadderStep, step: LadderStep): LadderStep {
	const wasShown = new Set(previous.visible);
	const wasAbsent = new Set(previous.absent ?? []);
	const order = step.order?.join('\n') !== previous.order?.join('\n') ? step.order : undefined;
	const fields = Object.fromEntries(
		Object.entries(step.fields ?? {}).filter(
			([name, value]) => previous.fields?.[name] !== value,
		),
	);
	return {
		visible: step.visible.filter((text) => wasAbsent.has(text)),
		absent: (step.absent ?? []).filter((text) => wasShown.has(text)),
		...(order && { order }),
		...(Object.keys(fields).length > 0 && { fields }),
	};
}

export const witnessCount = (witness: LadderStep): number =>
	witness.visible.length +
	(witness.absent?.length ?? 0) +
	(witness.order ? 1 : 0) +
	Object.keys(witness.fields ?? {}).length;

const assertions = (step: LadderStep): unknown[] => [
	...step.visible.map((text) => ({ assertVisible: selector(text) })),
	...(step.absent ?? []).map((text) => ({ assertNotVisible: selector(text) })),
	...(step.disabled ?? []).map((text) => ({
		assertVisible: { text: selector(text), enabled: false },
	})),
	...(step.order ?? []).slice(1).map((text, index) => ({
		assertVisible: { text: selector(text), below: selector(step.order![index]!) },
	})),
	...Object.values(step.fields ?? {}).map((value) => ({ assertVisible: selector(value) })),
];

// Inside the sheet at either resting height on both phones. iOS springs a slow pull back, and hands a pull past full height to the content's scroll.
const pullDown = () => ({ swipe: { start: '50%, 56%', end: '50%, 96%', duration: 150 } });
const pullUp = { swipe: { start: '50%, 56%', end: '50%, 20%', duration: 600 } };
// Android's back gesture with gesture navigation (the Pixel 7 AVD's default): a swipe in from the left edge.
const backGesture = { swipe: { start: '1%, 50%', end: '85%, 50%', duration: 300 } };
const onPlatform = (platform: 'Android' | 'iOS', commands: unknown[]) => ({
	runFlow: { when: { platform }, commands },
});

const actionCommands = (action: LadderAction, step: LadderStep): unknown[] => {
	if ('tap' in action) return [{ tapOn: selector(action.tap) }];
	if ('type' in action)
		return [
			{ tapOn: selector(action.type.field) },
			'eraseText',
			{ inputText: action.type.text },
			...(action.type.keepKeyboard ? [] : ['hideKeyboard']),
		];
	if ('relaunch' in action) return ['stopApp', 'launchApp'];
	if ('dismiss' in action)
		return action.dismiss === 'swipe'
			? [pullDown()]
			: [onPlatform('Android', [backGesture]), onPlatform('iOS', [pullDown()])];
	if ('swipe' in action) return [pullUp];
	if ('scrollTo' in action)
		return [
			{
				scrollUntilVisible: {
					element: { text: selector(action.scrollTo) },
					direction: 'DOWN',
				},
			},
		];
	return [
		{
			extendedWaitUntil: {
				visible: selector(step.visible[0]!),
				timeout: action.wait + 10_000,
			},
		},
	];
};

/** The Maestro commands of each step in order: step 0 launches the app, every later step is its action then its checks. */
export function flowSteps(rung: LadderRung): unknown[][] {
	const launch = {
		launchApp: {
			clearState: true,
			...(rung.start && { arguments: { route: rung.start } }),
		},
	};
	return rung.steps.map((step, index) => [
		...(index === 0 ? [launch] : []),
		...(step.do ? actionCommands(step.do, step) : []),
		...(index > 0 ? assertions(changeWitness(rung.steps[index - 1]!, step)) : []),
		...assertions(step),
	]);
}

/** The one Maestro flow for a rung, written from its expected.json so the two never drift. */
export function renderFlow(folder: string, rung: LadderRung): string {
	return `${stringify({ appId: '${APP_ID}', name: folder })}---\n${stringify(flowSteps(rung).flat())}`;
}
