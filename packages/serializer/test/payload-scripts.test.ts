import { expect, test } from 'vitest';
import {
	createProtocolStatePayload,
	renderPayloadScripts,
	deserializeGraphValue,
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

	expect(scripts.stateScript).toMatch(/^<script type="markless\/state">/);
	expect(scripts.stateScript).toMatch(/<\/script>$/);
	expect(scripts.viewScript).toMatch(/^<script type="markless\/view">/);
	expect(scripts.viewScript).toMatch(/<\/script>$/);
	expect(scripts.state.cells[0].value).toBeDefined();

	const decodedMenu = deserializeGraphValue(scripts.state.cells[0].value!) as {
		author: unknown;
		assignee: unknown;
	};
	expect(decodedMenu.author).toBe(decodedMenu.assignee);
	expect(scripts.view.events[0].symbolIds).toEqual(['symbol:0']);
});

test('payload scripts escape only the `<` that could close or comment-escape the script', () => {
	const hostile = '<li>row</li></script><script>alert(1)</script><!--<script>';
	const state = createProtocolStatePayload({
		cells: [{ graphNodeId: 'state:html', name: 'html', valueKind: 'scalar', value: hostile }],
		computed: [],
	});
	const view: ProtocolViewPayload = {
		version: 1,
		locators: [],
		events: [],
		domUpdates: [],
		behaviors: [],
		elementHandles: [],
		asyncBoundaries: [],
	};

	const { stateScript } = renderPayloadScripts({ state, view });
	const body = stateScript.slice('<script type="markless/state">'.length, -'</script>'.length);

	expect(body).not.toMatch(/<[/!]/);
	expect(body).toContain('<li>row\\u003C/li>');
	expect(body).toContain('\\u003C!--<script>');
	expect(JSON.parse(body)).toEqual(JSON.parse(JSON.stringify(state)));
});
