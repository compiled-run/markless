import { expect, test } from 'vitest';
import {
	PROTOCOL_CONTAINER_END_COMMENT,
	PROTOCOL_CONTAINER_START_COMMENT,
	PROTOCOL_ROW_COMMENT,
	PROTOCOL_UNCOUNTED_COMMENT,
} from '../src/protocol-page-markers.ts';

test('a page census skips row comments and arm-branch anchors, and counts every other comment', () => {
	for (const skipped of [
		PROTOCOL_ROW_COMMENT,
		`/${PROTOCOL_ROW_COMMENT}`,
		'markless:arm-branch:0',
		'/markless:arm-branch:0:after',
	])
		expect(PROTOCOL_UNCOUNTED_COMMENT.test(skipped), skipped).toBe(true);
	for (const counted of [
		'markless:rows',
		'markless:row:0',
		'markless:branch:0',
		'markless:async:boundary:0',
		PROTOCOL_CONTAINER_START_COMMENT,
		PROTOCOL_CONTAINER_END_COMMENT,
		'an author comment',
	])
		expect(PROTOCOL_UNCOUNTED_COMMENT.test(counted), counted).toBe(false);
});
