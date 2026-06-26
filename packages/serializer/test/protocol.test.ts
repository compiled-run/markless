import { expect, test } from 'vitest';
import {
	ASYNC_PROTOCOL_VERSION,
	type ProtocolStatePayload,
	type ProtocolViewPayload,
} from '../src/index.ts';

test('protocol payloads share the current async protocol version', () => {
	const state: ProtocolStatePayload = {
		version: ASYNC_PROTOCOL_VERSION,
		cells: [],
		computed: [],
	};
	const view: ProtocolViewPayload = {
		version: ASYNC_PROTOCOL_VERSION,
		locators: [],
		events: [],
		domUpdates: [],
		behaviors: [],
		elementHandles: [],
		asyncBoundaries: [],
	};

	expect(ASYNC_PROTOCOL_VERSION).toBe(1);
	expect(state.version).toBe(1);
	expect(view.version).toBe(1);
});
