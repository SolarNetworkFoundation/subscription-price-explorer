import "bootstrap/dist/css/bootstrap.min.css";
import "./subscriptions.css";
import "./favicon.png";

import startApp from "./subscriptions.js";

if (!window.isLoaded) {
  window.addEventListener(
    "load",
    function () {
      startApp();
    },
    false
  );
} else {
  startApp();
}
