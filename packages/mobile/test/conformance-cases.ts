import type { NativeAction } from '../src/index.ts';

/** Each committed vector file: its component (a path inside packages/mobile) and the actions it records. */
export const CONFORMANCE_CASES: ReadonlyArray<{
	readonly name: string;
	readonly fixture: string;
	/** For a page: its page file (the router derives the route) and the params it opens with. */
	readonly page?: string;
	readonly params?: Readonly<Record<string, string>>;
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
		name: 'commands',
		fixture: 'test/fixtures/Commands.tsrx',
		actions: [
			{ event: 'activate', host: 'h3' },
			{ event: 'input', host: 'h1', value: 'hi' },
			{ event: 'activate', host: 'h4' },
		],
	},
];
