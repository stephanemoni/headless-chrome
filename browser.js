var puppeteer = require('puppeteer');

class PuppeteerApi {

    browser = null
    constructor(config) {
        this.config = config;
    }
    
    setConfig(config) {
        this.config = config;
    }

    async newBrowser() {
        return await puppeteer.launch(this.config);
    }

    async getBrowser() {

        if (!this.browser) {
            this.browser = await this.newBrowser();
        }

        return this.browser;
    }

    async newPage() {
        const browser = await this.getBrowser();
        const page = await browser.newPage();
        return page;
    }

    async handBack(page) {

        // close the page or even reuse it?.
        await page.close();

        // you could add logic for closing the whole browser instance depending what
        // you want.
    }

    async shutdown() {
        await this.browser.close();
    }


}

const config = {
    headless: true
}

const browserApi = new PuppeteerApi(config);
module.exports = browserApi;