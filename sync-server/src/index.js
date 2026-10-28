import { DurableObject } from 'cloudflare:workers';
import { GroupStore, handleRequest } from './service.js';

export class GroupLedger extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.store = new GroupStore(ctx.storage);
  }

  fetch(request) { return this.store.fetch(request); }
}

export default { fetch: handleRequest };
