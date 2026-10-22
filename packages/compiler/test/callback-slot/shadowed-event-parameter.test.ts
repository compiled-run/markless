import { stripTypeScriptTypes } from 'node:module';
import { expect, test } from 'vitest';
import { compileTsrxModule } from '../../src/index.ts';

// A shared method's own `next` is that method's binding, not the handler's event parameter of the same name.
const SOURCE = `import { shared, state } from '@markless/core';
export const pickState = shared(
	() => {
		const pick = state({ value: '' });
		return {
			...pick,
			onPick: undefined as ((value: string) => void) | undefined,
			choose(raw: string) {
				const PARAM = raw + '!';
				pick.value = PARAM;
				pick.onPick?.(PARAM);
			},
		};
	},
	{ scope: 'widget' },
);

export function PickRoot({ onPick }) @{
	const pick = pickState();
	pick.onPick = onPick;
	<button onClick={(PARAM) => pick.choose('a' + PARAM.type)}>{pick.value}</button>
}

export function App() @{
	let seen = state('none');
	<main>
		<PickRoot onPick={(value: string) => (seen = value)} />
		<output>{seen}</output>
	</main>
}
`;

async function load(source: string) {
	const body = stripTypeScriptTypes(source).replace(/^import .*$/gm, '');
	const loaded = await import('data:text/javascript;base64,' + Buffer.from(body).toString('base64'));
	return Object.values(loaded).find((value) => typeof value === 'function') as (
		context: unknown,
	) => Promise<unknown>;
}

for (const name of ['next', 'event', 'value']) {
	test(`a method local named like the handler's parameter (${name}) keeps its own value`, async () => {
		const result = await compileTsrxModule({
			filename: 'src/pick.tsrx',
			source: SOURCE.replaceAll('PARAM', name),
			symbols: [],
		});
		expect(result.captureAnalysis.diagnostics).toEqual([]);
		const handler = result.symbolModules.modules.find((module) => module.kind === 'event-handler')!;
		const writes: unknown[] = [];
		const invoked: unknown[] = [];
		(globalThis as Record<string, unknown>).marklessInvokeCallbackSlot = (
			_context: unknown,
			_slot: string,
			args: unknown[],
		) => invoked.push(...args);
		await (await load(handler.source))({
			event: { type: 'click' },
			graph: { read: () => '', write: (write: { value: unknown }) => writes.push(write.value) },
		});
		expect(writes).toEqual(['aclick!']);
		expect(invoked).toEqual(['aclick!']);
	});
}
