// A calendar page beside its View Source, sharing colours: the Booked line with its value and view entry, each day button with its event. Press a day and only then does the click code arrive.
import { computed, state } from '@markless/core';
import { describeDay, NOTES, START_DAY, START_SAID } from './model.ts';
import { art } from './source.art.ts';

export default function SourceAnatomy() @{
	let day = state<number>(START_DAY);
	let fetched = state(false);
	let said = state(START_SAID);
	let hover = state('');
	const caption = computed(() => NOTES[hover] ?? 'Hover the page or its source, then press a day.');
	const pick = (next: number) => {
		const first = !fetched;
		fetched = true;
		day = next;
		said = describeDay(next, first);
	};
	const keyOf = (target: EventTarget | null) => (target as Element | null)?.closest?.('[data-key]')?.getAttribute('data-key') ?? '';

	<figure
		class="payload"
		data-active={hover}
		onKeyDown={(event) => {
			if (event.key === 'ArrowRight') pick(day === 15 ? 13 : day + 1);
			if (event.key === 'ArrowLeft') pick(day === 13 ? 15 : day - 1);
			if (event.key === 'Escape') {
				day = START_DAY;
				fetched = false;
				hover = '';
				said = START_SAID;
			}
		}}
		onPointerover={(event) => {
			const key = keyOf(event.target);
			if (key) hover = key;
		}}
		onPointerdown={(event) => {
			const key = keyOf(event.target);
			if (key) hover = key;
		}}
		onPointerleave={(event) => {
			if (event.pointerType !== 'touch') hover = '';
		}}
	>
		<div class="top">
			<div class="ink-card window">
				<div class="bar" aria-hidden="true">
					<span class="dot"></span>
					<span class="dot"></span>
					<span class="dot"></span>
					<span class="url">calendar.app</span>
				</div>
				<div class="calendar">
					<h3 class="month" data-key="heading">March</h3>
					<p class="booked" data-key="booked">Booked: March {day}</p>
					<div class="days" data-key="day" role="group" aria-label="Pick a day; left and right arrows move it, Escape starts again">
						<button type="button" class="day" aria-pressed={day === 13 ? 'true' : 'false'} onClick={() => pick(13)}>13</button>
						<button type="button" class="day stage" aria-pressed={day === 14 ? 'true' : 'false'} onClick={() => pick(14)}>14</button>
						<button type="button" class="day" aria-pressed={day === 15 ? 'true' : 'false'} onClick={() => pick(15)}>15</button>
					</div>
				</div>
			</div>
			<div class="ink-card network">
				<p class="net-head">Network</p>
				<p class="row">
					<span class="name">calendar</span>
					<span class="type">document</span>
				</p>
				<p class="row chunk" data-key="chunk" data-on={fetched ? 'yes' : 'no'}>
					<span class="name">chunk-….js</span>
					<span class="type">click code</span>
				</p>
				<p class="row empty" data-on={fetched ? 'no' : 'yes'}>no code yet</p>
			</div>
		</div>
		<div class="ink-card sheet">
			<p class="sheet-head">View Source</p>
			<div class="body">
				<pre class="code"><code>@for (const line of art.lines; key line.key) {<span class="line" data-key={line.part} style={line.hang}>@for (const token of line.tokens; key token.key) {<span class={'t ' + token.c} data-w={token.w}>{token.t}</span>}</span>}</code></pre>
				<div class="margin" aria-hidden="true">
					<p class="note note-state" data-key="state">the values</p>
					<p class="note note-view" data-key="view">who does what</p>
				</div>
			</div>
		</div>
		<p class="hover-caption" aria-hidden="true">{caption}</p>
		<figcaption class="sr">
			A calendar page for March, with the line Booked: March 13 and three day buttons, beside its View Source. The source is the HTML
			the server sent: the heading, the Booked line and a button with an m:on attribute, then two data blocks. markless/state holds
			the values, state:day is 13. markless/view says who does what: element h3's click runs symbol:0, and element h2 shows state:day.
			The Booked line, its value and its view entry share one colour; the day buttons and their event share another; the heading is
			plain HTML. Press a day: only then does one small chunk of click code appear in the network panel.
		</figcaption>
		<p class="sr" aria-live="polite">{said}</p>
		<style>
			.payload {
				--lh: calc(var(--step--1) * 1.55);
				--booked: var(--yellow);
				--day: var(--pink);
				margin: var(--space-m) 0;
				container: payload / inline-size;
			}

			.top {
				display: grid;
				grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
				gap: 1.4rem;
				margin-bottom: 1.2rem;
			}

			.ink-card.window,
			.ink-card.network,
			.ink-card.sheet {
				margin: 0;
			}

			.window {
				padding: 0 !important;
				overflow: hidden;
			}

			.bar {
				display: flex;
				align-items: center;
				gap: 0.3rem;
				padding: 0.4rem 0.7rem;
				border-bottom: 1.3px solid var(--ink);
				background: color-mix(in oklch, var(--ink) 8%, transparent);
			}

			.dot {
				width: 0.55rem;
				height: 0.55rem;
				border: 1.2px solid var(--ink);
				border-radius: 50%;
			}

			.url {
				margin-left: 0.5rem;
				padding: 0 0.6rem;
				border: 1.2px solid var(--ink);
				border-radius: 0.6rem;
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: 0.75rem;
			}

			.calendar {
				padding: 0.7rem 1rem 1rem;
				font-family: 'Shantell Sans', system-ui, sans-serif;
			}

			.month {
				margin: 0;
				font-size: 1.15rem;
				font-weight: 800;
			}

			.booked {
				display: inline-block;
				margin: 0.3rem 0 0.6rem;
				padding: 0 0.3rem;
				border-radius: 0.3rem;
				background: color-mix(in oklch, var(--booked) 60%, transparent);
				font-family: 'Shantell Sans', system-ui, sans-serif;
			}

			.days {
				display: flex;
				gap: 0.5rem;
			}

			.day {
				min-width: 2.6rem;
				padding: 0.2rem 0.5rem;
				border: 1.5px solid var(--ink);
				border-radius: 0.5rem;
				background: color-mix(in oklch, var(--day) 40%, var(--raised));
				color: var(--ink);
				font: inherit;
				font-weight: 700;
				box-shadow: 2px 2px 0 var(--ink);
				cursor: pointer;
			}

			.day:active {
				translate: 1px 1px;
				box-shadow: 1px 1px 0 var(--ink);
			}

			.day[aria-pressed='true'] {
				background: var(--day);
			}

			.network {
				align-self: start;
				padding: 0.6rem 0.9rem 0.8rem !important;
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: 0.9rem;
			}

			.net-head,
			.sheet-head {
				margin: 0 0 0.4rem;
				font-weight: 800;
			}

			.row {
				display: flex;
				justify-content: space-between;
				gap: 0.6rem;
				margin: 0;
				padding: 0.2rem 0.3rem;
				border-top: 1px solid color-mix(in oklch, var(--ink) 30%, transparent);
			}

			.row .name {
				font-family: var(--font-mono);
				font-size: var(--step--1);
			}

			.row .type {
				opacity: 0.8;
			}

			.chunk {
				background: color-mix(in oklch, var(--day) 55%, transparent);
				transition: opacity 300ms ease;
			}

			.chunk[data-on='no'],
			.empty[data-on='no'] {
				display: none;
			}

			.empty {
				font-family: 'Joy Elia', system-ui, sans-serif;
				opacity: 0.75;
			}

			.sheet {
				padding: 0.7rem 1rem 0.9rem 0.9rem !important;
			}

			.sheet-head {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: 0.9rem;
			}

			.body {
				position: relative;
				display: grid;
				grid-template-columns: max-content minmax(5.5rem, 1fr);
				column-gap: 1rem;
			}

			.code {
				margin: 0;
				padding: 0;
				border: 0;
				background: none;
				font-family: var(--font-mono);
				font-size: var(--step--1);
				line-height: 1.55;
				white-space: pre;
			}

			.code code {
				display: block;
				padding: 0;
				background: none;
				font: inherit;
			}

			.line {
				display: block;
				height: var(--lh);
			}

			.t {
				font-family: var(--font-mono);
				border-radius: 0.2em;
				transition: background 150ms ease;
			}

			.p {
				color: #24292e;
			}

			.tag {
				color: #22863a;
			}

			.attr {
				color: #6f42c1;
			}

			.str {
				color: #032f62;
			}

			.key,
			.num {
				color: #005cc5;
			}

			.more {
				color: color-mix(in oklch, var(--ink) 55%, transparent);
			}

			.payload {
				html.dark & .p {
					color: #e1e4e8;
				}

				html.dark & .tag {
					color: #85e89d;
				}

				html.dark & .attr {
					color: #b392f0;
				}

				html.dark & .str {
					color: #9ecbff;
				}

				html.dark & :is(.key, .num) {
					color: #79b8ff;
				}

				html.dark & .t[data-w] {
					color: var(--ink);
				}
			}

			.t[data-w='booked'] {
				background: color-mix(in oklch, var(--booked) 60%, transparent);
			}

			.t[data-w='day'] {
				background: color-mix(in oklch, var(--day) 45%, transparent);
			}

			.payload[data-active='booked'] .t[data-w='booked'] {
				background: var(--booked);
			}

			.payload[data-active='day'] .t[data-w='day'] {
				background: var(--day);
			}

			.payload[data-active='booked'] .t[data-w='day'],
			.payload[data-active='day'] .t[data-w='booked'],
			.payload[data-active='heading'] .t[data-w] {
				background: color-mix(in oklch, var(--ink) 6%, transparent);
			}

			.payload[data-active='booked'] .booked {
				background: var(--booked);
				box-shadow: 0 0 0 1.5px var(--ink);
			}

			.payload[data-active='day'] .day {
				outline: 2px solid var(--ink);
				outline-offset: 2px;
			}

			.payload[data-active='heading'] .month,
			.payload[data-active='heading'] .line[data-key='heading'] {
				text-decoration: underline wavy color-mix(in oklch, var(--ink) 55%, transparent);
				text-underline-offset: 0.25em;
			}

			.payload[data-active='state'] .line[data-key='state'],
			.payload[data-active='view'] .line[data-key='view'],
			.payload[data-active='chunk'] .chunk {
				background: color-mix(in oklch, var(--ink) 8%, transparent);
			}

			.margin {
				position: relative;
			}

			.note {
				position: absolute;
				left: 0;
				right: 0;
				display: flex;
				align-items: center;
				margin: 0;
				padding-left: 0.6rem;
				border-left: 2px solid var(--ink);
				border-radius: 0.6rem 0 0 0.6rem;
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: 0.95rem;
				line-height: 1.15;
				color: var(--ink);
			}

			.note-state {
				top: calc(var(--lh) * 5 + 0.15rem);
				height: calc(var(--lh) * 3 - 0.3rem);
			}

			.note-view {
				top: calc(var(--lh) * 8 + 0.15rem);
				height: calc(var(--lh) * 4 - 0.3rem);
			}

			.payload[data-active='state'] .note-state,
			.payload[data-active='view'] .note-view {
				font-weight: 700;
			}

			@container payload (max-width: 560px) {
				.top {
					grid-template-columns: minmax(0, 1fr);
					gap: 0.9rem;
				}

				.body {
					grid-template-columns: minmax(0, 1fr);
				}

				.code {
					white-space: pre-wrap;
					overflow-wrap: anywhere;
				}

				.line {
					height: auto;
					min-height: var(--lh);
					padding-left: calc(var(--in, 0ch) + 2ch);
					text-indent: calc(-1 * (var(--in, 0ch) + 2ch));
				}

				.margin {
					display: none;
				}
			}

			.hover-caption {
				margin: 0.5rem 0 0;
				min-height: 1.4em;
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: 0.95rem;
				text-align: center;
				color: var(--ink);
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
