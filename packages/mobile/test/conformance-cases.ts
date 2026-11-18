import type { NativeAction } from '../src/index.ts';
import { readWorkspaceModule } from '../src/harness/rung.ts';

/** Resolves what a case imports (`@markless/ui`) from packages/mobile, where the case's `src/<name>.tsrx` stands. */
export const readCaseModule = (specifier: string, importer: string) =>
	readWorkspaceModule(specifier, importer.startsWith('src/') ? `packages/mobile/${importer}` : importer);

/** Each committed vector file: its component (a path inside packages/mobile) and the actions it records. */
export const CONFORMANCE_CASES: ReadonlyArray<{
	readonly name: string;
	readonly fixture: string;
	/** For a page: its page file (the router derives the route) and the params it opens with. */
	readonly page?: string;
	readonly params?: Readonly<Record<string, string>>;
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
];
