import { planMdxResumeGroups } from './mdx-resume-groups.ts';
import type {
	ProtocolStatePayload,
	ProtocolViewPayload,
} from '../../../packages/serializer/src/protocol.ts';
import {
	protocolInstancePath,
	protocolStateVersion,
} from '../../../packages/serializer/src/protocol-constants.ts';

export function isolateUncheckedMdxPayload(html: string, prefix: string): string {
	if (!prefix || protocolInstancePath(prefix) !== prefix)
		throw new Error('Invalid diagnostic scope');
	const owns = (id: string) => id.startsWith(prefix);
	const statePattern = /(<script type="markless\/state">)([\s\S]*?)(<\/script>)/;
	const viewPattern = /(<script type="markless\/view">)([\s\S]*?)(<\/script>)/;
	const stateMatch = statePattern.exec(html),
		viewMatch = viewPattern.exec(html);
	if (!stateMatch || !viewMatch) throw new Error('Scope probe requires state and view payloads');
	const state: ProtocolStatePayload = JSON.parse(stateMatch[2]!);
	const view: ProtocolViewPayload = JSON.parse(viewMatch[2]!);
	const storage = state.storage?.filter((record) => owns(record.graphNodeId));
	const selectedState: ProtocolStatePayload = {
		...state,
		version: protocolStateVersion(storage),
		cells: state.cells.filter((record) => owns(record.graphNodeId)),
		computed: state.computed.filter((record) => owns(record.graphNodeId)),
		sharedSeeds: state.sharedSeeds?.filter((record) => owns(record.graphNodeId)),
		sharedDefinitions: state.sharedDefinitions?.filter((record) => owns(record.id)),
		storage,
	};
	const selectedView: ProtocolViewPayload = {
		...view,
		locators: view.locators.filter((record) => owns(record.hostNodeId)),
		events: view.events.filter((record) => owns(record.hostNodeId)),
		domUpdates: view.domUpdates.filter((record) => owns(record.hostNodeId)),
		behaviors: view.behaviors.filter((record) => owns(record.hostNodeId)),
		elementHandles: view.elementHandles.filter((record) => owns(record.hostNodeId)),
		asyncBoundaries: view.asyncBoundaries.filter((record) => owns(record.id)),
		branches: view.branches?.filter((record) => owns(record.id)),
		keyedRepeats: view.keyedRepeats?.filter((record) => owns(record.id)),
		asyncRunners:
			view.asyncRunners &&
			Object.fromEntries(Object.entries(view.asyncRunners).filter(([id]) => owns(id))),
	};
	if (!selectedView.events.length) throw new Error('Diagnostic scope has no events');
	const json = (value: unknown) => JSON.stringify(value).replaceAll('<', '\\u003c');
	return html
		.replace(statePattern, (_match, open, _value, close) => open + json(selectedState) + close)
		.replace(viewPattern, (_match, open, _value, close) => open + json(selectedView) + close);
}

export function isolateMdxPayload(html: string, prefix: string): string {
	const statePattern = /(<script type="markless\/state">)([\s\S]*?)(<\/script>)/;
	const viewPattern = /(<script type="markless\/view">)([\s\S]*?)(<\/script>)/;
	const stateMatch = statePattern.exec(html);
	const viewMatch = viewPattern.exec(html);
	if (!stateMatch || !viewMatch) throw new Error('Scope probe requires state and view payloads');
	const state: ProtocolStatePayload = JSON.parse(stateMatch[2]!);
	const view: ProtocolViewPayload = JSON.parse(viewMatch[2]!);
	const local: ProtocolStatePayload = {
		version: protocolStateVersion([]),
		cells: state.cells.filter((record) => record.graphNodeId.startsWith(prefix)),
		computed: state.computed.filter((record) => record.graphNodeId.startsWith(prefix)),
		sharedSeeds: state.sharedSeeds?.filter((record) => record.graphNodeId.startsWith(prefix)),
		sharedDefinitions: state.sharedDefinitions?.filter((record) =>
			record.id.startsWith(prefix),
		),
	};
	const { groups } = planMdxResumeGroups({ children: [{ prefix, state: local }], state, view });
	if (groups.length !== 1)
		throw new Error('Scope probe refused a connected or unsupported scope');
	const group = groups[0]!;
	const json = (value: unknown) => JSON.stringify(value).replaceAll('<', '\\u003c');
	return html
		.replace(statePattern, (_match, open, _value, close) => open + json(group.state) + close)
		.replace(viewPattern, (_match, open, _value, close) => open + json(group.view) + close);
}
