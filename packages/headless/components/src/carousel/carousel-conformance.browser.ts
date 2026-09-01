import { renderCsrIslands, renderSSRIslands } from '@markless/vitest-browser';
import { runMultiEmbedConformance } from '../../test-support/multi-embed-conformance.ts';
import MultiEmbed from './scenarios/multi-embed.tsrx';

// The island mounts are written out here rather than inside the shared battery:
// the SSR island lever is a string-level transform that resolves each component
// identifier against THIS file's own import statements.
runMultiEmbedConformance({
	family: 'carousel',
	render: () => renderSSRIslands([MultiEmbed, MultiEmbed]),
	renderCsr: () => renderCsrIslands([MultiEmbed, MultiEmbed]),
	embedFrame: 'frame',
	widgetDefinitionSuffixes: ['#carouselState'],
	interaction: {
		activate: 'oslo-navtrigger',
		stateAttribute: 'aria-selected',
		restValue: 'false',
		activeValue: 'true',
	},
	// The arrow keys on a picker land focus through the family's plural picker
	// handle. The last picker is where the step either wraps inside this embed or
	// escapes into the next one.
	rovingKey: '{ArrowRight}',
	rovingFrom: 'lima-navtrigger',
	// No disabled: the family has no disabled concept — a slide is never locked
	// and the step triggers only stop at the ends of a carousel that cannot wrap.
});
