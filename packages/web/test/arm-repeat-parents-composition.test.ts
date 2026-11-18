import { expect, test } from 'vitest';
import { protocolInstanceSegment } from '../../serializer/src/protocol.ts';
import { marklessSsrPrefixArmRecord } from '../src/fns/ssr.ts';

// A branch arm names its lists by page record id, so composing a child prefixes that id exactly as it prefixes the record's.
test('composition prefixes an arm list id as it prefixes the list record and the branch', () => {
	const child = {
		hostPrefix: 'c0:',
		symbolPrefix: protocolInstanceSegment(0),
		graphProps: [],
		externalSymbolIds: new Set<string>(),
	};
	const twice = marklessSsrPrefixArmRecord(
		marklessSsrPrefixArmRecord(
			{ events: [], repeatParents: [{ repeatId: 'repeat:0', parentHostPath: [1] }] } as never,
			child as never,
		) as never,
		{ ...child, hostPrefix: 'c3:' } as never,
	);

	expect(twice.repeatParents).toEqual([{ repeatId: 'c3:c0:repeat:0', parentHostPath: [1] }]);
});
