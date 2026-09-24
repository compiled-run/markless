import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { decodePayloadScripts } from '../../../packages/serializer/src/protocol-client-storage.ts';
import { protocolStateVersion } from '../../../packages/serializer/src/protocol-constants.ts';
import { planMdxResumeGroups } from './mdx-resume-groups.ts';

const [htmlPath, prefix, outputPath] = process.argv.slice(2);
if (!htmlPath || !prefix || !outputPath)
	throw new Error('Usage: inspect-mdx-resume-ownership.mjs <html> <prefix> <report.json>');
const html = readFileSync(htmlPath, 'utf8');
const payload = (type) => {
	const match = html.match(new RegExp(`<script type="markless/${type}">([\\s\\S]*?)</script>`));
	if (!match) throw new Error(`Missing ${type} payload`);
	return match[0];
};
const { state, view } = decodePayloadScripts({
	stateScript: payload('state'),
	viewScript: payload('view'),
});
const owns = (id) => id.startsWith(prefix);
const storage = state.storage?.filter((record) => owns(record.graphNodeId));
const local = {
	version: protocolStateVersion(storage),
	cells: state.cells.filter((record) => owns(record.graphNodeId)),
	computed: state.computed.filter((record) => owns(record.graphNodeId)),
	sharedSeeds: state.sharedSeeds?.filter((record) => owns(record.graphNodeId)),
	sharedDefinitions: state.sharedDefinitions?.filter((record) => owns(record.id)),
	storage,
};
const planned = planMdxResumeGroups({ children: [{ prefix, state: local }], state, view });
const report = {
	htmlPath,
	htmlSha256: createHash('sha256').update(html).digest('hex'),
	prefix,
	counts: {
		cells: local.cells.length,
		computed: local.computed.length,
		sharedSeeds: local.sharedSeeds?.length ?? 0,
		sharedDefinitions: local.sharedDefinitions?.length ?? 0,
		events: view.events.filter((record) => owns(record.hostNodeId)).length,
		handles: view.elementHandles.filter((record) => owns(record.hostNodeId)).length,
	},
	candidateGroups: planned.groups.map((group) => group.id),
	refusals: planned.refusals,
	compilerCaptureProof: 'not established by payload records',
	productionReady: false,
};
writeFileSync(outputPath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
