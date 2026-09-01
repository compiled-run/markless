import { renderSSRIslands } from '@markless/vitest-browser';
import { runMultiEmbedConformance } from '../../test-support/multi-embed-conformance.ts';
import MultiEmbed from './scenarios/multi-embed.tsrx';

// The island mount is written out here rather than inside the shared battery:
// the SSR island lever is a string-level transform that resolves each component
// identifier against THIS file's own import statements.
//
// Toaster is the page-scope family. Every other family wired to this battery
// keeps its embeds apart; this one is supposed to join them, because a message
// raised by a component that never renders a region still has to arrive. So the
// load-bearing check here is (e), not (b).
runMultiEmbedConformance({
	family: 'toaster',
	render: () => renderSSRIslands([MultiEmbed, MultiEmbed]),
	embedFrame: 'frame',
	// The rows, not the region: `toasterState` is page-scoped and so spells one
	// id for the whole page by design, while `toasterItemState` is a widget per
	// row and is the one thing here the island discriminator must keep apart.
	widgetDefinitionSuffixes: ['#toasterItemState'],
	// Clicking a region focuses it, and focus stops the clocks — WCAG 2.2.2.
	interaction: {
		activate: 'region',
		stateAttribute: 'ui-paused',
		restValue: null,
		activeValue: '',
	},
	// Check (e) is the assertion this family exists to make. `queue` and `paused`
	// are two fields of ONE state() object, so the single cell it pins is both
	// the shared queue and the shared pause flag: prove the cell is singular and
	// both facts are singular with it.
	pageScoped: {
		render: () => renderSSRIslands([MultiEmbed, MultiEmbed]),
		cellIdIncludes: '#toasterState',
		value: 'count',
		bump: 'save',
		afterBump: '1',
	},
	// No roving key: rows are not a walk, and the region hotkey is a page-level
	// jump rather than a per-embed roster.
	// No disabled entry: this family ships no disabled concept — a message is
	// raised or it is not.
	exemptions: [
		{
			check: 'interaction-isolation',
			// Not a defect and not a gap waiting on a fix: pausing is page-wide on
			// purpose, so tabbing into either region has to stop the other region's
			// clocks too. A person reading a toast in one region must not have a
			// toast in the other one time out while they read. This check asks for
			// the opposite of the behaviour, so it is expected to fail forever; if
			// it ever passes, the pause flag has been split and WCAG 2.2.2 is
			// broken.
			reason: 'pause is page-wide by design, so both regions hold together',
		},
	],
});
