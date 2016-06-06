define([
    'jquery',
    'underscore',
    'backbone',
    'strophe',
    'globals',
    'XMPPMessaging',
    'XMPPRoster',
    'XMPPVCard',
    'XMPPForms',
    'XMPPPubSub',
    'XMPPPrivate',
    './protocol'
], function ($, _, Backbone, wrapper, globals) {

    var Strophe = wrapper.Strophe,
        $pres = wrapper.$pres;


    var XMPP = function () {
        var self = this;
        _.extend(this, Backbone.Events);

        this.onConnectionStatusChange = function (status) {
            self.trigger('xmpp:connection:change', status);
            if (status === Strophe.Status.ATTACHED || status === Strophe.Status.CONNECTED) {

                self.connection = this;
                self.connection.xmlInput = function (e) {
                    self.logStanzas(e, true);
                };
                self.connection.xmlOutput = function (e) {
                    self.logStanzas(e, false);
                };

                $(window).on('beforeunload', function () {
                    var presence = $pres({type: 'unavailable'});
                    self.connection.send(presence);
                    self.connection.disconnect();
                    self.connection.flush();
                });

                if (globals.workState) {

                    self.connection._sendIQ = self.connection.sendIQ;
                    self.connection.sendIQ = function (elem, callback, errback, timeout) {
                        var p = $.Deferred();
                        globals.workState.push(p);
                        self.connection._sendIQ(
                            elem,
                            function (response) {
                                callback(response);
                                p.resolve();
                            },
                            function (error) {
                                errback(error);
                                p.reject();
                            },
                            timeout);
                    };
                }

                if (status === Strophe.Status.ATTACHED) {
                    self.trigger('xmpp:connection:attached');
                } else {
                    self.trigger('xmpp:connection:connected');
                }

                self.connection.send($pres());

            } else if (status === Strophe.Status.DISCONNECTED) {
                self.trigger('xmpp:connection:disconnected');
            } else if (status === Strophe.Status.CONNFAIL) {
                self.trigger('xmpp:connection:disconnected');
            }
        };

        this.debug = false;

        this.logStanzas = function (elem, io) {
            if (this.debug) {
                for(var i  = 0; i < elem.childNodes.length; ++i) {
                    console.log(io ? 'IN' : 'OUT', elem.childNodes[i]);
                }
            }
        };
    };
    return new XMPP();
});