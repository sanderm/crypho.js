define([
    'jquery',
    'underscore',
    'backbone',
    'strophe',
    './XMPP',
    'burry',
    'globals',
    'crypho/husher'
    ], function ($, _, Backbone, wrapper, XMPP, Burry, globals, husher) {

    var Strophe = wrapper.Strophe;
    var User = {};

    // Use a burry store for caching vCards. TTL set to 1440, i.e. a day
    User.store = new Burry.Store('roster', 1440);

    // XMPP User
    User.XMPPUser = Backbone.Model.extend({

        urlRoot: '/users',

        defaults: {
            groups: [],
            vCard:  {},
            jids: [],
            away: {},
            verified: null
        },

        fetch: function(options) {
            var d = $.Deferred(),
                self = this,
                vCard;

            options = options || {};
            // Check if we have the vCard in cache and resolve if it is the case.
            if (!options.nocache) {
                vCard = User.store.get(this.id);
            }
            if (vCard) {
                this.set({vCard: vCard});
                d.resolve(this);
            } else {
                XMPP.connection.vCard.get(this.id).always(function (vCard) {
                    if (vCard) {
                        self.set({vCard: vCard});
                        User.store.set(self.id, vCard);
                    }
                    d.resolve(self);
                });
            }
            return d.promise();
        },

        userID: function () {
            if (this.id) {
                return Strophe.getNodeFromJid(this.id);
            }
        },

        bareJID: function () {
            if (this.id) {
                return Strophe.getBareJidFromJid(this.id);
            }
        },

        fullname: function () {
            return this.get('vCard').FN || this.userID();
        },

        orgname: function () {
            var vCard = this.get('vCard');
            return vCard.ORG && vCard.ORG.ORGNAME || '';
        },

        email: function () {
            return this.get('vCard').EMAIL && this.get('vCard').EMAIL.USERID || '';
        },

        avatar: function () {
            var photo = this.get('vCard').PHOTO;
            if (!photo || !photo.BINVAL) {
                return '';
            }
            photo.TYPE = photo.TYPE || 'image/jpeg';
            if (photo) {
                return 'data:' + photo.TYPE + ';base64,' + photo.BINVAL;
            }
        },

        publicKeys: function () {
            var vCard = this.get('vCard');
            if (!vCard.KEYS || !(vCard.KEYS.ENCRYPTIONPUB && vCard.KEYS.SIGNINGPUB)) {
                return null;
            }
            return {
                encryption: vCard.KEYS.ENCRYPTIONPUB,
                signing: vCard.KEYS.SIGNINGPUB
            };
        },

        fingerprint: function () {
            var publicKeys = this.publicKeys();
            if (!publicKeys) return null;
            return husher._hash(
                husher._b64.toBits(publicKeys.encryption).concat(husher._b64.toBits(publicKeys.signing))
            );
        },

        isOnline: function () {
            return this.get('jids').length ? true : false;
        },

        isAway: function () {
            return ! _.contains(_.values(this.get('away')), false);
        }

    });

    // XMPP User collection
    User.XMPPUserCollection = Backbone.Collection.extend({

        model: User.XMPPUser,

        initialize: function () {

            // Subscribe to presence
            XMPP.connection.roster.on(
                'xmpp:presence:available',
                this._onUserAvailable,
                this
            );

            XMPP.connection.roster.on(
                'xmpp:presence:unavailable',
                this._onUserUnavailable,
                this
            );

            // Subscribe to roster push
            XMPP.connection.roster.on(
                'xmpp:roster:set',
                this._onRosterSet,
                this
            );

            // Subscribe to user vCard updates.
            XMPP.connection.Crypho.on(
                'vcardupdated',
                this._onVCardUpdated,
                this
            );
        },

        // We provide getOrFetch so that when attempting to get a user,
        // she is fetched if she does not exist. This is because the XMPPUserCollection comes
        // from the roster. If a member of a space is removed from the space she is removed
        // from the roster as well. Thus we allow to user to exist outside the roster
        // and fetch her vCard.
        getOrFetch: function (id) {
            var user = this.get(id);
            if (!user) {
                this.add({id: id});
                user = this.get(id);
                user.fetch();
            }
            return user;
        },

        fetch: function() {
            var d = $.Deferred(),
                self = this,
                rosterPromise = XMPP.connection.roster.get(),
                user_promises = [];

            rosterPromise.done(function (roster) {
                var jid, user, bare;
                var newJIDs = _.keys(roster);

                // Remove any roster members that have been purged
                self.each(function (oldUser) {
                    if (!_.contains(newJIDs, oldUser.id) && oldUser.id !== globals.me.id) {
                        self.remove(oldUser);
                    }
                });

                _.each(newJIDs, function (jid) {
                    bare = Strophe.getBareJidFromJid(jid);
                    if (!self.get(bare)) {
                        self.add({id: bare, groups: roster[bare].groups});
                    }
                    user = self.get(bare);
                    user_promises.push(user.fetch());
                    user.set({groups: roster[bare].groups});
                });

                // Set verification levels
                user_promises.push(
                    XMPP.connection.Crypho.getVerifiedUsers()
                    .done(function (verified) {
                        _.each(verified, function (signature, userID) {
                            jid = userID + '@' +XMPP.connection.domain;
                            user = self.get(jid);
                            user.set({verified: signature});
                        });
                    })
                );

                $.when.apply(this, user_promises).done(function () {
                    var json = self.toJSON();
                    d.resolve(self, json);
                });

                $.when.apply(this, user_promises).fail(function () {
                    d.reject();
                });

                // Clean up localStorage cache
                _.forEach(User.store.keys(), function (user) {
                    if (!roster[user] && user!==globals.me.id ) {
                        User.store.remove(user);
                    }
                });

            });
            rosterPromise.fail(d.reject);
            return d.promise();
        },

        contacts: function(){
            var contactSpaces = _.filter(globals.spaces.models, function(space){
                return space.get('type') === 'contact';
            });

            return _.map(contactSpaces, function(space){
                return space.otherParticipants()[0];
            });
        },

        _onUserAvailable: function (ev) {
            var bare = Strophe.getBareJidFromJid(ev.jid),
                user = this.get(bare),
                self = this,
                wasOnline,
                away = {};
            if (user) {
                // We have the user already, so just add this jid to the
                // available ones.
                wasOnline = user.isOnline();
                user.set({
                    jids: _.union(user.get('jids'), [ev.jid])
                });
                away = user.get('away');
                away[ev.jid] = ev.show && ev.last || false;
                user.set({away: away});
                user.trigger('change:away', user.isAway(), ev.last);
                if (!wasOnline) this.trigger('change:online', user, true);
            } else {
                // Create the user
                user = new User.XMPPUser({id: bare});
                user.fetch().done(function () {
                    if (self.get(bare)) {
                        user = self.get(bare);
                    } else {
                        self.add(user);
                    }
                    user.set({
                        jids: [ev.jid]
                    });
                    away[ev.jid] = false;
                    user.set({away: away});
                    self.trigger('change:online', self.get(user.id), true);
                });
            }
        },

        _onUserUnavailable: function (ev) {
            var user = this.get(Strophe.getBareJidFromJid(ev.jid));
            if (user) {
                user.set({jids: _.without(user.get('jids'), ev.jid)});
                user.set({away: _.omit(user.get('away'), ev.jid)});
                user.trigger('change:away', user.isAway(), ev.last);
                if (user.get('jids').length === 0) user.trigger('change:online', user, false);
            }
        },

        _onRosterSet: function (items) {
            var user, diff, self = this;

            _.each(items, function (item) {
                user = self.get(item.jid);
                if (item.subscription === 'both') { // add/modify in roster
                    if (!user) {
                        user = new User.XMPPUser({id: item.jid});
                        user.fetch().done(function () {
                            if (self.get(item.jid)) {
                                user = self.get(item.jid);
                            } else {
                                self.add(user);
                            }
                            user.set({groups: _.union(user.get('groups'), item.groups)});
                        });
                    } else {
                        user.set({groups: _.union(user.get('groups'), item.groups)});
                    }
                } else { // remove from roster
                    user = self.get(item.jid);
                    diff = _.difference(user.get('groups'), item.groups);
                    if (diff) {
                        user.set('groups', diff);
                    } else {
                        self.remove(item.jid);
                    }
                }
            });
        },

        _onVCardUpdated: function (userID) {
            var user = this.get(userID);
            user.fetch({nocache: true});
        },

        available: function () {
            return _.filter(this.models, function (user) { return (user.get('jids').length > 0); });
        },

        unavailable: function () {
            return _.filter(this.models, function (user) { return (user.get('jids').length === 0); });
        },

        // Returns the users that are member of a space with id spaceId.
        inSpace: function (spaceId) {
            var other_users =  _.groupBy(this.models, function (user) {
                return (_.indexOf(user.get('groups'), spaceId)>=0); });
            other_users = other_users['true'] || [];
            return other_users;
        },

        withRoleInSpace: function (spaceId, role) {
            var space = globals.spaces.get(spaceId),
                userIDs;
            if (!space) {
                return [];
            }
            userIDs = space.userIDsWithRole('op');
            return this.filter(function (user) { return userIDs.indexOf(user.userID())!==-1; });
        },

        byJID: function (jid) {
            jid = Strophe.getBareJidFromJid(jid);
            return this.find(function (m) { return m.id == jid; });
        },

        others: function () {
            return this.reject(function (user) { return user.id===globals.me.id;});
        },

    });
    return User;
});