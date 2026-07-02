import { render } from '@markless/core';
import App from './root.tsrx';

const app = document.querySelector('#app');
if (!app) {
	throw new Error('Expected #app target for CSR render.');
}

await render(App, { target: app });

// Fixture-only evidence surface: the box asserts these status elements instead
// of evaluating script in the page. `ok` means the scoped-style contract held.
const hostStatus = document.createElement('p');
hostStatus.id = 'scope-class-status';
const cssStatus = document.createElement('p');
cssStatus.id = 'scoped-css-status';
const detail = document.createElement('p');
detail.id = 'scope-detail';
app.append(hostStatus, cssStatus, detail);

const REPORT_DEADLINE_MS = 5_000;
const started = Date.now();
reportScopedStyleEvidence();

function reportScopedStyleEvidence(): void {
	const host = document.querySelector('section[data-styled-host]');
	const classNames = host ? [...host.classList] : [];
	const scopeToken = classNames.find((name) => /^mk-[a-z0-9]+$/.test(name));
	const hostOk = host !== null && classNames.includes('card') && scopeToken !== undefined;
	const color = host ? getComputedStyle(host).color : '(no host)';
	const scopedRuleSelector = findScopedRuleSelector();
	const cssOk = scopedRuleSelector !== null || color === 'rgb(255, 0, 0)';

	hostStatus.textContent = hostOk ? 'ok' : 'missing';
	cssStatus.textContent = cssOk ? 'ok' : 'missing';
	detail.textContent =
		`class="${classNames.join(' ')}" color=${color} ` +
		`scopedRule=${scopedRuleSelector ?? '(none)'}`;

	if ((!hostOk || !cssOk) && Date.now() - started < REPORT_DEADLINE_MS) {
		setTimeout(reportScopedStyleEvidence, 100);
	}
}

function findScopedRuleSelector(): string | null {
	for (const sheet of document.styleSheets) {
		let rules: CSSRuleList;
		try {
			rules = sheet.cssRules;
		} catch {
			continue;
		}
		for (const rule of rules) {
			if (rule instanceof CSSStyleRule && rule.selectorText.includes('.card.mk-')) {
				return rule.selectorText;
			}
		}
	}
	return null;
}
