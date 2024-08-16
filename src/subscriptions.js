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
  const self = { version: "1.5.0" };
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
   * Flag to include SolarFlux costs.
   * @type boolean
   */
  var includeFlux = false;

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

  /**
   * Flag to include OAuth costs.
   * @type boolean
   */
  var includeOAuth = false;

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
      let tierCount = Math.min(count, tier.start - prevTier.start);
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
    const instructionsIssuedPerNodePerMonthCount = configurationNumber(
      "instructionsIssuedPerNodePerMonthCount"
    );
    const fluxInPerMonthCount = configurationNumber("fluxDataIn");
    const fluxOutPerMonthCount = configurationNumber("fluxDataOut");
    const ocppChargersPerMonthCount = configurationNumber("ocppChargerCount");
    const oscpCapacityGroupsPerMonthCount = configurationNumber("oscpCapacityGroupCount");
    const oscpCapacityPerMonthCount = configurationNumber("oscpCapacity");
    const dnp3DataPointsPerMonthCount = configurationNumber("dnp3DataPointCount");
    const oauthCredsPerMonthCount = configurationNumber("oauthCredentialCount");

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
    const instructionsIssuedPerMonth = instructionsIssuedPerNodePerMonthCount * nodeCount;
    const instructionsIssuedCostPerMonth = calculateCost(
      instructionsIssuedPerMonth,
      tiers.get("instr-issued")
    );

    const rowData = new Map();
    rowData.set("propInCount", numFormat.format(propInCountPerMonth));
    rowData.set("datumQueriedCount", numFormat.format(datumQueriedPerMonth));
    rowData.set("propInCost", costFormat.format(propInCostPerMonth));
    rowData.set("datumQueriedCost", costFormat.format(datumQueriedCostPerMonth));
    rowData.set("instructionsIssuedCost", costFormat.format(instructionsIssuedCostPerMonth));

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

      let fluxDataInCost = includeFlux
        ? calculateCost(fluxInPerMonthCount, tiers.get("flux-bytes-in"))
        : 0;
      rowData.set("fluxDataInCost", costFormat.format(fluxDataInCost));

      let fluxDataOutCost = includeFlux
        ? calculateCost(fluxOutPerMonthCount, tiers.get("flux-bytes-out"))
        : 0;
      rowData.set("fluxDataOutCost", costFormat.format(fluxDataOutCost));

      let ocppChargerCost = includeOcpp
        ? calculateCost(ocppChargersPerMonthCount, tiers.get("ocpp-chargers"))
        : 0;
      rowData.set("ocppChargerCost", costFormat.format(ocppChargerCost));

      let oscpCapacityGroupCost = includeOscp
        ? calculateCost(oscpCapacityGroupsPerMonthCount, tiers.get("oscp-cap-groups"))
        : 0;
      rowData.set("oscpCapacityGroupCost", costFormat.format(oscpCapacityGroupCost));

      let oscpCapacityCost = includeOscp
        ? calculateCost(oscpCapacityPerMonthCount, tiers.get("oscp-cap"))
        : 0;
      rowData.set("oscpCapacityCost", costFormat.format(oscpCapacityCost));

      let dnp3DataPointCost = includeDnp3
        ? calculateCost(dnp3DataPointsPerMonthCount, tiers.get("dnp3-data-points"))
        : 0;
      rowData.set("dnp3DataPointCost", costFormat.format(dnp3DataPointCost));

      let oauthCredCost = includeOAuth
        ? calculateCost(oauthCredsPerMonthCount, tiers.get("oauth-client-creds"))
        : 0;
      rowData.set("oauthCredCost", costFormat.format(oauthCredCost));

      let monthCost = Number(
        Number(
          propInCostPerMonth +
            datumQueriedCostPerMonth +
            datumDaysStoredCost +
            instructionsIssuedCostPerMonth +
            fluxDataInCost +
            fluxDataOutCost +
            ocppChargerCost +
            oscpCapacityGroupCost +
            oscpCapacityCost +
            dnp3DataPointCost +
            oauthCredCost
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
    } else if (key === "instr-issued") {
      return "Instructions Issued";
    } else if (key === "ocpp-chargers") {
      return "OCPP Chargers";
    } else if (key === "oscp-cap-groups") {
      return "OSCP Capacity Groups";
    } else if (key === "oscp-cap") {
      return "OSCP Capacity";
    } else if (key === "dnp3-data-points") {
      return "DNP3 Data Points";
    } else if (key === "oauth-client-creds") {
      return "OAuth Credentials";
    } else if (key === "flux-bytes-in") {
      return "SolarFlux Data In";
    } else if (key === "flux-bytes-out") {
      return "SolarFlux Data Out";
    } else {
      return "?";
    }
  }

  function subscriptionMillionsBase(key) {
    if (
      key === "ocpp-chargers" ||
      key === "oscp-cap-groups" ||
      key === "dnp3-data-points" ||
      key === "oauth-client-creds"
    ) {
      return 0.000001;
    } else if (key === "instr-issued") {
      return 0.1;
    } else if (key === "datum-props-in" || key === "oscp-cap") {
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
        if (millionsBase < 0.1) {
          rowData.set("rate", `${costFormat.format(tier.rate)} / each`);
        } else {
          rowData.set(
            "rate",
            `${costFormat.format(tier.rate * millionsBase * 1_000_000)} / ${millionsBase} million`
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
      if (
        key === "flux-bytes-in" ||
        key === "flux-bytes-out" ||
        key == "oauth-client-creds" ||
        key === "ocpp-chargers" ||
        key === "oscp-cap-groups" ||
        key === "oscp-cap" ||
        key === "dnp3-data-points"
      ) {
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

  function toggleShowFlux() {
    let btn = $(this);
    let showAll = btn.hasClass("inc-flux");
    if (showAll) {
      $(".flux.hidden").removeClass("hidden");
    } else {
      $(".flux").addClass("hidden");
    }
    toggleTierRateGroup("flux-bytes-in", showAll);
    toggleTierRateGroup("flux-bytes-out", showAll);
    btn.toggleClass("inc-flux", !showAll);
    includeFlux = showAll;
    recalc();
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
    toggleTierRateGroup("oscp-cap", showAll);
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

  function toggleShowOauth() {
    let btn = $(this);
    let showAll = btn.hasClass("inc-oauth");
    if (showAll) {
      $(".oauth.hidden").removeClass("hidden");
    } else {
      $(".oauth").addClass("hidden");
    }
    toggleTierRateGroup("oauth-client-creds", showAll);
    btn.toggleClass("inc-oauth", !showAll);
    includeOAuth = showAll;
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

    $("#toggle-inc-flux").on("change", toggleShowFlux);
    $("#toggle-inc-ocpp").on("change", toggleShowOcpp);
    $("#toggle-inc-oscp").on("change", toggleShowOscp);
    $("#toggle-inc-dnp3").on("change", toggleShowDnp3);
    $("#toggle-inc-oauth").on("change", toggleShowOauth);
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
    ["datum-props-in", 0, 0.00000575],
    ["datum-props-in", 500000, 0.00000345],
    ["datum-props-in", 10000000, 0.00000092],
    ["datum-props-in", 500000000, 0.00000023],
    ["datum-out", 0, 0.000000115],
    ["datum-out", 10_000_000, 0.000000046],
    ["datum-out", 1_000_000_000, 0.000000005],
    ["datum-out", 100_000_000_000, 0.000000002],
    ["datum-days-stored", 0, 0.0000000575],
    ["datum-days-stored", 10_000_000, 0.0000000115],
    ["datum-days-stored", 1_000_000_000, 0.00000000345],
    ["datum-days-stored", 100_000_000_000, 0.0000000023],
    ["instr-issued", 0, 0.0001],
    ["instr-issued", 10_000, 0.00005],
    ["instr-issued", 100_000, 0.00002],
    ["instr-issued", 1_000_000, 0.00001],
    ["oauth-client-creds", 0, 10],
    ["oauth-client-creds", 100, 5],
    ["oauth-client-creds", 500, 2.5],
    ["ocpp-chargers", 0, 2],
    ["ocpp-chargers", 250, 1],
    ["ocpp-chargers", 12_500, 0.5],
    ["ocpp-chargers", 500_000, 0.3],
    ["dnp3-data-points", 0, 1],
    ["dnp3-data-points", 20, 0.6],
    ["dnp3-data-points", 100, 0.4],
    ["dnp3-data-points", 500, 0.2],
    ["oscp-cap-groups", 0, 2],
    ["oscp-cap-groups", 100, 1.5],
    ["oscp-cap-groups", 500, 1.25],
    ["oscp-cap-groups", 1_250, 1],
    ["oscp-cap", 0, 0.00003],
    ["oscp-cap", 6_000_000, 0.000025],
    ["oscp-cap", 40_000_000, 0.0000175],
    ["oscp-cap", 100_000_000, 0.00001],
    ["flux-bytes-in", 0, 0.00000001],
    ["flux-bytes-in", 1_000_000_000, 0.000000006],
    ["flux-bytes-in", 10_000_000_000, 0.000000003],
    ["flux-bytes-in", 100_000_000_000, 0.0000000015],
    ["flux-bytes-out", 0, 0.000000009],
    ["flux-bytes-out", 1_000_000_000, 0.000000005],
    ["flux-bytes-out", 10_000_000_000, 0.0000000025],
    ["flux-bytes-out", 100_000_000_000, 0.000000001],
  ];

  app = samplerApp(config).start();

  window.onbeforeunload = function () {
    app.stop();
  };

  return app;
}
