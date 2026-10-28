import { bindings, defineConfig, defineWorker, exports } from 'cf/config';
import * as entrypoint from './src/index.js' with { type: 'cf-worker' };

const worker = defineWorker({
  name: 'entre-sync',
  compatibilityDate: '2026-10-27',
  entrypoint,
  exports: { GroupLedger: exports.durableObject({ storage: 'sqlite' }) },
});

export default defineConfig({
  accountId: '166f46ee733b7bf1b67cacc89ee9e464',
  worker: {
    ...worker,
    env: { GROUPS: bindings.durableObject({ worker, exportName: 'GroupLedger' as const }) },
  },
});
