import { computed } from '@markless/core';
import { toaster } from '@markless/ui';

export default function ToasterBasic() @{
	const message = 'Draft saved';
	const tone = 'success';
	const toasts = toaster.state();
	const none: toaster.ToastRecord = {
		id: 'save',
		title: '',
		description: '',
		tone: 'neutral',
		icon: '',
		dueAt: 0,
		remaining: 0,
	};
	const front = computed(() => toasts.queue[0] ?? none);
	const quiet = computed(() => toasts.queue.length === 0);

	<div class="desk">
		<button
			class="save"
			type="button"
			onClick={() => {
				toasts.queue = toaster.say(toasts.queue, message, {
					id: 'save',
					tone,
					description: 'You can close this tab.',
				});
			}}
		>Save draft</button>
		<toaster.root class="stack">
			<toaster.item class="toast" toast={front} hidden={quiet}>
				<toaster.itemicon class="toast-icon" />
				<div class="toast-text">
					<toaster.itemtitle class="toast-title" />
					<toaster.itemdescription class="toast-note" />
				</div>
				<toaster.itemclose class="toast-close" aria-label="Dismiss">×</toaster.itemclose>
			</toaster.item>
		</toaster.root>

		<style>
			.desk {
				display: grid;
				gap: 1.4em;
				justify-items: center;
				width: min(24rem, 100%);
				font-family: 'Shantell Sans', system-ui, sans-serif;
				font-size: var(--step--1);
				line-height: 1.5;
				color: var(--ink);
			}

			.save {
				padding: 0.6em 1.1em;
				border: 1px solid var(--ink);
				border-radius: 6px;
				background: var(--paper);
				color: var(--ink);
				font: inherit;
				font-family: 'Shantell Sans', system-ui, sans-serif;
				cursor: pointer;
			}

			.save:hover {
				background: color-mix(in srgb, var(--purple) 16%, var(--paper));
			}

			.save:active {
				background: color-mix(in srgb, var(--purple) 26%, var(--paper));
			}

			.save:focus-visible,
			.toast-close:focus-visible {
				outline: 2px solid var(--ink);
				outline-offset: 2px;
			}

			.stack {
				display: grid;
				align-content: start;
				width: 100%;
				min-height: 5em;
			}

			.toast {
				--wash: var(--purple);
				display: flex;
				gap: 0.75em;
				align-items: flex-start;
				padding: 0.85em 1em;
				border: 1px solid var(--ink);
				border-radius: 6px;
				background: color-mix(in srgb, var(--wash) 30%, var(--paper));
				animation: arrive 140ms ease-out;
			}

			.toast[hidden] {
				display: none;
			}

			@keyframes arrive {
				from {
					opacity: 0;
					translate: 0 0.4em;
				}
			}

			.toast[ui-tone='success'] {
				--wash: var(--switch-on);
			}

			.toast[ui-tone='warning'] {
				--wash: var(--yellow);
			}

			.toast[ui-tone='error'] {
				--wash: var(--pink);
			}

			.toast-icon {
				display: grid;
				flex: none;
				place-items: center;
				width: 1.5em;
				height: 1.5em;
				border: 1px solid var(--ink);
				border-radius: 999px;
				background: var(--paper);
				line-height: 1;
			}

			.toast-text {
				flex: 1;
			}

			.toast-note {
				opacity: 0.8;
			}

			.toast-close {
				flex: none;
				width: 1.6em;
				height: 1.6em;
				padding: 0;
				border: 1px solid transparent;
				border-radius: 6px;
				background: transparent;
				color: var(--ink);
				font: inherit;
				line-height: 1;
				cursor: pointer;
			}

			.toast-close:hover {
				background: color-mix(in srgb, var(--wash) 55%, var(--paper));
			}

			@media (prefers-reduced-motion: reduce) {
				.toast {
					animation: none;
				}
			}
		</style>
	</div>;
}
