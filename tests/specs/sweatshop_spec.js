define(['jquery', 'underscore', 'backbone', 'crypho/sweatshop'], function ($, _, Backbone, Sweatshop) {

        var workerUrl = '/tests/specs/worker.js',
            ss, job;


    describe('Sweatshop', function () {

        beforeEach(function () {
            ss = new Sweatshop();
        });

        afterEach(function () {
            _.each(_.keys(ss._workers), function (name) {
                ss.unregisterWorker(name);
            });
        });

        it('can register/unregister a new worker', function () {
            ss.registerWorker('worker', workerUrl);
            expect(_.keys(ss._workers)).toEqual(['worker']);
            ss.unregisterWorker('worker');
            expect(_.keys(ss._workers)).toEqual([]);
        });

        it('can queue and execute a job', function () {
            ss.registerWorker('worker', workerUrl);
            job = ss.queue('worker', 'add', [2, 3]);
            job.done(function (result) {
                expect(result).toEqual(5);
            });
        });

        it('can queue and execute multiple jobs in the right order', function (done) {

            ss.registerWorker('worker', 'specs/worker.js');
            job1 = ss.queue('worker', 'add', [1, 2]);
            job2 = ss.queue('worker', 'fail');
            job3 = ss.queue('worker', 'add', [3, 4]);

            job1.done(function (result) {
                expect(result).toEqual(3);
                expect(job1.state()).toEqual('resolved');
                expect(job2.state()).toEqual('pending');
                expect(job3.state()).toEqual('pending');
                expect(ss._workers['worker'].running.length + ss._workers['worker'].queued.length).toEqual(2);
            });

            job2.fail(function (result) {
                expect(job2.state()).toEqual('rejected');
                expect(job3.state()).toEqual('pending');
            });

            job3.done(function (result) {
                expect(result).toEqual(7);
                expect(job1.state()).toEqual('resolved');
                expect(job2.state()).toEqual('rejected');
                expect(job3.state()).toEqual('resolved');
                done();
            });


        });
    });

});