var puppeteer = require('puppeteer');

class PuppeteerApi {

    browser = null
	flagSameConfig = false
    constructor(config) {
        this.config = config;
    }
    
    setConfig(config) {		
		if (config.length == this.config.length && JSON.stringify(config) === JSON.stringify(this.config) ) {
			this.flagSameConfig = true;
		} else {
			this.flagSameConfig = false;
		}
		
        this.config = config;
    }

    async newBrowser() {
		try {
			return await puppeteer.launch(this.config);
		} catch(e){
			console.log(e) ;
		}
    }

    async getBrowser() {
		try {
			if (!this.browser || !this.flagSameConfig) {
				this.browser = false;
				this.browser = await this.newBrowser();
				this.browser.on('disconnected', this.getBrowser);
				console.log('Puppeteer browser launched with pid ' + this.browser.process().pid);
			}

			return this.browser;
		} catch(e){
			console.log(e) ;
		}
    }

    async newPage() {
		try {
			const browser = await this.getBrowser();
			const page = await browser.newPage();
			return page;
		} catch(e){
			console.log(e) ;
		}
    }

    async handBack(page) {
		try {
			// close the page or even reuse it?.
			await page.close();

			// you could add logic for closing the whole browser instance depending what
			// you want.
		} catch(e){
			console.log(e) ;
		}
    }

    async shutdown() {
		try {
			console.log('Puppeteer browser closed');
			await this.browser.close();
		} catch(e){
			console.log(e) ;
		}
    }


}

const config = {
    headless: true
}

const browserApi = new PuppeteerApi(config);
module.exports = browserApi;