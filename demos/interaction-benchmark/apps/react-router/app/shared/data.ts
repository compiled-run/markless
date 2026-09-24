// GENERATED from demos/interaction-benchmark/shared/data.ts (sha256:8436265a1246da2d) by shared/sync.mjs. Do not edit; edit the source and re-sync.
// Shared fixtures and pure helpers for the interaction benchmark; see demos/interaction-benchmark/CONTRACT.md. Dependency-free, no DOM access.

export const ENTRANTS = [
	'markless',
	'qwik',
	'octane',
	'react-router',
	'remix3',
	'solidstart',
	'sveltekit',
	'ripple',
] as const;
export type Entrant = (typeof ENTRANTS)[number];

export const SITE_TITLE = 'Interaction benchmark';

export type RouteId = 'overview' | 'records' | 'settings';
export interface RouteInfo {
	id: RouteId;
	path: string;
	title: string;
	navTestId: string;
}
export const ROUTES: readonly RouteInfo[] = [
	{ id: 'overview', path: '/', title: 'Overview', navTestId: 'nav-overview' },
	{ id: 'records', path: '/records', title: 'Records', navTestId: 'nav-records' },
	{ id: 'settings', path: '/settings', title: 'Settings', navTestId: 'nav-settings' },
];

export function documentTitle(route: RouteInfo): string {
	return `${route.title} | ${SITE_TITLE}`;
}

export function mulberry32(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export const RECORD_SEED = 42;
export const RECORD_COUNT = 200;

export interface BenchmarkRecord {
	id: string;
	name: string;
	email: string;
	team: string;
	score: number;
	updatedAt: string;
}

const FIRST_NAMES = [
	'Ada', 'Alan', 'Barbara', 'Claude', 'Dennis', 'Donald', 'Edsger', 'Frances', 'Grace', 'Guido',
	'Hedy', 'John', 'Katherine', 'Ken', 'Leslie', 'Linus', 'Margaret', 'Niklaus', 'Radia', 'Tim',
] as const;
const LAST_NAMES = [
	'Allen', 'Backus', 'Cerf', 'Dijkstra', 'Engelbart', 'Floyd', 'Goldberg', 'Hamilton', 'Hopper', 'Johnson',
	'Kay', 'Knuth', 'Lamport', 'Liskov', 'McCarthy', 'Perlman', 'Ritchie', 'Shannon', 'Thompson', 'Wirth',
] as const;
export const TEAMS = ['Platform', 'Design', 'Data', 'Growth', 'Support'] as const;

const UPDATED_BASE_MS = Date.UTC(2026, 0, 1, 0, 0, 0);
const MINUTES_PER_YEAR = 365 * 24 * 60;

function pick<T>(items: readonly T[], rand: () => number): T {
	return items[Math.floor(rand() * items.length)] as T;
}

// PRNG draw order per record is fixed: first name, last name, team, score, minutes-before-base.
export function generateRecords(seed = RECORD_SEED, count = RECORD_COUNT): BenchmarkRecord[] {
	const rand = mulberry32(seed);
	const records: BenchmarkRecord[] = [];
	for (let i = 0; i < count; i++) {
		const first = pick(FIRST_NAMES, rand);
		const last = pick(LAST_NAMES, rand);
		const team = pick(TEAMS, rand);
		const score = Math.floor(rand() * 101);
		const minutes = Math.floor(rand() * MINUTES_PER_YEAR);
		const n = i + 1;
		records.push({
			id: `r${String(n).padStart(3, '0')}`,
			name: `${first} ${last}`,
			email: `${first}.${last}.${n}@example.test`.toLowerCase(),
			team,
			score,
			updatedAt: new Date(UPDATED_BASE_MS - minutes * 60_000).toISOString(),
		});
	}
	return records;
}

export const RECORDS: readonly BenchmarkRecord[] = generateRecords();

export function formatUpdatedAt(iso: string): string {
	return iso.slice(0, 10);
}

export function normalizeQuery(query: string): string {
	return query.trim().toLowerCase();
}

export function recordMatches(record: BenchmarkRecord, query: string): boolean {
	const q = normalizeQuery(query);
	if (q === '') return true;
	return record.name.toLowerCase().includes(q) || record.email.includes(q);
}

export type SortKey = 'name' | 'score';
export type SortDirection = 'ascending' | 'descending';
export interface SortState {
	key: SortKey;
	direction: SortDirection;
}

function compareIds(a: BenchmarkRecord, b: BenchmarkRecord): number {
	return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

// Code-unit comparison, never localeCompare, so every browser and server agrees.
export function compareRecords(a: BenchmarkRecord, b: BenchmarkRecord, sort: SortState | null): number {
	if (sort === null) return compareIds(a, b);
	let result: number;
	if (sort.key === 'score') result = a.score - b.score;
	else result = a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
	if (result === 0) result = compareIds(a, b);
	return sort.direction === 'ascending' ? result : -result;
}

export function nextSort(current: SortState | null, key: SortKey): SortState {
	if (current !== null && current.key === key) {
		return { key, direction: current.direction === 'ascending' ? 'descending' : 'ascending' };
	}
	return { key, direction: 'ascending' };
}

export function visibleRecords(
	records: readonly BenchmarkRecord[],
	query: string,
	sort: SortState | null,
): BenchmarkRecord[] {
	return records.filter((r) => recordMatches(r, query)).sort((a, b) => compareRecords(a, b, sort));
}

export function recordsCountText(visible: number, total: number): string {
	return `Showing ${visible} of ${total}`;
}

export function selectionSummaryText(selectedCount: number): string {
	return `${selectedCount} selected`;
}

export function normalizeEditedName(name: string): string {
	return name.trim();
}

export const OVERVIEW_PROSE: readonly string[] = [
	'This dashboard is the shared workload for a cross-framework interaction benchmark. Every entrant renders the same routes, content, and controls with its own idiomatic rendering, reactivity, events, and routing.',
	'The runner measures how soon a trusted input produces the correct visible response, both while the page is still downloading and after downloads settle. It also measures repeated actions, the first use of a different control, and client navigation.',
	'Nothing on this page is special-cased for measurement. Controls are visible and usable as soon as the framework can make them so.',
];

export interface TreeNode {
	id: string;
	label: string;
	children?: readonly TreeNode[];
}

export const SIDEBAR_TREE: readonly TreeNode[] = [
	{
		id: 'guides',
		label: 'Guides',
		children: [
			{ id: 'getting-started', label: 'Getting started' },
			{
				id: 'advanced',
				label: 'Advanced',
				children: [
					{ id: 'caching', label: 'Caching' },
					{ id: 'streaming', label: 'Streaming' },
				],
			},
		],
	},
	{
		id: 'reference',
		label: 'Reference',
		children: [
			{ id: 'api', label: 'API' },
			{
				id: 'plugins',
				label: 'Plugins',
				children: [
					{ id: 'bundler', label: 'Bundler' },
					{ id: 'router', label: 'Router' },
				],
			},
		],
	},
];

export interface TabInfo {
	id: 'summary' | 'activity' | 'notes';
	label: string;
	content: string;
}

export const TABS: readonly TabInfo[] = [
	{ id: 'summary', label: 'Summary', content: 'Summary: 200 records across 5 teams.' },
	{ id: 'activity', label: 'Activity', content: 'Activity: 12 updates in the last 24 hours.' },
	{ id: 'notes', label: 'Notes', content: 'Notes: No open issues.' },
];
export const INITIAL_TAB: TabInfo['id'] = 'summary';

export const FILTER_ITEMS: readonly string[] = [
	'Apple', 'Apricot', 'Banana', 'Blueberry', 'Cherry', 'Date',
	'Elderberry', 'Fig', 'Grape', 'Kiwi', 'Lemon', 'Mango',
];

export function filterItems(items: readonly string[], query: string): string[] {
	const q = normalizeQuery(query);
	return q === '' ? [...items] : items.filter((item) => item.toLowerCase().includes(q));
}

export function filterCountText(count: number): string {
	return count === 1 ? '1 item' : `${count} items`;
}

export const COUNTER_INITIAL = 0;
export const STEPPER_INITIAL = 5;
export const STEPPER_MIN = 0;
export const STEPPER_MAX = 10;

export function stepperDerivedText(value: number): string {
	return `Squared: ${value * value}`;
}

export function toggleStatusText(on: boolean): string {
	return on ? 'On' : 'Off';
}

export interface SettingsValues {
	name: string;
	email: string;
	quantity: string;
	unitPrice: string;
}

export type SettingsField = keyof SettingsValues;
export type SettingsErrors = Partial<Record<SettingsField, string>>;

export const SETTINGS_INITIAL: Readonly<SettingsValues> = {
	name: 'Ada Lovelace',
	email: 'ada@example.test',
	quantity: '2',
	unitPrice: '12.50',
};

export const SETTINGS_ENDPOINT = '/api/settings';
export const SETTINGS_DELAY_MS = 300;
export const SETTINGS_SAVED_AT = '2026-01-01T00:00:00.000Z';
export const SETTINGS_REJECTED_NAME = 'fail';
export const SETTINGS_REJECTED_MESSAGE = 'The server rejected this display name.';
export const SETTINGS_INVALID_MESSAGE = 'Invalid settings.';
export const SETTINGS_NETWORK_ERROR_MESSAGE = 'Request failed.';
export const SETTINGS_PENDING_TEXT = 'Saving…';
export const SETTINGS_SUBMIT_TEXT = 'Save';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const QUANTITY_PATTERN = /^\d+$/;
const PRICE_PATTERN = /^\d+(\.\d{1,2})?$/;

export function parseQuantity(raw: string): number | null {
	const text = raw.trim();
	if (!QUANTITY_PATTERN.test(text)) return null;
	const value = Number(text);
	return value >= 1 && value <= 99 ? value : null;
}

export function parseUnitPrice(raw: string): number | null {
	const text = raw.trim();
	return PRICE_PATTERN.test(text) ? Number(text) : null;
}

export function validateSettings(values: SettingsValues): SettingsErrors {
	const errors: SettingsErrors = {};
	const name = values.name.trim();
	if (name === '') errors.name = 'Display name is required.';
	else if (name.length < 3) errors.name = 'Display name must be at least 3 characters.';
	const email = values.email.trim();
	if (email === '') errors.email = 'Email is required.';
	else if (!EMAIL_PATTERN.test(email)) errors.email = 'Enter a valid email address.';
	if (parseQuantity(values.quantity) === null) errors.quantity = 'Quantity must be a whole number from 1 to 99.';
	if (parseUnitPrice(values.unitPrice) === null) errors.unitPrice = 'Unit price must be a number with at most 2 decimals.';
	return errors;
}

export function hasErrors(errors: SettingsErrors): boolean {
	return Object.keys(errors).length > 0;
}

// Integer cents so every runtime formats the same string.
export function formatTotal(quantityRaw: string, unitPriceRaw: string): string | null {
	const quantity = parseQuantity(quantityRaw);
	const price = parseUnitPrice(unitPriceRaw);
	if (quantity === null || price === null) return null;
	const cents = quantity * Math.round(price * 100);
	return `$${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
}

export function settingsTotalText(values: Pick<SettingsValues, 'quantity' | 'unitPrice'>): string {
	return `Total: ${formatTotal(values.quantity, values.unitPrice) ?? 'n/a'}`;
}

export type SettingsResponseBody =
	| { ok: true; message: string; savedAt: string }
	| { ok: false; error: string };

export interface SettingsServerResult {
	status: 200 | 400 | 422;
	body: SettingsResponseBody;
}

// Pure decision for POST /api/settings; the handler adds the SETTINGS_DELAY_MS wait and JSON serialization.
export function settingsServerResponse(input: unknown): SettingsServerResult {
	const source = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>;
	const values: SettingsValues = {
		name: typeof source.name === 'string' ? source.name : '',
		email: typeof source.email === 'string' ? source.email : '',
		quantity: typeof source.quantity === 'string' ? source.quantity : '',
		unitPrice: typeof source.unitPrice === 'string' ? source.unitPrice : '',
	};
	if (hasErrors(validateSettings(values))) {
		return { status: 400, body: { ok: false, error: SETTINGS_INVALID_MESSAGE } };
	}
	const name = values.name.trim();
	if (name.toLowerCase() === SETTINGS_REJECTED_NAME) {
		return { status: 422, body: { ok: false, error: SETTINGS_REJECTED_MESSAGE } };
	}
	return {
		status: 200,
		body: {
			ok: true,
			message: `Saved ${name}, total ${formatTotal(values.quantity, values.unitPrice)}`,
			savedAt: SETTINGS_SAVED_AT,
		},
	};
}
