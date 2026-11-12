import { afterEach, beforeEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import { labelLog, resetLoads, settleAll, subjectLog, waitingFor } from './api.ts';
import LabelPicker from './label-panel.tsrx';
import SubjectPicker from './subject-panel.tsrx';
import OpenSubjectPicker from './subject-picker-open.tsrx';

beforeEach(resetLoads);
afterEach(cleanup);

const text = (selector: string) => document.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
const click = (selector: string) => document.querySelector<HTMLElement>(selector)!.click();
const panel = () =>
	document.querySelector('[data-panel]')
		? (text('[data-name]') ?? text('[data-loading]') ?? text('[data-failed]'))
		: null;

async function settle(id: number, fail = false) {
	await expect.poll(() => waitingFor(id)).toBeGreaterThan(0);
	settleAll(id, fail);
}

async function shows(content: string) {
	await expect.poll(panel).toBe(content);
	expect(document.querySelectorAll('[data-panel]')).toHaveLength(1);
}

async function refreshesSwitchesClosesAndRetries() {
	click('[data-refresh]');
	await settle(1);
	await shows('subject 1 round 1');

	// The @if stays shown, so the panel keeps its own round while the subject changes.
	click('[data-open-two]');
	await settle(2);
	await shows('subject 2 round 1');

	click('[data-close]');
	await expect.poll(panel).toBeNull();

	click('[data-open-one]');
	await shows('Loading');
	await settle(1, true);
	await shows('Failed Retry');
	click('[data-retry]');
	await settle(1);
	await shows('subject 1 round 0');
}

async function opensClosed() {
	expect(panel()).toBeNull();
	click('[data-open-one]');
	await shows('Loading');
	await settle(1);
	await shows('subject 1 round 0');
	await refreshesSwitchesClosesAndRetries();
}

test('CSR: a child with its own async value inside an @if shows each subject, refreshes and retries', async () => {
	await render(SubjectPicker);
	await opensClosed();
});

test('SSR: a child with its own async value inside an @if shows each subject, refreshes and retries', async () => {
	await renderSSR(SubjectPicker);
	await opensClosed();
});

test('CSR: the same @if open from the first render keeps working after close and reopen', async () => {
	await render(OpenSubjectPicker);
	await settle(1);
	await shows('subject 1 round 0');
	await refreshesSwitchesClosesAndRetries();
});

test('SSR: the same @if served open keeps working after close and reopen', async () => {
	await renderSSR(OpenSubjectPicker);
	await shows('subject 1 round 0');
	await refreshesSwitchesClosesAndRetries();
});

// Known defect: a closed arm's component keeps its computeds wired to its props, so closing runs them with the value that closed the arm.
test.fails('a closed panel loads nothing: closing and reopening asks for each subject once', async () => {
	await render(SubjectPicker);
	click('[data-open-one]');
	await settle(1);
	await shows('subject 1 round 0');
	click('[data-close]');
	await expect.poll(panel).toBeNull();
	click('[data-open-one]');
	await settle(1);
	await shows('subject 1 round 0');
	expect(subjectLog).toEqual([1, 1]);
});

test.fails('a closed panel derives nothing: its sync computed never sees the value that closed it', async () => {
	await render(LabelPicker);
	click('[data-open-one]');
	await expect.poll(() => text('[data-name]')).toBe('label 1 0');
	click('[data-close]');
	await expect.poll(() => document.querySelector('[data-panel]')).toBeNull();
	await new Promise((resolve) => setTimeout(resolve, 50));
	expect(labelLog).not.toContain(null);
});
