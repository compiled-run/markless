import { renderCsrIslands, renderSSRIslands } from '@markless/vitest-browser';
import { runMultiEmbedConformance } from '../../test-support/multi-embed-conformance.ts';
import MultiEmbed from './scenarios/multi-embed.tsrx';

// The island mounts are written out here rather than inside the shared battery:
// the SSR island lever is a string-level transform that resolves each component
// identifier against THIS file's own import statements.
runMultiEmbedConformance({
	family: 'fileupload',
	render: () => renderSSRIslands([MultiEmbed, MultiEmbed]),
	renderCsr: () => renderCsrIslands([MultiEmbed, MultiEmbed]),
	embedFrame: 'frame',
	// No family suffix to count: the only surface that reports the chosen files
	// is the consumer's own row list, which is a second call site of
	// `#fileuploadState` per embed, so "one definition per embed" is not the
	// shape this family renders. The family-agnostic half of the check — no
	// widget-scoped id repeating across embeds — still runs.
	widgetDefinitionSuffixes: [],
	// One file chosen on one upload. The row list reports its own length, which
	// is the whole of what a merged file cell would smear across both embeds.
	interaction: {
		activate: 'choose',
		observe: 'rows',
		stateAttribute: 'data-files',
		restValue: '0',
		activeValue: '1',
	},
	// No rovingKey: the browse button and each row's close button are plain tab
	// stops rather than a roving roster.
	// No disabled: `disabled` is a root prop, so one upload is either wholly
	// locked or wholly live and cannot carry a locked control beside a live one.
});
