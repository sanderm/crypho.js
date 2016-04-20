define([
    'jquery',
    'underscore',
    'backbone',
    'base',
    'globals',
    './cryptonode',
], function ($, _, Backbone, base, globals, CryptoNode) {

    var FileStream = {};

    FileStream.FileStreamItem = CryptoNode.CryptoItem.extend({
    });

    FileStream.FileStream = CryptoNode.CryptoNode.extend({
        model: FileStream.FileStreamItem,

        comparator: function (item) {
            return -(new Date(item.get('updated')).getTime());
        },
    });

    return FileStream;
});