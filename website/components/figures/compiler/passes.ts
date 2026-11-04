// Pass ids and their order come from the compiler's registry; only the plain-words line is ours.
import { defaultCompilerPasses } from '../../../../packages/compiler/src/pass-registry.ts';

const DOES: Readonly<Record<string, string>> = {
	'tsrx-semantic-graph': 'Reads the file into the semantic graph.',
	'state-lowering': 'Turns state reads and writes into graph reads and writes.',
	'payload-arena': 'Plans the state record and the view record.',
	'symbol-resolver': 'Plans one symbol per handler and per update.',
	'render-data': 'Splits the elements into fixed HTML and the slots that change.',
	'public-render-plan': 'Collects scoped styles and decides what the render modules can write.',
	'capture-analysis': 'Checks that each symbol reads only what can cross to the browser.',
	'protocol-state': 'Writes the state record.',
	'protocol-view': 'Writes the view record, with symbol IDs on each entry.',
	'public-render-module': 'Writes the browser and server render modules.',
	'server-only-props': 'Stops the compile if browser code reads a prop the server keeps to itself.',
	'payload-scripts': 'Writes the markless/state and markless/view script tags.',
	'symbol-modules': 'Writes one module per symbol.',
	'runtime-demand-map': 'Lists the runtime code each symbol and record needs.',
	'trigger-groups': 'Groups each event with the state, records and symbols it touches.',
	'symbol-resolver-module': 'Writes the module that loads symbols by ID.',
};

export type PassLine = { readonly id: string; readonly does: string };

export const passLines: ReadonlyArray<PassLine> = defaultCompilerPasses.map((pass) => ({
	id: pass.passId,
	does: DOES[pass.passId] ?? pass.description,
}));

export const describedPassIds: ReadonlyArray<string> = Object.keys(DOES);
