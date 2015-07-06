define([
    'jquery',
    'underscore',
    'backbone',
    'strophe',
    './husher',
    'globals'
    ], function ($, _, Backbone, Strophe, husher, globals) {


    Strophe.addConnectionPlugin('Crypho', {

        _connection: null,
        service: null,
        version: '1.0',

        init: function (conn) {
            this._connection = conn;
            Strophe.addNamespace('CRYPHO', 'http://crypho.com/ns/crypho');
            _.extend(this, Backbone.Events);
            this._idPrefix = husher.randomId();
        },

        statusChanged: function (status, condition) {
            if (status === Strophe.Status.CONNECTED || status === Strophe.Status.ATTACHED) {
                this.service =  'crypho.' + Strophe.getDomainFromJid(this._connection.jid);
            }
            this._connection.addHandler(this.onNotification.bind(this), null, 'message', 'headline', null, this.service);
            this._connection.addHandler(this.onAnnounce.bind(this), null, 'message', 'headline', null, Strophe.getDomainFromJid(this._connection.jid));
            this._connection.addHandler(this.onMessage.bind(this), null, 'message', 'chat', null, this.service);
        },

        onNotification: function (msg) {
            var self=this,
                i, n;
            $(msg).children().each(function (i, n) {
                self.trigger(n.tagName, n.textContent);
            });
            return true;
        },

        onAnnounce: function (msg) {
            this.trigger('global:' + $('subject', msg).text(), $('body', msg).text());
            return true;
        },

        onMessage: function (msg) {
            this.trigger('msg', $('body', msg).text());
            return true;
        },

        _createIQ: function (name, options, attrs) {
            options = options || {};
            options.type = options.type || 'set';
            options.id = options.id || this._connection.getUniqueId(this._idPrefix);
            attrs = attrs || {};
            attrs.xmlns = Strophe.NS.CRYPHO;
            attrs.version = this.version;
            return $iq({to: this.service, type: options.type, id: options.id})
                .c(name, attrs);
        },

        createGroupSpace: function(members) {
            var self = this,
                d = $.Deferred(),
                key = husher.randomKey(),
                userid = Strophe.getNodeFromJid(this._connection.jid),
                keys = {},
                iq = this._createIQ('createspace')
                  .t(JSON.stringify({members: members}));

            this._connection.sendIQ(iq.tree(), function (response) {
                var pubKey, pubKeys;
                pubKeys = JSON.parse($('keys', response).text());
                _.each(pubKeys, function (k, member) {

                    pubKey = husher.buildPublicKey(k);
                    keys[member] = globals.husher.encrypt(key, pubKey);
                });
                keys[globals.me.userID()] = globals.husher.encrypt(key, globals.husher.key.pub);
                iq = self._createIQ('spacekeys', {id: $(response).attr('id')})
                    .t(JSON.stringify(keys));
                self._connection.sendIQ(iq.tree(),
                    function (response) {
                        var spaceId = $('space', response).text();
                        d.resolve(spaceId);
                    },
                    d.reject);
            }, d.reject);

            return d.promise();
        },

        deleteSpace: function(uid) {
            var d = $.Deferred(),
                iq = this._createIQ('deletespace', {}, {uid: uid});
            this._connection.sendIQ(iq.tree(), d.resolve, d.reject);
            return d.promise();
        },

        updateSpace: function(uid, title) {
            var d = $.Deferred(),
                iq = this._createIQ('spaceupdate', {}, {uid: uid})
                    .t(JSON.stringify({title:title}));
            this._connection.sendIQ(iq.tree(), d.resolve, d.reject);
            return d.promise();
        },

        getSpaces: function () {
            var d = $.Deferred(),
                iq = this._createIQ('spaces', {type: 'get'});
            this._connection.sendIQ(iq.tree(), function (response) {
                d.resolve(JSON.parse($('spaces', response).text()));
            }, d.reject);
            return d.promise();
        },

        getSpace: function (uid) {
            var d = $.Deferred(),
                iq = this._createIQ('space', {type: 'get'}, {id: uid});
            this._connection.sendIQ(iq.tree(), function (response) {
                d.resolve(JSON.parse($('space', response).text()));
            }, d.reject);
            return d.promise();
        },

        invite: function (emails, message) {
            var d = $.Deferred(),
                iq = this._createIQ('invite')
                    .t(JSON.stringify({emails: emails, message: message}));
            this._connection.sendIQ(iq.tree(), d.resolve, d.reject);
            return d.promise();
        },

        getInvitations: function () {
            var d = $.Deferred(),
                iq = this._createIQ('invitations', {type: 'get'});
            this._connection.sendIQ(iq.tree(), function (response) {
                d.resolve(JSON.parse($('invitations', response).text()));
            }, d.reject);
            return d.promise();
        },

        getSentInvitations: function () {
            var d = $.Deferred(),
                iq = this._createIQ('sentinvitations', {type: 'get'});
            this._connection.sendIQ(iq.tree(), function (response) {
                d.resolve(JSON.parse($('invitations', response).text()));
            }, d.reject);
            return d.promise();
        },

        rejectInvitation: function (uid) {
            var d = $.Deferred(),
                iq = this._createIQ('rejectinvitation')
                    .t(JSON.stringify({uid: uid}));
            this._connection.sendIQ(iq.tree(), d.resolve, d.reject);
            return d.promise();
        },

        retractInvitation: function (uid) {
            var d = $.Deferred(),
                iq = this._createIQ('retractinvitation')
                    .t(JSON.stringify({uid: uid}));
            this._connection.sendIQ(iq.tree(), d.resolve, d.reject);
            return d.promise();
        },

        acceptInvitation: function (uid) {
            var d = $.Deferred(), self = this,
                iq = this._createIQ('acceptinvitation')
                    .t(uid),
                key = husher.randomKey(),
                keys = {};

            this._connection.sendIQ(iq.tree(),
                function (response) {

                    var invitor_id = $('uid', response).text(),
                        invitor_pubkey = husher.buildPublicKey($('pubkey', response).text());

                    keys[globals.me.userID()] = globals.husher.encrypt(key, globals.husher.key.pub);
                    keys[invitor_id] = globals.husher.encrypt(key, invitor_pubkey);
                    iq = self._createIQ('spacekeys', {id: $(response).attr('id')})
                        .t(JSON.stringify(keys));

                    self._connection.sendIQ(iq.tree(),
                        function (response) {
                            var spaceId = $('space', response).text();
                            d.resolve(spaceId);
                        },
                        d.reject);
                },
                d.reject);
            return d.promise();
        },

        setUserRolesInSpace: function (spaceid, uid, diff) {
            var d = $.Deferred(), self = this,
                iq = this._createIQ('userrole')
                    .t(JSON.stringify({spaceid: spaceid, userid: uid, diff: diff}));

            this._connection.sendIQ(iq.tree(), d.resolve, d.reject);
            return d.promise();
        },

        addSpaceMember: function (spaceid, memberid) {
            var d = $.Deferred(), self = this,
                iq = this._createIQ('addmember', {}, {spaceid: spaceid, memberid: memberid});

            this._connection.sendIQ(iq.tree(), function (response) {
                //Encrypt space keys with the new member's public key.
                var space = globals.spaces.get(spaceid),
                    publicKey = $('key', response).text(),
                    keys;

                publicKey = husher.buildPublicKey(publicKey);
                keys = space.encryptKeys(publicKey);

                // Send response and resolve
                iq = self._createIQ('spacekeys', {id: $(response).attr('id')})
                    .t(JSON.stringify(keys));

                self._connection.sendIQ(iq.tree(), d.resolve, d.reject);
            }, d.reject);

            return d.promise();

        },

        removeSpaceMember: function (spaceid, memberid) {
            var d = $.Deferred(), self = this,
                iq = this._createIQ('removemember', {}, {spaceid: spaceid, memberid: memberid});
            this._connection.sendIQ(iq.tree(),
                function (response) {
                    // Create new key and encrypt with response's public keys.
                    var keys = {},
                        publicKeys = JSON.parse($('keys', response).text()),
                        new_key = husher.randomKey();

                    // Encrypt keys with remaining members public keys
                    _.each(publicKeys, function (pKey, userid) {

                        pKey = husher.buildPublicKey(pKey);
                        keys[userid] = globals.husher.encrypt(new_key, pKey);
                    });

                    // Send response and resolve
                    iq = self._createIQ('spacekeys', {id: $(response).attr('id')})
                        .t(JSON.stringify(keys));

                    self._connection.sendIQ(iq.tree(), d.resolve, d.reject);
                }, d.reject);

            return d.promise();

        },

        leaveSpace: function (spaceid) {
            var d = $.Deferred(), self = this,
                iq = this._createIQ('leavespace', {}, {spaceid: spaceid});
            this._connection.sendIQ(iq.tree(), d.resolve, d.reject);
            return d.promise();
        },

        addSpaceKey: function(spaceid) {
            var d = $.Deferred(), self = this,
                iq = this._createIQ('addspacekey', {}, {spaceid: spaceid});
            this._connection.sendIQ(iq.tree(),
                function (response) {
                    // Create new key and encrypt with response's public keys.
                    var keys = {},
                        publicKeys = JSON.parse($('keys', response).text()),
                        new_key = husher.randomKey();

                    // Encrypt keys with remaining members public keys
                    _.each(publicKeys, function (pKey, userid) {

                        pKey = husher.buildPublicKey(pKey);
                        keys[userid] = globals.husher.encrypt(new_key, pKey);
                    });

                    // Send response and resolve
                    iq = self._createIQ('spacekeys', {id: $(response).attr('id')})
                        .t(JSON.stringify(keys));

                    self._connection.sendIQ(iq.tree(), d.resolve, d.reject);
                }, d.reject);
            return d.promise();
        },

        setPassword: function (keypair) {
            var d = $.Deferred(), self = this,
                iq = this._createIQ('changepassword')
                    .t(JSON.stringify(keypair));
            this._connection.sendIQ(iq.tree(), d.resolve, d.reject);
            return d.promise();
        },

        setFullname: function (fullname) {
            var d = $.Deferred(), self = this,
                iq = this._createIQ('setfullname')
                    .t(fullname);
            this._connection.sendIQ(iq.tree(), d.resolve, d.reject);
            return d.promise();
        },

        getTwoFactorData: function () {
            var d = $.Deferred(), self = this,
                iq = this._createIQ('twofactor', {type: 'get'});
            this._connection.sendIQ(iq.tree(), function (res) {
                 d.resolve(JSON.parse($('twofactor', res).text()));
            }, d.reject);
            return d.promise();
        },

        setMobile: function (local, country) {
            var d = $.Deferred(), self = this,
                iq = this._createIQ('mobile')
                    .t(JSON.stringify({country: country, local: local}));
            this._connection.sendIQ(iq.tree(), d.resolve, d.reject);
            return d.promise();
        },

        ping: function (spaceid) {
            var d = $.Deferred(),
                iq = this._createIQ('ping', {type: 'get'}, {spaceid: spaceid});
            this._connection.sendIQ(iq.tree(), d.resolve, d.reject);
            return d.promise();

        },

        getUpdates: function (data) {
            var d = $.Deferred(),iq;
            iq = this._createIQ('updates', {type: 'get'});
            if (data) {
                iq.t(JSON.stringify(data));
            }
            this._connection.sendIQ(iq.tree(), function (response) {
                d.resolve(JSON.parse($('updates', response).text()));
            }, d.reject);
            return d.promise();
        },

        update: function (data) {
            var d = $.Deferred(),
                iq = this._createIQ('update')
                    .t(JSON.stringify(data));
            this._connection.sendIQ(iq.tree(), d.resolve, d.reject);
            return d.promise();
        },

        // Accounts
        getPlans: function () {
            var d = $.Deferred(),
                iq = this._createIQ('plans', {type: 'get'});
            this._connection.sendIQ(iq.tree(), function (resp) {
                d.resolve(JSON.parse($('plans', resp).text()));
            }, d.reject);
            return d.promise();
        },

        getAccount: function () {
            var d = $.Deferred(),
                iq = this._createIQ('account', {type: 'get'});
            this._connection.sendIQ(iq.tree(), function (resp) {
                d.resolve(JSON.parse($('account', resp).text()));
            }, d.reject);
            return d.promise();
        },

        updateAccountDetails: function (details) {
            var d = $.Deferred(),
                iq = this._createIQ('account')
                    .c('details').t(JSON.stringify(details));
            this._connection.sendIQ(iq.tree(), d.resolve, d.reject);
            return d.promise();
        },

        getCCards: function () {
            var d = $.Deferred(),
                iq = this._createIQ('ccards', {type: 'get'});
            this._connection.sendIQ(iq.tree(), function (response) {
                d.resolve(JSON.parse($('ccards', response).text()));
            }, d.reject);
            return d.promise();
        },

        createCCardPayment: function (token) {
            var d = $.Deferred(),
                iq = this._createIQ('ccards')
                    .c('create').t(token);
            this._connection.sendIQ(iq.tree(), function (response) {
                d.resolve(JSON.parse($('ccard', response).text()));
            }, d.reject);
            return d.promise();
        },

        switchPlan: function (plan, ccard, token) {
            var d = $.Deferred(),
                payload = JSON.stringify({plan: plan, ccard: ccard, token: token}),
                iq = this._createIQ('account')
                    .c('upgrade').t(payload);
            this._connection.sendIQ(iq.tree(), d.resolve, d.reject);
            return d.promise();
        },

        addAccountMember: function (email) {
            var d = $.Deferred(),
                error,
                iq = this._createIQ('account')
                    .c('addmember').t(email);
            this._connection.sendIQ(iq.tree(),
                d.resolve,
                function (response) {
                    error = $('error', response).children().first().prop('tagName');
                    d.reject(error);
                });
            return d.promise();
        },

        removeAccountMember: function (uid) {
            var d = $.Deferred(),
                iq = this._createIQ('account')
                    .c('removemember').t(uid);
            this._connection.sendIQ(iq.tree(), d.resolve, d.reject);
            return d.promise();
        },

        removeAccountInvitation: function (email) {
            var d = $.Deferred(),
                iq = this._createIQ('account')
                    .c('removeinvitation').t(email);
            this._connection.sendIQ(iq.tree(), d.resolve, d.reject);
            return d.promise();
        },

        getTokenOffer: function (token) {
            var d = $.Deferred(),
                iq = this._createIQ('offer', {type: 'get'})
                    .c('token').t(token);
            this._connection.sendIQ(iq.tree(), function (response) {
                d.resolve(JSON.parse($('plan', response).text()));
            }, d.reject);
            return d.promise();
        },

        getDevices: function () {
            var d = $.Deferred(),
                iq = this._createIQ('devices', {type: 'get'});
            this._connection.sendIQ(iq.tree(), function (response) {
                d.resolve(JSON.parse($('devices', response).text()));
            }, d.reject);
            return d.promise();
        },

        discoverContacts: function (hashes) {
            var d = $.Deferred(),
                iq = this._createIQ('discovercontacts', {type: 'get'});

            _.each(hashes, function (hash) {
                iq.c('item').t(hash).up();
            });

            this._connection.sendIQ(iq.tree(), function (response) {
                var matches = $('matches', response).text();
                try {
                    matches = JSON.parse(matches);
                } catch (e) {
                    matches = {};
                }
                d.resolve(matches);
            }, d.reject);
            return d.promise();

        }

    });
});
