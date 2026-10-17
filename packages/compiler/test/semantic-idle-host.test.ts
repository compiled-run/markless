import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

// The direct renderer holds every element it creates, so it hands idle hosts to the
// queue by the paths its own event records carry; nothing finds them in the DOM later.

const compile = async (name: string, body: string) =>
	(
		await compileTsrxModule({
			filename: `src/${name}.tsrx`,
			source: `import { state } from '@markless/core';
export function App() @{
	let runs = state(0);
	${body}
}`,
			symbols: [],
		})
	).publicRenderModule.moduleSource;

test('the direct client module queues each idle host by its record path', async () => {
	const source = await compile(
		'DirectIdle',
		'<main><b>{runs}</b><section onIdle={() => runs++}>later</section></main>',
	);
	expect(source).toContain(
		"import { queueMarklessIdleHosts } from '@markless/web/fns/idle-trigger';",
	);
	expect(source).toContain('queueMarklessIdleHosts(root, [[1]]);');
	expect(source).not.toContain('data-markless-idle');
});

test('an idle host that is the component root is queued by the empty path', async () => {
	const source = await compile(
		'DirectRootIdle',
		'<section onIdle={() => runs++}>{runs}</section>',
	);
	expect(source).toContain('queueMarklessIdleHosts(root, [[]]);');
});

test('a direct module without an idle host never names the queue', async () => {
	const source = await compile(
		'DirectClick',
		'<main><section onClick={() => runs++}>{runs}</section></main>',
	);
	expect(source).not.toBe('');
	expect(source).not.toContain('idle-trigger');
});
