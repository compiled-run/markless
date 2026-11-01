// A stand-in for the `gh` calls the release cut makes, answering from the JSON file in FAKE_GH_STATE.
const { appendFileSync, readFileSync } = require('node:fs');

const state = JSON.parse(readFileSync(process.env.FAKE_GH_STATE, 'utf8'));
const args = process.argv.slice(2);
const print = (value) => process.stdout.write(JSON.stringify(value));
const commitIn = (path) => /commits\/([0-9a-f]+)\//u.exec(path)?.[1] ?? '';

if (args[0] === 'release') process.exit(state.announced ? 0 : 1);

if (args[0] === 'run') {
	const sha = args[args.indexOf('--commit') + 1];
	const conclusion = sha in state.runs ? state.runs[sha] : state.conclusion;
	const running = conclusion === 'in_progress';
	print(
		conclusion === null
			? []
			: [
					{
						databaseId: 41,
						headSha: sha,
						status: running ? 'in_progress' : 'completed',
						conclusion: running ? '' : conclusion,
						url: `https://ci.example/run/${sha.slice(0, 7)}`,
					},
				],
	);
	process.exit(0);
}

if (args[0] === 'api' && args[1] === '-X' && args[2] === 'POST') {
	const fields = Object.fromEntries(
		args.flatMap((arg, index) =>
			args[index - 1] === '-f' ? [arg.split(/=(.*)/su).slice(0, 2)] : [],
		),
	);
	appendFileSync(state.posted, `${JSON.stringify({ path: args[3], ...fields })}\n`);
	print({});
	process.exit(0);
}

const path = args[1] ?? '';
if (path.endsWith('/rules/branches/main')) {
	print([
		{
			type: 'required_status_checks',
			parameters: { required_status_checks: [{ context: 'test', integration_id: 15368 }] },
		},
	]);
} else if (path.endsWith('/branches/main')) {
	print({ protection: { enabled: false } });
} else if (/actions\/runs\/\d+$/u.test(path)) {
	print({ check_suite_id: 7, ...state.run });
} else if (path.includes('/check-runs')) {
	print({
		check_runs: [
			{
				name: 'test',
				status: 'completed',
				conclusion: state.checks[commitIn(path)] ?? 'success',
				app: { id: 15368 },
				check_suite: { id: 7 },
				html_url: 'https://ci.example/check',
			},
		],
	});
} else if (path.endsWith('/pulls')) {
	print([]);
} else if (path.includes('/statuses')) {
	print(state.statuses[commitIn(path)] ?? []);
} else {
	process.stderr.write(`fake gh: unexpected call: gh ${args.join(' ')}\n`);
	process.exit(1);
}
