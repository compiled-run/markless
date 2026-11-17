import type { NativeAction } from '../src/index.ts';

/** Each committed vector file: its component fixture and the actions it records. */
export const CONFORMANCE_CASES: ReadonlyArray<{
	readonly name: string;
	readonly fixture: string;
	readonly actions: ReadonlyArray<NativeAction>;
}> = [
	{
		name: 'counter',
		fixture: 'Counter.tsrx',
		actions: [
			{ event: 'activate', host: 'h2' },
			{ event: 'activate', host: 'h2' },
		],
	},
	{
		name: 'switches',
		fixture: 'Switches.tsrx',
		actions: [
			{ event: 'activate', host: 'h3' },
			{ event: 'activate', host: 'h3' },
			{ event: 'activate', host: 'h4' },
			{ event: 'activate', host: 'h4' },
		],
	},
];
