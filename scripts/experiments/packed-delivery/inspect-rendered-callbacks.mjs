import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
	createCallbackProbe,
	instrumentCallbackProvenance,
} from './rendered-callback-provenance.mjs';
import { decodePayloadScripts } from '../../../packages/serializer/src/protocol-client-storage.ts';
import { protocolStateVersion } from '../../../packages/serializer/src/protocol-constants.ts';
import { planMdxResumeGroups } from './mdx-resume-groups.ts';
import { marklessInvokeCallbackSlot } from '../../../packages/web/src/fns/callback-slot.ts';

const [original, url, outputPath] = process.argv.slice(2);
if (!original || !url || !outputPath)
	throw new Error('Usage: inspect-rendered-callbacks.mjs <.output> <route-url> <report.json>');
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const directory = mkdtempSync('/private/tmp/markless-rendered-callbacks-');
cpSync(original, directory + '/.output', { recursive: true });
const transforms = [];
for (const filename of readdirSync(original + '/server/_ssr')) {
	if (!filename.endsWith('.mjs')) continue;
	const source = readFileSync(original + '/server/_ssr/' + filename, 'utf8');
	if (
		!source.includes('function marklessSsrCallbackSlot(') &&
		!source.includes('function composeMdxState(')
	)
		continue;
	const result = instrumentCallbackProvenance(source);
	writeFileSync(directory + '/.output/server/_ssr/' + filename, result.source);
	transforms.push({
		filename,
		instrumented: result.instrumented,
		beforeSha256: sha256(source),
		afterSha256: sha256(result.source),
	});
}
assert.deepEqual(transforms.flatMap((item) => item.instrumented).sort(), [
	'composeMdxState',
	'marklessSsrCallbackSlot',
]);
const originalEntry = await import(pathToFileURL(original + '/server/_ssr/ssr.mjs').href);
const originalResponse = await originalEntry.fetch(new Request(url));
assert.equal(originalResponse.status, 200);
const originalHtml = await originalResponse.text();
const probe = createCallbackProbe();
globalThis.__marklessRenderedCallbackProbe = probe;
const privateEntry = await import(pathToFileURL(directory + '/.output/server/_ssr/ssr.mjs').href);
const response = await privateEntry.fetch(new Request(url));
assert.equal(response.status, 200);
const html = await response.text();
assert.equal(html, originalHtml, 'Diagnostic instrumentation changed rendered output');
assert.ok(probe.renders.length > 0, 'No MDX composition was observed');
const renders = probe.renders.map((render) => ({
	...render,
	callbacks: render.callbacks.map((callback) => {
		const invoked = [];
		marklessInvokeCallbackSlot(
			{ graph: { read: () => callback.symbolId }, invokeSymbol: (id) => invoked.push(id) },
			callback.graphNodeId,
			[],
		);
		const prefix = render.prefixes.find((value) => callback.graphNodeId.startsWith(value));
		return {
			...callback,
			bound: callback.symbolId !== undefined,
			resolvedSymbolId: invoked[0],
			ownerPrefix: prefix,
			staysWithinOwner: prefix !== undefined && invoked.every((id) => id.startsWith(prefix)),
		};
	}),
}));
const payloadScript = (type) => {
	const start = html.indexOf('<script type="markless/' + type + '">');
	assert.ok(start >= 0, 'Missing ' + type + ' payload');
	return html.slice(start, html.indexOf('</script>', start) + 9);
};
const { state, view } = decodePayloadScripts({
	stateScript: payloadScript('state'),
	viewScript: payloadScript('view'),
});
const callbackBindings = renders.flatMap((render) =>
	render.callbacks.map((callback) => ({
		graphNodeId: callback.graphNodeId,
		value: callback.symbolId,
		symbolId: callback.resolvedSymbolId,
	})),
);
const children = renders.flatMap((render) =>
	render.prefixes.map((prefix) => ({
		prefix,
		state: {
			version: protocolStateVersion([]),
			cells: state.cells.filter((record) => record.graphNodeId.startsWith(prefix)),
			computed: state.computed.filter((record) => record.graphNodeId.startsWith(prefix)),
			sharedSeeds: state.sharedSeeds?.filter((record) =>
				record.graphNodeId.startsWith(prefix),
			),
			sharedDefinitions: state.sharedDefinitions?.filter((record) =>
				record.id.startsWith(prefix),
			),
		},
	})),
);
const planned = planMdxResumeGroups({ children, state, view, callbackBindings });
const planning = {
	candidateGroups: planned.groups.map((group) => ({
		id: group.id,
		cells: group.state.cells.length,
		computed: group.state.computed.length,
		events: group.view.events.length,
	})),
	refusals: planned.refusals,
};
const report = {
	original,
	directory,
	url,
	planning,
	htmlSha256: sha256(html),
	htmlBytes: Buffer.byteLength(html),
	identicalHtml: true,
	transforms,
	renders,
	productionReady: false,
	limitation:
		'Rendered slot provenance and callback dispatch resolution only. No linked symbol dependency closure, incremental runtime activation or timing claim.',
};
writeFileSync(outputPath, JSON.stringify(report, null, 2) + '\n');
console.log(
	JSON.stringify({
		directory,
		planning,
		htmlBytes: report.htmlBytes,
		renders: renders.map((render) => ({
			prefixes: render.prefixes,
			callbackCount: render.callbacks.length,
			boundCount: render.callbacks.filter((callback) => callback.bound).length,
			foreignCallbacks: render.callbacks.filter((callback) => !callback.staysWithinOwner),
			unknownCells: render.unknownCells,
		})),
	}),
);
delete globalThis.__marklessRenderedCallbackProbe;
