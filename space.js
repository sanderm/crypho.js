define([
    'jquery',
    'underscore',
    'backbone',
    'globals',
    './husher',
    'XMPP',
    './infostream',
    './filestream',
    './user'
], function ($, _, Backbone, globals, husher, XMPP, InfoStream, FileStream, User) {

    var Space = {};

    Space.Space = Backbone.Model.extend({

        urlRoot: '/spaces',

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
                p = XMPP.connection.Crypho.getSpace(this.id);

            p.done(function (json) {
                self.set(self.parse(json));
                self.infostream.fetchProgressive();
                self.filestream.fetch();
            });
            return p;
        },

        parse: function (data) {
            // Decrypt keys and keep them
            var exports = {
                id: data.id,
                keys: {}
            };

            _.each(data.keys, function (val, key) {
                exports.keys[key] = globals.husher.decrypt(val);
            });

            exports.roles = data.roles;
            exports.type = data.type;
            exports.valid = data.valid;
            return exports;
        },

        getCurrentKey: function () {
            var id = _.max(
                    _.map(_.keys(this.attributes.keys), function (k) { return parseInt(k, 10); })
                ).toString();
            return {
                id: id,
                key: this.attributes.keys[id]
            };
        },

        getKeyById: function (id) {
            return this.attributes.keys[id];
        },

        encryptKeys: function (key, last) {
            var res = _.clone(this.get('keys'));
            _.each(res, function (v, k) { res[k] = globals.husher.encrypt(v, key);});
            return res;
        },

        title: function () {
            var participants =  _.map(_.reject(globals.roster.inSpace(this.id), function (user) { return user === globals.me;}), function (user) { return user.fullname(); });
            if (participants.length === 0) {
                return globals.transl('No members');
            }
            return participants.join(', ');
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
                        self.add(Space.Space.prototype.parse(json));
                        space = self.get(id);
                        space.lastSeen = new Date(1).toISOString();
                        space.infostream.fetchProgressive();
                        space.filestream.fetch();
                        self._updateSelfGroups();
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

        onKeyRequest: function (spaceId) {
            var p;

            // Show the entropy gatherer form if necessary
            if (husher.ready.state() === 'pending') {
                var f = new Entropy();
                f.render();
            }

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