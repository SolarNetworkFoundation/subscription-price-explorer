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

  /**
   * Flag to include OCPP costs.
   * @type boolean
   */
  var includeOcpp = false;

  /**
   * Flag to include OSCP costs.
   * @type boolean
   */
  var includeOscp = false;

  /**
   * Flag to include DNP3 costs.
   * @type boolean
   */
  var includeDnp3 = false;

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
    const ocppChargersPerMonthCount = configurationNumber("ocppChargerCount");
    const oscpCapacityGroupsPerMonthCount = configurationNumber("oscpCapacityGroupCount");
    const dnp3DataPointsPerMonthCount = configurationNumber("dnp3DataPointCount");

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

      let ocppChargerCost = includeOcpp
        ? calculateCost(ocppChargersPerMonthCount, tiers.get("ocpp-chargers"))
        : 0;
      rowData.set("ocppChargerCost", costFormat.format(ocppChargerCost));

      let oscpCapacityGroupCost = includeOscp
        ? calculateCost(oscpCapacityGroupsPerMonthCount, tiers.get("oscp-cap-groups"))
        : 0;
      rowData.set("oscpCapacityGroupCost", costFormat.format(oscpCapacityGroupCost));

      let dnp3DataPointCost = includeDnp3
        ? calculateCost(dnp3DataPointsPerMonthCount, tiers.get("dnp3-data-points"))
        : 0;
      rowData.set("dnp3DataPointCost", costFormat.format(dnp3DataPointCost));

      let monthCost = Number(
        Number(
          propInCostPerMonth +
            datumQueriedCostPerMonth +
            datumDaysStoredCost +
            ocppChargerCost +
            oscpCapacityGroupCost +
            dnp3DataPointCost
        ).toFixed(2)
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
    } else if (key === "datum-days-stored") {
      return "Datum Days Stored";
    } else if (key === "ocpp-chargers") {
      return "OCPP Chargers";
    } else if (key === "oscp-cap-groups") {
      return "OSCP Capacity Groups";
    } else if (key === "dnp3-data-points") {
      return "DNP3 Data Points";
    } else {
      return "?";
    }
  }

  function subscriptionMillionsBase(key) {
    if (key === "ocpp-chargers" || key === "oscp-cap-groups" || key === "dnp3-data-points") {
      return 0.000001;
    } else if (key === "datum-props-in") {
      return 1;
    } else if (key === "datum-out") {
      return 10;
    } else {
      return 100;
    }
  }

  function setupSubscriptionRatesTable(table, hiddenTable) {
    const templateRow = table.children("thead").children("tr.template");
    const rowData = new Map();
    for (let [key, tierData] of tiers) {
      rowData.set("subscriptionName", subscriptionName(key));
      const millionsBase = subscriptionMillionsBase(key);
      const tbody = $("<tbody>");
      tbody.addClass(key);
      for (let i = 0, len = tierData.length; i < len; i += 1) {
        const tier = tierData[i];
        const nextTier = i + 1 < len ? tierData[i + 1] : undefined;

        rowData.set("name", `${i + 1}`);
        rowData.set("start", `> ${numFormat.format(tier.start)}`);
        if (millionsBase < 1) {
          rowData.set("rate", `${costFormat.format(tier.rate)} / each`);
        } else {
          rowData.set(
            "rate",
            `${costFormat.format(tier.rate * millionsBase * 1000000)} / ${millionsBase} million`
          );
        }

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
        replaceTemplateProperties(row, rowData);
        tbody.append(row);
      }
      if (key === "ocpp-chargers" || key === "oscp-cap-groups" || key === "dnp3-data-points") {
        hiddenTable.append(tbody);
      } else {
        table.append(tbody);
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

  function toggleShowOcpp() {
    let btn = $(this);
    let showAll = btn.hasClass("inc-ocpp");
    if (showAll) {
      $(".ocpp.hidden").removeClass("hidden");
    } else {
      $(".ocpp").addClass("hidden");
    }
    toggleTierRateGroup("ocpp-chargers", showAll);
    btn.toggleClass("inc-ocpp", !showAll);
    includeOcpp = showAll;
    recalc();
    return false;
  }

  function toggleShowOscp() {
    let btn = $(this);
    let showAll = btn.hasClass("inc-oscp");
    if (showAll) {
      $(".oscp.hidden").removeClass("hidden");
    } else {
      $(".oscp").addClass("hidden");
    }
    toggleTierRateGroup("oscp-cap-groups", showAll);
    btn.toggleClass("inc-oscp", !showAll);
    includeOscp = showAll;
    recalc();
    return false;
  }

  function toggleShowDnp3() {
    let btn = $(this);
    let showAll = btn.hasClass("inc-dnp3");
    if (showAll) {
      $(".dnp3.hidden").removeClass("hidden");
    } else {
      $(".dnp3").addClass("hidden");
    }
    toggleTierRateGroup("dnp3-data-points", showAll);
    btn.toggleClass("inc-dnp3", !showAll);
    includeDnp3 = showAll;
    recalc();
    return false;
  }

  function toggleTierRateGroup(key, show) {
    var src, dest;
    if (show) {
      src = $("#tier-rates-hidden");
      dest = $("#tier-rates");
    } else {
      dest = $("#tier-rates-hidden");
      src = $("#tier-rates");
    }
    src.find("tbody." + key).appendTo(dest);
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

    $("#toggle-inc-ocpp").on("change", toggleShowOcpp);
    $("#toggle-inc-oscp").on("change", toggleShowOscp);
    $("#toggle-inc-dnp3").on("change", toggleShowDnp3);
    $("#toggle-years-only").on("change", toggleShowAllMonths);

    setupSubscriptionRatesTable($("#tier-rates"), $("#tier-rates-hidden"));
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
    ["ocpp-chargers", 0, 2],
    ["ocpp-chargers", 250, 1],
    ["ocpp-chargers", 12500, 0.5],
    ["ocpp-chargers", 500000, 0.3],
    ["oscp-cap-groups", 0, 50],
    ["oscp-cap-groups", 30, 30],
    ["oscp-cap-groups", 100, 15],
    ["oscp-cap-groups", 300, 10],
    ["dnp3-data-points", 0, 1],
    ["dnp3-data-points", 20, 0.6],
    ["dnp3-data-points", 100, 0.4],
    ["dnp3-data-points", 500, 0.2],
  ];

  app = samplerApp(config).start();

  window.onbeforeunload = function () {
    app.stop();
  };

  return app;
}
