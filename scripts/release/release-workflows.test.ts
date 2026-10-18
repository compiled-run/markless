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

	test('pushes commit and tag together, never on a dry run or a resumed cut', () => {
		const push = step(cut, 'Push the release commit and tag');
		expect(push.if).toBe("inputs.mode == 'cut' && steps.cut.outputs.resumed != 'true'");
		expect(push.run).toBe('git push --atomic origin HEAD:refs/heads/main "refs/tags/${TAG}"');
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

	test('reads no secret, and is last so its own guard scans exactly it', () => {
		expect(Object.keys(workflow.jobs).at(-1)).toBe('release');
		const releaseJobSource = source.slice(source.indexOf('\n    release:\n'));
		const executable = releaseJobSource
			.split('\n')
			.filter((line) => !/^\s*#/u.test(line))
			.join('\n');
		expect(executable).not.toMatch(/\$\{\{\s*secrets\./u);
		expect(step(release, 'Refuse to run with a stored npm token available').run).toContain(
			"sed -n '/^    release:$/,$p' .github/workflows/release.yml",
		);
	});
});
