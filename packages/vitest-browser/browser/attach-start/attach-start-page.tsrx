import { state } from '@markless/core';

function mark(element: HTMLElement) {
	element.setAttribute('data-runs', String(Number(element.getAttribute('data-runs') ?? 0) + 1));
}

export default function AttachStartPage() @{
	let ran = state('no');
	let shown = state(false);

	<main>
		<p data-plain attach={mark}>
			{ran}
		</p>
		<button type="button" data-outside onClick={() => (ran = 'clicked')}>
			wake
		</button>
		<div data-host attach={mark}>
			<button type="button" data-inside onClick={() => (ran = 'inside')}>
				inside
			</button>
		</div>
		<div data-self attach={mark} onClick={() => (ran = 'self')}>
			self
		</div>
		<div data-visible attach={mark} onVisible={() => {}}>
			visible
		</div>
		<div data-idle attach={mark} onIdle={() => {}}>
			idle
		</div>
		<button type="button" data-show onClick={() => (shown = !shown)}>
			show
		</button>
		@if (shown) {
			<>
				<div data-shown-plain attach={mark}>
					plain arm
				</div>
				<div data-shown-visible attach={mark} onVisible={() => {}}>
					visible arm
				</div>
			</>;
		}
	</main>;
}
