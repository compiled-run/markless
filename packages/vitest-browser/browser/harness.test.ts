import { expect, test } from 'vitest';

test('browser project runs against a real DOM', () => {
	const probe = document.createElement('button');
	probe.textContent = 'probe';
	document.body.appendChild(probe);
	let clicks = 0;
	probe.addEventListener('click', () => clicks++);
	probe.click();
	expect(clicks).toBe(1);
	expect(typeof window.getComputedStyle(probe).display).toBe('string');
	probe.remove();
});
