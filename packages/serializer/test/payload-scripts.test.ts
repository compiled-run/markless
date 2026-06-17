import { expect, test } from 'vitest';
import {
	createProtocolStatePayload,
	renderPayloadScripts,
	deserializeGraphValue,
} from '../src/index.ts';
import type { ProtocolViewPayload } from '@arcadejs/protocol';

test('renderPayloadScripts emits canonical arcade/state and arcade/view data scripts', () => {
	const shared = { id: 1 };
	const state = createProtocolStatePayload({
		cells: [
			{
				graphNodeId: 'state:menu',
				name: 'menu',
				valueKind: 'object',
				value: { open: true, author: shared, assignee: shared },
			},
		],
		computed: [{ graphNodeId: 'computed:details', name: 'details', async: true }],
	});
	const view: ProtocolViewPayload = {
		version: 1,
		locators: [{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'input' }],
		events: [
			{
				hostNodeId: 'h0',
				eventName: 'keydown',
				symbolIds: ['symbol:0'],
			},
		],
		domUpdates: [],
		behaviors: [],
		elementHandles: [],
		asyncBoundaries: [],
	};

	const scripts = renderPayloadScripts({ state, view });

	expect(scripts.stateScript).toMatch(/^<script type="arcade\/state">/);
	expect(scripts.stateScript).toMatch(/<\/script>$/);
	expect(scripts.viewScript).toMatch(/^<script type="arcade\/view">/);
	expect(scripts.viewScript).toMatch(/<\/script>$/);
	expect(scripts.state.cells[0].value).toBeDefined();

	const decodedMenu = deserializeGraphValue(scripts.state.cells[0].value!) as {
		author: unknown;
		assignee: unknown;
	};
	expect(decodedMenu.author).toBe(decodedMenu.assignee);
	expect(scripts.view.events[0].symbolIds).toEqual(['symbol:0']);
});
