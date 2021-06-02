# SolarNetwork Subscription Price Explorer

This project contains a webapp that helps you explore the SolarNetwork Foundation's subscription pricing.

# Use

Fill in some parameters like the number of nodes and sources to start exploring!

# Building

The build uses [NPM][npm] or [Yarn][yarn]. First, initialize the dependencies:

```shell
# NPM
npm install

# or, Yarn
yarn install
```

Then, the development web server can be started via

```shell
# NPM
npm run start

# or, Yarn
yarn run start
```

and then the app can be reached at [localhost:9000](http://localhost:9000). For a
produciton build, use

```shell
# NPM
npm run build -- --config webpack.prod.js

# or, Yarn
yarn run build --config webpack.prod.js
```

and the app will be built in the `dist` directory.

[npm]: https://www.npmjs.com/
[yarn]: https://yarnpkg.com/
