const express = require('express');
const app = express();
const puppeteer = require('puppeteer');
const port = process.env.PORT || 8080;
const validUrl = require('valid-url');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
// File cache variables
const sTempDirPath = os.tmpdir();
const sType = 'html';
// URL params
var oUrlParams = {}; 
oUrlParams['cache_lifespan'] = 1200; //1200s cache life span by default
oUrlParams['scrolldown_delay'] = 1000; //1000ms scroll down time out by default

var parseUrl = function(url) {
	url = decodeURIComponent(url)
	if (!/^(?:f|ht)tps?\:\/\//.test(url)) {
		url = 'http://' + url;
	}

	return url;
};

app.get('/', function(req, res) {
	var urlToScrape = parseUrl(req.query.url); //URL+cache_lifespan+scrolldown_delay

	// Check cache
	var sCacheDirPathToday = setCacheDirectory();
	var sFileBaseName = getRequestCacheName(urlToScrape) + '.' + sType;
	var sFilePath = path.join(sCacheDirPathToday, sFileBaseName);

	console.log('Cache path: ' + sFilePath);

	if (validUrl.isWebUri(urlToScrape)) {

		(async () => {

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

			const browser = await puppeteer.launch({
				args: ['--no-sandbox', '--disable-setuid-sandbox']
			});

			// Wait for creating the new page.
			const page = await browser.newPage();

			// Don't load images
			await page.setRequestInterception(true);
			page.on('request', request => {
				if (request.resourceType() === 'image')
					request.abort();
				else
					request.continue();
			});

			// go to the page and wait for it to finish loading
			await page.goto(urlToScrape, {
				'waitUntil': 'load'
			});

			await page.waitFor(300);

			//scroll down with delay
			await page.evaluate(async () => {
				window.scrollBy(0, window.document.body.scrollHeight);
			});
			await page.waitFor(global['scrolldown_delay']);

			// now get all the current dom, and close the browser
			let html = await page.content();

			//let bodyHTML = await page.evaluate(() =>  document.documentElement.outerHTML);

			res.send(html);

			// Caching
			await fs.writeFile(path.join(sFilePath), html, err => {
				if (err) {
					console.error(err);
					return;
				}
				//file written successfully
			})

			await browser.close();

		})();
	} else {
		res.send('Invalid url: ' + urlToScrape);
	}

});

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
	//console.log('cache_lifespan='+global['cache_lifespan']);
	if (fs.existsSync(path)) {
		//file exists
		var aStats = fs.statSync(path);
		var iModifiedTime = Number(aStats.mtime);
		if ((iModifiedTime + Number(1000 * global['cache_lifespan'])) > new Date().getTime()) {
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
			global[param] = (Number(params.get(param)) > 0) ? Number(params.get(param)) : oUrlParams[param];
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
    http.get("http://hitech-land.herokuapp.com");
}, 300000); // Call app every 5 minutes (300000)