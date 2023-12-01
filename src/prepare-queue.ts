// This crawler will scrape the entire store, and store all requests in a shared queue we've created in `src/shared.ts`.
// Once this is done, we will re-use the router in `src/scrape-store.ts` to scrape the data from the queue in a parallel way.

import { PlaywrightCrawler, log } from 'crawlee';

import { router } from './routes.js';
import { getOrInitQueue } from './shared.js';

// This is better set with CRAWLEE_LOG_LEVEL env var
// or a configuration option. This is just for show 😈
log.setLevel(log.LEVELS.DEBUG);

log.debug('Setting up crawler.');
const crawler = new PlaywrightCrawler({
    // Instead of the long requestHandler with
    // if clauses we provide a router instance.
    requestHandler: router,
});

// Pre-initialize the queue so that we have a blank slate that will get filled out by the crawler
await getOrInitQueue(true);

await crawler.run(['https://warehouse-theme-metal.myshopify.com/collections']);
