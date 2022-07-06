const express = require('express');
const app = express();
const puppeteer = require('puppeteer');
const port = process.env.PORT || 8080;
const validUrl = require('valid-url');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const useProxy = require('puppeteer-page-proxy');
// File cache variables
const sTempDirPath = os.tmpdir();
const sType = 'html';
// URL params
var oUrlParams = {}; 
oUrlParams['cache_lifespan'] = 1200; //1200s cache life span by default
oUrlParams['page_timeout'] = 500; //500ms page load time out by default
oUrlParams['scrolldown_delay'] = 1000; //1000ms scroll down time out by default
oUrlParams['proxy_server'] = ''; //no proxy server by default
oUrlParams['clear_cache'] = false; //use cache by default

var parseUrl = function(url) {
	//url = decodeURIComponent(url)
	if (!/^(?:f|ht)tps?\:\/\//.test(url)) {
		url = 'http://' + url;
	}

	return url;
};

app.get('/', function(req, res) {
	var urlToScrape = parseUrl(req.query.url); //URL+cache_lifespan+page_timeout+scrolldown_delay

	// Check cache
	var sCacheDirPathToday = setCacheDirectory();
	var sFileBaseName = getRequestCacheName(urlToScrape) + '.' + sType;
	var sFilePath = path.join(sCacheDirPathToday, sFileBaseName);

	console.log('Cache path: ' + sFilePath);
	//console.log('URL to scrape (not parsed): ' + req.query.url);
	//console.log('URL to scrape (parsed): ' + urlToScrape);

	if (validUrl.isWebUri(urlToScrape)) {

		(async () => {
			
			try{
				// Use cache
				const bFileCached = useFileCache(sFilePath);
				//console.log('Cache returned?: ' + bFileCached);
	
				if (bFileCached) {
					console.log('Caching: ' + urlToScrape);
					await fs.readFile(sFilePath, 'utf-8', (err, html) => {
						if (err) {
							console.error(err);
							return;
						}
						res.send(html);
					});
	
					return;
				} else {
					console.log('Scraping: ' + urlToScrape);
				}
				
				// import Browser and set config once!.
				var browserApi = require('./browser.js');
				var browserArgs = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--disable-web-security', '--lang=en-GB'];
				if (global['proxy_server'] && global['proxy_server'].length > 0 && false) {
					const proxyChain = require('proxy-chain');
					const oldProxyUrl = global['proxy_server'];
					const newProxyUrl = await proxyChain.anonymizeProxy(oldProxyUrl);
					browserArgs.push('--proxy-server='+newProxyUrl);
				}
				const config = {
									headless: true,
									args: browserArgs,
									ignoreDefaultArgs: ['--disable-extensions'],
								};
				browserApi.setConfig(config);
	
				// Wait for creating the new page.
				var page = await browserApi.newPage()
				
				// Proxy used?
				if (global['proxy_server'] && global['proxy_server'].length > 0) {
					await useProxy(page, global['proxy_server']);
				}
				
				// Configure the navigation timeout
				await page.setDefaultNavigationTimeout(0);
	
				// Request interception
				/* page.removeAllListeners("request");
				await page.setRequestInterception(true);
				page.on('request', async req => {
					['image','stylesheet', 'font'].includes(req.resourceType()) ? await req.abort() : await req.continue();
				}); */
				
				// Proxy used?
				let ipAddress;
				useProxy.lookup(page).then(data => {
					ipAddress = data.ip;
					if (global['proxy_server'] && global['proxy_server'].length > 0) console.log("Proxy IP address:"+ipAddress);
					else console.log("IP address:"+ipAddress);
				});
				
				// add extra headers
				await page.setExtraHTTPHeaders({
					'Accept-Language': 'en-GB'
				});

				// go to the page and wait for it to finish loading
				await page.goto(urlToScrape, {
					waitUntil: 'load'
				});
	
				await page.waitForTimeout(Number(global['page_timeout']));
	
				//scroll down with delay
				await page.evaluate(async () => {
					//window.scrollBy(0, window.document.body.scrollHeight);
				});
				await page.evaluate(() => new Promise((resolve) => {
				  var scrollTop = -1;
				  const interval = setInterval(() => {
					window.scrollBy(0, 100);
					if(document.documentElement.scrollTop !== scrollTop) {
					  scrollTop = document.documentElement.scrollTop;
					  return;
					}
					clearInterval(interval);
					resolve();
				  }, 10);
				}));
				await page.waitForTimeout(Number(global['scrolldown_delay']));
	
				await page.evaluate((myIpAddress) =>  {
					const el = document.createElement("field");
					el.setAttribute("id","web-scraper-ip");
					el.setAttribute("value",myIpAddress);
					document.body.appendChild(el);
					//document.documentElement.outerHTML;
				}, ipAddress);
				
				// now get all the current dom, and close the browser
				let html = await page.content();
	
				res.send(html);
	
				// Caching
				await fs.writeFile(path.join(sFilePath), html, err => {
					if (err) {
						console.error(err);
						return;
					}
					//file written successfully
				})
	
				// Close page
				await browserApi.handBack(page);
	
			} catch(e){
				console.log(e) ;
			}

		})();
	} else {
		console.log('Invalid url: ' + urlToScrape) ;
		res.send('Invalid url: ' + urlToScrape);
	}

});

process.setMaxListeners(0);

app.listen(port, function() {
	console.log('App listening on port ' + port)
})

var getRequestCacheName = function(url) {
	var realUrl;
	realUrl = removeQueryParam(Object.keys(oUrlParams), url);
	//console.log('RealUrl ' + realUrl)

	return require('crypto').createHash('md5').update(realUrl).digest("hex");
};

function setCacheDirectory() {
	var sCacheDirPath = path.join(sTempDirPath, sType);
	if (!fs.existsSync(sCacheDirPath)) {
		fs.mkdirSync(sCacheDirPath, 0777, true);
		console.log('Creating temp path: ' + sCacheDirPath);
	}
	var sToday = new Date().toISOString().slice(0, 10).replace(/-/g, '');
	let sCacheDirPathToday = path.join(sCacheDirPath, sToday);
	if (!fs.existsSync(sCacheDirPathToday)) {
		fs.mkdirSync(sCacheDirPathToday, 0777, true);
		console.log('Creating temp path: ' + sCacheDirPathToday);
	}
	// Delete old cache directories.
	// Directories other than todays will be deleted. This means the cache lifespan cannot be longer than a day.
	var aSubDirs = getSubDirPaths(sCacheDirPath, sToday);
	//console.log(aSubDirs);

	var pathToDir;
	aSubDirs.forEach(function(sDirPath) {
		pathToDir = path.join(sCacheDirPath, sDirPath);
		removeDir(pathToDir);
	});

	return sCacheDirPathToday;
}

function useFileCache(path) {
	//console.log('clear_cache='+global['clear_cache']);
	if (fs.existsSync(path)) {
		//file exists
		var aStats = fs.statSync(path);
		var iModifiedTime = Number(aStats.mtime);
		if ((iModifiedTime + Number(1000 * global['cache_lifespan'])) > new Date().getTime() && !global['clear_cache']) {
			return true;
		}
	}
	return false;
}

const removeDir = function(path) {
	if (fs.existsSync(path)) {
		const files = fs.readdirSync(path);
		fs.rmSync(path, {
			recursive: true,
			force: true
		});
		console.log('Removing directory: ' + path + ' =>' + files.length + ' files deleted');
	}
}


var getSubDirPaths = function(sDirPath, aExcludeName = '') {
	const aFormat = source => fs.readdirSync(source, {
		withFileTypes: true
	}).reduce((a, c) => {
		c.isDirectory() && a.push(c.name)
		return a
	}, []).filter(folder => !folder.includes(aExcludeName));

	return aFormat(sDirPath);
}

/**
 * remove query parameters from actual url
 * @param {*} params parameters to be remove, e.g ['foo', 'bar'] 
 * @param {*} url actual url 
 */
function removeQueryParam(parameters = [], url) {
	try {
		var urlParts = url.split('?');
		var params = new URLSearchParams(urlParts[1]);
		parameters.forEach(param => {
			global[param] = (params.get(param) && params.get(param).length > 0) ? params.get(param) : oUrlParams[param];
			//console.log(param+'='+global[param]);
			params.delete(param);
		})
		return urlParts[0] + '?' + params.toString();
	} catch (err) {
		console.log(err);
		return url;
	}
}

setInterval(function() {
    http.get("http://hitech-land.herokuapp.com/?url=https%3A%2F%2Fwww.google.co.uk");
}, 900000); // Call app every 15 minutes (900000)
