import { AsyncLocalStorage } from 'async_hooks';

export const tenantContext = new AsyncLocalStorage<string>();
