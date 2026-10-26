import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'pathe';
import { expect, test } from 'vitest';
import {
	importedFunctionSummaries,
	missingFunctionSummaries,
} from '../src/hooks/module-functions.ts';

const dir = mkdtempSync(join(tmpdir(), 'markless-module-functions-'));
const helperFile = join(dir, 'ledger.ts');
writeFileSync(
	helperFile,
	`export function credit(account: { balance: number }, amount: number) { account.balance += amount; }
export const total = (rows: Array<{ amount: number }>) => rows.reduce((sum, row) => sum + row.amount, 0);
`,
);
const watched: string[] = [];
const context = {
	addWatchFile: (filename: string) => watched.push(filename),
	resolve: async (specifier: string) =>
		specifier === './ledger.ts'
			? helperFile
			: specifier === 'ledger-kit'
				? { id: join(dir, 'node_modules/ledger-kit/index.js') }
				: null,
};

test('an imported script module is summarized and watched; a package or an unresolved specifier is code nobody can read', async () => {
	const summaries = await importedFunctionSummaries(context, join(dir, 'Page.tsrx'), [
		'./ledger.ts',
		'ledger-kit',
		'./missing.ts',
	]);

	expect(summaries['./ledger.ts']).toMatchObject({
		credit: { parameters: [{ mutates: [['balance']] }, expect.anything()] },
		total: { parameters: [{ mutates: [], retains: [], unseen: [] }] },
	});
	expect(summaries['ledger-kit']).toEqual({});
	expect(summaries['./missing.ts']).toEqual({});
	expect(watched).toEqual([helperFile]);
});

test('only the requests a compile was not given are fetched', () => {
	expect(missingFunctionSummaries(['./a.ts', './b.ts', './a.ts'], { './b.ts': {} })).toEqual([
		'./a.ts',
	]);
	expect(missingFunctionSummaries(undefined, undefined)).toEqual([]);
});
