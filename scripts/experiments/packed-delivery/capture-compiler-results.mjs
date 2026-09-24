import { registerHooks } from 'node:module';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { instrumentCompilerResult } from './compiler-probe-source.mjs';

const directory = process.env.MARKLESS_COMPILE_PROBE_DIR;
if (!directory) throw new Error('MARKLESS_COMPILE_PROBE_DIR is required');
mkdirSync(directory, { recursive: true });
const sha = (value) => createHash('sha256').update(value).digest('hex');
globalThis.__marklessCompilerResultProbe = (input, result) => {
	const record = {
		filename: input.filename,
		moduleId: input.moduleId,
		sourceSha256: sha(input.source),
		inputSymbols: input.symbols,
		importedModuleInterfaces: input.importedModuleInterfaces,
		moduleGraphInterface: result.moduleGraphInterface,
		componentEdges: result.semanticGraph.componentEdges,
		sharedDefinitions: result.semanticGraph.sharedDefinitions,
		symbolResolver: result.symbolResolver,
		captureAnalysis: result.captureAnalysis,
		boundSymbolResolver: result.boundSymbolResolver,
		protocolState: result.protocolState,
		protocolView: result.protocolView,
		triggerGroups: result.triggerGroups,
	};
	const json = JSON.stringify(record);
	writeFileSync(directory + '/' + sha(json) + '.json', json + '\n');
};
registerHooks({
	load(url, context, nextLoad) {
		const loaded = nextLoad(url, context);
		if (!loaded.source || !['module', 'module-typescript'].includes(loaded.format))
			return loaded;
		const source =
			typeof loaded.source === 'string'
				? loaded.source
				: Buffer.from(loaded.source).toString('utf8');
		if (!source.includes('memoizedCompile(input, () => runCompile(input))')) return loaded;
		const changed = instrumentCompilerResult(source);
		if (changed.matched)
			appendFileSync(
				directory + '/hooks.ndjson',
				JSON.stringify({
					pid: process.pid,
					url,
					beforeSha256: sha(source),
					afterSha256: sha(changed.source),
				}) + '\n',
			);
		return changed.matched ? { ...loaded, source: changed.source } : loaded;
	},
});
