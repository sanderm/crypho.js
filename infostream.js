define([
    'jquery',
    'underscore',
    'backbone',
    'globals',
    './cryptonode',
], function ($, _, Backbone, globals, CryptoNode) {


    var InfoStream = {};

    InfoStream.InfoStreamItem = CryptoNode.CryptoItem.extend({

    });

    InfoStream.InfoStream = CryptoNode.CryptoNode.extend({

        model: InfoStream.InfoStreamItem,

        createActionItem: function (data, type) {
            var now = new Date(),
                item = {
                    content: data,
                    author: globals.me.bareJID(),
                    created: now,
                    updated: now,
                    type: type
                };
            return this.create(item, {wait: true});
        }
    });

    return InfoStream;
});