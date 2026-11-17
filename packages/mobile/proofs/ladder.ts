import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stringify } from 'yaml';

/** One person's action between two looks at the screen. Every target is a visible text or an accessible name. */
export type LadderAction =
	| { readonly tap: string }
	| { readonly type: { readonly field: string; readonly text: string } }
	| { readonly relaunch: true; readonly permissions?: Readonly<Record<'location', 'unset'>> }
	| { readonly wait: number }
	/** Answers the system's permission prompt, as a person does. */
	| { readonly answer: 'allow' | 'deny' }
	/**
	 * The device's live value changes. The test builds' devices take it from a `PROOF_LINK` link (a simulator cannot go
	 * offline by itself); the web test fires the browser's own event.
	 */
	| { readonly device: Readonly<Record<'network.online', boolean>> };

/** The link a phone test build answers by setting a live device value (both shells: `markless-proof://device/<name>?value=<json>`). */
export const deviceLink = (name: string, value: unknown): string =>
	`markless-proof://device/${name}?value=${encodeURIComponent(JSON.stringify(value))}`;

/** The prompt button each answer taps, as Maestro text patterns matching iOS's and Android's own wording. */
export const PERMISSION_BUTTONS = {
	allow: 'Allow While Using App|While using the app',
	deny: 'Don.t Allow|Don.t allow',
} as const;

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
	/**
	 * Every device call the app has made since launch, in order (`haptics.tap`). Web tests record them from the
	 * browser APIs `@markless/device` calls; phone test builds show them in the label `DEVICE_CALLS_ID`.
	 */
	readonly calls?: readonly string[];
	/**
	 * The system is asking the person for this permission. Phones show the app under the prompt but Maestro reads only
	 * the prompt's window, so on phones the step asserts the prompt and its screenshot shows the rest; the web and the
	 * reference runtime check every expectation.
	 */
	readonly prompt?: 'location';
};

/** Each system prompt's title, as a Maestro text pattern matching iOS's and Android's wording. */
export const PERMISSION_PROMPTS = {
	location: 'Allow .?Proof.? to (use your|access this device.s) location\\?',
} as const;

/** The test-build label where a phone shell lists the device calls it received; its text is `callsText(calls)`. */
export const DEVICE_CALLS_ID = 'markless-device-calls';
export const callsText = (calls: readonly string[]): string =>
	`calls: ${calls.length === 0 ? 'none' : calls.join(', ')}`;

export type LadderRung = {
	/** A number on the view ladder; `D<n>` on the device ladder. */
	readonly rung: number | string;
	readonly name: string;
	/** The route pattern App.tsrx is the page for, relative to the app root; the index route when absent. */
	readonly route?: string;
	/** The path the app opens at; `/` when absent. */
	readonly start?: string;
	/** Where the device says it is, set before launch (Maestro `setLocation`; the web test's geolocation). */
	readonly location?: { readonly latitude: number; readonly longitude: number };
	/** Permissions at the first launch; `unset` leaves the system to ask (Maestro grants every permission otherwise). */
	readonly permissions?: Readonly<Record<'location', 'allow' | 'deny' | 'unset'>>;
	/**
	 * The web build refuses this rung with this diagnostic code instead of showing it: the web half waits on an owner
	 * decision named in the diagnostic. The web check asserts the refusal; the phones still run every step.
	 */
	readonly webRefused?: string;
	readonly steps: readonly LadderStep[];
};

export const proofsDir = import.meta.dirname;

export const rungFolders = (): string[] =>
	readdirSync(proofsDir, { withFileTypes: true })
		.filter((entry) => entry.isDirectory() && /^(\d\d[a-z]?|d\d)-/.test(entry.name))
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
	const calls =
		step.calls && step.calls.join('\n') !== previous.calls?.join('\n') ? step.calls : undefined;
	return {
		visible: step.visible.filter((text) => wasAbsent.has(text)),
		absent: (step.absent ?? []).filter((text) => wasShown.has(text)),
		...(order && { order }),
		...(Object.keys(fields).length > 0 && { fields }),
		...(calls && { calls }),
	};
}

export const witnessCount = (witness: LadderStep): number =>
	witness.visible.length +
	(witness.absent?.length ?? 0) +
	(witness.order ? 1 : 0) +
	Object.keys(witness.fields ?? {}).length +
	(witness.calls ? 1 : 0);

const assertions = (step: LadderStep): unknown[] =>
	step.prompt
		? [{ assertVisible: { text: PERMISSION_PROMPTS[step.prompt] } }]
		: screenAssertions(step);

const screenAssertions = (step: LadderStep): unknown[] => [
	...step.visible.map((text) => ({ assertVisible: selector(text) })),
	...(step.absent ?? []).map((text) => ({ assertNotVisible: selector(text) })),
	...(step.disabled ?? []).map((text) => ({
		assertVisible: { text: selector(text), enabled: false },
	})),
	...(step.order ?? []).slice(1).map((text, index) => ({
		assertVisible: { text: selector(text), below: selector(step.order![index]!) },
	})),
	...Object.values(step.fields ?? {}).map((value) => ({ assertVisible: selector(value) })),
	...(step.calls
		? [{ assertVisible: { id: DEVICE_CALLS_ID, text: selector(callsText(step.calls)) } }]
		: []),
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
	if ('relaunch' in action)
		return [
			'stopApp',
			action.permissions ? { launchApp: { permissions: action.permissions } } : 'launchApp',
		];
	if ('answer' in action) return [{ tapOn: { text: PERMISSION_BUTTONS[action.answer] } }];
	if ('device' in action)
		// iOS confirms a custom-scheme link with "Open in “Proof”?"; Android opens it at once.
		return Object.entries(action.device).flatMap(([name, value]) => [
			{ openLink: deviceLink(name, value) },
			{ tapOn: { text: 'Open', optional: true } },
		]);
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
			...(rung.permissions && { permissions: rung.permissions }),
		},
	};
	return rung.steps.map((step, index) => [
		...(index === 0 && rung.location ? [{ setLocation: rung.location }] : []),
		...(index === 0 ? [launch] : []),
		...(step.do ? actionCommands(step.do, step) : []),
		...(index > 0
			? assertions({
					...changeWitness(rung.steps[index - 1]!, step),
					...(step.prompt && { prompt: step.prompt }),
				})
			: []),
		...assertions(step),
	]);
}

/** The one Maestro flow for a rung, written from its expected.json so the two never drift. */
export function renderFlow(folder: string, rung: LadderRung): string {
	return `${stringify({ appId: '${APP_ID}', name: folder })}---\n${stringify(flowSteps(rung).flat())}`;
}
