// Contract for ecosystem-ci.yml: maintainers start it, pull request code runs only with a read token, and no
// job reads a secret.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { parse } from 'yaml';

type Step = {
	readonly name?: string;
	readonly uses?: string;
	readonly run?: string;
	readonly with?: Record<string, unknown>;
	readonly env?: Record<string, string>;
};
type Job = {
	readonly if?: string;
	readonly needs?: string | readonly string[];
	readonly permissions?: Record<string, string>;
	readonly steps: readonly Step[];
};

const source = readFileSync(
	fileURLToPath(new URL('../../.github/workflows/ecosystem-ci.yml', import.meta.url)),
	'utf8',
);
const workflow = parse(source) as {
	readonly 'run-name': string;
	readonly on: Record<string, unknown>;
	readonly concurrency: { readonly group: string; readonly 'cancel-in-progress': string };
	readonly permissions: Record<string, string>;
	readonly jobs: Record<string, Job>;
};
const { plan, build, suites, report } = workflow.jobs as Record<
	'plan' | 'build' | 'suites' | 'report',
	Job
>;

const checkouts = (job: Job) =>
	job.steps.filter((step) => step.uses?.startsWith('actions/checkout@'));

describe('ecosystem-ci.yml', () => {
	test('starts on a maintainer comment or a dispatch, in this repository only', () => {
		expect(Object.keys(workflow.on)).toEqual(['push', 'issue_comment', 'workflow_dispatch']);
		expect(workflow.on.push).toEqual({ branches: ['main'] });
		expect(plan.if).toContain("github.repository == 'compiled-run/markless'");
		expect(plan.if).toContain('github.event.issue.pull_request');
		expect(plan.if).toContain("startsWith(github.event.comment.body, '/ecosystem-ci run ')");
		expect(plan.if).toContain(
			`contains(fromJSON('["OWNER", "MEMBER", "COLLABORATOR"]'), github.event.comment.author_association)`,
		);
	});

	test('the comment text reaches the shell only through an environment variable', () => {
		const resolve = plan.steps.find((step) =>
			step.run?.includes('ecosystem-ci.ts list --matrix'),
		)!;
		expect(resolve.env!.COMMENT).toBe('${{ github.event.comment.body }}');
		for (const job of Object.values(workflow.jobs)) {
			for (const step of job.steps)
				expect(step.run ?? '').not.toContain('github.event.comment');
		}
	});

	test('jobs that build or run the pull request get a read token and keep no credentials', () => {
		expect(workflow.permissions).toEqual({});
		for (const job of [build, suites]) {
			expect(job.permissions).toEqual({ contents: 'read' });
			for (const step of checkouts(job))
				expect(step.with!['persist-credentials']).toBe(false);
		}
		expect(
			checkouts(build).some((step) => step.with!.ref === '${{ needs.plan.outputs.sha }}'),
		).toBe(true);
	});

	test('a push, which names no suites, passes the suite-name check', () => {
		const resolve = plan.steps.find((step) =>
			step.run?.includes('ecosystem-ci.ts list --matrix'),
		)!;
		// grep exits 1 on empty input, which turned every push run red in its first step.
		expect(resolve.run).toContain('if [[ ! "$requested" =~ ^[a-z0-9\\ -]*$ ]]; then');
		expect(resolve.run).not.toContain('grep -Eq');
	});

	test('every push to main gets a complete run of its own', () => {
		expect(workflow.concurrency.group).toContain(
			"github.event_name == 'push' && format('main-{0}', github.sha)",
		);
		expect(workflow.concurrency['cancel-in-progress']).toBe(false);
	});

	test('notifies on runs for main and the release, and shows a non-required status on a pull request', () => {
		const notify = report.steps.find(
			(candidate) => candidate.name === 'Notify on main and release runs',
		)!;
		expect(notify.run).toContain('ecosystem-ci/scripts/notify.ts --summary summary.json');
		expect(notify.run).toContain('--mention thejackshelton --label ecosystem-ci');
		expect(notify.env!.GITHUB_TOKEN).toBe('${{ github.token }}');
		expect(report.permissions).toEqual({
			contents: 'read',
			'pull-requests': 'write',
			statuses: 'write',
			issues: 'write',
		});
		const status = report.steps.find(
			(candidate) =>
				candidate.name === "Set the ecosystem-ci status on the pull request's commit",
		)!;
		expect(status.run).toContain('-f context=ecosystem-ci');
	});

	test('jobs that may comment never check out the pull request', () => {
		for (const job of [plan, report]) {
			expect(job.permissions!['pull-requests']).toBe('write');
			for (const step of checkouts(job)) {
				expect(step.with!.repository).toBe('${{ env.ECOSYSTEM_CI_REPOSITORY }}');
				expect(step.with!.ref).toBeUndefined();
			}
		}
	});

	test('reads no secret', () => {
		const executable = source
			.split('\n')
			.filter((line) => !/^\s*#/u.test(line))
			.join('\n');
		expect(executable).not.toMatch(/secrets\./u);
	});

	test('a dispatched run is titled the way the release cut looks it up', () => {
		expect(workflow['run-name']).toContain(
			"format('Ecosystem CI on {0}{1}', inputs.ref, inputs.gate != '' && format(' ({0} gate)', inputs.gate) || '')",
		);
		expect(report.needs).toEqual(['plan', 'build', 'suites']);
		expect(report.if).toBe("always() && needs.plan.result == 'success'");
		expect(report.steps.at(-1)!.run).toContain('exit 1');
	});
});
