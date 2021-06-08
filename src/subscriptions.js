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
var samplerApp = function (options) {
  const self = { version: "1.0.1" };
  const config = Object.assign({ numMonths: 60 }, options);

  /**
   * A Map of tier key -> [{start:x, rate:y},...] array.
   *
   * @type Map
   */
  var tiers;

  /**
   * The monthly costs table.
   *
   * @type JQuery
   */
  var monthCostsTable;

  /**
   * The input form.
   *
   * @type HTMLFormElement
   */
  var form;

  /**
   * Flag to show/hide all months.
   *
   * @type boolean
   */
  var showAllMonths = false;

  const numFormat = new Intl.NumberFormat("en-NZ");
  const costFormat = new Intl.NumberFormat("en-NZ", { style: "currency", currency: "NZD" });
  var recalcTimer;

  /**
   * Get a configuration form field number.
   *
   * @param {String} key the form element key
   * @param {Number} [val] the value to set
   * @returns {Number} the field value
   */
  function configurationNumber(key, val) {
    if (val !== undefined) {
      form[key].value = val;
      return val;
    }
    return Number(form[key].value || form[key].placeholder);
  }

  /**
   * Replace element contents with `data-tprop` attributes matching keys in a Map.
   *
   * @param {JQuery} el the element to replace template values on
   * @param {Map} data the data template values
   */
  function replaceTemplateProperties(el, data) {
    var sel;
    for (let [k, v] of data) {
      sel = `[data-tprop='${k}']`;
      el.find(sel).addBack(sel).text(v);
    }
  }

  /**
   * Calculate the cost of a usage against a set of tier rates.
   *
   * We assume the tiers are ordered, and start at 0.
   *
   * @param {Number} count the tier usage
   * @param {Array<Object>} tiers array of tier data with start/rate props (order assumed)
   */
  function calculateCost(count, tiers) {
    var cost = 0;
    var prevTier = tiers[0];
    for (let i = 1, len = tiers.length; i < len && count > 0; i += 1) {
      let tier = tiers[i];
      let tierCount = Math.min(count, tier.start);
      cost += tierCount * prevTier.rate;
      count -= tierCount;
      prevTier = tier;
    }
    cost += count * prevTier.rate; // catch last tier
    return cost;
  }

  function recalc() {
    const templateRow = monthCostsTable.children("thead").children("tr.template");
    const tbody = monthCostsTable.children("tbody");

    const nodeCount = configurationNumber("nodeCount");
    const sourcesPerNodeCount = configurationNumber("sourcesPerNodeCount");
    const datumPerSourcePerHourCount = configurationNumber("datumPerSourcePerHourCount");
    const propertiesPerDatumCount = configurationNumber("propertiesPerDatumCount");
    const queriedDatumPerSourcePerHourCount = configurationNumber(
      "queriedDatumPerSourcePerHourCount"
    );

    const datumPerHourCount = configurationNumber(
      "datumPerHourCount",
      nodeCount * sourcesPerNodeCount * datumPerSourcePerHourCount
    );
    const propertiesPerHourCount = configurationNumber(
      "propertiesPerHourCount",
      datumPerHourCount * propertiesPerDatumCount
    );

    const hoursPerMonth = (24 * 365) / 12;

    const propInCountPerMonth = propertiesPerHourCount * hoursPerMonth;
    const propInCostPerMonth = calculateCost(propInCountPerMonth, tiers.get("datum-props-in"));
    const datumQueriedPerMonth =
      nodeCount * sourcesPerNodeCount * queriedDatumPerSourcePerHourCount * hoursPerMonth;
    const datumQueriedCostPerMonth = calculateCost(datumQueriedPerMonth, tiers.get("datum-out"));

    const rowData = new Map();
    rowData.set("propInCount", numFormat.format(propInCountPerMonth));
    rowData.set("datumQueriedCount", numFormat.format(datumQueriedPerMonth));
    rowData.set("propInCost", costFormat.format(propInCostPerMonth));
    rowData.set("datumQueriedCost", costFormat.format(datumQueriedCostPerMonth));

    var runningTotalCost = 0;

    tbody.empty();
    for (let monthNum = 1, len = config.numMonths; monthNum <= len; monthNum += 1) {
      rowData.set("year", Math.ceil(monthNum / 12));
      rowData.set("month", monthNum);

      let datumDaysStoredCount = Math.floor(
        datumPerHourCount * hoursPerMonth * monthNum + // raw
          hoursPerMonth * monthNum + // hour agg
          (hoursPerMonth / 24) * monthNum + // day agg
          monthNum // month add
      );
      rowData.set("datumDaysStoredCount", numFormat.format(datumDaysStoredCount));

      let datumDaysStoredCost = calculateCost(datumDaysStoredCount, tiers.get("datum-days-stored"));
      rowData.set("datumDaysStoredCost", costFormat.format(datumDaysStoredCost));

      let monthCost = Number(
        Number(propInCostPerMonth + datumQueriedCostPerMonth + datumDaysStoredCost).toFixed(2)
      );
      rowData.set("monthCost", costFormat.format(monthCost));

      runningTotalCost += monthCost;
      rowData.set("runningTotalCost", costFormat.format(runningTotalCost));

      let row = templateRow.clone(true);
      row.removeClass("template");
      replaceTemplateProperties(row, rowData);
      if (monthNum % 12 === 0) {
        row.addClass("year-end");
      } else if (!showAllMonths && monthNum > 1) {
        row.addClass("hidden");
      }
      tbody.append(row);
    }
  }

  function subscriptionName(key) {
    if (key === "datum-props-in") {
      return "Properties Posted";
    } else if (key === "datum-out") {
      return "Datum Queried";
    } else {
      return "Datum Days Stored";
    }
  }

  function subscriptionMillionsBase(key) {
    if (key === "datum-props-in") {
      return 1;
    } else if (key === "datum-out") {
      return 10;
    } else {
      return 100;
    }
  }

  function tierDisplayClass(key) {
    if (key === "datum-out") {
      return "table-secondary";
    } else {
      return undefined;
    }
  }

  function setupSubscriptionRatesTable(table) {
    const templateRow = table.children("thead").children("tr.template");
    const tbody = table.children("tbody");
    const rowData = new Map();
    for (let [key, tierData] of tiers) {
      rowData.set("subscriptionName", subscriptionName(key));
      const millionsBase = subscriptionMillionsBase(key);
      const displayClass = tierDisplayClass(key);
      for (let i = 0, len = tierData.length; i < len; i += 1) {
        const tier = tierData[i];
        const nextTier = i + 1 < len ? tierData[i + 1] : undefined;

        rowData.set("name", `${i + 1}`);
        rowData.set("start", `> ${numFormat.format(tier.start)}`);
        rowData.set(
          "rate",
          `${costFormat.format(tier.rate * millionsBase * 1000000)} / ${millionsBase} million`
        );

        if (nextTier) {
          let maxCount = nextTier.start - tier.start;
          rowData.set("maximumCount", numFormat.format(maxCount));
          rowData.set("maximumCost", costFormat.format(maxCount * tier.rate));
        } else {
          rowData.delete("maximumCount");
          rowData.delete("maximumCost");
        }

        let row = templateRow.clone(true);
        row.removeClass("template");
        if (displayClass) {
          row.addClass(displayClass);
        }
        replaceTemplateProperties(row, rowData);
        tbody.append(row);
      }
    }
  }

  function toggleShowAllMonths() {
    let btn = $(this);
    let showAll = btn.hasClass("years");
    if (showAll) {
      monthCostsTable.find("tbody tr.hidden").removeClass("hidden");
    } else {
      monthCostsTable.find("tbody tr:nth-child(n+2)").not(".year-end").addClass("hidden");
    }
    btn.toggleClass("years", !showAll);
    showAllMonths = showAll;
    return false;
  }

  function start() {
    return self;
  }

  function stop() {
    return self;
  }

  function init() {
    monthCostsTable = $("#monthly-costs");
    form = document.getElementById("configuration");

    // disable submit on form
    $(form).on("submit", function () {
      return false;
    });

    // craete map of tier -> [data]
    tiers = new Map();
    options.tierData.forEach((row) => {
      let key = row[0];
      let data = tiers.get(key);
      if (!data) {
        data = [];
        tiers.set(key, data);
      }
      data.push(Object.freeze({ start: row[1], rate: row[2] }));
    });

    // listen for changes on all non-derived form elements to recalculate output
    $("input:not(.derived)").on("keyup change", function () {
      // add a small delay after each keypress before actually attempting to recalculate
      if (recalcTimer) {
        clearTimeout(recalcTimer);
      }
      recalcTimer = setTimeout(recalc, 500);
    });

    $("#toggle-years-only").on("change", toggleShowAllMonths);

    setupSubscriptionRatesTable($("#tier-rates"));
    recalc();

    return Object.defineProperties(self, {
      start: { value: start },
      stop: { value: stop },
    });
  }

  return init();
};

export default function startApp() {
  var config = {};
  config.tierData = [
    ["datum-props-in", 0, 0.000005],
    ["datum-props-in", 500000, 0.000003],
    ["datum-props-in", 10000000, 0.0000008],
    ["datum-props-in", 500000000, 0.0000002],
    ["datum-out", 0, 0.0000001],
    ["datum-out", 10000000, 0.00000004],
    ["datum-out", 1000000000, 0.000000004],
    ["datum-out", 100000000000, 0.000000001],
    ["datum-days-stored", 0, 0.00000005],
    ["datum-days-stored", 10000000, 0.00000001],
    ["datum-days-stored", 1000000000, 0.000000003],
    ["datum-days-stored", 100000000000, 0.000000002],
  ];

  app = samplerApp(config).start();

  window.onbeforeunload = function () {
    app.stop();
  };

  return app;
}
