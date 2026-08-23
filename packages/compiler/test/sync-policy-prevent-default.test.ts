import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

// The radio-group item shape: a part that spreads consumer props onto its own
// element, destructures the same event name it also handles, sits inside an
// imported part's children slot, and guards preventDefault by event fields
// alone. Reading only the emitted symbol module or only the SSR module source
// makes this shape look like a silent drop, so both halves are pinned here.
const wrapperModule = `
export function VisuallyHidden({ children }) @{
	<span data-visually-hidden>{children}</span>
}
`;

const fieldModule = `
import { state } from '@markless/core';
import { VisuallyHidden } from './visually-hidden.tsrx';

export function Field({ onKeydown, ...rest }) @{
	let moves = state(0);

	<VisuallyHidden>
		<input
			{...rest}
			type="text"
			data-field
			onKeydown={(event) => {
				if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
					event.preventDefault();
				}
				moves++;
				onKeydown?.(event);
			}}
		/>
		<output data-field-moves>{moves}</output>
	</VisuallyHidden>
}
`;

const guardedKeydownPolicy = {
	when: {
		type: 'or',
		conditions: [
			{ type: 'event-equals', field: 'key', value: 'ArrowDown' },
			{ type: 'event-equals', field: 'key', value: 'ArrowUp' },
		],
	},
	actions: ['preventDefault'],
};

async function compileField() {
	const wrapper = await compileTsrxModule({
		filename: 'src/visually-hidden.tsrx',
		source: wrapperModule,
		symbols: [],
	});
	return compileTsrxModule({
		filename: 'src/field.tsrx',
		source: fieldModule,
		symbols: [],
		importedModuleInterfaces: { './visually-hidden.tsrx': wrapper.moduleGraphInterface },
	});
}

test('a guarded preventDefault reaches the shipped view payload, not just the semantic graph', async () => {
	const field = await compileField();

	expect(field.semanticGraph.diagnostics).toEqual([]);
	expect(field.semanticGraph.events).toEqual([
		expect.objectContaining({
			eventName: 'keydown',
			hasSyncPolicyCandidate: true,
			syncPolicy: guardedKeydownPolicy,
		}),
	]);
	// The payload view is what the browser reads at capture, so this record - not
	// the semantic graph - is the one that decides whether the default action is
	// cancelled before the handler symbol loads.
	expect(field.payloadScripts.view.events).toEqual([
		expect.objectContaining({ eventName: 'keydown', syncPolicy: guardedKeydownPolicy }),
	]);
	expect(field.protocolView.events).toEqual([
		expect.objectContaining({ eventName: 'keydown', syncPolicy: guardedKeydownPolicy }),
	]);
});

test('the lazy handler symbol keeps the guard and drops the extracted call', async () => {
	const field = await compileField();
	const handlerSymbol = field.symbolModules.modules.find((module) =>
		module.source.includes("event.key === 'ArrowDown'"),
	);

	expect(handlerSymbol).toBeDefined();
	// The guard body is empty on purpose: the payload view's sync policy owns the
	// cancellation, so leaving the call here too would apply it twice.
	expect(handlerSymbol?.source).toContain(
		"if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {}",
	);
	expect(handlerSymbol?.source).not.toContain('preventDefault');
	// The graph write in the same handler stays lazy.
	expect(handlerSymbol?.source).toContain('state:moves');
});

test('the SSR module reads the payload view rather than inlining the policy', async () => {
	const field = await compileField();
	const ssr = field.publicRenderModule.ssrModuleSource;

	// Reading the SSR module source alone cannot show the policy, because the
	// record lives in the `payloadView` binding the bundler emits beside it.
	expect(ssr).not.toContain('syncPolicy');
	expect(ssr).toContain('payloadView');
});
