import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
const root = process.argv[2] ?? '/tmp/jev-experiments';
const read = name => JSON.parse(readFileSync(`${root}/${name}`, 'utf8'));
const average = values => values.reduce((sum, n) => sum + n, 0) / values.length;
const music = read('music/results.json').runs;
const replay = read('music/replay.json').runs;
const headless = readdirSync(`${root}/headless`).filter(f => f.endsWith('.json')).map(name => ({ name, ...read(`headless/${name}`) }));
const observations = read('observations/results.json').results;
const ledger = readFileSync(`${root}/api.jsonl`, 'utf8').trim().split('\n').map(JSON.parse);
const starts = ledger.filter(r => r.kind === 'start');
const responses = ledger.filter(r => r.kind === 'result');
const modal = read('modal-followup.json');
const summary = {
  music: Object.fromEntries(['random', 'least_visited', 'jev'].map(policy => { const runs = music.filter(r => r.policy === policy); return [policy, { runs: runs.length, meanStates: average(runs.map(r => r.uniqueStates)), meanTransitions: average(runs.map(r => r.uniqueTransitions)), meanMilliseconds: average(runs.map(r => r.milliseconds)), failures: runs.filter(r => r.failure).length }]; })),
  musicReplayMatches: music.filter((r, i) => JSON.stringify(r.steps.map(s => s.after)) === JSON.stringify(replay[i].steps.map(s => s.after))).length,
  headless: headless.map(r => ({ name: r.name, actions: r.steps.length, failureAtAction: r.failure ? r.failure.step + 1 : null, finalFocus: r.steps.at(-1).after.focus, replayMatches: JSON.stringify(r.steps.map(s => ({ action: s.action, before: s.before, after: s.after, failure: s.failure }))) === JSON.stringify(read(`headless/replay/${r.name}`).steps.map(s => ({ action: s.action, before: s.before, after: s.after, failure: s.failure }))) })),
  observations: Object.fromEntries([...new Set(observations.map(r => r.variant))].map(variant => { const rows = observations.filter(r => r.variant === variant); return [variant, { correct: rows.filter(r => r.correct).length, total: rows.length, errors: rows.filter(r => !r.correct) }]; })),
  modalSettledFollowup: { runs: modal.length, runsWithContainmentExit: modal.filter(r => r.states.some(s => !s.contained)).length, runsWithPageErrors: modal.filter(r => r.errors.length).length },
  resume: read('resume.json').map(({ policy, pattern, initial, expected, actual, countWhileHeld, conditionAchieved, failure, errors }) => ({ policy, pattern, initial, expected, actual, countWhileHeld, conditionAchieved, failure, errors })),
  usage: { attempts: starts.length, successes: responses.length, inputTokens: responses.reduce((s, r) => s + r.response.usage.input_tokens, 0), reportedUSD: responses.reduce((s, r) => s + r.costUSD, 0), reservedUSD: starts.reduce((s, r) => s + r.reserveUSD, 0), meanLatencyMilliseconds: average(responses.map(r => r.milliseconds)) },
};
writeFileSync(`${root}/summary.json`, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
