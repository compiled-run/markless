import { renderCsrIslands, renderSSRIslands } from '@markless/vitest-browser';
import { runMultiEmbedConformance } from '../../test-support/multi-embed-conformance.ts';
import MultiEmbed from './scenarios/multi-embed.tsrx';

// The island mounts are written out here rather than inside the shared battery:
// the SSR island lever is a string-level transform that resolves each component
// identifier against THIS file's own import statements.
runMultiEmbedConformance({
	family: 'otp',
	render: () => renderSSRIslands([MultiEmbed, MultiEmbed]),
	renderCsr: () => renderCsrIslands([MultiEmbed, MultiEmbed]),
	embedFrame: 'frame',
	widgetDefinitionSuffixes: ['#otpState'],
	interaction: {
		activate: 'field',
		keys: '12',
		observe: 'item-0',
		stateAttribute: 'ui-empty',
		restValue: '',
		activeValue: null,
	},
	// No roving key: one field covers every box, so a keystroke never moves focus.
	// No disabled entry: `disabled` locks the whole field, and a second locked root
	// in the same embed would give this family two `otpState` definitions per
	// island, which the widget-id check forbids by construction.
	//
	// Every box this family draws is found by its place in a roster. SSR answers
	// roster reads per island now; the client-composed path still does not, so
	// the field commits a zero-length code there. Delete when the CSR path answers.
	exemptions: [
		{
			check: 'interaction-isolation',
			mode: 'ssr',
			reason:
				'the page renders but the typed digit lands nowhere: element-handle roster keys drop the island segment at resume (HOST_SCOPE in packages/web/src/resume-locators.ts, INSTANCE_SEGMENT in packages/web/src/fns/roster-resume.ts). Delete when the segment lands in both classes.',
		},
		{
			check: 'interaction-isolation',
			mode: 'csr',
			reason:
				'the first box stays empty for the whole poll: how many boxes there are and which box each one is are both roster reads, and the merged client payload answers neither, so the field commits a zero-length code. Suspected owner is composeMdxView in packages/router/src/vite/runtime/mdx-route.ts.',
		},
	],
});
