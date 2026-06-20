import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/compile-module.ts';
import { validateCompilerPassGraph } from '../src/pass-graph.ts';
import { defaultCompilerPasses } from '../src/pass-registry.ts';
import { analyzeCaptures } from '../src/passes/capture-analysis.ts';
import { emitClientEventOnlyEntry } from '../src/passes/client-event-only-entry.ts';
import { renderPayloadScriptArtifact } from '../src/passes/payload-scripts.ts';
import { createProtocolStatePayloadFromArena } from '../src/passes/protocol-state.ts';
import { createProtocolViewPayload } from '../src/passes/protocol-view.ts';
import { buildSemanticGraph } from '../src/passes/semantic-graph/index.ts';
import { emitSymbolModules } from '../src/passes/symbol-modules.ts';

test('compiler split modules expose their owning boundaries', () => {
	expect(defaultCompilerPasses.map((pass) => pass.passId)).toEqual([
		'tsrx-semantic-graph',
		'state-lowering',
		'payload-arena',
		'symbol-resolver',
		'capture-analysis',
		'protocol-state',
		'protocol-view',
		'payload-scripts',
		'client-event-only-entry',
		'symbol-modules',
		'symbol-resolver-module',
	]);
	expect(typeof validateCompilerPassGraph).toBe('function');
	expect(typeof compileTsrxModule).toBe('function');
	expect(typeof analyzeCaptures).toBe('function');
	expect(typeof buildSemanticGraph).toBe('function');
	expect(typeof createProtocolStatePayloadFromArena).toBe('function');
	expect(typeof createProtocolViewPayload).toBe('function');
	expect(typeof renderPayloadScriptArtifact).toBe('function');
	expect(typeof emitClientEventOnlyEntry).toBe('function');
	expect(typeof emitSymbolModules).toBe('function');
});
