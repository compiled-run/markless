import { expect, test } from 'vitest';
import { protocolInstanceSegment } from '../../serializer/src/protocol-constants.ts';
import { protocolRowSegment } from '../../serializer/src/protocol-instance-path.ts';
import { marklessComposerInstancePath } from '../src/fns/instance-scope.ts';

// A root a @for row places is composed by the module that wrote the @for; the row
// names which item its callback reads, not a second instance of that module.
const c0 = protocolInstanceSegment(0);
const c2 = protocolInstanceSegment(2);
const row = protocolRowSegment('bread');
const inner = protocolRowSegment('d');

test('a root in a page row is composed by the page itself', () => {
	expect(marklessComposerInstancePath(row + c0)).toBe('');
});

test('a root in a row of a component is composed by that component instance', () => {
	expect(marklessComposerInstancePath(row + c0 + inner + c2)).toBe(row + c0);
});

test('a root a row component renders keeps the row in the component instance path', () => {
	expect(marklessComposerInstancePath(row + c0 + c2)).toBe(row + c0);
});
