import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, test } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const checker = join(repoRoot, 'scripts/ci/check-workflow.mjs');
const yaml = createRequire(join(repoRoot, 'packages/cli/package.json'))('yaml') as {
	parse(source: string): Workflow;
	stringify(value: unknown): string;
};
type Step = { id?: string; env?: Record<string, string>; run?: string };
type Job = { if?: string; env?: Record<string, string>; steps?: Step[] };
type Workflow = { jobs: Record<string, Job> };

const source = readFileSync(join(repoRoot, '.github/workflows/ci.yml'), 'utf8');
const scratch = mkdtempSync(join(tmpdir(), 'check-workflow-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

let variant = 0;
function problems(edit: (workflow: Workflow) => void): string {
	const workflow = yaml.parse(source);
	edit(workflow);
	const file = join(scratch, String(variant++), 'ci.yml');
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, yaml.stringify(workflow));
	try {
		execFileSync(process.execPath, [checker, file], { encoding: 'utf8', stdio: 'pipe' });
		return '';
	} catch (error) {
		return String((error as { stderr?: string }).stderr ?? '');
	}
}
const gateStep = (workflow: Workflow) =>
	workflow.jobs.test!.steps!.find((step) => step.id === 'gate')!;

describe('merge-queue-only lanes', () => {
	test('the committed workflow passes', () => {
		expect(problems(() => {})).toBe('');
	});

	test('a lane that skips pull requests but is missing from the gate list fails the check', () => {
		const found = problems((workflow) => {
			workflow.jobs['website-boxes']!.if = "github.event_name != 'pull_request'";
		});
		expect(found).toContain('does not list `website-boxes=${{needs.website-boxes.result}}`');
	});

	test('a lane dropped from the gate list fails the check', () => {
		const found = problems((workflow) => {
			const step = gateStep(workflow);
			step.env!.QUEUE_ONLY_RESULTS = step
				.env!.QUEUE_ONLY_RESULTS!.split(/\s+/)
				.filter((entry) => !entry.startsWith('build-scale='))
				.join(' ');
		});
		expect(found).toContain('does not list `build-scale=${{needs.build-scale.result}}`');
	});

	test('any other event condition on a lane fails the check', () => {
		const found = problems((workflow) => {
			workflow.jobs['build-warnings']!.if = "github.event_name == 'merge_group'";
		});
		expect(found).toContain(
			'Lane `build-warnings` gates on the event in a form the gate cannot hold to account',
		);
	});

	test('a required check that skips pull requests fails the check', () => {
		const found = problems((workflow) => {
			workflow.jobs.typecheck!.if = "github.event_name != 'pull_request'";
		});
		expect(found).toContain(
			'Job `typecheck` skips pull requests, but every pull request needs it to report.',
		);
	});

	test('a gate that reads the list on the wrong event fails the check', () => {
		const found = problems((workflow) => {
			const step = gateStep(workflow);
			step.run = step.run!.replace('"$EVENT" != "pull_request"', '"$EVENT" = "merge_group"');
		});
		expect(found).toContain('must read `QUEUE_ONLY_RESULTS` whenever');
	});

	test('receipts left on for pull requests while the box lanes skip them fails the check', () => {
		const found = problems((workflow) => {
			workflow.jobs.test!.env!.RUN_RECEIPTS = '${{ needs.lanes.outputs.run_receipts }}';
		});
		expect(found).toContain('has to set `RUN_RECEIPTS` false on them');
	});
});
