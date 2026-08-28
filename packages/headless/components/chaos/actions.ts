// Gestures dispatch their own events rather than driving the real pointer and
// keyboard: real input over the browser protocol would cost minutes of round
// trips per family and add timing the seed cannot reproduce.

import type { Rng } from './seed.ts';

export type ChaosAction = {
	/** One line for the replay log a failure prints. */
	readonly note: string;
	run(): Promise<void>;
};

export type StormKind = 'pointer' | 'keyboard' | 'mixed';

/** What a storm of each kind is allowed to do. */
const KIND_MOVES: Record<StormKind, readonly MoveName[]> = {
	pointer: ['rage-click', 'random-click', 'jitter-drag', 'toggle-thrash', 'interrupt'],
	keyboard: ['key-mash', 'type-into'],
	mixed: [
		'rage-click',
		'random-click',
		'jitter-drag',
		'toggle-thrash',
		'interrupt',
		'key-mash',
		'type-into',
	],
};

type MoveName =
	| 'rage-click'
	| 'random-click'
	| 'jitter-drag'
	| 'toggle-thrash'
	| 'key-mash'
	| 'type-into'
	| 'interrupt';

const INTERACTIVE_SELECTOR = [
	'button',
	'input',
	'textarea',
	'a[href]',
	'[tabindex]',
	'[aria-expanded]',
	'[aria-haspopup]',
	'[role="menuitem"]',
	'[role="menuitemcheckbox"]',
	'[role="menuitemradio"]',
	'[role="option"]',
	'[role="treeitem"]',
	'[role="slider"]',
	'[role="tab"]',
	'[role="switch"]',
	'[role="checkbox"]',
	'[role="radio"]',
].join(', ');

/** Keys a frustrated person actually hits, plus the ones these families claim. */
const MASH_KEYS = [
	'ArrowDown',
	'ArrowUp',
	'ArrowLeft',
	'ArrowRight',
	'Home',
	'End',
	'PageUp',
	'PageDown',
	'Enter',
	' ',
	'Escape',
	'Tab',
	'Backspace',
	'Delete',
	'a',
	'b',
	'c',
	'e',
	'p',
	's',
] as const;

const TYPED_CHARACTERS = 'abcdefghilmnoprstu'.split('');

export function tick(ms = 0): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Everything in the widget a gesture could plausibly land on, root included. */
export function stormTargets(root: HTMLElement): HTMLElement[] {
	const found = new Set<HTMLElement>([root]);
	for (const node of root.querySelectorAll<HTMLElement>(INTERACTIVE_SELECTOR)) found.add(node);
	return [...found];
}

function isRendered(node: HTMLElement): boolean {
	return node.isConnected && node.getClientRects().length > 0;
}

// One target in six is hidden on purpose: that is the mid-transition click a
// scripted suite never makes.
function pickTarget(rng: Rng, root: HTMLElement): HTMLElement {
	const targets = stormTargets(root);
	const visible = targets.filter(isRendered);
	if (visible.length > 0 && !rng.chance(1 / 6)) return rng.pick(visible);
	return rng.pick(targets);
}

export function describeTarget(node: Element): string {
	const testid = node.getAttribute('data-testid');
	if (testid) return `[data-testid="${testid}"]`;
	const role = node.getAttribute('role');
	return role ? `${node.localName}[role="${role}"]` : node.localName;
}

/** Where focus is, when it is somewhere a gesture could sensibly be aimed. */
function focusedInside(root: HTMLElement): HTMLElement | null {
	const active = document.activeElement;
	if (active instanceof HTMLElement && active !== document.body && root.contains(active)) {
		return active;
	}
	return null;
}

type Point = { readonly x: number; readonly y: number };

function centerOf(node: HTMLElement): Point {
	const box = node.getBoundingClientRect();
	return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
}

let nextPointerId = 1;

function firePointer(node: HTMLElement, type: string, at: Point, buttons: number): void {
	node.dispatchEvent(
		new PointerEvent(type, {
			bubbles: true,
			cancelable: true,
			composed: true,
			button: 0,
			buttons,
			clientX: at.x,
			clientY: at.y,
			pointerId: nextPointerId,
			pointerType: 'mouse',
			isPrimary: true,
		}),
	);
}

function fireMouse(node: HTMLElement, type: string, at: Point, detail: number): void {
	node.dispatchEvent(
		new MouseEvent(type, {
			bubbles: true,
			cancelable: true,
			composed: true,
			button: 0,
			detail,
			clientX: at.x,
			clientY: at.y,
		}),
	);
}

function fireKey(node: HTMLElement, key: string, shiftKey = false): void {
	for (const type of ['keydown', 'keyup']) {
		node.dispatchEvent(
			new KeyboardEvent(type, {
				key,
				shiftKey,
				bubbles: true,
				cancelable: true,
				composed: true,
			}),
		);
	}
}

/** One press: down, up, click - the sequence a family's handlers listen for. */
function press(node: HTMLElement, at: Point, detail = 1): void {
	nextPointerId += 1;
	firePointer(node, 'pointerdown', at, 1);
	firePointer(node, 'pointerup', at, 0);
	fireMouse(node, 'click', at, detail);
}

// ── the moves ────────────────────────────────────────────────────────────────

function rageClick(rng: Rng, root: HTMLElement): ChaosAction {
	const target = pickTarget(rng, root);
	const count = rng.between(3, 8);
	const at = centerOf(target);
	return {
		note: `rage-click x${count} on ${describeTarget(target)}`,
		async run() {
			// No await between them: a rage click is faster than a frame.
			for (let hit = 1; hit <= count; hit++) press(target, at, hit);
			await tick();
		},
	};
}

function randomClick(rng: Rng, root: HTMLElement): ChaosAction {
	const target = pickTarget(rng, root);
	return {
		note: `click ${describeTarget(target)}`,
		async run() {
			press(target, centerOf(target));
			await tick(rng.between(0, 8));
		},
	};
}

function jitterDrag(rng: Rng, root: HTMLElement): ChaosAction {
	const target = pickTarget(rng, root);
	const steps = rng.between(4, 10);
	const spread = rng.between(2, 24);
	return {
		note: `jitter-drag ${steps} steps within ${spread}px on ${describeTarget(target)}`,
		async run() {
			nextPointerId += 1;
			const start = centerOf(target);
			firePointer(target, 'pointerdown', start, 1);
			for (let step = 0; step < steps; step++) {
				firePointer(
					target,
					'pointermove',
					{
						x: start.x + rng.between(-spread, spread),
						y: start.y + rng.between(-spread, spread),
					},
					1,
				);
				await tick();
			}
			firePointer(target, 'pointerup', centerOf(target), 0);
			await tick();
		},
	};
}

function toggleThrash(rng: Rng, root: HTMLElement): ChaosAction {
	const triggers = stormTargets(root).filter(
		(node) => node.hasAttribute('aria-expanded') || node.hasAttribute('aria-haspopup'),
	);
	const target = triggers.length > 0 ? rng.pick(triggers) : pickTarget(rng, root);
	const count = rng.between(2, 6);
	return {
		note: `toggle-thrash x${count} on ${describeTarget(target)}`,
		async run() {
			for (let hit = 0; hit < count; hit++) {
				press(target, centerOf(target));
				// Short enough that the previous open or close is still settling.
				await tick(rng.between(0, 12));
			}
		},
	};
}

function keyMash(rng: Rng, root: HTMLElement): ChaosAction {
	const target = focusedInside(root) ?? pickTarget(rng, root);
	const count = rng.between(2, 6);
	const keys: { key: string; shift: boolean }[] = [];
	for (let index = 0; index < count; index++) {
		const key = rng.pick(MASH_KEYS);
		keys.push({ key, shift: key === 'Tab' ? rng.chance(0.5) : false });
	}
	const spelled = keys.map(({ key, shift }) => `${shift ? 'Shift+' : ''}${key}`).join(' ');
	return {
		note: `key-mash ${spelled} at ${describeTarget(target)}`,
		async run() {
			for (const { key, shift } of keys) {
				// Aim at wherever focus ended up, the way a real burst of keys does.
				fireKey(focusedInside(root) ?? target, key, shift);
				await tick();
			}
		},
	};
}

// A dispatched keydown never changes an input's value, so a family that filters
// on what was typed would see nothing: write the value and fire `input` too.
function typeInto(rng: Rng, root: HTMLElement): ChaosAction {
	const fields = stormTargets(root).filter(
		(node): node is HTMLInputElement => node instanceof HTMLInputElement && !node.disabled,
	);
	if (fields.length === 0) return keyMash(rng, root);
	const field = rng.pick(fields);
	const typed = Array.from({ length: rng.between(1, 4) }, () => rng.pick(TYPED_CHARACTERS)).join(
		'',
	);
	const clearFirst = rng.chance(0.3);
	return {
		note: `type ${JSON.stringify(typed)}${clearFirst ? ' after clearing' : ''} into ${describeTarget(field)}`,
		async run() {
			field.focus();
			if (clearFirst) field.value = '';
			for (const character of typed) {
				field.value += character;
				fireKey(field, character);
				field.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true }));
				await tick();
			}
		},
	};
}

/** A press that never gets its pointerup until after a key burst and a click elsewhere. */
function interrupt(rng: Rng, root: HTMLElement): ChaosAction {
	const held = pickTarget(rng, root);
	const other = pickTarget(rng, root);
	return {
		note: `interrupt: hold ${describeTarget(held)}, then key + click ${describeTarget(other)}, then release`,
		async run() {
			nextPointerId += 1;
			const start = centerOf(held);
			firePointer(held, 'pointerdown', start, 1);
			firePointer(held, 'pointermove', { x: start.x + 3, y: start.y + 3 }, 1);
			await tick();
			fireKey(focusedInside(root) ?? held, rng.pick(MASH_KEYS));
			press(other, centerOf(other));
			await tick();
			firePointer(held, 'pointerup', centerOf(held), 0);
			await tick();
		},
	};
}

const MOVES: Record<MoveName, (rng: Rng, root: HTMLElement) => ChaosAction> = {
	'rage-click': rageClick,
	'random-click': randomClick,
	'jitter-drag': jitterDrag,
	'toggle-thrash': toggleThrash,
	'key-mash': keyMash,
	'type-into': typeInto,
	interrupt,
};

/** The next gesture in a storm of this kind. */
export function nextAction(rng: Rng, root: HTMLElement, kind: StormKind): ChaosAction {
	return MOVES[rng.pick(KIND_MOVES[kind])](rng, root);
}
