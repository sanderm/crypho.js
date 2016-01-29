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

        // Normally the natural ordering of a pubsub node (FIFO) works
        // However, when we update a msg (for example by the user deleting it)
        // the item is published again last. To avoid that we sort by id.
        // This ONLY works because ejabberd uses hex IDs.
        // comparator: function (item) {
        //     return -parseInt(item.id, 16);
        // },

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