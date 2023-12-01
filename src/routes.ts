import { createPlaywrightRouter } from 'crawlee';

import { getOrInitQueue } from './shared.js';

// createPlaywrightRouter() is only a helper to get better
// intellisense and typings. You can use Router.create() too.
export const router = createPlaywrightRouter();

// This replaces the request.label === DETAIL branch of the if clause.
router.addHandler('DETAIL', async ({ request, page, log }) => {
    log.debug(`Extracting data: ${request.url}`);
    const urlPart = request.url.split('/').slice(-1); // ['sennheiser-mke-440-professional-stereo-shotgun-microphone-mke-440']
    const manufacturer = urlPart[0].split('-')[0]; // 'sennheiser'

    const title = await page.locator('.product-meta h1').textContent();
    const sku = await page
        .locator('span.product-meta__sku-number')
        .textContent();

    const priceElement = page
        .locator('span.price')
        .filter({
            hasText: '$',
        })
        .first();

    const currentPriceString = await priceElement.textContent();
    const rawPrice = currentPriceString!.split('$')[1];
    const price = Number(rawPrice.replaceAll(',', ''));

    const inStockElement = page
        .locator('span.product-form__inventory')
        .filter({
            hasText: 'In stock',
        })
        .first();

    const inStock = (await inStockElement.count()) > 0;

    const results = {
        url: request.url,
        manufacturer,
        title,
        sku,
        currentPrice: price,
        availableInStock: inStock,
    };

    log.debug(`Saving data: ${request.url}`);

    // Send the data to the parent process
    // Depending on how you build your crawler, this line could instead be something like `Dataset.pushData()`! Experiment, and see what you can build
    process.send!(results);
});

router.addHandler('CATEGORY', async ({ page, enqueueLinks, request, log }) => {
    log.debug(`Enqueueing pagination for: ${request.url}`);
    // We are now on a category page. We can use this to paginate through and enqueue all products,
    // as well as any subsequent pages we find

    await page.waitForSelector('.product-item > a');
    await enqueueLinks({
        selector: '.product-item > a',
        label: 'DETAIL', // <= note the different label,
        requestQueue: await getOrInitQueue(), // <= note the different request queue
    });

    // Now we need to find the "Next" button and enqueue the next page of results (if it exists)
    const nextButton = await page.$('a.pagination__next');
    if (nextButton) {
        await enqueueLinks({
            selector: 'a.pagination__next',
            label: 'CATEGORY', // <= note the same label
        });
    }
});

// This is a fallback route which will handle the start URL
// as well as the LIST labeled URLs.
router.addDefaultHandler(async ({ request, page, enqueueLinks, log }) => {
    log.debug(`Enqueueing categories from page: ${request.url}`);
    // This means we're on the start page, with no label.
    // On this page, we just want to enqueue all the category pages.

    await page.waitForSelector('.collection-block-item');
    await enqueueLinks({
        selector: '.collection-block-item',
        label: 'CATEGORY',
    });
});
