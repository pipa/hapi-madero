const Hapi = require('hapi');
const Boom = require('boom');
const Madero = require('./');

const internals = {
    settings: {
        path: './logs',
        timestampKey: '@timestamp',
        unixStamp: false
    }
};

const server = new Hapi.Server({ debug: false });

server.connection({
    host: 'localhost',
    port: 1112
});
server.register({ register: Madero, options: internals.settings }, err => {

    if (err) {
        throw err;
    }

    server.route({
        method: 'GET',
        path: '/log-test',
        handler: (request, reply) => {

            // request.log(['test'], { message: 'test', foo: 'bar' });
            // request.log(['test'], 'this is a test');

            return reply('ok');
        }
    });

    server.route({
        method: 'GET',
        path: '/log-error',
        handler: (request, reply) => {

            return reply(Boom.badImplementation('Test error', new Error('test')));
        }
    });

    // Logging all responses
    server.on('response', (request) => {

        const response = request.response;
        let statusCode = response.statusCode;
        let message = 'Auto request log';
        let entry = { statusCode, message };
        let error;

        if (response.isBoom) {
            statusCode = response.output.payload.statusCode;
            message = response.message;
            error = response.output.payload;
            entry = { statusCode, message, error };

            // Logs error
            return request.log(['error', 'boom'], entry);
        }

        // Log every request
        return request.log(['info'], entry);
    });

    server.start(err => {

        if (err) {
            throw err;
        }

        console.log(server.info);
    });
});
