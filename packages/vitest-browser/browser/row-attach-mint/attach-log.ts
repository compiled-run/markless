export const attachLog: string[] = [];

export function setHtml(html: string) {
	return (element: HTMLElement) => {
		element.innerHTML = html;
		attachLog.push(`+${html}`);
		return () => attachLog.push(`-${html}`);
	};
}
