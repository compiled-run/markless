import { state } from '@markless/core';
import { CLAUDE, GROK, OPENAI, PERPLEXITY } from './order-marks.ts';
import { art } from './order-slip.art.ts';

const PROMPT =
	'Help me build my first app with Markless (markless.dev). Read https://markless.dev/llms.txt first, then walk me through it.';
const ASK = encodeURIComponent(PROMPT);
const COMMAND = 'npm create markless@latest';

const ASSISTANTS = [
	{ name: 'Claude', url: 'https://claude.ai/new?q=', mark: CLAUDE },
	{ name: 'ChatGPT', url: 'https://chatgpt.com/?hints=search&q=', mark: OPENAI },
	{ name: 'Grok', url: 'https://grok.com/?q=', mark: GROK },
	{ name: 'Perplexity', url: 'https://www.perplexity.ai/search?q=', mark: PERPLEXITY },
].map((assistant, i) => {
	const stamp = art.stamps[i]!;
	return { ...assistant, stamp, place: '--x:' + stamp.x + ';--y:' + stamp.y + ';--turn:' + stamp.turn + 'deg' };
});

/** The page's last call to action: a Beanshop order slip whose stamps open an assistant with the request written, and whose tear-off stub copies the command. */
export default function StartWithAgent() @{
	let missed = state('no');
	let copied = state('no');
	let torn = state('no');

	<div class="order" data-missed={missed} data-torn={torn} style={'--h:' + art.height + ';--tear:' + art.tear}>
		<svg class="art" viewBox={'0 0 ' + art.width + ' ' + art.height} aria-hidden="true">
			<path class="cast" d={art.body.shadow.wash} />
			<path class="hatch shade" d={art.body.shadow.hatch} />
			<path class="paper" d={art.body.paper} />
			<path class="hatch faint" d={art.body.curl} />
			<path class="ink" d={art.body.rules} />
			<path class="ink" d={art.body.ink} />
			<path class="paper" d={art.body.torn.paper} />
			<path class="ink" d={art.body.torn.ink} />
			<path class="feed" d={art.body.feed.d} style={'--l:' + art.body.feed.length} />
		</svg>
		<p class="head">BEANSHOP · ORDER #001</p>
		<p class="item">
			<span>1 × your first app</span>
			<span>$0.00</span>
		</p>
		<p class="missed" role="status">
			{missed === 'yes' ? 'Didn’t open? The prompt is already copied, so paste it into your assistant.' : ''}
		</p>
		<p class="ask">
			<b>your order:</b> help building my first Markless app ☕
		</p>
		<p class="sr" id="order-prompt">{'Your order, copied when you pick an assistant: ' + PROMPT}</p>
		<div
			class="agents"
			onClick={(event) => {
				const link = (event.target as Element).closest('a');
				if (!link) return;
				void navigator.clipboard?.writeText(PROMPT);
				missed = 'no';
				let left = false;
				const away = () => {
					left = true;
				};
				window.addEventListener('blur', away, { once: true });
				setTimeout(() => {
					window.removeEventListener('blur', away);
					if (!left) missed = 'yes';
				}, 1600);
			}}
		>
			@for (const assistant of ASSISTANTS; key assistant.name) {
				<a
					class="stamp"
					style={assistant.place}
					aria-label={'Start with ' + assistant.name}
					aria-describedby="order-prompt"
					title={PROMPT}
					href={assistant.url + ASK}
					target="_blank"
					rel="noopener"
				>
					<svg class="stamp-art" viewBox="-10 -10 184 84" aria-hidden="true">
						<path class="wash" d={assistant.stamp.wash} />
						<path class="hatch faint" d={assistant.stamp.tone} />
						<path class="ink" d={assistant.stamp.ink} />
					</svg>
					<svg class="mark" viewBox="0 0 24 24" aria-hidden="true">
						<path d={assistant.mark} />
					</svg>
					<span class="name">{assistant.name}</span>
				</a>
			}
		</div>
		<button
			type="button"
			class="stub"
			data-copied={copied}
			aria-label={'Copy the command: ' + COMMAND}
			onClick={(event) => {
				void navigator.clipboard?.writeText(COMMAND);
				copied = 'yes';
				torn = torn === 'odd' ? 'even' : 'odd';
				const button = (event.target as Element).closest('button')!;
				const click = String(event.timeStamp);
				button.dataset.click = click;
				const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
				setTimeout(() => {
					if (button.dataset.click === click) copied = 'no';
				}, still ? 1500 : 1400);
			}}
		>
			<span class="sheet">
				<svg class="stub-art" viewBox={'0 ' + art.tear + ' ' + art.width + ' ' + (art.height - art.tear)} aria-hidden="true">
					<path class="cast" d={art.stub.shadow.wash} />
					<path class="hatch shade" d={art.stub.shadow.hatch} />
					<path class="paper" d={art.stub.paper} />
					<path class="hatch faint" d={art.stub.tone} />
					<path class="ink" d={art.stub.ink} />
					<path class="ink" d={art.stub.notches} />
					<path class="holes" d={art.stub.holes} />
					<path class="rip" d={art.stub.rip.d} style={'--l:' + art.stub.rip.length} />
				</svg>
				<span class="robots">No robots, just you and a terminal:</span>
				<span class="label" aria-hidden="true">
					<span class="idle">tear to copy</span>
					<span class="done">copied ✓</span>
				</span>
				<span class="command">
					<span class="dollar" aria-hidden="true">$</span> {COMMAND}
				</span>
			</span>
			<svg class="snips" viewBox="-24 -9 33 18" aria-hidden="true">
				<path class="ink" d={art.scissors} />
			</svg>
		</button>
		<p class="sr" aria-live="polite">{copied === 'yes' ? 'Copied to your clipboard' : ''}</p>
		<style>
			.order {
				--u: calc(100cqw / 460);
				--slip: color-mix(in oklch, var(--paper) 40%, white);
				--slip-ink: var(--ink);
				--slip-shade: color-mix(in oklch, var(--ink) 22%, transparent);
				--stamp: var(--pink);
				position: relative;
				width: min(100%, 500px);
				aspect-ratio: 460 / var(--h);
				margin: var(--space-s, 1rem) auto var(--space-l);
				container-type: inline-size;
				color: var(--slip-ink);
				rotate: -0.8deg;

				html.dark & {
					--slip: color-mix(in oklch, var(--ink) 92%, var(--yellow));
					--slip-ink: var(--paper);
					--slip-shade: rgb(0 0 0 / 0.55);
				}
			}

			.art,
			.stamp-art,
			.stub-art {
				position: absolute;
				overflow: visible;
				pointer-events: none;
			}

			.art {
				inset: 0;
				width: 100%;
				height: 100%;
			}

			.paper {
				fill: var(--slip);
			}

			.ink {
				fill: var(--slip-ink);
			}

			.holes {
				fill: var(--slip-ink);
				opacity: 0.75;
			}

			.cast {
				fill: var(--slip-shade);
			}

			.hatch {
				fill: none;
				stroke: var(--slip-ink);
				stroke-width: 0.7;
				stroke-linecap: round;
			}

			.shade {
				stroke: var(--ink);
				opacity: 0.45;

				html.dark & {
					stroke: rgb(0 0 0 / 0.9);
					opacity: 0.8;
				}
			}

			.faint {
				opacity: 0.35;
			}

			.wash {
				fill: var(--stamp);
				stroke: var(--stamp);
				stroke-width: 1.2;
				opacity: 0.4;
				mix-blend-mode: multiply;
			}

			.head,
			.item,
			.ask,
			.robots,
			.label,
			.command {
				position: absolute;
				margin: 0;
				inset-inline: calc(var(--u) * 44) calc(var(--u) * 66);
			}

			.head,
			.item,
			.ask,
			.command {
				font-family: var(--font-mono);
			}

			.head {
				top: calc(var(--u) * 42);
				font-size: calc(var(--u) * 17);
				font-weight: 800;
				letter-spacing: 0.12em;
				line-height: 1.6;
				text-align: center;
			}

			.item {
				top: calc(var(--u) * 98);
				display: flex;
				justify-content: space-between;
				font-size: calc(var(--u) * 16);
				font-weight: 700;
				line-height: 1.4;
			}

			.ask {
				top: calc(var(--u) * 133);
				font-size: calc(var(--u) * 12);
				line-height: 1.55;
				white-space: nowrap;
			}

			.agents {
				display: contents;
			}

			.stamp {
				position: absolute;
				top: calc(var(--u) * var(--y));
				left: calc(var(--u) * var(--x));
				width: calc(var(--u) * 164);
				height: calc(var(--u) * 64);
				display: flex;
				align-items: center;
				justify-content: center;
				gap: calc(var(--u) * 9);
				border-radius: calc(var(--u) * 10);
				color: var(--slip-ink);
				text-decoration: none;
				opacity: 0.88;
				rotate: var(--turn);
				transition:
					translate 140ms ease,
					opacity 140ms ease,
					filter 140ms ease;
			}

			.stamp-art {
				inset: calc(var(--u) * -10);
				width: calc(100% + var(--u) * 20);
				height: calc(100% + var(--u) * 20);
			}

			.stamp:hover,
			.stamp:focus-visible {
				opacity: 1;
				translate: 0 calc(var(--u) * -3);
				filter: drop-shadow(calc(var(--u) * 2) calc(var(--u) * 4) 0 var(--slip-shade));
			}

			.stamp:active {
				translate: 0 calc(var(--u) * 1);
				filter: none;
			}

			.stamp:hover .wash,
			.stamp:focus-visible .wash {
				opacity: 0.6;
			}

			.stamp:focus-visible,
			.stub:focus-visible {
				outline: 2px dashed var(--slip-ink);
				outline-offset: 3px;
			}

			.mark {
				position: relative;
				width: calc(var(--u) * 22);
				height: calc(var(--u) * 22);
				flex: none;
				fill: currentColor;
			}

			.name {
				position: relative;
				font-family: 'Joy Elia', system-ui, sans-serif;
				font-size: calc(var(--u) * 21);
				line-height: 1;
			}

			.missed {
				position: absolute;
				top: calc(var(--u) * 124);
				height: calc(var(--u) * 36);
				inset-inline: calc(var(--u) * 44) calc(var(--u) * 66);
				margin: 0;
				display: grid;
				place-content: center;
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: calc(var(--u) * 12.5);
				line-height: 1.3;
				text-align: center;
				text-wrap: balance;
				pointer-events: none;
			}

			.order[data-missed='yes'] .ask {
				visibility: hidden;
			}

			.stub {
				position: absolute;
				inset-inline: calc(var(--u) * 24) calc(var(--u) * 44);
				top: calc(var(--u) * var(--tear));
				bottom: 0;
				padding: 0;
				border: 0;
				background: none;
				color: var(--slip-ink);
				font: inherit;
				text-align: start;
				cursor: pointer;
			}

			.sheet {
				position: absolute;
				inset: 0;
				transform-origin: 50% 0;
			}

			.stub-art {
				inset: 0 calc(var(--u) * -44) 0 calc(var(--u) * -24);
				width: calc(100% + var(--u) * 68);
				height: 100%;
			}

			.stub .robots,
			.stub .command {
				inset-inline: calc(var(--u) * 20) calc(var(--u) * 22);
			}

			.robots {
				top: calc(var(--u) * 14);
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: calc(var(--u) * 14);
				line-height: 1.4;
			}

			.label {
				top: calc(var(--u) * 15);
				left: auto;
				right: calc(var(--u) * 22);
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: calc(var(--u) * 12.5);
				line-height: 1.4;
				text-align: end;
				opacity: 0.8;
			}

			.done,
			.stub[data-copied='yes'] .idle {
				display: none;
			}

			.stub[data-copied='yes'] .done {
				display: inline;
			}

			.command {
				top: calc(var(--u) * 46);
				font-size: calc(var(--u) * 19);
				font-weight: 700;
				line-height: 1.4;
				white-space: nowrap;
			}

			.dollar {
				opacity: 0.45;
			}

			.snips {
				position: absolute;
				top: calc(var(--u) * -12.5);
				left: calc(var(--u) * 334.5);
				width: calc(var(--u) * 46);
				height: calc(var(--u) * 25);
				overflow: visible;
				z-index: 2;
			}

			.feed {
				fill: none;
				stroke: var(--slip-ink);
				stroke-width: 0.8;
				stroke-linecap: round;
				stroke-dasharray: var(--l);
				stroke-dashoffset: var(--l);
				opacity: 0;
			}

			.rip {
				fill: none;
				stroke: var(--slip-ink);
				stroke-width: 1.4;
				stroke-linecap: round;
				stroke-linejoin: round;
				stroke-dasharray: var(--l);
				stroke-dashoffset: var(--l);
			}

			.sr {
				position: absolute;
				width: 1px;
				height: 1px;
				overflow: hidden;
				clip-path: inset(50%);
			}

			@media (prefers-reduced-motion: no-preference) {
				.order[data-torn='odd'] .sheet {
					animation: tear-a 2400ms linear;
				}

				.order[data-torn='even'] .sheet {
					animation: tear-b 2400ms linear;
				}

				.order[data-torn='odd'] .rip {
					animation: rip-a 2400ms linear;
				}

				.order[data-torn='even'] .rip {
					animation: rip-b 2400ms linear;
				}

				.order[data-torn='odd'] .snips {
					animation: snip-a 2400ms linear;
				}

				.order[data-torn='even'] .snips {
					animation: snip-b 2400ms linear;
				}

				.order[data-torn='odd'] .feed {
					animation: feed-a 2400ms linear;
				}

				.order[data-torn='even'] .feed {
					animation: feed-b 2400ms linear;
				}
			}

			@media (prefers-reduced-motion: reduce) {
				.stamp {
					transition: none;
				}
			}

			/* Snip along the perforation (0-350 ms), fall (350-950 ms), then feed a fresh stub out in motor steps (1500-2400 ms). */
			@keyframes tear-a {
				0%,
				14.58% {
					z-index: 1;
					translate: 0 0;
					rotate: 0deg;
					opacity: 1;
					clip-path: inset(-24px -80px -60px -80px);
					animation-timing-function: cubic-bezier(0.55, 0, 1, 0.45);
				}
				33.33% {
					opacity: 1;
				}
				39.58% {
					z-index: 1;
					translate: calc(var(--u) * 26) calc(var(--u) * 200);
					rotate: 12deg;
					opacity: 0;
					clip-path: inset(-24px -80px -60px -80px);
				}
				39.79%,
				62.5% {
					z-index: -1;
					translate: 0 -100%;
					rotate: 0deg;
					opacity: 1;
					clip-path: inset(100% -80px -60px -80px);
					animation-timing-function: cubic-bezier(0.2, 0.7, 0.3, 1);
				}
				68.33% {
					z-index: -1;
					translate: 0 -78%;
					rotate: 0.5deg;
					clip-path: inset(78% -80px -60px -80px);
				}
				70.83% {
					z-index: -1;
					translate: 0 -78%;
					rotate: 0.2deg;
					clip-path: inset(78% -80px -60px -80px);
					animation-timing-function: cubic-bezier(0.2, 0.7, 0.3, 1);
				}
				76.67% {
					z-index: -1;
					translate: 0 -52%;
					rotate: -0.4deg;
					clip-path: inset(52% -80px -60px -80px);
				}
				79.17% {
					z-index: -1;
					translate: 0 -52%;
					rotate: -0.1deg;
					clip-path: inset(52% -80px -60px -80px);
					animation-timing-function: cubic-bezier(0.2, 0.7, 0.3, 1);
				}
				85% {
					z-index: -1;
					translate: 0 -26%;
					rotate: 0.3deg;
					clip-path: inset(26% -80px -60px -80px);
				}
				87.5% {
					z-index: -1;
					translate: 0 -26%;
					rotate: 0.1deg;
					clip-path: inset(26% -80px -60px -80px);
					animation-timing-function: cubic-bezier(0.2, 0.7, 0.3, 1);
				}
				93.33% {
					z-index: -1;
					translate: 0 calc(var(--u) * 1.6);
					rotate: 0deg;
					clip-path: inset(0 -80px -60px -80px);
				}
				100% {
					z-index: -1;
					translate: 0 0;
					clip-path: inset(0 -80px -60px -80px);
				}
			}

			@keyframes tear-b {
				0%,
				14.58% {
					z-index: 1;
					translate: 0 0;
					rotate: 0deg;
					opacity: 1;
					clip-path: inset(-24px -80px -60px -80px);
					animation-timing-function: cubic-bezier(0.55, 0, 1, 0.45);
				}
				33.33% {
					opacity: 1;
				}
				39.58% {
					z-index: 1;
					translate: calc(var(--u) * 26) calc(var(--u) * 200);
					rotate: 12deg;
					opacity: 0;
					clip-path: inset(-24px -80px -60px -80px);
				}
				39.79%,
				62.5% {
					z-index: -1;
					translate: 0 -100%;
					rotate: 0deg;
					opacity: 1;
					clip-path: inset(100% -80px -60px -80px);
					animation-timing-function: cubic-bezier(0.2, 0.7, 0.3, 1);
				}
				68.33% {
					z-index: -1;
					translate: 0 -78%;
					rotate: 0.5deg;
					clip-path: inset(78% -80px -60px -80px);
				}
				70.83% {
					z-index: -1;
					translate: 0 -78%;
					rotate: 0.2deg;
					clip-path: inset(78% -80px -60px -80px);
					animation-timing-function: cubic-bezier(0.2, 0.7, 0.3, 1);
				}
				76.67% {
					z-index: -1;
					translate: 0 -52%;
					rotate: -0.4deg;
					clip-path: inset(52% -80px -60px -80px);
				}
				79.17% {
					z-index: -1;
					translate: 0 -52%;
					rotate: -0.1deg;
					clip-path: inset(52% -80px -60px -80px);
					animation-timing-function: cubic-bezier(0.2, 0.7, 0.3, 1);
				}
				85% {
					z-index: -1;
					translate: 0 -26%;
					rotate: 0.3deg;
					clip-path: inset(26% -80px -60px -80px);
				}
				87.5% {
					z-index: -1;
					translate: 0 -26%;
					rotate: 0.1deg;
					clip-path: inset(26% -80px -60px -80px);
					animation-timing-function: cubic-bezier(0.2, 0.7, 0.3, 1);
				}
				93.33% {
					z-index: -1;
					translate: 0 calc(var(--u) * 1.6);
					rotate: 0deg;
					clip-path: inset(0 -80px -60px -80px);
				}
				100% {
					z-index: -1;
					translate: 0 0;
					clip-path: inset(0 -80px -60px -80px);
				}
			}

			@keyframes rip-a {
				0% {
					stroke-dashoffset: var(--l);
				}
				14.58%,
				39.58% {
					stroke-dashoffset: 0;
				}
				39.79%,
				100% {
					stroke-dashoffset: var(--l);
				}
			}

			@keyframes rip-b {
				0% {
					stroke-dashoffset: var(--l);
				}
				14.58%,
				39.58% {
					stroke-dashoffset: 0;
				}
				39.79%,
				100% {
					stroke-dashoffset: var(--l);
				}
			}

			@keyframes snip-a {
				0% {
					translate: 0 0;
					opacity: 1;
					animation-timing-function: cubic-bezier(0.4, 0, 0.6, 1);
				}
				14.58% {
					translate: calc(var(--u) * -336) 0;
					opacity: 1;
				}
				20.83% {
					translate: calc(var(--u) * -336) 0;
					opacity: 0;
				}
				21.04%,
				93.33% {
					translate: 0 0;
					opacity: 0;
				}
				100% {
					opacity: 1;
				}
			}

			@keyframes snip-b {
				0% {
					translate: 0 0;
					opacity: 1;
					animation-timing-function: cubic-bezier(0.4, 0, 0.6, 1);
				}
				14.58% {
					translate: calc(var(--u) * -336) 0;
					opacity: 1;
				}
				20.83% {
					translate: calc(var(--u) * -336) 0;
					opacity: 0;
				}
				21.04%,
				93.33% {
					translate: 0 0;
					opacity: 0;
				}
				100% {
					opacity: 1;
				}
			}

			@keyframes feed-a {
				0%,
				62.5% {
					opacity: 0;
					stroke-dashoffset: var(--l);
				}
				62.92% {
					opacity: 0.8;
				}
				93.33% {
					opacity: 0.8;
					stroke-dashoffset: 0;
				}
				100% {
					opacity: 0;
					stroke-dashoffset: 0;
				}
			}

			@keyframes feed-b {
				0%,
				62.5% {
					opacity: 0;
					stroke-dashoffset: var(--l);
				}
				62.92% {
					opacity: 0.8;
				}
				93.33% {
					opacity: 0.8;
					stroke-dashoffset: 0;
				}
				100% {
					opacity: 0;
					stroke-dashoffset: 0;
				}
			}
		</style>
	</div>
}
