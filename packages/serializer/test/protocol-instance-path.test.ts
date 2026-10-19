import { expect, test } from 'vitest';
import {
	protocolInstancePath,
	protocolRowOwnerPaths,
	protocolRowSegment,
} from '../src/protocol-constants.ts';

test('each row segment of an id names the instance path of the component whose row it is', () => {
	const id = `c0:c1:${protocolRowSegment('Essentials')}c0:${protocolRowSegment('a:b')}p2:prop:props`;
	expect(protocolInstancePath(id)).toBe(id.slice(0, id.indexOf('prop:')));
	expect(protocolRowOwnerPaths(id)).toEqual(['c0:c1:', `c0:c1:${protocolRowSegment('Essentials')}c0:`]);
	expect(protocolRowOwnerPaths(`${protocolRowSegment(7)}c3:state:open`)).toEqual(['']);
	expect(protocolRowOwnerPaths('c4:prop:props')).toEqual([]);
	expect(protocolRowOwnerPaths('prop:props')).toEqual([]);
});
