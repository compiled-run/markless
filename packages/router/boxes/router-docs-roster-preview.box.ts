import { box } from '@async/witness';
import { config, extendsRoster } from './roster-routes.ts';

export default box(
	{
		name: 'router docs preview: a composed roster family derives each part place after resume',
		tags: ['router', 'build', 'preview', 'browser', 'roster'],
		modes: ['build', 'preview'],
	},
	async ({ pipeline, expect, receipt }) => {
		const build = await pipeline.build({ config });
		const served = await pipeline.preview(build, { config });
		try {
			await extendsRoster(expect, (path) => served.browser.visit(path));
		} finally {
			await served.close();
		}
		await receipt.capture(
			'built roster parts on a plain route and an MDX page filled after resume',
		);
	},
);
