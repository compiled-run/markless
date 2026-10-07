import { box } from '@async/witness';
import { config, extendsRoster } from './roster-routes.ts';

export default box(
	{
		name: 'router docs dev: a composed roster family derives each part place after resume',
		tags: ['router', 'dev', 'browser', 'roster'],
		modes: ['dev'],
	},
	async ({ pipeline, browser, expect, receipt }) => {
		await pipeline.dev({ config });
		await extendsRoster(expect, (path) => browser.visit(path));
		await receipt.capture('roster parts on a plain route and an MDX page filled after resume');
	},
);
