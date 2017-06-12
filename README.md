# hapi-madero


[![Build Status](https://travis-ci.org/pipa/hapi-madero.svg?branch=master)](https://travis-ci.org/pipa/hapi-madero)
[![Dependencies Status](https://david-dm.org/pipa/hapi-madero.svg)](https://david-dm.org/pipa/hapi-madero)

[![NPM](https://nodei.co/npm/hapi-madero.png)](https://nodei.co/npm/hapi-madero/)

> A HapiJS plugin for writing logs to files

HapiJS plugin for writing logs to files. It creates 5 different files, depending on the log type ('info', 'error', 'warning', 'request', 'plugin'). I find it useful for services like splunk which can read logs from the server directly.

## Installing

```
npm install hapi-madero
```

## Usage

Here is a snippet of a basic setup:

```js
// Deps =========================================
const Hapi = require('hapi');
const Madero = require('hapi-madero');

// Server =======================================
const server = new Hapi.Server({ debug: false });

// Server Connection ============================
server.connection({ port: 3000, host: 'localhost' });

// Madero Options ===============================
const maderoOptions = { path: './logs' };

// Adding Madero Plugin =========================
server.register({ register: Madero, options: maderoOptions }, err => {

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

#### `path` - required - String
Madero needs to know where to save the files, this will tell madero where the log files will be saved. I.E.: `./logs` will create a directory in the project root called 'logs'.

#### `stopTimeoutMsec` - Number
Overrides the timeout in millisecond before forcefully terminating a connection. Defaults to `15000` (15 seconds)

#### `silent` - Boolean
If you do not want to see every log in the console. Defaults to `false`

#### `signals` - Boolean
Whether you want madero to handle `SIGTERM` or `SIGINT`. Defaults to `true`

#### `exceptions` - Boolean
Whether you want madero to handle `uncaughtException` or `unhandledRejection`. Defaults to `true`

## Plugin Methods

#### `write` (options, [callback])
##### `options ` - required - Object
Recieves a the following:
- `async` - Boolean - Wether to write to file async or not
- `request` - Object - The request object
- `entry` - Object - The entry that will be written to file. This expects the following:
  - `message`  - required - String - Entry message
  - `tags` - required - Array - Array of strings used to identify the event. Tags are used instead of log levels and provide a much more expressive mechanism for describing and filtering events.
  - `error` - Object - An error object
  - `data` - Object - Any additional data to be saved with the entry


##### `callback` - function
Called once it has finshed writing to file

#### `console` (data, [type, [callback]])
##### `data` - Object
This will be the object that you want to log to console

##### `type` - String
Can be one of: `error`, `info`, `warn`. Defaults to `info`

##### `callback` - function
Called once it has finshed logging to console


## License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE) file for details
