import { expect, test } from 'vitest';
import {
	createProtocolStatePayload,
	deserializeGraphValue,
	MARKLESS_STATE_SCRIPT_TYPE,
	MARKLESS_VIEW_SCRIPT_TYPE,
	renderPayloadScripts,
} from '../src/index.ts';
import type { ProtocolViewPayload } from '@markless/serializer';

test('renderPayloadScripts emits canonical markless/state and markless/view data scripts', () => {
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

	expect(scripts.stateScript).toMatch(
		new RegExp(`^<script type="${MARKLESS_STATE_SCRIPT_TYPE}">`),
	);
	expect(scripts.stateScript).toMatch(/<\/script>$/);
	expect(scripts.viewScript).toMatch(new RegExp(`^<script type="${MARKLESS_VIEW_SCRIPT_TYPE}">`));
	expect(scripts.viewScript).toMatch(/<\/script>$/);
	expect(scripts.state.cells[0].value).toBeDefined();

	const decodedMenu = deserializeGraphValue(scripts.state.cells[0].value!) as {
		author: unknown;
		assignee: unknown;
	};
	expect(decodedMenu.author).toBe(decodedMenu.assignee);
	expect(scripts.view.events[0].symbolIds).toEqual(['symbol:0']);
});
