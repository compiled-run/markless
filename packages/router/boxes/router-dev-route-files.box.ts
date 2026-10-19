import { box } from '@async/witness';

const FIXTURE = 'fixtures/router-full-stack';
const HOME = `${FIXTURE}/pages/index.tsrx`;
const FRESH = `${FIXTURE}/pages/fresh.tsrx`;
const RENAMED = `${FIXTURE}/pages/renamed.tsrx`;
const ENDPOINT = `${FIXTURE}/api/fresh.ts`;
const COUNTER = 'button';
const FRESH_LINK = 'a[href="/fresh"]';
const WAIT = { timeoutMs: 20_000 };

const page = (name: string, marker: string) =>
	`export default function ${name}() @{\n\t<main><h1 ${marker}>${name} ready</h1></main>\n}\n`;

export default box(
	{
		name: 'router dev: adding, renaming and removing a page or an endpoint updates routing without a restart',
		tags: ['router', 'dev', 'browser', 'routes', 'hmr', 'api'],
		modes: ['dev'],
	},
	async ({ pipeline, project, browser, environment, expect, receipt }) => {
		await pipeline.dev({
			config: (config) => ({
				...config,
				root: `${config.root}/${FIXTURE}`,
				configFile: `${config.root}/${FIXTURE}/vite.config.ts`,
			}),
		});

		const home = await browser.visit('/');
		await expect.page.text(home, COUNTER, 'Count 0', WAIT);
		await expect.response.matches(await environment.client.fetch('/fresh'), { status: 404 });

		await home.click(COUNTER, WAIT);
		await expect.page.text(home, COUNTER, 'Count 1', WAIT);
		await project.edit.create(FRESH, page('Fresh', 'data-fresh'));
		// A new page changes the route table every open page navigates with, so each one reloads.
		await expect.page.text(home, COUNTER, 'Count 0', WAIT);
		const direct = await browser.visit('/fresh');
		await expect.page.text(direct, '[data-fresh]', 'Fresh ready', WAIT);

		await project.edit(HOME, (code) =>
			code
				.replace(
					"import { state } from '@markless/core';",
					"import { state } from '@markless/core';\nimport { Link } from '@markless/core/router';",
				)
				.replace('\t</main>', '\t\t<Link href="/fresh">Fresh</Link>\n\t</main>'),
		);
		await expect.page.text(home, FRESH_LINK, 'Fresh', WAIT);
		const documentsBefore = await documentRequests(home);
		await home.click(FRESH_LINK, WAIT);
		await expect.page.text(home, '[data-fresh]', 'Fresh ready', WAIT);
		const documentsAfter = await documentRequests(home);
		if (documentsAfter !== documentsBefore) {
			throw new Error(
				`Expected the link to the new page to navigate in place, saw ${documentsAfter - documentsBefore} document request(s)`,
			);
		}

		await project.edit.remove(FRESH);
		await project.edit.create(RENAMED, page('Renamed', 'data-renamed'));
		const renamed = await browser.visit('/renamed');
		await expect.page.text(renamed, '[data-renamed]', 'Renamed ready', WAIT);
		await expect.response.matches(await environment.client.fetch('/fresh'), { status: 404 });

		await project.edit.remove(RENAMED);
		await expect.page.bodyText(renamed, { notContains: 'Renamed ready' }, WAIT);
		await expect.response.matches(await environment.client.fetch('/renamed'), { status: 404 });

		// Nitro scans endpoint files on its own watcher, so the box waits for the route to answer.
		await project.edit.create(
			ENDPOINT,
			"export default function fresh() {\n\treturn { fresh: 'ready' };\n}\n",
		);
		await routeAnswers(environment, '/api/fresh', 200);
		await expect.response.matches(await environment.client.fetch('/api/fresh'), {
			status: 200,
			contains: '"fresh":"ready"',
		});
		await project.edit.remove(ENDPOINT);
		await routeAnswers(environment, '/api/fresh', 404);
		await expect.page.outcome(home, { consoleErrors: 0 }, WAIT);
		await receipt.capture(
			'after the added page was renamed, removed, and an endpoint came and went',
		);
	},
);

async function documentRequests(page: { networkRequests(): Promise<{ resourceType?: string }[]> }) {
	return (await page.networkRequests()).filter((request) => request.resourceType === 'Document')
		.length;
}

async function routeAnswers(
	environment: { client: { fetch(path: string): Promise<{ status: number }> } },
	path: string,
	status: number,
) {
	const deadline = Date.now() + WAIT.timeoutMs;
	let last = 0;
	while (Date.now() < deadline) {
		last = (await environment.client.fetch(path)).status;
		if (last === status) return;
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
	throw new Error(`Expected ${path} to answer ${status}, last answer was ${last}`);
}
