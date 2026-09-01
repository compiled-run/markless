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
	// Every check is exempt for one framework reason, not three family ones: the
	// render itself throws before a single assertion runs. A roster count read at
	// SSR (`ui-max`, and the two triggers' step arithmetic) is answered by the
	// roster render context, and the multi-island compose path never establishes
	// one — marklessRosterRenderContext in
	// packages/web/src/prerender/shared-seed-slot.ts returns {} with no
	// positions, so the compiled guard throws MARKLESS_SSR_ROSTER_COUNT_UNANSWERED.
	// Witnessed on the SHIPPED scenarios/basic.tsrx too, so it is not this
	// scenario: a single-component SSR render of it passes and a two-island one
	// of the same component throws. The composed pseudo-artifact is built in
	// packages/vitest-browser/src/ssr-plugin.ts (renderSsrIslandsCommand); the
	// real MDX route walks the same renderMdxChild in
	// packages/router/src/vite/runtime/mdx-route.ts, so an MDX page with two
	// tours on it fails the same way. Delete these three the moment it lands.
	exemptions: [
		{
			check: 'distinct-widget-ids',
			reason: 'multi-island SSR answers no roster count (shared-seed-slot.ts)',
		},
		{
			check: 'interaction-isolation',
			reason: 'multi-island SSR answers no roster count (shared-seed-slot.ts)',
		},
		{
			check: 'focus-containment',
			reason: 'multi-island SSR answers no roster count (shared-seed-slot.ts)',
		},
	],
});
