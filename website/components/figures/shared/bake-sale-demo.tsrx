// The Shared page's live demo: a page-scoped day total and a widget-scoped count per stall, on one inked sheet.
import { computed, shared, state } from '@markless/core';
import InkScreen from '../ink/ink-screen.tsrx';
import MarginNotes, { Notes, NoteTitle, Spot, Spots, Tally } from '../ink/margin-notes.tsrx';
import Ring from '../ink/ring.tsrx';

export const day = shared(
	() => {
		const d = state({ sold: 0 });
		return { ...d };
	},
	{ scope: 'page' },
);

export const stall = shared(
	() => {
		const s = state({ sold: 0 });
		return { ...s };
	},
	{ scope: 'widget' },
);

function Stall({ name, n }: { name: string; n: number }) @{
	const s = stall();
	const d = day();

	<div class="stall">
		<p class="count">
			<span>{name}: <strong>{s.sold}</strong> sold</span>
			<Ring n={n} />
		</p>
		<button
			type="button"
			class="sell"
			onClick={() => {
				s.sold++;
				d.sold++;
			}}
		>
			Sell one
		</button>
		<style>
			.stall {
				display: grid;
				justify-items: center;
				gap: 0.4rem;
			}

			.count {
				display: flex;
				align-items: center;
				gap: 0.4rem;
				margin: 0;
			}

			.sell {
				padding: 0.35em 1.1em;
				border: 1.5px solid var(--screen-ink);
				border-radius: 0.4rem 0.6rem 0.45rem 0.55rem;
				background: none;
				color: var(--screen-ink);
				font: inherit;
				cursor: pointer;
			}

			.sell:active {
				background: color-mix(in oklch, var(--pink) 35%, transparent);
			}
		</style>
	</div>
}

export default function BakeSaleDemo() @{
	const d = day();
	const said = computed(() => (d.sold === 0 ? '' : 'Sold one. The day total is ' + d.sold + ', and only that stall’s own count moved.'));

	<MarginNotes said={said}>
		<InkScreen url="bakesale.app/today" label="Live preview of a bake sale page">
			<div class="page">
				<p class="total">
					<span>Sold today: <strong>{d.sold}</strong></span>
					<Ring n={1} />
				</p>
				<div class="stalls">
					<Stall name="Lemonade" n={2} />
					<Stall name="Cookies" n={3} />
				</div>
				<style>
					.page {
						display: grid;
						justify-items: center;
						gap: 0.9rem;
						padding: 1rem 1.2rem 1.4rem;
					}

					.total {
						display: flex;
						align-items: center;
						gap: 0.4rem;
						margin: 0;
						font-size: 1.35rem;
						font-weight: 800;
					}

					.stalls {
						display: flex;
						flex-wrap: wrap;
						justify-content: center;
						gap: 1.2rem;
					}
				</style>
			</div>
		</InkScreen>
		<Notes>
			<NoteTitle>2 definitions, 2 scopes</NoteTitle>
			<Spots>
				<Spot n={1} code="day().sold">one copy for the page</Spot>
				<Spot n={2} code="stall().sold">Lemonade’s own copy</Spot>
				<Spot n={3} code="stall().sold">Cookies’ own copy</Spot>
			</Spots>
			<Tally>
				<code>day</code> says <code>'page'</code>. <code>stall</code> says <code>'widget'</code>, so each
				<code>Stall</code> gets its own.
			</Tally>
		</Notes>
	</MarginNotes>
}
