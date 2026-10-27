// A release waits for the nightly screen readers: the newest run on main it contains must be green and recent.
import { expect, test } from 'vitest';
import { MAX_AGE_HOURS, readerGate } from './reader-gate.mjs';

const now = Date.parse('2026-10-27T12:00:00Z');
const hoursAgo = (hours: number) => new Date(now - hours * 3_600_000).toISOString();
const run = (sha: string, conclusion: string, event = 'schedule', hours = 6) => ({
	head_sha: sha,
	conclusion,
	event,
	created_at: hoursAgo(hours),
	html_url: `https://ci.example/${sha}`,
});
const history = new Set(['a', 'b', 'c']);
const contains = (sha: string) => history.has(sha);

test('the newest nightly run the release contains decides, and a newer run on an unreleased commit does not', () => {
	expect(readerGate([run('z', 'failure'), run('b', 'success'), run('a', 'failure')], contains, now)).toEqual({
		run: run('b', 'success'),
	});
	expect(readerGate([run('z', 'success'), run('b', 'failure'), run('a', 'success')], contains, now).problem).toBe(
		'the newest screen-reader.yml run this release contains ended failure: https://ci.example/b',
	);
});

test('a dispatched run on main counts, a pull request run never does', () => {
	expect(readerGate([run('c', 'success', 'workflow_dispatch')], contains, now).run?.head_sha).toBe('c');
	expect(readerGate([run('c', 'success', 'pull_request'), run('b', 'failure')], contains, now).problem).toMatch(
		/ended failure/u,
	);
});

test('no run, or only a stale one, refuses the release and says how to get one', () => {
	expect(readerGate([], contains, now).problem).toMatch(/gh workflow run screen-reader\.yml --ref main/u);
	expect(readerGate([run('z', 'success')], contains, now).problem).toMatch(/no nightly or dispatched/u);
	expect(readerGate([run('a', 'success', 'schedule', MAX_AGE_HOURS + 1)], contains, now).problem).toMatch(
		/hours old/u,
	);
	expect(readerGate([run('a', 'success', 'schedule', MAX_AGE_HOURS - 1)], contains, now).problem).toBeUndefined();
});
