import { cloudflare } from '@cloudflare/vite-plugin';
import { defineConfig } from 'vite';

const port = Number(process.env.ENTRE_SYNC_PORT) || 8787;

export default defineConfig({
  plugins: [cloudflare({ inspectorPort: port + 1000 })],
  server: { host: '127.0.0.1', port, strictPort: true, cors: false },
});
