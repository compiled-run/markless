// Builds the "Apps already moved" showcase data from a markless-migrate checkout: the published check
// reports, the switched-route lists, the front doors' rewrites and the migration logs. Every number comes
// from those files; every typed label carries an `evidence` string that must appear in the app's log.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type {
	BeforeAfter,
	BytesRange,
	ShowcaseAccepted,
	ShowcaseApp,
	ShowcaseGap,
	ShowcaseRoute,
	ShowcaseRow,
} from '../components/docs/showcase/types.ts';

type Fact = { readonly text: string; readonly evidence: string };

type AppSource = {
	readonly slug: string;
	readonly name: string;
	readonly example: string;
	readonly deploy: string;
	readonly log: string;
	readonly builtWith: Fact;
	readonly originalRepo: Fact | null;
	/** A licence file in the checkout, or a fact from the log when the port had no source. */
	readonly licence: { readonly file: string } | Fact | null;
	/** Read the downloaded column from the log's weight table instead of the report. */
	readonly downloadedFromLog?: boolean;
	readonly downloadedNote?: Fact;
	readonly gaps?: (log: string) => ShowcaseGap[];
};

export const portBase = 'https://github.com/thejackshelton/markless-migrate/tree/main/examples/';

const apps: readonly AppSource[] = [
	{
		slug: 'next-dashboard',
		name: 'Next.js dashboard',
		example: 'next-dashboard-markless',
		deploy: 'next-dashboard',
		log: 'next-dashboard-LOG.md',
		builtWith: { text: 'Next.js 16', evidence: 'Next 16.0.10' },
		originalRepo: {
			text: 'https://github.com/vercel/next-learn',
			evidence: '`vercel/next-learn`',
		},
		licence: null,
	},
	{
		slug: 'remix-notes',
		name: 'Remix notes',
		example: 'remix-notes-markless',
		deploy: 'remix-notes',
		log: 'remix-notes-LOG.md',
		builtWith: { text: 'Remix 2', evidence: 'Remix 2.17' },
		originalRepo: {
			text: 'https://github.com/remix-run/indie-stack',
			evidence: '`remix-run/indie-stack`',
		},
		licence: { file: 'deploy/remix-notes/old-app/LICENSE.md' },
	},
	{
		slug: 'conduit',
		name: 'Conduit',
		example: 'realworld-markless',
		deploy: 'realworld',
		log: 'realworld-markless-LOG.md',
		builtWith: { text: 'Angular 21', evidence: 'Angular 21' },
		originalRepo: {
			text: 'https://github.com/realworld-apps/angular-realworld-example-app',
			evidence: '(https://github.com/realworld-apps/angular-realworld-example-app)',
		},
		licence: { file: 'examples/realworld-markless/LICENSE-angular-realworld' },
	},
	{
		slug: 'docusaurus',
		name: 'Docusaurus',
		example: 'docusaurus-markless',
		deploy: 'docusaurus',
		log: 'docusaurus-markless-LOG.md',
		builtWith: { text: 'Docusaurus (React)', evidence: "Docusaurus's React theme" },
		originalRepo: {
			text: 'https://github.com/facebook/docusaurus',
			evidence: '(https://github.com/facebook/docusaurus)',
		},
		licence: { file: 'examples/docusaurus-markless/LICENSE-docusaurus' },
	},
	{
		slug: 'htmx-org',
		name: 'htmx.org',
		example: 'htmx-org-markless',
		deploy: 'htmx-org',
		log: 'htmx-org-LOG.md',
		builtWith: { text: 'htmx and hyperscript', evidence: 'no htmx or hyperscript on the page' },
		originalRepo: null,
		licence: { text: 'Zero-Clause BSD', evidence: 'Zero-Clause BSD license' },
		downloadedFromLog: true,
	},
	{
		slug: 'alpinejs-dev',
		name: 'alpinejs.dev',
		example: 'alpinejs-dev-markless',
		deploy: 'alpinejs-dev',
		log: 'alpinejs-dev-LOG.md',
		builtWith: { text: 'Alpine.js', evidence: 'no Alpine on the page' },
		originalRepo: null,
		licence: { text: 'MIT', evidence: 'Caleb Porzio and contributors, MIT license' },
		downloadedFromLog: true,
	},
	{
		slug: 'vite-dev',
		name: 'vite.dev homepage',
		example: 'vite-dev-markless',
		deploy: 'vite-dev',
		log: 'VITE-DEV-LOG.md',
		builtWith: {
			text: 'VitePress (Vue)',
			evidence: 'VitePress with the `@voidzero-dev/vitepress-theme`',
		},
		originalRepo: {
			text: 'https://github.com/vitejs/vite',
			evidence: 'https://github.com/vitejs/vite',
		},
		licence: null,
		downloadedNote: {
			text: 'The old page was sent gzip-compressed, the Markless page Brotli-compressed.',
			evidence: '(old gzip, new Brotli)',
		},
		gaps: viteGaps,
	},
	{
		slug: 'shadcn-admin',
		name: 'shadcn-admin',
		example: 'shadcn-admin-markless',
		deploy: 'shadcn-admin',
		log: 'shadcn-admin-LOG.md',
		builtWith: { text: 'Vite and React', evidence: 'shadcn-admin (Vite + React)' },
		originalRepo: {
			text: 'https://github.com/satnaing/shadcn-admin',
			evidence: '(https://github.com/satnaing/shadcn-admin)',
		},
		licence: { file: 'deploy/shadcn-admin/old/LICENSE' },
		gaps: shadcnGaps,
	},
];

type ReportFailure = {
	readonly dimension: string;
	readonly check: string;
	readonly actual?: string;
	readonly accepted?: { readonly reason: string; readonly by: string };
};
type ReportRoute = {
	readonly route: string;
	readonly role?: string;
	readonly ok: boolean;
	readonly dimensions: Readonly<Record<string, 'pass' | 'fail' | 'skipped'>>;
	readonly failures?: readonly ReportFailure[];
	readonly weight?: {
		readonly old: { readonly downloaded: number; readonly executed: number };
		readonly new: { readonly downloaded: number; readonly executed: number };
	};
};
type Report = {
	readonly startedAt: string;
	readonly routes: readonly ReportRoute[];
	readonly roles?: readonly string[];
};
type Switched = {
	readonly routes: readonly {
		readonly route: string;
		readonly forced?: { readonly reason: string };
	}[];
};

const sentenceCase = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const plain = (text: string) =>
	text.replace(/`/g, '').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();

function checkedFact(fact: Fact, log: string, what: string): string {
	if (!log.includes(fact.evidence))
		throw new Error(
			`showcase: ${what} evidence ${JSON.stringify(fact.evidence)} is not in the log`,
		);
	return fact.text;
}

function section(log: string, heading: RegExp): string {
	const lines = log.split('\n');
	const start = lines.findIndex((line) => heading.test(line));
	if (start < 0) throw new Error(`showcase: no section matching ${heading} in the log`);
	const end = lines.findIndex((line, at) => at > start && line.startsWith('## '));
	return lines.slice(start + 1, end < 0 ? undefined : end).join('\n');
}

function tableRows(text: string): string[][] {
	return text
		.split('\n')
		.filter((line) => line.startsWith('|') && !/^\|\s*---/.test(line))
		.map((line) =>
			line
				.slice(1, line.endsWith('|') ? -1 : undefined)
				.split(' | ')
				.map((cell) => cell.trim()),
		);
}

function deployedLinks(log: string): { front: string; old: string | null; markless: string } {
	const rows = tableRows(section(log, /^## Deployed/));
	const url = (row: string[] | undefined) => row?.[1]?.match(/https:\/\/[^\s,|]+/)?.[0] ?? null;
	const front = url(rows.find((row) => row[0].startsWith('Front door')));
	const old = url(rows.find((row) => /^Old (app|site)/.test(row[0])));
	const markless = url(
		rows.find((row) => /^(New app|Markless app|The Markless app alone)/.test(row[0])),
	);
	if (!front || !markless)
		throw new Error('showcase: the Deployed table names no front door or Markless app');
	return { front, old, markless };
}

const range = (values: readonly number[]): BytesRange => ({
	min: Math.min(...values),
	max: Math.max(...values),
});

function patternTest(pattern: string): RegExp {
	const body = pattern
		.split('/')
		.map((part) =>
			part.startsWith(':')
				? '[^/]+'
				: part.startsWith('*')
					? '.*'
					: part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'),
		)
		.join('/');
	return new RegExp(`^${body}$`);
}

function logWeights(log: string): Map<string, { before: number; after: number }> {
	const rows = tableRows(section(log, /^## Weight/));
	const kB = (text: string) => Math.round(Number.parseFloat(text.replace(/,/g, '')) * 1000);
	const found = new Map<string, { before: number; after: number }>();
	for (const row of rows.slice(1)) {
		const route = row[0].replace(/`/g, '');
		const pair = row[1]?.match(/([\d.,]+) kB -> ([\d.,]+) kB/);
		if (pair) found.set(route, { before: kB(pair[1]), after: kB(pair[2]) });
	}
	return found;
}

function logWeightBasis(log: string): string {
	const header = tableRows(section(log, /^## Weight/))[0];
	return plain(header[1]).replace(/ -> /, ' to ');
}

function viteGaps(log: string): ShowcaseGap[] {
	const text = section(log, /^## What is left/);
	return [
		...text.matchAll(
			/^\d+\. \*\*(.+?)\*\* \([^)]*\): ([\s\S]*?)(?= Recommend|\n\d+\. |\n\n)/gm,
		),
	].map((match) => ({
		title: plain(match[1]),
		detail: sentenceCase(plain(match[2]).replace(/\s*\(finding \d+\)/g, '')),
	}));
}

const codes = String.raw`[GTU]\d+(?:[/, ]+[GTU]\d+)*`;
const stripCodes = (text: string) =>
	text
		.replace(new RegExp(String.raw`\s*\(${codes}\)`, 'g'), '')
		.replace(new RegExp(String.raw`\b${codes}[:;] `, 'g'), '')
		.replace(new RegExp(String.raw`^${codes} `), '')
		.replace(/\s+/g, ' ')
		.trim();

function shadcnGaps(log: string): ShowcaseGap[] {
	const gaps = new Map<string, ShowcaseGap>();
	for (const row of tableRows(section(log, /^## Proposed acceptances/)).slice(1)) {
		const title = stripCodes(plain(row[2]));
		const detail = stripCodes(plain(row[3]));
		const sentence = sentenceCase(title);
		if (!gaps.has(sentence) && detail !== 'as above')
			gaps.set(sentence, { title: sentence, detail: sentenceCase(detail) });
	}
	const notPorted = section(log, /^## Results/)
		.split('\n\n')
		.find((paragraph) => paragraph.startsWith('Not ported: '));
	if (!notPorted) throw new Error('showcase: shadcn-admin log has no "Not ported" paragraph');
	gaps.set('Not ported yet', {
		title: 'Not ported yet',
		detail: sentenceCase(stripCodes(plain(notPorted.slice('Not ported: '.length)))),
	});
	return [...gaps.values()];
}

function licenceText(root: string, licence: AppSource['licence'], log: string): string | null {
	if (!licence) return null;
	if ('file' in licence) {
		const first = readFileSync(resolve(root, licence.file), 'utf8').split('\n')[0].trim();
		return first.replace(/ License$/, '');
	}
	return checkedFact(licence, log, 'licence');
}

function unknownPath(root: string): string {
	const source = readFileSync(resolve(root, 'src/check/endpoints.ts'), 'utf8');
	const found = source.match(/export const UNKNOWN_PATH = '([^']+)'/);
	if (!found) throw new Error('showcase: UNKNOWN_PATH is not exported by src/check/endpoints.ts');
	return found[1];
}

function buildApp(root: string, app: AppSource, notFound: string): ShowcaseApp {
	const log = readFileSync(resolve(root, 'examples', app.log), 'utf8');
	const front = resolve(root, 'deploy', app.deploy, 'front');
	const report = JSON.parse(
		readFileSync(resolve(front, 'public/_migrate/report.json'), 'utf8'),
	) as Report;
	if (!existsSync(resolve(front, 'public/_migrate/report.html')))
		throw new Error(`showcase: ${app.slug} publishes no report.html`);
	const switchedFile = resolve(root, 'examples', app.example, '.migrate/switched.json');
	const switched = existsSync(switchedFile)
		? (JSON.parse(readFileSync(switchedFile, 'utf8')) as Switched).routes
		: [];
	const rewrites = (
		JSON.parse(readFileSync(resolve(front, 'vercel.json'), 'utf8')) as {
			rewrites: { source: string; destination: string }[];
		}
	).rewrites;
	const catchAll = rewrites.find((rewrite) => rewrite.source === '/:path*');
	if (!catchAll) throw new Error(`showcase: ${app.slug} front door has no catch-all rewrite`);
	const links = deployedLinks(log);
	const oldOrigin = new URL(catchAll.destination).origin;
	if (links.old && new URL(links.old).origin !== oldOrigin)
		throw new Error(
			`showcase: ${app.slug} log names ${links.old} as the old app, the front door sends to ${oldOrigin}`,
		);

	const roles = report.roles ?? [null];
	const patterns = switched.length
		? switched.map((one) => one.route)
		: [...new Set(report.routes.map((one) => one.route))];
	const tests = patterns.map((pattern) => ({ pattern, test: patternTest(pattern) }));
	const groups = new Map<string, { kind: ShowcaseRoute['kind']; routes: ReportRoute[] }>();
	const groupFor = (route: string): [string, ShowcaseRoute['kind']] => {
		if (route === notFound) return [route, 'not-found'];
		const match = tests.find((one) => one.test.test(route));
		if (match) return [match.pattern, 'page'];
		const bare = route.replace(/\/$/, '');
		const slashed = tests.find((one) => one.test.test(bare));
		if (route.endsWith('/') && slashed) return [slashed.pattern + '/', 'slash-redirect'];
		return [route, 'page'];
	};
	for (const one of report.routes) {
		const [key, kind] = groupFor(one.route);
		const group = groups.get(key) ?? { kind, routes: [] };
		group.routes.push(one);
		groups.set(key, group);
	}

	const fromLog = app.downloadedFromLog ? logWeights(log) : null;
	const row = (role: string | null, routes: ReportRoute[]): ShowcaseRow => {
		const mine = routes.filter((one) => (one.role ?? null) === role);
		const weighed = mine.filter(
			(one) =>
				one.weight &&
				one.weight.old.downloaded +
					one.weight.old.executed +
					one.weight.new.downloaded +
					one.weight.new.executed >
					0,
		);
		const dims = mine.flatMap((one) => Object.entries(one.dimensions));
		const logged = fromLog
			? mine.map((one) => fromLog.get(one.route)).filter((one) => one !== undefined)
			: [];
		const downloaded: BeforeAfter | null = fromLog
			? logged.length
				? {
						before: range(logged.map((one) => one.before)),
						after: range(logged.map((one) => one.after)),
					}
				: null
			: weighed.length
				? {
						before: range(weighed.map((one) => one.weight!.old.downloaded)),
						after: range(weighed.map((one) => one.weight!.new.downloaded)),
					}
				: null;
		return {
			role,
			pages: mine.length,
			green: mine.filter((one) => one.ok).length,
			checksPassed: dims.filter(([, value]) => value === 'pass').length,
			checksTotal: dims.length,
			redChecks: [
				...new Set(dims.filter(([, value]) => value === 'fail').map(([key]) => key)),
			],
			downloaded,
			runAtLoad: weighed.length
				? {
						before: range(weighed.map((one) => one.weight!.old.executed)),
						after: range(weighed.map((one) => one.weight!.new.executed)),
					}
				: null,
		};
	};

	const routes: ShowcaseRoute[] = [...groups].map(([pattern, group]) => {
		const owner = switched.find(
			(one) => one.route === pattern.replace(/\/$/, '') || one.route === pattern,
		);
		const switchedHere = group.kind === 'not-found' ? false : Boolean(owner);
		return {
			pattern,
			kind: group.kind,
			switched: switchedHere,
			forcedReason: owner?.forced?.reason ?? null,
			rows: roles.map((role) => row(role, group.routes)).filter((one) => one.pages > 0),
		};
	});
	const kindOrder = { page: 0, 'slash-redirect': 1, 'not-found': 2 } as const;
	routes.sort((a, b) => kindOrder[a.kind] - kindOrder[b.kind]);

	const accepted = new Map<
		string,
		{ reason: string; by: string; count: number; checks: Set<string>; routes: Set<string> }
	>();
	const red = new Map<string, { route: string; check: string; count: number; example: string }>();
	for (const one of report.routes)
		for (const failure of one.failures ?? []) {
			if (!failure.accepted) {
				const key = `${one.route} ${failure.dimension}`;
				const entry = red.get(key) ?? {
					route: one.route,
					check: failure.dimension,
					count: 0,
					example: `${failure.check}: ${failure.actual ?? ''}`
						.split('\n')[0]
						.slice(0, 160),
				};
				entry.count += 1;
				red.set(key, entry);
				continue;
			}
			const entry = accepted.get(failure.accepted.reason) ?? {
				reason: failure.accepted.reason,
				by: failure.accepted.by,
				count: 0,
				checks: new Set<string>(),
				routes: new Set<string>(),
			};
			entry.count += 1;
			entry.checks.add(failure.dimension);
			entry.routes.add(one.route);
			accepted.set(failure.accepted.reason, entry);
		}

	const checkTotals = new Map<
		string,
		{ name: string; passed: number; failed: number; skipped: number }
	>();
	for (const one of report.routes)
		for (const [name, value] of Object.entries(one.dimensions)) {
			const entry = checkTotals.get(name) ?? { name, passed: 0, failed: 0, skipped: 0 };
			if (value === 'pass') entry.passed += 1;
			else if (value === 'fail') entry.failed += 1;
			else entry.skipped += 1;
			checkTotals.set(name, entry);
		}

	const checkedPages = routes.filter((one) => one.kind === 'page');
	const live = checkedPages.every((one) => one.switched && !one.forcedReason);
	const home = report.routes.find((one) => one.route === '/' && one.weight);
	if (!home?.weight) throw new Error(`showcase: ${app.slug} report has no weighed "/" route`);
	const checkedPatterns = new Set(routes.map((one) => one.pattern));
	const basis = fromLog
		? logWeightBasis(log)
		: 'On the wire during the check, as the servers it compared sent it';

	return {
		slug: app.slug,
		name: app.name,
		builtWith: checkedFact(app.builtWith, log, 'builtWith'),
		access: /from the URL alone/.test(log.split('\n')[0]) ? 'url-only' : 'source',
		signIn: Boolean(report.roles?.length),
		status: live ? 'live' : 'in-progress',
		checkedAt: report.startedAt,
		pagesGreen: report.routes.filter((one) => one.ok).length,
		pagesChecked: report.routes.length,
		routes,
		checks: [...checkTotals.values()],
		switchedWithoutCheck: switched
			.filter((one) => !checkedPatterns.has(one.route) && one.forced)
			.map((one) => ({ route: one.route, reason: one.forced!.reason })),
		accepted: [...accepted.values()].map(
			(entry): ShowcaseAccepted => ({
				reason: entry.reason,
				by: entry.by,
				count: entry.count,
				checks: [...entry.checks],
				routes: [...entry.routes],
			}),
		),
		red: [...red.values()],
		gaps: app.gaps ? app.gaps(log) : [],
		downloadedBasis: app.downloadedNote
			? `${basis}. ${checkedFact(app.downloadedNote, log, 'downloadedNote')}`
			: basis,
		headline: { route: '/', before: home.weight.old.executed, after: home.weight.new.executed },
		links: {
			frontDoor: links.front,
			old: links.old ?? oldOrigin,
			markless: links.markless,
			report: `${links.front}/_migrate/report.html`,
			port: portBase + app.example,
			originalRepo: app.originalRepo
				? checkedFact(app.originalRepo, log, 'originalRepo')
				: null,
			originalSite: links.old ? null : oldOrigin,
			licence: licenceText(root, app.licence, log),
		},
		shot: `/showcase/${app.slug}.webp`,
	};
}

/** Every showcase app, in the order the page shows them, built from a markless-migrate checkout at `root`. */
export function buildShowcase(root: string): ShowcaseApp[] {
	const notFound = unknownPath(root);
	return apps.map((app) => buildApp(root, app, notFound));
}

/** The files `buildShowcase` reads, so a test can tell whether the checkout is on this machine. */
export function showcaseSourcesPresent(root: string): boolean {
	return (
		existsSync(resolve(root, 'src/check/endpoints.ts')) &&
		apps.every((app) =>
			existsSync(resolve(root, 'deploy', app.deploy, 'front/public/_migrate/report.json')),
		)
	);
}

export function renderShowcaseModule(data: readonly ShowcaseApp[]): string {
	return `// Generated by scripts/showcase-data.ts from a markless-migrate checkout. Do not edit by hand.\nimport type { ShowcaseApp } from './types.ts';\n\nexport const showcaseApps: readonly ShowcaseApp[] = ${JSON.stringify(data, null, '\t')};\n`;
}
