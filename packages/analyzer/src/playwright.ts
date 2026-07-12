import type { ConsoleMessage, Page, Request, Response } from 'playwright';
import type {
	AnalyzerCandidateActionReport,
	AnalyzerKnownAuditItem,
	AnalyzerRequestRecord,
	CandidateRecord,
	MatrixAction,
	MatrixApiContract,
	MatrixRoute,
	PendingPolicy,
} from './contracts.ts';
import { executedJavaScriptBytes, type V8CoverageEntry } from './coverage.ts';
import { evaluateBoundaries, evaluateCandidate, type BoundarySnapshot } from './invariants.ts';
import {
	evaluateLocatorResolution,
	locatorPlansFromView,
	type LocatorResolutionEvaluation,
} from './locator-resolution.ts';
import {
	evaluatePreloadIntegrity,
	type PreloadActionKind,
	type PreloadIntegrityEvaluation,
	type PreloadRequestObservation,
} from './preload-integrity.ts';
import {
	parsePayloadEventClaims,
	reconcilePayloadWiring,
	type ChannelEventRegistration,
	type PayloadWiringEvaluation,
} from './payload-wiring.ts';
import { classifyRequest, type RequestClassificationInput } from './requests.ts';
import type { AnalyzerTextArtifact } from './strip-guarantee.ts';

export async function collectServedBuildArtifacts(page: Page): Promise<AnalyzerTextArtifact[]> {
	return page.evaluate(async () => {
		const current = new URL(location.href);
		const urls = [
			current.href,
			...performance.getEntriesByType('resource').map((entry) => entry.name),
		].filter((url, index, all) => {
			const parsed = new URL(url, current);
			return (
				all.indexOf(url) === index &&
				(url === current.href || /\/build\/.*\.[cm]?js$/.test(parsed.pathname))
			);
		});
		return Promise.all(
			urls.map(async (url) => {
				const response = await fetch(url);
				return { path: new URL(url, current).pathname, content: await response.text() };
			}),
		);
	});
}

type SerializedDomNode = {
	readonly nodeType: number;
	readonly tagName?: string;
	readonly data?: string;
	readonly childNodes: readonly SerializedDomNode[];
};
export async function collectLocatorResolution(page: Page): Promise<LocatorResolutionEvaluation> {
	const containers = await page.evaluate(() => {
		const serialize = (node: Node): SerializedDomNode => ({
			nodeType: node.nodeType,
			...(node instanceof Element ? { tagName: node.tagName } : {}),
			...(node.nodeType === Node.COMMENT_NODE ? { data: node.nodeValue ?? '' } : {}),
			childNodes: [...node.childNodes].map(serialize),
		});
		return [...document.querySelectorAll<Element>('[data-async-container]')].map(
			(root, index) => {
				const view = [
					...root.querySelectorAll<HTMLScriptElement>('script[type="markless/view"]'),
				].find((script) => script.closest('[data-async-container]') === root);
				return {
					containerId: `document-container:${index}`,
					root: serialize(root),
					view: JSON.parse(view?.textContent ?? '{}'),
				};
			},
		);
	});
	const details: string[] = [],
		covered = new Set<any>(),
		skipped: Array<{ kind: string; reason: string }> = [];
	const adapter = {
		childNodes: (node: SerializedDomNode) => node.childNodes,
		nodeType: (node: SerializedDomNode) => node.nodeType,
		tagName: (node: SerializedDomNode) => node.tagName,
		commentData: (node: SerializedDomNode) => node.data,
	};
	for (const container of containers) {
		const parsed = locatorPlansFromView(container.view);
		const result = evaluateLocatorResolution(
			parsed.plans,
			[container.root],
			adapter,
			parsed.skipped,
		);
		details.push(
			...result.invariant.details.map((detail) => `${container.containerId}: ${detail}`),
		);
		for (const kind of result.coverage.covered) covered.add(kind);
		skipped.push(
			...result.coverage.skipped.map((entry) => ({
				...entry,
				reason: `${container.containerId}: ${entry.reason}`,
			})),
		);
	}
	return {
		invariant: {
			id: 'MLA-S3-LOCATOR-RESOLUTION',
			status: details.length ? 'fail' : 'pass',
			details,
		},
		coverage: { covered: [...covered].sort(), skipped },
	};
}

export interface ConsoleLedgerEntry {
	readonly source: 'console.error' | 'pageerror';
	readonly text: string;
}

export class ConsoleLedger {
	readonly #retained: ConsoleLedgerEntry[] = [];
	readonly #live: ConsoleLedgerEntry[] = [];
	readonly #page: Page;
	constructor(page: Page) {
		this.#page = page;
		page.on('console', this.#onConsole);
		page.on('pageerror', this.#onPageError);
	}
	readonly #onConsole = (message: ConsoleMessage) => {
		if (message.type() === 'error') this.#record('console.error', message.text());
	};
	readonly #onPageError = (error: Error) => this.#record('pageerror', String(error));
	#record(source: ConsoleLedgerEntry['source'], text: string) {
		const entry = Object.freeze({ source, text });
		this.#retained.push(entry);
		this.#live.push(entry);
	}
	assertAndClear(): readonly ConsoleLedgerEntry[] {
		const entries = this.#live.map((entry) => ({ ...entry }));
		this.#live.length = 0;
		return Object.freeze(entries);
	}
	snapshot(): readonly ConsoleLedgerEntry[] {
		return Object.freeze(this.#retained.map((entry) => Object.freeze({ ...entry })));
	}
	detach() {
		this.#page.off('console', this.#onConsole);
		this.#page.off('pageerror', this.#onPageError);
	}
}

interface MutableRequestRecord extends AnalyzerRequestRecord {
	request: Request;
	classification: AnalyzerRequestRecord['classification'];
	status: number | null;
}
type RequestLedgerInput = Omit<
	RequestClassificationInput,
	'method' | 'url' | 'resourceType' | 'status'
>;

export class RequestLedger {
	readonly #records: MutableRequestRecord[] = [];
	readonly #byRequest = new Map<Request, MutableRequestRecord>();
	readonly #inFlight = new Set<Request>();
	#lastActivity = performance.now();
	#closed = false;
	#quietFailure?: string;
	#quietDeadline?: number;
	constructor(
		readonly page: Page,
		readonly input: RequestLedgerInput,
	) {
		page.on('request', this.#onRequest);
		page.on('response', this.#onResponse);
		page.on('requestfinished', this.#onRequestFinished);
		page.on('requestfailed', this.#onRequestFailed);
	}
	readonly #onRequest = (request: Request) => {
		this.#lastActivity = performance.now();
		this.#inFlight.add(request);
		const record: MutableRequestRecord = {
			request,
			method: request.method(),
			url: request.url(),
			resourceType: request.resourceType(),
			classification: this.#closed ? 'leaked' : 'violation',
			status: null,
		};
		this.#records.push(record);
		this.#byRequest.set(request, record);
	};
	readonly #onResponse = (response: Response) => {
		const record = this.#byRequest.get(response.request());
		if (record) {
			record.status = response.status();
			if (record.classification !== 'leaked')
				record.classification = classifyRequest({ ...this.input, ...record });
		}
	};
	readonly #onRequestFinished = (request: Request) => this.#finish(request);
	readonly #onRequestFailed = (request: Request) => {
		const record = this.#byRequest.get(request);
		if (record && record.classification !== 'leaked') record.classification = 'violation';
		this.#finish(request);
	};
	#finish(request: Request) {
		this.#lastActivity = performance.now();
		this.#inFlight.delete(request);
	}
	async waitForQuiet(quietMs = 500, maxWaitMs = 10_000): Promise<string | undefined> {
		if (this.#quietFailure) return this.#quietFailure;
		this.#quietDeadline ??= performance.now() + maxWaitMs;
		while (this.#inFlight.size > 0 || performance.now() - this.#lastActivity < quietMs) {
			if (performance.now() >= this.#quietDeadline) {
				this.#closed = true;
				const last = this.#records.at(-1);
				return (this.#quietFailure = `network never went quiet: ${last ? `${last.method} ${last.url}` : 'request activity continued'}`);
			}
			await new Promise((resolve) => setTimeout(resolve, 25));
		}
		return undefined;
	}
	async closeAndObserveLeaks(leakMs = 500) {
		if (!this.#closed) {
			this.#closed = true;
			await new Promise((resolve) => setTimeout(resolve, leakMs));
		}
	}
	snapshot(): readonly AnalyzerRequestRecord[] {
		return Object.freeze(
			this.#records.map(({ request: _request, ...record }) => Object.freeze({ ...record })),
		);
	}
	preloadObservations(actionId?: string): readonly PreloadRequestObservation[] {
		return this.snapshot().map((request) => ({
			phase: this.input.phase,
			...(this.input.phase === 'action' ? { actionId } : {}),
			url: request.url,
			resourceType: request.resourceType,
		}));
	}
	detach() {
		this.page.off('request', this.#onRequest);
		this.page.off('response', this.#onResponse);
		this.page.off('requestfinished', this.#onRequestFinished);
		this.page.off('requestfailed', this.#onRequestFailed);
	}
}

export interface MarklessDebugChannelV1Subset {
	readonly version: 1;
	readonly containers: readonly { readonly boundaries: readonly BoundarySnapshot[] }[];
	explainInteraction(
		element: Element,
		eventName: string,
	): { readonly kind: string; readonly source?: string };
}

export async function collectPayloadWiring(page: Page): Promise<PayloadWiringEvaluation> {
	const containers = await page.evaluate(() => {
		const channel = (
			window as typeof window & { __MARKLESS_DEBUG__?: MarklessDebugChannelV1Subset }
		).__MARKLESS_DEBUG__;
		if (!channel || channel.version !== 1)
			throw new Error(
				`Analyzer requires Markless debug channel version 1; received ${channel?.version ?? 'missing'}`,
			);
		return [...document.querySelectorAll<Element>('[data-async-container]')].map(
			(root, containerIndex) => {
				const containerId = `document-container:${containerIndex}`;
				const owned = <T extends Element>(selector: string) =>
					[...root.querySelectorAll<T>(selector)].filter(
						(element) => element.closest('[data-async-container]') === root,
					);
				const viewElement = owned<HTMLScriptElement>('script[type="markless/view"]')[0];
				const armElements = owned<HTMLScriptElement>(
					'script[type="markless/arm"][data-boundary]',
				);
				const viewScript = viewElement?.textContent ?? null;
				const armScripts = armElements.map((script) => ({
					boundaryId: script.getAttribute('data-boundary') ?? '',
					content: script.textContent ?? '',
				}));
				const elements: Element[] = [root];
				const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
				let node: Node | null;
				while ((node = walker.nextNode())) elements.push(node as Element);
				const registrations: ChannelEventRegistration[] = [];
				const inspect = (recordSet: any, offset = 0) => {
					for (const event of recordSet?.events ?? []) {
						const locator = (recordSet?.locators ?? []).find(
							(candidate: any) => candidate.hostNodeId === event.hostNodeId,
						);
						const element = locator && elements[offset + locator.index];
						if (!element) continue;
						const explanation = channel.explainInteraction(element, event.eventName);
						registrations.push({
							containerId,
							hostNodeId: event.hostNodeId,
							eventName: event.eventName,
							kind: explanation.kind,
							...(explanation.source ? { source: explanation.source } : {}),
						});
					}
				};
				const armOffset = (boundaryId: string) => {
					const all = document.createTreeWalker(root, NodeFilter.SHOW_ALL);
					let count = 0,
						current: Node | null;
					while ((current = all.nextNode())) {
						if (
							current.nodeType === Node.COMMENT_NODE &&
							current.nodeValue === `markless:async:${boundaryId}`
						)
							return count + 1;
						if (current.nodeType === Node.ELEMENT_NODE) count++;
					}
					return elements.length;
				};
				if (viewScript) {
					const view = JSON.parse(viewScript);
					inspect(view);
					for (const boundary of view.asyncBoundaries ?? [])
						if (boundary.armRecords && !Array.isArray(boundary.armRecords))
							inspect(boundary.armRecords, armOffset(boundary.id));
				}
				for (const arm of armScripts)
					inspect(JSON.parse(arm.content), armOffset(arm.boundaryId));
				return { containerId, viewScript, armScripts, registrations };
			},
		);
	});
	const claims = containers.flatMap(parsePayloadEventClaims);
	return reconcilePayloadWiring(
		claims,
		containers.flatMap((entry) => entry.registrations),
	);
}

export interface CandidateExpectation {
	readonly documentIndex: number;
	readonly eventNames: readonly string[];
}
const POLICY_WIDGET_ROLES = [
	'button',
	'checkbox',
	'radio',
	'switch',
	'tab',
	'menuitem',
	'option',
	'slider',
	'spinbutton',
	'combobox',
];

export async function inventoryCandidates(
	page: Page,
	expectations: readonly CandidateExpectation[] = [],
	knownAudits: readonly Pick<AnalyzerKnownAuditItem, 'id' | 'selector'>[] = [],
): Promise<readonly CandidateRecord[]> {
	const raw = await page.locator('*').evaluateAll(
		(elements, input) => {
			const channel = (
				window as typeof window & { __MARKLESS_DEBUG__?: MarklessDebugChannelV1Subset }
			).__MARKLESS_DEBUG__;
			if (!channel || channel.version !== 1)
				throw new Error(
					`Analyzer requires Markless debug channel version 1; received ${channel?.version ?? 'missing'}`,
				);
			const expected = new Map(
				input.expectations.map((item) => [item.documentIndex, item.eventNames]),
			);
			const widgetRoles = new Set(input.widgetRoles);
			return elements.map((element, documentIndex) => {
				const html = element as HTMLElement;
				const tagName = element.tagName.toLowerCase();
				const style = getComputedStyle(html);
				const hidden =
					style.display === 'none' ||
					style.visibility === 'hidden' ||
					html.hidden ||
					html.closest('[hidden],[inert]') !== null ||
					html.getClientRects().length === 0;
				const disabled =
					('disabled' in html && Boolean((html as HTMLButtonElement).disabled)) ||
					html.getAttribute('aria-disabled') === 'true';
				const current = tagName === 'button' && html.hasAttribute('aria-current');
				const readOnly =
					['input', 'textarea'].includes(tagName) &&
					Boolean((html as HTMLInputElement).readOnly);
				const details: string[] = [];
				let classification = 'non-candidate';
				if (hidden || disabled || current || readOnly) {
					classification = 'excluded';
					if (hidden) details.push('hidden-or-inert');
					if (disabled) details.push('disabled');
					if (current) details.push('semantic-current');
					if (readOnly) details.push('read-only');
				} else if (widgetRoles.has(html.getAttribute('role') ?? ''))
					classification = 'aria-widget';
				else if (tagName === 'button') classification = 'button';
				else if (tagName === 'a' && html.hasAttribute('href')) {
					try {
						const href = html.getAttribute('href') ?? '';
						if (!href) throw new Error('empty');
						new URL(href, location.href);
						classification = html.hasAttribute('data-markless-router-link')
							? 'markless-link'
							: 'native-anchor';
					} catch {
						classification = 'invalid-anchor';
					}
				} else if (tagName === 'a') {
					classification = html.tabIndex >= 0 ? 'unknown-focusable' : 'excluded';
					if (classification === 'excluded') details.push('anchor-without-href');
				} else if (['input', 'textarea', 'select'].includes(tagName))
					classification = 'editable-native';
				else if (tagName === 'summary' && html.parentElement?.tagName === 'DETAILS')
					classification = 'native-summary';
				else if (html.tabIndex >= 0 || html.isContentEditable)
					classification = 'unknown-focusable';
				const expectedEvents = expected.get(documentIndex) ?? [];
				const requiredEvents = new Set(expectedEvents);
				if (classification === 'button' || classification === 'markless-link')
					requiredEvents.add('click');
				const explanations = Object.fromEntries(
					[...requiredEvents].map((eventName) => {
						let kind = channel.explainInteraction(element, eventName).kind;
						let ancestor = element.parentElement;
						while (kind === 'none' && ancestor && ancestor !== document.body) {
							const above = channel.explainInteraction(ancestor, eventName).kind;
							if (above !== 'none') kind = `delegated:${above}`;
							ancestor = ancestor.parentElement;
						}
						return [eventName, { kind }];
					}),
				);
				const testId = html.getAttribute('data-testid');
				const id = html.id;
				const role = html.getAttribute('role');
				const identity = testId
					? `[data-testid="${testId}"]`
					: id
						? `#${id}`
						: role
							? `${tagName}[role="${role}"]`
							: tagName;
				const knownAuditId = input.knownAudits.find((audit) =>
					html.matches(audit.selector),
				)?.id;
				return {
					documentIndex,
					tagName,
					identity,
					classification,
					details,
					expectedEvents,
					explanations,
					...(knownAuditId ? { knownAuditId } : {}),
				};
			});
		},
		{ expectations, knownAudits, widgetRoles: POLICY_WIDGET_ROLES },
	);
	return raw.map((candidate) => ({ ...candidate, violations: evaluateCandidate(candidate) }));
}

export function matrixActionLocator(page: Page, action: MatrixAction) {
	if (action.locator.kind === 'testId') return page.getByTestId(action.locator.value);
	if (action.locator.kind === 'role')
		return page.getByRole(
			action.locator.value as never,
			action.locator.name === undefined ? {} : { name: action.locator.name },
		);
	return page.locator(action.locator.value).first();
}

export async function performMatrixAction(page: Page, action: MatrixAction): Promise<void> {
	const locator = matrixActionLocator(page, action);
	if (action.operation === 'click') await locator.click();
	if (action.operation === 'fill') await locator.fill(action.value ?? '');
	if (action.operation === 'select') await locator.selectOption(action.value ?? '');
	if (action.operation === 'press') await locator.press(action.value ?? '');
}

export async function collectCandidateExpectations(
	page: Page,
	route: MatrixRoute,
	fixtureUrlId: string,
): Promise<readonly CandidateExpectation[]> {
	const byIndex = new Map<number, Set<string>>();
	for (const action of route.actions.filter(
		(entry) => entry.fixtureUrlId === fixtureUrlId && entry.expectedInteraction !== 'native',
	)) {
		for (const handle of await matrixActionLocator(page, action).elementHandles()) {
			const index = await handle.evaluate((element) =>
				[...document.querySelectorAll('*')].indexOf(element as Element),
			);
			const events = byIndex.get(index) ?? new Set<string>();
			action.expectedEventTypes.forEach((eventName) => events.add(eventName));
			byIndex.set(index, events);
		}
	}
	return [...byIndex].map(([documentIndex, eventNames]) => ({
		documentIndex,
		eventNames: [...eventNames],
	}));
}

export function matrixApiContracts(
	route: MatrixRoute,
	phase: 'bootstrap' | 'action',
	action?: MatrixAction,
): readonly Pick<MatrixApiContract, 'method' | 'path'>[] {
	const ids = new Set(action?.apiContractIds ?? []);
	return route.apiContracts
		.filter((contract) => contract.phase === phase && (!action || ids.has(contract.id)))
		.map(({ method, path }) => ({ method, path }));
}

export async function waitForBoundaryLiveness(
	page: Page,
	pendingPolicy: PendingPolicy,
	expectedRejectedBoundaryIds: readonly string[],
	pollMs = 50,
): Promise<ReturnType<typeof evaluateBoundaries>['results']> {
	while (true) {
		const snapshot = await page.evaluate(() => {
			const channel = (
				window as typeof window & { __MARKLESS_DEBUG__?: MarklessDebugChannelV1Subset }
			).__MARKLESS_DEBUG__;
			return {
				version: channel?.version,
				boundaries: channel?.containers.flatMap((entry) => entry.boundaries) ?? [],
			};
		});
		if (snapshot.version !== 1)
			throw new Error(
				`Analyzer requires Markless debug channel version 1; received ${snapshot.version ?? 'missing'}`,
			);
		const evaluation = evaluateBoundaries(
			snapshot.boundaries,
			Date.now(),
			pendingPolicy,
			expectedRejectedBoundaryIds,
		);
		if (evaluation.settled) return evaluation.results;
		await page.waitForTimeout(pollMs);
	}
}

export async function collectExecutedJavaScriptBytes(
	page: Page,
	pageOrigin: string,
	run: () => Promise<void>,
): Promise<number> {
	await page.coverage.startJSCoverage({ resetOnNavigation: false });
	let failure: unknown;
	try {
		await run();
	} catch (error) {
		failure = error;
	}
	const entries = await page.coverage.stopJSCoverage();
	if (failure !== undefined) throw failure;
	return executedJavaScriptBytes(entries as V8CoverageEntry[], pageOrigin);
}

export interface MeasuredWindowResult {
	readonly report: Omit<AnalyzerCandidateActionReport, 'invariants' | 'knownAudit'>;
	readonly boundaryResults: Awaited<ReturnType<typeof waitForBoundaryLiveness>>;
	readonly preloadIntegrity: PreloadIntegrityEvaluation;
	readonly errors: readonly string[];
}

export async function collectDeclaredModulePreloads(page: Page): Promise<readonly string[]> {
	return page.evaluate(() =>
		[...document.querySelectorAll<HTMLLinkElement>('link[rel="modulepreload"]')]
			.map((link) => link.href || link.getAttribute('href') || '')
			.filter(Boolean),
	);
}

async function collectPriorModuleLoads(page: Page): Promise<readonly PreloadRequestObservation[]> {
	return page.evaluate(() =>
		performance.getEntriesByType('resource').map((entry) => ({
			phase: 'navigation' as const,
			url: entry.name,
			resourceType:
				'initiatorType' in entry && entry.initiatorType === 'script'
					? 'script'
					: 'resource',
		})),
	);
}

export async function measurePageWindow(input: {
	page: Page;
	route: MatrixRoute;
	fixtureUrlId: string;
	actionId: string;
	actionKind?: PreloadActionKind;
	origin: string;
	knownDocumentPaths: readonly string[];
	run: () => Promise<void>;
	declaredApi: readonly Pick<MatrixApiContract, 'method' | 'path'>[];
	pendingPolicy: PendingPolicy;
	expectedRejectedBoundaryIds: readonly string[];
	rootSelector?: string;
	knownAudits?: readonly AnalyzerKnownAuditItem[];
}): Promise<MeasuredWindowResult> {
	const startedAt = new Date().toISOString();
	const started = performance.now();
	const errors: string[] = [];
	const declaredBefore = await collectDeclaredModulePreloads(input.page);
	const loadedBefore =
		input.actionId === 'bootstrap' ? [] : await collectPriorModuleLoads(input.page);
	const consoleLedger = new ConsoleLedger(input.page);
	const requestLedger = new RequestLedger(input.page, {
		pageOrigin: input.origin,
		knownDocumentPaths: input.knownDocumentPaths,
		declaredApi: input.declaredApi,
		phase: input.actionId === 'bootstrap' ? 'bootstrap' : 'action',
	});
	await input.page.coverage.startJSCoverage({ resetOnNavigation: false });
	let boundaryResults: Awaited<ReturnType<typeof waitForBoundaryLiveness>> = [];
	let candidates: readonly CandidateRecord[] = [];
	try {
		await input.run();
		if (input.rootSelector)
			await input.page.locator(input.rootSelector).waitFor({ state: 'visible' });
		boundaryResults = await waitForBoundaryLiveness(
			input.page,
			input.pendingPolicy,
			input.expectedRejectedBoundaryIds,
		);
		const failure = await requestLedger.waitForQuiet();
		if (failure) errors.push(failure);
		candidates = await inventoryCandidates(
			input.page,
			await collectCandidateExpectations(input.page, input.route, input.fixtureUrlId),
			input.knownAudits?.filter((item) => item.routeFile === input.route.routeFile),
		);
	} catch (error) {
		errors.push(error instanceof Error ? error.message : String(error));
	}
	const destinationSettledAfterRequestCount = requestLedger.snapshot().length;
	await requestLedger.closeAndObserveLeaks();
	const coverage = await input.page.coverage.stopJSCoverage();
	consoleLedger.assertAndClear();
	const requests = requestLedger.snapshot();
	const declaredAfter = await collectDeclaredModulePreloads(input.page);
	const preloadIntegrity = evaluatePreloadIntegrity({
		baseUrl: input.page.url(),
		actionKind: input.actionKind,
		...(input.actionKind === 'navigation'
			? {
					expectedDestination: {
						settledAfterRequestCount: destinationSettledAfterRequestCount,
					},
				}
			: {}),
		declaredPreloads: [...new Set([...declaredBefore, ...declaredAfter])],
		observedRequests: [...loadedBefore, ...requestLedger.preloadObservations(input.actionId)],
	});
	consoleLedger.detach();
	requestLedger.detach();
	return {
		errors,
		boundaryResults,
		preloadIntegrity,
		report: {
			routeFile: input.route.routeFile,
			fixtureUrlId: input.fixtureUrlId,
			actionId: input.actionId,
			startedAt,
			durationMs: Math.round(performance.now() - started),
			console: consoleLedger.snapshot(),
			requests,
			executedBytes: executedJavaScriptBytes(coverage as V8CoverageEntry[], input.origin),
			candidates,
		},
	};
}

export async function injectDeadControl(
	page: Page,
	options: { testId?: string; label?: string } = {},
): Promise<void> {
	await page.evaluate(({ testId, label }) => {
		const button = document.createElement('button');
		if (testId) button.dataset.testid = testId;
		button.textContent = label ?? 'Injected control';
		document.body.append(button);
	}, options);
}

export async function installNeverSettlingRoute(
	page: Page,
	input: { urlPattern: string | RegExp; pathname: string; method?: string },
): Promise<void> {
	await page.route(input.urlPattern, async (route) => {
		if (
			route.request().method() !== (input.method ?? 'GET') ||
			new URL(route.request().url()).pathname !== input.pathname
		)
			return route.fallback();
		await new Promise<void>(() => {});
	});
}
