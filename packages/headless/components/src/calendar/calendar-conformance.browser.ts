import { renderCsrIslands, renderSSRIslands } from '@markless/vitest-browser';
import { runMultiEmbedConformance } from '../../test-support/multi-embed-conformance.ts';
import MultiEmbed from './scenarios/multi-embed.tsrx';

// The island mounts are written out here rather than inside the shared battery:
// the SSR island lever is a string-level transform that resolves each component
// identifier against THIS file's own import statements.
runMultiEmbedConformance({
	family: 'calendar',
	render: () => renderSSRIslands([MultiEmbed, MultiEmbed]),
	renderCsr: () => renderCsrIslands([MultiEmbed, MultiEmbed]),
	embedFrame: 'frame',
	widgetDefinitionSuffixes: ['#calendarState'],
	interaction: {
		activate: 'day-2026-08-10',
		stateAttribute: 'aria-pressed',
		restValue: 'false',
		activeValue: 'true',
	},
	// The grid walk lands focus through the family's plural day handle. The last
	// day in the grid is where a merged roster walks into the next embed.
	rovingKey: '{ArrowRight}',
	rovingFrom: 'day-2026-08-14',
	// No disabled: the family's only locked day is an `aria-disabled` button, and
	// Playwright refuses to click one — or anything inside one, so the `observe`
	// split does not reach it either.
});
