# hapi-madero


[![Build Status](https://travis-ci.org/pipa/hapi-madero.svg?branch=master)](https://travis-ci.org/pipa/hapi-madero)
[![Dependencies Status](https://david-dm.org/pipa/hapi-madero.svg)](https://david-dm.org/pipa/hapi-madero)

[![NPM](https://nodei.co/npm/hapi-madero.png)](https://nodei.co/npm/hapi-madero/)

A HapiJS plugin for writing logs to files

## Installing

```
npm install hapi-madero
```

## Usage

These instructions will get you a copy of the project up and running on your local machine for development and testing purposes. See deployment for notes on how to deploy the project on a live system.

```js
// Deps =========================================
const Hapi = require('hapi');
const Madero = require('hapi-madero');

// Server =======================================
const server = new Hapi.Server({ debug: false });

// Server Connection ============================
server.connection({ port: 3000, host: 'localhost' });

// Adding Madero Plugin =========================
server.register({ register: Madero, options: { path: './logs' } }, err => {

	if (err) {
        console.log('[ERROR]:', 'Failed loading plugin: hapi-madero,', err);
    }

    server.route({
        method: 'GET',
        path: '/',
        handler: (request, reply) => {

            request.log(['test'], { message: 'test', foo: 'bar' });
            return reply('ok')
        }
    });

    server.start(err => {

        if (err) {
            server.plugins['hapi-madero'].console(err, 'error');
        }
        server.log(['info', 'app', 'start'], {
            message: `Hapi-Madero server started`,
            port: server.info.port,
            protocol: server.info.protocol,
            uri: server.info.uri,
            address: server.info.address
        });
    });
});
```

## Plugin Options

#### `path` - String - (required)
Madero needs to know where to save the files, this will tell madero where the log files will be saved. I.E.: `./logs` will create a directory in the project root called 'logs'.

#### `stopTimeoutMsec` - Number
Overrides the timeout in millisecond before forcefully terminating a connection. Defaults to `15000` (15 seconds)

#### `silent` - Boolean
If you do not want to see every log in the console. Defaults to `false`

#### `signals` - Boolean
Whether you want madero to handle `SIGTERM` or `SIGINT`. Defaults to `true`

#### `exceptions` - Boolean
Whether you want madero to handle `uncaughtException` or `unhandledRejection`. Defaults to `true`

## License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details
