import { toaster } from '../../index.ts';

// The ruled surface, quarantined: `toasts.toast(...)` is a shared() method
// called from another module, which the compiler now REFUSES loudly (defect 95
// fail-closed half). This file must never be imported statically by the suite -
// the pinned row imports it dynamically and asserts the refusal. It becomes the
// Basic scenario's third button again when the owner's F2/F3 ruling ships the
// capability.
export default function Method() @{
	const toasts = toaster.state();

	<button
		type="button"
		data-testid="method"
		onClick={() => toasts.toast('Through the method', { duration: Infinity })}
	>Method</button>
}
