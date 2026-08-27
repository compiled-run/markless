import { element, state } from '@markless/core';

// Closing an overlay: the handler hides the surface and hands focus back to the
// element the overlay behaviour captured when the surface enlisted. That element
// is a raw node read off a property, never a handle, and it is still `inert` at
// the moment the handler asks - the behaviour lifts the background marks from a
// mutation callback that runs after the hide commits.

type FocusOriginHost = { __marklessOverlayFocusOrigin?: Element };

function capturedOrigin(surface: HTMLElement | undefined): HTMLElement | undefined {
	const captured = (surface as FocusOriginHost | undefined)?.__marklessOverlayFocusOrigin;
	return captured instanceof HTMLElement && captured !== captured.ownerDocument.body
		? captured
		: undefined;
}

export default function WriteThenFocusInertLiftPage() @{
	let open = state(false);
	const surfaceEl = element<HTMLElement>();

	<section data-write-then-focus="inert-lift">
		<button
			type="button"
			data-testid="origin"
			onClick={() => {
				open = true;
			}}
		>origin</button>
		<div
			data-testid="surface"
			overlay
			role="dialog"
			aria-modal="true"
			hidden={open !== true}
			el={surfaceEl}
		>
			<button
				type="button"
				data-testid="close"
				onClick={() => {
					open = false;
					capturedOrigin(surfaceEl)?.focus();
				}}
			>close</button>
		</div>
	</section>
}
