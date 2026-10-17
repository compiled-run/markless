import { showcaseApps } from './apps.data.ts';
import type { BytesRange, ShowcaseApp } from './types.ts';

/** Plain words for the check report's dimensions, in the order the report lists them. */
export const checkNames: Readonly<Record<string, string>> = {
	http: 'Status codes and redirects',
	auth: 'Who is let in, and the sign-in cookies',
	rendered: 'Visible text and the accessibility tree',
	visual: 'Screenshots, at every width and hover or focus state',
	seo: 'Title, description and social tags',
	assets: 'Images, fonts and files at the same URLs',
	css: 'Computed styles of every visible element',
	a11y: 'Keyboard paths, focus order and axe',
	i18n: 'Language, text direction, dates and numbers',
	behaviour: 'Clicks, form posts and what changes after them',
	network: 'Every request the page makes',
	data: 'Endpoints that return data, field by field',
	weight: 'JavaScript downloaded and run at load',
};

const kB = (bytes: number) => {
	const value = bytes / 1000;
	return `${value < 10 ? value.toFixed(1) : Math.round(value).toLocaleString('en-US')} kB`;
};

const span = (range: BytesRange) =>
	range.min === range.max
		? kB(range.min)
		: `${kB(range.min).replace(' kB', '')} to ${kB(range.max)}`;

export const beforeAfter = (before: number, after: number) => `${kB(before)} → ${kB(after)}`;

const roleName = (role: string | null) =>
	role === null ? '' : role === 'anonymous' ? 'Signed out' : 'Signed in';

const host = (url: string) => new URL(url).host;

const patternName = (pattern: string, kind: string) =>
	kind === 'not-found' ? 'A page that does not exist' : pattern;

export type Card = {
	readonly slug: string;
	readonly name: string;
	readonly builtWith: string;
	readonly shot: string;
	readonly alt: string;
	readonly inProgress: boolean;
	readonly before: string;
	readonly after: string;
	readonly tone: string;
};

const tones = ['pink', 'yellow', 'purple', 'green'];

export const cards: readonly Card[] = showcaseApps.map((app, at) => ({
	slug: app.slug,
	name: app.name,
	builtWith: app.builtWith,
	shot: app.shot,
	alt: `The ${app.name} home page, served by Markless`,
	inProgress: app.status === 'in-progress',
	before: kB(app.headline.before),
	after: kB(app.headline.after),
	tone: tones[at % tones.length],
}));

export function findApp(slug: string): ShowcaseApp | undefined {
	return showcaseApps.find((app) => app.slug === slug);
}

export type MetricRow = {
	readonly id: string;
	readonly route: string;
	readonly routeClass: string;
	readonly who: string;
	readonly green: string;
	readonly checks: string;
	readonly downloaded: string;
	readonly runAtLoad: string;
	readonly note: string;
};

export type AppView = {
	readonly app: ShowcaseApp;
	readonly hostName: string;
	readonly facts: readonly { readonly id: string; readonly text: string }[];
	readonly headline: string;
	readonly checkedOn: string;
	readonly summary: string;
	readonly links: readonly {
		readonly id: string;
		readonly label: string;
		readonly href: string;
		readonly main: boolean;
	}[];
	readonly rows: readonly MetricRow[];
	readonly redirects: string;
	readonly checks: readonly {
		readonly id: string;
		readonly name: string;
		readonly passed: string;
		readonly mark: string;
	}[];
	readonly accepted: readonly {
		readonly id: string;
		readonly reason: string;
		readonly where: string;
	}[];
	readonly gaps: readonly {
		readonly id: string;
		readonly title: string;
		readonly detail: string;
	}[];
	readonly red: readonly { readonly id: string; readonly route: string; readonly text: string }[];
	readonly extra: readonly {
		readonly id: string;
		readonly route: string;
		readonly reason: string;
	}[];
	readonly status: string;
};

export function appView(app: ShowcaseApp): AppView {
	const pages = app.routes.filter((route) => route.kind !== 'slash-redirect');
	const rows: MetricRow[] = pages.flatMap((route) =>
		route.rows.map((row) => ({
			id: `${route.pattern} ${row.role ?? ''}`,
			route: patternName(route.pattern, route.kind),
			routeClass: route.kind === 'not-found' ? 'route' : 'route path',
			who: roleName(row.role),
			green:
				row.pages > 1
					? `${row.green} of ${row.pages} pages green`
					: row.green
						? ''
						: 'page is red',
			checks: `${row.checksPassed} of ${row.checksTotal}`,
			downloaded: row.downloaded
				? `${span(row.downloaded.before)} → ${span(row.downloaded.after)}`
				: 'no JavaScript',
			runAtLoad: row.runAtLoad
				? `${span(row.runAtLoad.before)} → ${span(row.runAtLoad.after)}`
				: 'no JavaScript',
			note: [
				roleName(row.role),
				route.kind === 'not-found'
					? 'stays on the old app'
					: route.switched
						? route.forcedReason
							? 'switched by hand'
							: ''
						: 'not switched yet',
			]
				.filter(Boolean)
				.join(', '),
		})),
	);
	const slashed = app.routes
		.filter((route) => route.kind === 'slash-redirect')
		.flatMap((route) => route.rows);
	const slashPages = slashed.reduce((sum, row) => sum + row.pages, 0);
	const slashGreen = slashed.reduce((sum, row) => sum + row.green, 0);
	const live = app.status === 'live';
	const switchedCount = app.routes.filter(
		(route) => route.kind === 'page' && route.switched,
	).length;
	const pageCount = app.routes.filter((route) => route.kind === 'page').length;
	return {
		app,
		hostName: host(app.links.frontDoor),
		facts: [
			{ id: 'built', text: `Was built with ${app.builtWith}` },
			{
				id: 'access',
				text:
					app.access === 'url-only'
						? 'Moved from the live URL alone, no source code'
						: 'Moved from its source code',
			},
			{ id: 'sign-in', text: app.signIn ? 'Has sign-in' : 'No sign-in' },
		],
		headline: beforeAfter(app.headline.before, app.headline.after),
		checkedOn: new Date(app.checkedAt).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'long',
			day: 'numeric',
			timeZone: 'UTC',
		}),
		summary: `${app.pagesGreen} of ${app.pagesChecked} page checks green`,
		status: live
			? `Live: ${switchedCount} of ${pageCount} routes switched to Markless.`
			: switchedCount
				? `In progress: ${switchedCount} of ${pageCount} routes switched by hand while some checks are still red.`
				: `In progress: not switched yet, so the front door still serves the old page.`,
		links: [
			{
				id: 'front',
				label: live || switchedCount ? 'Visit migrated site' : 'Visit the front door',
				href: app.links.frontDoor,
				main: true,
			},
			{ id: 'old', label: 'Original', href: app.links.old, main: false },
			{ id: 'markless', label: 'Markless only', href: app.links.markless, main: false },
			{ id: 'report', label: 'Full report', href: app.links.report, main: false },
			{ id: 'port', label: 'Source of the port', href: app.links.port, main: false },
			...(app.links.originalRepo
				? [
						{
							id: 'repo',
							label: 'Original project',
							href: app.links.originalRepo,
							main: false,
						},
					]
				: []),
		],
		rows,
		redirects: slashPages
			? `Plus ${slashPages} addresses with a trailing slash, which redirect: ${slashGreen} of ${slashPages} green.`
			: '',
		checks: app.checks.map((entry) => ({
			id: entry.name,
			name: checkNames[entry.name] ?? entry.name,
			passed: `${entry.passed} of ${entry.passed + entry.failed}${entry.skipped ? `, ${entry.skipped} skipped` : ''}`,
			mark: entry.failed ? 'cross' : 'check',
		})),
		accepted: app.accepted.map((entry, at) => ({
			id: 'a' + at,
			reason: entry.reason,
			where: `${entry.count} ${entry.count === 1 ? 'difference' : 'differences'} on ${entry.routes.length === 1 ? entry.routes[0] : entry.routes.length + ' routes'}`,
		})),
		gaps: app.gaps.map((gap, at) => ({ id: 'g' + at, title: gap.title, detail: gap.detail })),
		red: app.red.map((entry, at) => ({
			id: 'r' + at,
			route: entry.route,
			text: `${checkNames[entry.check] ?? entry.check}: ${entry.count} ${entry.count === 1 ? 'failure' : 'failures'}`,
		})),
		extra: app.switchedWithoutCheck.map((entry, at) => ({
			id: 'x' + at,
			route: entry.route,
			reason: entry.reason,
		})),
	};
}
