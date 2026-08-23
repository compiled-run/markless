import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

// A native form submit is the harshest deadline the sync policy has: the
// browser navigates the page the moment the dispatch finishes, so a
// preventDefault that waits for the lazy handler symbol never runs at all.
// Every shape below is measured against the payload view, because that record -
// not the semantic graph - is what the browser reads at capture.

const unconditionalPolicy = {
	when: { type: 'constant-truthy', value: true },
	actions: ['preventDefault'],
};

async function compilePage(source: string) {
	return compileTsrxModule({ filename: 'src/page.tsrx', source, symbols: [] });
}

test('an unconditional preventDefault on onSubmit is extracted into the sync policy', async () => {
	const page = await compilePage(`
import { state } from '@markless/core';

export default function Page() @{
	const form = state({ saved: '' });

	<form onSubmit={(event) => {
		event.preventDefault();
		form.saved = 'yes';
	}}>
		<button type="submit">Save</button>
	</form>
}
`);

	expect(page.semanticGraph.diagnostics).toEqual([]);
	expect(page.payloadScripts.view.events).toEqual([
		expect.objectContaining({ eventName: 'submit', syncPolicy: unconditionalPolicy }),
	]);
	expect(page.protocolView.events).toEqual([
		expect.objectContaining({ eventName: 'submit', syncPolicy: unconditionalPolicy }),
	]);
	// The policy owns the cancellation now, so the lazy symbol must not repeat it.
	const handlerSymbol = page.symbolModules.modules.find((module) =>
		module.source.includes('state:form'),
	);
	expect(handlerSymbol?.source).not.toContain('preventDefault');
});

test('a preventDefault guarded by event fields alone is extracted for onSubmit', async () => {
	const page = await compilePage(`
import { state } from '@markless/core';

export default function Page() @{
	const form = state({ saved: '' });

	<form onSubmit={(event) => {
		if (event.type === 'submit') {
			event.preventDefault();
		}
		form.saved = 'yes';
	}}>
		<button type="submit">Save</button>
	</form>
}
`);

	expect(page.semanticGraph.diagnostics).toEqual([]);
	expect(page.payloadScripts.view.events).toEqual([
		expect.objectContaining({
			eventName: 'submit',
			syncPolicy: {
				when: { type: 'event-equals', field: 'type', value: 'submit' },
				actions: ['preventDefault'],
			},
		}),
	]);
});

test('a preventDefault guarded by graph state is extracted as a graph read', async () => {
	const page = await compilePage(`
import { state } from '@markless/core';

export default function Page() @{
	const form = state({ locked: true, saved: '' });

	<form onSubmit={(event) => {
		if (form.locked) {
			event.preventDefault();
		}
		form.saved = 'yes';
	}}>
		<button type="submit">Save</button>
	</form>
}
`);

	// Graph state is in the resumable data plane, so the condition is readable
	// before the symbol loads and the policy stands.
	expect(page.semanticGraph.diagnostics).toEqual([]);
	expect(page.payloadScripts.view.events).toEqual([
		expect.objectContaining({
			eventName: 'submit',
			syncPolicy: {
				when: { type: 'graph-truthy', graphNodeId: 'state:form', path: ['locked'] },
				actions: ['preventDefault'],
			},
		}),
	]);
});

test('a preventDefault the extractor cannot prove refuses at compile time', async () => {
	const page = await compilePage(`
import { state } from '@markless/core';

export default function Page() @{
	const form = state({ saved: '' });

	<form onSubmit={(event) => {
		if (event.target.checkValidity()) {
			event.preventDefault();
		}
		form.saved = 'yes';
	}}>
		<button type="submit">Save</button>
	</form>
}
`);

	// Refusing at build time is the whole point: the alternative is a page that
	// navigates away at runtime with nothing said about it.
	expect(page.semanticGraph.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
		'MARKLESS_SYNC_POLICY_UNEXTRACTABLE',
	]);
	expect(page.payloadScripts.view.events).toEqual([
		expect.objectContaining({ eventName: 'submit', syncPolicy: undefined }),
	]);
});

test('a submit policy survives into a keyed row record, not just the template host', async () => {
	const page = await compilePage(`
import { state } from '@markless/core';

export default function Page() @{
	const page = state({ rows: [{ id: 'a' }], saved: '' });

	<ul>
		@for (const row of page.rows; key row.id) {
			<li>
				<form onSubmit={(event) => {
					event.preventDefault();
					page.saved = row.id;
				}}>
					<button type="submit">Save</button>
				</form>
			</li>
		}
	</ul>
}
`);

	expect(page.semanticGraph.diagnostics).toEqual([]);
	// Cloned rows dispatch through this record; the template host's copy never
	// reaches them.
	expect(page.protocolView.keyedRepeats?.[0]?.rowEvents).toEqual([
		expect.objectContaining({ eventName: 'submit', syncPolicy: unconditionalPolicy }),
	]);
});

const spreadPartModule = `
export function Fieldset({ children, ...rest }) @{
	<form {...rest} data-part-form>{children}</form>
}
`;

async function compileWithPart(consumerSource: string) {
	const part = await compileTsrxModule({
		filename: 'src/fieldset.tsrx',
		source: spreadPartModule,
		symbols: [],
	});
	return compileTsrxModule({
		filename: 'src/page.tsrx',
		source: consumerSource,
		symbols: [],
		importedModuleInterfaces: { './fieldset.tsrx': part.moduleGraphInterface },
	});
}

test('an onSubmit forwarded through a part spread carries its policy across the edge', async () => {
	const page = await compileWithPart(`
import { state } from '@markless/core';
import { Fieldset } from './fieldset.tsrx';

export default function Page() @{
	const form = state({ saved: '' });

	<Fieldset onSubmit={(event) => {
		event.preventDefault();
		form.saved = 'yes';
	}}>
		<button type="submit">Save</button>
	</Fieldset>
}
`);

	expect(page.semanticGraph.diagnostics).toEqual([]);
	// This is the headless-family shape: the consumer writes the handler, the
	// part owns the <form>. The record lands on the part's host, so the policy
	// has to travel with the callback prop.
	expect(page.protocolView.events).toEqual([
		expect.objectContaining({ eventName: 'submit', syncPolicy: unconditionalPolicy }),
	]);
});

test('an unprovable onSubmit forwarded through a part spread refuses rather than navigating', async () => {
	const page = await compileWithPart(`
import { state } from '@markless/core';
import { Fieldset } from './fieldset.tsrx';

export default function Page() @{
	const form = state({ saved: '' });

	<Fieldset onSubmit={(event) => {
		if (event.target.checkValidity()) {
			event.preventDefault();
		}
		form.saved = 'yes';
	}}>
		<button type="submit">Save</button>
	</Fieldset>
}
`);

	expect(page.semanticGraph.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
		'MARKLESS_SYNC_POLICY_UNEXTRACTABLE',
	]);
});

test('keydown extraction is unchanged by the submit work', async () => {
	const page = await compilePage(`
import { state } from '@markless/core';

export default function Page() @{
	let moves = state(0);

	<input onKeydown={(event) => {
		if (event.key === 'ArrowDown') {
			event.preventDefault();
		}
		moves++;
	}} />
}
`);

	expect(page.semanticGraph.diagnostics).toEqual([]);
	expect(page.payloadScripts.view.events).toEqual([
		expect.objectContaining({
			eventName: 'keydown',
			syncPolicy: {
				when: { type: 'event-equals', field: 'key', value: 'ArrowDown' },
				actions: ['preventDefault'],
			},
		}),
	]);
});
