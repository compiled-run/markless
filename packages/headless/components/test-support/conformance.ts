import axe from 'axe-core';
import { userEvent } from 'vite-plus/test/browser';
import { describe, expect, test } from 'vitest';

// One suite held against every @markless/ui family. A family joins by declaring a
// FamilyDescriptor and calling runConformance; the checks below are the same code
// for all of them, so a rule can never be true of one family by accident.
//
// A check a family cannot pass yet is named in `exemptions` with the mechanism.
// A named exemption registers as `test.fails`, so the row is visible in the run,
// counted as a known gap, and turns red the day the gap closes. There is no
// spelling of this file that skips a check silently.

export const MODES = ['CSR', 'SSR'] as const;
export type Mode = (typeof MODES)[number];

// Both mount paths hand back the element the tree was rendered into. The CSR and
// SSR harnesses type that element differently (one is the structural render
// target, one is a real HTMLElement), so the descriptor takes the loose shape and
// the battery narrows it against the live DOM.
export type MountResult = { readonly container: unknown };
export type Mount = () => Promise<MountResult>;

export type CheckId =
	| 'parts-present'
	| 'root-aria'
	| 'trigger-aria'
	| 'idrefs'
	| 'focus-land'
	| 'focus-return'
	| 'dismiss-escape'
	| 'dismiss-outside'
	| 'tab-walk'
	| 'ui-presence'
	| 'axe';

export type Exemption = {
	readonly check: CheckId;
	/** Omit when the gap is in both modes. */
	readonly mode?: Mode;
	readonly reason: string;
};

export type AxeExemption = {
	readonly rule: string;
	readonly reason: string;
};

export type OpenCycle = {
	/** The part that opens the surface. */
	readonly trigger: string;
	/** The part the trigger reveals. */
	readonly surface: string;
	/** The part that closes it again. Defaults to the trigger, for families whose trigger toggles. */
	readonly closeBy?: string;
	/** The value the family declares for aria-haspopup, or null when it declares none. */
	readonly haspopup: string | null;
	/** True when the surface carries the bare `overlay` mark and rides the dismissal primitive. */
	readonly ridesOverlay: boolean;
	/** True when opening is required to move focus into the surface. */
	readonly focusLands: boolean;
	/** True when closing is required to put focus back on the trigger. */
	readonly focusReturns: boolean;
	/** Parts that only exist once the surface is open. */
	readonly partsWhenOpen?: readonly string[];
};

export type FamilyDescriptor = {
	/** The folder name under src/, used as the suite name. */
	readonly family: string;
	/** The family's Basic scenario, mounted per mode. Omit a mode the scenario cannot serve. */
	readonly mount: { readonly CSR?: Mount; readonly SSR?: Mount };
	/** The testid on the family root. */
	readonly root: string;
	/** Every part testid the Basic scenario renders at rest, root included. */
	readonly parts: readonly string[];
	/**
	 * The root's aria contract. `null` means the family declares no such attribute
	 * on its root, which is as much a fact as a value is.
	 */
	readonly rootAria: Readonly<Record<string, string | null>>;
	/** Present when a trigger opens a surface; absent when the family has no open/close cycle. */
	readonly openCycle?: OpenCycle;
	/** True when the family takes a `disabled` prop and reports it. */
	readonly supportsDisabled: boolean;
	/**
	 * `ui-*` attributes this family spells as key-value because the value is
	 * genuinely multi-valued. Every other `ui-*` attribute must be a presence
	 * attribute — present with an empty value, or absent.
	 */
	readonly valuedAttributes?: readonly string[];
	readonly exemptions?: readonly Exemption[];
	readonly axeExemptions?: readonly AxeExemption[];
};

// The tags the battery holds every family to. Contrast is not among them on
// purpose rather than by suppression: these components ship unstyled, so the
// wcag2aa contrast rule has no colours of the family's own to judge and is not
// in the wcag2a/wcag21a tag set this runs.
const AXE_TAGS = ['wcag2a', 'wcag21a'] as const;

const IDREF_SINGLE = ['aria-activedescendant', 'aria-details', 'aria-errormessage'] as const;
const IDREF_LIST = [
	'aria-labelledby',
	'aria-describedby',
	'aria-controls',
	'aria-owns',
	'aria-flowto',
] as const;

const FOCUSABLE_SELECTOR = [
	'a[href]',
	'area[href]',
	'button',
	'input',
	'select',
	'textarea',
	'iframe',
	'summary',
	'audio[controls]',
	'video[controls]',
	'[tabindex]',
	'[contenteditable=""]',
	'[contenteditable="true"]',
].join(',');

export function runConformance(descriptor: FamilyDescriptor): void {
	describe(descriptor.family, () => {
		for (const mode of MODES) {
			const mount = descriptor.mount[mode];
			if (!mount) continue;
			registerMode(descriptor, mode, mount);
		}
	});
}

function registerMode(descriptor: FamilyDescriptor, mode: Mode, mount: Mount): void {
	const register = (check: CheckId, title: string, body: () => Promise<void>) => {
		const exemption = (descriptor.exemptions ?? []).find(
			(one) => one.check === check && (one.mode === undefined || one.mode === mode),
		);
		if (!exemption) {
			test(`${mode}: ${title}`, body);
			return;
		}
		test.fails(`${mode}: ${title} — known gap: ${exemption.reason}`, body);
	};

	register('parts-present', 'every part the scenario writes is on the page', async () => {
		const scope = await mountScope(mount);
		for (const part of descriptor.parts) expectOnePart(scope, part);
	});

	register('root-aria', 'the root carries the aria facts the family declares', async () => {
		const scope = await mountScope(mount);
		const root = expectOnePart(scope, descriptor.root);
		for (const [name, expected] of Object.entries(descriptor.rootAria)) {
			expect(
				root.getAttribute(name),
				`${descriptor.family} root: ${name} on <${root.localName}>`,
			).toBe(expected);
		}
	});

	register('idrefs', 'every id this family points at resolves', async () => {
		const scope = await mountScope(mount);
		expectNoDanglingIdrefs(scope, 'closed');
		const cycle = descriptor.openCycle;
		if (!cycle) return;
		await openSurface(scope, cycle);
		expectNoDanglingIdrefs(scope, 'open');
	});

	register('ui-presence', 'boolean ui-* attributes are spelled as presence', async () => {
		const scope = await mountScope(mount);
		expectPresenceSpelling(scope, descriptor);
		const cycle = descriptor.openCycle;
		if (!cycle) return;
		await openSurface(scope, cycle);
		expectPresenceSpelling(scope, descriptor);
	});

	register('tab-walk', 'tab reaches every tabbable part and never dead-ends', async () => {
		const scope = await mountScope(mount);
		await expectTabWalkTerminates(scope);
	});

	const cycle = descriptor.openCycle;

	register('axe', 'axe finds no wcag2a/wcag21a violation', async () => {
		const scope = await mountScope(mount);
		await expectNoAxeViolations(scope, descriptor, cycle ? 'closed' : 'at rest');
		if (!cycle) return;
		await openSurface(scope, cycle);
		await expectNoAxeViolations(scope, descriptor, 'open');
	});

	if (!cycle) return;

	register('trigger-aria', 'the trigger reports the surface it opens', async () => {
		const scope = await mountScope(mount);
		const trigger = expectOnePart(scope, cycle.trigger);
		const surface = expectOnePart(scope, cycle.surface);

		expect(trigger.getAttribute('aria-expanded'), 'closed aria-expanded').toBe('false');
		expect(trigger.getAttribute('aria-haspopup'), 'declared aria-haspopup').toBe(cycle.haspopup);
		const controls = trigger.getAttribute('aria-controls');
		expect(controls, 'aria-controls is written').toBeTruthy();
		expect(resolveIds(scope, controls ?? ''), 'aria-controls resolves').toContain(surface);

		await openSurface(scope, cycle);
		expect(trigger.getAttribute('aria-expanded'), 'open aria-expanded').toBe('true');
		expect(surface.hasAttribute('hidden'), 'the open surface is not hidden').toBe(false);

		await closeSurface(scope, cycle);
		expect(trigger.getAttribute('aria-expanded'), 'reclosed aria-expanded').toBe('false');
	});

	for (const part of cycle.partsWhenOpen ?? []) {
		register('parts-present', `the open surface renders ${part}`, async () => {
			const scope = await mountScope(mount);
			await openSurface(scope, cycle);
			expectOnePart(scope, part);
		});
	}

	if (cycle.focusLands) {
		register('focus-land', 'opening moves focus into the surface', async () => {
			const scope = await mountScope(mount);
			await openSurface(scope, cycle);
			const surface = expectOnePart(scope, cycle.surface);
			await expect
				.poll(() => surface.contains(scope.document.activeElement))
				.toBe(true);
		});
	}

	if (cycle.focusReturns) {
		register('focus-return', 'closing puts focus back on the trigger', async () => {
			const scope = await mountScope(mount);
			const trigger = expectOnePart(scope, cycle.trigger);
			await openSurface(scope, cycle);
			await closeSurface(scope, cycle);
			await expect.poll(() => scope.document.activeElement).toBe(trigger);
		});
	}

	if (cycle.ridesOverlay) {
		register('dismiss-escape', 'escape closes the open surface', async () => {
			const scope = await mountScope(mount);
			const trigger = expectOnePart(scope, cycle.trigger);
			await openSurface(scope, cycle);
			await userEvent.keyboard('{Escape}');
			await expect.poll(() => trigger.getAttribute('aria-expanded')).toBe('false');
		});

		register('dismiss-outside', 'a press beyond the surface closes it', async () => {
			const scope = await mountScope(mount);
			const trigger = expectOnePart(scope, cycle.trigger);
			await openSurface(scope, cycle);
			pressOutside(scope);
			await expect.poll(() => trigger.getAttribute('aria-expanded')).toBe('false');
		});
	}

}

type Scope = {
	readonly container: Element;
	readonly document: Document;
};

async function mountScope(mount: Mount): Promise<Scope> {
	const result = await mount();
	const container = result.container;
	if (!(container instanceof Element)) {
		throw new Error(
			'The mount did not hand back a real DOM container. The conformance battery ' +
				'reads the live tree, so it cannot run against a structural stand-in.',
		);
	}
	const document = container.ownerDocument;
	if (!container.isConnected) {
		throw new Error('The mounted container is not in the document, so nothing can be checked.');
	}
	return { container, document };
}

function expectOnePart(scope: Scope, testid: string): Element {
	const found = scope.container.querySelectorAll(`[data-testid="${testid}"]`);
	expect(found.length, `exactly one [data-testid="${testid}"]`).toBe(1);
	return found[0] as Element;
}

function resolveIds(scope: Scope, value: string): Element[] {
	const resolved: Element[] = [];
	for (const id of value.split(/\s+/).filter(Boolean)) {
		const found = scope.document.getElementById(id);
		if (found) resolved.push(found);
	}
	return resolved;
}

function expectNoDanglingIdrefs(scope: Scope, phase: string): void {
	const dangling: string[] = [];
	for (const element of scope.container.querySelectorAll('*')) {
		for (const name of IDREF_LIST) {
			const value = element.getAttribute(name);
			if (value === null || value.trim() === '') continue;
			for (const id of value.split(/\s+/).filter(Boolean)) {
				if (!scope.document.getElementById(id)) {
					dangling.push(`<${element.localName}> ${name}="${id}" points at nothing`);
				}
			}
		}
		for (const name of IDREF_SINGLE) {
			const value = element.getAttribute(name);
			if (value === null || value.trim() === '') continue;
			if (!scope.document.getElementById(value.trim())) {
				dangling.push(`<${element.localName}> ${name}="${value}" points at nothing`);
			}
		}
		if (element.localName === 'label') {
			const value = element.getAttribute('for');
			if (value && !scope.document.getElementById(value)) {
				dangling.push(`<label for="${value}"> points at nothing`);
			}
		}
	}
	expect(dangling, `dangling id references while ${phase}`).toEqual([]);
}

function expectPresenceSpelling(scope: Scope, descriptor: FamilyDescriptor): void {
	const valued = new Set(descriptor.valuedAttributes ?? []);
	const wrong: string[] = [];
	const elements = [scope.container, ...scope.container.querySelectorAll('*')];
	for (const element of elements) {
		for (const attribute of element.attributes) {
			if (!attribute.name.startsWith('ui-')) continue;
			if (valued.has(attribute.name)) continue;
			if (attribute.value === '') continue;
			wrong.push(`<${element.localName}> ${attribute.name}="${attribute.value}"`);
		}
	}
	expect(
		wrong,
		'boolean ui-* attributes carry an empty value when present; a value means the ' +
			'attribute is key-value and belongs in the descriptor',
	).toEqual([]);
}

function isTabbable(element: Element): boolean {
	if (!(element instanceof HTMLElement) && !(element instanceof SVGElement)) return false;
	if (element.closest('[hidden]') !== null) return false;
	if (element.closest('[inert]') !== null) return false;
	if (element.closest('[aria-hidden="true"]') !== null) return false;
	if (element.matches('[disabled]')) return false;
	if (element.getAttribute('aria-disabled') === 'true') return false;
	const tabindex = element.getAttribute('tabindex');
	if (tabindex !== null && Number(tabindex) < 0) return false;
	if (element.getClientRects().length === 0) return false;
	return true;
}

function tabbablesIn(scope: Scope): HTMLElement[] {
	const found: HTMLElement[] = [];
	for (const element of scope.container.querySelectorAll(FOCUSABLE_SELECTOR)) {
		if (isTabbable(element) && element instanceof HTMLElement) found.push(element);
	}
	return found;
}

async function expectTabWalkTerminates(scope: Scope): Promise<void> {
	const expected = tabbablesIn(scope);
	if (expected.length === 0) return;

	expected[0]?.focus();
	// A family whose focus handler is a lazily loaded symbol moves focus again
	// once that symbol lands, so the walk lets focus settle before reading it.
	// Without this the walk races the load and reports a trap that is not there.
	await settleFocus(scope, null);
	const visited = new Set<Element>();
	const started = scope.document.activeElement;
	if (started !== null && scope.container.contains(started)) visited.add(started);
	const deadEnds: string[] = [];
	// Two passes plus slack: enough to come back round a cycle of this size even
	// when the browser's own chrome takes a turn between wraps.
	const budget = expected.length * 2 + 6;

	for (let step = 0; step < budget; step++) {
		const before = scope.document.activeElement;
		await userEvent.keyboard('{Tab}');
		const after = await settleFocus(scope, before);
		if (after !== null && scope.container.contains(after)) visited.add(after);
		// A dead-end is focus that will not leave the element it is on. Focus
		// leaving the container is not a dead-end; that is the page continuing.
		if (after === before && before !== null && scope.container.contains(before)) {
			deadEnds.push(`<${before.localName}> holds focus across a Tab press`);
			break;
		}
	}

	expect(deadEnds, 'tab dead-ends').toEqual([]);

	// Reachability is judged against the tab stops as they stand at the end of the
	// walk, not the set snapshotted before it. A roving widget — a tree, a radio
	// group — is one tab stop by design: its items start out looking tabbable and
	// the first focus decides which one owns the stop. Holding the family to the
	// stale snapshot would demand the opposite of the pattern it correctly
	// implements. What is still a tab stop after the walk must have been reached.
	const resting = scope.document.activeElement;
	const missed = tabbablesIn(scope)
		.filter((one) => !visited.has(one) && one !== resting)
		.map((one) => `<${one.localName} data-testid="${one.getAttribute('data-testid')}">`);
	expect(missed, 'tab stops sequential navigation never reached').toEqual([]);
}

// Waits for focus to stop moving, and reports where it stopped. `from` is the
// element focus is expected to leave; passing null just waits for the page to be
// done moving focus after a programmatic call.
async function settleFocus(scope: Scope, from: Element | null): Promise<Element | null> {
	const deadline = Date.now() + 400;
	let last = scope.document.activeElement;
	while (Date.now() < deadline) {
		await new Promise((resolve) => setTimeout(resolve, 25));
		const now = scope.document.activeElement;
		// Settled: two reads agree, and focus has left the element it was asked to
		// leave. A walk that stays put until the deadline is the dead-end case.
		if (now === last && (from === null || now !== from)) return now;
		last = now;
	}
	return scope.document.activeElement;
}

async function openSurface(scope: Scope, cycle: OpenCycle): Promise<void> {
	const trigger = expectOnePart(scope, cycle.trigger);
	(trigger as HTMLElement).click();
	await expect
		.poll(() => trigger.getAttribute('aria-expanded'), {
			timeout: 2000,
		})
		.toBe('true');
}

async function closeSurface(scope: Scope, cycle: OpenCycle): Promise<void> {
	const trigger = expectOnePart(scope, cycle.trigger);
	const closer = expectOnePart(scope, cycle.closeBy ?? cycle.trigger);
	(closer as HTMLElement).click();
	await expect
		.poll(() => trigger.getAttribute('aria-expanded'), {
			timeout: 2000,
		})
		.toBe('false');
}

function pressOutside(scope: Scope): void {
	// The dismissal primitive reads the press, not the click: a pointerdown whose
	// target is outside every enlisted element is what it reports as an outside
	// press. This is the same gesture the modal suite uses.
	scope.document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
}

async function expectNoAxeViolations(
	scope: Scope,
	descriptor: FamilyDescriptor,
	phase: string,
): Promise<void> {
	const rules: Record<string, { enabled: boolean }> = {};
	for (const exemption of descriptor.axeExemptions ?? []) {
		rules[exemption.rule] = { enabled: false };
	}
	const results = await axe.run(scope.container as HTMLElement, {
		runOnly: { type: 'tag', values: [...AXE_TAGS] },
		rules,
		resultTypes: ['violations'],
	});
	const reported = results.violations.map((violation) => {
		const nodes = violation.nodes.map((node) => `      ${node.html}`).join('\n');
		return `  ${violation.id} (${violation.impact ?? 'unknown impact'}): ${violation.help}\n${nodes}`;
	});
	expect(
		reported,
		`axe violations in ${descriptor.family} while ${phase}` +
			((descriptor.axeExemptions ?? []).length > 0
				? ` (off for this family: ${(descriptor.axeExemptions ?? [])
						.map((one) => `${one.rule} — ${one.reason}`)
						.join('; ')})`
				: ''),
	).toEqual([]);
}
