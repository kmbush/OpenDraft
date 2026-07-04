/** Entry: start the harness and print how to reach it (incl. the dev passcode). */
import { createHarness } from './server.js';

const harness = await createHarness();
console.log(`OpenDraft dev harness listening on http://localhost:${harness.port}`);
console.log(`  HTTP API  → http://localhost:${harness.port}/api`);
console.log(`  WebSocket → ws://localhost:${harness.port}/ws`);
console.log(`  Pool      → http://localhost:${harness.port}/pool/<id>.json (bundled)`);
console.log(`  Admin passcode: ${harness.passcode}`);
console.log('Vite proxies /api, /ws, /pool here. Open http://localhost:5173/admin to begin.');
