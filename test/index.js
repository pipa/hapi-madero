// Deps =========================================
const Lab = require('lab');
const Code = require('code');
const Hapi = require('hapi');
const Path = require('path');
const fsExtra = require('fs-extra');
const Boom = require('boom');
const Madero = require('../');

// Internals ====================================
const internals = {
    options: {
        path: './logs',
        silent: true
    },
    path: Path.resolve(__dirname, '../')
};

// Shortcuts ====================================
const lab = exports.lab = Lab.script();
const { describe, it, after } = lab;
const expect = Code.expect;

// Main Experiment ==============================
describe('Madero', () => {

    it('logs event', done => {

        const server = new Hapi.Server({ debug: false });

        server.connection();
        server.register({ register: Madero, options: internals.options }, (err) => {

            expect(err).to.not.exist();
            server.start(err => {

                expect(err).to.not.exist();

                server.log(['info', 'app', 'start'], { message: 'test' });

                setTimeout(() => {

                    fsExtra.pathExists(`${internals.path}/logs/info.log`, (err, exists) => {

                        expect(err).to.not.exist();
                        expect(exists).to.equal(true);
                        done();
                    });
                }, 200);
            });
        });
    });
    it('logs request error event', done => {

        const server = new Hapi.Server({ debug: false });

        server.connection();
        server.register({ register: Madero, options: internals.options }, (err) => {

            expect(err).to.not.exist();
            server.route({
                method: 'GET',
                path: '/log-error',
                handler: (request, reply) => {

                    return reply(Boom.badImplementation('Test error', new Error('test')));
                }
            });
            server.start(err => {

                const options = {
                    method: 'GET',
                    url: '/log-error'
                };

                expect(err).to.not.exist();

                server.inject(options, () => {

                    setTimeout(() => {

                        fsExtra.pathExists(`${internals.path}/logs/error.log`, (err, exists) => {

                            expect(err).to.not.exist();
                            expect(exists).to.equal(true);
                            done();
                        });
                    }, 200);
                });
            });
        });
    });
    it('logs request event', done => {

        const server = new Hapi.Server({ debug: false });

        server.connection();
        server.register({ register: Madero, options: internals.options }, (err) => {

            expect(err).to.not.exist();
            server.route({
                method: 'GET',
                path: '/log-test',
                handler: (request, reply) => {

                    request.log(['test'], { message: 'test', foo: 'bar' });

                    return reply('ok');
                }
            });
            server.start(err => {

                const options = {
                    method: 'GET',
                    url: '/log-test'
                };

                expect(err).to.not.exist();

                server.inject(options, () => {

                    setTimeout(() => {

                        fsExtra.pathExists(`${internals.path}/logs/request.log`, (err, exists) => {

                            expect(err).to.not.exist();
                            expect(exists).to.equal(true);
                            done();
                        });
                    }, 200);
                });
            });
        });
    });
    // it('logs error event');
    // it('logs signal (SIGTERM)');
    // it('logs signal (SIGINT)');
    // it('logs uncaughtException event');
    // it('logs unhandledRejection event');

    after(done => {

        // Clean logs
        fsExtra.removeSync(`${internals.path}/logs`);
        done();
    });
});
