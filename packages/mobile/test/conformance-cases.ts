import type { NativeAction, NativeAppAction } from '../src/index.ts';
import type { DeviceAppConfig } from '../src/permissions.ts';

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
];
