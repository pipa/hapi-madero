const Hapi = require('hapi');
const Madero = require('./');

const server = new Hapi.Server({ debug: false });

console.log(Madero);

server.connection();
server.register({ register: Madero, options: { } }, err => {

    console.log(err);
});
