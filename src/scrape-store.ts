import { fork } from 'node:child_process';

import type { Dictionary } from 'crawlee';
import { Configuration, Dataset, PlaywrightCrawler, log } from 'crawlee';

import { router } from './routes.js';
import { getOrInitQueue } from './shared.js';

// For this example, we will spawn 2 separate processes that will scrape the store in parallel.

if (!process.env.IN_WORKER_THREAD) {
    // This is the main process. We will use this to spawn the worker threads.
    log.info('Setting up worker threads.');

    // The following code is just in order to support running this in dev mode. See https://github.com/privatenumber/tsx/issues/354 for more info
    const tsx = new URL(import.meta.resolve('tsx/cli')).pathname;
    const inDev = import.meta.url.endsWith('.ts');
    const currentFile = new URL(import.meta.url).pathname;

    const promises = [];

    // You can decide how many threads you want to spawn, but keep in mind you can only spawn so many before you overload your machine
    // Or maybe you spawn multiple actors if you run on Apify Cloud! 👀
    for (let i = 0; i < 2; i++) {
        const proc = fork(inDev ? tsx : currentFile, inDev ? [currentFile] : [], {
            // // We pass this env var to the worker thread so that it knows it's a worker process (due to having to have a fallback for dev mode)
            env: {
                // Share the current process's env across to the newly created process
                ...process.env,
                // ...but also tell the process that it's a worker process
                IN_WORKER_THREAD: 'true',
                WORKER_INDEX: String(i),
            },
        });

        proc.on('online', () => {
            log.info(`Process ${i} is online.`);

            // Log out what the crawlers are doing
            // Note: we want to use console.log instead of log.info because we already get formatted output from the crawlers
            proc.stdout!.on('data', (data) => {
                console.log(data.toString());
            });

            proc.stderr!.on('data', (data) => {
                console.error(data.toString());
            });
        });

        proc.on('message', async (data) => {
            log.debug(`Process ${i} sent data.`, data as Dictionary);
            await Dataset.pushData(data as Dictionary);
        });

        promises.push(new Promise<void>((resolve) => {
            proc.once('exit', (code, signal) => {
                log.info(`Process ${i} exited with code ${code} and signal ${signal}`);
                resolve();
            });
        }));
    }

    await Promise.all(promises);

    log.info('Crawling complete!');
} else {
    // This is the worker process. We will use this to scrape the store.

    // Let's build a logger that will prefix the log messages with the worker index
    const workerLogger = log.child({ prefix: `[Worker ${process.env.WORKER_INDEX}]` });

    // This is better set with CRAWLEE_LOG_LEVEL env var
    // or a configuration option. This is just for show 😈
    workerLogger.setLevel(log.LEVELS.DEBUG);

    // Get the request queue
    const requestQueue = await getOrInitQueue(false);

    // Configure crawlee to store the worker-specific data in a separate directory (needs to be done AFTER the queue is initialized when running locally)
    const config = new Configuration({
        storageClientOptions: {
            localDataDirectory: `./storage/worker-${process.env.WORKER_INDEX}`,
        },
    });

    workerLogger.debug('Setting up crawler.');
    const crawler = new PlaywrightCrawler({
        log: workerLogger,
        // Instead of the long requestHandler with
        // if clauses we provide a router instance.
        requestHandler: router,
        // Enable the request locking experiment so that we can actually use the queue.
        experiments: {
            requestLocking: true,
        },
        // Get the queue
        requestQueue,
        // Let's also limit the crawler's concurrency, we don't want to be too evil 😈
        maxConcurrency: 5,
    }, config);

    await crawler.run();
}
