// Mechanically checks a GitHub Actions workflow file, so a typo in YAML or a
// step that calls a script nobody wrote fails here instead of on a runner.
//
//   node scripts/ci/check-workflow.mjs .github/workflows/screen-reader.yml
//
// With no argument it checks every workflow in .github/workflows.
//
// What it proves, in order:
//   1. the file parses as YAML;
//   2. it has a name, a trigger and at least one job;
//   3. every job names a runner and has steps, and every step either uses an
//      action or runs a command;
//   4. every `strategy.matrix` list has at least one value, because an empty
//      matrix silently skips the job instead of failing it;
//   5. every `node <path>` a step runs points at a file that exists;
//   6. every `pnpm <script>` a step runs is a script the root package.json has.
//
// Checks 5 and 6 are the ones that catch real drift: a renamed script leaves a
// green-looking workflow that never runs what its name says.

import { readFileSync, readdirSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { parse } from 'yaml';

const repoRoot = resolve(import.meta.dirname, '..', '..');
const workflowDir = join(repoRoot, '.github', 'workflows');

const targets = process.argv.slice(2).length
	? process.argv.slice(2).map((path) => resolve(repoRoot, path))
	: readdirSync(workflowDir)
			.filter((file) => file.endsWith('.yml') || file.endsWith('.yaml'))
			.map((file) => join(workflowDir, file));

const rootScripts = new Set(
	Object.keys(JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf-8')).scripts ?? {}),
);

const problems = [];

function checkRunLine(where, line) {
	const node = line.match(/(?:^|&&|\|\||;)\s*node\s+(\S+)/);
	if (node && !node[1].startsWith('-') && !existsSync(join(repoRoot, node[1]))) {
		problems.push(`${where}: runs \`node ${node[1]}\`, which does not exist.`);
	}
	// `pnpm --dir x run y`, `pnpm exec ...` and `pnpm dlx ...` address other
	// manifests or binaries; only a bare `pnpm <name>` names a root script.
	const pnpm = line.match(/(?:^|&&|\|\||;)\s*pnpm\s+([a-z][\w:-]*)/);
	const delegating = /^(exec|dlx|run|install|add|--dir|--filter|-C|-r|-w)$/;
	if (pnpm && !delegating.test(pnpm[1]) && !rootScripts.has(pnpm[1])) {
		problems.push(`${where}: runs \`pnpm ${pnpm[1]}\`, which is not a root package.json script.`);
	}
}

for (const target of targets) {
	const label = target.replace(`${repoRoot}/`, '');
	let workflow;
	try {
		workflow = parse(readFileSync(target, 'utf-8'));
	} catch (error) {
		problems.push(`${label}: does not parse as YAML - ${error.message}`);
		continue;
	}

	if (!workflow || typeof workflow !== 'object') {
		problems.push(`${label}: is empty.`);
		continue;
	}
	if (!workflow.name) problems.push(`${label}: has no \`name\`.`);
	// `on:` is YAML 1.1's boolean true, which is why the parsed key can be `true`.
	if (workflow.on === undefined && workflow[true] === undefined) {
		problems.push(`${label}: has no \`on:\` trigger.`);
	}

	const jobs = workflow.jobs ?? {};
	if (Object.keys(jobs).length === 0) problems.push(`${label}: defines no jobs.`);

	for (const [jobName, job] of Object.entries(jobs)) {
		const where = `${label} job \`${jobName}\``;
		if (!job || typeof job !== 'object') {
			problems.push(`${where}: is empty.`);
			continue;
		}
		if (!job['runs-on'] && !job.uses) problems.push(`${where}: names no runner.`);

		for (const [key, values] of Object.entries(job.strategy?.matrix ?? {})) {
			if (key === 'include' || key === 'exclude') continue;
			if (!Array.isArray(values) || values.length === 0) {
				problems.push(`${where}: matrix \`${key}\` is empty, so the job would silently skip.`);
			}
		}

		const steps = job.steps ?? [];
		if (!job.uses && steps.length === 0) problems.push(`${where}: has no steps.`);
		steps.forEach((step, index) => {
			const stepWhere = `${where} step ${index + 1}${step?.name ? ` (${step.name})` : ''}`;
			if (!step || (!step.uses && !step.run)) {
				problems.push(`${stepWhere}: neither \`uses\` an action nor \`run\`s a command.`);
				return;
			}
			for (const line of String(step.run ?? '').split('\n')) checkRunLine(stepWhere, line);
		});
	}
}

if (problems.length > 0) {
	for (const problem of problems) console.error(`::error::${problem}`);
	console.error(`\n${problems.length} problem(s) in ${targets.length} workflow file(s).`);
	process.exit(1);
}

console.log(`${targets.length} workflow file(s) checked, no problems.`);
