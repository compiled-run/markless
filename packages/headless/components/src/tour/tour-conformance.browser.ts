import { renderSSRIslands } from '@markless/vitest-browser';
import { runMultiEmbedConformance } from '../../test-support/multi-embed-conformance.ts';
import MultiEmbed from './scenarios/multi-embed.tsrx';

// The island mount is written out here rather than inside the shared battery:
// the SSR island lever is a string-level transform that resolves each component
// identifier against THIS file's own import statements.
runMultiEmbedConformance({
	family: 'tour',
	render: () => renderSSRIslands([MultiEmbed, MultiEmbed]),
	embedFrame: 'frame',
	// Only the root's cell: `tourItemState` is one widget per card, so it is
	// plural per embed by design and cannot answer a one-per-embed count.
	widgetDefinitionSuffixes: ['#tourState'],
	interaction: {
		activate: 'save-forward',
		observe: 'step-share',
		stateAttribute: 'ui-current',
		restValue: null,
		activeValue: '',
	},
	rovingKey: '{ArrowRight}',
	// The card that is showing: a merged `tour.itemEls` roster is what would send
	// this step into the next embed's card instead of this embed's.
	rovingFrom: 'step-save',
	// No disabled entry: `disabled` is a root prop that freezes the whole walk,
	// so expressing it takes a second tour widget per embed rather than a locked
	// item inside this one.
	//
	// The step DOES move in the embed that was clicked, and only there — what
	// never lands is the card's own `ui-current`. A card derives it from
	// `tour.itemEls.indexOf(mine)`, and at resume that member lookup asks the
	// handle registry under a key built from the host path. Both spellings of
	// that path drop the island segment the serializer's own grammar carries
	// (`/^(?:[cpm]\d+:|r:[^:]*:)+/`): the registering half in
	// packages/web/src/resume-locators.ts files a component-local handle under
	// `HOST_SCOPE = /r:[^:]*:|c\d+:/g`, and the reading half in
	// packages/web/src/fns/roster-resume.ts asks under
	// `INSTANCE_SEGMENT = /r:[^:]*:|[cp]\d+:/g`. With one island `c2:c0:element:mine`
	// names one card; with two it names both islands' first card, the registry
	// refuses an ambiguous key, and indexOf reads -1, so no card is current.
	// Adding `m` to both character classes is the candidate fix; neither file is
	// in this unit's contract. One island of this same scenario advances and
	// shows the incoming card, so this is island scoping, not the family.
	exemptions: [
		{
			check: 'interaction-isolation',
			reason: 'island segment dropped from the resume handle key (resume-locators/roster-resume)',
		},
	],
});
