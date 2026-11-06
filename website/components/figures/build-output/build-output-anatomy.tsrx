// Same source, three hosts: flip the preset and the terminal re-runs and the output folder takes that host's shape. Drag a source file into the output, and it slides back.
import { state } from '@markless/core';
import { describeBuild, ENV, flip, type Hint, HINTS, LABEL, nextPreset, type Preset, REFUSED } from './model.ts';
import { art } from './build-output.art.ts';

export default function BuildOutput() @{
	let preset = state<Preset>('node');
	let beat = state('rest');
	let refuse = state('rest');
	let hint = state<Hint>('');
	let dragging = state('');
	let dragX = state(0);
	let dragY = state(0);
	let said = state('');
	let touched = state(false);
	const pick = (next: Preset) => {
		touched = true;
		preset = next;
		beat = flip(beat);
		hint = '';
		said = describeBuild(next);
	};
	const scaleOf = (event: Event) => {
		const svg = (event.currentTarget as SVGGraphicsElement).ownerSVGElement;
		const width = svg?.getBoundingClientRect().width ?? art.width;
		return art.width / (width || art.width);
	};
	const grab = (event: PointerEvent, file: string) => {
		touched = true;
		const el = event.currentTarget as SVGGElement;
		el.setPointerCapture(event.pointerId);
		el.dataset.x = String(event.clientX);
		el.dataset.y = String(event.clientY);
		dragging = file;
	};
	const drag = (event: PointerEvent) => {
		const el = event.currentTarget as SVGGElement;
		if (el.dataset.x === undefined) return;
		const k = scaleOf(event);
		dragX = (event.clientX - Number(el.dataset.x)) * k;
		dragY = (event.clientY - Number(el.dataset.y)) * k;
	};
	const drop = (event: PointerEvent, fromX: number) => {
		const el = event.currentTarget as SVGGElement;
		delete el.dataset.x;
		const into = fromX + dragX > art.output.drop.x0 - 10;
		dragging = '';
		dragX = 0;
		dragY = 0;
		if (into) {
			refuse = flip(refuse);
			said = REFUSED;
		}
	};
	const tryMove = () => {
		touched = true;
		refuse = flip(refuse);
		said = REFUSED;
	};
	const show = (next: Hint) => {
		hint = next;
	};

	<figure
		class="anatomy"
		onVisible={(event) => {
			const host = event.target as Element;
			if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
			let seen = true;
			const watcher = new IntersectionObserver((entries) => {
				seen = Boolean(entries.at(-1)?.isIntersecting);
			});
			watcher.observe(host);
			const timer = setInterval(() => {
				if (!seen || touched) return;
				preset = nextPreset(preset, 1);
				beat = flip(beat);
			}, 3600);
			return () => {
				clearInterval(timer);
				watcher.disconnect();
			};
		}}
		onKeyDown={(event) => {
			if (event.key === 'Escape') {
				touched = true;
				preset = 'node';
				beat = 'rest';
				hint = '';
				said = 'Back to the default Node build.';
			}
		}}
	>
		<svg class="scene" data-preset={preset} data-beat={beat} data-refuse={refuse} viewBox={'0 0 ' + art.width + ' ' + art.height} role="group" aria-label="Your source, the build, and its output">
			<g class="card terminal">
				<path class="hatch light desk" d={art.terminal.shadow} />
				<path class="screen" d={art.terminal.screen} />
				<path class="desk-ink" d={art.terminal.ink} />
				<text class="term" x={art.terminal.prompt.x} y={art.terminal.prompt.y}>$ npm run build</text>
				<text class="term preset-text node" x={art.terminal.preset.x} y={art.terminal.preset.y}>{'NITRO_PRESET=' + ENV.node}</text>
				<text class="term preset-text vercel" x={art.terminal.preset.x} y={art.terminal.preset.y}>{'NITRO_PRESET=' + ENV.vercel}</text>
				<text class="term preset-text cloudflare" x={art.terminal.preset.x} y={art.terminal.preset.y}>{'NITRO_PRESET=' + ENV.cloudflare}</text>
				<path class="log l0" d={art.terminal.log[0]} />
				<path class="log l1" d={art.terminal.log[1]} />
				<path class="log l2" d={art.terminal.log[2]} />
				<path class="log l3" d={art.terminal.log[3]} />
				<path class="log tick" d={art.terminal.tick} />
			</g>

			<g
				class="key key-node"
				tabindex="0"
				role="button"
				aria-label={'Build for ' + LABEL.node}
				aria-pressed={preset === 'node' ? 'true' : 'false'}
				onClick={() => pick('node')}
				onKeyDown={(event) => {
					if (event.key === 'Enter' || event.key === ' ') {
						event.preventDefault();
						pick('node');
					}
					if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
						event.preventDefault();
						pick(nextPreset(preset, event.key === 'ArrowRight' ? 1 : -1));
					}
				}}
			>
				<path class="key-side" d={art.keys[0]!.side} />
				<g class="key-face">
					<path class="paper" d={art.keys[0]!.paper} />
					<path class="wash pink" d={art.keys[0]!.wash} />
					<path class="ink" d={art.keys[0]!.ink} />
					<text class="key-label" x={art.keys[0]!.label.x} y={art.keys[0]!.label.y}>{LABEL.node}</text>
				</g>
			</g>

			<g
				class="key key-vercel"
				tabindex="0"
				role="button"
				aria-label={'Build for ' + LABEL.vercel}
				aria-pressed={preset === 'vercel' ? 'true' : 'false'}
				onClick={() => pick('vercel')}
				onKeyDown={(event) => {
					if (event.key === 'Enter' || event.key === ' ') {
						event.preventDefault();
						pick('vercel');
					}
					if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
						event.preventDefault();
						pick(nextPreset(preset, event.key === 'ArrowRight' ? 1 : -1));
					}
				}}
			>
				<path class="key-side" d={art.keys[1]!.side} />
				<g class="key-face">
					<path class="paper" d={art.keys[1]!.paper} />
					<path class="wash pink" d={art.keys[1]!.wash} />
					<path class="ink" d={art.keys[1]!.ink} />
					<text class="key-label" x={art.keys[1]!.label.x} y={art.keys[1]!.label.y}>{LABEL.vercel}</text>
				</g>
			</g>

			<g
				class="key key-cloudflare"
				tabindex="0"
				role="button"
				aria-label={'Build for ' + LABEL.cloudflare}
				aria-pressed={preset === 'cloudflare' ? 'true' : 'false'}
				onClick={() => pick('cloudflare')}
				onKeyDown={(event) => {
					if (event.key === 'Enter' || event.key === ' ') {
						event.preventDefault();
						pick('cloudflare');
					}
					if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
						event.preventDefault();
						pick(nextPreset(preset, event.key === 'ArrowRight' ? 1 : -1));
					}
				}}
			>
				<path class="key-side" d={art.keys[2]!.side} />
				<g class="key-face">
					<path class="paper" d={art.keys[2]!.paper} />
					<path class="wash pink" d={art.keys[2]!.wash} />
					<path class="ink" d={art.keys[2]!.ink} />
					<text class="key-label" x={art.keys[2]!.label.x} y={art.keys[2]!.label.y}>{LABEL.cloudflare}</text>
				</g>
			</g>

			<g class="card output-card">
				<path class="hatch light desk" d={art.output.card.shadow} />
				<path class="paper" d={art.output.card.paper} />
				<path class="hatch faint" d={art.output.card.barTone} />
				<path class="ink" d={art.output.card.ink} />
				<g class="tree tree-node">
					<path class="ink" d={art.output.node.icons} />
					<path class="ink faint-ink" d={art.output.node.guides} />
					<text class="name" x={art.output.node.at[0]!.x} y={art.output.node.at[0]!.y}>.output/</text>
					<text class="name" x={art.output.node.at[1]!.x} y={art.output.node.at[1]!.y}>server/</text>
					<g
						class="out"
						tabindex={preset === 'node' ? '0' : '-1'}
						aria-label={'index.mjs: ' + HINTS['node-server']}
						onPointerenter={() => show('node-server')}
						onPointerleave={() => show('')}
						onFocus={() => show('node-server')}
						onBlur={() => show('')}
					>
						<rect class="hit" x={art.output.node.rowBoxes[2]!.x} y={art.output.node.rowBoxes[2]!.y} width={art.output.node.rowBoxes[2]!.w} height={art.output.node.rowBoxes[2]!.h} rx="5" />
						<text class="name" x={art.output.node.at[2]!.x} y={art.output.node.at[2]!.y}>index.mjs</text>
					</g>
					<text class="name" x={art.output.node.at[3]!.x} y={art.output.node.at[3]!.y}>public/</text>
					<g
						class="out"
						tabindex={preset === 'node' ? '0' : '-1'}
						aria-label={'build/: ' + HINTS['node-build']}
						onPointerenter={() => show('node-build')}
						onPointerleave={() => show('')}
						onFocus={() => show('node-build')}
						onBlur={() => show('')}
					>
						<rect class="hit" x={art.output.node.rowBoxes[4]!.x} y={art.output.node.rowBoxes[4]!.y} width={art.output.node.rowBoxes[4]!.w} height={art.output.node.rowBoxes[4]!.h} rx="5" />
						<text class="name" x={art.output.node.at[4]!.x} y={art.output.node.at[4]!.y}>build/</text>
					</g>
				</g>
				<g class="tree tree-vercel">
					<path class="ink" d={art.output.vercel.icons} />
					<path class="ink faint-ink" d={art.output.vercel.guides} />
					<text class="name" x={art.output.vercel.at[0]!.x} y={art.output.vercel.at[0]!.y}>.vercel/output/</text>
					<text class="name" x={art.output.vercel.at[1]!.x} y={art.output.vercel.at[1]!.y}>functions/</text>
					<g
						class="out"
						tabindex={preset === 'vercel' ? '0' : '-1'}
						aria-label={'__server.func/: ' + HINTS['vercel-func']}
						onPointerenter={() => show('vercel-func')}
						onPointerleave={() => show('')}
						onFocus={() => show('vercel-func')}
						onBlur={() => show('')}
					>
						<rect class="hit" x={art.output.vercel.rowBoxes[2]!.x} y={art.output.vercel.rowBoxes[2]!.y} width={art.output.vercel.rowBoxes[2]!.w} height={art.output.vercel.rowBoxes[2]!.h} rx="5" />
						<text class="name" x={art.output.vercel.at[2]!.x} y={art.output.vercel.at[2]!.y}>__server.func/</text>
					</g>
					<g
						class="out"
						tabindex={preset === 'vercel' ? '0' : '-1'}
						aria-label={'static/: ' + HINTS['vercel-static']}
						onPointerenter={() => show('vercel-static')}
						onPointerleave={() => show('')}
						onFocus={() => show('vercel-static')}
						onBlur={() => show('')}
					>
						<rect class="hit" x={art.output.vercel.rowBoxes[3]!.x} y={art.output.vercel.rowBoxes[3]!.y} width={art.output.vercel.rowBoxes[3]!.w} height={art.output.vercel.rowBoxes[3]!.h} rx="5" />
						<text class="name" x={art.output.vercel.at[3]!.x} y={art.output.vercel.at[3]!.y}>static/</text>
					</g>
					<g
						class="out"
						tabindex={preset === 'vercel' ? '0' : '-1'}
						aria-label={'config.json: ' + HINTS['vercel-config']}
						onPointerenter={() => show('vercel-config')}
						onPointerleave={() => show('')}
						onFocus={() => show('vercel-config')}
						onBlur={() => show('')}
					>
						<rect class="hit" x={art.output.vercel.rowBoxes[4]!.x} y={art.output.vercel.rowBoxes[4]!.y} width={art.output.vercel.rowBoxes[4]!.w} height={art.output.vercel.rowBoxes[4]!.h} rx="5" />
						<text class="name" x={art.output.vercel.at[4]!.x} y={art.output.vercel.at[4]!.y}>config.json</text>
					</g>
				</g>
				<g class="tree tree-cloudflare">
					<path class="ink" d={art.output.cloudflare.icons} />
					<path class="ink faint-ink" d={art.output.cloudflare.guides} />
					<text class="name" x={art.output.cloudflare.at[0]!.x} y={art.output.cloudflare.at[0]!.y}>.output/</text>
					<text class="name" x={art.output.cloudflare.at[1]!.x} y={art.output.cloudflare.at[1]!.y}>server/</text>
					<g
						class="out"
						tabindex={preset === 'cloudflare' ? '0' : '-1'}
						aria-label={'index.mjs: ' + HINTS['cf-worker']}
						onPointerenter={() => show('cf-worker')}
						onPointerleave={() => show('')}
						onFocus={() => show('cf-worker')}
						onBlur={() => show('')}
					>
						<rect class="hit" x={art.output.cloudflare.rowBoxes[2]!.x} y={art.output.cloudflare.rowBoxes[2]!.y} width={art.output.cloudflare.rowBoxes[2]!.w} height={art.output.cloudflare.rowBoxes[2]!.h} rx="5" />
						<text class="name" x={art.output.cloudflare.at[2]!.x} y={art.output.cloudflare.at[2]!.y}>index.mjs</text>
					</g>
					<g
						class="out"
						tabindex={preset === 'cloudflare' ? '0' : '-1'}
						aria-label={'wrangler.json: ' + HINTS['cf-wrangler']}
						onPointerenter={() => show('cf-wrangler')}
						onPointerleave={() => show('')}
						onFocus={() => show('cf-wrangler')}
						onBlur={() => show('')}
					>
						<rect class="hit" x={art.output.cloudflare.rowBoxes[3]!.x} y={art.output.cloudflare.rowBoxes[3]!.y} width={art.output.cloudflare.rowBoxes[3]!.w} height={art.output.cloudflare.rowBoxes[3]!.h} rx="5" />
						<text class="name" x={art.output.cloudflare.at[3]!.x} y={art.output.cloudflare.at[3]!.y}>wrangler.json</text>
					</g>
					<g
						class="out"
						tabindex={preset === 'cloudflare' ? '0' : '-1'}
						aria-label={'public/: ' + HINTS['cf-public']}
						onPointerenter={() => show('cf-public')}
						onPointerleave={() => show('')}
						onFocus={() => show('cf-public')}
						onBlur={() => show('')}
					>
						<rect class="hit" x={art.output.cloudflare.rowBoxes[4]!.x} y={art.output.cloudflare.rowBoxes[4]!.y} width={art.output.cloudflare.rowBoxes[4]!.w} height={art.output.cloudflare.rowBoxes[4]!.h} rx="5" />
						<text class="name" x={art.output.cloudflare.at[4]!.x} y={art.output.cloudflare.at[4]!.y}>public/</text>
					</g>
					<g
						class="out"
						tabindex={preset === 'cloudflare' ? '0' : '-1'}
						aria-label={'_headers: ' + HINTS['cf-headers']}
						onPointerenter={() => show('cf-headers')}
						onPointerleave={() => show('')}
						onFocus={() => show('cf-headers')}
						onBlur={() => show('')}
					>
						<rect class="hit" x={art.output.cloudflare.rowBoxes[5]!.x} y={art.output.cloudflare.rowBoxes[5]!.y} width={art.output.cloudflare.rowBoxes[5]!.w} height={art.output.cloudflare.rowBoxes[5]!.h} rx="5" />
						<text class="name" x={art.output.cloudflare.at[5]!.x} y={art.output.cloudflare.at[5]!.y}>_headers</text>
					</g>
				</g>
			</g>
			<g class="card source-card">
				<path class="hatch light desk" d={art.source.card.shadow} />
				<path class="paper" d={art.source.card.paper} />
				<path class="hatch faint" d={art.source.card.barTone} />
				<path class="ink" d={art.source.card.ink} />
				<g class="lock">
					<path class="paper" d={art.source.lock.paper} />
					<path class="hatch" d={art.source.lock.shade} />
					<path class="ink" d={art.source.lock.ink} />
				</g>
				<path class="ink" d={art.source.tree.icons} />
				<path class="ink faint-ink" d={art.source.tree.guides} />
				<text class="name" x={art.source.tree.at[0]!.x} y={art.source.tree.at[0]!.y}>my-app/</text>
				<text class="name" x={art.source.tree.at[1]!.x} y={art.source.tree.at[1]!.y}>pages/</text>
				<g
					class="src"
					tabindex="0"
					role="button"
					aria-label="index.tsrx. Drag it into the output."
					data-dragging={dragging === 'index' ? '' : undefined}
					style={dragging === 'index' ? 'transform: translate(' + dragX + 'px, ' + dragY + 'px)' : undefined}
					onPointerdown={(event) => grab(event, 'index')}
					onPointermove={(event) => drag(event)}
					onPointerup={(event) => drop(event, art.source.tree.at[2]!.x)}
					onPointercancel={(event) => drop(event, -999)}
					onKeyDown={(event) => {
						if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowRight') {
							event.preventDefault();
							tryMove();
						}
					}}
				>
					<rect class="hit" x={art.source.tree.rowBoxes[2]!.x} y={art.source.tree.rowBoxes[2]!.y} width={art.source.tree.rowBoxes[2]!.w} height={art.source.tree.rowBoxes[2]!.h} rx="5" />
					<text class="name" x={art.source.tree.at[2]!.x} y={art.source.tree.at[2]!.y}>index.tsrx</text>
				</g>
				<g
					class="src"
					tabindex="0"
					role="button"
					aria-label="about.tsrx. Drag it into the output."
					data-dragging={dragging === 'about' ? '' : undefined}
					style={dragging === 'about' ? 'transform: translate(' + dragX + 'px, ' + dragY + 'px)' : undefined}
					onPointerdown={(event) => grab(event, 'about')}
					onPointermove={(event) => drag(event)}
					onPointerup={(event) => drop(event, art.source.tree.at[3]!.x)}
					onPointercancel={(event) => drop(event, -999)}
					onKeyDown={(event) => {
						if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowRight') {
							event.preventDefault();
							tryMove();
						}
					}}
				>
					<rect class="hit" x={art.source.tree.rowBoxes[3]!.x} y={art.source.tree.rowBoxes[3]!.y} width={art.source.tree.rowBoxes[3]!.w} height={art.source.tree.rowBoxes[3]!.h} rx="5" />
					<text class="name" x={art.source.tree.at[3]!.x} y={art.source.tree.at[3]!.y}>about.tsrx</text>
				</g>
				<g
					class="src"
					tabindex="0"
					role="button"
					aria-label="document.tsrx. Drag it into the output."
					data-dragging={dragging === 'document' ? '' : undefined}
					style={dragging === 'document' ? 'transform: translate(' + dragX + 'px, ' + dragY + 'px)' : undefined}
					onPointerdown={(event) => grab(event, 'document')}
					onPointermove={(event) => drag(event)}
					onPointerup={(event) => drop(event, art.source.tree.at[4]!.x)}
					onPointercancel={(event) => drop(event, -999)}
					onKeyDown={(event) => {
						if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowRight') {
							event.preventDefault();
							tryMove();
						}
					}}
				>
					<rect class="hit" x={art.source.tree.rowBoxes[4]!.x} y={art.source.tree.rowBoxes[4]!.y} width={art.source.tree.rowBoxes[4]!.w} height={art.source.tree.rowBoxes[4]!.h} rx="5" />
					<text class="name" x={art.source.tree.at[4]!.x} y={art.source.tree.at[4]!.y}>document.tsrx</text>
				</g>
				<g
					class="src"
					tabindex="0"
					role="button"
					aria-label="vite.config.ts. Drag it into the output."
					data-dragging={dragging === 'vite' ? '' : undefined}
					style={dragging === 'vite' ? 'transform: translate(' + dragX + 'px, ' + dragY + 'px)' : undefined}
					onPointerdown={(event) => grab(event, 'vite')}
					onPointermove={(event) => drag(event)}
					onPointerup={(event) => drop(event, art.source.tree.at[5]!.x)}
					onPointercancel={(event) => drop(event, -999)}
					onKeyDown={(event) => {
						if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowRight') {
							event.preventDefault();
							tryMove();
						}
					}}
				>
					<rect class="hit" x={art.source.tree.rowBoxes[5]!.x} y={art.source.tree.rowBoxes[5]!.y} width={art.source.tree.rowBoxes[5]!.w} height={art.source.tree.rowBoxes[5]!.h} rx="5" />
					<text class="name" x={art.source.tree.at[5]!.x} y={art.source.tree.at[5]!.y}>vite.config.ts</text>
				</g>
			</g>
			<text class="caption" x={art.output.caption.x} y={art.output.caption.y}>{hint === '' ? '' : HINTS[hint]}</text>
		</svg>
		<figcaption class="sr">
			Three inked cards on a desk. On the left, your app's source: a my-app folder with pages, index.tsrx, about.tsrx, document.tsrx and
			vite.config.ts, with a small padlock. In the middle, a terminal running npm run build, with three keys above it: Node, Vercel and
			Cloudflare. On the right, the folder the build wrote. Press a key, or use the arrow keys on it, and the terminal runs again and the
			output folder redraws: .output with server/index.mjs and public/build for Node; .vercel/output with functions/__server.func, static
			and config.json for Vercel; .output with server/index.mjs, server/wrangler.json, public and public/_headers for Cloudflare. The
			source never changes. Hover or focus an output file to see what the host does with it. Drag a source file into the output and it
			slides back.
		</figcaption>
		<p class="sr" aria-live="polite">{said}</p>
		<style>
			.anatomy {
				margin: var(--space-m) 0;
			}

			.scene {
				display: block;
				width: 100%;
				height: auto;
				overflow: visible;
				touch-action: pan-y;
				user-select: none;
				-webkit-user-select: none;
				--sheet: color-mix(in oklch, var(--paper) 50%, white);
				--screen: color-mix(in oklch, var(--ink) 90%, oklch(40% 0.03 250));
				--screen-text: color-mix(in oklch, var(--paper) 88%, white);
				--line: var(--ink);

				html.dark & {
					--sheet: color-mix(in oklch, var(--ink) 94%, var(--yellow));
					--screen: color-mix(in oklch, black 70%, oklch(35% 0.03 250));
					--screen-text: var(--ink);
					--line: var(--paper);
				}
			}

			.paper {
				fill: var(--sheet);
			}

			.ink {
				fill: var(--line);
			}

			.desk {
				stroke: var(--ink);
			}

			.desk-ink {
				fill: var(--ink);
			}

			.faint-ink {
				opacity: 0.45;
			}

			.hatch {
				fill: none;
				stroke: var(--line);
				stroke-width: 0.75;
				stroke-linecap: round;
			}

			.light {
				opacity: 0.45;
			}

			.faint {
				opacity: 0.3;
			}

			.screen {
				fill: var(--screen);
			}

			.wash {
				mix-blend-mode: multiply;
			}

			.pink {
				fill: var(--pink);
				opacity: 0;
				transition: opacity 160ms ease;
			}

			.scene[data-preset='node'] .key-node .pink,
			.scene[data-preset='vercel'] .key-vercel .pink,
			.scene[data-preset='cloudflare'] .key-cloudflare .pink {
				opacity: 0.75;
			}

			.name,
			.key-label,
			.caption,
			.term {
				font-family: 'Shantell Sans', system-ui, sans-serif;
				fill: var(--line);
			}

			.name {
				font-size: 12px;
				font-weight: 600;
			}

			.key-label {
				font-size: 12px;
				font-weight: 700;
				text-anchor: middle;
			}

			.caption {
				font-size: 13px;
				font-weight: 700;
				font-style: italic;
				text-anchor: middle;
				fill: var(--ink);
			}

			.term {
				font-size: 10.5px;
				font-weight: 600;
				fill: var(--screen-text);
			}

			.log {
				fill: var(--screen-text);
				opacity: 0.85;
			}

			.tick {
				fill: oklch(78% 0.14 145);
			}

			.hit {
				fill: transparent;
				stroke: none;
				transition: fill 140ms ease;
			}

			.src,
			.out,
			.key {
				outline: none;
			}

			.src {
				cursor: grab;
			}

			.src:not([data-dragging]) {
				transition: transform 260ms cubic-bezier(0.3, 1.5, 0.5, 1);
			}

			.src[data-dragging] {
				cursor: grabbing;
			}

			.src:hover .hit,
			.src:focus-visible .hit,
			.out:hover .hit,
			.out:focus-visible .hit {
				fill: color-mix(in oklch, var(--yellow) 45%, transparent);
			}

			.src:focus-visible .hit,
			.out:focus-visible .hit,
			.key:focus-visible .key-face .paper {
				stroke: var(--line);
				stroke-width: 1.2;
				stroke-dasharray: 4 3;
			}

			.key {
				cursor: pointer;
			}

			.key-side {
				fill: var(--line);
			}

			.key-face {
				transition: transform 140ms ease;
			}

			.key:hover .key-face {
				transform: translateY(-2px);
			}

			.key:active .key-face,
			.key[aria-pressed='true'] .key-face {
				transform: translate(1px, 3px);
			}

			.lock {
				transform-box: fill-box;
				transform-origin: 50% 0%;
			}

			.tree {
				opacity: 0;
				pointer-events: none;
			}

			.scene[data-preset='node'] .tree-node,
			.scene[data-preset='vercel'] .tree-vercel,
			.scene[data-preset='cloudflare'] .tree-cloudflare {
				opacity: 1;
				pointer-events: auto;
			}

			.preset-text {
				opacity: 0;
			}

			.scene[data-preset='node'] .preset-text.node,
			.scene[data-preset='vercel'] .preset-text.vercel,
			.scene[data-preset='cloudflare'] .preset-text.cloudflare {
				opacity: 1;
			}

			.scene[data-beat='odd'] {
				--ink-in: ink-in-a;
				--draw: draw-a;
			}

			.scene[data-beat='even'] {
				--ink-in: ink-in-b;
				--draw: draw-b;
			}

			.scene:not([data-beat='rest']) .log {
				animation: var(--ink-in) 220ms ease-out both;
			}

			.scene:not([data-beat='rest']) .l1 {
				animation-delay: 140ms;
			}

			.scene:not([data-beat='rest']) .l2 {
				animation-delay: 280ms;
			}

			.scene:not([data-beat='rest']) .l3 {
				animation-delay: 420ms;
			}

			.scene:not([data-beat='rest']) .tick {
				animation-delay: 620ms;
			}

			.scene[data-preset='node']:not([data-beat='rest']) .tree-node,
			.scene[data-preset='vercel']:not([data-beat='rest']) .tree-vercel,
			.scene[data-preset='cloudflare']:not([data-beat='rest']) .tree-cloudflare {
				animation: var(--draw) 380ms 760ms ease-out both;
			}

			.scene[data-refuse='odd'] .output-card,
			.scene[data-refuse='odd'] .lock {
				animation: shake-a 460ms ease-out;
			}

			.scene[data-refuse='even'] .output-card,
			.scene[data-refuse='even'] .lock {
				animation: shake-b 460ms ease-out;
			}

			@keyframes ink-in-a {
				from {
					opacity: 0;
				}
				to {
					opacity: 0.85;
				}
			}

			@keyframes ink-in-b {
				from {
					opacity: 0;
				}
				to {
					opacity: 0.85;
				}
			}

			@keyframes draw-a {
				from {
					opacity: 0;
					transform: translateY(6px);
				}
				to {
					opacity: 1;
					transform: none;
				}
			}

			@keyframes draw-b {
				from {
					opacity: 0;
					transform: translateY(6px);
				}
				to {
					opacity: 1;
					transform: none;
				}
			}

			@keyframes shake-a {
				20% {
					transform: translateX(-5px) rotate(-0.6deg);
				}
				45% {
					transform: translateX(4px) rotate(0.4deg);
				}
				70% {
					transform: translateX(-2px);
				}
			}

			@keyframes shake-b {
				20% {
					transform: translateX(-5px) rotate(-0.6deg);
				}
				45% {
					transform: translateX(4px) rotate(0.4deg);
				}
				70% {
					transform: translateX(-2px);
				}
			}

			@media (prefers-reduced-motion: reduce) {
				.scene *,
				.scene .src {
					animation: none !important;
					transition: none !important;
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
