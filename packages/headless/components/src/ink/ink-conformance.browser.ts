import { renderCsrIslands, renderSSRIslands } from '@markless/vitest-browser';
import { runMultiEmbedConformance } from '../../test-support/multi-embed-conformance.ts';
import MultiEmbed from './scenarios/multi-embed.tsrx';

// The island mounts are written out here rather than inside the shared battery:
// the SSR island lever is a string-level transform that resolves each component
// identifier against THIS file's own import statements.
runMultiEmbedConformance({
	family: 'ink',
	render: () => renderSSRIslands([MultiEmbed, MultiEmbed]),
	renderCsr: () => renderCsrIslands([MultiEmbed, MultiEmbed]),
	embedFrame: 'frame',
	widgetDefinitionSuffixes: ['#inkState'],
	// `ui-empty` is a boolean attribute: present while nothing is drawn, gone
	// once the dot the click leaves has been committed.
	interaction: {
		activate: 'area',
		observe: 'root',
		stateAttribute: 'ui-empty',
		restValue: '',
		activeValue: null,
	},
	// No rovingKey: the surface is one tab stop and its keys are undo and redo.
	// No disabled: `disabled` is a root prop, so one surface is either wholly
	// locked or wholly live and cannot carry a locked control beside a live one.
});
