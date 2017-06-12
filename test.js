const Hapi = require('hapi');
const Madero = require('./');

const server = new Hapi.Server({ debug: false });

server.connection({
    host: 'localhost',
    port: 1112
});
server.register({ register: Madero, options: { path: './logs' } }, err => {

    if (err) {
        throw err;
    }

    server.route({
        method: 'GET',
        path: '/log-test',
        handler: (request, reply) => {

            request.log(['test'], { message: 'test', foo: 'bar' });

            return reply('ok');
        }
    });

    server.start(err => {

        if (err) {
            throw err;
        }

        console.log(server.info);
    });
});
