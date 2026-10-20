#!/usr/bin/env node
// Reads the checks branch protection requires on main from the GitHub API (never a copied list)
// and either proves ci.yml produces each of them (--names) or that each passed on --sha <commit>.
// Only check runs from a pull_request-event CI run count: GitHub ignored the same checks green from
// a workflow_dispatch run when the 0.6.0 and 0.7.0 cuts tried to move main.
//
// Usage: node scripts/release/required-checks.mjs --names
//        node scripts/release/required-checks.mjs --sha <commit>
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { parse } from 'yaml';
import { repoRoot } from './release-packages.mjs';

/**
 * Why `checkRuns` do not satisfy `required`; empty when every required check passed.
 * With `countedSuites`, a check run outside those check suites does not count.
 */
export function checkRunProblems(required, checkRuns, countedSuites) {
	const problems = [];
	for (const { context, app_id: appId } of required) {
		const anywhere = checkRuns.filter((run) => run.name === context);
		const named = countedSuites
			? anywhere.filter((run) => countedSuites.has(run.check_suite?.id))
			: anywhere;
		const fromApp = appId ? named.filter((run) => run.app?.id === appId) : named;
		if (fromApp.some((run) => run.status === 'completed' && run.conclusion === 'success'))
			continue;
		if (named.length === 0 && anywhere.length > 0)
			problems.push(
				`${context}: only from a CI run main's rules do not count, such as a workflow_dispatch run`,
			);
		else if (named.length === 0) problems.push(`${context}: no check run on this commit`);
		else if (fromApp.length === 0)
			problems.push(`${context}: no check run on this commit from app ${appId}`);
		else {
			const last = fromApp.at(-1);
			problems.push(`${context}: ${last.conclusion ?? last.status} (${last.html_url})`);
		}
	}
	return problems;
}

/** Required contexts no ci.yml job would report, so a release could never satisfy them. */
export function contextsMissingFromWorkflow(required, workflow) {
	const names = new Set(
		Object.entries(workflow.jobs ?? {}).flatMap(([id, job]) => [id, job?.name].filter(Boolean)),
	);
	return required.map(({ context }) => context).filter((context) => !names.has(context));
}

function gh(path) {
	return JSON.parse(execFileSync('gh', ['api', path], { encoding: 'utf8' }));
}

/** Required checks from main's active rulesets and any classic branch protection, deduplicated. */
export function requiredChecksFrom(rules, protection) {
	const fromRules = rules
		.filter((rule) => rule.type === 'required_status_checks')
		.flatMap((rule) => rule.parameters?.required_status_checks ?? [])
		.map(({ context, integration_id: appId }) => ({ context, app_id: appId }));
	const fromProtection = protection?.required_status_checks?.checks ?? [];
	const seen = new Set();
	return [...fromRules, ...fromProtection].filter(({ context, app_id: appId }) => {
		const key = `${context}\0${appId ?? ''}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

function requiredChecks(repository) {
	const checks = requiredChecksFrom(
		gh(`repos/${repository}/rules/branches/main`),
		gh(`repos/${repository}/branches/main`).protection,
	);
	if (checks.length === 0) {
		throw new Error(`could not read main's required status checks for ${repository}`);
	}
	return checks;
}

function main(argv) {
	const repository = process.env.GITHUB_REPOSITORY ?? 'compiled-run/markless';
	const required = requiredChecks(repository);
	console.log(`required on main: ${required.map((check) => check.context).join(', ')}`);
	if (argv[0] === '--names') {
		const workflow = parse(readFileSync(`${repoRoot}/.github/workflows/ci.yml`, 'utf8'));
		const missing = contextsMissingFromWorkflow(required, workflow);
		if (missing.length > 0) {
			console.error(
				`ci.yml has no job named ${missing.join(', ')}, so a release cut could never pass them`,
			);
			return 1;
		}
		console.log('ci.yml reports every required check');
		return 0;
	}
	if (argv[0] === '--sha' && argv[1]) {
		const runs = [];
		for (let page = 1; ; page += 1) {
			const batch = gh(
				`repos/${repository}/commits/${argv[1]}/check-runs?filter=latest&per_page=100&page=${page}`,
			).check_runs;
			runs.push(...batch);
			if (batch.length < 100) break;
		}
		const pullRequestSuites = new Set(
			gh(
				`repos/${repository}/actions/runs?head_sha=${argv[1]}&event=pull_request&per_page=100`,
			).workflow_runs.map((run) => run.check_suite_id),
		);
		const problems = checkRunProblems(required, runs, pullRequestSuites);
		if (problems.length > 0) {
			console.error(
				`required checks have not passed on ${argv[1]}:\n${problems.map((line) => `  - ${line}`).join('\n')}`,
			);
			return 1;
		}
		console.log(`every required check passed on ${argv[1]}`);
		return 0;
	}
	console.error('usage: node scripts/release/required-checks.mjs --names | --sha <commit>');
	return 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
	process.exitCode = main(process.argv.slice(2));
}
