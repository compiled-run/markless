import { expect, test } from 'vitest';
import { decodePayloadScripts, RuntimePayloadError, renderPayloadScripts } from '../src/index.ts';
import { createProtocolStatePayload } from '../src/protocol-state.ts';
import { deserializeGraphValue, serializeGraphValue } from '../src/value.ts';

test('serializer split modules expose value, protocol-state, and payload-script boundaries', () => {
	expect(typeof serializeGraphValue).toBe('function');
	expect(typeof deserializeGraphValue).toBe('function');
	expect(typeof createProtocolStatePayload).toBe('function');
	expect(typeof renderPayloadScripts).toBe('function');
	expect(typeof decodePayloadScripts).toBe('function');
	expect(typeof RuntimePayloadError).toBe('function');
});
