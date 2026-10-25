// SDK-only executable-path adapter for the unchanged publisher unit command.
import { main } from '../lib/cli/cli.js';
import process from 'node:process';

await main(process.argv.slice(2));
