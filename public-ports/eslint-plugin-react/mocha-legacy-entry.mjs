// SDK-only executable-path adapter for the unchanged publisher unit command.
import { main } from '../lib/cli/cli.js';

await main(process.argv.slice(2));
