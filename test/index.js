// Deps =========================================
const Lab = require('lab');
const Code = require('code');
const Hapi = require('hapi');
const Path = require('path');

// Internals ====================================
const internals = {};

// Shortcuts ====================================
const lab = exports.lab = Lab.script();
const { describe, it, before, after } = lab;
const expect = Code.expect;

// Main Experiment ==============================
describe('Server', () => {

    let server;

    it('logs event', done => {
        
        server = new Hapi.Server({ debug: false });
        server.connection();


    });
    it('logs request error event');
    it('logs request event');
    it('logs error event');
    it('logs signal (SIGTERM)');
    it('logs signal (SIGINT)');
    it('logs uncaughtException event');
    it('logs unhandledRejection event');
});
