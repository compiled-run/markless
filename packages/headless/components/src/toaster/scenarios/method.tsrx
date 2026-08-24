import { toaster } from '../../index.ts';

// Quarantined: `toasts.toast(...)` is a shared() method
// called from another module, which the compiler refuses loudly. This file must never be imported statically by the suite -
// the pinned row imports it dynamically and asserts the refusal. It becomes the
// Basic scenario third button again when the compiler ships the capability.
export default function Method() @{
	const toasts = toaster.state();

	<button
		type="button"
		data-testid="method"
		onClick={() => toasts.toast('Through the method', { duration: Infinity })}
	>Method</button>
}
