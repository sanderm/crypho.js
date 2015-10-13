define([
    'jquery',
    'underscore',
    'backbone',
    'globals',
    './husher',
    './XMPP',
    './infostream',
    './filestream',
    './user'
], function ($, _, Backbone, globals, husher, XMPP, InfoStream, FileStream, User) {

    var Space = {};

    Space.Space = Backbone.Model.extend({

        urlRoot: '/spaces',

        hasFetchedStreams: false,

        defaults: {
            roles: {},
            unread: 0,
            lastActivity:'2010',
            valid: false
        },

        initialize: function () {
            this.infostream = new InfoStream.InfoStream([], {
                id: '/spaces/' + this.id + '/infostream',
                connection: XMPP.connection,
                space: this
            });
            this.filestream = new FileStream.FileStream([], {
                id: '/spaces/' + this.id + '/vault',
                connection: XMPP.connection,
                space: this
            });

            // Trigger change:unread if a new infostream item is received and this is not the current space.
            this.infostream.on('add', function (msg) {
                var updated = msg.get('updated');
                if (updated > this.get('lastActivity')) {
                    this.set('lastActivity', updated);
                    this.collection.sort();
                }
                if (!globals.app.space || globals.app.space.id !== this.id) {
                    if (updated > this.lastSeen) {
                        this.set('unread', this.get('unread') + 1);
                    }
                }
            }, this);

            this.infostream.on('change', function (msg) {
                var updated = msg.get('updated');
                if (updated > this.get('lastActivity')) {
                    this.set('lastActivity', updated);
                    this.collection.sort();
                }
            }, this);
        },

        fetch: function () {
            var self = this,
                d = $.Deferred();

            XMPP.connection.Crypho.getSpace(this.id)
            .done(function (json) {
                self.set(self.parse(json));
                d.resolve(self);
            })
            .fail(d.reject);
            return d;
        },

        fetchStreams: function () {
            if (!this.hasFetchedStreams) {
                this.infostream.fetchProgressive();
                this.filestream.fetch();
                this.hasFetchedStreams = true;
            }
        },

        getCurrentKey: function () {
            var id = _.max(
                    _.map(_.keys(this.attributes.keys), function (k) { return parseInt(k, 10); })
                ).toString();
            return {
                id: id,
                key: this.getKeyById(id)
            };
        },

        verifyCurrentKey: function () {
            var key = this.getCurrentKey(),
                signing = this.get('keySignatures'),
                signer;

            // First check if there is a signature for this key, otherwise return undefined
            signing = _.has(signing, key.id) && signing[key.id];
            if (signing) {
                signer = globals.roster.get(signing.signer + '@' +XMPP.connection.domain);

                // Check the key signature verifies.
                if (globals.husher.verify(key.key, signing.signature, signer.publicKeys().signing)) {
                    // If the key issuer is the user herself or if she is signed and verified, return 'full' verification
                    if (signer === globals.me) {
                        return 'full';
                    }
                    if (signer.get('verified') && globals.husher.verify(signer.fingerprint(), signer.get('verified'))) {
                        return 'full';
                    }
                    // Return 'keyOnly' verification when the key is verified but not the user
                    return 'keyOnly';
                } else {
                    return false;
                }
            }
        },

        getKeyById: function (id) {
            var key = this.attributes.keys[id],
                keys;

            // Has this key been decrypted already?
            // If yes return it, otherwise decrypt and store.
            try {
                JSON.parse(key);
                keys = this.get('keys');
                key = keys[id] = globals.husher.decrypt(key);
                this.set({keys: keys}, {silent: true});
            } catch (e) {}
            return key;
        },

        encryptKeys: function (key) {
            var self = this;
            // First make sure all the keys are decrypted for the user.
            _.each(this.get('keys'), function (v, k) { self.getKeyById(k);});
            var keys = _.clone(this.get('keys'));
            _.each(keys, function (v, k) { keys[k] = globals.husher.encrypt(v, key);});
            return keys;
        },

        otherParticipants: function () {
            return _.reject(globals.roster.inSpace(this.id), function (user) { return user === globals.me;});
        },

        title: function () {
            var title = this.get('title');
            if (title) {
                return title;
            }
            var participants =  _.map(this.otherParticipants(), function (user) { return user.fullname(); });
            if (participants.length === 0) {
                return '';
            }
            return _.sortBy(participants).join(', ');
        },

        shortTitle: function () {
            var participants = this.otherParticipants(),
                more = participants.length - 3,
                display;
            if (more < 2) {
                return this.title();
            }
            participants = _.first(participants, 3);
            display = _.map(participants, function (user) { return user.fullname(); });
            display = _.sortBy(display).join(', ');
            return globals.transl('${display} and ${more} more', {display: display, more: more});
        },

        userRoles: function (userID) {
            return this.get('roles')[userID] || [];
        },

        myRoles: function () {
            return this.userRoles(globals.me.userID());
        },

        haveRole: function (role) {
            return this.myRoles().indexOf(role) !== -1;
        },

        // Returns all the user ids of the members of the space with role.
        userIDsWithRole: function (role) {
            var ids = [];
            _.each(this.get('roles'), function (roles, id) {
                if (roles.indexOf(role)) {
                    ids.push(id);
                }
            });
            return ids;
        },

        stopListening: function (model) {
            this.infostream.stopListening(model);
            this.filestream.stopListening(model);
            Backbone.Model.prototype.stopListening.call(this,model);
        }

    });

    Space.SpaceCollection = Backbone.Collection.extend({

        model: Space.Space,

        comparator: function (item1, item2) {
            return item1.get('lastActivity') > item2.get('lastActivity') ? -1 : 1;
        },

        _sort: function (options) {
            if (this.comparator)
                return Backbone.Collection.prototype.sort.call(this);
        },

        url: function () {
            return '/';
        },

        initialize: function (options) {
            XMPP.connection.Crypho.on('spacesupdated', this.onSpacesUpdate, this);
            XMPP.connection.Crypho.on('spacedeleted', this.onSpaceDeleted, this);
            XMPP.connection.Crypho.on('spacekeyrequest', this.onKeyRequest, this);
            XMPP.connection.Crypho.on('spaceread', this.onSpaceRead, this);
        },

        _updateSelfGroups: function () {
            globals.me.set({groups: this.map(function (i) { return i.id; })});
        },

        onSpacesUpdate: function (spaces) {
            var self=this, p, space;
            spaces = JSON.parse(spaces);
            _.each(spaces, function (id) {
                p = XMPP.connection.Crypho.getSpace(id);
                p.done(function (json) {
                    if (self.get(id)) {
                        space = Space.Space.prototype.parse(json);
                        self.set([space], {remove: false});
                    } else {
                        // It might be the space contains users we do not
                        // yet have in our roster. Update that first before
                        // triggering an "add".
                        globals.roster.fetch().done(function () {
                            self.add(Space.Space.prototype.parse(json));
                            space = self.get(id);
                            space.lastSeen = new Date(1).toISOString();
                            space.fetchStreams();
                            self._updateSelfGroups();
                        });
                    }
                });
            });
        },

        onSpaceDeleted: function (spaceID) {
            var space = this.get(spaceID);
            if (globals.app.space && globals.app.space.id === spaceID) {
                Backbone.history.navigate('/', {trigger: true});
            }
            space.stopListening();
            this.remove(spaceID);
            this._updateSelfGroups();
        },

        onSpaceRead: function (spaceID) {
            var space = this.get(spaceID);
            if (space) {
                space.set('unread', 0);
            }
        },

        onKeyRequest: function (spaceId) {
            var p;

            // When we have enough entropy generate the keys.
            husher.ready.done(function () {
                XMPP.connection.Crypho.addSpaceKey(spaceId);
            });

        },

        fetch: function () {
            var spaces, self = this,
                p = XMPP.connection.Crypho.getSpaces();
            p.done(function (res) {
                spaces = _.map(res, function (data) {
                    var space = new Space.Space(self.model.prototype.parse(data));

                    // Upon fetch, calculate last seen. When the stream is also fetched,
                    // this allows to calculate the number of unread messages
                    space.lastSeen = new Date(parseInt(data.last_seen, 10)*1000).toISOString();
                    return space;
                });

                self.reset(spaces);
                self._updateSelfGroups();
            });
            return p;
        }
    });

    Space.SpaceCollection.prototype.sort = _.throttle(Space.SpaceCollection.prototype._sort, 1000);
    return Space;
});