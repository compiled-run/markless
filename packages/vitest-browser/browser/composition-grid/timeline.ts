import { expect } from 'vitest';
import { renderServerHTML } from '../../src/index.ts';
import { boardFor, boardRequest, failRequest, release, saveRequest, server, waitingRequests, type Board } from './grid-server.ts';

// One fixed timeline every composition fixture runs through, client-rendered and server-rendered.
// A fixture speaks one DOM contract: `data-g` labels the content it shows, `data-grid-*` names its controls.

export const STEPS = [
	'first render',
	'reload while open',
	'close',
	'reload while closed, then open',
	'reload twice while closed, then open',
	'switch subject while open',
	'save held',
	'handler rejects',
	'close while loading',
] as const;
export type Step = (typeof STEPS)[number];

export type Shape = {
	/** Lines the open place shows, settled on `board`. */
	readonly view: (board: Board) => ReadonlyArray<string>;
	/** Lines the closed place shows; `board` is the value the page holds, when anything outside the place reads it. */
	readonly closed: (board: Board | undefined) => ReadonlyArray<string>;
	/** Lines while the first answer is awaited. */
	readonly pending: ReadonlyArray<string>;
	/** Lines once the rejected handler reached the nearest `@catch`: a handler failure keeps the content and adds the arm. */
	readonly failed: (board: Board) => ReadonlyArray<string>;
	/** The value is read outside the place too, so it loads and reloads while the place is closed. */
	readonly liveWhileClosed?: boolean;
	/** The place owns its load: closing drops the value, and opening asks again. */
	readonly ownsLoad?: boolean;
	/** The place is not in an arm: nothing opens or closes it, so the close steps do not apply. */
	readonly noArm?: boolean;
	/** Nothing on the page reloads the value or changes its subject, so those steps do not apply. */
	readonly fixed?: boolean;
	/** A fixture-specific claim checked after every step. */
	readonly invariant?: () => void;
};

const ARM_STEPS: ReadonlyArray<Step> = [
	'close',
	'reload while closed, then open',
	'reload twice while closed, then open',
	'close while loading',
];

const RELOAD_STEPS: ReadonlyArray<Step> = [
	'reload while open',
	'reload while closed, then open',
	'reload twice while closed, then open',
	'switch subject while open',
	'close while loading',
];

export function applies(shape: Shape, step: Step): boolean {
	return !(shape.noArm && ARM_STEPS.includes(step)) && !(shape.fixed && RELOAD_STEPS.includes(step));
}

export type Run = {
	readonly shape: Shape;
	readonly mount: () => Promise<unknown>;
	readonly mode: 'CSR' | 'SSR';
	readonly openAtLoad: boolean;
	/** How long each wait may take; a pinned failure waits less, since it is expected to time out. */
	readonly patience?: number;
};

// One timeline runs at a time, so the run in progress sets how long every wait may take.
const poll = { timeout: 4_000, interval: 10 };
const norm = (text: string | null) => (text ?? '').replace(/\s+/g, ' ').trim();

export function lines(root: ParentNode = document): string[] {
	return [...root.querySelectorAll<HTMLElement>('[data-g]')].map(
		(element) => `${element.dataset.g}${element.className ? `.${element.className}` : ''}: ${norm(element.textContent)}`,
	);
}

const busy = () => [...document.querySelectorAll('[aria-busy="true"]')].map((element) => element.outerHTML.slice(0, 80));
const click = (selector: string) => {
	const element = document.querySelector<HTMLElement>(selector);
	if (!element) throw new Error(`No ${selector} on the page: ${lines().join(' | ')}`);
	element.click();
};
const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
// Quiet means a few frames and a task passed with nothing new: no fixed sleep decides a result.
async function quiet() {
	for (let at = 0; at < 3; at++) await frame();
	await new Promise((resolve) => setTimeout(resolve, 0));
}

async function answer(request: string) {
	await expect.poll(waitingRequests, { ...poll, message: `waiting for ${request}` }).toContain(request);
	release(request);
}

// Samples every frame and mutation: the claim is that the place never shows `@pending` or loses its content.
function neverAbsent() {
	const seen: string[] = [];
	const look = () => {
		if (document.querySelector('[data-g="pending"]')) seen.push('pending shown');
		if (!document.querySelector('[data-g="title"]')) seen.push('content absent');
	};
	const observer = new MutationObserver(look);
	observer.observe(document.body, { childList: true, subtree: true, characterData: true });
	let running = true;
	const tick = () => {
		if (!running) return;
		look();
		requestAnimationFrame(tick);
	};
	requestAnimationFrame(tick);
	return () => {
		running = false;
		observer.disconnect();
		return [...new Set(seen)];
	};
}

type Model = { open: boolean; subject: string; round: number; loadedRound: number | undefined; pageErrors: string[] };

export class Timeline {
	private readonly model: Model;
	private logFrom = 0;
	private readonly listeners: Array<() => void> = [];

	constructor(private readonly run: Run) {
		poll.timeout = run.patience ?? 4_000;
		this.model = { open: run.openAtLoad, subject: 'a', round: 0, loadedRound: undefined, pageErrors: [] };
		const onError = (event: ErrorEvent) => this.model.pageErrors.push(String(event.error ?? event.message));
		const onRejection = (event: PromiseRejectionEvent) => this.model.pageErrors.push(String(event.reason));
		let navigated = 0;
		const onSubmit = (event: Event) => {
			if (!event.defaultPrevented) navigated++;
			event.preventDefault();
		};
		window.addEventListener('error', onError);
		window.addEventListener('unhandledrejection', onRejection);
		window.addEventListener('submit', onSubmit);
		this.listeners.push(() => {
			window.removeEventListener('error', onError);
			window.removeEventListener('unhandledrejection', onRejection);
			window.removeEventListener('submit', onSubmit);
			if (navigated) this.model.pageErrors.push(`${navigated} submit(s) the page did not handle`);
		});
	}

	private board(): Board {
		const { subject, round } = this.model;
		return boardFor(subject, round, server.saved.get(subject));
	}

	private expected(): ReadonlyArray<string> {
		const { shape } = this.run;
		if (this.model.open) return shape.view(this.board());
		return shape.closed(shape.liveWhileClosed ? this.board() : undefined);
	}

	private async shows(expected: ReadonlyArray<string>) {
		await expect.poll(() => lines(), poll).toEqual(expected);
	}

	/** After every step: the exact content, the exact requests, nothing waiting, no busy mark, no page error. */
	private async settled(requests: ReadonlyArray<string>) {
		await this.shows(this.expected());
		await quiet();
		expect(lines(), 'content after the page went quiet').toEqual(this.expected());
		expect(server.log.slice(this.logFrom), 'requests this step').toEqual(requests);
		expect(waitingRequests(), 'requests left waiting').toEqual([]);
		expect(busy(), 'busy marks with nothing loading').toEqual([]);
		expect(this.model.pageErrors, 'page errors').toEqual([]);
		this.run.shape.invariant?.();
		this.logFrom = server.log.length;
	}

	private async opensLoading() {
		const request = boardRequest(this.model.subject, this.model.round);
		await answer(request);
		this.model.loadedRound = this.model.round;
		return [request];
	}

	private async open(): Promise<string[]> {
		click('[data-grid-open]');
		this.model.open = true;
		const { shape } = this.run;
		if (shape.liveWhileClosed || (!shape.ownsLoad && this.model.loadedRound === this.model.round)) return [];
		return this.opensLoading();
	}

	private async ensureOpen() {
		if (this.model.open) return;
		await this.settled(await this.open());
	}

	private async ensureClosed() {
		if (!this.model.open) return;
		click('[data-grid-close]');
		this.model.open = false;
		await this.settled([]);
	}

	private async reloadClosed(): Promise<string[]> {
		click('[data-grid-reload]');
		this.model.round++;
		if (!this.run.shape.liveWhileClosed) return [];
		const request = boardRequest(this.model.subject, this.model.round);
		await answer(request);
		this.model.loadedRound = this.model.round;
		return [request];
	}

	/** A value already shown reloads in place: kept, marked busy while it loads, never `@pending`. */
	private async inPlace(action: () => void, request: string) {
		const before = lines();
		const watch = neverAbsent();
		action();
		await expect.poll(waitingRequests, poll).toContain(request);
		await expect.poll(() => busy().length, { ...poll, message: 'a busy mark while the value loads' }).toBeGreaterThan(0);
		expect(lines(), 'content kept while the value loads').toEqual(before);
		release(request);
		await this.shows(this.expected());
		expect(watch(), 'frames while the value loaded').toEqual([]);
	}

	readonly steps: Record<Step, () => Promise<void>> = {
		'first render': async () => {
			await this.run.mount();
			const { shape } = this.run;
			const requests: string[] = [];
			const served = this.run.mode === 'SSR';
			if (this.model.open || shape.liveWhileClosed) {
				if (served) this.model.loadedRound = 0;
				else {
					await this.shows(this.model.open ? shape.pending : shape.closed(undefined));
					requests.push(...(await this.opensLoading()));
				}
			}
			await this.settled(requests);
		},
		'reload while open': async () => {
			await this.ensureOpen();
			this.model.round++;
			const request = boardRequest(this.model.subject, this.model.round);
			await this.inPlace(() => click('[data-grid-reload]'), request);
			this.model.loadedRound = this.model.round;
			await this.settled([request]);
		},
		close: async () => {
			await this.ensureOpen();
			await this.ensureClosed();
		},
		'reload while closed, then open': async () => {
			await this.ensureClosed();
			const requests = await this.reloadClosed();
			await this.settled(requests);
			await this.settled(await this.open());
		},
		'reload twice while closed, then open': async () => {
			await this.ensureClosed();
			const requests = [...(await this.reloadClosed()), ...(await this.reloadClosed())];
			await this.settled(requests);
			await this.settled(await this.open());
		},
		'switch subject while open': async () => {
			await this.ensureOpen();
			this.model.subject = this.model.subject === 'a' ? 'b' : 'a';
			const request = boardRequest(this.model.subject, this.model.round);
			await this.inPlace(() => click('[data-grid-subject]'), request);
			this.model.loadedRound = this.model.round;
			await this.settled([request]);
		},
		'save held': async () => {
			await this.ensureOpen();
			const { subject, round } = this.model;
			const before = lines();
			const watch = neverAbsent();
			click('[data-grid-save]');
			await answer(saveRequest(subject));
			await expect.poll(() => busy().length, { ...poll, message: 'a busy mark from the save' }).toBeGreaterThan(0);
			expect(lines(), 'content kept while the save is held').toEqual(before);
			const reask = boardRequest(subject, round);
			await expect.poll(waitingRequests, poll).toContain(reask);
			expect(lines(), 'content kept while the value reloads').toEqual(before);
			release(reask);
			await this.shows(this.expected());
			expect(watch(), 'frames while the save and its reload ran').toEqual([]);
			await this.settled([saveRequest(subject), reask]);
		},
		'handler rejects': async () => {
			await this.ensureOpen();
			click('[data-grid-fail]');
			await this.shows(this.run.shape.failed(this.board()));
			await quiet();
			expect(server.log.slice(this.logFrom), 'requests from the rejected handler').toEqual([failRequest(this.model.subject)]);
			expect(this.model.pageErrors, 'page errors').toEqual([]);
			this.logFrom = server.log.length;
			click('[data-grid-reset]');
			await this.settled([]);
		},
		'close while loading': async () => {
			await this.ensureOpen();
			click('[data-grid-reload]');
			this.model.round++;
			const request = boardRequest(this.model.subject, this.model.round);
			await expect.poll(waitingRequests, poll).toContain(request);
			click('[data-grid-close]');
			this.model.open = false;
			const { shape } = this.run;
			const shown = boardFor(this.model.subject, this.model.round - 1, server.saved.get(this.model.subject));
			await this.shows(shape.closed(shape.liveWhileClosed ? shown : undefined));
			release(request);
			this.model.loadedRound = this.model.round;
			await this.settled([request]);
			await this.settled(await this.open());
		},
	};

	async runSteps(steps: ReadonlyArray<Step>) {
		try {
			for (const step of steps) {
				try {
					await this.steps[step]();
				} catch (error) {
					if (error instanceof Error) error.message = `[${step}] ${error.message}`;
					throw error;
				}
			}
		} finally {
			for (const remove of this.listeners) remove();
		}
	}
}

/** The whole timeline, minus the steps pinned elsewhere. */
export function fullTimeline(run: Run, skip: ReadonlyArray<Step> = []) {
	return new Timeline(run).runSteps(STEPS.filter((step) => applies(run.shape, step) && !skip.includes(step)));
}

/** The first render and then one step: the reduced repro a pinned cell runs. */
export function oneStep(run: Run, step: Step) {
	return new Timeline({ patience: 1_000, ...run }).runSteps(step === 'first render' ? [step] : ['first render', step]);
}

// A stream append is parsed after the shell, so its inline scripts run as it lands.
function appendStreamed(container: HTMLElement, html: string): void {
	const holder = document.createElement('template');
	holder.innerHTML = html;
	for (const node of Array.from(holder.content.childNodes)) {
		if (node.nodeName === 'SCRIPT') {
			const script = document.createElement('script');
			for (const attribute of Array.from((node as Element).attributes)) script.setAttribute(attribute.name, attribute.value);
			script.text = node.textContent ?? '';
			container.appendChild(script);
		} else container.appendChild(node);
	}
}

/** Plays a whole streamed response into the page: the shell, then each append. */
export async function playStream(stream: Promise<{ readonly shell: string; readonly appends: ReadonlyArray<string> }>) {
	const { shell, appends } = await stream;
	expect(appends.length, 'chunks streamed after the shell').toBeGreaterThan(0);
	const { container } = renderServerHTML(shell);
	for (const chunk of appends) appendStreamed(container, chunk);
}

export function someSteps(run: Run, steps: ReadonlyArray<Step>) {
	return new Timeline(run).runSteps(steps.filter((step) => applies(run.shape, step)));
}
