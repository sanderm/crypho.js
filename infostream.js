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
        // the item is published again last. To avoid that we sort by creation date.
        comparator: function (item) {
            return -(new Date(item.get('created')).getTime());
        },

        createActionItem: function (data, type) {
            var now = globals.serverTime(),
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