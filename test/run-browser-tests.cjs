// Headless runner for the jQuery QUnit suite (test/index.html).
// Upstream ran this suite in real browsers via TestSwarm; on CI we drive it
// with headless Chrome (puppeteer) and print per-test results plus a summary.
// Usage: node test/run-browser-tests.cjs <url-of-test/index.html>
"use strict";

var puppeteer = require( "puppeteer" );

var url = process.argv[ 2 ],
	overallTimeoutMs = 40 * 60 * 1000;

function reporter( type, data ) {
	if ( type === "assert" ) {
		console.log( "    FAILED ASSERTION: " + ( data.message || "(no message)" ) );
		if ( data.expected !== undefined ) {
			console.log( "      expected: " + data.expected );
			console.log( "      actual:   " + data.actual );
		}
		if ( data.source ) {
			console.log( "      source: " + String( data.source ).split( "\n" )[ 0 ] );
		}
	} else if ( type === "test" ) {
		console.log( ( data.failed ? "FAIL " : "PASS " ) + data.module + " :: " + data.name +
			" (" + data.passed + "/" + data.total + " assertions passed)" );
	}
}

( async function() {
	var browser = await puppeteer.launch( {
			headless: "new",
			args: [ "--no-sandbox", "--disable-dev-shm-usage",
				"--disable-features=DeprecateUnload,DeprecateUnloadByAllowList" ]
		} ),
		page = await browser.newPage(),
		tests = { total: 0, failed: 0 },
		failedTests = [],
		resolveDone,
		done = new Promise( function( resolve ) {
			resolveDone = resolve;
		} ),
		timer = setTimeout( function() {
			console.log( "TIMEOUT: test suite did not finish within " +
				( overallTimeoutMs / 60000 ) + " minutes" );
			resolveDone( null );
		}, overallTimeoutMs ),
		result;

	page.on( "pageerror", function( e ) {
		console.log( "[pageerror] " + e.message );
	} );
	page.on( "console", function( m ) {
		if ( m.type() === "error" || m.type() === "warning" || m.type() === "warn" ) {
			console.log( "[console." + m.type() + "] " + m.text().slice( 0, 300 ) );
		}
	} );
	page.on( "dialog", function( d ) {
		d.dismiss();
	} );

	await page.exposeFunction( "__qunitReport", function( type, data ) {
		if ( type === "test" ) {
			tests.total++;
			if ( data.failed ) {
				tests.failed++;
				failedTests.push( data.module + " :: " + data.name );
			}
		}
		if ( type === "done" ) {
			resolveDone( data );
			return;
		}
		reporter( type, data );
	} );

	await page.evaluateOnNewDocument( function() {
		var q;
		if ( window !== window.top ) {
			return;
		}
		function hook( Q ) {
			if ( !Q || Q.__headlessHooked ) {
				return;
			}
			Q.__headlessHooked = true;
			Q.log( function( d ) {
				if ( !d.result ) {
					window.__qunitReport( "assert", {
						module: d.module,
						name: d.name,
						message: d.message,
						actual: d.actual === undefined ? undefined : String( d.actual ),
						expected: d.expected === undefined ? undefined : String( d.expected ),
						source: d.source
					} );
				}
			} );
			Q.testDone( function( d ) {
				window.__qunitReport( "test", {
					module: d.module,
					name: d.name,
					failed: d.failed,
					passed: d.passed,
					total: d.total
				} );
			} );
			Q.done( function( d ) {
				window.__qunitReport( "done", d );
			} );
		}
		Object.defineProperty( window, "QUnit", {
			configurable: true,
			get: function() {
				return q;
			},
			set: function( v ) {
				q = v;
				hook( v );
			}
		} );
	} );

	console.log( "Running jQuery QUnit suite: " + url );
	await page.goto( url, { waitUntil: "load", timeout: 120000 } );
	result = await done;
	clearTimeout( timer );
	await browser.close();

	console.log( "" );
	console.log( "==================== QUnit summary ====================" );
	if ( !result ) {
		console.log( "Tests run: " + tests.total + ", tests failed: " + tests.failed +
			" (suite timed out)" );
		process.exit( 1 );
	}
	console.log( "Tests: " + tests.total + " run, " + ( tests.total - tests.failed ) +
		" passed, " + tests.failed + " failed" );
	console.log( "Assertions: " + result.total + " total, " + result.passed + " passed, " +
		result.failed + " failed (runtime " + result.runtime + " ms)" );
	if ( failedTests.length ) {
		console.log( "Failed tests:" );
		failedTests.forEach( function( t ) {
			console.log( "  - " + t );
		} );
	}
	process.exit( result.failed || tests.failed || tests.total === 0 ? 1 : 0 );
} )().catch( function( e ) {
	console.log( "Runner error: " + ( e && e.stack || e ) );
	process.exit( 1 );
} );
