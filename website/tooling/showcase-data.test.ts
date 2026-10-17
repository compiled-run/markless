import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildShowcase, showcaseSourcesPresent } from './showcase-data.ts';
import { showcaseApps } from '../components/docs/showcase/apps.data.ts';

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

	it('has a screenshot and a unique slug for every app', () => {
		const slugs = showcaseApps.map((app) => app.slug);
		expect(new Set(slugs).size).toBe(slugs.length);
		for (const app of showcaseApps)
			expect(existsSync(resolve(website, 'public', app.shot.slice(1))), app.shot).toBe(true);
	});

	it('labels an app live only when every checked page is switched without force', () => {
		for (const app of showcaseApps) {
			const pages = app.routes.filter((route) => route.kind === 'page');
			const live = pages.every((route) => route.switched && route.forcedReason === null);
			expect(app.status, app.slug).toBe(live ? 'live' : 'in-progress');
		}
	});
});
