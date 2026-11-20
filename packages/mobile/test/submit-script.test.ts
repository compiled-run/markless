import { describe, expect, it } from 'vitest';
import { compileNativeComponent, createNativeRuntime } from '../src/index.ts';
import { nodeScriptHost } from '../src/node-engine.ts';

// A form's submit handler that the data path cannot lower runs as JavaScript on the phone, as on the web: its event is
// at the form, FormData reads the fields the form sends, and it must call preventDefault() before it awaits or returns.

const files: Record<string, string> = {
	'app/saved.ts': `export function added(saved: string, site: string, urgent: boolean): string {
	const id = (41 + 1).toString(36);
	return JSON.stringify([...JSON.parse(saved), { id, site, urgent }]);
}
`,
};
const readModule = (specifier: string) => {
	const filename = `app/${specifier.replace('./', '')}`;
	return filename in files ? { filename, source: files[filename]! } : undefined;
};
const build = (handler: string) =>
	compileNativeComponent({
		filename: 'app/App.tsrx',
		source: `import { state } from '@markless/core';
import { added } from './saved.ts';
export default function App() @{
	let saved = state('[]');
	<main>
	<form onSubmit={${handler}}>
		<input name="site" />
		<input type="checkbox" name="urgent" />
		<button>{'Save'}</button>
	</form>
	<p>{saved}</p>
	</main>
}
`,
		readModule,
	});

describe('a submit handler running as JavaScript', () => {
	it('reads its form through FormData and writes what its helper returns', async () => {
		const { payload, diagnostics } = await build(
			`(event) => {
			event.preventDefault();
			const data = new FormData(event.currentTarget);
			saved = added(saved, String(data.get('site')), data.has('urgent') && event.target === event.currentTarget);
		}`,
		);
		expect(diagnostics).toEqual([]);
		const runtime = createNativeRuntime(
			payload!,
			new Map(),
			{},
			undefined,
			undefined,
			nodeScriptHost(),
		);
		runtime.dispatch({ event: 'input', host: 'h2', value: 'Pump house' });
		runtime.dispatch({ event: 'activate', host: 'h3' });
		expect(runtime.dispatch({ event: 'activate', host: 'h4' })).toContainEqual({
			op: 'text',
			node: 'h5:text0',
			value: '[{"id":"16","site":"Pump house","urgent":true}]',
		});
		runtime.dispatch({ event: 'input', host: 'h2', value: 'Tank' });
		runtime.dispatch({ event: 'activate', host: 'h3' });
		expect(runtime.dispatch({ event: 'enter', host: 'h2' })).toContainEqual({
			op: 'text',
			node: 'h5:text0',
			value: '[{"id":"16","site":"Pump house","urgent":true},{"id":"16","site":"Tank","urgent":false}]',
		});
	});

	it('is refused when it may await or return before event.preventDefault(), as the web would send the form away', async () => {
		const { payload, diagnostics } = await build(
			`async (event) => {
			const data = new FormData(event.currentTarget);
			if (data.get('site') === '') return;
			event.preventDefault();
			saved = added(saved, String(data.get('site')), false);
		}`,
		);
		expect(payload).toBeNull();
		expect(diagnostics.map((d) => d.message)).toEqual([
			'the submit handler on the <form> h1 does not call `event.preventDefault()` on every path before it awaits or returns: the web then sends the form to its action and loads a new page, which a phone app has no server or page for',
		]);
	});

	it('prevents on both arms of an if', async () => {
		const { diagnostics } = await build(
			`(event) => {
			if (saved === '[]') { event.preventDefault(); } else { event.preventDefault(); }
			saved = added(saved, String(new FormData(event.currentTarget).get('site')), false);
		}`,
		);
		expect(diagnostics).toEqual([]);
	});
});
