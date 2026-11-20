import type { NativeAction, NativeAppAction } from '../src/index.ts';
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
		name: 'script-render-list',
		fixture: 'proofs/j9-render-list/App.tsrx',
		modules: true,
		actions: [{ event: 'activate', host: 'h4' }],
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
		name: 'app-shared',
		app: 'proofs/n5-app-shared',
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
