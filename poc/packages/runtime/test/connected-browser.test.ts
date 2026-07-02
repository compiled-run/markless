import { readFile } from 'node:fs/promises';
import { expect, test } from 'vitest';
import { transformTsrxForBundler } from '../../compiler/src/index.ts';
import { createConnectedBrowserPageFromBundlerOutput } from '../src/index.ts';

const fixturePath = 'fixtures/proofs/bundler-pipeline/src/App.tsrx';

async function transformFixture() {
	const fixtureUrl = new URL(`../../../${fixturePath}`, import.meta.url);
	const source = await readFile(fixtureUrl, 'utf8');

	return await transformTsrxForBundler({
		filename: fixturePath,
		source,
	});
}

function stagesFor(receipts: ReadonlyArray<{ readonly stage: string }>): string[] {
	return receipts.map((receipt) => receipt.stage);
}

test('connected-browser POC runs one page from bundler output through resume and events', async () => {
	const artifact = await transformFixture();
	const page = createConnectedBrowserPageFromBundlerOutput({
		artifact,
	});

	expect(page.mode).toBe('browser-page');
	expect(page.html).toContain('<script type="markless/state"');
	expect(page.html).toContain('<script type="markless/view"');

	await page.load();
	const resume = await page.resume();

	expect(resume.serializedGraphRead).toEqual({
		selectedId: 'app',
		open: true,
		message: 'pipeline ready',
		revision: 0,
	});
	expect(resume.componentBodyRunsDuringResume).toBe(0);
	expect(page.text('pipeline-label')).toBe('App module:r0:pipeline ready');

	const click = await page.dispatch('click', 'select-symbol');
	expect(click.loadedSymbolId).toContain('#click_');
	expect(page.graph().selectedId).toBe('symbol');
	expect(page.text('pipeline-label')).toBe('Generated symbol chunk:r1:selected:symbol');
	expect(page.domJournal()).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				kind: 'setText',
				targetId: 'pipeline-label',
				value: 'Generated symbol chunk:r1:selected:symbol',
			}),
		]),
	);

	const keydown = await page.dispatch('keydown', 'filter-input', {
		key: 'Escape',
	});
	expect(keydown.defaultPrevented).toBe(true);
	expect(keydown.syncPolicyApplied).toBe(true);
	expect(keydown.loadedSymbolId).toContain('#keydown_');
	expect(page.graph().open).toBe(false);
	expect(page.text('pipeline-label')).toBe('Generated symbol chunk:r1:sync-policy:closed');

	expect(page.constraints()).toEqual({
		componentBodiesRunOnResume: false,
		usesHydration: false,
		usesVdom: false,
	});
	expect(stagesFor(page.receipts())).toEqual(
		expect.arrayContaining([
			'page-load',
			'resume-graph-read',
			'delegated-event-dispatch',
			'sync-policy-evaluate',
			'lazy-symbol-load',
			'graph-write',
			'dom-journal-apply',
		]),
	);
});
