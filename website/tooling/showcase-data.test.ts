import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildShowcase, routeCoverage, showcaseSourcesPresent } from './showcase-data.ts';
import { showcaseApps } from '../components/docs/showcase/apps.data.ts';
import { showcaseSketches } from './showcase-sketch.ts';

const website = resolve(import.meta.dirname, '..');
const source = resolve(
	process.env.MARKLESS_MIGRATE_DIR ?? resolve(website, '../../markless-migrate'),
);
const present = showcaseSourcesPresent(source);

describe('migrate showcase data', () => {
	// The markless-migrate checkout lives beside this repo on the machines that regenerate it; CI has no copy.
	it.skipIf(!present)(
		'matches what scripts/showcase-data.ts builds from the markless-migrate checkout',
		() => {
			expect(showcaseApps).toEqual(buildShowcase(source));
		},
	);

	it('has the card sketches committed exactly as scripts/showcase-sketch.ts draws them', () => {
		const dir = resolve(website, 'public/showcase/sketch');
		const files = showcaseSketches(showcaseApps);
		expect(readdirSync(dir).sort()).toEqual([...files.keys()].sort());
		for (const [name, text] of files) expect(readFileSync(resolve(dir, name), 'utf8'), name).toBe(text);
	});

	it('has a screenshot and a unique slug for every app', () => {
		const slugs = showcaseApps.map((app) => app.slug);
		expect(new Set(slugs).size).toBe(slugs.length);
		for (const app of showcaseApps)
			expect(existsSync(resolve(website, 'public', app.shot.slice(1))), app.shot).toBe(true);
	});

	it('labels an app done only when every route is ported, every check is green and every page is switched', () => {
		for (const app of showcaseApps) {
			const pages = app.routes.filter((route) => route.kind === 'page');
			const switched = pages.every((route) => route.switched && route.forcedReason === null);
			const ported =
				app.coverage !== null &&
				app.coverage.ported === app.coverage.total &&
				!app.coverage.partial &&
				!app.coverage.signedOutOnly;
			const green = app.checks.every((check) => check.failed === 0) && app.red.length === 0;
			expect(app.status, app.slug).toBe(switched && ported && green ? 'done' : 'in-progress');
		}
	});

	it('keeps an app with sign-in in progress while only its signed-out routes were counted', () => {
		for (const app of showcaseApps.filter((one) => one.signIn))
			expect(app.coverage?.signedOutOnly ?? true, app.slug).toBe(true);
	});
});

const report = (extra: object) => ({ startedAt: '2026-10-18T00:00:00Z', routes: [], ...extra });

describe('showcase route coverage', () => {
	const override = { measuredAt: '2026-10-18', apps: { docs: { ported: 10, total: 491 } } };

	it('reads coverage from the report when it has it, ahead of the override', () => {
		const coverage = routeCoverage(
			'docs',
			report({
				coverage: { total: 5, present: 3, missing: ['/a', '/b'], unreachable: [] },
			}),
			override,
		);
		expect(coverage).toEqual({
			ported: 3,
			total: 5,
			missing: ['/a', '/b'],
			partial: false,
			signedOutOnly: false,
			measuredAt: '2026-10-18T00:00:00Z',
		});
	});

	it('marks a partial run or an unanswered route as partial', () => {
		const limited = report({
			partial: { checked: 2, total: 9 },
			coverage: { total: 2, present: 2, missing: [], unreachable: [] },
		});
		const dropped = report({
			coverage: { total: 2, present: 1, missing: [], unreachable: ['/x (NEW)'] },
		});
		expect(routeCoverage('docs', limited, override)?.partial).toBe(true);
		expect(routeCoverage('docs', dropped, override)?.partial).toBe(true);
	});

	it('counts only signed-out routes on an app with sign-in', () => {
		const signedIn = report({
			roles: ['anonymous', 'signed-in'],
			coverage: { total: 4, present: 4, missing: [], unreachable: [] },
		});
		expect(routeCoverage('docs', signedIn, override)?.signedOutOnly).toBe(true);
	});

	it('falls back to the dated override, and to null when neither has it', () => {
		expect(routeCoverage('docs', report({}), override)).toEqual({
			ported: 10,
			total: 491,
			missing: [],
			partial: false,
			signedOutOnly: false,
			measuredAt: '2026-10-18',
		});
		expect(routeCoverage('other', report({}), override)).toBeNull();
	});
});
