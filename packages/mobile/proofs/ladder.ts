import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stringify } from 'yaml';
import { PROOF_URL_SCHEME } from '../src/harness/proof-app.ts';

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
	/**
	 * Close the open system sheet the platform's way: `swipe` pulls it down; `back` is Android's back gesture (an edge
	 * swipe). iOS has no back for a sheet, so there `back` is the pull down too.
	 */
	| { readonly dismissSheet: 'swipe' | 'back' }
	/** Pull the open system sheet up to its next resting height. */
	| { readonly swipe: 'up' }
	/**
	 * A drag across the screen from one point to another, each `[x, y]` in percent of the screen; with `until`, repeated
	 * (up to 80 times) until that text or accessible name is on screen.
	 */
	| {
			readonly swipe: {
				readonly from: readonly [number, number];
				readonly to: readonly [number, number];
				readonly until?: string;
			};
	  }
	/** The keyboard's return key in the text field with this accessible name. */
	| { readonly submit: string }
	/** Scroll until this text is on screen. */
	| { readonly scrollTo: string }
	| {
			readonly relaunch: true;
			readonly permissions?: Readonly<Partial<Record<DevicePermission, 'unset'>>>;
	  }
	| { readonly wait: number }
	/** Answers the system's permission prompt, as a person does. */
	| { readonly answer: 'allow' | 'deny' }
	/**
	 * The device's live value changes. The test builds' devices take it from a `PROOF_LINK` link (a simulator cannot go
	 * offline by itself); the web test fires the browser's own event.
	 */
	| { readonly device: Readonly<Record<'network.online', boolean>> }
	/** Closes the system screen on top of the app (the share sheet) without choosing anything, as a person does. */
	| { readonly dismiss: true }
	/**
	 * In the system Settings screen the app opened, taps these texts in order (each platform words its own screen),
	 * then comes back to the app.
	 */
	| { readonly settings: Readonly<Record<'ios' | 'android', readonly string[]>> }
	/** The platform's own way back: the edge-swipe gesture, or the back button (iOS navigation bar, Android system back). */
	| { readonly back: 'gesture' | 'button' }
	/** The device's light or dark appearance, switched in the system while the app runs (`prefers-color-scheme` on the web). */
	| { readonly appearance: 'light' | 'dark' };

/** Permissions a rung sets or clears, by the name Maestro's `launchApp` takes. */
export type DevicePermission = 'location' | 'camera' | 'microphone';

/** The link a phone test build answers by setting a live device value (both shells: `markless-proof://device/<name>?value=<json>`). */
export const deviceLink = (name: string, value: unknown): string =>
	`markless-proof://device/${name}?value=${encodeURIComponent(JSON.stringify(value))}`;

/** The prompt button each answer taps, as Maestro text patterns matching iOS's and Android's own wording. */
export const PERMISSION_BUTTONS = {
	allow: 'Allow While Using App|While using the app|Allow',
	deny: 'Don.t Allow|Don.t allow',
} as const;

/** The most swipes a `swipe` with `until` makes before its step's checks fail it. */
export const SWIPES_UNTIL = 80;

/** What the screen shows after a step's action (or at launch, for the first step). */
export type LadderStep = {
	readonly do?: LadderAction;
	/** Texts or accessible names that are on screen. */
	readonly visible: readonly string[];
	/** Texts or accessible names that are not on screen. */
	readonly absent?: readonly string[];
	/** Texts or accessible names the page holds but that are scrolled out of sight. */
	readonly offScreen?: readonly string[];
	/** Controls, by text or accessible name, that are on screen and cannot be activated. */
	readonly disabled?: readonly string[];
	/** Texts that are on screen in this order, top to bottom. */
	readonly order?: readonly string[];
	/** Text fields, by accessible name, and the value each holds. */
	readonly fields?: Readonly<Record<string, string>>;
	/** The screen's title: the system navigation bar's on a phone, `document.title` on the web. */
	readonly title?: string;
	/**
	 * What the web shows instead, where a browser cannot do what a native stack does; `why` says what differs. With
	 * `leaves`, the action leaves the site (a Back with no earlier entry) and the web column stops there.
	 */
	readonly onWeb?: {
		readonly why: string;
		readonly visible?: readonly string[];
		readonly absent?: readonly string[];
		readonly order?: readonly string[];
		readonly leaves?: true;
	};
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
	readonly prompt?: DevicePermission;
	/**
	 * A system screen covers the app: the share sheet, or the Settings app. As with `prompt`, phones assert only the
	 * screen, which a test can see but not look into further than its own texts.
	 */
	readonly system?: keyof typeof SYSTEM_SCREENS;
	/** Phones only: whether the page's camera session runs, from the test build's label `CAMERA_STATE_ID`. */
	readonly camera?: 'on' | 'off';
	/** Phones only: whether a recorder holds the microphone, from the test build's label `MICROPHONE_STATE_ID`. */
	readonly microphone?: 'on' | 'off';
	/** Texts on screen on one platform only: a `platform` check shows a different arm on each. */
	readonly visibleOn?: Readonly<Partial<Record<'ios' | 'android' | 'web', readonly string[]>>>;
	/**
	 * The validation message shown for the field a blocked submit focused: on the web the browser's bubble, read as the
	 * focused field's `validationMessage`; on a phone the host's message, on screen.
	 */
	readonly invalid?: string;
};

/** Each system prompt's title, as a Maestro text pattern matching iOS's and Android's wording. */
export const PERMISSION_PROMPTS = {
	location: 'Allow .?Proof.? to (use your|access this device.s) location\\?',
	camera: 'Allow .?Proof.? to (access your camera|take pictures and record video)\\?',
	microphone: 'Allow .?Proof.? to (access your microphone|record audio)\\?',
} as const;

/** Each system screen a rung opens, as a Maestro text pattern matching what iOS and Android show on it. */
export const SYSTEM_SCREENS = {
	share: 'Markless proof|markless\\.dev',
	// iOS 27's simulator opens Settings at its root, not at the app's page.
	settings: 'ALLOW .?PROOF.? TO ACCESS|Allow .?Proof.? to access|App info|Apple Account',
} as const;

/** The test-build label where a phone shell lists the device calls it received; its text is `callsText(calls)`. */
export const DEVICE_CALLS_ID = 'markless-device-calls';
/** The test-build label where a phone shell shows whether a camera session runs: `camera on` or `camera off`. */
export const CAMERA_STATE_ID = 'markless-camera';
/** The test-build label where a phone shell shows whether a recorder holds the microphone: `microphone on` or `off`. */
export const MICROPHONE_STATE_ID = 'markless-microphone';
export const callsText = (calls: readonly string[]): string =>
	`calls: ${calls.length === 0 ? 'none' : calls.join(', ')}`;

export type LadderRung = {
	/** A number for the one-screen ladder, `N1`... for the navigation ladder, `D<n>` for the device ladder. */
	readonly rung: number | string;
	readonly name: string;
	/** The route pattern App.tsrx is the page for, relative to the app root; the index route when absent. */
	readonly route?: string;
	/** The path the app opens at; `/` when absent. */
	readonly start?: string;
	/**
	 * The text of the first element the screens and the browser leave below the first screen. The reference runtime has no
	 * layout, so it raises `visible` only for elements before that one in document order.
	 */
	readonly belowFold?: string;
	/** How the app opens at `start`: a launch argument (the default) or a deep link the system hands the app. */
	readonly open?: 'launch' | 'link';
	/** Where the device says it is, set before launch (Maestro `setLocation`; the web test's geolocation). */
	readonly location?: { readonly latitude: number; readonly longitude: number };
	/** Permissions at the first launch; `unset` leaves the system to ask (Maestro grants every permission otherwise). */
	readonly permissions?: Readonly<Partial<Record<DevicePermission, 'allow' | 'deny' | 'unset'>>>;
	/**
	 * The web build, where `@markless/device` is absent: the steps it shows instead (a device action has nothing to
	 * act on there), and texts that must not appear in any file of the built output (removed at build time).
	 */
	readonly web?: {
		readonly steps?: readonly LadderStep[];
		readonly absentFromOutput?: readonly string[];
	};
	readonly steps: readonly LadderStep[];
};

export const proofsDir = import.meta.dirname;

export const rungFolders = (): string[] =>
	readdirSync(proofsDir, { withFileTypes: true })
		.filter((entry) => entry.isDirectory() && /^((\d\d|[dp]\d)[a-z]?|[fruy]\d+)-/.test(entry.name))
		.filter((entry) => !isApp(entry.name))
		.map((entry) => entry.name)
		.sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));

/** A rung that is an app of several routes (`pages/`) rather than one screen (`App.tsrx`). */
const isApp = (folder: string): boolean => existsSync(join(proofsDir, folder, 'pages'));

/** The navigation ladder: each folder an app (`pages/`) of several routes; an `r<n>` rung with `pages/` too. */
export const navRungFolders = (): string[] =>
	readdirSync(proofsDir, { withFileTypes: true })
		.filter((entry) => entry.isDirectory() && (/^n\d+-/.test(entry.name) || (/^r\d+-/.test(entry.name) && isApp(entry.name))))
		.map((entry) => entry.name)
		.sort();

/** The styles ladder: each folder an app of several pages whose styles reach the phone through Dragon. */
export const styleRungFolders = (): string[] =>
	readdirSync(proofsDir, { withFileTypes: true })
		.filter((entry) => entry.isDirectory() && /^s\d+-/.test(entry.name))
		.map((entry) => entry.name)
		.sort();

/** Every proof folder the flows are written for: the one-screen ladder, the navigation ladder, then the styles ladder. */
export const allRungFolders = (): string[] => [
	...rungFolders(),
	...navRungFolders(),
	...styleRungFolders(),
];

/** An action that changes only how the screen looks, so no text can witness it; the screenshots after it do. */
export const looksOnly = (action: LadderAction | undefined): boolean =>
	action !== undefined && 'appearance' in action;

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
	const wasAbsent = new Set([...(previous.absent ?? []), ...(previous.offScreen ?? [])]);
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
		...((step.offScreen ?? []).some((text) => wasShown.has(text)) && {
			offScreen: (step.offScreen ?? []).filter((text) => wasShown.has(text)),
		}),
		...(order && { order }),
		...(Object.keys(fields).length > 0 && { fields }),
		...(step.title !== undefined && step.title !== previous.title && { title: step.title }),
		...(calls && { calls }),
		...(step.camera && step.camera !== previous.camera && { camera: step.camera }),
		...(step.microphone &&
			step.microphone !== previous.microphone && { microphone: step.microphone }),
		...(step.invalid !== undefined &&
			step.invalid !== previous.invalid && { invalid: step.invalid }),
	};
}

export const witnessCount = (witness: LadderStep): number =>
	witness.visible.length +
	(witness.absent?.length ?? 0) +
	(witness.offScreen?.length ?? 0) +
	(witness.order ? 1 : 0) +
	Object.keys(witness.fields ?? {}).length +
	(witness.calls ? 1 : 0) +
	(witness.camera ? 1 : 0) +
	(witness.microphone ? 1 : 0) +
	(witness.title === undefined ? 0 : 1) +
	(witness.invalid !== undefined ? 1 : 0);

const assertions = (step: LadderStep): unknown[] =>
	step.prompt
		? [{ assertVisible: { text: PERMISSION_PROMPTS[step.prompt] } }]
		: step.system
			? [{ assertVisible: { text: SYSTEM_SCREENS[step.system] } }]
			: [...screenAssertions(step), ...platformAssertions(step)];

const MAESTRO_PLATFORM = { ios: 'iOS', android: 'Android' } as const;

const platformAssertions = (step: LadderStep): unknown[] =>
	(['ios', 'android'] as const).flatMap((platform) => {
		const texts = step.visibleOn?.[platform];
		return texts
			? [
					{
						runFlow: {
							when: { platform: MAESTRO_PLATFORM[platform] },
							commands: texts.map((text) => ({ assertVisible: selector(text) })),
						},
					},
				]
			: [];
	});

const screenAssertions = (step: LadderStep): unknown[] => [
	...step.visible.map((text) => ({ assertVisible: selector(text) })),
	...[...(step.absent ?? []), ...(step.offScreen ?? [])].map((text) => ({
		assertNotVisible: selector(text),
	})),
	...(step.disabled ?? []).map((text) => ({
		assertVisible: { text: selector(text), enabled: false },
	})),
	...(step.order ?? []).slice(1).map((text, index) => ({
		assertVisible: { text: selector(text), below: selector(step.order![index]!) },
	})),
	...Object.values(step.fields ?? {}).map((value) => ({ assertVisible: selector(value) })),
	...(step.title === undefined ? [] : [{ assertVisible: selector(step.title) }]),
	...(step.calls
		? [{ assertVisible: { id: DEVICE_CALLS_ID, text: selector(callsText(step.calls)) } }]
		: []),
	...(step.camera
		? [{ assertVisible: { id: CAMERA_STATE_ID, text: `camera ${step.camera}` } }]
		: []),
	...(step.microphone
		? [{ assertVisible: { id: MICROPHONE_STATE_ID, text: `microphone ${step.microphone}` } }]
		: []),
	...(step.invalid !== undefined ? [{ assertVisible: selector(step.invalid) }] : []),
];

const onPlatform = (platform: 'iOS' | 'Android', commands: unknown[]) => ({
	runFlow: { when: { platform }, commands },
});

/** The left-edge swipe both platforms read as Back (iOS's interactive pop, Android's back gesture). */
const EDGE_SWIPE = { swipe: { start: '1%, 50%', end: '85%, 50%', duration: 400 } };

// Inside the sheet at either resting height on both phones. iOS springs a slow pull back, and hands a pull past full height to the content's scroll.
const pullDown = () => ({ swipe: { start: '50%, 56%', end: '50%, 96%', duration: 150 } });
const pullUp = { swipe: { start: '50%, 56%', end: '50%, 20%', duration: 600 } };
// Android's back gesture with gesture navigation (the Pixel 7 AVD's default): a swipe in from the left edge.
const backGesture = { swipe: { start: '1%, 50%', end: '85%, 50%', duration: 300 } };

const actionCommands = (action: LadderAction, step: LadderStep): unknown[] => {
	if ('tap' in action) return [{ tapOn: selector(action.tap) }];
	if ('type' in action)
		return [
			{ tapOn: selector(action.type.field) },
			'eraseText',
			{ inputText: action.type.text },
			...(action.type.keepKeyboard ? [] : ['hideKeyboard']),
		];
	if ('submit' in action) return [{ tapOn: selector(action.submit) }, { pressKey: 'Enter' }];
	if ('relaunch' in action)
		return [
			'stopApp',
			action.permissions ? { launchApp: { permissions: action.permissions } } : 'launchApp',
		];
	if ('answer' in action) return [{ tapOn: { text: PERMISSION_BUTTONS[action.answer] } }];
	if ('dismiss' in action)
		// iOS 27 shows the share sheet as a card that closes on a tap outside it; Android's closes on Back.
		return [
			{ runFlow: { when: { platform: 'iOS' }, commands: [{ tapOn: { point: '50%,25%' } }] } },
			{ runFlow: { when: { platform: 'Android' }, commands: ['back'] } },
		];
	if ('settings' in action)
		return [
			...(['ios', 'android'] as const).map((platform) => ({
				runFlow: {
					when: { platform: MAESTRO_PLATFORM[platform] },
					commands: action.settings[platform].flatMap((text) => [
						{ scrollUntilVisible: { element: { text: selector(text) } } },
						{ tapOn: selector(text) },
					]),
				},
			})),
			// Back to the app as it was: the Settings app stays open behind it.
			{ launchApp: { stopApp: false } },
		];
	if ('device' in action)
		// iOS confirms a custom-scheme link with "Open in “Proof”?"; Android opens it at once.
		return Object.entries(action.device).flatMap(([name, value]) => [
			{ openLink: deviceLink(name, value) },
			{ tapOn: { text: 'Open', optional: true } },
		]);
	if ('dismissSheet' in action)
		return action.dismissSheet === 'swipe'
			? [pullDown()]
			: [onPlatform('Android', [backGesture]), onPlatform('iOS', [pullDown()])];
	if ('swipe' in action && action.swipe === 'up') return [pullUp];
	if ('scrollTo' in action)
		return [
			{
				scrollUntilVisible: {
					element: { text: selector(action.scrollTo) },
					direction: 'DOWN',
				},
			},
		];
	if ('appearance' in action)
		return [{ setDarkMode: action.appearance === 'dark' ? 'enabled' : 'disabled' }];
	if ('back' in action)
		return action.back === 'gesture'
			? [EDGE_SWIPE]
			: [
					onPlatform('iOS', [{ tapOn: { id: 'BackButton' } }]),
					onPlatform('Android', [{ pressKey: 'back' }]),
				];
	if ('swipe' in action) {
		const at = ([x, y]: readonly [number, number]) => `${x}%, ${y}%`;
		const swipe = { swipe: { start: at(action.swipe.from), end: at(action.swipe.to) } };
		if (!action.swipe.until) return [swipe];
		return [
			{
				repeat: {
					times: SWIPES_UNTIL,
					while: { notVisible: selector(action.swipe.until) },
					commands: [swipe],
				},
			},
		];
	}
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
	const launch =
		rung.open === 'link'
			? [
					{ launchApp: { clearState: true } },
					'stopApp',
					{ openLink: `${PROOF_URL_SCHEME}://app${rung.start ?? '/'}` },
					// iOS asks before an outside caller opens an app by its URL scheme, until the simulator remembers the answer.
					onPlatform('iOS', [{ tapOn: { text: 'Open', optional: true } }]),
				]
			: [
					{
						launchApp: {
							clearState: true,
							...(rung.start && { arguments: { route: rung.start } }),
							...(rung.permissions && { permissions: rung.permissions }),
						},
					},
				];
	// A rung that switches the appearance starts in light, whatever the device was left in.
	const appearance = rung.steps.some((step) => looksOnly(step.do))
		? [{ setDarkMode: 'disabled' }]
		: [];
	// The Settings app keeps its place between runs; stopping it makes it open at its root every time.
	const visitsSettings = rung.steps.some((step) => step.do && 'settings' in step.do);
	return rung.steps.map((step, index) => [
		...(index === 0 && visitsSettings
			? [{ runFlow: { when: { platform: 'iOS' }, commands: [{ stopApp: 'com.apple.Preferences' }] } }]
			: []),
		...(index === 0 && rung.location ? [{ setLocation: rung.location }] : []),
		...(index === 0 ? [...launch, ...appearance] : []),
		...(step.do ? actionCommands(step.do, step) : []),
		...(index > 0
			? assertions({
					...changeWitness(rung.steps[index - 1]!, step),
					...(step.prompt && { prompt: step.prompt }),
					...(step.system && { system: step.system }),
				})
			: []),
		...assertions(step),
	]);
}

/** The one Maestro flow for a rung, written from its expected.json so the two never drift. */
export function renderFlow(folder: string, rung: LadderRung): string {
	return `${stringify({ appId: '${APP_ID}', name: folder })}---\n${stringify(flowSteps(rung).flat())}`;
}
