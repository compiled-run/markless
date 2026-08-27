import { computed, shared, state, type Children } from '@markless/core';

// Both triggers declare their gate cell under the SAME local name over DIFFERENT
// formulas. Component-local identity has to survive that: one cell answering for
// both is a silently absent `disabled`.
export const stepperState = shared(
	() => {
		const stepper = state({ step: 0, count: 3 });
		return {
			...stepper,
			prev() {
				const at = stepper.step;
				if (at > 0) stepper.step = at - 1;
			},
			next() {
				const at = stepper.step;
				const total = stepper.count;
				if (at < total - 1) stepper.step = at + 1;
			},
		};
	},
	{ scope: 'widget' },
);

export function StepperRoot({ children }: { children?: Children }) @{
	const stepper = stepperState();

	<div data-stepper-root>{children}</div>
}

export function StepperBackTrigger({ children }: { children?: Children }) @{
	const stepper = stepperState();
	const isOff = computed(() => {
		const at = stepper.step;
		return at <= 0;
	});

	<button
		type="button"
		data-back
		disabled={isOff}
		ui-disabled={isOff}
		onClick={() => {
			stepper.prev();
		}}
	>{children}</button>
}

export function StepperForwardTrigger({ children }: { children?: Children }) @{
	const stepper = stepperState();
	const isOff = computed(() => {
		const at = stepper.step;
		const total = stepper.count;
		return at >= total - 1;
	});

	<button
		type="button"
		data-forward
		disabled={isOff}
		ui-disabled={isOff}
		onClick={() => {
			stepper.next();
		}}
	>{children}</button>
}

export function StepperReadout() @{
	const stepper = stepperState();
	const label = computed(() => {
		const at = stepper.step;
		const total = stepper.count;
		return `${at + 1} of ${total}`;
	});

	<span data-readout>{label}</span>
}
