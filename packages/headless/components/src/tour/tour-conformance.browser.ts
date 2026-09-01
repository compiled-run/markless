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
	// The step moves in the clicked embed and only there; what never lands is the
	// card's `ui-current`. A card derives it from `tour.itemEls.indexOf(mine)`,
	// which at resume is answered by the roster reader in
	// packages/web/src/fns/roster-resume.ts — and that module is reached through
	// the `globalThis.__marklessRosterResume` loader the bundler writes into a
	// page's own resume module. The composed island resume module this battery
	// mounts never emits that line, so no reader is built and the card keeps its
	// rendered place forever. Witnessed directly: the reader's body never runs on
	// a two-island page. One island of this same scenario advances and shows the
	// incoming card, so this is the composed page's resume module, not the family.
	exemptions: [
		{
			check: 'interaction-isolation',
			reason: 'composed island resume module emits no roster loader, so no card re-derives its place',
		},
	],
});
