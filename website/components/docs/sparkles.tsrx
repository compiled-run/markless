import type { Children } from '@markless/core';

const SPOTS = [
	{ top: '-14%', left: '-3%', size: '1.5rem', delay: '0s', every: '5.3s' },
	{ top: '4%', left: '46%', size: '1rem', delay: '1.9s', every: '6.1s' },
	{ top: '-6%', left: '71%', size: '1.7rem', delay: '3.4s', every: '7.3s' },
	{ top: '52%', left: '64%', size: '1.1rem', delay: '0.8s', every: '4.7s' },
	{ top: '88%', left: '50%', size: '1.4rem', delay: '2.7s', every: '6.7s' },
	{ top: '84%', left: '-2%', size: '1rem', delay: '4.2s', every: '5.9s' },
];

/** Wraps a heading or phrase in sparkles that blink on and off around it, one after another. */
export default function Sparkles({ children }: { readonly children?: Children }) @{
	<div class="sparkles">
		<style>
			.sparkles {
				position: relative;
			}

			.sparkle {
				position: absolute;
				top: var(--top);
				left: var(--left);
				width: var(--size);
				height: var(--size);
				color: var(--ink);
				pointer-events: none;
				opacity: 0;
				animation: sparkle-blink var(--every) ease-in-out var(--delay) infinite;

				html.dark & {
					color: var(--yellow);
				}
			}

			@keyframes sparkle-blink {
				0%,
				24%,
				100% {
					opacity: 0;
					transform: scale(0) rotate(0deg);
				}
				12% {
					opacity: 1;
					transform: scale(1) rotate(60deg);
				}
			}

			@media (prefers-reduced-motion: reduce) {
				.sparkle {
					animation: none;
					opacity: 0.9;
				}
			}
		</style>
		@for (const spot of SPOTS; key spot.delay) {
			<svg
				class="sparkle"
				viewBox="0 0 160 160"
				aria-hidden="true"
				style={'--top:' + spot.top + ';--left:' + spot.left + ';--size:' + spot.size + ';--delay:' + spot.delay + ';--every:' + spot.every}
			>
				<path
					fill="currentColor"
					d="M80 0C80 0 84.2846 41.2925 101.496 58.504C118.707 75.7154 160 80 160 80C160 80 118.707 84.2846 101.496 101.496C84.2846 118.707 80 160 80 160C80 160 75.7154 118.707 58.504 101.496C41.2925 84.2846 0 80 0 80C0 80 41.2925 75.7154 58.504 58.504C75.7154 41.2925 80 0 80 0Z"
				/>
			</svg>
		}
		{children}
	</div>
}
