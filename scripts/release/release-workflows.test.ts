// Contract for release.yml: mode=cut releases end to end, and only the `release` job can publish.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { parse } from 'yaml';

type Step = {
	readonly name?: string;
	readonly if?: string;
	readonly run?: string;
	readonly uses?: string;
	readonly with?: Record<string, unknown>;
	readonly env?: Record<string, string>;
};
type Job = {
	readonly if?: string;
	readonly needs?: string | readonly string[];
	readonly permissions?: Record<string, string>;
	readonly env?: Record<string, string>;
	readonly steps: readonly Step[];
};

const source = readFileSync(
	fileURLToPath(new URL('../../.github/workflows/release.yml', import.meta.url)),
	'utf8',
);
const workflow = parse(source) as {
	readonly on: Record<string, { readonly inputs: Record<string, Record<string, unknown>> }>;
	readonly jobs: Record<string, Job>;
};
const { cut, announce, release } = workflow.jobs as Record<'cut' | 'announce' | 'release', Job>;

function step(job: Job, name: string): Step {
	const found = job.steps.find((candidate) => candidate.name === name);
	if (!found) throw new Error(`no step named ${name}`);
	return found;
}

function names(job: Job): Array<string | undefined> {
	return job.steps.map((candidate) => candidate.name);
}

describe('release.yml mode=cut', () => {
	test('one dispatch with no version or confirmation to type', () => {
		const inputs = workflow.on.workflow_dispatch!.inputs;
		expect(inputs.mode!.options).toEqual(['dry-run', 'publish', 'cut', 'cut-dry-run']);
		expect(inputs.version!.required).toBe(false);
		expect(release.env!.RELEASE_VERSION).toBe(
			'${{ needs.cut.outputs.version || inputs.version }}',
		);
		expect(step(release, 'Require the typed confirmation phrase').if).toBe(
			"inputs.mode == 'publish'",
		);
	});

	test('cuts on main of the real repository only, with the minor-only script', () => {
		expect(cut.if).toBe(
			"github.repository == 'compiled-run/markless' && startsWith(inputs.mode, 'cut')",
		);
		expect(step(cut, 'Refuse anything but main').if).toBe("github.ref != 'refs/heads/main'");
		const run = step(cut, 'Cut the next minor version').run;
		expect(run).toContain('node scripts/release/cut.mjs --dry-run');
		expect(run).toContain('node scripts/release/cut.mjs\n');
	});

	test('moves main only after pull request CI passed every required check on the release commit itself', () => {
		const order = [
			'Push the release commit to its release branch',
			'Run CI on the release pull request',
			"Require every check main's protection names on the release commit",
			'Move main to the release commit',
		];
		for (const name of order) {
			expect(step(cut, name).if).toBe(
				"inputs.mode == 'cut' && steps.cut.outputs.resumed != 'true'",
			);
		}
		const positions = order.map((name) => names(cut).indexOf(name));
		expect(positions).toEqual(positions.toSorted((left, right) => left - right));
		expect(step(cut, order[0]!).run).toBe('git push origin "HEAD:refs/heads/release/${TAG}"');
		const ci = step(cut, order[1]!).run!;
		expect(ci).toContain('gh pr create --base main --head "release/${TAG}"');
		expect(ci).toContain('--event pull_request --commit "$SHA"');
		expect(ci).not.toContain('gh workflow run');
		expect(ci).toContain('"pull_request ${SHA} release/${TAG}"');
		expect(ci.indexOf('"pull_request ${SHA} release/${TAG}"')).toBeLessThan(
			ci.indexOf('/approve"'),
		);
		expect(ci).toContain('gh run watch "$run_id" --exit-status');
		expect(step(cut, order[2]!).run).toBe(
			'node scripts/release/required-checks.mjs --sha "$SHA"',
		);
		const move = step(cut, order[3]!).run!;
		expect(move).toContain('if [ "$main" != "$base" ]; then');
		expect(move.trimEnd().split('\n').at(-1)!.trim()).toBe(
			'git push origin "${SHA}:refs/heads/main"',
		);
		expect(move).not.toMatch(/--force|\+\$\{SHA\}|--admin/u);
		const pushTag = step(cut, 'Push the tag');
		expect(pushTag.if).toBe("inputs.mode == 'cut' && steps.cut.outputs.push_tag == 'true'");
		expect(names(cut).indexOf('Push the tag')).toBeGreaterThan(names(cut).indexOf(order[3]!));
		expect(cut.permissions!['pull-requests']).toBe('write');
		expect(step(cut, 'Delete the release branch').if).toContain('always()');
		expect(
			step(cut, "Check that ci.yml reports every check main's protection requires").run,
		).toBe('node scripts/release/required-checks.mjs --names');
	});

	test('starts ecosystem CI on the release commit, never waits for it, and links it in the release', () => {
		const start = step(cut, 'Start ecosystem CI on the release commit');
		expect(start.if).toBe("inputs.mode == 'cut' && steps.cut.outputs.resumed != 'true'");
		expect(start.env!.SHA).toBe('${{ steps.cut.outputs.sha }}');
		expect(start.run).toContain(
			'gh workflow run ecosystem-ci.yml --ref main -f ref="$SHA" -f gate=release',
		);
		expect(start.run).toContain('Ecosystem CI on ${SHA} (release gate)');
		expect(start.run).not.toMatch(/exit 1|set -e[a-z]*o? pipefail\n/u);
		expect(
			names(cut).some((name) => /ecosystem/iu.test(name ?? '') && name !== start.name),
		).toBe(false);
		expect(cut.steps.map((candidate) => candidate.run ?? '').join('\n')).not.toContain(
			'steps.ecosystem',
		);
		const link = step(announce, 'Link the ecosystem CI run in the release notes');
		expect(link.env!.RUN_ID).toBe('${{ needs.cut.outputs.ecosystem_run }}');
		expect(link.run).toContain('release-notes.md');
		expect(names(announce).indexOf(link.name)).toBeLessThan(
			names(announce).indexOf('Create the GitHub Release'),
		);
	});

	test('posts no commit status of its own', () => {
		const commands = cut.steps.map((candidate) => candidate.run ?? '').join('\n');
		expect(commands).not.toMatch(/\/statuses\/|check-runs -X|--method POST/u);
		expect(cut.permissions!.statuses).toBeUndefined();
	});

	test('the cut and announce jobs cannot publish', () => {
		for (const job of [cut, announce]) {
			expect(job.permissions!['id-token']).toBeUndefined();
			const commands = job.steps.map((candidate) => candidate.run ?? '').join('\n');
			expect(commands).not.toMatch(/npm publish|pnpm publish|publish-workspace/u);
		}
	});

	test('publishes the pushed tag in the existing release job, then announces it', () => {
		expect(release.needs).toBe('cut');
		expect(release.if).toContain("(inputs.mode == 'cut' && needs.cut.result == 'success')");
		expect(release.env!.RELEASE_MODE).toBe(
			"${{ inputs.mode == 'cut' && 'publish' || inputs.mode }}",
		);
		expect(release.steps[0]!.with!.ref).toBe('${{ needs.cut.outputs.tag || github.ref }}');
		expect(announce.needs).toEqual(['cut', 'release']);
		expect(announce.if).toBe("inputs.mode == 'cut' && needs.release.result == 'success'");
		expect(step(announce, 'Create the GitHub Release').run).toContain('--latest --verify-tag');
	});
});

describe('release.yml release job', () => {
	test('is the only job with an OIDC token, and publishes only the tagged commit', () => {
		expect(release.permissions).toEqual({ contents: 'read', 'id-token': 'write' });
		const gate = step(release, 'Publish only the tagged release commit');
		expect(gate.if).toBe("env.RELEASE_MODE == 'publish'");
		expect(gate.run).toContain('refs/tags/v${RELEASE_VERSION}^{commit}');
		expect(names(release).indexOf('Publish only the tagged release commit')).toBeLessThan(
			names(release).indexOf('Publish to npm via trusted publishing'),
		);
	});

	test('no job reads a secret, and the release job is last so its own guard scans it', () => {
		expect(Object.keys(workflow.jobs).at(-1)).toBe('release');
		const executable = source
			.split('\n')
			.filter((line) => !/^\s*#/u.test(line))
			.join('\n');
		expect(executable).not.toMatch(/\$\{\{\s*secrets\./u);
		expect(step(release, 'Refuse to run with a stored npm token available').run).toContain(
			"sed -n '/^    release:$/,$p' .github/workflows/release.yml",
		);
	});
});
