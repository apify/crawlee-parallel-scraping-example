import { RequestQueueV2, Dataset, Configuration } from 'crawlee';

if (process.env.IN_WORKER_THREAD) {
    Configuration.getGlobalConfig().set('purgeOnStart', false);
}

// Create the request queue that also supports parallelization
let queue: RequestQueueV2;

/**
 * @param makeFresh Whether the queue should be cleared before returning it
 * @returns The queue
 */
export async function getOrInitQueue(makeFresh: boolean = false) {
    if (queue) {
        return queue;
    }

    queue = await RequestQueueV2.open('shop-urls');

    if (makeFresh) {
        await queue.drop();
        queue = await RequestQueueV2.open('shop-urls');
    }

    return queue;
}
