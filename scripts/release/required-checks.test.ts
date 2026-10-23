// The release cut moves main only when every check branch protection requires passed on the commit.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import { parse } from 'yaml';
import {
	checkRunProblems,
	contextsMissingFromWorkflow,
	requiredChecksFrom,
	statusProblems,
} from './required-checks.mjs';

const required = [
	{ context: 'test', app_id: 15368 },
	{ context: 'typecheck', app_id: 15368 },
	{ context: 'agent-files', app_id: null },
];
const run = (name: string, conclusion = 'success', appId = 15368) => ({
	name,
	status: 'completed',
	conclusion,
	app: { id: appId },
	html_url: `https://ci.example/${name}`,
});

test('every required context needs a successful check run from the required app', () => {
	expect(
		checkRunProblems(required, [
			run('test'),
			run('typecheck'),
			run('agent-files', 'success', 1),
		]),
	).toEqual([]);
	expect(checkRunProblems(required, [run('test'), run('typecheck')])).toEqual([
		'agent-files: no check run on this commit',
	]);
	expect(
		checkRunProblems(required, [run('test', 'failure'), run('typecheck'), run('agent-files')]),
	).toEqual(['test: failure (https://ci.example/test)']);
	expect(
		checkRunProblems(required, [
			run('test', 'success', 99),
			run('typecheck'),
			run('agent-files'),
		]),
	).toEqual(['test: no check run on this commit from app 15368']);
});

test('green checks from a CI run main does not count are reported, not accepted', () => {
	const inSuite = (name: string, suite: number) => ({ ...run(name), check_suite: { id: suite } });
	const pullRequestSuite = new Set([2]);
	expect(
		checkRunProblems(
			required,
			[inSuite('test', 1), inSuite('typecheck', 2), inSuite('agent-files', 2)],
			pullRequestSuite,
		),
	).toEqual([
		"test: only from a CI run main's rules do not count, such as a workflow_dispatch run",
	]);
	expect(
		checkRunProblems(
			required,
			[
				inSuite('test', 1),
				inSuite('test', 2),
				inSuite('typecheck', 2),
				inSuite('agent-files', 2),
			],
			pullRequestSuite,
		),
	).toEqual([]);
});

test('a commit status counts only when it is the newest for its context, a success, and from the Actions bot', () => {
	const status = (context: string, state = 'success', login = 'github-actions[bot]') => ({
		context,
		state,
		creator: { login },
		target_url: `https://ci.example/${context}`,
	});
	expect(
		statusProblems(required, [
			status('test'),
			status('typecheck'),
			status('agent-files', 'success', 'someone'),
		]),
	).toEqual([]);
	expect(
		statusProblems(required, [
			status('test', 'failure'),
			status('test'),
			status('typecheck', 'success', 'someone'),
		]),
	).toEqual([
		'test: failure (https://ci.example/test)',
		'typecheck: the commit status was posted by someone, not github-actions[bot]',
		'agent-files: no commit status on this commit',
	]);
});

test('a later successful rerun of a failed check counts', () => {
	expect(
		checkRunProblems(required, [
			run('test', 'failure'),
			run('test'),
			run('typecheck'),
			run('agent-files'),
		]),
	).toEqual([]);
});

test('a required context that is not a ci.yml job is reported', () => {
	const ci = parse(
		readFileSync(
			fileURLToPath(new URL('../../.github/workflows/ci.yml', import.meta.url)),
			'utf8',
		),
	) as { jobs: Record<string, { name?: string }> };
	expect(contextsMissingFromWorkflow(required, ci)).toEqual([]);
	expect(contextsMissingFromWorkflow([{ context: 'lint', app_id: null }], ci)).toEqual(['lint']);
});

test('required checks come from main rulesets and classic protection, without duplicates', () => {
	const rules = [
		{ type: 'deletion' },
		{
			type: 'required_status_checks',
			parameters: {
				required_status_checks: [
					{ context: 'test', integration_id: 15368 },
					{ context: 'typecheck', integration_id: 15368 },
				],
			},
		},
	];
	const protection = {
		required_status_checks: {
			checks: [
				{ context: 'test', app_id: 15368 },
				{ context: 'agent-files', app_id: 15368 },
			],
		},
	};
	expect(requiredChecksFrom(rules, protection)).toEqual([
		{ context: 'test', app_id: 15368 },
		{ context: 'typecheck', app_id: 15368 },
		{ context: 'agent-files', app_id: 15368 },
	]);
	expect(requiredChecksFrom(rules, undefined)).toHaveLength(2);
	expect(requiredChecksFrom([], undefined)).toEqual([]);
});
