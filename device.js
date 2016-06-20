define([
    'jquery',
    'underscore',
    'backbone',
    './XMPP',
    ], function ($, _, Backbone, XMPP) {

    var Devices = {};

    Devices.Device = Backbone.Model.extend({
        idAttribute: 'device_id',

        unlink: function () {
            return XMPP.connection.Crypho.unlinkDevice(this.id);
        }

    });

    Devices.Devices = Backbone.Collection.extend({

        model: Devices.Device,

        fetch: function(options) {
            var self = this,
                d = $.Deferred();
            XMPP.connection.Crypho.getDevices()
            .done(function (json) {
                self.set(json);
                d.resolve(self);
            })
            .fail(d.reject);
            return d.promise();
        }
    });

    return Devices;
});