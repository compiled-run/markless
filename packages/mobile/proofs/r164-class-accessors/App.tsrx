import { state } from '@markless/core';

class Dial {
	turns = 0;
	get full(): boolean {
		return this.turns >= 4;
	}
	get half(): number {
		return this.turns / 2;
	}
	set half(value: number) {
		this.turns = value * 2;
	}
	static get unit(): string {
		return 'turns';
	}
}

function dialAt(turns: number): Dial {
	const dial = new Dial();
	dial.turns = turns;
	return dial;
}

function turnedHalf(turns: number): number {
	const dial = dialAt(turns);
	dial.half = dial.half + 1;
	return dial.turns;
}

function reading(turns: number): string {
	const dial = dialAt(turns);
	return `${dial.turns} ${Dial.unit}, half ${dial.half}, ${dial.full ? 'full' : 'not full'}, keys ${Object.keys(dial).join('+')}`;
}

export default function App() @{
	const shown = state({ turns: 0, text: 'Not turned' });
	<main>
		<h1>Class accessors</h1>
		<p>{shown.text}</p>
		<button
			onClick={() => {
				shown.turns = turnedHalf(shown.turns);
				shown.text = reading(shown.turns);
			}}
		>
			Turn half
		</button>
	</main>
}
