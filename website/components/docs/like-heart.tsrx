// The like heart that sits under the "On this page" rail. Clicking it pops the
// heart, throws four doodles out of it, floats a "+1" past the count and adds
// one to the count.
//
// Three things about the shape of this file are forced by what 0.3.1 can do.
//
// The count is a plain `state()`, so it starts at zero on every visit. It wants
// to be `storage('likes-<page>', 0)`, but a second `storage()` binding on a page
// repaints and never persists (NOTES.md finding 30) and the theme toggle already
// holds the first one on every page of this site. Switching it over is the one
// line marked below, the day that is fixed.
//
// The count is read straight into a text binding, which is the update shape the
// resume payload performs on its own (NOTES.md finding 31).
//
// Nothing here toggles a class, and no component is nested inside
// this island, because the island has to resume and the seams around nested
// components are where findings 29 and 31 live. So the animation is driven from
// `:active` in styles/global.css: the pieces snap into the middle of the heart
// under the press and animate outward on release, which is a burst without a
// class the framework has to write.
import { state } from '@markless/core';

export default function LikeHeart() @{
	// Swap for `storage()` when finding 30 is fixed; nothing else has to change.
	let likes = state(0);

	<div class="like-heart">
		<style>
			/* Pressed-state transitions, not keyframes on a toggled class: the press snaps each piece onto the heart, release lets it travel out and fade. */
			.like-heart {
				display: flex;
				justify-content: center;
				margin-top: var(--space-l);
			}

			@media (min-width: 70.01rem) {
				/* Beside the rail rather than in it: the rail is static HTML the build writes
				   into the page, and an island cannot be rendered inside it. Fixed to the
				   same column, at the foot of the strip the shell reserves for it. */
				.like-heart {
					position: fixed;
					right: var(--space-s-l);
					width: 11rem;
					justify-content: flex-start;
					margin: 0;
					top: calc(var(--header-height) + var(--space-s) + 21rem);
				}
			}

			@media (min-width: 70.01rem) {
				@supports (position-anchor: --on-this-page) {
					.like-heart {
						position-anchor: --on-this-page;
						top: calc(anchor(bottom) + var(--space-s));
						left: anchor(left);
						right: auto;
					}
				}
			}

			.like-heart-button {
				position: relative;
				display: inline-flex;
				align-items: center;
				gap: 0.15rem;
				padding: 0.25rem 0.4rem;
				border: 0;
				background: none;
				font: inherit;
				color: var(--ink);
				cursor: pointer;
			}

			.like-heart-face {
				position: relative;
				display: inline-flex;
				flex: none;
			}

			.like-heart-image {
				display: block;
				width: 3.2rem;
				height: auto;
				rotate: -5deg;
				transition:
				scale 600ms cubic-bezier(0.2, 1.7, 0.45, 1),
				rotate 600ms cubic-bezier(0.2, 1.7, 0.45, 1);
			}

			.like-heart-button:hover .like-heart-image {
				scale: 1.07;
			}

			.like-heart-button:active .like-heart-image {
				scale: 0.82;
				rotate: 7deg;
				transition-duration: 0s;
			}

			.like-burst {
				position: absolute;
				inset: 0;
				pointer-events: none;
			}

			.like-burst-piece {
				position: absolute;
				left: 50%;
				top: 50%;
				width: 1.35rem;
				height: 1.35rem;
				margin: -0.675rem 0 0 -0.675rem;
				opacity: 0;
				transition:
				translate 620ms cubic-bezier(0.15, 0.85, 0.3, 1),
				rotate 620ms ease-out,
				scale 620ms ease-out,
				opacity 620ms ease-out;
			}

			.like-burst-piece-1 {
				translate: -2.1rem -1.9rem;
				rotate: -22deg;
			}

			.like-burst-piece-2 {
				translate: 2rem -2.1rem;
				rotate: 18deg;
			}

			.like-burst-piece-3 {
				translate: -2.3rem 1.2rem;
				rotate: -12deg;
			}

			.like-burst-piece-4 {
				translate: 2.2rem 1.3rem;
				rotate: 24deg;
			}

			.like-heart-button:active .like-burst-piece {
				opacity: 1;
				translate: 0 0;
				rotate: 0deg;
				scale: 0.4;
				transition-duration: 0s;
			}

			/* The accents are pastels meant to be printed on, not printed with, so the
			   count is the page's ink pulled towards pink rather than the pink itself. */
			.like-heart-count {
				font-size: var(--step-0);
				color: color-mix(in oklch, var(--pink) 55%, var(--ink));
				font-variant-numeric: tabular-nums;
			}

			.like-heart-plus {
				position: absolute;
				right: -0.35rem;
				top: 0.1rem;
				font-size: var(--step--2);
				color: color-mix(in oklch, var(--pink) 55%, var(--ink));
				opacity: 0;
				translate: 0 -1.2rem;
				transition:
				translate 700ms ease-out,
				opacity 700ms ease-out;
				pointer-events: none;
			}

			.like-heart-button:active .like-heart-plus {
				opacity: 1;
				translate: 0 0;
				transition-duration: 0s;
			}

			.like-burst-piece img {
				width: 100%;
				height: 100%;
				object-fit: contain;
			}
		</style>
		<button
			class="like-heart-button"
			type="button"
			aria-label="Like this page"
			title="Like this page"
			onClick={() => {
				likes++;
			}}
		>
			<span class="like-heart-face">
				<img
					class="like-heart-image"
					src="/markless/stickers/heart.png"
					alt=""
					aria-hidden="true"
					decoding="async"
				/>
				<span class="like-burst" aria-hidden="true">
					<span class="like-burst-piece like-burst-piece-1">
						<img class="sprite-ink sprite-ink-light" src="/markless/sprites/sparkle.png" alt="" />
						<img class="sprite-ink sprite-ink-dark" src="/markless/sprites/sparkle.dark.png" alt="" />
					</span>
					<span class="like-burst-piece like-burst-piece-2">
						<img class="sprite-ink sprite-ink-light" src="/markless/sprites/star-badge.png" alt="" />
						<img class="sprite-ink sprite-ink-dark" src="/markless/sprites/star-badge.dark.png" alt="" />
					</span>
					<span class="like-burst-piece like-burst-piece-3">
						<img class="sprite-ink sprite-ink-light" src="/markless/sprites/plus.png" alt="" />
						<img class="sprite-ink sprite-ink-dark" src="/markless/sprites/plus.dark.png" alt="" />
					</span>
					<span class="like-burst-piece like-burst-piece-4">
						<img class="sprite-ink sprite-ink-light" src="/markless/sprites/dots.png" alt="" />
						<img class="sprite-ink sprite-ink-dark" src="/markless/sprites/dots.dark.png" alt="" />
					</span>
				</span>
			</span>
			<span class="like-heart-count">{likes}</span>
			<span class="like-heart-plus" aria-hidden="true">+1</span>
		</button>
	</div>
}
