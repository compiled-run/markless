import { TABS, type TabInfo } from './shared/data.ts';

export function tabForKey(key: string, currentId: TabInfo['id']): TabInfo['id'] | null {
	const current = TABS.findIndex((tab) => tab.id === currentId);
	let next: number;
	if (key === 'ArrowRight') next = (current + 1) % TABS.length;
	else if (key === 'ArrowLeft') next = (current - 1 + TABS.length) % TABS.length;
	else if (key === 'Home') next = 0;
	else if (key === 'End') next = TABS.length - 1;
	else return null;
	return TABS[next]!.id;
}
