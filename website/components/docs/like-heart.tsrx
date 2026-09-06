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
