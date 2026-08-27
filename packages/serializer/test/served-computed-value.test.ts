import { expect, test } from 'vitest';
import {
	createProtocolStatePayload,
	decodePayloadScripts,
	deserializeGraphValue,
	renderPayloadScripts,
	serializeGraphValue,
	type ProtocolViewPayload,
} from '../src/index.ts';

// `computed[i].value` carries the value the render already derived, so a handler
// reading a sync computed before its first dependency write answers with it. Same
// envelope a cell value uses, validated the same way.

const view: ProtocolViewPayload = {
	version: 1,
	locators: [],
	events: [],
	domUpdates: [],
	behaviors: [],
	elementHandles: [],
	asyncBoundaries: [],
};

function stateWith(value: unknown) {
	const state = createProtocolStatePayload({
		cells: [],
		computed: [{ graphNodeId: 'computed:total', name: 'total', async: false }],
	});
	return {
		...state,
		computed: [{ ...state.computed[0]!, value }],
	};
}

test('a served computed value survives the payload round trip', () => {
	const encoded = serializeGraphValue(42);
	expect(encoded.ok).toBe(true);

	const scripts = renderPayloadScripts({ state: stateWith(encoded.payload), view });
	const decoded = decodePayloadScripts({
		stateScript: scripts.stateScript,
		viewScript: scripts.viewScript,
	});

	expect(deserializeGraphValue(decoded.state.computed[0]!.value as never)).toBe(42);
});

test('a computed with no served value round-trips without the field', () => {
	const state = createProtocolStatePayload({
		cells: [],
		computed: [{ graphNodeId: 'computed:total', name: 'total', async: false }],
	});
	const scripts = renderPayloadScripts({ state, view });
	const decoded = decodePayloadScripts({
		stateScript: scripts.stateScript,
		viewScript: scripts.viewScript,
	});

	expect(decoded.state.computed[0]).not.toHaveProperty('value');
});

// The live channel is for a CSR mount's in-memory handoff. Reaching a served
// payload means a host skipped encoding, exactly as it would for a cell.
test('a live directValue that reached a served payload is refused', () => {
	const state = createProtocolStatePayload({
		cells: [],
		computed: [{ graphNodeId: 'computed:total', name: 'total', async: false }],
	});
	const scripts = renderPayloadScripts({
		state: { ...state, computed: [{ ...state.computed[0]!, directValue: 42 }] },
		view,
	});

	expect(() =>
		decodePayloadScripts({ stateScript: scripts.stateScript, viewScript: scripts.viewScript }),
	).toThrow(/directValue/);
});

test('a served value that is not an envelope is refused', () => {
	const scripts = renderPayloadScripts({ state: stateWith(42), view });

	expect(() =>
		decodePayloadScripts({ stateScript: scripts.stateScript, viewScript: scripts.viewScript }),
	).toThrow(/computed\[0\]\.value/);
});
