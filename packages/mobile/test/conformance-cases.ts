import type { NativeAction, NativeAppAction, NativeElementBox } from '../src/index.ts';
import type { DeviceAppConfig } from '../src/permissions.ts';
import { nodeScriptHost } from '../src/node-engine.ts';

/** The engine the vectors are written with; `crypto` draws from all-zero seed bytes, which a host's test passes too. */
export const CONFORMANCE_SCRIPT_HOST = () => nodeScriptHost('00'.repeat(32));
import { readWorkspaceModule } from '../src/harness/rung.ts';

/** Resolves what a case imports (`@markless/ui`) from packages/mobile, where the case's `src/<name>.tsrx` stands. */
export const readCaseModule = (specifier: string, importer: string) =>
	readWorkspaceModule(
		specifier,
		importer.startsWith('src/') ? `packages/mobile/${importer}` : importer,
	);

/** Each committed vector file: its component (a path inside packages/mobile) and the actions it records. */
export const CONFORMANCE_CASES: ReadonlyArray<{
	readonly name: string;
	readonly fixture: string;
	/** For a page: its page file (the router derives the route) and the params it opens with. */
	readonly page?: string;
	readonly params?: Readonly<Record<string, string>>;
	/** What the device's clock reads, for a component that reads it. */
	readonly now?: number;
	/** Each measured element's box and direction, for a script that measures. */
	readonly layout?: Readonly<Record<string, NativeElementBox>>;
	/** The app config's usage text, for a component that uses a device feature that asks. */
	readonly device?: DeviceAppConfig;
	/** The device's preferred languages, when the vector shows a message in one. */
	readonly preferredLanguages?: ReadonlyArray<string>;
	/** Built at its own path with the modules it imports read from the workspace (app modules and packages). */
	readonly modules?: true;
	readonly actions: ReadonlyArray<NativeAction>;
}> = [
	{
		name: 'counter',
		fixture: 'test/fixtures/Counter.tsrx',
		actions: [
			{ event: 'activate', host: 'h2' },
			{ event: 'activate', host: 'h2' },
		],
	},
	{
		name: 'animation-events',
		fixture: 'test/fixtures/AnimationEvents.tsrx',
		actions: [
			{ event: 'animationstart', host: 'h1', animationName: 'close', elapsedTime: 0 },
			{ event: 'animationend', host: 'h1', animationName: 'close', elapsedTime: 0.25 },
		],
	},
	{
		// A component's `value={prop}` that never changes leaves the typed text in the field.
		name: 'component-input-value',
		fixture: 'proofs/u120-component-input-value/App.tsrx',
		actions: [
			{ event: 'input', host: 'component-edge:0/h0', value: 'Groceries' },
			{ event: 'activate', host: 'h4' },
		],
	},
	{
		// A handler's matchMedia answers from the device's settings, which a conformance run fixes at the web's defaults.
		name: 'match-media',
		fixture: 'proofs/u125-match-media/App.tsrx',
		actions: [{ event: 'activate', host: 'h2' }],
	},
	{
		// A handler's devicePixelRatio reads the screen, which a conformance run fixes at 1.
		name: 'device-pixel-ratio',
		fixture: 'proofs/u132-device-pixel-ratio/App.tsrx',
		actions: [{ event: 'activate', host: 'h2' }],
	},
	{
		// A class that follows state keeps the module's style scope class around it, as the web writes it.
		name: 'class-scope',
		fixture: 'proofs/r161-class-scope/App.tsrx',
		actions: [
			{ event: 'activate', host: 'h4' },
			{ event: 'activate', host: 'h5' },
		],
	},
	{
		// A class a helper computes in JavaScript, with the style scope around it.
		name: 'class-script',
		fixture: 'proofs/r154-class-script/App.tsrx',
		modules: true,
		actions: [
			{ event: 'activate', host: 'h3' },
			{ event: 'activate', host: 'h3' },
		],
	},
	{
		name: 'infinite-bounds',
		fixture: 'proofs/r159-infinite-bounds/App.tsrx',
		modules: true,
		actions: [
			{ event: 'activate', host: 'h5' },
			{ event: 'activate', host: 'h6' },
		],
	},
	{
		name: 'style-slots',
		fixture: 'test/fixtures/StyleSlots.tsrx',
		actions: [
			{ event: 'activate', host: 'h2' },
			{ event: 'activate', host: 'h3' },
			{ event: 'activate', host: 'h4' },
		],
	},
	{
		name: 'row-slots',
		fixture: 'test/fixtures/RowSlots.tsrx',
		actions: [
			{ event: 'activate', host: 'h3' },
			{ event: 'activate', host: 'h4' },
			{ event: 'activate', host: 'h5' },
		],
	},
	{
		name: 'style-cases',
		fixture: 'test/fixtures/StyleCases.tsrx',
		actions: [
			{ event: 'activate', host: 'h2' },
			{ event: 'activate', host: 'h3' },
			{ event: 'activate', host: 'h4' },
			{ event: 'activate', host: 'h3' },
		],
	},
	{
		name: 'switches',
		fixture: 'test/fixtures/Switches.tsrx',
		actions: [
			{ event: 'activate', host: 'h3' },
			{ event: 'activate', host: 'h3' },
			{ event: 'activate', host: 'h4' },
			{ event: 'activate', host: 'h4' },
		],
	},
	{
		name: 'arithmetic',
		fixture: 'test/fixtures/Arithmetic.tsrx',
		actions: [
			{ event: 'activate', host: 'h10' },
			{ event: 'activate', host: 'h10' },
		],
	},
	{
		name: 'choices',
		fixture: 'test/fixtures/Choices.tsrx',
		actions: [
			{ event: 'activate', host: 'h1' },
			{ event: 'activate', host: 'h2' },
			{ event: 'activate', host: 'h1' },
			{ event: 'activate', host: 'h2' },
			{ event: 'activate', host: 'h1' },
			{ event: 'activate', host: 'h2' },
		],
	},
	{
		name: 'attributes',
		fixture: 'proofs/04-attributes/App.tsrx',
		actions: [
			{ event: 'activate', host: 'h2' },
			{ event: 'activate', host: 'h3' },
			{ event: 'activate', host: 'h2' },
		],
	},
	{
		name: 'if',
		fixture: 'proofs/05-if/App.tsrx',
		actions: [
			{ event: 'activate', host: 'h2' },
			{ event: 'activate', host: 'h2' },
		],
	},
	{
		name: 'list',
		fixture: 'proofs/06-keyed-for/App.tsrx',
		actions: [
			{ event: 'activate', host: 'h2' },
			{ event: 'activate', host: 'h3' },
			{ event: 'activate', host: 'h4' },
		],
	},
	{
		name: 'list-key-from-fields',
		fixture: 'test/fixtures/JoinedKeys.tsrx',
		actions: [
			{ event: 'activate', host: 'component-edge:0/h0@b-1' },
			{ event: 'activate', host: 'component-edge:0/h0@b-1' },
			{ event: 'activate', host: 'h2' },
			{ event: 'activate', host: 'h3' },
			{ event: 'activate', host: 'component-edge:0/h0@a-1' },
			{ event: 'activate', host: 'h6@b-2' },
		],
	},
	{
		name: 'components',
		fixture: 'proofs/07-child-component/App.tsrx',
		actions: [
			{ event: 'activate', host: 'component-edge:0/h2' },
			{ event: 'activate', host: 'component-edge:1/h2' },
			{ event: 'activate', host: 'component-edge:0/h2' },
		],
	},
	{
		name: 'for-in-arm',
		fixture: 'proofs/r141-for-in-arm/App.tsrx',
		actions: [
			{ event: 'activate', host: 'h1' },
			{ event: 'activate', host: 'h2' },
			{ event: 'activate', host: 'h1' },
			{ event: 'activate', host: 'h3' },
			{ event: 'activate', host: 'h1' },
			{ event: 'activate', host: 'h2' },
		],
	},
	{
		name: 'records',
		fixture: 'test/fixtures/Records.tsrx',
		actions: [
			{ event: 'activate', host: 'h2' },
			{ event: 'activate', host: 'h3' },
			{ event: 'activate', host: 'h4' },
		],
	},
	{
		name: 'route',
		fixture: 'proofs/10-url-route/App.tsrx',
		page: 'pages/[fruit].tsrx',
		params: { fruit: 'apple' },
		actions: [{ event: 'activate', host: 'component-edge:1' }],
	},
	{
		name: 'input',
		fixture: 'proofs/08-text-input/App.tsrx',
		actions: [
			{ event: 'input', host: 'h2', value: 'Samantha' },
			{ event: 'activate', host: 'h4' },
			{ event: 'input', host: 'h2', value: '' },
		],
	},
	{
		name: 'device',
		fixture: 'test/fixtures/Device.tsrx',
		actions: [
			{ event: 'activate', host: 'h2' },
			{ event: 'device', cell: 'device:network.online', value: false },
			{ event: 'activate', host: 'h2' },
			{ event: 'device', cell: 'device:network.online', value: true },
		],
	},
	{
		name: 'location',
		fixture: 'test/fixtures/Location.tsrx',
		device: { usage: { location: 'Shows where you are.' } },
		actions: [
			{ event: 'device', cell: 'device:location.access', value: 'granted' },
			{
				event: 'settle',
				cell: 'task:computed:here',
				value: { latitude: 51.5, longitude: -0.125, accuracy: 5 },
			},
			{ event: 'device', cell: 'device:location.access', value: 'denied' },
			{
				event: 'settle',
				cell: 'task:computed:here',
				error: { name: 'NotAllowedError', message: 'Location was refused' },
			},
		],
	},
	{
		name: 'camera',
		fixture: 'test/fixtures/Camera.tsrx',
		device: { usage: { camera: 'Takes the photo you ask for.' } },
		actions: [
			{ event: 'device', cell: 'device:camera.access', value: 'granted' },
			{ event: 'device', cell: 'object:component-edge:1/cam:ready', value: true },
			{ event: 'activate', host: 'component-edge:1/h5' },
			{
				event: 'resume',
				continuation: 'handler:component-edge:1/event:2:after:0',
				value: { url: 'file:///photo.png', width: 640, height: 480 },
			},
			{ event: 'activate', host: 'component-edge:1/h4' },
			{ event: 'device', cell: 'object:component-edge:1/cam:facing', value: 'back' },
			{ event: 'activate', host: 'component-edge:1/h1' },
		],
	},
	{
		// Device calls from a handler's JavaScript: an awaited location then a tap, a camera object's photo, a refusal caught.
		name: 'script-device',
		fixture: 'proofs/j18-script-device/App.tsrx',
		modules: true,
		device: {
			usage: { camera: 'Takes the photo you ask for.', location: 'Finds where you are.' },
		},
		actions: [
			{ event: 'device', cell: 'object:component-edge:1/cam:ready', value: true },
			{ event: 'activate', host: 'component-edge:1/h4' },
			{
				event: 'resume',
				continuation: 'script:1',
				value: { latitude: 51.5, longitude: -0.125, accuracy: 5 },
			},
			{ event: 'activate', host: 'component-edge:1/h5' },
			{
				event: 'resume',
				continuation: 'script:2',
				value: { url: 'file:///photo.png', width: 640, height: 480 },
			},
			{ event: 'activate', host: 'component-edge:1/h4' },
			{
				event: 'reject',
				continuation: 'script:3',
				error: { name: 'NotAllowedError', message: 'Location was refused' },
			},
		],
	},
	{
		name: 'handler-catch',
		fixture: 'proofs/d4b-photo-refused/App.tsrx',
		device: { usage: { camera: 'Takes the photo you ask for.' } },
		actions: [
			{ event: 'device', cell: 'device:camera.access', value: 'denied' },
			{ event: 'activate', host: 'component-edge:1/h3' },
			{
				event: 'reject',
				continuation: 'handler:component-edge:1/event:0:after:0',
				error: { name: 'NotAllowedError', message: 'The camera was refused' },
			},
		],
	},
	{
		name: 'recorder',
		fixture: 'proofs/d5-recorder/App.tsrx',
		device: { usage: { microphone: 'Records the clip you ask for.' } },
		actions: [
			{ event: 'activate', host: 'component-edge:0/h2' },
			{ event: 'device', cell: 'device:recorder.access', value: 'denied' },
			{ event: 'device', cell: 'object:component-edge:0/rec:active', value: false },
			{ event: 'device', cell: 'device:recorder.access', value: 'granted' },
			{ event: 'activate', host: 'component-edge:0/h2' },
			{ event: 'device', cell: 'object:component-edge:0/rec:seconds', value: 8 },
			{ event: 'activate', host: 'component-edge:0/h2' },
			{
				event: 'device',
				cell: 'object:component-edge:0/rec:clip',
				value: 'file:///clip.m4a',
			},
			{ event: 'activate', host: 'component-edge:0/h2' },
			{ event: 'activate', host: 'h9' },
			{ event: 'device', cell: 'object:component-edge:0/rec:active', value: false },
			{ event: 'activate', host: 'h9' },
		],
	},
	{
		name: 'sharesheet',
		fixture: 'proofs/d6-sharesheet/App.tsrx',
		actions: [
			{ event: 'activate', host: 'component-edge:0/h1' },
			{
				event: 'resume',
				continuation: 'handler:component-edge:0/event:0:after:0',
				value: null,
			},
			{ event: 'activate', host: 'component-edge:0/h1' },
			{
				event: 'reject',
				continuation: 'handler:component-edge:0/event:0:after:0',
				error: { name: 'Error', message: 'The share sheet failed' },
			},
		],
	},
	{
		name: 'settings',
		fixture: 'proofs/d7-settings/App.tsrx',
		device: { usage: { location: 'Shows where you are.' } },
		actions: [
			{ event: 'device', cell: 'device:location.access', value: 'denied' },
			{
				event: 'settle',
				cell: 'component-edge:0/task:computed:here',
				error: { name: 'NotAllowedError', message: 'Location was refused' },
			},
			{ event: 'activate', host: 'component-edge:0/h4' },
			{ event: 'device', cell: 'device:location.access', value: 'granted' },
		],
	},
	{
		name: 'sheet',
		fixture: 'proofs/y2-sheet-pick/App.tsrx',
		actions: [
			{ event: 'activate', host: 'h3' },
			{ event: 'dismiss', host: 'sheet:component-edge:0' },
			{ event: 'activate', host: 'h3' },
			{ event: 'input', host: 'h5', value: 'Porto' },
			{ event: 'activate', host: 'h6' },
			{ event: 'activate', host: 'h3' },
			{ event: 'activate', host: 'h11' },
		],
	},
	{
		// A sheet in an @if arm: no `sheet` entry when its arm leaves or comes; the host closes it with the arm and builds
		// it as its state says.
		name: 'sheet-in-arm',
		fixture: 'proofs/y5-sheet-in-arm/App.tsrx',
		actions: [
			{ event: 'activate', host: 'h3' },
			{ event: 'activate', host: 'h4' },
			{ event: 'activate', host: 'h7' },
			{ event: 'activate', host: 'h3' },
			{ event: 'activate', host: 'h6' },
			{ event: 'activate', host: 'h4' },
			{ event: 'dismiss', host: 'sheet:component-edge:0' },
		],
	},
	{
		name: 'guards',
		fixture: 'test/fixtures/Guards.tsrx',
		actions: [
			{ event: 'activate', host: 'component-edge:0/h1' },
			{ event: 'activate', host: 'component-edge:0/h2' },
			{ event: 'activate', host: 'component-edge:0/h1' },
			{ event: 'activate', host: 'component-edge:0/h2' },
			{ event: 'activate', host: 'component-edge:0/h1' },
			{ event: 'activate', host: 'h5' },
			{ event: 'activate', host: 'h5' },
			{ event: 'activate', host: 'h5' },
		],
	},
	{
		name: 'dialog',
		fixture: 'proofs/u4-dialog/App.tsrx',
		actions: [
			{ event: 'activate', host: 'h2' },
			{ event: 'activate', host: 'h7' },
			{ event: 'activate', host: 'h2' },
			{ event: 'cancel', host: 'h5' },
			{ event: 'activate', host: 'h4' },
			{ event: 'activate', host: 'h11' },
		],
	},
	{
		name: 'dialog-close',
		fixture: 'proofs/u72-dialog-close/App.tsrx',
		actions: [
			{ event: 'activate', host: 'h2' },
			{ event: 'activate', host: 'h7' },
			{ event: 'activate', host: 'h2' },
			{ event: 'cancel', host: 'h5' },
			{ event: 'activate', host: 'h2' },
			{ event: 'activate', host: 'h8' },
		],
	},
	{
		name: 'tap-mouse',
		fixture: 'proofs/u73-tap-mouse/App.tsrx',
		actions: [
			{ event: 'pointerdown', host: 'h3', x: 20, y: 40 },
			{ event: 'pointerup', host: 'h3', x: 20, y: 40 },
			{ event: 'pointerdown', host: 'h4', x: 20, y: 80 },
			{ event: 'pointerup', host: 'h4', x: 20, y: 80 },
			{ event: 'pointerdown', host: 'h4', x: 20, y: 80 },
			{ event: 'pointerup', host: 'h4', x: 20, y: 80 },
			{ event: 'pointerdown', host: 'h3', x: 20, y: 40 },
			{ event: 'pointercancel', host: 'h3', x: 20, y: 90 },
			{ event: 'pointerdown', host: 'h3', x: 20, y: 40 },
			{ event: 'pointerup', host: 'h3', x: 20, y: 40 },
		],
	},
	{
		name: 'mouse-fields',
		fixture: 'test/fixtures/MouseFields.tsrx',
		actions: [
			{ event: 'pointerdown', host: 'h1', x: 30, y: 12 },
			{ event: 'pointerup', host: 'h1', x: 30, y: 12 },
			{ event: 'pointerdown', host: 'h2', x: 44, y: 50 },
			{ event: 'pointerup', host: 'h2', x: 44, y: 50 },
		],
	},
	{
		name: 'svg-text',
		fixture: 'proofs/u74-svg-text/App.tsrx',
		actions: [{ event: 'activate', host: 'h2' }],
	},
	{
		name: 'svg-aspect',
		fixture: 'proofs/u75-svg-aspect/App.tsrx',
		actions: [
			{ event: 'activate', host: 'h2' },
			{ event: 'activate', host: 'h2' },
		],
	},
	{
		name: 'svg-clip',
		fixture: 'proofs/u76-svg-clip/App.tsrx',
		actions: [{ event: 'activate', host: 'h2' }],
	},
	{
		name: 'svg-markers',
		fixture: 'proofs/u77-svg-markers/App.tsrx',
		actions: [{ event: 'activate', host: 'h2' }],
	},
	{
		name: 'svg-gradients',
		fixture: 'proofs/u128-svg-gradients/App.tsrx',
		actions: [
			{ event: 'activate', host: 'h20' },
			{ event: 'activate', host: 'h20' },
		],
	},
	{
		name: 'types',
		fixture: 'test/fixtures/Types.tsrx',
		actions: [
			{ event: 'activate', host: 'h4' },
			{ event: 'activate', host: 'h5' },
			{ event: 'activate', host: 'h6' },
			{ event: 'activate', host: 'h7' },
			{ event: 'activate', host: 'h8' },
			{ event: 'activate', host: 'h8' },
			{ event: 'activate', host: 'h8' },
		],
	},
	{
		name: 'max-length',
		fixture: 'test/fixtures/MaxLength.tsrx',
		actions: [
			{ event: 'activate', host: 'h4' },
			{ event: 'input', host: 'h3', value: 'abcde' },
			{ event: 'activate', host: 'h5' },
			{ event: 'activate', host: 'h4' },
			{ event: 'input', host: 'h3', value: 'xy' },
			{ event: 'activate', host: 'h4' },
			{ event: 'input', host: 'h2', value: 'Barth' },
			{ event: 'activate', host: 'h6' },
			{ event: 'activate', host: 'h4' },
		],
	},
	{
		name: 'max-length-persian',
		fixture: 'test/fixtures/MaxLength.tsrx',
		preferredLanguages: ['fa-IR'],
		actions: [
			{ event: 'input', host: 'h3', value: 'abcde' },
			{ event: 'activate', host: 'h5' },
			{ event: 'activate', host: 'h4' },
		],
	},
	{
		// Each of Chromium's reasons an email field stops a submit, then a value it keeps without its line break and spaces.
		name: 'email',
		fixture: 'proofs/f10-email/App.tsrx',
		actions: [
			{ event: 'input', host: 'h3', value: 'abc' },
			{ event: 'activate', host: 'h4' },
			{ event: 'input', host: 'h3', value: '@x' },
			{ event: 'activate', host: 'h4' },
			{ event: 'input', host: 'h3', value: 'a@' },
			{ event: 'activate', host: 'h4' },
			{ event: 'input', host: 'h3', value: 'a,b@c' },
			{ event: 'activate', host: 'h4' },
			{ event: 'input', host: 'h3', value: 'a@b_c' },
			{ event: 'activate', host: 'h4' },
			{ event: 'input', host: 'h3', value: 'a@b..c' },
			{ event: 'activate', host: 'h4' },
			{ event: 'input', host: 'h3', value: 'a@b-' },
			{ event: 'activate', host: 'h4' },
			{ event: 'input', host: 'h3', value: ' sam@exam\nple.com ' },
			{ event: 'activate', host: 'h4' },
		],
	},
	{
		name: 'email-japanese',
		fixture: 'proofs/f10-email/App.tsrx',
		preferredLanguages: ['ja-JP'],
		actions: [
			{ event: 'input', host: 'h3', value: 'a@b..c' },
			{ event: 'activate', host: 'h4' },
		],
	},
	{
		// `?.` ends the chain at a null object, past the `?.` too (`user?.home.city`), as JavaScript does.
		name: 'optional-chain',
		fixture: 'proofs/r151-optional-chain/App.tsrx',
		actions: [
			{ event: 'activate', host: 'h4' },
			{ event: 'activate', host: 'h5' },
		],
	},
	{
		// One polymorphic component built as a <p> and as a <div>, each with its own click and state.
		name: 'dynamic-tag',
		fixture: 'proofs/r152-dynamic-tag/App.tsrx',
		actions: [
			{ event: 'activate', host: 'component-edge:0/h0' },
			{ event: 'activate', host: 'component-edge:1/h0' },
		],
	},
	{
		// A slider's moves set its value on its step and in its range; the app sets it back.
		name: 'range',
		fixture: 'proofs/r153-range/App.tsrx',
		actions: [
			{ event: 'input', host: 'h2', value: '10' },
			{ event: 'commit', host: 'h2', value: '10' },
			{ event: 'activate', host: 'h5' },
			{ event: 'input', host: 'h2', value: '7' },
		],
	},
	{
		// A textarea shows its text and follows it until it is edited; its form sends what it holds.
		name: 'textarea-default',
		fixture: 'proofs/r160-textarea-submit/App.tsrx',
		actions: [
			{ event: 'activate', host: 'h5' },
			{ event: 'activate', host: 'h6' },
			{ event: 'input', host: 'h2', value: 'Mine\nand more' },
			{ event: 'activate', host: 'h5' },
			{ event: 'activate', host: 'h6' },
		],
	},
	{
		name: 'forms',
		fixture: 'test/fixtures/Forms.tsrx',
		actions: [
			{ event: 'activate', host: 'h9' },
			{ event: 'activate', host: 'h11' },
			{ event: 'input', host: 'h2', value: '' },
			{ event: 'activate', host: 'h9' },
			{ event: 'activate', host: 'h10' },
			{ event: 'input', host: 'h2', value: 'Grace' },
			{ event: 'input', host: 'h3', value: 'Cy' },
			{ event: 'enter', host: 'h2' },
			{ event: 'enter', host: 'h15' },
			{ event: 'input', host: 'h20', value: 'Lu' },
			{ event: 'activate', host: 'h21' },
			{ event: 'activate', host: 'h21' },
			{ event: 'input', host: 'h20', value: '' },
			{ event: 'enter', host: 'h20' },
			{ event: 'timer', timer: 'timer:0' },
			{ event: 'timer', timer: 'timer:1' },
			{ event: 'activate', host: 'h24' },
			{ event: 'timer', timer: 'timer:2' },
		],
	},
	{
		name: 'choose',
		fixture: 'test/fixtures/Choose.tsrx',
		actions: [
			{ event: 'activate', host: 'h12' },
			{ event: 'choose', host: 'h3@Large' },
			{ event: 'activate', host: 'h12' },
			{ event: 'choose', host: 'h7' },
			{ event: 'choose', host: 'h5' },
			{ event: 'choose', host: 'h9' },
			{ event: 'activate', host: 'h14' },
			{ event: 'activate', host: 'h12' },
			{ event: 'activate', host: 'h13' },
			{ event: 'activate', host: 'h12' },
			{ event: 'choose', host: 'h11@Kiwi' },
			{ event: 'activate', host: 'h15' },
			{ event: 'activate', host: 'h12' },
			{ event: 'activate', host: 'h16' },
			{ event: 'activate', host: 'h12' },
		],
	},
	{
		name: 'form-return',
		fixture: 'test/fixtures/FormReturn.tsrx',
		actions: [
			{ event: 'input', host: 'h2', value: 'hi' },
			{ event: 'enter', host: 'h2' },
			{ event: 'activate', host: 'h4' },
			{ event: 'enter', host: 'h2' },
		],
	},
	{
		name: 'fieldset',
		fixture: 'proofs/f12-fieldset/App.tsrx',
		actions: [
			{ event: 'input', host: 'h5', value: 'Ann' },
			{ event: 'input', host: 'h8', value: 'Oslo' },
			{ event: 'activate', host: 'h9' },
		],
	},
	{
		name: 'row-element-facts',
		fixture: 'test/fixtures/RowElementFacts.tsrx',
		actions: [
			{ event: 'pointerdown', host: 'h2@b' },
			{ event: 'pointerup', host: 'h2@b' },
			{ event: 'pointerdown', host: 'h2@a' },
			{ event: 'pointerup', host: 'h2@a' },
		],
	},
	{
		// A root given no value holds its default (null, not undefined), which its part then writes.
		name: 'absent-default',
		fixture: 'proofs/u84-absent-default/App.tsrx',
		actions: [
			{ event: 'activate', host: 'component-edge:1/h3' },
			{ event: 'activate', host: 'component-edge:1/h3' },
		],
	},
	{
		// Children projected into both arms of an @if: the shown arm's copy answers its tap and holds the handle.
		name: 'projected-arms',
		fixture: 'proofs/u85-projected-arms/App.tsrx',
		modules: true,
		actions: [{ event: 'activate', host: 'copy-1/component-edge:2/h6' }],
	},
	{
		// A JavaScript click handler's press count: 1 for a tap, 0 for a click() a script raised.
		name: 'click-detail',
		fixture: 'proofs/u86-click-detail/App.tsrx',
		actions: [
			{ event: 'activate', host: 'h1' },
			{ event: 'activate', host: 'h2' },
			{ event: 'activate', host: 'h1' },
		],
	},
	{
		// A KeyboardEvent a script dispatches runs the element's keydown handler with its key.
		name: 'script-dispatch-keys',
		fixture: 'proofs/u87-script-keys/App.tsrx',
		actions: [
			{ event: 'activate', host: 'h3' },
			{ event: 'activate', host: 'h4' },
		],
	},
	{
		// A JavaScript pointer handler's pressure (0.5 while the finger is down, 0 once it lifts) and coalesced moves.
		name: 'pointer-pressure',
		fixture: 'proofs/u89-pointer-pressure/App.tsrx',
		actions: [
			{ event: 'pointerdown', host: 'h1', x: 10, y: 10 },
			{ event: 'pointermove', host: 'h1', x: 60, y: 10 },
			{ event: 'pointerup', host: 'h1', x: 60, y: 10 },
		],
	},
	{
		name: 'by-id',
		fixture: 'test/fixtures/ById.tsrx',
		actions: [
			{ event: 'activate', host: 'h5' },
			{ event: 'activate', host: 'h3@c' },
			{ event: 'activate', host: 'h5' },
			{ event: 'activate', host: 'h6' },
		],
	},
	{
		name: 'arm-handles',
		fixture: 'test/fixtures/ArmHandles.tsrx',
		actions: [
			{ event: 'activate', host: 'h3' },
			{ event: 'activate', host: 'h1' },
			{ event: 'activate', host: 'h3' },
			{ event: 'activate', host: 'h1' },
			{ event: 'activate', host: 'h3' },
		],
	},
	{
		name: 'object-spread',
		fixture: 'test/fixtures/ObjectSpread.tsrx',
		actions: [
			{ event: 'activate', host: 'h6' },
			{ event: 'input', host: 'h5', value: 'Di' },
			{ event: 'activate', host: 'h6' },
			{ event: 'activate', host: 'h7' },
			{ event: 'activate', host: 'h8' },
		],
	},
	{
		name: 'dom-classes',
		fixture: 'test/fixtures/DomClasses.tsrx',
		actions: [
			{ event: 'activate', host: 'h2' },
			{ event: 'activate', host: 'h3' },
			{ event: 'activate', host: 'h4' },
			{ event: 'activate', host: 'h5' },
		],
	},
	{
		name: 'roster-place',
		fixture: 'proofs/u78-roster-place/App.tsrx',
		actions: [
			{ event: 'activate', host: 'component-edge:3/h4' },
			{ event: 'activate', host: 'component-edge:3/h4' },
		],
	},
	{
		name: 'custom-elements',
		fixture: 'proofs/u70-custom-elements/App.tsrx',
		actions: [{ event: 'activate', host: 'h6' }],
	},
	{
		name: 'fieldset-disabled',
		fixture: 'proofs/f13-fieldset-disabled/App.tsrx',
		actions: [
			{ event: 'input', host: 'h5', value: 'Red' },
			{ event: 'activate', host: 'h7' },
			{ event: 'activate', host: 'h6' },
			{ event: 'activate', host: 'h7' },
			{ event: 'activate', host: 'h6' },
		],
	},
	{
		name: 'form-arms',
		fixture: 'test/fixtures/FormArms.tsrx',
		actions: [
			{ event: 'activate', host: 'h2' },
			{ event: 'input', host: 'h1', value: 'ann' },
			{ event: 'activate', host: 'h6' },
			{ event: 'input', host: 'h3', value: 'red' },
			{ event: 'activate', host: 'h4' },
			{ event: 'activate', host: 'h5' },
			{ event: 'activate', host: 'h6' },
			{ event: 'activate', host: 'h2' },
			{ event: 'activate', host: 'h6' },
			{ event: 'activate', host: 'h5' },
		],
	},
	{
		name: 'ticks',
		fixture: 'test/fixtures/Ticks.tsrx',
		preferredLanguages: ['fr-CA', 'en'],
		actions: [
			{ event: 'activate', host: 'h5' },
			{ event: 'activate', host: 'h3' },
			{ event: 'activate', host: 'h4' },
			{ event: 'activate', host: 'h4' },
			{ event: 'activate', host: 'h2' },
			{ event: 'activate', host: 'h6' },
			{ event: 'activate', host: 'h6' },
			{ event: 'activate', host: 'h5' },
			{ event: 'activate', host: 'h7' },
		],
	},
	{
		name: 'box-in-arm',
		fixture: 'proofs/r144-box-in-arm/App.tsrx',
		actions: [
			{ event: 'activate', host: 'h5' },
			{ event: 'activate', host: 'h3' },
			{ event: 'activate', host: 'h7' },
			{ event: 'activate', host: 'h6' },
			{ event: 'activate', host: 'h3' },
		],
	},
	{
		name: 'press-bubbles',
		fixture: 'proofs/r165-press-bubbles/App.tsrx',
		actions: [
			{ event: 'activate', host: 'h4' },
			{ event: 'activate', host: 'h5' },
			{ event: 'activate', host: 'h2' },
		],
	},
	{
		name: 'row-live',
		fixture: 'proofs/r166-row-live/App.tsrx',
		actions: [
			{ event: 'activate', host: 'h4' },
			{ event: 'activate', host: 'h4' },
		],
	},
	{
		name: 'radio-follows',
		fixture: 'proofs/r163-radio-follows/App.tsrx',
		modules: true,
		actions: [
			{ event: 'activate', host: 'component-edge:4/h5' },
			{ event: 'activate', host: 'component-edge:7/h5' },
		],
	},
	{
		name: 'ticked-keys',
		fixture: 'test/fixtures/TickedKeys.tsrx',
		actions: [
			{ event: 'activate', host: 'h1' },
			{ event: 'activate', host: 'h2' },
			{ event: 'activate', host: 'h3' },
			{ event: 'activate', host: 'h3' },
		],
	},
	{
		name: 'unset',
		fixture: 'test/fixtures/Unset.tsrx',
		actions: [
			{ event: 'activate', host: 'component-edge:0/h4' },
			{ event: 'activate', host: 'h8' },
			{ event: 'activate', host: 'component-edge:0/h5' },
			{ event: 'activate', host: 'h8' },
		],
	},
	{
		name: 'typed-target',
		fixture: 'test/fixtures/TypedTarget.tsrx',
		actions: [
			{ event: 'input', host: 'component-edge:0/h1', value: 'ada' },
			{ event: 'input', host: 'component-edge:0/h1', value: 'ada' },
			{ event: 'input', host: 'component-edge:0/h1', value: 'bo' },
		],
	},
	{
		name: 'quiet-default',
		fixture: 'test/fixtures/QuietDefault.tsrx',
		actions: [
			{ event: 'activate', host: 'h1' },
			{ event: 'activate', host: 'h2' },
			{ event: 'activate', host: 'h1' },
			{ event: 'activate', host: 'h2' },
			{ event: 'activate', host: 'h1' },
		],
	},
	{
		name: 'notes',
		fixture: 'test/fixtures/Notes.tsrx',
		actions: [
			{ event: 'input', host: 'h1', value: 'First line\nSecond line' },
			{ event: 'activate', host: 'h3' },
			{ event: 'input', host: 'h1', value: 'Again' },
		],
	},
	{
		name: 'projected',
		fixture: 'test/fixtures/Projected.tsrx',
		actions: [{ event: 'activate', host: 'h6' }],
	},
	{
		name: 'live',
		fixture: 'test/fixtures/Live.tsrx',
		actions: [
			{ event: 'activate', host: 'h8' },
			{ event: 'activate', host: 'h8' },
			{ event: 'activate', host: 'h9' },
			{ event: 'activate', host: 'h10' },
		],
	},
	{
		name: 'row-seed',
		fixture: 'test/fixtures/RowSeed.tsrx',
		actions: [
			{ event: 'activate', host: 'component-edge:0/h0@a' },
			{ event: 'activate', host: 'h2' },
			{ event: 'activate', host: 'component-edge:0/h0@c' },
			{ event: 'activate', host: 'h3' },
			{ event: 'activate', host: 'component-edge:0/h0@b' },
			{ event: 'activate', host: 'h4' },
			{ event: 'activate', host: 'component-edge:0/h0@c' },
		],
	},
	{
		name: 'factory-handles',
		fixture: 'test/fixtures/FactoryHandles.tsrx',
		actions: [
			{ event: 'activate', host: 'component-edge:0/h2' },
			{ event: 'activate', host: 'component-edge:2/h2' },
		],
	},
	{
		name: 'hidden-select',
		fixture: 'test/fixtures/HiddenSelect.tsrx',
		actions: [
			{ event: 'activate', host: 'h4' },
			{ event: 'activate', host: 'h4' },
		],
	},
	{
		name: 'field-focus',
		fixture: 'test/fixtures/FieldFocus.tsrx',
		actions: [
			{ event: 'focus', host: 'h1' },
			{ event: 'blur', host: 'h1' },
			{ event: 'focus', host: 'h2' },
			{ event: 'blur', host: 'h2' },
			{ event: 'focus', host: 'h1' },
		],
	},
	{
		name: 'rename',
		fixture: 'test/fixtures/Rename.tsrx',
		actions: [
			{ event: 'activate', host: 'h1' },
			{ event: 'input', host: 'h2', value: 'Final' },
			{ event: 'keydown', host: 'h2', key: 'Enter' },
			{ event: 'activate', host: 'h1' },
		],
	},
	{
		name: 'press-count',
		fixture: 'test/fixtures/PressCount.tsrx',
		actions: [
			{ event: 'activate', host: 'h1' },
			{ event: 'activate', host: 'h1', detail: 1 },
			{ event: 'activate', host: 'h1', detail: 2 },
			{ event: 'activate', host: 'h1', detail: 3 },
		],
	},
	{
		name: 'field-text',
		fixture: 'test/fixtures/FieldText.tsrx',
		actions: [
			{ event: 'activate', host: 'h2' },
			{ event: 'focus', host: 'h1' },
			{ event: 'keydown', host: 'h1', key: 'B' },
			{ event: 'input', host: 'h1', value: 'Bea' },
			{ event: 'keydown', host: 'h1', key: 'Enter' },
			{ event: 'blur', host: 'h1' },
			{ event: 'activate', host: 'h2' },
		],
	},
	{
		name: 'text-keys',
		fixture: 'test/fixtures/TextKeys.tsrx',
		actions: [
			{ event: 'keydown', host: 'h1', key: 'a' },
			{ event: 'input', host: 'h1', value: 'a' },
			{ event: 'keydown', host: 'h1', key: 'Unidentified' },
			{ event: 'input', host: 'h1', value: 'ab' },
			{ event: 'keydown', host: 'h1', key: 'Enter' },
			{ event: 'keydown', host: 'h1', key: 'Unidentified' },
			{ event: 'input', host: 'h1', value: 'c' },
			{ event: 'keydown', host: 'h1', key: 'Backspace' },
			{ event: 'input', host: 'h1', value: '' },
			{ event: 'keydown', host: 'h1', key: 'Backspace' },
			{ event: 'paste', host: 'h1', text: 'x,y' },
			{ event: 'input', host: 'h2', value: 'hi' },
			{ event: 'keydown', host: 'h2', key: 'Enter' },
			{ event: 'keydown', host: 'h2', key: 'Enter' },
			{ event: 'input', host: 'h2', value: '\n' },
		],
	},
	{
		// taglist's field: its key, input and paste handlers run as JavaScript, reading the key and the pasted text, and the
		// Enter they prevent is journalled; a tag's click reads its press count.
		name: 'script-event-fields',
		fixture: 'proofs/u41-taglist/App.tsrx',
		modules: true,
		actions: [
			{ event: 'input', host: 'component-edge:4/h3', value: 'milk' },
			{ event: 'keydown', host: 'component-edge:4/h3', key: 'Enter' },
			{ event: 'input', host: 'component-edge:4/h3', value: 'sugar,' },
			{ event: 'paste', host: 'component-edge:4/h3', text: 'salt,pepper' },
			{ event: 'keydown', host: 'component-edge:4/h3', key: 'Backspace' },
			{ event: 'activate', host: 'component-edge:2/h4@tea', detail: 1 },
		],
	},
	{
		// A press adds document listeners: the moves bubble to them after the element's own handlers, and the lift removes them.
		name: 'document-listeners',
		fixture: 'test/fixtures/DocumentListeners.tsrx',
		actions: [
			{ event: 'pointerdown', host: 'h1', pointerId: 1, x: 20, y: 40, time: 1000 },
			{ event: 'pointermove', host: 'h1', pointerId: 1, x: 20, y: 60, time: 1016 },
			{ event: 'pointermove', host: 'h1', pointerId: 1, x: 20, y: 90, time: 1032 },
			{ event: 'pointerup', host: 'h1', pointerId: 1, x: 20, y: 90, time: 1048 },
			{ event: 'pointerdown', host: 'h1', pointerId: 2, x: 20, y: 40, time: 2000 },
		],
	},
	{
		// A DataTransfer built in a handler and kept in a WeakMap keyed by an element, across two presses.
		name: 'file-store',
		fixture: 'test/fixtures/FileStore.tsrx',
		modules: true,
		actions: [
			{ event: 'activate', host: 'h2' },
			{ event: 'activate', host: 'h2' },
		],
	},
	{
		name: 'script-keys',
		fixture: 'test/fixtures/ScriptKeys.tsrx',
		actions: [
			{ event: 'input', host: 'h1', value: 'blue' },
			{ event: 'keydown', host: 'h1', key: 'Enter' },
			{ event: 'keydown', host: 'h1', key: 'Enter' },
			{ event: 'input', host: 'h1', value: 'red' },
			{ event: 'keydown', host: 'h1', key: 'Unidentified' },
			{ event: 'paste', host: 'h1', text: 'green, ,gold' },
		],
	},
	{
		name: 'text-keyup',
		fixture: 'test/fixtures/TextKeyup.tsrx',
		actions: [
			{ event: 'keydown', host: 'h1', key: 'a' },
			{ event: 'input', host: 'h1', value: 'a' },
			{ event: 'keyup', host: 'h1', key: 'a' },
			{ event: 'keydown', host: 'h1', key: 'Backspace' },
			{ event: 'input', host: 'h1', value: '' },
			{ event: 'keyup', host: 'h1', key: 'Backspace' },
			{ event: 'keydown', host: 'h1', key: 'Backspace' },
			{ event: 'keyup', host: 'h1', key: 'Backspace' },
		],
	},
	{
		name: 'commands',
		fixture: 'test/fixtures/Commands.tsrx',
		actions: [
			{ event: 'activate', host: 'h3' },
			{ event: 'input', host: 'h1', value: 'hi' },
			{ event: 'activate', host: 'h4' },
		],
	},
	{
		name: 'rows',
		fixture: 'test/fixtures/Rows.tsrx',
		actions: [
			{ event: 'activate', host: 'component-edge:0/h1@a' },
			{ event: 'activate', host: 'component-edge:0/h1@b' },
			{ event: 'activate', host: 'component-edge:0/h1@a' },
			{ event: 'activate', host: 'h7@a' },
			{ event: 'activate', host: 'h4' },
			{ event: 'activate', host: 'component-edge:0/h1@c' },
			{ event: 'activate', host: 'h7@c' },
			{ event: 'activate', host: 'h4' },
			{ event: 'activate', host: 'h7@b' },
			{ event: 'activate', host: 'h7@c' },
		],
	},
	{
		name: 'values',
		fixture: 'test/fixtures/Values.tsrx',
		actions: [
			{ event: 'activate', host: 'h5' },
			{ event: 'activate', host: 'h5' },
		],
	},
	{
		name: 'clock',
		fixture: 'test/fixtures/Clock.tsrx',
		now: 1795046400123,
		actions: [{ event: 'activate', host: 'h5' }],
	},
	{
		name: 'load-events',
		fixture: 'test/fixtures/LoadEvents.tsrx',
		actions: [
			{ event: 'idle', host: 'h1' },
			{ event: 'idle', host: 'h1' },
			{ event: 'visible', host: 'h3@b' },
			{ event: 'visible', host: 'h3@b' },
			{ event: 'activate', host: 'h4' },
			{ event: 'idle', host: 'h1' },
			{ event: 'activate', host: 'h4' },
			{ event: 'idle', host: 'h1' },
			{ event: 'visible', host: 'h3@a' },
		],
	},
	{
		// A hint superseded by a surface shown from inside it, a hint shown over a surface, an outside press reaching both, Escape.
		name: 'overlay-hint',
		fixture: 'proofs/u61-overlay-hint/App.tsrx',
		modules: true,
		actions: [
			{ event: 'pointerdown', host: 'h7' },
			{ event: 'pointerup', host: 'h7' },
			{ event: 'activate', host: 'h7' },
			{ event: 'pointerdown', host: 'h10' },
			{ event: 'pointerup', host: 'h10' },
			{ event: 'activate', host: 'h10' },
			{ event: 'pointerdown', host: 'h1' },
			{ event: 'pointerup', host: 'h1' },
			{ event: 'pointerdown', host: 'h4' },
			{ event: 'pointerup', host: 'h4' },
			{ event: 'activate', host: 'h4' },
			{ event: 'dismiss', host: 'h5', reason: 'escape' },
		],
	},
	{
		name: 'element-proxies',
		fixture: 'test/fixtures/OptionFocus.tsrx',
		actions: [
			{ event: 'activate', host: 'h1' },
			{ event: 'activate', host: 'h2' },
			{ event: 'activate', host: 'h3' },
			{ event: 'activate', host: 'h1' },
			{ event: 'activate', host: 'h2' },
			{ event: 'activate', host: 'h4' },
		],
	},
	{
		name: 'element-proxies-shared',
		fixture: 'test/fixtures/SharedOptions.tsrx',
		actions: [
			{ event: 'activate', host: 'component-edge:0/h0' },
			{ event: 'activate', host: 'component-edge:0/h0' },
			{ event: 'activate', host: 'component-edge:1/h4' },
			{ event: 'activate', host: 'component-edge:0/h0' },
		],
	},
	{
		// A tap on each child of the card, its handler reading the event's elements as proxies.
		name: 'pointer-elements',
		fixture: 'proofs/u62-pointer-elements/App.tsrx',
		modules: true,
		actions: [
			{ event: 'pointerdown', host: 'h3' },
			{ event: 'pointerup', host: 'h3' },
			{ event: 'pointerdown', host: 'h5' },
			{ event: 'pointerup', host: 'h5' },
			{ event: 'activate', host: 'h5' },
			{ event: 'pointerdown', host: 'h4' },
			{ event: 'pointerup', host: 'h4' },
		],
	},
	{
		// A CustomEvent, click() and a PointerEvent dispatched from JavaScript, each raised on its element after the script.
		name: 'script-events',
		fixture: 'proofs/u63-script-events/App.tsrx',
		modules: true,
		actions: [
			{ event: 'activate', host: 'h11' },
			{ event: 'activate', host: 'h4' },
			{ event: 'activate', host: 'h7' },
		],
	},
	{
		// A tap's click reports where the touch came up; a click a script raised is untrusted at 0, 0; one no touch made is at 0, 0.
		name: 'click-fields',
		fixture: 'proofs/u65-click-fields/App.tsrx',
		modules: true,
		actions: [
			{ event: 'pointerdown', host: 'h2', pointerId: 1, x: 40, y: 120, time: 1000 },
			{ event: 'pointerup', host: 'h2', pointerId: 1, x: 44, y: 122, time: 1080 },
			{ event: 'activate', host: 'h2' },
			{ event: 'pointerdown', host: 'h3', pointerId: 2, x: 60, y: 200, time: 2000 },
			{ event: 'pointerup', host: 'h3', pointerId: 2, x: 60, y: 200, time: 2080 },
			{ event: 'activate', host: 'h3' },
			{ event: 'activate', host: 'h2' },
		],
	},
	{
		// First values the build cannot know, taken when the screen opens: from JavaScript, from another seeded cell, and from a
		// prop that follows state, which the child keeps after the prop moves, as its body ran once.
		name: 'state-seeds',
		fixture: 'proofs/u66-state-seeds/App.tsrx',
		modules: true,
		actions: [
			{ event: 'activate', host: 'h6' },
			{ event: 'activate', host: 'component-edge:0/h0' },
			{ event: 'activate', host: 'h7' },
		],
	},
	{
		// Each row shows its own @if arm, from its own item: a press in one row flips that row's arm alone.
		name: 'row-arms',
		fixture: 'proofs/u67-row-arms/App.tsrx',
		modules: true,
		actions: [
			{ event: 'activate', host: 'h5@a' },
			{ event: 'activate', host: 'h6' },
			{ event: 'activate', host: 'h7' },
			{ event: 'activate', host: 'h5@b' },
		],
	},
	{
		// A number field: below min, off its step, text that is no number (submitted empty), above max, then a valid save.
		name: 'number-fields',
		fixture: 'proofs/f11-number/App.tsrx',
		modules: true,
		actions: [
			{ event: 'input', host: 'h3', value: '3' },
			{ event: 'activate', host: 'h5' },
			{ event: 'input', host: 'h3', value: '15.5' },
			{ event: 'activate', host: 'h5' },
			{ event: 'input', host: 'h3', value: '1e' },
			{ event: 'activate', host: 'h5' },
			{ event: 'input', host: 'h3', value: '18' },
			{ event: 'input', host: 'h4', value: '12' },
			{ event: 'activate', host: 'h5' },
			{ event: 'input', host: 'h4', value: '1.2' },
			{ event: 'activate', host: 'h5' },
			{ event: 'input', host: 'h4', value: '2.5' },
			{ event: 'activate', host: 'h5' },
		],
	},
	{
		// A @for whose rows are a component gets its list as JavaScript when data cannot run it, once the screen opens.
		name: 'component-rows',
		fixture: 'proofs/u68-component-rows/App.tsrx',
		modules: true,
		actions: [{ event: 'activate', host: 'h4' }],
	},
	{
		// A component an @if arm shows, and state written in the arm, start over each time the arm shows; one outside keeps its state.
		name: 'arm-state',
		fixture: 'proofs/u69-arm-state/App.tsrx',
		actions: [
			{ event: 'activate', host: 'component-edge:0/h0' },
			{ event: 'activate', host: 'component-edge:1/h0' },
			{ event: 'activate', host: 'component-edge:1/h0' },
			{ event: 'activate', host: 'h4' },
			{ event: 'activate', host: 'h3' },
			{ event: 'activate', host: 'h3' },
			{ event: 'activate', host: 'component-edge:1/h0' },
			{ event: 'activate', host: 'h4' },
		],
	},
	{
		// A component an @if arm shows takes its first value from its props each time the arm opens.
		name: 'arm-seed',
		fixture: 'proofs/u71-arm-seed/App.tsrx',
		actions: [
			{ event: 'activate', host: 'h6' },
			{ event: 'activate', host: 'component-edge:0/h2' },
			{ event: 'activate', host: 'h6' },
			{ event: 'activate', host: 'h7' },
			{ event: 'activate', host: 'h6' },
		],
	},
	{
		name: 'dismiss-detail',
		fixture: 'proofs/u60-dismiss-detail/App.tsrx',
		modules: true,
		actions: [
			{ event: 'activate', host: 'h2' },
			{ event: 'pointerdown', host: 'h5' },
			{ event: 'pointerup', host: 'h5' },
			{ event: 'pointerdown', host: 'h3' },
			{ event: 'pointerup', host: 'h3' },
			{ event: 'activate', host: 'h2' },
			{ event: 'pointerdown', host: 'h2' },
			{ event: 'pointerup', host: 'h2' },
			{ event: 'activate', host: 'h2' },
			{ event: 'activate', host: 'h2' },
			{ event: 'dismiss', host: 'h4', reason: 'escape' },
		],
	},
	{
		name: 'active-element',
		fixture: 'proofs/u64-active-element/App.tsrx',
		modules: true,
		actions: [
			{ event: 'activate', host: 'h3' },
			{ event: 'activate', host: 'h4' },
			{ event: 'activate', host: 'h3' },
		],
	},
	{
		name: 'shared-methods',
		fixture: 'test/fixtures/SharedMonth.tsrx',
		actions: [
			{ event: 'activate', host: 'component-edge:0/h0' },
			{ event: 'activate', host: 'component-edge:1/h1' },
			{ event: 'activate', host: 'component-edge:2/h2' },
			{ event: 'activate', host: 'component-edge:0/h0' },
			{ event: 'activate', host: 'component-edge:2/h2' },
		],
	},
	{
		name: 'script-unset',
		fixture: 'test/fixtures/UnsetFirst.tsrx',
		actions: [
			{ event: 'activate', host: 'h2' },
			{ event: 'activate', host: 'h3' },
		],
	},
	{
		name: 'follows',
		fixture: 'proofs/u38-follows/App.tsrx',
		modules: true,
		actions: [
			{ event: 'activate', host: 'h5' },
			{ event: 'activate', host: 'h5' },
			{ event: 'activate', host: 'component-edge:1/h1' },
			{ event: 'activate', host: 'h5' },
		],
	},
	{
		// numberbox's step buttons: a press steps and starts the hold's clock, the lift stops it; a press the platform takes
		// for a scroll steps and is cancelled, which stops it too.
		name: 'press-cancel',
		fixture: 'proofs/u40-numberbox/App.tsrx',
		modules: true,
		actions: [
			{ event: 'pointerdown', host: 'component-edge:4/h5' },
			{ event: 'pointerup', host: 'component-edge:4/h5' },
			{ event: 'pointerdown', host: 'component-edge:2/h4' },
			{ event: 'pointerup', host: 'component-edge:2/h4' },
			{ event: 'pointerdown', host: 'component-edge:4/h5' },
			{ event: 'pointercancel', host: 'component-edge:4/h5' },
		],
	},
	{
		// qr-code: the svg's viewBox and its path's outline follow the code's value; the engine turns each into numbers.
		name: 'live-drawing',
		fixture: 'proofs/u42-qr-code/App.tsrx',
		modules: true,
		actions: [
			{ event: 'activate', host: 'h3' },
		],
	},
	{
		name: 'element-measure',
		fixture: 'test/fixtures/TrackMeasure.tsrx',
		layout: {
			h1: { x: 20, y: 40, width: 320, height: 24, direction: 'ltr' },
			h2: { x: 20, y: 80, width: 320, height: 24, direction: 'rtl' },
		},
		actions: [
			{ event: 'activate', host: 'h3' },
			{ event: 'activate', host: 'h4' },
			{ event: 'activate', host: 'h5' },
		],
	},
	{
		name: 'script-clock-errors',
		fixture: 'test/fixtures/ClockAndErrors.tsrx',
		actions: [
			{ event: 'activate', host: 'h1' },
			{ event: 'activate', host: 'h2' },
			{ event: 'activate', host: 'h3' },
		],
	},
	{
		name: 'script-loop',
		fixture: 'proofs/j1-loop-local/App.tsrx',
		modules: true,
		actions: [
			{ event: 'activate', host: 'h5' },
			{ event: 'activate', host: 'h6' },
			{ event: 'activate', host: 'h5' },
		],
	},
	{
		name: 'script-modules',
		fixture: 'proofs/j2-app-and-library/App.tsrx',
		modules: true,
		actions: [
			{ event: 'activate', host: 'h4' },
			{ event: 'activate', host: 'h4' },
			{ event: 'activate', host: 'h5' },
			{ event: 'activate', host: 'h5' },
		],
	},
	{
		name: 'script-submit',
		fixture: 'proofs/j42-submit-script/App.tsrx',
		modules: true,
		actions: [
			{ event: 'activate', host: 'component-edge:0/h3' },
			{ event: 'input', host: 'component-edge:0/h1', value: 'Groceries' },
			{ event: 'activate', host: 'component-edge:0/h3' },
			{ event: 'input', host: 'component-edge:0/h1', value: 'Call Ada' },
			{ event: 'input', host: 'component-edge:0/h2', value: 'work' },
			{ event: 'activate', host: 'component-edge:0/h3' },
		],
	},
	{
		name: 'script-submit-async',
		fixture: 'proofs/j41-async-submit-script/App.tsrx',
		modules: true,
		actions: [
			{ event: 'input', host: 'h3', value: 'Pump house' },
			{ event: 'activate', host: 'h4' },
			{ event: 'activate', host: 'h4' },
			{ event: 'timer', timer: 'script:1' },
			{ event: 'input', host: 'h3', value: 'admin' },
			{ event: 'activate', host: 'h4' },
			{ event: 'timer', timer: 'script:2' },
		],
	},
	{
		name: 'spread-callback',
		fixture: 'proofs/r117-spread-callback/App.tsrx',
		modules: true,
		actions: [
			{ event: 'activate', host: 'component-edge:0/h0' },
			{ event: 'activate', host: 'component-edge:1/h0' },
			{ event: 'activate', host: 'component-edge:1/h0' },
		],
	},
	{
		name: 'typed-callbacks',
		fixture: 'proofs/r118-typed-callbacks/App.tsrx',
		modules: true,
		actions: [
			{ event: 'activate', host: 'component-edge:0/h1' },
			{ event: 'activate', host: 'component-edge:0/h2' },
		],
	},
	{
		name: 'select-events',
		fixture: 'proofs/r119-select-events/App.tsrx',
		modules: true,
		actions: [
			{ event: 'choose', host: 'h5' },
			{ event: 'choose', host: 'h5' },
			{ event: 'choose', host: 'h3' },
			{ event: 'activate', host: 'h10' },
		],
	},
	{
		name: 'script-structured-clone',
		fixture: 'proofs/j43-structured-clone/App.tsrx',
		modules: true,
		actions: [
			{ event: 'activate', host: 'h2' },
			{ event: 'activate', host: 'h3' },
		],
	},
	{
		name: 'script-async',
		fixture: 'proofs/j3-await-catch/App.tsrx',
		modules: true,
		actions: [
			{ event: 'activate', host: 'h5' },
			{ event: 'timer', timer: 'script:1' },
			{ event: 'activate', host: 'h6' },
			{ event: 'timer', timer: 'script:2' },
		],
	},
	{
		name: 'script-network',
		fixture: 'proofs/j4-timers-fetch/App.tsrx',
		modules: true,
		actions: [
			{ event: 'activate', host: 'h5' },
			{
				event: 'response',
				id: 1,
				response: {
					status: 200,
					statusText: 'OK',
					headers: [['content-type', 'text/plain; charset=utf-8']],
					body: 'POST /j4/echo?word=native text/plain hello',
				},
			},
			{ event: 'activate', host: 'h5' },
			{ event: 'response', id: 2, response: { error: 'The network connection was lost.' } },
			{ event: 'activate', host: 'h6' },
			{ event: 'timer', timer: 'script:1' },
			{ event: 'timer', timer: 'script:1' },
			{ event: 'timer', timer: 'script:1' },
			{ event: 'timer', timer: 'script:1' },
		],
	},
	{
		// Pending, the value, a refresh that holds it, a change while pending, a stale answer dropped, a failed refresh beside
		// the value, a refresh that clears it; the vector's `leave` aborts the request still in flight.
		name: 'script-async-value',
		fixture: 'proofs/j11-async-fetch/App.tsrx',
		modules: true,
		actions: [
			{ event: 'timer', timer: 'script:1' },
			{
				event: 'response',
				id: 1,
				response: {
					status: 200,
					statusText: 'OK',
					headers: [['content-type', 'text/plain; charset=utf-8']],
					body: 'GET /j11/word?word=apple - ',
				},
			},
			{ event: 'activate', host: 'h3' },
			{ event: 'activate', host: 'h4' },
			{ event: 'timer', timer: 'script:3' },
			{ event: 'activate', host: 'h5' },
			{
				event: 'response',
				id: 2,
				response: {
					status: 200,
					statusText: 'OK',
					headers: [['content-type', 'text/plain; charset=utf-8']],
					body: 'GET /j11/word?word=cherry - ',
				},
			},
			{ event: 'timer', timer: 'script:4' },
			{ event: 'activate', host: 'h3' },
			{ event: 'timer', timer: 'script:5' },
			{
				event: 'response',
				id: 3,
				response: {
					status: 200,
					statusText: 'OK',
					headers: [['content-type', 'text/plain; charset=utf-8']],
					body: 'GET /j11/word?word=banana - ',
				},
			},
			{ event: 'activate', host: 'h4' },
			{ event: 'timer', timer: 'script:6' },
		],
	},
	{
		// A @try in an @if arm and one inside it: the inner starts once the outer shows; its failed refresh stays its own;
		// hidden and shown again, a finished value is kept (the failed one as @catch alone) and a run in flight starts over.
		name: 'script-async-nested',
		fixture: 'proofs/j12-async-nested/App.tsrx',
		modules: true,
		actions: [
			{ event: 'timer', timer: 'script:1' },
			{
				event: 'response',
				id: 1,
				response: {
					status: 200,
					statusText: 'OK',
					headers: [['content-type', 'text/plain; charset=utf-8']],
					body: 'GET /j11/word?word=apple - ',
				},
			},
			{ event: 'timer', timer: 'script:2' },
			{
				event: 'response',
				id: 2,
				response: {
					status: 200,
					statusText: 'OK',
					headers: [['content-type', 'text/plain; charset=utf-8']],
					body: 'GET /j11/word?word=pear - ',
				},
			},
			{ event: 'activate', host: 'h5' },
			{ event: 'timer', timer: 'script:3' },
			{ event: 'activate', host: 'h4' },
			{ event: 'activate', host: 'h4' },
			{ event: 'activate', host: 'h6' },
			{ event: 'activate', host: 'h4' },
			{ event: 'activate', host: 'h4' },
			{ event: 'timer', timer: 'script:5' },
		],
	},
	{
		// A @try per list row: each row waits, answers or fails on its own (the riddle's first answer fails: @catch alone).
		name: 'script-async-row',
		fixture: 'proofs/11-async/App.tsrx',
		modules: true,
		actions: [
			{ event: 'activate', host: 'h5' },
			{ event: 'timer', timer: 'script:1' },
			{ event: 'activate', host: 'h6' },
			{ event: 'timer', timer: 'script:2' },
		],
	},
	{
		// Rows that start together and settle apart; a new row starts its own; a row that leaves aborts its lookup.
		name: 'script-async-rows',
		fixture: 'proofs/j13-async-rows/App.tsrx',
		modules: true,
		actions: [
			{ event: 'timer', timer: 'script:1' },
			{ event: 'timer', timer: 'script:2' },
			{
				event: 'response',
				id: 1,
				response: {
					status: 200,
					statusText: 'OK',
					headers: [['content-type', 'text/plain; charset=utf-8']],
					body: 'GET /j11/word?word=apple - ',
				},
			},
			{ event: 'activate', host: 'h6' },
			{ event: 'timer', timer: 'script:3' },
			{ event: 'activate', host: 'h7' },
			{
				event: 'response',
				id: 2,
				response: {
					status: 200,
					statusText: 'OK',
					headers: [['content-type', 'text/plain; charset=utf-8']],
					body: 'GET /j11/word?word=cherry - ',
				},
			},
		],
	},
	{
		// `reset` (an arrow that calls it, and `onClick={reset}`) runs the failed value again with the same key while @catch
		// stays; a key change while that run waits starts over; a later answer shows the value.
		name: 'script-async-retry',
		fixture: 'proofs/j14-async-retry/App.tsrx',
		modules: true,
		actions: [
			{ event: 'timer', timer: 'script:1' },
			{ event: 'activate', host: 'h8' },
			{ event: 'timer', timer: 'script:2' },
			{ event: 'activate', host: 'h9' },
			{ event: 'activate', host: 'h4' },
			{ event: 'timer', timer: 'script:4' },
			{
				event: 'response',
				id: 1,
				response: {
					status: 200,
					statusText: 'OK',
					headers: [['content-type', 'text/plain; charset=utf-8']],
					body: 'GET /j11/word?word=apple - ',
				},
			},
		],
	},
	{
		name: 'script-computed',
		fixture: 'proofs/j5-engine-computed/App.tsrx',
		modules: true,
		actions: [
			{ event: 'activate', host: 'h4' },
			{ event: 'activate', host: 'h5' },
		],
	},
	{
		name: 'script-render',
		fixture: 'proofs/j8-render-values/App.tsrx',
		modules: true,
		actions: [{ event: 'activate', host: 'h4' }],
	},
	{
		// A list in each row of another: inner rows keyed within their outer row, a new outer row with its inner rows.
		name: 'nested-for',
		fixture: 'proofs/20-nested-for/App.tsrx',
		modules: true,
		actions: [
			{ event: 'activate', host: 'h5@Veg' },
			{ event: 'activate', host: 'h6' },
			{ event: 'activate', host: 'h5@Nuts' },
			{ event: 'activate', host: 'h4@Fruit@Pear' },
			{ event: 'activate', host: 'h4@Veg@Fig' },
		],
	},
	{
		// A GET form on another site: typed text, a hidden field, the action's query and fragment, then the submit.
		name: 'form-opens',
		fixture: 'proofs/21-form-opens/App.tsrx',
		modules: true,
		actions: [
			{ event: 'input', host: 'h4', value: 'phone apps & more ✓' },
			{ event: 'activate', host: 'h5' },
			{ event: 'enter', host: 'h4' },
		],
	},
	{
		// A select's change: a different option runs it with that option's value, the same one again does not; data and JavaScript.
		name: 'select-change',
		fixture: 'proofs/22-select-change/App.tsrx',
		modules: true,
		actions: [
			{ event: 'choose', host: 'h4' },
			{ event: 'choose', host: 'h4' },
			{ event: 'choose', host: 'h5' },
			{ event: 'choose', host: 'h8' },
		],
	},
	{
		// Rows read their index: reversed, a row's number follows its place; dropping the first renumbers the rest.
		name: 'row-index',
		fixture: 'proofs/24-row-index/App.tsrx',
		modules: true,
		actions: [
			{ event: 'activate', host: 'h3' },
			{ event: 'activate', host: 'h4' },
		],
	},
	{
		// Rows keyed by position: two rows show the same line, then rows are added, changed and dropped at the end.
		name: 'for-index-key',
		fixture: 'proofs/18-for-index-key/App.tsrx',
		modules: true,
		actions: [
			{ event: 'activate', host: 'h3' },
			{ event: 'activate', host: 'h4' },
			{ event: 'activate', host: 'h5' },
			{ event: 'activate', host: 'h5' },
		],
	},
	{
		// A child's props computed by app functions (`reduce`, `charAt`) run in the script and follow the state they read.
		name: 'script-props',
		fixture: 'proofs/j17-script-prop/App.tsrx',
		modules: true,
		actions: [
			{ event: 'activate', host: 'h2' },
			{ event: 'activate', host: 'h2' },
			{ event: 'activate', host: 'h3' },
		],
	},
	{
		name: 'script-render-list',
		fixture: 'proofs/j9-render-list/App.tsrx',
		modules: true,
		actions: [{ event: 'activate', host: 'h4' }],
	},
	{
		name: 'script-url',
		fixture: 'proofs/j52-url/App.tsrx',
		modules: true,
		actions: [
			{ event: 'activate', host: 'h5' },
			{ event: 'activate', host: 'h6' },
			{ event: 'activate', host: 'h7' },
		],
	},
	{
		name: 'center',
		fixture: 'proofs/r171-center/App.tsrx',
		modules: true,
		actions: [{ event: 'activate', host: 'h4' }],
	},
	{
		// Dashed strokes reach the hosts as even dash lists with their offset.
		name: 'svg-dashes',
		fixture: 'proofs/r172-svg-dashes/App.tsrx',
		modules: true,
		actions: [],
	},
	{
		name: 'details',
		fixture: 'proofs/r145-details/App.tsrx',
		modules: true,
		actions: [
			{ event: 'activate', host: 'h3' },
			{ event: 'activate', host: 'h6' },
			{ event: 'activate', host: 'h6' },
			{ event: 'activate', host: 'h3' },
		],
	},
	{
		// The real modal family: trigger, a press inside the dialog, a press on its backdrop, an alert that refuses one, Escape.
		name: 'overlay',
		fixture: 'proofs/u20-modal/App.tsrx',
		actions: [
			{ event: 'activate', host: 'component-edge:1/h1' },
			{ event: 'pointerdown', host: 'component-edge:4/h4' },
			{ event: 'pointerup', host: 'component-edge:4/h4' },
			{ event: 'pointerdown', host: 'component-edge:2/h2' },
			{ event: 'pointerup', host: 'component-edge:2/h2' },
			{ event: 'activate', host: 'component-edge:1/h1' },
			{ event: 'dismiss', host: 'component-edge:2/h2', reason: 'escape' },
			{ event: 'activate', host: 'component-edge:1/h1' },
			{ event: 'pointerdown', host: 'component-edge:6/h6' },
			{ event: 'pointerup', host: 'component-edge:6/h6' },
			{ event: 'activate', host: 'component-edge:6/h6' },
			{ event: 'activate', host: 'component-edge:8/h1' },
			{ event: 'pointerdown', host: 'component-edge:9/h2' },
			{ event: 'pointerup', host: 'component-edge:9/h2' },
			{ event: 'dismiss', host: 'component-edge:9/h2', reason: 'escape' },
		],
	},
	{
		// The real popover family: not modal; a press outside, a press on its own trigger, Escape, and its close.
		name: 'popover',
		fixture: 'proofs/u21-popover/App.tsrx',
		actions: [
			{ event: 'activate', host: 'component-edge:1/h1' },
			{ event: 'pointerdown', host: 'component-edge:3/h3' },
			{ event: 'pointerup', host: 'component-edge:3/h3' },
			{ event: 'pointerdown', host: 'h2' },
			{ event: 'pointerup', host: 'h2' },
			{ event: 'activate', host: 'component-edge:1/h1' },
			{ event: 'pointerdown', host: 'component-edge:1/h1' },
			{ event: 'pointerup', host: 'component-edge:1/h1' },
			{ event: 'activate', host: 'component-edge:1/h1' },
			{ event: 'activate', host: 'component-edge:1/h1' },
			{ event: 'dismiss', host: 'component-edge:2/h2', reason: 'escape' },
			{ event: 'activate', host: 'component-edge:1/h1' },
			{ event: 'activate', host: 'component-edge:5/h5' },
		],
	},
	{
		// Touches as a phone's browser delivers them (recorded from Safari on iOS and Chrome on Android, see
		// conformance/recorded/): a tap on a child of the pad, a drag the pad captures from that child, a press that releases
		// its capture and moves across elements, a drag a scroll takes, and a second finger.
		name: 'touch',
		fixture: 'test/fixtures/Touch.tsrx',
		actions: [
			{ event: 'pointerdown', host: 'h3', pointerId: 1, x: 40, y: 120, time: 1000 },
			{ event: 'pointerup', host: 'h3', pointerId: 1, x: 40, y: 120, time: 1080 },
			{ event: 'pointerdown', host: 'h3', pointerId: 2, x: 40, y: 120, time: 2000 },
			{ event: 'pointermove', host: 'h3', pointerId: 2, x: 52, y: 118, time: 2016 },
			{ event: 'pointermove', host: 'h4', pointerId: 2, x: 64.5, y: 190, time: 2032 },
			{ event: 'pointerup', host: 'h4', pointerId: 2, x: 64.5, y: 190, time: 2048 },
			{ event: 'pointerdown', host: 'h5', pointerId: 3, x: 40, y: 300, time: 3000 },
			{ event: 'pointermove', host: 'h4', pointerId: 3, x: 40, y: 200, time: 3016 },
			{ event: 'pointermove', host: 'h4', pointerId: 3, x: 40, y: 190, time: 3032 },
			{ event: 'pointerup', host: 'h4', pointerId: 3, x: 40, y: 190, time: 3048 },
			{ event: 'pointerdown', host: 'h4', pointerId: 4, x: 40, y: 190, time: 4000 },
			{ event: 'pointermove', host: 'h4', pointerId: 4, x: 40, y: 180, time: 4016 },
			{ event: 'pointercancel', host: 'h4', pointerId: 4, x: 40, y: 170, time: 4032 },
			{ event: 'pointerdown', host: 'h2', pointerId: 5, x: 30, y: 110, time: 5000 },
			{ event: 'pointerdown', host: 'h4', pointerId: 6, x: 30, y: 190, time: 5010 },
			{ event: 'pointerup', host: 'h4', pointerId: 6, x: 30, y: 190, time: 5100 },
			{ event: 'pointerup', host: 'h2', pointerId: 5, x: 30, y: 110, time: 5110 },
		],
	},
	{
		// The same touch fields, read by pointer handlers that run as JavaScript.
		name: 'touch-script',
		fixture: 'test/fixtures/TouchScript.tsrx',
		actions: [
			{ event: 'pointerdown', host: 'h2', pointerId: 1, x: 40, y: 120, time: 1000 },
			{ event: 'pointermove', host: 'h2', pointerId: 1, x: 52.5, y: 118, time: 1016 },
			{ event: 'pointerup', host: 'h2', pointerId: 1, x: 52.5, y: 118, time: 1032 },
			{ event: 'pointerdown', host: 'h2', pointerId: 2, x: 30, y: 100, time: 2000 },
			{ event: 'pointercancel', host: 'h2', pointerId: 2, x: 30, y: 90, time: 2016 },
		],
	},
	{
		// A handle bound inside an @if arm: the element only while the arm is drawn, so not in the press that opens it.
		name: 'arm-handle',
		fixture: 'proofs/j44-arm-handle/App.tsrx',
		actions: [
			{ event: 'activate', host: 'h5' },
			{ event: 'activate', host: 'h6' },
			{ event: 'activate', host: 'h2' },
			{ event: 'activate', host: 'h5' },
			{ event: 'activate', host: 'h6' },
			{ event: 'focus', host: 'h3' },
			{ event: 'activate', host: 'h7' },
			{ event: 'activate', host: 'h5' },
			{ event: 'activate', host: 'h2' },
			{ event: 'activate', host: 'h4' },
			{ event: 'focus', host: 'h3' },
		],
	},
	{
		// A readonly text field: submitted, but left out of the checks a submit runs, so its `required` stops nothing.
		name: 'readonly-field',
		fixture: 'proofs/j48-readonly-field/App.tsrx',
		actions: [
			{ event: 'activate', host: 'h5' },
			{ event: 'activate', host: 'h4' },
			{ event: 'activate', host: 'h5' },
			{ event: 'input', host: 'h3', value: 'SAVE10' },
			{ event: 'activate', host: 'h5' },
		],
	},
	{
		// Live regions whose aria-live and role follow state: the payload carries their politeness as expressions.
		name: 'live-follows',
		fixture: 'test/fixtures/LiveFollows.tsrx',
		actions: [
			{ event: 'activate', host: 'h3' },
			{ event: 'activate', host: 'h4' },
			{ event: 'activate', host: 'h3' },
			{ event: 'activate', host: 'h5' },
		],
	},
	{
		// A system sheet in an @if arm: open only while the arm is shown, closed with it, open again when it comes back.
		name: 'sheet-in-arm-shop',
		fixture: 'proofs/26-sheet-in-arm/App.tsrx',
		modules: true,
		actions: [
			{ event: 'activate', host: 'h3' },
			{ event: 'activate', host: 'h6' },
			{ event: 'activate', host: 'h8' },
			{ event: 'activate', host: 'h6' },
			{ event: 'activate', host: 'h9' },
			{ event: 'activate', host: 'h3' },
		],
	},
	{
		// Long presses as Chrome on Android raises `contextmenu`: on a row's inner element, it reaches the row then the list;
		// on the list itself; on an element whose handler runs as JavaScript.
		name: 'contextmenu',
		fixture: 'test/fixtures/ContextMenu.tsrx',
		actions: [
			{ event: 'contextmenu', host: 'h4@Apple', x: 40, y: 120, time: 900 },
			{ event: 'contextmenu', host: 'h2', x: 10, y: 5, time: 1500 },
			{ event: 'contextmenu', host: 'h5', x: 52.5, y: 300, time: 2000 },
			{ event: 'contextmenu', host: 'h4@Pear', x: 41, y: 160, time: 2600 },
		],
	},
];

/** Each committed navigation vector file: a navigation rung's app, the path it opens at and the actions it records. */
export const APP_CONFORMANCE_CASES: ReadonlyArray<{
	readonly name: string;
	readonly app: string;
	readonly open: string;
	readonly actions: ReadonlyArray<NativeAppAction>;
}> = [
	{
		name: 'navigation',
		app: 'proofs/n2-orders',
		open: '/orders',
		actions: [
			{ event: 'activate', host: 'h3' },
			{ event: 'activate', host: 'component-edge:0@42' },
			{ event: 'back' },
			{ event: 'activate', host: 'component-edge:0@108' },
		],
	},
	{
		name: 'app-shared',
		app: 'proofs/n11-app-shared',
		open: '/',
		actions: [
			{ event: 'activate', host: 'component-edge:1/h1' },
			{ event: 'activate', host: 'component-edge:2' },
			{ event: 'activate', host: 'component-edge:1/h1' },
			{ event: 'back' },
		],
	},
	{
		// Each screen has its own runtime over the device's one store: Back shows the screen below the storage() value a
		// screen above wrote, with its texts and arms following.
		name: 'storage-back',
		app: 'proofs/u227-storage-back',
		open: '/',
		actions: [
			{ event: 'activate', host: 'component-edge:0' },
			{ event: 'activate', host: 'h4' },
			{ event: 'back' },
		],
	},
	{
		name: 'navigation-replace',
		app: 'proofs/n3-navigate',
		open: '/',
		actions: [
			{ event: 'activate', host: 'h3' },
			{ event: 'activate', host: 'h3' },
			{ event: 'back' },
		],
	},
	{
		name: 'navigation-deep-link',
		app: 'proofs/n4-deep-link',
		open: '/orders/42',
		actions: [
			{ event: 'back' },
			{ event: 'back' },
			{ event: 'activate', host: 'component-edge:0' },
		],
	},
	{
		// An app-scoped shared() is one copy for every screen: the second screen reads what the first wrote, and Back shows
		// the first screen the copy as the second left it.
		name: 'app-shared-player',
		app: 'proofs/n7-app-shared',
		open: '/',
		actions: [
			{ event: 'activate', host: 'component-edge:0/h2' },
			{ event: 'activate', host: 'component-edge:1' },
			{ event: 'activate', host: 'component-edge:0/h2' },
			{ event: 'back' },
		],
	},
	{
		// A plain <a href> to one of the app's pages opens it in place with its params, as a <Link> does.
		name: 'plain-links',
		app: 'proofs/n6-plain-links',
		open: '/',
		actions: [
			{ event: 'activate', host: 'h3' },
			{ event: 'back' },
			{ event: 'activate', host: 'h4' },
			{ event: 'back' },
			{ event: 'activate', host: 'h6' },
			{ event: 'activate', host: 'h5' },
			{ event: 'back' },
		],
	},
	{
		name: 'script-navigate',
		app: 'proofs/j16-script-navigate',
		open: '/',
		actions: [
			{ event: 'activate', host: 'h5' },
			{ event: 'activate', host: 'h6' },
			{ event: 'activate', host: 'h4' },
			{ event: 'activate', host: 'h3' },
			{ event: 'back' },
		],
	},
	{
		name: 'script-app',
		app: 'proofs/j6-engine-on-demand',
		open: '/',
		actions: [
			{ event: 'activate', host: 'h3' },
			{ event: 'activate', host: 'component-edge:0' },
			{ event: 'activate', host: 'h4' },
		],
	},
	{
		name: 'navigation-deep-link',
		app: 'proofs/n4-deep-link',
		open: '/orders/42',
		actions: [
			{ event: 'back' },
			{ event: 'back' },
			{ event: 'activate', host: 'component-edge:0' },
		],
	},
	{
		name: 'script-first-render',
		app: 'proofs/j10-first-render',
		open: '/',
		actions: [
			{ event: 'activate', host: 'h3' },
			{ event: 'activate', host: 'component-edge:0' },
		],
	},
	{
		name: 'shell-props',
		app: 'proofs/r139-shell-props',
		open: '/',
		actions: [
			{ event: 'activate', host: 'component-edge:1' },
			{ event: 'activate', host: 'h0' },
			{ event: 'activate', host: 'h0' },
			{ event: 'back' },
		],
	},
	{
		name: 'link-attributes',
		app: 'proofs/r140-link-attributes',
		open: '/',
		actions: [
			{ event: 'activate', host: 'h2' },
			{ event: 'activate', host: 'component-edge:1' },
			{ event: 'back' },
			{ event: 'activate', host: 'component-edge:0/component-edge:1' },
		],
	},
];
