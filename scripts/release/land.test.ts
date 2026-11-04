// land.mjs's decisions about the commit main's merge queue built for the release pull request.
import { describe, expect, test } from 'vitest';
import { queueCommitsFrom, queuedCommitVerdict } from './land.mjs';

const base = 'b'.repeat(40);
const queued = 'c'.repeat(40);

function ciRun(overrides: Record<string, unknown> = {}) {
	return {
		id: 9,
		path: '.github/workflows/ci.yml',
		event: 'push',
		head_branch: 'main',
		head_sha: base,
		status: 'completed',
		conclusion: 'success',
		html_url: 'https://ci.example/run/9',
		check_suite_id: 7,
		...overrides,
	};
}

function verdict(overrides: Partial<Parameters<typeof queuedCommitVerdict>[0]> = {}) {
	return queuedCommitVerdict({
		base,
		treeProblems: [],
		lockstepProblems: [],
		runs: [ciRun()],
		checkProblemsFor: () => [],
		...overrides,
	});
}

describe('land.mjs', () => {
	test("finds only this pull request's commits in main's merge queue", () => {
		const listed = [
			`${queued}\trefs/heads/gh-readonly-queue/main/pr-41-${base}`,
			`${'d'.repeat(40)}\trefs/heads/gh-readonly-queue/main/pr-410-${base}`,
			`${'e'.repeat(40)}\trefs/heads/gh-readonly-queue/main/pr-4-${base}`,
			`${'f'.repeat(40)}\trefs/heads/release/v0.11.0`,
		].join('\n');
		expect(queueCommitsFrom(listed, 41)).toEqual([
			{ sha: queued, ref: `refs/heads/gh-readonly-queue/main/pr-41-${base}` },
		]);
		expect(queueCommitsFrom('', 41)).toEqual([]);
	});

	test('inherits the green CI run of the parent, from a push to main or from the merge queue', () => {
		expect(verdict()).toEqual({ action: 'post', run: ciRun() });
		const queueRun = ciRun({
			event: 'merge_group',
			head_branch: `gh-readonly-queue/main/pr-40-${'a'.repeat(40)}`,
		});
		expect(verdict({ runs: [queueRun] })).toEqual({ action: 'post', run: queueRun });
	});

	test('waits while the parent has no green run whose required checks passed', () => {
		expect(verdict({ runs: [] })).toMatchObject({ action: 'wait', running: false });
		expect(
			verdict({ runs: [ciRun({ status: 'in_progress', conclusion: null })] }),
		).toMatchObject({
			action: 'wait',
			running: true,
		});
		expect(verdict({ checkProblemsFor: () => ['test: failure'] })).toMatchObject({
			action: 'wait',
			reasons: ['run 9: test: failure'],
		});
		expect(
			verdict({ runs: [ciRun({ event: 'pull_request', head_branch: 'release/v0.11.0' })] }),
		).toMatchObject({ action: 'wait' });
		expect(verdict({ runs: [ciRun({ head_sha: queued })] })).toMatchObject({ action: 'wait' });
	});

	test('gives up on a queued commit that is more than versions and CHANGELOG, or out of lockstep', () => {
		expect(verdict({ treeProblems: ['src/a.ts: not a package.json or CHANGELOG.md'] })).toEqual(
			{
				action: 'fail',
				reasons: ['tree: src/a.ts: not a package.json or CHANGELOG.md'],
			},
		);
		expect(verdict({ lockstepProblems: ['@example/new: 0.10.0'] })).toEqual({
			action: 'fail',
			reasons: ['versions: @example/new: 0.10.0'],
		});
	});
});
