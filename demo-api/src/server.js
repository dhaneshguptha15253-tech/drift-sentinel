import { createApp } from './app.js';
import { fileURLToPath } from 'node:url';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 4000;

export function startServer(port = PORT) {
  const server = createApp();
  return new Promise((resolve) => {
    server.listen(port, () => {
      const address = server.address();
      const actualPort = typeof address === 'object' && address ? address.port : port;
      console.log(`demo-api running at http://localhost:${actualPort}`);
      resolve(server);
    });
  });
}

// Start immediately when executed directly
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  startServer(PORT);
}
