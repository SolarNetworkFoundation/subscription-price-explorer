const Merge = require("webpack-merge");
const BaseConfig = require("./webpack.config.js");

const TerserPlugin = require("terser-webpack-plugin");

const devtool = "source-map"; // cheap-module-eval-source-map

module.exports = Merge(BaseConfig, {
  mode: "production",
  plugins: [
    new TerserPlugin({
      sourceMap: !!devtool
    })
  ]
});
