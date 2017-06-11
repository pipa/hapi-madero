// Deps =========================================
const Hapi = require('hapi');
const Madero = require('./lib');

// Internals ====================================
const internals = {};

// Server =======================================
const server = new Hapi.Server({ debug: false });

server.connection({ port: 3000, host: 'localhost' });
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

    server.route({
        method: 'GET',
        path: '/test',
        handler: (request, reply) => {

            request.log(['test'], { message: 'test', foo: 'bar' });
            as;
            return reply('ok')
        }
    });

    server.start(err => {

        if (err) {
            server.plugins['hapi-madero'].console(err, 'error');
        }
        server.log(['info', 'app', 'start'], {
            message: `Test server started`,
            port: server.info.port,
            protocol: server.info.protocol,
            uri: server.info.uri,
            address: server.info.address
        });
    });
});


// server.route({
//     method: 'GET',
//     path: '/',
//     handler: (request, reply) => {

//         request.log(['test'], 'test');
//         return reply('ok')
//     }
// });

// server.start();