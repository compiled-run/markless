// The accordion page's keys: a live accordion beside its ink keycaps; press a real key in it, or tap a cap, and the cap lights and the accordion answers.
import { state } from '@markless/core';
import KeyCaps from '../../docs/keycaps.tsrx';
import AccordionBasic from '../../demos/ui/accordion/basic.tsrx';

export default function AccordionKeys() @{
	let lit = state('');
	let said = state('');
	let last = state(-1);

	<figure
		class="accordion-keys"
		onClick={(event: MouseEvent) => {
			const hit = event.target as Element;
			const figure = hit.closest('.accordion-keys');
			const demo = figure?.querySelector<HTMLElement>('[data-key-demo]');
			if (!figure || !demo) return;
			const focusable = [...demo.querySelectorAll<HTMLElement>('button, [tabindex="0"], input')];
			if (demo.contains(hit)) {
				last = focusable.indexOf(hit.closest('button, [tabindex="0"], input') as HTMLElement);
				return;
			}
			const cap = hit.closest('.cap');
			if (!cap) return;
			const focused = demo.contains(document.activeElement) ? (document.activeElement as HTMLElement) : null;
			const target = focused ?? focusable[last] ?? focusable[0];
			if (!target) return;
			target.focus();
			const key = cap.getAttribute('data-key') ?? '';
			if (key === 'Enter' || key === ' ') setTimeout(() => target.click(), 0);
			else target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
			const row = cap.closest('[data-keys]');
			lit = row?.getAttribute('data-row') ?? '';
			said = row?.getAttribute('data-does') ?? '';
		}}
		onKeydown={(event: KeyboardEvent) => {
			const figure = (event.target as Element).closest('.accordion-keys');
			const demo = figure?.querySelector('[data-key-demo]');
			if (demo?.contains(event.target as Node)) {
				const focusable = [...demo.querySelectorAll('button, [tabindex="0"], input')];
				const here = focusable.indexOf(event.target as Element);
				const count = focusable.length;
				if (event.key === 'ArrowDown') last = (here + 1) % count;
				else if (event.key === 'ArrowUp') last = (here - 1 + count) % count;
				else if (event.key === 'Home') last = 0;
				else if (event.key === 'End') last = count - 1;
				else last = here;
			}
			const match = [...(figure?.querySelectorAll<HTMLElement>('[data-keys]') ?? [])].find((el) =>
				(el.getAttribute('data-keys') ?? '').split('|').includes(event.key),
			);
			if (!match) return;
			lit = match.getAttribute('data-row') ?? '';
			said = match.getAttribute('data-does') ?? '';
		}}
	>
		<div class="grid">
			<div class="demo" data-key-demo>
				<AccordionBasic />
			</div>
			<KeyCaps family="accordion" lit={lit} />
		</div>
		<p class="sr" aria-live="polite">{said}</p>
		<style>
			.accordion-keys {
				container: accordion-keys / inline-size;
				margin: var(--space-m) 0;
			}

			.grid {
				display: grid;
				grid-template-columns: minmax(0, 1fr);
				gap: var(--space-m);
			}

			@container accordion-keys (min-width: 640px) {
				.grid {
					grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
					align-items: start;
				}
			}

			.sr {
				position: absolute;
				width: 1px;
				height: 1px;
				overflow: hidden;
				clip-path: inset(50%);
				white-space: nowrap;
			}
		</style>
	</figure>
}
