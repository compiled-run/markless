import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import { answer, asked, forgetRequests } from './gate.ts';
import ReportFragment from './report-fragment.tsrx';
import ReportSection from './report-section.tsrx';
import ReportThree from './report-three.tsrx';
import TeamFragment from './team-fragment.tsrx';
import TeamLead from './team-lead.tsrx';
import TeamSection from './team-section.tsrx';
import TeamTrailing from './team-trailing.tsrx';

afterEach(() => {
	cleanup();
	forgetRequests();
});

const textOf = (selector: string) => document.querySelector(selector)?.textContent ?? '';
const members = () => [...document.querySelectorAll('[data-member]')].map((row) => row.textContent);
const click = (selector: string) => (document.querySelector(selector) as HTMLElement).click();
const frames = async (count: number) => {
	for (let at = 0; at < count; at++) await new Promise((done) => requestAnimationFrame(done));
};

async function reply(key: string) {
	await expect.poll(() => asked(key)).toBe(true);
	answer(key);
}

const teams = [
	['a fragment with a heading before the rows', TeamFragment, () => renderSSR(TeamFragment), 'Members of Design', 'Members of Platform'],
	['a section wrapper', TeamSection, () => renderSSR(TeamSection), 'Members of Design', 'Members of Platform'],
	['a fragment with an element after the rows', TeamTrailing, () => renderSSR(TeamTrailing), 'Design team', 'Platform team'],
	['a fragment with two elements before the rows', TeamLead, () => renderSSR(TeamLead), 'Design', 'Platform'],
] as const;

async function keepsRowsWhileTheTeamRefreshes(before: string, after: string) {
	const rows = [...document.querySelectorAll('[data-member]')];
	click('[data-switch]');
	await reply('team:platform');
	await frames(3);
	expect(members()).toEqual(['Ana', 'Bo']);
	expect(textOf('[data-subject]')).toBe(before);
	for (const row of rows) expect(row.closest('[aria-busy="true"]')).not.toBe(null);
	await reply('members:2');
	await expect.poll(members).toEqual(['Cy', 'Di', 'Ed']);
	await expect.poll(() => textOf('[data-subject]')).toBe(after);
	for (const row of rows) expect(row.isConnected).toBe(false);
	await expect.poll(() => document.querySelector('[aria-busy="true"]')).toBe(null);
}

for (const [shape, Team, , before, after] of teams) {
	test(`CSR: ${shape} in @try keeps its keyed rows while a refresh is in flight`, async () => {
		await render(Team);
		await reply('team:design');
		await reply('members:1');
		await expect.poll(members).toEqual(['Ana', 'Bo']);
		await expect.poll(() => textOf('[data-subject]')).toBe(before);
		await keepsRowsWhileTheTeamRefreshes(before, after);
	});

}


for (const [shape, , serve, before, after] of teams) {
	test(`SSR: ${shape} in @try keeps its keyed rows while a refresh is in flight after resume`, async () => {
		await serve();
		expect(members()).toEqual(['Ana', 'Bo']);
		await keepsRowsWhileTheTeamRefreshes(before, after);
	});
}

const reports = [
	['a section with a static sibling', ReportSection, () => renderSSR(ReportSection), 'Total: 70 over 7 days', 'Total: 300 over 30 days'],
	['a fragment with a static sibling', ReportFragment, () => renderSSR(ReportFragment), 'Total: 70 over 7 days', 'Total: 300 over 30 days'],
	['a fragment with three values and a dynamic sibling', ReportThree, () => renderSSR(ReportThree), '70 in 7 days (70 total)', '300 in 30 days (300 total)'],
] as const;

for (const [shape, Report, serve, first, refreshed] of reports) {
	test(`CSR: text with several async values in ${shape} renders whole when the answer beats @pending`, async () => {
		await render(Report);
		await reply('report:7');
		await expect.poll(() => textOf('[data-report]')).toBe(first);
		click('[data-more]');
		await reply('report:30');
		await expect.poll(() => textOf('[data-report]')).toBe(refreshed);
	});

	test(`CSR: text with several async values in ${shape} renders whole after @pending painted`, async () => {
		await render(Report);
		await expect.poll(() => textOf('[data-loading]')).toBe('Loading…');
		await reply('report:7');
		await expect.poll(() => textOf('[data-report]')).toBe(first);
	});

	test(`SSR: text with several async values in ${shape} renders whole and refreshes after resume`, async () => {
		await serve();
		expect(textOf('[data-report]')).toBe(first);
		click('[data-more]');
		await reply('report:30');
		await expect.poll(() => textOf('[data-report]')).toBe(refreshed);
	});
}
