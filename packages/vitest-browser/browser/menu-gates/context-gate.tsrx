import { shared, state } from '@markless/core';

type ContextGateState = {
	hits: number;
	x: number;
	y: number;
	button: number;
	/** `Event.eventPhase`, which is 0 once the dispatch that carried the event has returned. */
	phase: number;
	keys: number;
	lastKey: string;
};

export const contextGate = shared(
	() => {
		const gate: ContextGateState = state({
			hits: 0,
			x: -1,
			y: -1,
			button: -1,
			phase: -1,
			keys: 0,
			lastKey: '',
		});

		return { ...gate };
	},
	{ scope: 'widget' },
);

export default function ContextGatePage() @{
	const gate = contextGate();

	<section
		data-cg-root
		tabindex="0"
		data-testid="cg-root"
		onContextmenu={(event) => {
			event.preventDefault();
			gate.hits = gate.hits + 1;
			gate.x = event.clientX;
			gate.y = event.clientY;
			gate.button = event.button;
			gate.phase = event.eventPhase;
		}}
		onKeydown={(event) => {
			gate.keys = gate.keys + 1;
			gate.lastKey = event.key;
		}}
	>
		<p data-testid="cg-target">Right-click me</p>
		<output data-testid="cg-hits">{gate.hits}</output>
		<output data-testid="cg-x">{gate.x}</output>
		<output data-testid="cg-y">{gate.y}</output>
		<output data-testid="cg-button">{gate.button}</output>
		<output data-testid="cg-phase">{gate.phase}</output>
		<output data-testid="cg-keys">{gate.keys}</output>
		<output data-testid="cg-lastkey">{gate.lastKey}</output>
	</section>
}
