import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
export const GUARD_DIR = join(ROOT_DIR, 'scripts/benchmarks/perf-guards');
export const ANCHORS_PATH = join(GUARD_DIR, 'anchors.json');
export const BENCH_APP_DIR = join(ROOT_DIR, 'demos/interaction-benchmark/apps/markless');
export const WEBSITE_DIR = join(ROOT_DIR, 'website');
export const RUNNER_DIR = join(ROOT_DIR, 'demos/interaction-benchmark/runner');

const [benchPort, docsPort] = (process.env.MARKLESS_PERF_GUARD_PORTS ?? '4221,4222')
	.split(',')
	.map(Number);
export const PORTS = { bench: benchPort, docs: docsPort };

// Constrained-profile cost model fitted by the interaction-benchmark granularity sweep.
export const COST_MODEL = {
	msPerSerialRound: 162,
	msPerGzipKB: 2,
};

// App size is never gated. Framework overhead is: per runtime module (rendered bytes before
// minification, independent of what shares its chunk) and per compiled construct.
export const BUDGETS = {
	runtimeModuleGrowthBytes: 128,
	constructGlueGrowthBytes: 24,
	executionGrowth: 0.25,
	executionMinChars: 2048,
	initializerMinExtra: 2,
};

export const SITES = {
	bench: {
		label: 'interaction benchmark app',
		base: '/',
		routes: ['/', '/records', '/settings'],
	},
	docs: {
		label: 'docs site',
		base: '/markless/',
		routes: ['/markless/', '/markless/concepts/state', '/markless/ui/accordion'],
	},
};

export const BENCH_ROUTE_SOURCES = {
	'/': 'pages/index.tsrx',
	'/records': 'pages/records.tsrx',
	'/settings': 'pages/settings.tsrx',
};

// First-use actions measured for execution cost: runner contract case ids (runner/cases.mjs).
export const EXECUTION_ACTIONS = {
	counter: 'overview-counter-first',
	toggle: 'overview-toggle',
	tab: 'overview-tab',
	search: 'records-search',
	dialog: 'records-dialog-open',
	settings: 'settings-derived',
};

// Same-task dispatch: `start` boots the full runtime, then each follower is probed on the same page.
// A follower's `before` steps run unprobed; `until` names the DOM change that must land in the input's task.
const tid = (id) => ({ selector: `[data-testid="${id}"]` });
const shown = (id, suffix = '') => ({ selector: `[data-testid="${id}"]${suffix}`, present: true });
export const SAME_TASK_PROBES = [
	{
		route: '/',
		start: [{ click: tid('toggle-button') }],
		followers: [
			{ name: 'toggle again', event: 'click', step: { click: tid('toggle-button') } },
			{ name: 'counter', event: 'click', step: { click: tid('counter-increment') } },
			{ name: 'stepper', event: 'click', step: { click: tid('stepper-increment') } },
			{ name: 'tab', event: 'click', step: { click: tid('tab-activity') } },
			{
				name: 'filter empty state first shown',
				event: 'input',
				before: [{ focus: tid('filter-input') }],
				step: { insertText: 'zzz' },
				until: shown('filter-empty'),
			},
		],
	},
	{
		route: '/records',
		start: [{ click: tid('sort-score') }],
		followers: [
			{ name: 'sort name', event: 'click', step: { click: tid('sort-name') } },
			{ name: 'row select', event: 'change', step: { click: tid('record-select') } },
			{
				name: 'dialog first open',
				event: 'click',
				step: { click: tid('record-edit') },
				until: shown('edit-dialog', '[open]'),
			},
			{
				name: 'records @empty first shown',
				event: 'input',
				before: [{ click: tid('edit-cancel') }, { focus: tid('records-search') }],
				step: { insertText: 'zzzz' },
				until: shown('records-empty'),
			},
		],
	},
	{
		route: '/settings',
		start: [{ click: tid('settings-quantity') }, { insertText: '1' }],
		followers: [{ name: 'quantity input', event: 'input', step: { insertText: '2' } }],
	},
	{
		route: '/settings',
		start: [{ focus: tid('settings-name') }],
		followers: [
			{
				name: 'total first refreshed',
				event: 'input',
				before: [{ focus: tid('settings-unit-price') }],
				step: { insertText: '1' },
				until: { textChanges: '[data-testid="settings-total"]' },
			},
		],
	},
];

// Client navigations checked for a single fetch round: hover (intent) then click the link.
export const NAVIGATIONS = [
	{ from: '/', to: '/records', link: 'nav-records' },
	{ from: '/', to: '/settings', link: 'nav-settings' },
	{ from: '/records', to: '/', link: 'nav-overview' },
];

export const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;
export const msForGzipBytes = (bytes) => (bytes / 1024) * COST_MODEL.msPerGzipKB;
