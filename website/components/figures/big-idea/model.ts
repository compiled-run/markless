// The seat-map figure: one file, three hosts, and what each host shows once the plan reaches it.
export const HOSTS = ['browser', 'phone', 'terminal'] as const;
export type Host = (typeof HOSTS)[number];
export const SEATS = ['A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'B3', 'B4'] as const;
export const TAKEN = ['A3', 'B1'] as const;

export const HOST_NOTE: Record<Host, string> = {
	browser: 'a browser: the plan as a web page',
	phone: 'a phone, early proof: the plan as native buttons',
	terminal: 'a server: the plan as the HTML it sends',
};

export function describeHost(host: Host): string {
	if (host === 'terminal') return 'The server got the same plan and printed the HTML it sends.';
	return `The ${host} got the same plan and drew the seat map${host === 'phone' ? ' with native buttons. Native is an early proof.' : '.'}`;
}

export const describeSeat = (host: Host, seat: string) => `Picked seat ${seat} on the ${host}. Only that seat changed.`;
export const ONE_FILE = 'There is one seatmap.tsrx. You change it once, and every host gets the change, because the plan is worked out at compile time.';
export const START_SAID = 'One file, seatmap.tsrx, and three hosts: a browser, a phone and a server. Drag the file onto a host, or press.';
