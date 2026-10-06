import { storage } from '@markless/core';

// The page imports this file directly: storage seeds reach only components the page imports itself.
export default function DrinkPick() @{
	// oxlint-disable-next-line no-unused-vars -- the write persists the choice
	let drink = storage('docs-drink', 'tea');

	<section class="playground">
		<style>
			section {
				flex-direction: row;
				flex-wrap: wrap;
			}

			.tea {
				html[data-docs-drink='tea'] & {
					background: var(--yellow);
				}
			}

			.coffee {
				html[data-docs-drink='coffee'] & {
					background: var(--yellow);
				}
			}

			.cocoa {
				html[data-docs-drink='cocoa'] & {
					background: var(--yellow);
				}
			}
		</style>
		<button class="tea" onClick={() => (drink = 'tea')}>Tea</button>
		<button class="coffee" onClick={() => (drink = 'coffee')}>Coffee</button>
		<button class="cocoa" onClick={() => (drink = 'cocoa')}>Cocoa</button>
	</section>
}
