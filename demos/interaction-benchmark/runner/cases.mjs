/**
 * CONTRACT.md section 10 (contract v1) as data. Selectors use data-testid (plus the row's data-id).
 *
 * Case: { route, phases, correctnessOnly?, pre, input, pending?, expect, followUps?, server?, forbidRequest?, holdMs? }
 *   pre:     untimed steps before the measured input (early phase runs them as soon as actionable).
 *   input:   the measured trusted input step.
 *   pending: optional intermediate assertion (settings submit pending UI -> timings.pendingMs).
 *   expect:  the correct visible response; all predicates must hold.
 *   followUps: extra untimed { input, expect } checks after the response (correctness only).
 *   server:  URL substring of the server request whose Resource Timing gives timings.serverMs.
 *   forbidRequest: URL substring that must not be requested between input and response hold.
 *   expectStatus: { [URL substring]: status } responses the case deliberately provokes; the browser's
 *              "Failed to load resource" console error for them is not a page error.
 * Step: { click: target, times? } | { focus: target } | { press: key } | { insertText: text }
 *       | { selectAll: true } | { scrollTo: y } | { goBack: true } | { waitFor: predicate[] }
 * Target: { selector, nth? } (nth: index into matches, negative counts from the end; default 0).
 * Predicate: { target, text?, value?, checked?, disabled?, focused?, attr? (null = absent),
 *              visible? (false = absent or hidden), present? (true = in the DOM, visible or not), count?, texts? } | { pathname } | { scrollY, tolerance }
 */

export const CONTRACT_VERSION = 1;

const tid = (id) => ({ selector: `[data-testid="${id}"]` });
const inRow = (rowId, id) => ({ selector: `[data-testid="record-row"][data-id="${rowId}"] [data-testid="${id}"]` });
const rows = { selector: '[data-testid="record-row"]' };
const firstRow = { ...rows, nth: 0 };
const lastRow = { ...rows, nth: -1 };
const text = (id, value) => ({ target: tid(id), text: value });
const sortTh = (key) => ({ selector: `th:has(> [data-testid="sort-${key}"])` });

const recordsPage = [{ pathname: '/records' }, text('page-title', 'Records'), { target: rows, count: 200 }];

export const cases = {
	'overview-counter-first': {
		route: '/',
		phases: ['early', 'settled'],
		pre: [],
		input: { click: tid('counter-increment') },
		expect: [text('counter-value', '1')],
	},
	'overview-counter-repeat-x10': {
		route: '/',
		phases: ['early', 'settled'],
		pre: [],
		input: { click: tid('counter-increment'), times: 10 },
		expect: [text('counter-value', '10')],
		holdMs: 300,
	},
	'overview-independent-panel': {
		route: '/',
		phases: ['settled'],
		pre: [{ click: tid('counter-increment') }, { waitFor: [text('counter-value', '1')] }],
		input: { click: tid('stepper-increment') },
		expect: [text('stepper-value', '6'), text('stepper-derived', 'Squared: 36'), text('counter-value', '1'), text('toggle-status', 'Off')],
	},
	'overview-toggle': {
		route: '/',
		phases: ['early', 'settled'],
		pre: [{ focus: tid('toggle-button') }],
		input: { press: 'Space' },
		expect: [{ target: tid('toggle-button'), attr: { 'aria-pressed': 'true' } }, text('toggle-status', 'On')],
	},
	'overview-disclosure': {
		route: '/',
		phases: ['early', 'settled'],
		pre: [],
		input: { click: tid('disclosure-guides') },
		expect: [{ target: tid('disclosure-guides'), attr: { 'aria-expanded': 'true' } }, { target: tid('tree-leaf-getting-started') }],
	},
	'overview-disclosure-nested': {
		route: '/',
		phases: ['settled'],
		pre: [{ click: tid('disclosure-guides') }, { waitFor: [{ target: tid('disclosure-guides'), attr: { 'aria-expanded': 'true' } }, { target: tid('disclosure-advanced') }] }],
		input: { click: tid('disclosure-advanced') },
		expect: [{ target: tid('disclosure-advanced'), attr: { 'aria-expanded': 'true' } }, { target: tid('tree-leaf-caching') }, { target: tid('tree-leaf-streaming') }],
	},
	'overview-tab': {
		route: '/',
		phases: ['early', 'settled'],
		pre: [],
		input: { click: tid('tab-activity') },
		expect: [
			{ target: tid('tab-activity'), attr: { 'aria-selected': 'true' } },
			{ target: tid('tab-summary'), attr: { 'aria-selected': 'false' } },
			text('tab-panel', 'Activity: 12 updates in the last 24 hours.'),
		],
	},
	'overview-filter': {
		route: '/',
		phases: ['early', 'settled'],
		pre: [{ click: tid('filter-input') }, { waitFor: [{ target: tid('filter-input'), focused: true }] }],
		input: { insertText: 'berry' },
		expect: [text('filter-count', '2 items'), { target: tid('filter-item'), texts: ['Blueberry', 'Elderberry'] }],
	},
	'records-search': {
		route: '/records',
		phases: ['early', 'settled'],
		pre: [{ click: tid('records-search') }, { waitFor: [{ target: tid('records-search'), focused: true }] }],
		input: { insertText: 'knuth' },
		expect: [text('records-count', 'Showing 15 of 200'), { target: rows, count: 15 }, { target: firstRow, attr: { 'data-id': 'r016' } }],
	},
	'records-sort': {
		route: '/records',
		phases: ['early', 'settled'],
		pre: [],
		input: { click: tid('sort-score') },
		expect: [{ target: sortTh('score'), attr: { 'aria-sort': 'ascending' } }, { target: firstRow, attr: { 'data-id': 'r004' } }, { target: lastRow, attr: { 'data-id': 'r147' } }],
	},
	'records-sort-toggle': {
		correctnessOnly: true,
		route: '/records',
		phases: ['settled'],
		pre: [{ click: tid('sort-score') }, { waitFor: [{ target: sortTh('score'), attr: { 'aria-sort': 'ascending' } }] }],
		input: { click: tid('sort-score') },
		expect: [{ target: sortTh('score'), attr: { 'aria-sort': 'descending' } }, { target: firstRow, attr: { 'data-id': 'r147' } }],
		followUps: [{ input: { click: tid('sort-name') }, expect: [{ target: firstRow, attr: { 'data-id': 'r028' } }, { target: { selector: '[data-testid="record-row"] [data-testid="record-name"]', nth: 0 }, text: 'Ada Engelbart' }] }],
	},
	'records-select': {
		route: '/records',
		phases: ['early', 'settled'],
		pre: [],
		input: { click: inRow('r003', 'record-select') },
		expect: [{ target: inRow('r003', 'record-select'), checked: true }, text('selection-summary', '1 selected')],
	},
	'records-dialog-open': {
		route: '/records',
		phases: ['early', 'settled'],
		pre: [],
		input: { click: inRow('r001', 'record-edit') },
		expect: [{ target: tid('edit-dialog') }, { target: tid('edit-name'), value: 'Katherine Hopper', focused: true }],
	},
	'records-dialog-save': {
		route: '/records',
		phases: ['settled'],
		pre: [
			{ click: inRow('r003', 'record-select') },
			{ waitFor: [{ target: inRow('r003', 'record-select'), checked: true }] },
			{ click: inRow('r001', 'record-edit') },
			{ waitFor: [{ target: tid('edit-name'), focused: true }] },
			{ selectAll: true },
			{ insertText: 'Renamed Record' },
			{ waitFor: [{ target: tid('edit-name'), value: 'Renamed Record' }] },
		],
		input: { click: tid('edit-save') },
		expect: [
			{ target: tid('edit-dialog'), visible: false },
			{ target: inRow('r001', 'record-name'), text: 'Renamed Record' },
			text('selection-summary', '1 selected'),
			{ target: inRow('r001', 'record-edit'), focused: true },
		],
	},
	'records-dialog-cancel': {
		correctnessOnly: true,
		route: '/records',
		phases: ['settled'],
		pre: [{ click: inRow('r002', 'record-edit') }, { waitFor: [{ target: tid('edit-dialog') }, { target: tid('edit-name'), focused: true }] }],
		input: { press: 'Escape' },
		expect: [{ target: tid('edit-dialog'), visible: false }, { target: inRow('r002', 'record-name'), text: 'Hedy Floyd' }, { target: inRow('r002', 'record-edit'), focused: true }],
	},
	'settings-derived': {
		route: '/settings',
		phases: ['early', 'settled'],
		pre: [{ click: tid('settings-quantity') }, { waitFor: [{ target: tid('settings-quantity'), focused: true }] }, { selectAll: true }],
		input: { insertText: '3' },
		expect: [text('settings-total', 'Total: $37.50')],
	},
	'settings-submit': {
		route: '/settings',
		phases: ['settled'],
		pre: [],
		input: { click: tid('settings-submit') },
		pending: [text('settings-status', 'Saving…'), { target: tid('settings-submit'), disabled: true }],
		expect: [text('settings-status', 'Saved Ada Lovelace, total $25.00'), { target: tid('settings-submit'), disabled: false, text: 'Save' }],
		server: '/api/settings',
	},
	'settings-submit-error': {
		route: '/settings',
		phases: ['settled'],
		pre: [{ click: tid('settings-name') }, { selectAll: true }, { insertText: 'fail' }, { waitFor: [{ target: tid('settings-name'), value: 'fail' }] }],
		input: { click: tid('settings-submit') },
		pending: [text('settings-status', 'Saving…'), { target: tid('settings-submit'), disabled: true }],
		expect: [text('settings-error', 'The server rejected this display name.'), { ...text('settings-status', ''), present: true }],
		server: '/api/settings',
		expectStatus: { '/api/settings': 422 },
	},
	'settings-validation': {
		correctnessOnly: true,
		route: '/settings',
		phases: ['settled'],
		pre: [
			{ click: tid('settings-name') },
			{ selectAll: true },
			{ insertText: 'Al' },
			{ click: tid('settings-email') },
			{ selectAll: true },
			{ insertText: 'nope' },
			{ waitFor: [{ target: tid('settings-name'), value: 'Al' }, { target: tid('settings-email'), value: 'nope' }] },
		],
		input: { click: tid('settings-submit') },
		expect: [
			text('settings-name-error', 'Display name must be at least 3 characters.'),
			text('settings-email-error', 'Enter a valid email address.'),
			{ target: tid('settings-name'), attr: { 'aria-invalid': 'true' }, focused: true },
			{ target: tid('settings-email'), attr: { 'aria-invalid': 'true' } },
		],
		forbidRequest: '/api/settings',
		holdMs: 500,
	},
	'nav-overview-to-records': {
		route: '/',
		phases: ['early', 'settled'],
		pre: [],
		input: { click: tid('nav-records') },
		expect: [...recordsPage, { target: tid('nav-records'), attr: { 'aria-current': 'page' } }],
	},
	'history-back': {
		route: '/',
		phases: ['settled'],
		pre: [
			{ click: tid('nav-records') },
			{ waitFor: recordsPage },
			{ scrollTo: 1200 },
			{ waitFor: [{ scrollY: 1200, tolerance: 50 }] },
			{ click: tid('nav-settings') },
			{ waitFor: [{ pathname: '/settings' }, text('page-title', 'Settings')] },
		],
		input: { goBack: true },
		expect: [...recordsPage, { scrollY: 1200, tolerance: 50 }],
	},
};

export const measuredCaseIds = Object.keys(cases).filter((id) => !cases[id].correctnessOnly);

export function selectCases(ids) {
	return ids.map((id) => {
		const found = cases[id];
		if (!found) throw new Error(`unknown case "${id}" (known: ${Object.keys(cases).join(', ')})`);
		return { id, ...found };
	});
}
