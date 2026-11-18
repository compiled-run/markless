// The Async page says a retry loop inside a computed cannot count into the page's own state: each shape a port tried is refused.
import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

const page = (declarations: string, computedBody: string) => `import { computed, state } from '@markless/core';

async function retrying<T>(run: () => Promise<T>, onAttempt: (attempt: number) => void): Promise<T> {
	for (let attempt = 1; ; attempt++) {
		onAttempt(attempt);
		try {
			return await run();
		} catch (error) {
			if (attempt === 3) throw error;
		}
	}
}

async function load(): Promise<string> {
	return 'ready';
}

export default function Attempts() @{
	let attempt = state(1);
	${declarations}
	const data = computed(async () => ${computedBody});

	<div>
		@try {
			<p>{data}</p>
		} @pending {
			<p>Attempt {attempt} of 3</p>
		}
	</div>
}
`;

async function errorCodes(source: string) {
	const result = await compileTsrxModule({ filename: 'src/Attempts.tsrx', source, symbols: [] });
	return [
		...result.semanticGraph.diagnostics,
		...result.stateLowering.diagnostics,
		...result.symbolModules.diagnostics,
	].flatMap((diagnostic) => (diagnostic.severity === 'error' ? [diagnostic.code] : []));
}

test('a callback written inside the computed that sets the attempt is a state write in a computed', async () => {
	expect(await errorCodes(page('', 'retrying(load, (n) => (attempt = n))'))).toContain(
		'MARKLESS_STATE_WRITE_IN_COMPUTED',
	);
});

test('a direct write after an await inside the computed is a state write in a computed', async () => {
	expect(
		await errorCodes(page('', '{ await Promise.resolve(); attempt = 2; return load(); }')),
	).toContain('MARKLESS_STATE_WRITE_IN_COMPUTED');
});

test('a setter declared outside the computed and handed to the loop is refused', async () => {
	expect(
		await errorCodes(
			page('const onAttempt = (n: number) => {\n\t\tattempt = n;\n\t};', 'retrying(load, onAttempt)'),
		),
	).toContain('MARKLESS_CAPTURE_UNSUPPORTED_VALUE');
});
