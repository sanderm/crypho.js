//    Sweatshop.js v0.1.0

//    (c) 2012 Yiorgis Gozadinos, Crypho AS.
//    Sweatshop.js is distributed under the MIT license.
//    http://github.com/ggozad/Sweatshop.js

// AMD/global registrations
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        // AMD. Register as an anonymous module.
        define(['jquery', 'underscore', 'backbone'], function ($, _, Backbone) {
            return (root.Sweatshop = factory($, _, Backbone));
        });
    } else {
        // Browser globals
        root.Sweatshop = factory(root.$, root._, root.Backbone);
    }
}(this, function ($, _, Backbone) {

    // Sweatshop constructor
    var Sweatshop = function () {
        this._workers = {};
        return this;
    };

    _.extend(Sweatshop.prototype, Backbone.Events, {

        registerWorker: function (name, url) {
            if (this._workers[name]) {
                this.unregisterWorker(name);
            }
            this._workers[name] = new Processor(name, url);
        },

        unregisterWorker: function (name) {
            if (this._workers[name]) {
                this._workers[name].terminate();
                delete this._workers[name];
            }
        },

        queue: function (name, command, args) {
            if (!this._workers[name]) {
                return $.Deferred().reject().promise();
            }
            return this._workers[name].queue(command, args);
        }
    });

    var Processor = function (name, url) {
        this.worker = new Worker(url);
        this.running = [];
        this.queued = [];
        return this;
    };

    _.extend(Processor.prototype, {


        _processQueue: function () {
            var self = this,
                job;
            if (!this.running.length && this.queued.length) {
                job = this.queued.shift();
                this.running.push(job);
                job.d.always(function () {
                    self.running = _.without(self.running, job);
                    self._processQueue();
                });
                job.d.fail(function () {
                });
                job.start();
            }
        },

        queue: function (command, args) {
            var job = new Job(this.worker, command, args);
            this.queued.push(job);
            this._processQueue(name);
            return job.d.promise();
        },


        terminate: function () {
            this.worker.terminate();
        }

    });

    var Job = function (worker, command, args) {
        this.worker = worker;
        this.d = $.Deferred();
        this.command = command;
        this.args = args || [];
        return this;
    };

    _.extend(Job.prototype, {

        start: function () {
            var self = this;
            this.worker.onmessage = function (ev) {
                self.onMessage(ev, self);
            };
            this.worker.onerror = function (ev) {
                self.onError(ev, self);
            };
            this.worker.postMessage({cmd: this.command, args: this.args});
        },

        onMessage: function (ev, self) {
            self.worker.onmessage = null;
            self.worker.onerror = null;
            self.d.resolve(ev.data);
        },

        onError: function (ev, self) {
            self.worker.onmessage = null;
            self.worker.onerror = null;
            self.d.reject(ev.data);
        }
    });

    return Sweatshop;
}));
