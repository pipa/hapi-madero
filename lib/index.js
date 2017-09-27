// Deps =========================================
const Joi = require('joi');
const Fs = require('fs-extra');
const Os = require('os');
const Chalk = require('chalk');
const Useragent = require('useragent');
const prettyjson = require('prettyjson');
const path = require('path');
const stringify = require('fast-safe-stringify');
const pkg = require('../package.json');

// Internals Scope ==============================
const internals = { };

// Validation Shemas ============================
internals.schemas = {
    plugin: Joi.object().keys({
        path: Joi.string().default(path.resolve(path.dirname(require.main.filename), './logs')),
        stopTimeoutMsec: Joi.number().default(15 * 1000),
        silent: Joi.boolean().default(false),
        signals: Joi.boolean().default(true),
        exceptions: Joi.boolean().default(true),
        timestampKey: Joi.string().default('@timestamp'),
        unixStamp: Joi.boolean().default(false)
    }),
    write: Joi.object().required().keys({
        async: Joi.boolean().default(true),
        request: Joi.object().default(null),
        entry: Joi.object().required().keys({
            message: Joi.string().required(),
            error: Joi.object(),
            tags: Joi.array().required().items(
                Joi.string().required().valid(['info', 'error', 'warning', 'request', 'plugin']),
                Joi.string()
            )
        })
    })
};

// Write to file ================================
internals.write = (options, callback) => {

    const done = callback || function () {}; // Done callback
    const result = Joi.validate(options, internals.schemas.write, { allowUnknown: true }); // Validate and merge options

    try {
        //== Check if schema validation had an error
        if (result.error !== null) {
            internals.console(result.error, 'error');

            return done(result.error);
        }

        const { path, silent, timestampKey, unixStamp } = internals.settings;
        const { entry, request, async } = result.value;
        const now = unixStamp ? Date.now() : new Date().toISOString();
        const type = entry.tags.shift();
        const filePath = `${ path }/${ type }.log`;
        const log = Object.assign({}, entry, {
            type,
            [timestampKey]: now,
            host: Os.hostname()
        });

        //== Has request?
        if (request) {
            // Create data from request
            const scoot = Useragent.lookup(request.headers['user-agent']);
            const { method, info, route } = request;
            const remoteIP = request.headers['x-forwarded-for'] || info.remoteAddress;
            const req = {
                method, remoteIP,
                routePath: route.path,
                url: request.url.href,
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
            Fs.outputJsonSync(filePath, log, { flag: 'a' });
            internals.console(log, type);

            return done();
        }

        //== Write to file Async
        Fs.outputJson(filePath, log, { flag: 'a' });

        //== Log to console if not silent
        if (!silent) {
            if (type === 'error') {
                internals.console(log, type);
            } else {
                console.log(stringify(log));
            }
        }

        //== All done
        return done();
    } catch (up) {
        console.log('There was an error:', up);

        throw up; // haha!
    }
};

// Write to console =============================
internals.console = (data = {}, type = 'info', callback) => {

    let bg;
    const done = callback || function () {};

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
        console.log(Chalk[bg].bold.white(`\n// ${ type } =====`));
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
    let message = errInstance ? event.message : null;
    let stack = null;
    const err = errInstance ? event : event.error;

    if (err.isJoi) {
        message = err.details.message;
    }

    if (err.isBoom) {
        message = err.message;
    }

    stack = err.stack;
    error = { message, stack };
    error.isServer = err.isServer;
    error.isDeveloperError = err.isDeveloperError;

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
internals.exceptions = () => {

    const uncaught = (err, promise) => {

        const { error } = internals.formatError(err);
        const result = {
            error,
            message: err.message
        };

        if (promise) {
            result.promise = promise;
        }

        return result;
    };

    process.on('uncaughtException', err => {

        const write = {
            entry: Object.assign(uncaught(err), { tags: ['error', 'uncaught'] }),
            async: false
        };

        return internals.write(write, () => process.exit(1));
    });
    process.on('unhandledRejection', (reason, promise) => {

        const write = {
            entry: Object.assign(uncaught(reason, promise), { tags: ['error', 'uncaught', 'promise'] }),
            async: false
        };

        internals.write(write);
    });
};

// Subscribe to server events ===================
internals.events = (server) => {

    const { write } = internals;
    const formatEvent = evt => {

        const _entry = internals.formatError(evt);
        const result = typeof evt.data === 'string'
            ? Object.assign({}, _entry, { message: evt.data })
            : Object.assign({}, _entry, evt.data);

        // Removing Unneeded fields
        delete result.data;
        delete result.timestamp;
        delete result.internal;

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
        const state = request.state && Object.keys(request.state).length ? Object.keys(request.state)[0] : false;
        const entry = formatEvent(event);

        // If Client or Server errors
        if (code >= 400) {
            entry.error = (entry.error) ? entry.error : {};
            entry.error = Object.assign(entry.error, request.response.source.context);
        }

        // Check if session is available
        if (state && state in request && 'id' in request[state]) {
            entry.sessionId = request[state].id;
        }

        // If request tag is not presetn, add it
        if (entry.tags.indexOf('request') === -1) {
            entry.tags = ['request', request.url.href, ...entry.tags];
        }

        return write({ entry, request });
    });
    server.on('request-error', (request, err) => {

        const entry = internals.formatError({ error: err });

        entry.message = 'Request error';
        entry.tags = ['error', 'request', request.url.href];

        return write({ entry, request });
    });
};

// Exposing Routes ==============================
exports.register = (plugin, options, next) => {

    // Validate and merge options
    const opts = Joi.validate(options, internals.schemas.plugin);

    // Check if schema validation had an error
    if (opts.error !== null) {
        return next(opts.error.message);
    }

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

    // Move along
    return next();
};

// Exposing Plugin Attributes ===================
exports.register.attributes = { pkg };
