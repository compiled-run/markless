import { computed, state } from '@markless/core';
import Drawer from './drawer.tsrx';
import { HIGH, LOW, SECTIONS, nextSection } from './limits.ts';

export function App() @{
	let taps = state(0);
	let lit = state(false);
	let level = state(1);
	let section = state('north');
	let shown = state(false);
	const lamp = computed(() => (lit ? 'Lamp on' : 'Lamp off'));
	const levelText = computed(() => `Level ${level} of ${HIGH}`);
	const atLow = computed(() => level <= LOW);
	const atHigh = computed(() => level >= HIGH);
	const current = computed(() => SECTIONS.find((entry) => entry.id === section)!);
	const notes = computed(() => current.text);

	<main>
		<button data-tap onClick={() => taps++}>Tap</button>
		<output data-taps>{taps}</output>
		<button data-lamp aria-pressed={lit ? 'true' : 'false'} onClick={() => (lit = !lit)}>Lamp</button>
		<output data-lamp-text>{lamp}</output>
		<button data-down disabled={atLow} onClick={() => (level = Math.max(LOW, level - 1))}>Down</button>
		<button data-up disabled={atHigh} onClick={() => (level = Math.min(HIGH, level + 1))}>Up</button>
		<p data-level title={levelText}>{levelText}</p>
		<button
			id="section-north"
			data-north
			aria-selected={section === 'north' ? 'true' : 'false'}
			tabindex={section === 'north' ? 0 : -1}
			onClick={() => (section = 'north')}
			onKeydown={(event) => {
				const next = nextSection(event.key, 'north');
				if (next === null) return;
				event.preventDefault();
				section = next;
				document.getElementById(`section-${next}`)?.focus();
			}}
		>North</button>
		<button
			id="section-south"
			data-south
			aria-selected={section === 'south' ? 'true' : 'false'}
			tabindex={section === 'south' ? 0 : -1}
			onClick={() => (section = 'south')}
			onKeydown={(event) => {
				const next = nextSection(event.key, 'south');
				if (next === null) return;
				event.preventDefault();
				section = next;
				document.getElementById(`section-${next}`)?.focus();
			}}
		>South</button>
		<div data-notes>{notes}</div>
		<button data-show onClick={() => (shown = !shown)}>Show</button>
		@if (shown) {
			<p data-shown>Shown</p>
		}
		<Drawer label="outer">
			<span data-drawer-body>Inside</span>
		</Drawer>
	</main>
}
