import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

// The page's dispatch queue holds the next event until a handler finishes or first awaits
// its own work; the emitted handler says which awaits are the author's.

async function handlerModules(source: string): Promise<string[]> {
	const compiled = await compileTsrxModule({ filename: 'src/page.tsrx', source, symbols: [] });
	expect(compiled.symbolModules.diagnostics).toEqual([]);
	return compiled.symbolModules.modules
		.filter((module) => module.kind === 'event-handler')
		.map((module) => module.source);
}

test('an await the author wrote releases the queue before it waits, in nested functions too', async () => {
	const [handler] = await handlerModules(`import { state } from '@markless/core';
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
export default function Page() @{
	let phase = state('idle');
	<button onClick={async () => {
		phase = 'saving';
		await pause(10);
		const later = async () => { await pause(20); };
		await later();
		phase = 'saved';
	}}>save</button>
}`);
	expect(handler).toContain('await (context.releaseQueue?.(), pause(10))');
	expect(handler).toContain('await (context.releaseQueue?.(), pause(20))');
	expect(handler).toContain('await (context.releaseQueue?.(), later())');
});

test('a handler with no await of its own never releases the queue', async () => {
	const handlers = await handlerModules(`import { state } from '@markless/core';
export default function Page() @{
	let count = state(0);
	<button onClick={() => (count = count + 1)}>{count}</button>
}`);
	expect(handlers.join('\n')).not.toContain('releaseQueue');
});

test('the await the shared-method inliner adds is not the author’s', async () => {
	const handlers = await handlerModules(`import { shared, state } from '@markless/core';
export const boxState = shared(
	() => {
		const box = state({ checked: false });
		return {
			...box,
			onChange: undefined as ((next: boolean) => void) | undefined,
			toggle() {
				box.checked = !box.checked;
				box.onChange?.(box.checked);
			},
		};
	},
	{ scope: 'widget' },
);
export function BoxRoot({ onChange, children }) @{
	const box = boxState();
	box.onChange = onChange;
	<div ui-checked={box.checked}>{children}</div>
}
export function BoxTrigger({ children }) @{
	const box = boxState();
	<button onClick={() => box.toggle()}>{children}</button>
}`);
	const trigger = handlers.find((source) => source.includes('await (async'));
	expect(trigger).toBeDefined();
	expect(trigger).not.toContain('releaseQueue');
});
