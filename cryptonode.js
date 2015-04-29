define([
    'jquery',
    'underscore',
    'backbone',
    'globals',
    'pubsubnode'
    ], function ($, _, Backbone, globals, PubSubNode) {

    var CryptoNode = {};

    CryptoNode.maxFetchItems = 20;

    CryptoNode.CryptoItem = PubSubNode.PubSubItem.extend({

        initialize: function (options) {

            var key, id;
            if (options.kid && options.payload) {
                this.space = this.collection.space;
                key = this.collection.space.getKeyById(options.kid);
                id = this.id;
                this.clear({silent: true});
                this.set(JSON.parse(globals.husher.decrypt(options.payload, key)), {silent: true});
                this.set({id: id}, {silent: true});
            }

            // When the payload has been changed, i.e. when an update is received from the server, decrypt.
            this.on('change:payload', this.onUpdate);
        },

        onUpdate: function (m) {
            var kid, key, payload, id;
            kid = m.get('kid');
            payload = m.get('payload');
            if (!payload || !kid) {
                return;
            }
            key = this.collection.space.getKeyById(kid);
            id = this.id;
            this.clear({silent: true});
            this.set(JSON.parse(globals.husher.decrypt(payload, key)));
            this.set({id: id}, {silent: true});
        },

        save: function () {
            var key = this.collection.space.getCurrentKey(),
                id = this.id,
                attrs, p;

            attrs = _.omit(_.clone(this.attributes), ['kid', 'payload']);

            this.clear({silent: true});
            this.set({
                kid: key.id,
                payload: globals.husher.encrypt(JSON.stringify(attrs), key.key, globals.me.id)
            }, {silent: true});

            if (id) {
                this.set({id: id}, {silent: true});
            }

            p = PubSubNode.PubSubItem.prototype.save.apply(this);
            return p;
        }
    });

    CryptoNode.CryptoNode = PubSubNode.PubSubNode.extend({

        model: CryptoNode.CryptoItem,

        initialize: function (models, options) {
            PubSubNode.PubSubNode.prototype.initialize.apply(this, [models, options]);
            this.space = options.space;
        },


        // fetchProgressive updates the node items fetching CryptoNode.maxFetchItems from the node
        // after the last item marked by _rsm.
        // It also uses the _isFetching semaphore to lock. DO NOT remove the semaphore,
        // this can flood XMPP and result into a disconnection.
        fetchProgressive: function () {
            var rsm = {max: CryptoNode.maxFetchItems},
                self = this, p;
            if (this._rsm) {
                // If we have reached the end of the node, _rsm.last is ''.
                // In that case resolve the promise with an empty list.
                if (this._rsm.last === '') {
                    return $.Deferred().resolve([]);
                }
                rsm.after = this._rsm.last;
            }

            // Are we locked?
            if (this._isFetching) {
                p = this._isFetching;
                return p;
            }

            // Lock
            p = this.fetch({rsm: rsm, merge: true, add: true, remove: false});
            this._isFetching = p;
            p.done(function (items, rsm) {
                self._rsm = rsm;
                self.trigger('rsmfetch');
            });
            p.always(function (r) {
                delete self._isFetching;
            });
            return p;
        }
    });


    return CryptoNode;
});