import { createServerEntry } from '@arcade/router/vite/runtime/create-server-entry';
import { clientEntryPath } from 'virtual:arcade-router/client-entry-path';
import { pageModuleLoaders, routeFileIds } from 'virtual:arcade-router/routes';

const documentModuleLoaders = import.meta.glob(['/document.tsrx']);
const entry = createServerEntry({
	clientEntryPath,
	documentModuleLoader: documentModuleLoaders['/document.tsrx'],
	pageModuleLoaders,
	routeFileIds,
});

export const fetch = entry.fetch;
export default entry;
