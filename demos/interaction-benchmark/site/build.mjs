#!/usr/bin/env node
// Static results site: node demos/interaction-benchmark/site/build.mjs --runs <run-dir>... [--out <dir>]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe } from '../runner/lib/stats.mjs';
import { cellKey, profileLabel } from '../runner/lib/summary.mjs';
import { renderMarkdown, markdownSection } from './src/markdown.mjs';

const siteDir = path.dirname(fileURLToPath(import.meta.url));
const benchDir = path.dirname(siteDir);
const repoDir = path.resolve(benchDir, '..', '..');

function parseCli(argv) {
	const opts = { runs: [], out: path.join(siteDir, 'dist') };
	for (let i = 0; i < argv.length; i++) {
		if (argv[i] === '--runs') {
			while (argv[i + 1] && !argv[i + 1].startsWith('--')) opts.runs.push(path.resolve(argv[++i]));
		} else if (argv[i] === '--out') opts.out = path.resolve(argv[++i]);
		else throw new Error(`unknown argument ${argv[i]} (usage: build.mjs --runs <dir>... [--out <dir>])`);
	}
	return opts;
}

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const readJsonl = (file) =>
	fs
		.readFileSync(file, 'utf8')
		.split('\n')
		.filter((l) => l.trim())
		.map((l) => JSON.parse(l));
const readText = (file) => fs.readFileSync(file, 'utf8');

const site = readJson(path.join(siteDir, 'data/site.json'));
const entrantsData = readJson(path.join(siteDir, 'data/entrants.json'));
const deployments = readJson(path.join(siteDir, 'data/deployments.json')).deployments;
const observations = readJson(path.join(siteDir, 'data/observations.json')).observations;
const entrantById = new Map(entrantsData.entrants.map((e) => [e.id, e]));
// A target is one runnable app: an entrant plus one of its variants, keyed by the runner target id.
const siteTargets = entrantsData.entrants.flatMap((e) =>
	e.variants.map((v) => {
		const id = v.runnerTarget ?? (v.label === 'default' ? e.id : `${e.id}-${v.label}`);
		return { id, entrant: e, variant: v, isDefault: v.label === 'default', label: v.label === 'default' ? e.name : `${e.name} (${v.label})`, source: v.source ?? e.source, benchMd: v.benchMd ?? e.benchMd, deployment: deployments[v.deployment ?? id] ?? {} };
	}),
);
const targetById = new Map(siteTargets.map((t) => [t.id, t]));
const targetIdOf = (entrant, variant) => siteTargets.find((t) => t.entrant.id === entrant && t.variant.label === (variant ?? 'default'))?.id ?? (variant && variant !== 'default' ? `${entrant}-${variant}` : entrant);

const opts = parseCli(process.argv.slice(2));
if (!opts.runs.length) opts.runs = site.defaultRuns.map((r) => path.resolve(siteDir, r));

const esc = (v) =>
	String(v ?? '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
const slug = (v) => String(v).replace(/[^A-Za-z0-9._-]+/g, '-');
const fmtMs = (v) => (v === null || v === undefined ? '–' : Number(v).toFixed(1));
const fmtKb = (v) => (v === null || v === undefined ? '–' : (Number(v) / 1024).toFixed(1));
const fmtInt = (v) => (v === null || v === undefined ? '–' : String(Math.round(Number(v))));
const sourceUrl = (p) => site.sourceBaseUrl + p;

// ---------- runs ----------

const METRICS = {
	inputToResponseMs: (r) => r.timings.inputToResponseMs,
	inputToDomMs: (r) => r.timings.inputToDomMs,
	navToResponseMs: (r) => r.timings.navToResponseMs,
	pendingMs: (r) => r.timings.pendingMs ?? null,
	serverMs: (r) => r.timings.serverMs ?? null,
	eventDurationMs: (r) => r.timings.eventDurationMs,
	compressedJs: (r) => r.bytes.compressedJs,
	decodedJs: (r) => r.bytes.decodedJs,
	htmlCompressed: (r) => r.bytes.html.compressed,
	compressedCss: (r) => r.bytes.compressedCss ?? null,
	initialRequests: (r) => r.requests.initial,
	perActionRequests: (r) => r.requests.perAction,
	perActionDocument: (r) => r.requests.perActionDocument ?? null,
};

function loadRun(dir) {
	const need = (name) => {
		const file = path.join(dir, name);
		if (!fs.existsSync(file)) throw new Error(`${dir}: missing ${name}`);
		return file;
	};
	const run = readJson(need('run.json'));
	const results = readJsonl(need('results.jsonl'));
	const sampleFile = path.join(dir, 'SAMPLE.json');
	const sample = fs.existsSync(sampleFile) ? readJson(sampleFile) : null;
	const id = slug(run.runId);
	const cells = new Map();
	for (const r of results) {
		const key = cellKey(r);
		if (!cells.has(key))
			cells.set(key, {
				key,
				target: targetIdOf(r.framework.entrant, r.framework.variant),
				entrant: r.framework.entrant,
				variant: r.framework.variant,
				renderMode: r.framework.renderMode,
				browser: r.browser.name,
				browserVersion: r.browser.version,
				profile: profileLabel(r.profile),
				caseId: r.caseId,
				phase: r.phase,
				records: [],
			});
		cells.get(key).records.push(r);
	}
	const cellList = [...cells.values()].map((c) => {
		const ok = c.records.filter((r) => r.failure === null);
		const failures = {};
		for (const r of c.records) if (r.failure) failures[r.failure.kind] = (failures[r.failure.kind] ?? 0) + 1;
		const metrics = {};
		for (const [name, pick] of Object.entries(METRICS)) metrics[name] = describe(ok.map(pick));
		const failureMessages = [...new Set(c.records.filter((r) => r.failure).map((r) => `${r.failure.kind}: ${r.failure.message}`))].slice(0, 5);
		const buildIds = [...new Set(c.records.map((r) => r.build.id))];
		const { records, ...rest } = c;
		return { ...rest, visits: records.length, successes: ok.length, failures, failureMessages, metrics, buildIds };
	});
	const summaryFile = path.join(dir, 'summary.json');
	if (fs.existsSync(summaryFile)) {
		const summaryCells = readJson(summaryFile).cells?.length;
		if (summaryCells !== undefined && summaryCells !== cellList.length) console.warn(`[site] ${id}: summary.json has ${summaryCells} cells, results.jsonl gives ${cellList.length}`);
	}
	const downloads = ['results.jsonl', 'raw.jsonl', 'summary.json', 'summary.md', 'run.json', 'correctness.json', 'SAMPLE.json'].filter((f) => fs.existsSync(path.join(dir, f)));
	const pilot = run.label === 'pilot' ? (run.labelNote ?? 'Pilot run: checks the pipeline and failure rates only. Timings are noisy and are not published results.') : null;
	return { dir, id, run, results, sample, pilot, cells: cellList, downloads };
}

const runs = opts.runs.map(loadRun).sort((a, b) => String(b.run.started).localeCompare(String(a.run.started)));
const seen = new Set();
for (const r of runs) {
	if (seen.has(r.id)) throw new Error(`duplicate run id ${r.id}`);
	seen.add(r.id);
}

const entrantLabel = (run, entrant, variant) => {
	if (run.sample) return 'Selftest fixture (SAMPLE, not framework results)';
	const name = entrantById.get(entrant)?.name ?? entrant;
	return variant && variant !== 'default' ? `${name} (${variant})` : name;
};
const targetLabel = (run, id) => (run.sample ? entrantLabel(run) : (targetById.get(id)?.label ?? id));
const targetEntrant = (id) => targetById.get(id)?.entrant.id ?? id;
const navLabel = (run, entrant) => {
	if (run.sample) return 'fixture';
	return entrantById.get(entrant)?.navigation === 'document' ? 'document navigation' : 'client navigation';
};
const runBadges = (r) => `${r.sample ? ' <span class="badge sample">SAMPLE</span>' : ''}${r.pilot ? ' <span class="badge sample">PILOT</span>' : ''}`;
const runNotices = (r) => [r.sample ? ['SAMPLE DATA.', `${r.sample.label}. ${r.sample.note}`] : null, r.pilot ? ['PILOT RUN, NOT RESULTS.', r.pilot] : null].filter(Boolean);

// ---------- contract-derived case descriptions ----------

const contractMd = readText(path.join(benchDir, 'CONTRACT.md'));
const caseRows = new Map();
for (const line of markdownSection(contractMd, '## 10. Measured cases').split('\n')) {
	const m = line.match(/^\|\s*`([a-z0-9-]+)`[^|]*\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|/);
	if (m) caseRows.set(m[1], { route: m[2].trim(), phases: m[3].trim(), pre: m[4].trim(), input: m[5].trim(), assertion: m[6].trim() });
}
const inlineMd = (s) => renderMarkdown(s).replace(/^<p>|<\/p>\n?$/g, '');

// ---------- layout ----------

function page({ depth, title, current, body, notices = [] }) {
	const up = '../'.repeat(depth);
	const nav = [
		['index.html', 'Results', 'home'],
		['compare.html', 'Compare frameworks', 'compare'],
		['protocol.html', 'Protocol', 'protocol'],
		['observations.html', 'Observations', 'observations'],
	]
		.map(([href, label, key]) => `<a href="${up}${href}"${current === key ? ' aria-current="page"' : ''}>${label}</a>`)
		.join('');
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} | ${esc(site.title)}</title>
<link rel="stylesheet" href="${up}styles.css">
<script src="${up}app.js" defer></script>
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="site-header"><span class="brand">${esc(site.title)}</span><nav aria-label="Site">${nav}</nav></header>
${notices.map(([head, text]) => `<p class="sample-banner" role="note"><strong>${esc(head)}</strong> ${esc(text)}</p>`).join('\n')}
<main id="main">
${body}
</main>
<footer class="site-footer"><p>No single winner score is computed. Every number is shown with its sample size, spread and failure count. Source: <a href="${esc(sourceUrl('demos/interaction-benchmark'))}">demos/interaction-benchmark</a>.</p></footer>
</body>
</html>
`;
}

const table = (head, rows, { caption, cls = '' } = {}) =>
	`<div class="table-wrap"><table${cls ? ` class="${cls}"` : ''}>${caption ? `<caption>${caption}</caption>` : ''}<thead><tr>${head.map((h) => `<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;

const failureText = (c) => {
	const entries = Object.entries(c.failures).filter(([k]) => k !== 'input-lost');
	return entries.length ? entries.map(([k, v]) => `${esc(k)}: ${v}`).join(', ') : '0';
};
const inputLostText = (c) => String(c.failures['input-lost'] ?? 0);

const entrantFilter = (run, targetIds) =>
	targetIds.length > 1
		? `<fieldset class="entrant-filter" hidden><legend>Show entrants</legend>${targetIds.map((id) => `<label><input type="checkbox" value="${esc(id)}" checked> ${esc(targetLabel(run, id))}</label>`).join('')}</fieldset>`
		: '';

// ---------- charts (inline SVG) ----------

function niceMax(v) {
	if (!(v > 0)) return 1;
	const exp = 10 ** Math.floor(Math.log10(v));
	for (const m of [1, 2, 2.5, 5, 10]) if (m * exp >= v) return m * exp;
	return 10 * exp;
}

let chartSeq = 0;
function distributionChart({ title, rows, unit = 'ms' }) {
	const id = `chart-${++chartSeq}`;
	const W = 760;
	const left = 250;
	const right = 90;
	const rowH = 30;
	const top = 10;
	const axisH = 30;
	const H = top + rows.length * rowH + axisH;
	const max = niceMax(Math.max(0, ...rows.map((r) => r.d?.p95 ?? r.d?.max ?? 0)) * 1.05);
	const x = (v) => left + (Math.min(v, max) / max) * (W - left - right);
	const ticks = Array.from({ length: 6 }, (_, i) => (max * i) / 5);
	const desc = rows
		.map((r) => (r.d?.n ? `${r.label}: median ${fmtMs(r.d.median)} ${unit}, IQR ${fmtMs(r.d.q1)} to ${fmtMs(r.d.q3)}, p95 ${fmtMs(r.d.p95)}, n ${r.d.n}, failures ${r.failed}.` : `${r.label}: no successful visits, failures ${r.failed}.`))
		.join(' ');
	const body = rows
		.map((r, i) => {
			const y = top + i * rowH + rowH / 2;
			const label = `<text x="${left - 8}" y="${y + 4}" text-anchor="end" class="c-label">${esc(r.short)}</text>`;
			if (!r.d?.n) return `<g data-entrant="${esc(r.target)}">${label}<text x="${left + 4}" y="${y + 4}" class="c-none">no successful visits (${r.failed} failed)</text></g>`;
			const d = r.d;
			return `<g data-entrant="${esc(r.target)}">${label}<line x1="${x(d.min)}" x2="${x(d.p95)}" y1="${y}" y2="${y}" class="c-whisker"/><rect x="${x(d.q1)}" y="${y - 8}" width="${Math.max(1, x(d.q3) - x(d.q1))}" height="16" class="c-box"/><line x1="${x(d.median)}" x2="${x(d.median)}" y1="${y - 10}" y2="${y + 10}" class="c-median"/><path d="M${x(d.p95)} ${y - 6}l5 6l-5 6l-5 -6z" class="c-p95"/><text x="${W - right + 6}" y="${y + 4}" class="c-value">${fmtMs(d.median)}${r.failed ? ` · ${r.failed}✕` : ''}</text></g>`;
		})
		.join('');
	const axisY = top + rows.length * rowH + 4;
	const axis = ticks.map((t) => `<g><line x1="${x(t)}" x2="${x(t)}" y1="${top}" y2="${axisY}" class="c-grid"/><text x="${x(t)}" y="${axisY + 14}" text-anchor="middle" class="c-tick">${Number(t.toFixed(1))}</text></g>`).join('');
	return `<figure class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="${id}-t ${id}-d" preserveAspectRatio="xMinYMin meet"><title id="${id}-t">${esc(title)}</title><desc id="${id}-d">${esc(desc)}</desc>${axis}${body}<text x="${left - 8}" y="${axisY + 14}" text-anchor="end" class="c-tick">${unit}</text></svg><figcaption>${esc(title)}. Box = interquartile range (IQR), bar = median, line = min to p95, diamond = p95; right column = median and failed-visit count (✕). The table below has the same numbers.</figcaption></figure>`;
}

// ---------- pages ----------

const pages = new Map();
const write = (rel, html) => pages.set(rel, html);

const tuningsList = (v) =>
	v.tunings?.length
		? `<ul class="plain">${v.tunings.map((t) => `<li><code>${esc(t.setting)}</code> (default ${esc(t.default)}): ${esc(t.why)} <span class="muted">Source: ${esc(t.source)}</span></li>`).join('')}</ul>`
		: '';
const variantCell = (t) => (t.isDefault ? `<code>default</code>: ${esc(t.variant.note)}` : `<code>${esc(t.variant.label)}</code>: ${esc(t.variant.note)}${tuningsList(t.variant)}`);

function entrantsTable() {
	const rows = siteTargets.map((t) => {
		const e = t.entrant;
		const dep = t.deployment;
		const demo = dep.url ? `<a href="${esc(dep.url)}">${esc(dep.url.replace(/^https?:\/\//, ''))}</a>` : '<span class="muted">not deployed yet</span>';
		const versions = `<ul class="plain">${e.versions.map((v) => `<li><code>${esc(v.package)}</code> ${esc(v.version)}${v.prerelease ? ' <span class="badge warn">prerelease</span>' : ''}</li>`).join('')}</ul>`;
		return `<tr data-target="${esc(t.id)}"><th scope="row"><a href="compare.html#${esc(t.id)}">${esc(t.label)}</a><br><span class="muted">target <code>${esc(t.id)}</code></span></th><td>${versions}</td><td>${esc(e.prereleaseSummary)}</td><td>${esc(e.renderMode.toUpperCase())}</td><td>${esc(dep.runtime ?? e.vercelRuntime)}</td><td>${e.navigation === 'document' ? '<strong>document</strong>' : 'client'}</td><td>${variantCell(t)}</td><td>${e.deviations.length} <a href="compare.html#${esc(e.id)}-deviations">listed</a></td><td>${demo}</td></tr>`;
	});
	return table(['Entrant', 'Pinned versions', 'Release status', 'Rendering', 'Deploy runtime', 'Navigation', 'Variant and tunings', 'Contract deviations', 'Live demo'], rows, {
		caption: `Entrants, one row per measured target (an entrant with one of its variants), extracted by hand from each app's BENCH.md (checked ${esc(entrantsData.checkedAt)}).`,
	});
}

function runsTable() {
	const rows = runs.map((r) => {
		const builds = r.run.targets.map((t) => `<li>${esc(targetLabel(r, t.name))}: <code>${esc(t.buildId ?? 'unknown')}</code> @ <code>${esc(t.sourceRevision)}</code></li>`).join('');
		return `<tr><th scope="row"><a href="runs/${r.id}/index.html">${esc(r.run.runId)}</a>${runBadges(r)}</th><td>${esc(r.run.started)}</td><td>${esc(Object.entries(r.run.browserVersions ?? {}).map(([k, v]) => `${k} ${v}`).join(', '))}</td><td>${esc(r.run.config.profiles.map((p) => p.name).join(', '))}</td><td>${r.run.config.visits}</td><td><ul class="plain">${builds}</ul></td><td>${r.downloads.filter((f) => f.endsWith('.jsonl') || f === 'summary.json').map((f) => `<a href="runs/${r.id}/${f}">${f}</a>`).join(' ')}</td></tr>`;
	});
	return table(['Run', 'Started (UTC)', 'Browsers', 'Profiles', 'Visits per cell', 'Build IDs @ source revision', 'Raw data'], rows, { caption: 'Result runs, newest first. Earlier runs stay published.' });
}

const onlySamples = runs.length > 0 && runs.every((r) => r.sample);
const noPublishable = runs.length > 0 && runs.every((r) => r.sample || r.pilot);
write(
	'index.html',
	page({
		depth: 0,
		title: 'Results',
		current: 'home',
		notices: onlySamples
			? [['SAMPLE DATA.', 'Every run on this site is fixture data from the runner selftest. No framework has been measured yet; these numbers say nothing about any framework.']]
			: noPublishable
				? [['NO PUBLISHED RESULTS YET.', 'Every run on this site is either selftest fixture data (SAMPLE) or a pilot run (PILOT) that only checks the pipeline and failure rates on a noisy host. None of these numbers is a framework result.']]
				: [],
		body: `<h1>${esc(site.title)}</h1>
<p class="lead">The same three-route dashboard (<a href="protocol.html#contract">behavior contract ${esc(entrantsData.contractVersion)}</a>) implemented idiomatically in eight frameworks, measured by one external Playwright runner. Each implementation is deployed on its own, and every result links to its raw records.</p>
<section class="uncertainty" aria-labelledby="how-to-read"><h2 id="how-to-read">How to read these results</h2><ul>
<li>There is <strong>no overall winner score</strong>. Frameworks trade off differently across cases, phases, browsers and network profiles; each cell is reported separately.</li>
<li>Every latency is a distribution: median, p95, interquartile range (IQR, the middle half of the visits), standard deviation and <em>n</em>, the number of successful visits. Small <em>n</em> means wide uncertainty.</li>
<li>Failed visits (timeouts, wrong responses, lost input) are counted beside the latencies, never dropped and never averaged in. Lost input (the page received the input but never showed the response) has its own column.</li>
<li><em>input-to-response</em> is a presentation estimate (two animation frames after the correct DOM appears), not a measured paint. <em>navigation-to-response</em> is shown separately and only for the early phase.</li>
<li>Deploy runtimes and navigation modes differ (Qwik runs on Vercel Edge, Ripple uses document navigation). They are labeled beside each result.</li>
</ul></section>
<h2 id="entrants">Entrants</h2>
${entrantsTable()}
<h2 id="runs">Result runs</h2>
${runs.length ? runsTable() : '<p>No runs yet.</p>'}
<h2 id="observations">Upstream observations</h2>
<p>Things noticed while building the entrants. They are observations, not diagnosed bugs. <a href="observations.html">All observations</a>.</p>`,
	}),
);

write(
	'observations.html',
	page({
		depth: 0,
		title: 'Observations',
		current: 'observations',
		body: `<h1>Upstream observations</h1>
<p>Observed while implementing the entrants. None of these has been reduced to a minimal reproduction, so each is reported as an observation, not as a diagnosed bug. Maintainers are welcome to review the implementations.</p>
<ul class="observations">${observations.map((o) => `<li><strong>${esc(entrantById.get(o.entrant)?.name ?? o.entrant)}.</strong> ${esc(o.text)} <span class="muted">(${o.reproducedMinimally ? 'reproduced minimally' : 'not reproduced minimally'}; source <a href="${esc(sourceUrl(o.source))}"><code>${esc(o.source)}</code></a>)</span></li>`).join('')}</ul>`,
	}),
);

write(
	'compare.html',
	page({
		depth: 0,
		title: 'Compare frameworks',
		current: 'compare',
		body: `<h1>How each entrant renders, activates and delivers</h1>
<p>All entrants render every route on the server (SSR). They differ in how the page becomes interactive (activation), how much code arrives and when (delivery), and how navigation works. Byte figures here are the authors' own notes from each BENCH.md; measured bytes are in each run's tables.</p>
<ul class="toc">${siteTargets.map((t) => `<li><a href="#${esc(t.id)}">${esc(t.label)}</a></li>`).join('')}</ul>
${table(
	['Entrant', 'Variant', 'Rendering', 'Activation', 'Input before activation', 'Navigation', 'Deploy runtime'],
	siteTargets.map(
		(t) =>
			`<tr><th scope="row"><a href="#${esc(t.id)}">${esc(t.label)}</a></th><td>${esc(t.variant.label)}</td><td>${esc(t.entrant.renderMode.toUpperCase())}</td><td>${esc(t.entrant.activationShort)}${t.isDefault ? '' : `<br><span class="muted">Tuned settings: ${esc((t.variant.tunings ?? []).map((x) => x.setting).join('; '))}</span>`}</td><td>${esc(t.entrant.earlyInput)}</td><td>${t.entrant.navigation === 'document' ? '<strong>document</strong>' : 'client'}</td><td>${esc(t.deployment.runtime ?? t.entrant.vercelRuntime.split(' (')[0])}</td></tr>`,
	),
	{ caption: 'At a glance, one row per measured target. A variant shares its entrant\'s description; its tuned settings are listed beside it.' },
)}
${entrantsData.entrants
	.map(
		(e) => `<section class="entrant" aria-labelledby="${esc(e.id)}"><h2 id="${esc(e.id)}">${esc(e.name)}</h2>
<dl>
<dt>Rendering</dt><dd>${esc(e.renderingNote)}</dd>
<dt>Activation</dt><dd>${esc(e.activation)}</dd>
<dt>Delivery</dt><dd>${esc(e.delivery)}</dd>
<dt>Navigation</dt><dd>${esc(e.navigationNote)}</dd>
<dt>Deploy runtime</dt><dd>${esc(e.vercelRuntime)}</dd>
<dt>Variants</dt><dd>${e.variants.map((v) => `<code>${esc(v.label)}</code>: ${esc(v.note)}`).join('<br>')}</dd>
<dt>Source</dt><dd><a href="${esc(sourceUrl(e.source))}"><code>${esc(e.source)}</code></a> (notes: <a href="${esc(sourceUrl(e.benchMd))}"><code>BENCH.md</code></a>)</dd>
</dl>
${siteTargets
	.filter((t) => t.entrant === e && !t.isDefault)
	.map(
		(t) => `<h3 id="${esc(t.id)}">Variant: ${esc(t.label)}</h3>
<p>${esc(t.variant.note)}</p>
${table(['Setting', 'Default', 'Why', 'Source'], (t.variant.tunings ?? []).map((x) => `<tr><th scope="row"><code>${esc(x.setting)}</code></th><td><code>${esc(x.default)}</code></td><td>${esc(x.why)}</td><td>${esc(x.source)}</td></tr>`), { caption: `Tuned settings of runner target <code>${esc(t.id)}</code>` })}
<p>Source: <a href="${esc(sourceUrl(t.source))}"><code>${esc(t.source)}</code></a> (notes: <a href="${esc(sourceUrl(t.benchMd))}"><code>BENCH.md</code></a>). Live demo: ${t.deployment.url ? `<a href="${esc(t.deployment.url)}">${esc(t.deployment.url.replace(/^https?:\/\//, ''))}</a>` : '<span class="muted">not deployed yet</span>'}</p>`,
	)
	.join('\n')}
<h3 id="${esc(e.id)}-deviations">Contract deviations and notes</h3>
<ul>${e.deviations.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>
${e.observations.length ? `<h3 id="${esc(e.id)}-observations">Observations</h3><ul>${e.observations.map((o) => `<li>${esc(o)}</li>`).join('')}</ul>` : ''}
</section>`,
	)
	.join('\n')}`,
	}),
);

// protocol page: sourced from CONTRACT.md, runner/README.md and GOAL.md
const runnerReadme = readText(path.join(benchDir, 'runner/README.md'));
const goalMd = readText(path.join(repoDir, 'scripts/experiments/packed-delivery/GOAL.md'));
const contractBase = sourceUrl('demos/interaction-benchmark/');
const runnerBase = sourceUrl('demos/interaction-benchmark/runner/');
const demoBase = sourceUrl('scripts/experiments/packed-delivery/');
const samplingRules = goalMd.split('\n').filter((l) => /^(Publish individual cases|Before implementation, fix the benchmark)/.test(l));
const fairness = markdownSection(readText(path.join(repoDir, 'scripts/experiments/packed-delivery/BENCHMARK-DEMO.md')), '## Vercel delivery and fairness');
write(
	'protocol.html',
	page({
		depth: 0,
		title: 'Protocol',
		current: 'protocol',
		body: `<h1>Measurement protocol</h1>
<p>This page is generated from the benchmark's own source documents, so it cannot drift from what the runner does: <a href="${esc(sourceUrl('demos/interaction-benchmark/CONTRACT.md'))}"><code>CONTRACT.md</code></a>, <a href="${esc(sourceUrl('demos/interaction-benchmark/runner/README.md'))}"><code>runner/README.md</code></a> and the goal's sampling rules.</p>
<h2 id="sampling">Sampling rules</h2>
${samplingRules.map((l) => renderMarkdown(l, { linkBase: demoBase })).join('')}
<h2 id="fairness">Deployment fairness</h2>
${renderMarkdown(fairness, { linkBase: demoBase })}
<h2 id="runner">Runner protocol</h2>
${renderMarkdown(markdownSection(runnerReadme, '## Protocol'), { headingOffset: 1, linkBase: runnerBase })}
${renderMarkdown(markdownSection(runnerReadme, '## Controlled-host transport (`proxy.mjs`)'), { headingOffset: 1, linkBase: runnerBase })}
${renderMarkdown(markdownSection(runnerReadme, '## Limitations'), { headingOffset: 1, linkBase: runnerBase })}
<h2 id="contract">Behavior contract: measurement definitions</h2>
${renderMarkdown(markdownSection(contractMd, '## 9. Measurement definitions'), { headingOffset: 1, linkBase: contractBase })}
<h2 id="cases">Behavior contract: measured cases</h2>
${renderMarkdown(markdownSection(contractMd, '## 10. Measured cases'), { headingOffset: 1, linkBase: contractBase })}
<h2 id="rules">Behavior contract: rules for every entrant</h2>
${renderMarkdown(markdownSection(contractMd, '## 1. Rules'), { headingOffset: 1, linkBase: contractBase })}`,
	}),
);

const PHASE_TEXT = { early: 'early (input while downloads may still be pending)', settled: 'settled (input after load + network quiet)' };

for (const r of runs) {
	const base = `runs/${r.id}`;
	const notices = runNotices(r);
	const targetIds = [...new Set(r.cells.map((c) => c.target))].sort((a, b) => targetLabel(r, a).localeCompare(targetLabel(r, b)));
	const caseIds = [...new Set(r.cells.map((c) => c.caseId))];
	const groups = (cells) => {
		const out = new Map();
		for (const c of cells) {
			const k = `${c.browser}|${c.profile}|${c.phase}`;
			if (!out.has(k)) out.set(k, []);
			out.get(k).push(c);
		}
		return [...out.entries()].sort(([a], [b]) => a.localeCompare(b));
	};
	const lowN = r.cells.some((c) => c.successes < 30);

	// run overview
	const targetRows = r.run.targets.map(
		(t) =>
			`<tr data-entrant="${esc(t.name)}"><th scope="row">${esc(targetLabel(r, t.name))}<br><span class="muted">target <code>${esc(t.name)}</code></span></th><td>${esc(targetById.get(t.name)?.variant.label ?? r.results.find((x) => x.build.id === t.buildId)?.framework.variant ?? '')}</td><td><code>${esc(t.url)}</code></td><td>${esc(t.host)} / ${esc(t.transport)}${t.proxyProtocol ? ` (${esc(t.proxyProtocol)})` : ''}</td><td><code>${esc(t.buildId ?? 'unknown')}</code></td><td><code>${esc(t.sourceRevision)}</code></td><td>${esc(navLabel(r, targetEntrant(t.name)))}</td><td>${r.sample ? '<span class="muted">not applicable (fixture page, not an app)</span>' : `<ul class="plain">${Object.entries(t.versions ?? {})
				.map(([k, v]) => `<li><code>${esc(k)}</code> ${esc(v)}</li>`)
				.join('')}</ul>`}</td></tr>`,
	);
	const caseOverviewRows = [];
	for (const caseId of caseIds)
		for (const c of r.cells.filter((x) => x.caseId === caseId).sort((a, b) => `${a.browser}${a.profile}${a.phase}`.localeCompare(`${b.browser}${b.profile}${b.phase}`)))
			caseOverviewRows.push(
				`<tr data-entrant="${esc(c.target)}"><th scope="row"><a href="cases/${esc(caseId)}.html">${esc(caseId)}</a></th><td>${esc(entrantLabel(r, c.entrant, c.variant))}</td><td>${esc(c.browser)}</td><td>${esc(c.profile)}</td><td>${esc(c.phase)}</td><td>${c.successes}/${c.visits}</td><td>${inputLostText(c)}</td><td>${failureText(c)}</td><td>${fmtMs(c.metrics.inputToResponseMs.median)}</td><td>${fmtMs(c.metrics.navToResponseMs.median)}</td></tr>`,
			);
	const bytesRows = r.cells
		.slice()
		.sort((a, b) => `${a.caseId}${a.browser}${a.profile}${a.phase}${a.target}`.localeCompare(`${b.caseId}${b.browser}${b.profile}${b.phase}${b.target}`))
		.map(
			(c) =>
				`<tr data-entrant="${esc(c.target)}"><th scope="row">${esc(c.caseId)}</th><td>${esc(entrantLabel(r, c.entrant, c.variant))}</td><td>${esc(c.browser)}</td><td>${esc(c.profile)}</td><td>${esc(c.phase)}</td><td>${fmtKb(c.metrics.compressedJs.median)}</td><td>${fmtKb(c.metrics.decodedJs.median)}</td><td>${fmtKb(c.metrics.htmlCompressed.median)}</td><td>${fmtKb(c.metrics.compressedCss.median)}</td><td>${fmtInt(c.metrics.initialRequests.median)}</td><td>${fmtInt(c.metrics.perActionRequests.median)}</td><td>${fmtInt(c.metrics.perActionDocument.median)}</td><td>${c.metrics.compressedJs.n}</td></tr>`,
		);
	write(
		`${base}/index.html`,
		page({
			depth: 2,
			title: `Run ${r.run.runId}`,
			current: 'home',
			notices,
			body: `<h1>Run <code>${esc(r.run.runId)}</code>${runBadges(r)}</h1>
<dl class="meta">
<dt>Started / finished (UTC)</dt><dd>${esc(r.run.started)} / ${esc(r.run.finished)}</dd>
<dt>Contract / schema</dt><dd>v${esc(r.run.contractVersion)} / ${esc(r.run.schemaVersion)}</dd>
<dt>Browsers</dt><dd>${esc(Object.entries(r.run.browserVersions ?? {}).map(([k, v]) => `${k} ${v}`).join(', '))}; Playwright ${esc(r.run.playwright)}</dd>
<dt>Profiles</dt><dd>${r.run.config.profiles.map((p) => `<code>${esc(p.name)}</code> (network ${esc(p.network.name)}, CPU ${esc(p.cpu.name)})`).join('; ')}</dd>
<dt>Visits per cell</dt><dd>${r.run.config.visits} (warmup ${r.run.config.warmup ?? 0}, excluded); order: ${esc(r.run.config.order)}</dd>
<dt>Correctness pass</dt><dd>${typeof r.run.correctness === 'object' ? `${r.run.correctness.passed} passed, ${r.run.correctness.failed} failed` : esc(r.run.correctness)}</dd>
<dt>Schema validation</dt><dd>${r.run.validation?.checked ?? '?'} checked, ${r.run.validation?.invalid ?? '?'} invalid</dd>
<dt>Raw data</dt><dd>${r.downloads.map((f) => `<a href="${f}">${f}</a>`).join(' · ')}</dd>
</dl>
${lowN ? '<p class="warning" role="note">Some cells have fewer than 30 successful visits, the exploratory minimum in the sampling rules. Treat their medians and especially their p95 as rough.</p>' : ''}
<h2 id="targets">Targets and build identities</h2>
${table(['Entrant', 'Variant', 'URL', 'Host / transport', 'Build ID', 'Source revision', 'Navigation', 'Installed versions'], targetRows)}
<h2 id="cases">Cases</h2>
<ul class="toc">${caseIds.map((id) => `<li><a href="cases/${esc(id)}.html">${esc(id)}</a></li>`).join('')}</ul>
${entrantFilter(r, targetIds)}
${table(['Case', 'Entrant', 'Browser', 'Profile', 'Phase', 'OK / visits', 'Input lost', 'Other failures', 'Input-to-response median (ms, estimate)', 'Nav-to-response median (ms)'], caseOverviewRows, { caption: 'Every cell with its failure counts. Input lost: the page received the input but never showed the asserted response. Latencies are medians over successful visits only.', cls: 'filterable' })}
<h2 id="bytes">Bytes and requests</h2>
<p>Medians over successful visits. Bytes count responses whose request started before the correct response appeared. ${esc(r.run.labels?.bytes ?? '')}</p>
${table(['Case', 'Entrant', 'Browser', 'Profile', 'Phase', 'JS KB (compressed)', 'JS KB (decoded)', 'HTML KB (compressed)', 'CSS KB (compressed)', 'Requests before input', 'Requests after input', 'Document requests after input', 'n'], bytesRows, { cls: 'filterable' })}`,
		}),
	);

	// case pages
	for (const caseId of caseIds) {
		const desc = caseRows.get(caseId);
		const cells = r.cells.filter((c) => c.caseId === caseId);
		const isSettings = caseId.startsWith('settings-submit');
		const isNav = caseId.startsWith('nav-') || caseId === 'history-back';
		const sections = groups(cells).map(([key, gcells]) => {
			const [browser, profile, phase] = key.split('|');
			gcells.sort((a, b) => a.entrant.localeCompare(b.entrant) || (a.variant === 'default' ? -1 : b.variant === 'default' ? 1 : a.variant.localeCompare(b.variant)));
			const sid = slug(`${browser}-${profile}-${phase}`);
			const rowsFor = (metric) =>
				gcells.map((c) => ({ target: c.target, label: entrantLabel(r, c.entrant, c.variant), short: r.sample ? 'Selftest fixture (SAMPLE)' : entrantLabel(r, c.entrant, c.variant), d: c.metrics[metric], failed: c.visits - c.successes }));
			const charts = [distributionChart({ title: `Input to response (presentation estimate), ${caseId}, ${browser}, ${profile}, ${phase}`, rows: rowsFor('inputToResponseMs') })];
			if (phase === 'early' && gcells.some((c) => c.metrics.navToResponseMs.n)) charts.push(distributionChart({ title: `Navigation start to response (presentation estimate), ${caseId}, ${browser}, ${profile}, ${phase}`, rows: rowsFor('navToResponseMs') }));
			const timingRows = gcells.map((c) => {
				const m = c.metrics;
				const extra = isSettings ? `<td>${fmtMs(m.pendingMs.median)}</td><td>${fmtMs(m.serverMs.median)}</td>` : '';
				return `<tr data-entrant="${esc(c.target)}"><th scope="row">${esc(entrantLabel(r, c.entrant, c.variant))}${isNav ? `<br><span class="muted">${esc(navLabel(r, c.entrant))}</span>` : ''}</th><td>${c.successes}/${c.visits}</td><td>${inputLostText(c)}</td><td>${failureText(c)}${c.failureMessages.length ? `<details><summary>messages</summary><ul>${c.failureMessages.map((f) => `<li>${esc(f)}</li>`).join('')}</ul></details>` : ''}</td><td>${fmtMs(m.inputToResponseMs.median)}</td><td>${fmtMs(m.inputToResponseMs.p95)}</td><td>${fmtMs(m.inputToResponseMs.iqr)}</td><td>${fmtMs(m.inputToResponseMs.stddev)}</td><td>${fmtMs(m.inputToDomMs.median)}</td><td>${fmtMs(m.navToResponseMs.median)}</td><td>${fmtMs(m.navToResponseMs.p95)}</td><td>${fmtMs(m.eventDurationMs.median)}</td>${extra}<td><code>${esc(c.buildIds.join(', '))}</code></td></tr>`;
			});
			const bytes = gcells.map(
				(c) =>
					`<tr data-entrant="${esc(c.target)}"><th scope="row">${esc(entrantLabel(r, c.entrant, c.variant))}</th><td>${fmtKb(c.metrics.compressedJs.median)}</td><td>${fmtKb(c.metrics.decodedJs.median)}</td><td>${fmtKb(c.metrics.htmlCompressed.median)}</td><td>${fmtKb(c.metrics.compressedCss.median)}</td><td>${fmtInt(c.metrics.initialRequests.median)}</td><td>${fmtInt(c.metrics.perActionRequests.median)}</td><td>${fmtInt(c.metrics.perActionDocument.median)}</td></tr>`,
			);
			return `<section aria-labelledby="${sid}"><h2 id="${sid}">${esc(browser)} ${esc(gcells[0].browserVersion)} · profile ${esc(profile)} · ${esc(PHASE_TEXT[phase] ?? phase)}</h2>
${charts.join('\n')}
${table(
	['Entrant', 'OK / visits', 'Input lost', 'Other failures', 'Input→response median', 'p95', 'IQR', 'Std dev', 'Input→DOM median', 'Nav→response median', 'Nav→response p95', 'Event duration median', ...(isSettings ? ['Pending UI median', 'Server median'] : []), 'Build ID'],
	timingRows,
	{ caption: 'Milliseconds. Input→response and Nav→response are presentation estimates (two animation frames after the correct DOM); Input→DOM is the DOM diagnostic; Event duration is Chromium Event Timing (– below 16 ms or unsupported).', cls: 'filterable' },
)}
${table(['Entrant', 'JS KB compressed', 'JS KB decoded', 'HTML KB compressed', 'CSS KB compressed', 'Requests before input', 'Requests after input', 'Document requests after input'], bytes, { caption: 'Bytes and requests (medians of successful visits).', cls: 'filterable' })}
</section>`;
		});
		write(
			`${base}/cases/${caseId}.html`,
			page({
				depth: 3,
				title: `${caseId} · run ${r.run.runId}`,
				current: 'home',
				notices,
				body: `<p class="crumbs"><a href="../../../index.html">Results</a> › <a href="../index.html">Run ${esc(r.run.runId)}</a> › ${esc(caseId)}</p>
<h1>Case <code>${esc(caseId)}</code></h1>
${desc ? `<dl class="meta"><dt>Route</dt><dd>${inlineMd(desc.route)}</dd><dt>Phases</dt><dd>${inlineMd(desc.phases)}</dd><dt>Untimed setup</dt><dd>${inlineMd(desc.pre)}</dd><dt>Measured input</dt><dd>${inlineMd(desc.input)}</dd><dt>Correct response</dt><dd>${inlineMd(desc.assertion)}</dd></dl><p class="muted">From <a href="../../../protocol.html#cases">CONTRACT.md section 10</a>.</p>` : ''}
${isNav ? '<p class="warning" role="note">Navigation cases: entrants without a client router perform a full document load; that is labeled beside each row and is not comparable as client-navigation latency.</p>' : ''}
${entrantFilter(r, targetIds)}
${sections.join('\n')}`,
			}),
		);
	}
}

// ---------- write ----------

fs.rmSync(opts.out, { recursive: true, force: true });
for (const [rel, html] of pages) {
	const file = path.join(opts.out, rel);
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, html);
}
for (const f of ['styles.css', 'app.js']) fs.copyFileSync(path.join(siteDir, 'src', f), path.join(opts.out, f));
for (const r of runs) for (const f of r.downloads) fs.copyFileSync(path.join(r.dir, f), path.join(opts.out, 'runs', r.id, f));
console.log(`[site] wrote ${pages.size} pages for ${runs.length} run(s) to ${path.relative(process.cwd(), opts.out) || opts.out}`);
