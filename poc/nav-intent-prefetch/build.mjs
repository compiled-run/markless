import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { compileTsrxModule } from '../../packages/compiler/src/index.ts';

const root = path.dirname(fileURLToPath(import.meta.url));
const output = path.join(root, 'dist');
const source = fs.readFileSync(path.join(root, 'src', 'PageB.tsrx'), 'utf8');
const compiled = await compileTsrxModule({
	filename: 'poc/nav-intent-prefetch/src/PageB.tsrx',
	source,
	symbols: [],
});
const diagnostics = [
	...(compiled.diagnostics ?? []),
	...(compiled.symbolModules.diagnostics ?? []),
	...(compiled.publicRenderModule.diagnostics ?? []),
];
if (diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
	throw new Error(diagnostics.map((diagnostic) => diagnostic.message).join('\n'));
}

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(path.join(output, 'symbols'), { recursive: true });
for (const file of ['client.mjs', 'derive.mjs', 'prefetch.mjs', 'index.html'])
	fs.copyFileSync(path.join(root, 'src', file), path.join(output, file));

const symbolLoaders = [];
for (const module of compiled.symbolModules.modules) {
	const filename = `${module.symbolId.replace(':', '-')}.mjs`;
	fs.writeFileSync(path.join(output, 'symbols', filename), module.source);
	symbolLoaders.push(
		`${JSON.stringify(module.symbolId)}: () => import(${JSON.stringify(`./symbols/${filename}`)}).then((module) => module[${JSON.stringify(module.exportName)}])`,
	);
}
const artifact = [
	`export const protocolState = ${JSON.stringify(compiled.protocolState, null, '\t')};`,
	`export const protocolView = ${JSON.stringify(compiled.protocolView, null, '\t')};`,
	`const symbolLoaders = {\n\t${symbolLoaders.join(',\n\t')}\n};`,
	'export function loadSymbol(symbolId) {',
	'\tconst load = symbolLoaders[symbolId];',
	'\tif (!load) throw new Error(`Compiled symbol ${symbolId} is not present`);',
	'\treturn load();',
	'}',
	'',
].join('\n\n');
fs.writeFileSync(path.join(output, 'route-b-artifact.mjs'), artifact);

const receipt = {
	schemaVersion: 1,
	source: 'src/PageB.tsrx',
	protocolFields: {
		state: ['cells', 'computed[].graphNodeId', 'computed[].async', 'computed[].dependencies'],
		view: ['asyncBoundaries[].asyncReads[].graphNodeId', 'asyncRunners'],
	},
	asyncRunners: compiled.protocolView.asyncRunners,
	computed: compiled.protocolState.computed,
};
fs.writeFileSync(
	path.join(output, 'build-receipt.json'),
	`${JSON.stringify(receipt, null, '\t')}\n`,
);
console.log(
	`Built navigation-intent POC: ${compiled.protocolState.computed.length} computeds, ${Object.keys(compiled.protocolView.asyncRunners ?? {}).length} async runners`,
);
