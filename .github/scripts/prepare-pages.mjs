import { copyFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const output = resolve(process.argv[2]);
copyFileSync(new URL('../../cloudflare-pages/worker.js', import.meta.url), resolve(output, '_worker.js'));
writeFileSync(resolve(output, '_routes.json'), JSON.stringify({ version: 1, include: ['/api', '/api/*', '/media/*', '/assets/cards/*', '/assets/models/default-card-poster.webp'], exclude: [] }));
console.log('Prepared Pages API service binding and static routing.');
