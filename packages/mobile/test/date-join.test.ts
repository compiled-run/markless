import { describe, expect, it } from 'vitest';
import { compileNativeComponent, createNativeRuntime } from '../src/index.ts';
import { nodeScriptHost } from '../src/node-engine.ts';

// An English medium date with a time reads as Chrome writes it, whichever engine runs the phone's JavaScript.

const formatted = async (expression: string) => {
	const { payload, diagnostics } = await compileNativeComponent({
		filename: 'app/App.tsrx',
		source: `import { state } from '@markless/core';
const when = new Date(Date.UTC(2026, 10, 19, 9, 30));
export default function App() @{
	let text = state('');
	<button onClick={() => { text = String(${expression}); }}>{text}</button>
}
`,
	});
	expect(diagnostics).toEqual([]);
	const runtime = createNativeRuntime(
		payload!,
		new Map(),
		{},
		undefined,
		undefined,
		nodeScriptHost(),
	);
	const [entry] = runtime.dispatch({ event: 'activate', host: payload!.events[0]!.host });
	// ICU writes a narrow no-break space before AM in some builds and a plain one in others; the join is what is checked.
	return (entry as { value: string }).value.replace(/\s/g, ' ');
};

describe('a medium date with a time in English', () => {
	it('joins the date and the time with a comma, as Chrome does', async () => {
		expect(
			await formatted(
				`new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(when)`,
			),
		).toBe('Nov 19, 2026, 9:30 AM');
		expect(
			await formatted(
				`new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(when)`,
			),
		).toBe('19 Nov 2026, 09:30');
		expect(
			await formatted(
				`when.toLocaleString('en', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' })`,
			),
		).toBe('Nov 19, 2026, 9:30 AM');
		expect(
			await formatted(
				`new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).formatToParts(when).map((part) => part.value).join('')`,
			),
		).toBe('Nov 19, 2026, 9:30 AM');
	});

	it('leaves every other style and locale to the engine', async () => {
		expect(
			await formatted(
				`new Intl.DateTimeFormat('en', { dateStyle: 'long', timeStyle: 'short', timeZone: 'UTC' }).format(when)`,
			),
		).toBe('November 19, 2026 at 9:30 AM');
		expect(
			await formatted(
				`new Intl.DateTimeFormat('de', { dateStyle: 'long', timeStyle: 'short', timeZone: 'UTC' }).format(when)`,
			),
		).toBe('19. November 2026 um 09:30');
	});
});
