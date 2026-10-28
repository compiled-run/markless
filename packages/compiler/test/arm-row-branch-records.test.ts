import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

const page = fileURLToPath(
	new URL('../../vitest-browser/browser/arm-row-branches/directory-page.tsrx', import.meta.url),
);

test("an @if in a keyed row inside an @try arm is not planned as one of the arm's own branches", async () => {
	const result = await compileTsrxModule({ filename: 'src/DirectoryPage.tsrx', source: readFileSync(page, 'utf8'), symbols: [] });
	const armRecords = result.protocolView.asyncBoundaries[0]!.armRecords;
	const tryArm = Array.isArray(armRecords) ? armRecords[0]! : armRecords;
	expect(
		(tryArm.branches ?? []).map((branch) => [branch.id, branch.startAnchor, branch.endAnchor]),
	).toEqual([
		[
			'branch-site:1',
			{ strategy: 'arm-branch-comment', index: 0 },
			{ strategy: 'arm-branch-comment', index: 1 },
		],
	]);
});
