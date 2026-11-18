import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stringify } from 'yaml';

/** One person's action between two looks at the screen. Every target is a visible text or an accessible name. */
export type LadderAction =
	| { readonly tap: string }
	| { readonly type: { readonly field: string; readonly text: string } }
	| { readonly relaunch: true }
	| { readonly wait: number };

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
		.filter((entry) => entry.isDirectory() && /^(\d\d[a-z]?|u\d+)-/.test(entry.name))
		.map((entry) => entry.name)
		.sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));

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

const actionCommands = (action: LadderAction, step: LadderStep): unknown[] => {
	if ('tap' in action) return [{ tapOn: selector(action.tap) }];
	if ('type' in action)
		return [
			{ tapOn: selector(action.type.field) },
			'eraseText',
			{ inputText: action.type.text },
			'hideKeyboard',
		];
	if ('relaunch' in action) return ['stopApp', 'launchApp'];
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
