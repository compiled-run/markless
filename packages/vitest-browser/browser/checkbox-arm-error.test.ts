import { renderSSR } from '@markless/vitest-browser';
import { expect, test } from 'vitest';
import ArmErrorApp from './fixtures/checkbox-arm-error.tsrx';
import BaselineApp from './fixtures/arm-seed-baseline.tsrx';

// T052: a part an @if arm holds seeds the widget when its arm is the taken one.
// The compiler knows the seed and which arm chunk holds the part; only WHICH arm
// renders is a render-time answer, so the emitted seed pass asks the arm test
// before any part of the widget renders, and the server serves the post-seed
// value the resumed page reads.
//
// SSR only here, for one reason that is not about arms: both fixtures put the
// widget one component below the page root (the arm test has to be a prop, or
// the compiler refuses the flip outright), and the CSR seed pass cannot resolve
// a seed symbol for a widget composed below the page root - it asks for
// `c0:symbol:30` and the resolver has no such route. That reproduces on the
// pilot tip with no arm anywhere in the fixture. The CSR arm walk itself is
// proven at its own boundary in @markless/web's shared-seed-arm.test.ts.

function widget(container: ParentNode, name: string) {
	const host = container.querySelector(`[data-case="${name}"]`) as HTMLElement;
	if (!host) throw new Error(`Expected the "${name}" checkbox.`);
	return {
		trigger: host.querySelector('button[role="checkbox"]') as HTMLButtonElement,
		error: host.querySelector('[data-slot] div') as HTMLElement | null,
	};
}

test('SSR: an error part inside a taken @if arm marks the trigger invalid', async () => {
	const screen = await renderSSR(ArmErrorApp);
	const container = screen.container;

	// The arm renders, so the error part's `checkbox.invalid = true` is what the
	// trigger reads - and the trigger is a different component.
	const shown = widget(container, 'shown');
	expect(shown.error?.textContent).toBe('Required');
	expect(shown.trigger.getAttribute('aria-invalid')).toBe('true');

	// The arm does not render, so nothing marks the trigger invalid.
	const hidden = widget(container, 'hidden');
	expect(hidden.error).toBeNull();
	expect(hidden.trigger.getAttribute('aria-invalid')).toBe('false');

	// Same widget with the arm written before the trigger: seeding is a phase
	// that finishes before any part renders, so document order decides nothing.
	const first = widget(container, 'error-first');
	expect(first.error?.textContent).toBe('Required');
	expect(first.trigger.getAttribute('aria-invalid')).toBe('true');
});

// --- what an arm that does not render leaves behind ------------------------

function baselineTrigger(container: ParentNode, name: string) {
	const host = container.querySelector(`[data-case="${name}"]`) as HTMLElement;
	if (!host) throw new Error(`Expected the "${name}" widget.`);
	return host.querySelector('[data-trigger]') as HTMLElement;
}

test('SSR: an arm that does not render leaves the value the root seeded', async () => {
	const screen = await renderSSR(BaselineApp);
	const container = screen.container;

	// The root seeded false and the arm did not render: the root's value stands.
	expect(baselineTrigger(container, 'root-false-arm-closed').getAttribute('aria-invalid')).toBe(
		'false',
	);
	// The root seeded false and the arm did render: the arm's part seeds after
	// the root, so its write is what every part reads.
	expect(baselineTrigger(container, 'root-false-arm-open').getAttribute('aria-invalid')).toBe(
		'true',
	);
	// The root seeded true and the arm did not render: an arm that does not
	// render writes nothing, so it cannot undo what the root wrote.
	expect(baselineTrigger(container, 'root-true-arm-closed').getAttribute('aria-invalid')).toBe(
		'true',
	);

	// The arm-held part reads the same seeded instance its siblings do. An arm
	// decides whether its content renders, never which widget it belongs to.
	const open = container.querySelector('[data-case="root-false-arm-open"] [data-error]');
	expect(open?.getAttribute('data-invalid')).toBe('yes');
});
