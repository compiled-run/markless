// Contract for the two release workflows: release-cut.yml cuts and announces, release.yml alone publishes.
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
};
type Job = {
	readonly if?: string;
	readonly permissions?: Record<string, string>;
	readonly steps: readonly Step[];
};
type Workflow = {
	readonly on: Record<string, { readonly inputs?: Record<string, { readonly type: string }> }>;
	readonly concurrency: { readonly group: string; readonly 'cancel-in-progress': boolean };
	readonly permissions: Record<string, string>;
	readonly jobs: Record<string, Job>;
};

function workflow(file: string): Workflow {
	return parse(
		readFileSync(
			fileURLToPath(new URL(`../../.github/workflows/${file}`, import.meta.url)),
			'utf8',
		),
	) as Workflow;
}

function step(job: Job, name: string): Step {
	const found = job.steps.find((candidate) => candidate.name === name);
	if (!found) throw new Error(`no step named ${name}`);
	return found;
}

const cut = workflow('release-cut.yml');
const cutJob = cut.jobs.cut!;
const release = workflow('release.yml');
const releaseJob = release.jobs.release!;

describe('release-cut.yml', () => {
	test('one click: dispatch only, with nothing to choose but a dry run', () => {
		expect(Object.keys(cut.on)).toEqual(['workflow_dispatch']);
		expect(cut.on.workflow_dispatch!.inputs).toEqual({
			dry_run: expect.objectContaining({ type: 'boolean', default: false }),
		});
	});

	test('runs on main of the real repository only', () => {
		expect(cutJob.if).toBe("github.repository == 'compiled-run/markless'");
		expect(step(cutJob, 'Refuse anything but main').if).toBe("github.ref != 'refs/heads/main'");
	});

	test('never waits on its own concurrency group', () => {
		expect(cut.concurrency.group).not.toBe(release.concurrency.group);
		expect(cut.concurrency['cancel-in-progress']).toBe(false);
	});

	test('cannot publish: no OIDC token and no publish command', () => {
		expect(cut.permissions).toEqual({ contents: 'read' });
		expect(cutJob.permissions).toEqual({ contents: 'write', actions: 'write' });
		const commands = cutJob.steps.map((candidate) => candidate.run ?? '').join('\n');
		expect(commands).not.toMatch(/npm publish|pnpm publish|publish-workspace/u);
	});

	test('cuts with the minor-only script and pushes commit and tag together, except on a dry run', () => {
		expect(step(cutJob, 'Cut the next minor version').run).toContain(
			'node scripts/release/cut.mjs --dry-run',
		);
		const push = step(cutJob, 'Push the release commit and tag');
		expect(push.if).toContain('!inputs.dry_run');
		expect(push.run).toBe('git push --atomic origin HEAD:refs/heads/main "refs/tags/${TAG}"');
	});

	test('publishes by dispatching release.yml at the tag and waiting for it', () => {
		const publish = step(cutJob, 'Publish through release.yml at the tag');
		expect(publish.if).toContain('!inputs.dry_run');
		expect(publish.run).toContain('gh workflow run release.yml --ref "$TAG"');
		expect(publish.run).toContain('-f mode=publish -f confirm="publish markless ${VERSION}"');
		expect(publish.run).toContain('gh run watch "$run_id" --exit-status');
	});

	test('announces the changelog section as the latest GitHub Release after publishing', () => {
		const names = cutJob.steps.map((candidate) => candidate.name);
		const announce = step(cutJob, 'Create the GitHub Release');
		expect(names.indexOf('Create the GitHub Release')).toBeGreaterThan(
			names.indexOf('Publish through release.yml at the tag'),
		);
		expect(announce.run).toContain(
			'gh release create "$TAG" --title "$TAG" --notes-file "$NOTES_FILE" --latest --verify-tag',
		);
	});
});

describe('release.yml', () => {
	test('stays the only publisher, and publishes only at the version tag', () => {
		expect(releaseJob.permissions).toEqual({ contents: 'read', 'id-token': 'write' });
		const names = releaseJob.steps.map((candidate) => candidate.name);
		const gate = step(releaseJob, 'Publish only the tagged release commit');
		expect(gate.if).toBe("inputs.mode == 'publish'");
		expect(gate.run).toContain('"$GITHUB_REF" != "refs/tags/v${RELEASE_VERSION}"');
		expect(names.indexOf('Publish only the tagged release commit')).toBeLessThan(
			names.indexOf('Publish to npm via trusted publishing'),
		);
	});
});
