/* eslint-env es6, browser, commonjs */
"use strict";

import $ from "jquery";

var app;

/**
 * SolarNetwork Foundation Subscription Explorer app.
 *
 * @class
 * @param {Object} [options] optional configuration options
 */
var samplerApp = function(options) {
  const self = { version: "0.1.0" };
  const config = Object.assign(
    {},
    options
  );

  var recalcTimer;

  function recalc() {
    console.log('Recalc now: ' + new Date());
  }

  function start() {
    // TODO
    return self;
  }

  function stop() {
    // TODO
    return self;
  }

  function init() {
    // listen for changes on all non-derived form elements to recalculate output
    $('input:not(.derived)').on('keyup', function() {
      // add a small delay after each keypress before actually attempting to recalculate
      if ( recalcTimer ) {
        clearTimeout(recalcTimer);
      }
      recalcTimer = setTimeout(recalc, 500);
    });

    return Object.defineProperties(self, {
      start: { value: start },
      stop: { value: stop }
    });
  }

  return init();
};

export default function startApp() {
  var config = {};

  app = samplerApp(config).start();

  window.onbeforeunload = function() {
    app.stop();
  };

  return app;
}
