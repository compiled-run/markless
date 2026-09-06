// The light/dark control. `storage()` is the whole mechanism: assigning to it
// writes `localStorage.theme` and stamps `data-theme` on `<html>`, which is the
// attribute every dark rule in styles/global.css already hangs off, and the seed
// script the router puts in the head applies the stored value before the first
// paint, so there is no flash.
//
// Two things about the shape of this file are forced, not chosen.
//
// `storage()` is only collected as a module-scope binding, so the declaration
// cannot live in the component body (NOTES.md finding 15).
//
// There are two buttons rather than one, and CSS shows whichever matches the
// theme the page is currently painted in. A single button would have to derive
// its label from the current value, and a derived binding does not resume
// (NOTES.md finding 18) — and a fixed "flip it" assignment cannot know what a
// reader on `system` is actually looking at, so the first click would do
// nothing for half of them. Each button assigns one constant, which is the kind
// of update the resume payload performs on its own.
//
// Each button carries the drawing of the theme it is standing in, not the one
// it switches to: the reader sees the sun while the page is light and the moon
// while it is dark, and the button's label is what says where the click goes.
// The two `<img>`s are the same swap the two buttons already are — CSS shows
// one of them — because CSS cannot swap an image `src`.
//
// The fallback is `system` rather than `light` on purpose: the seed script
// stamps the fallback when nothing is stored, and stamping `light` there would
// override `@media (prefers-color-scheme: dark)` for every reader who never
// chose. `html:not([data-theme='light'])` already treats `system` as "use the
// operating system", so the default keeps working.
import { storage } from '@markless/core';

let theme = storage('theme', 'system');

export default function ThemeToggle() @{
	<span class="theme-toggle-island">
		<button
			class="theme-toggle theme-toggle-to-dark"
			type="button"
			data-theme-toggle="dark"
			aria-label="Switch to the dark theme"
			title="Switch to the dark theme"
			onClick={() => {
				theme = 'dark';
			}}
		>
			<img
				class="theme-toggle-icon"
				src="/markless/theme/sun.png"
				alt=""
				aria-hidden="true"
				decoding="async"
			/>
		</button>
		<button
			class="theme-toggle theme-toggle-to-light"
			type="button"
			data-theme-toggle="light"
			aria-label="Switch to the light theme"
			title="Switch to the light theme"
			onClick={() => {
				theme = 'light';
			}}
		>
			<img
				class="theme-toggle-icon"
				src="/markless/theme/moon.png"
				alt=""
				aria-hidden="true"
				decoding="async"
			/>
		</button>
	</span>
}
