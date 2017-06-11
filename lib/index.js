// Deps =========================================
const Scooter = require('scooter');
const pkg = require('~/package.json');
const moment = require('moment');
const joi = require('joi');
const hoek = require('hoek');
const fs = require('fs-extra');
const os = require('os');
const chalk = require('chalk');
const prettyjson = require('prettyjson');
const stringify = require('fast-safe-stringify');

// Internals Scope ==============================
const internals = { };

// Validation Shemas ============================
internals.schemas = {
    plugin: joi.object().keys({
        path: joi.string().required(),
        sessionKey: joi.string().default(null),
        stopTimeoutMsec: joi.number().default(15 * 1000),
        silent: joi.boolean().default(false),
        signals: joi.boolean().default(true),
        exceptions: joi.boolean().default(true)
    }),
    write: joi.object().required().keys({
        async: joi.boolean().default(true),
        request: joi.object().default(null),
        entry: joi.object().required().keys({
            message: joi.string().required(),
            data: joi.object(),
            error: joi.object().default(null),
            tags: joi.array().required().items(
                joi.string().required().valid(['info', 'error', 'warning', 'request', 'plugin']),
                joi.string()
            )
        })
    })
};

// Write to file ================================
internals.write = (options, callback) => {

    const done = callback || hoek.ignore; // Done callback
    const result = joi.validate(options, internals.schemas.write, { allowUnknown: true }); // Validate and merge options

    //== Check if schema validation had an error
    if (result.error !== null) {
        internals.console(result.error, 'error');

        return done(result.error);
    }

    let logString = '';
    const { path, silent } = internals.settings;
    const { entry, request, async } = result.value;
    const now = moment();
    const type = entry.tags.shift();
    const filePath = `${ path }/${ type }.log`;
    const log = {
        type,
        tags: entry.tags,
        message: entry.message,
        timestamp: now.valueOf(),
        host: os.hostname()
    };

    // Append Data
    if (entry.data) {
        log.data = entry.data;
    }

    //== Has request?
    if (request) {
        // Create data from request
        const scoot = request.plugins.scooter.toJSON();
        const { method, info, headers, route } = request;
        const req = {
            method,
            remoteIP: info.remoteAddress,
            routePath: route.path,
            referrer: info.referrer,
            received: request.info.received,
            elapsed: Date.now() - request.info.received,
            userAgent: {
                browser: `${scoot.family} v${scoot.major}.${scoot.minor}.${scoot.patch}`,
                device: `${scoot.device.family} v${scoot.device.major}.${scoot.device.minor}.${scoot.device.patch}`,
                os: `${scoot.os.family} v${scoot.os.major}.${scoot.os.minor}.${scoot.os.patch}`
            }
        };

        // Add auth data
        if (request.auth.credentials) {
            req.auth = {
                isAuthenticated: request.auth.isAuthenticated,
                credentials: request.auth.credentials
            };
        }

        // Add request vars to log object
        Object.assign(log, { request: req });
    }

    //== Has Error?
    if (entry.error) {
        log.error = entry.error;
    }

    //== Write to file Sync
    if (!async) {
        fs.outputJsonSync(filePath, log, { flag: 'a' });
        internals.console(log, type);

        return done();
    }

    //== Write to file Async
    fs.outputJson(filePath, log, { flag: 'a' });

    //== Log to console if not silent
    if (!silent) {
        if (type === 'error') {
            internals.console(log, type);
        } else {
            console.log(stringify(log));
        }
    }

    //== All done
    // return done();
};

// Write to console =============================
internals.console = (data = {}, type = 'info', callback) => {

    let bg;
    const done = callback || hoek.ignore;

    switch (type.toLowerCase()) {
        case 'error':
            bg = 'bgRed';
            break;
        case 'info':
            bg = 'bgBlue';
            break;
        case 'warn':
            bg = 'bgYellow';
            break;
        default:
            bg = 'bgGreen';
            break;
    }

    // Log to console
    if (!internals.settings.silent) {
        console.log(chalk[bg].bold.white(`\n// ${ type } =====`));
        console.log(`${ prettyjson.render(data) }\n`);
    }

    return done();
};

// Normalize error data =========================
internals.formatError = event => {

    const errInstance = event instanceof Error;

    if (!('error' in event) && errInstance === false) {
        return event;
    }

    let error = {};
    let message = errInstance ? event.message: null;
    let stack = null;
    const err = errInstance ? event : event.error;

    if (err.isJoi) {
        message = err.details.message;
    }

    if (err.isBoom) {
        message = err.message
    }

    stack = err.stack;
    error = { message, stack };

    return { error };
};

// Process signals logging ======================
internals.signals = (server) => {

    const shutdown = (signal) => {

        return () => {

            const async = false;
            const entry = {
                tags: ['info', 'app', 'signal', signal.toLowerCase()],
                message: `Server shutdown on signal: ${ signal }`
            };

            internals.write({ entry, async });
            server.root.stop({ timeout: internals.settings.stopTimeoutMsec }, process.exit);
        };
    };

    process.once('SIGTERM', shutdown('SIGTERM'));
    process.once('SIGINT', shutdown('SIGINT'));
};

// Exceptions handling ==========================
internals.exceptions = (server) => {

    const uncaught = err => {

        const { error } = internals.formatError(err);

        return {
            error,
            message: err.message
        };
    };

    process.once('uncaughtException', err => {

        const write = {
            entry: Object.assign(uncaught(err), { tags: ['error', 'uncaught'] }),
            async: false
        };

        return internals.write(write, () => process.exit(1));
    });
    process.on('unhandledRejection', err => {

        const write = {
            entry: Object.assign(uncaught(err), { tags: ['error', 'uncaught', 'promise'] }),
            async: false
        };

        internals.write(write);
    });
};

// Subscribe to server events ===================
internals.events = (server) => {

    const { write } = internals;
    const formatEvent = evt => {

        const result = internals.formatError(evt);

        // Uplift message to 1st level in the entry
        if ('message' in evt.data) {
            result.message = evt.data.message;
            delete evt.data.message;
        }

        return result;
    };

    // Server extensions
    server.ext('onPostStop', (srv, nextEvt) => {

        const uptime = Date.now() - srv.info.created;
        const entry = {
            tags: ['info', 'app', 'stop'],
            message: 'Server onPostStop - connection listeners are stopped',
            data: { uptime }
        };

        process.removeAllListeners('SIGTERM');
        process.removeAllListeners('SIGINT');

        return write({ entry }, nextEvt);
    });

    // Server events
    server.on('log', (event) => {

        const entry = formatEvent(event);

        return write({ entry });
    });
    server.on('request', (request, event) => {

        const code = request.raw.res.statusCode;
        const state = Object.keys(request.state)[0];
        const entry = formatEvent(event);

        // If Client or Server errors
        if (code >= 400) {
            entry.error = (entry.error) ? entry.error : {};
            entry.error = Object.assign(entry.error, request.response.source);
        }

        // Check if session is available
        if (state && request[state].id) {
            entry.sessionId = request[state].id;
        }

        // If request tag is not presetn, add it
        if (entry.tags.indexOf('request') === -1) {
            entry.tags = ['request', request.route.path, ...entry.tags];
        }

        // If no data, dont send anything
        if (!Object.keys(entry.data).length) {
            delete entry.data;
        }

        return write({ entry, request });
    });
    server.on('request-error', (request, err) => {

        const entry = internals.formatError({ error: err });

        entry.message = 'Request error';
        entry.tags = ['error', 'request', request.route.path];

        return write({ entry, request });
    });
};

// Exposing Routes ==============================
exports.register = (plugin, options, next) => {

    // Validate and merge options
    const opts = joi.validate(options, internals.schemas.plugin);

    // Check if schema validation had an error
    if (opts.error !== null) {
        return next(opts.error.message);
    }

    plugin.register(Scooter, err => {

        // Settings to be available in internals
        const { signals, exceptions } = internals.settings = opts.value;
        const server = plugin.root;


        // Should we handle process signals?
        if (signals) {
            internals.signals(server);
        }

        // Should we handle exceptions?
        if (exceptions) {
            internals.exceptions(server);
        }

        // Handle server events
        internals.events(server);

        // Exposing methods
        plugin.expose('write', internals.write);
        plugin.expose('console', internals.console);
    });

    // Move along
    return next();
};

// Exposing Plugin Attributes ===================
exports.register.attributes = { pkg };
