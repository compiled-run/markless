// What the Walkthrough prints; walkthrough.test.ts pins every list here to packages/cli.

/** The scripts the Walkthrough runs: start it, then build and check the build. */
export const SHOWN_SCRIPTS = ['dev', 'build', 'preview'] as const;

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

/** The package managers create-markless knows, in the order the tabs show them. */
export const MANAGERS = [
	{ id: 'npm', label: 'npm' },
	{ id: 'pnpm', label: 'pnpm' },
	{ id: 'yarn', label: 'yarn' },
	{ id: 'bun', label: 'Bun' },
] as const;

export type ManagerId = (typeof MANAGERS)[number]['id'];

const CREATE: Record<ManagerId, string> = {
	npm: 'npm create markless@latest',
	pnpm: 'pnpm create markless',
	yarn: 'yarn create markless',
	bun: 'bun create markless',
};

/** npm needs `--` before flags meant for create-markless; the others pass them through. */
export const createCommand = (manager: ManagerId, target?: string, flags?: string) =>
	[CREATE[manager], target, flags && (manager === 'npm' ? '-- ' + flags : flags)].filter(Boolean).join(' ');

/** The same words the CLI prints for `dev` in its next steps. */
export const scriptCommand = (manager: ManagerId, script: string) => manager + ' run ' + script;


/** The folder name create-markless offers by default. */
export const DEFAULT_APP = 'my-markless-app';
