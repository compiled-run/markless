import { describe, expect, it } from 'vitest';
import { fillPageProps } from './page-props.ts';

const root = '/site';
const page = (path: string) => `${root}/pages${path}`;

describe('fillPageProps', () => {
	it('gives the docs tables the family named by the page file', () => {
		const source = '<AnatomyTable />\n\n<KeyboardTable />\n\n<ApiTable />\n';
		expect(fillPageProps(source, page('/ui/accordion.mdx'))).toBe(
			'<AnatomyTable family="accordion" />\n\n<KeyboardTable family="accordion" />\n\n<ApiTable family="accordion" />\n',
		);
	});

	it('gives the sidebar the route path, with index files as their folder', () => {
		expect(fillPageProps('<Sidebar />', page('/ui/accordion.mdx'))).toBe(
			'<Sidebar pathname="/ui/accordion" />',
		);
		expect(fillPageProps('<Sidebar />', page('/index.mdx'))).toBe(
			'<Sidebar pathname="/" />',
		);
	});

	it('gives the line under the title the route path, so it can show the page mark', () => {
		expect(fillPageProps('<PageMeta time="4 min" assumes="nothing" />', page('/concepts/state.mdx'))).toBe(
			'<PageMeta pathname="/concepts/state" time="4 min" assumes="nothing" />',
		);
	});

	it('leaves a tag that names its own family or pathname alone', () => {
		const source = '<ApiTable family="tabs" part="root" />\n<Sidebar pathname="/" />\n';
		expect(fillPageProps(source, page('/ui/_derive-proof.mdx'))).toBe(source);
	});

	it('keeps other props on a filled tag', () => {
		expect(fillPageProps('<ApiTable part="root" />', page('/ui/tabs.mdx'))).toBe(
			'<ApiTable family="tabs" part="root" />',
		);
	});

	it('does not touch tags shown inside a code fence', () => {
		const source = '```mdx\n<ApiTable />\n```\n<ApiTable />\n';
		expect(fillPageProps(source, page('/ui/tabs.mdx'))).toBe(
			'```mdx\n<ApiTable />\n```\n<ApiTable family="tabs" />\n',
		);
	});

	it('ignores files outside pages/', () => {
		const source = '<ApiTable />';
		expect(fillPageProps(source, `${root}/components/docs/x.mdx`)).toBe(source);
	});

	it('prefixes a bare scenario with the page family', () => {
		expect(
			fillPageProps(
				'<Example scenario="settings" />\n<Playground scenario="basic" />',
				page('/ui/accordion.mdx'),
			),
		).toBe(
			'<Example scenario="accordion/settings" />\n<Playground scenario="accordion/basic" />',
		);
	});

	it('leaves a scenario that already names its family alone', () => {
		const source = '<CodePanel scenario="accordion/multiple" />';
		expect(fillPageProps(source, page('/ui/_codepanel-proof.mdx'))).toBe(source);
	});
});
