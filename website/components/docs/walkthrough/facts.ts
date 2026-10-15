// What the Walkthrough prints; walkthrough.test.ts pins every list here to packages/cli.

/** The starter's package.json scripts, in file order. */
export const SCRIPTS = [
	{ name: 'dev', does: 'Starts the dev server at localhost:3000.' },
	{ name: 'build', does: 'Makes the production build.' },
	{ name: 'preview', does: 'Serves the production build, so you click the real thing.' },
	{ name: 'check', does: 'Runs the format and lint checks.' },
	{ name: 'doctor', does: 'Checks your setup, then runs a production build.' },
	{ name: 'fmt', does: 'Formats your files.' },
	{ name: 'test', does: 'Runs your tests with Vitest.' },
] as const;

/** Files every starter gets, before its own. */
export const COMMON_FILES = ['package.json', 'vite.config.ts', 'tsconfig.json', 'README.md', '.gitignore', 'scripts/markless-doctor.mjs', 'public/', '.vscode/', '.zed/'] as const;

/** The four starters as the menu shows them, and the files each writes on top of the common ones. The first file is the page you edit. */
export const STARTERS = [
	{ key: 0, id: 'minimal', label: 'Learn Markless', note: 'One counter page. The default.', files: ['pages/index.tsrx', 'document.tsrx'] },
	{ key: 1, id: 'app', label: 'Build an app', note: 'The counter page, plus 404 and 500 pages.', files: ['pages/index.tsrx', 'document.tsrx', 'pages/404.tsrx', 'pages/500.tsrx'] },
	{
		key: 2,
		id: 'full-stack',
		label: 'Full-stack app',
		note: 'Build an app, plus an api/ and a middleware/ file.',
		files: ['pages/index.tsrx', 'document.tsrx', 'pages/404.tsrx', 'pages/500.tsrx', 'api/health.ts', 'middleware/request.ts'],
	},
	{
		key: 3,
		id: 'docs',
		label: 'Write docs',
		note: 'A docs site written in MDX, with a layout and a sidebar.',
		files: ['pages/index.mdx', 'document.tsrx', 'pages/docs/index.mdx', 'pages/docs/[...slug].mdx', 'components/layouts/DocsLayout.tsrx', 'components/docs/Sidebar.tsrx'],
	},
] as const;

export type StarterId = (typeof STARTERS)[number]['id'];

export const commandFor = (starter: string) => 'npm create markless@latest my-app -- --yes --starter ' + starter;
