import { expect, test } from 'vitest';
import { collectTsrxModuleDiagnostics, compileTsrxModule } from '../src/index.ts';
import type { ServerOnlyProp } from '../src/index.ts';
import {
	SERVER_ONLY_PROP_BROWSER_READ_CODE,
	SERVER_ONLY_PROPS_PASS_ID,
} from '../src/passes/server-only-props.ts';

const HTTP: ServerOnlyProp = {
	exportName: 'default',
	propName: 'http',
	description: 'the request, its cookies and headers, and the response being written',
};

async function serverOnlyDiagnostics(
	source: string,
	serverOnlyProps: readonly ServerOnlyProp[] = [HTTP],
) {
	const compiled = await compileTsrxModule({
		filename: 'pages/invoice.tsrx',
		source,
		symbols: [],
		...(serverOnlyProps.length > 0 ? { serverOnlyProps } : {}),
	});
	return {
		compiled,
		diagnostics: collectTsrxModuleDiagnostics(compiled).filter(
			(diagnostic) => diagnostic.code === SERVER_ONLY_PROP_BROWSER_READ_CODE,
		),
	};
}

const handlerRead = `
import { state } from '@markless/core';

export default function Invoice({ http }: { http: { request: Request } }) @{
	let count = state(0);
	<button onClick={() => console.log(http.request.headers.get('cookie'), count++)}>{count}</button>
}
`;

test('a handler that reads a server-only prop is refused at the read', async () => {
	const { compiled, diagnostics } = await serverOnlyDiagnostics(handlerRead);

	expect(diagnostics).toHaveLength(1);
	expect(diagnostics[0]).toMatchObject({
		severity: 'error',
		passId: SERVER_ONLY_PROPS_PASS_ID,
		propName: 'http',
		componentName: 'Invoice',
		docsUrl: `https://markless.dev/errors/${SERVER_ONLY_PROP_BROWSER_READ_CODE}`,
	});
	expect(diagnostics[0]!.message).toContain('an event handler');
	expect(diagnostics[0]!.message).toContain(HTTP.description);
	const span = diagnostics[0]!.primarySpan!;
	expect(handlerRead.slice(span.start, span.end)).toContain('http');
	expect(compiled.serverOnlyProps.passId).toBe(SERVER_ONLY_PROPS_PASS_ID);
});

test('the same source compiles clean when the host declares no server-only prop', async () => {
	expect((await serverOnlyDiagnostics(handlerRead, [])).diagnostics).toEqual([]);
});

test.each([
	[
		'a computed that re-derives in the browser',
		`import { state, computed } from '@markless/core';
export default function Invoice({ http }: { http: { url: URL } }) @{
	let count = state(0);
	const label = computed(() => count + http.url.pathname);
	<button onClick={() => count++}>{label}</button>
}`,
	],
	[
		'an async computed',
		`import { state, computed } from '@markless/core';
export default function Invoice({ http }: { http: { url: URL } }) @{
	let count = state(0);
	const later = computed(async () => (await fetch(http.url.href)).status);
	<button onClick={() => count++}>{count}</button>
	@try {
		<p>{later}</p>
	} @pending {
		<p>loading</p>
	}
}`,
	],
	[
		'an attach behavior',
		`export default function Invoice({ http }: { http: { url: URL } }) @{
	<div attach={(element) => console.log(element, http.url.pathname)}>x</div>
}`,
	],
	[
		'an attach behavior through a local alias',
		`export default function Invoice(props: { http: { url: URL } }) @{
	const path = props.http.url.pathname;
	<div attach={(element) => console.log(element, path)}>x</div>
}`,
	],
	[
		'a branch arm the browser rebuilds',
		`import { state } from '@markless/core';
export default function Invoice(props: { http: { url: URL } }) @{
	let open = state(false);
	<button onClick={() => (open = !open)}>toggle</button>
	@if (open) {
		<p>{props.http.url.pathname}</p>
	}
}`,
	],
	[
		'a prop passed to a child that reads it in the browser',
		`function Badge({ label }: { label: string }) @{
	<button onClick={() => console.log(label)}>{label}</button>
}
export default function Invoice({ http }: { http: { url: URL } }) @{
	<Badge label={http.url.pathname} />
}`,
	],
])('%s that reads a server-only prop is refused', async (_shape, source) => {
	const { diagnostics } = await serverOnlyDiagnostics(source);
	expect(diagnostics.length).toBeGreaterThan(0);
	expect(diagnostics.every((diagnostic) => diagnostic.severity === 'error')).toBe(true);
});

test('reads and writes that stay in the server render compile clean', async () => {
	const { compiled } = await serverOnlyDiagnostics(`
import { state } from '@markless/core';

export default function Invoice({ http, params }: { http: { url: URL; response: { status?: number } }; params: { id: string } }) @{
	if (params.id === 'missing') http.response.status = 404;
	let path = state(http.url.pathname);
	const shown = http.url.search;
	<p>{shown}</p>
	<button onClick={() => console.log(path, params.id)}>{path}</button>
}
`);

	expect(
		collectTsrxModuleDiagnostics(compiled).filter(
			(diagnostic) => diagnostic.severity === 'error',
		),
	).toEqual([]);
});

test('without the declaration, a body write to the same prop stays refused as graph state', async () => {
	const { compiled } = await serverOnlyDiagnostics(
		`import { state } from '@markless/core';
export default function Invoice({ http }: { http: { response: { status?: number } } }) @{
	http.response.status = 404;
	let count = state(0);
	<button onClick={() => count++}>{count}</button>
}`,
		[],
	);

	expect(collectTsrxModuleDiagnostics(compiled).map((diagnostic) => diagnostic.code)).toContain(
		'MARKLESS_STATE_READ_ONLY_WRITE',
	);
});

test('the rule follows the declared prop and export, not one spelling', async () => {
	const source = `
import { state } from '@markless/core';

export function Ledger(input: { secret: { token: string }; http: string }) @{
	let shown = state(false);
	<button onClick={() => console.log(input.secret.token, input.http, (shown = true))}>open</button>
}
`;
	const declared: ServerOnlyProp = {
		exportName: 'Ledger',
		propName: 'secret',
		description: 'a session token',
	};

	const { diagnostics } = await serverOnlyDiagnostics(source, [declared]);
	expect(diagnostics.map((diagnostic) => diagnostic.propName)).toEqual(['secret']);
	expect(diagnostics[0]!.componentName).toBe('Ledger');
	expect((await serverOnlyDiagnostics(source, [HTTP])).diagnostics).toEqual([]);
});
