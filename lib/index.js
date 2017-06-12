// Deps =========================================
const Scooter = require('scooter');
const Joi = require('joi');
const Hoek = require('hoek');
const Fs = require('fs-extra');
const Os = require('os');
const Chalk = require('chalk');
const prettyjson = require('prettyjson');
const stringify = require('fast-safe-stringify');
const pkg = require('~/package.json');

// Internals Scope ==============================
const internals = { };

// Validation Shemas ============================
internals.schemas = {
    plugin: Joi.object().keys({
        path: Joi.string().required(),
        sessionKey: Joi.string().default(null),
        stopTimeoutMsec: Joi.number().default(15 * 1000),
        silent: Joi.boolean().default(false),
        signals: Joi.boolean().default(true),
        exceptions: Joi.boolean().default(true)
    }),
    write: Joi.object().required().keys({
        async: Joi.boolean().default(true),
        request: Joi.object().default(null),
        entry: Joi.object().required().keys({
            message: Joi.string().required(),
            data: Joi.object(),
            error: Joi.object().default(null),
            tags: Joi.array().required().items(
                Joi.string().required().valid(['info', 'error', 'warning', 'request', 'plugin']),
                Joi.string()
            )
        })
    })
};

// Write to file ================================
internals.write = (options, callback) => {

    const done = callback || Hoek.ignore; // Done callback
    const result = Joi.validate(options, internals.schemas.write, { allowUnknown: true }); // Validate and merge options

    //== Check if schema validation had an error
    if (result.error !== null) {
        internals.console(result.error, 'error');

        return done(result.error);
    }

    const { path, silent } = internals.settings;
    const { entry, request, async } = result.value;
    const now = Date.now();
    const type = entry.tags.shift();
    const filePath = `${ path }/${ type }.log`;
    const log = {
        type,
        tags: entry.tags,
        message: entry.message,
        timestamp: now,
        host: Os.hostname()
    };

    // Append Data
    if (entry.data) {
        log.data = entry.data;
    }

    //== Has request?
    if (request) {
        // Create data from request
        const scoot = request.plugins.scooter.toJSON();
        const { method, info, route } = request;
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
};

// Write to console =============================
internals.console = (data = {}, type = 'info', callback) => {

    let bg;
    const done = callback || Hoek.ignore;

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
    const opts = Joi.validate(options, internals.schemas.plugin);

    // Check if schema validation had an error
    if (opts.error !== null) {
        return next(opts.error.message);
    }

    plugin.register(Scooter, err => {

        if (err) {
            return next(err.message);
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

        return true;
    });

    // Move along
    return next();
};

// Exposing Plugin Attributes ===================
exports.register.attributes = { pkg };
