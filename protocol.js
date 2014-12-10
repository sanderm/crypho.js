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

        init: function (conn) {
            this._connection = conn;
            Strophe.addNamespace('CRYPHO', 'http://crypho.com/ns/crypho');
            _.extend(this, Backbone.Events);
        },

        statusChanged: function (status, condition) {
            var that = this;
            if (status === Strophe.Status.CONNECTED || status === Strophe.Status.ATTACHED) {
                that.service =  'crypho.' + Strophe.getDomainFromJid(that._connection.jid);
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

        createGroupSpace: function(members) {
            var self = this,
                d = $.Deferred(),
                iq = $iq({to: this.service, type: 'set', id: this._connection.getUniqueId('crypho')}),
                key = husher.randomKey(),
                userid = Strophe.getNodeFromJid(this._connection.jid),
                keys = {};

            iq.c('createspace', {xmlns: Strophe.NS.CRYPHO})
              .t(JSON.stringify({members: members}));
            this._connection.sendIQ(iq.tree(), function (response) {
                var pubKey, pubKeys;
                pubKeys = JSON.parse($('keys', response).text());
                _.each(pubKeys, function (k, member) {

                    pubKey = husher.buildPublicKey(k);
                    keys[member] = globals.husher.encrypt(key, pubKey);
                });
                keys[globals.me.userID()] = globals.husher.encrypt(key, globals.husher.key.pub);

                iq = $iq({to: self.service, type: 'set', id: $(response).attr('id')})
                    .c('spacekeys', {xmlns: Strophe.NS.CRYPHO})
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
                iq = $iq({
                    to: this.service,
                    type: 'set',
                    id: this._connection.getUniqueId('crypho')})
                .c('deletespace', {xmlns: Strophe.NS.CRYPHO, uid: uid});
            this._connection.sendIQ(iq.tree(), d.resolve, d.reject);
            return d.promise();
        },

        getSpaces: function () {
            var d = $.Deferred(),
                iq = $iq({to: this.service, type: 'get', id: this._connection.getUniqueId('crypho')});

            iq.c('spaces', {xmlns: Strophe.NS.CRYPHO});
            this._connection.sendIQ(iq.tree(), function (response) {
                d.resolve(JSON.parse($('spaces', response).text()));
            }, d.reject);
            return d.promise();
        },

        getSpace: function (uid) {
            var d = $.Deferred(),
                iq = $iq({to: this.service, type: 'get', id: this._connection.getUniqueId('crypho')});

            iq.c('space', {xmlns: Strophe.NS.CRYPHO, id: uid});
            this._connection.sendIQ(iq.tree(), function (response) {
                d.resolve(JSON.parse($('space', response).text()));
            }, d.reject);
            return d.promise();
        },

        invite: function (emails, message) {
            var d = $.Deferred(),
                iq = $iq({to: this.service, type: 'set', id: this._connection.getUniqueId('crypho')})
                    .c('invite', {xmlns: Strophe.NS.CRYPHO}, JSON.stringify({emails: emails, message: message}));
            this._connection.sendIQ(iq.tree(), d.resolve, d.reject);
            return d.promise();
        },

        getInvitations: function () {
            var d = $.Deferred(),
                iq = $iq({to: this.service, type: 'get', id: this._connection.getUniqueId('crypho')})
                    .c('invitations', {xmlns: Strophe.NS.CRYPHO});
            this._connection.sendIQ(iq.tree(), function (response) {
                d.resolve(JSON.parse($('invitations', response).text()));
            }, d.reject);
            return d.promise();
        },

        getSentInvitations: function () {
            var d = $.Deferred(),
                iq = $iq({to: this.service, type: 'get', id: this._connection.getUniqueId('crypho')})
                    .c('sentinvitations', {xmlns: Strophe.NS.CRYPHO});
            this._connection.sendIQ(iq.tree(), function (response) {
                d.resolve(JSON.parse($('invitations', response).text()));
            }, d.reject);
            return d.promise();
        },

        rejectInvitation: function (uid) {
            var d = $.Deferred(),
                iq = $iq({to: this.service, type: 'set', id: this._connection.getUniqueId('crypho')})
                    .c('rejectinvitation', {xmlns: Strophe.NS.CRYPHO}).t(JSON.stringify({uid: uid}));
            this._connection.sendIQ(iq.tree(), d.resolve, d.reject);
            return d.promise();
        },

        retractInvitation: function (uid) {
            var d = $.Deferred(),
                iq = $iq({to: this.service, type: 'set', id: this._connection.getUniqueId('crypho')})
                    .c('retractinvitation', {xmlns: Strophe.NS.CRYPHO}).t(JSON.stringify({uid: uid}));
            this._connection.sendIQ(iq.tree(), d.resolve, d.reject);
            return d.promise();
        },

        acceptInvitation: function (uid) {
            var d = $.Deferred(), self = this,
                iq = $iq({to: this.service, type: 'set', id: this._connection.getUniqueId('crypho')})
                    .c('acceptinvitation', {xmlns: Strophe.NS.CRYPHO}).t(uid),
                key = husher.randomKey(),
                keys = {};

            this._connection.sendIQ(iq.tree(),
                function (response) {

                    var invitor_id = $('uid', response).text(),
                        invitor_pubkey = husher.buildPublicKey($('pubkey', response).text());

                    keys[globals.me.userID()] = globals.husher.encrypt(key, globals.husher.key.pub);
                    keys[invitor_id] = globals.husher.encrypt(key, invitor_pubkey);

                    iq = $iq({to: self.service, type: 'set', id: $(response).attr('id')})
                        .c('spacekeys', {xmlns: Strophe.NS.CRYPHO})
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
                iq = $iq({to: this.service, type: 'set', id: this._connection.getUniqueId('crypho')})
                    .c('userrole', {xmlns: Strophe.NS.CRYPHO})
                    .t(JSON.stringify({spaceid: spaceid, userid: uid, diff: diff}));

            this._connection.sendIQ(iq.tree(), d.resolve, d.reject);
            return d.promise();
        },

        addSpaceMember: function (spaceid, memberid) {
            var d = $.Deferred(), self = this,
                iq = $iq({to: this.service, type: 'set', id: this._connection.getUniqueId('crypho')})
                    .c('addmember', {xmlns: Strophe.NS.CRYPHO, spaceid: spaceid, memberid: memberid});

            this._connection.sendIQ(iq.tree(), function (response) {
                //Encrypt space keys with the new member's public key.
                var space = globals.spaces.get(spaceid),
                    publicKey = $('key', response).text(),
                    keys;

                publicKey = husher.buildPublicKey(publicKey);
                keys = space.encryptKeys(publicKey);

                // Send response and resolve
                iq = $iq({to: self.service, type: 'set', id: $(response).attr('id')})
                    .c('spacekeys', {xmlns: Strophe.NS.CRYPHO})
                    .t(JSON.stringify(keys));

                self._connection.sendIQ(iq.tree(), d.resolve, d.reject);
            }, d.reject);

            return d.promise();

        },

        removeSpaceMember: function (spaceid, memberid) {
            var d = $.Deferred(), self = this,
                iq = $iq({to: this.service, type: 'set', id: this._connection.getUniqueId('crypho')})
                    .c('removemember', {xmlns: Strophe.NS.CRYPHO, spaceid: spaceid, memberid: memberid});
            this._connection.sendIQ(iq.tree(),
                function (response) {
                    // Create new key and encrypt with response's public keys.
                    var keys = {},
                        space = globals.spaces.get(spaceid),
                        publicKeys = JSON.parse($('keys', response).text()),
                        new_key = husher.randomKey();

                    // Encrypt keys with remaining members public keys
                    _.each(publicKeys, function (pKey, userid) {

                        pKey = husher.buildPublicKey(pKey);
                        keys[userid] = globals.husher.encrypt(new_key, pKey);
                    });

                    // Send response and resolve
                    iq = $iq({to: self.service, type: 'set', id: $(response).attr('id')})
                        .c('spacekeys', {xmlns: Strophe.NS.CRYPHO})
                        .t(JSON.stringify(keys));

                    self._connection.sendIQ(iq.tree(), d.resolve, d.reject);
                }, d.reject);

            return d.promise();

        },

        leaveSpace: function (spaceid) {
            var d = $.Deferred(), self = this,
                iq = $iq({to: this.service, type: 'set', id: this._connection.getUniqueId('crypho')})
                    .c('leavespace', {xmlns: Strophe.NS.CRYPHO, spaceid: spaceid});
            this._connection.sendIQ(iq.tree(), d.resolve, d.reject);
            return d.promise();
        },

        addSpaceKey: function(spaceid) {
            var d = $.Deferred(), self = this,
                iq = $iq({to: this.service, type: 'set', id: this._connection.getUniqueId('crypho')})
                    .c('addspacekey', {xmlns: Strophe.NS.CRYPHO, spaceid: spaceid});
            this._connection.sendIQ(iq.tree(),
                function (response) {
                    // Create new key and encrypt with response's public keys.
                    var keys = {},
                        space = globals.spaces.get(spaceid),
                        publicKeys = JSON.parse($('keys', response).text()),
                        new_key = husher.randomKey();

                    // Encrypt keys with remaining members public keys
                    _.each(publicKeys, function (pKey, userid) {

                        pKey = husher.buildPublicKey(pKey);
                        keys[userid] = globals.husher.encrypt(new_key, pKey);
                    });

                    // Send response and resolve
                    iq = $iq({to: self.service, type: 'set', id: $(response).attr('id')})
                        .c('spacekeys', {xmlns: Strophe.NS.CRYPHO})
                        .t(JSON.stringify(keys));

                    self._connection.sendIQ(iq.tree(), d.resolve, d.reject);
                }, d.reject);
            return d.promise();
        },

        setPassword: function (keypair) {
            var d = $.Deferred(), self = this,
                iq = $iq({to: this.service, type: 'set', id: this._connection.getUniqueId('crypho')})
                    .c('changepassword', {xmlns: Strophe.NS.CRYPHO}).t(JSON.stringify(keypair));
            this._connection.sendIQ(iq.tree(), d.resolve, d.reject);
            return d.promise();
        },

        setFullname: function (fullname) {
            var d = $.Deferred(), self = this,
                iq = $iq({to: this.service, type: 'set', id: this._connection.getUniqueId('crypho')})
                    .c('setfullname', {xmlns: Strophe.NS.CRYPHO}).t(fullname);
            this._connection.sendIQ(iq.tree(), d.resolve, d.reject);
            return d.promise();
        },

        getTwoFactorData: function () {
            var d = $.Deferred(), self = this,
                iq = $iq({to: this.service, type: 'get', id: this._connection.getUniqueId('crypho')})
                    .c('twofactor', {xmlns: Strophe.NS.CRYPHO});
            this._connection.sendIQ(iq.tree(), function (res) {
                 d.resolve(JSON.parse($('twofactor', res).text()));
            }, d.reject);
            return d.promise();
        },

        setMobile: function (local, country) {
            var d = $.Deferred(), self = this,
                iq = $iq({to: this.service, type: 'set', id: this._connection.getUniqueId('crypho')})
                    .c('mobile', {xmlns: Strophe.NS.CRYPHO}).t(JSON.stringify({country: country, local: local}));
            this._connection.sendIQ(iq.tree(), d.resolve, d.reject);
            return d.promise();
        },

        ping: function (spaceid) {
            var d = $.Deferred(),
                iq = $iq({to: this.service, type: 'get', id: this._connection.getUniqueId('crypho')})
                    .c('ping', {xmlns: Strophe.NS.CRYPHO, spaceid: spaceid});
            this._connection.sendIQ(iq.tree(), d.resolve, d.reject);
            return d.promise();

        },

        getUpdates: function () {
            var d = $.Deferred(),
                iq = $iq({to: this.service, type: 'get', id: this._connection.getUniqueId('crypho')})
                    .c('updates', {xmlns: Strophe.NS.CRYPHO});
            this._connection.sendIQ(iq.tree(), function (response) {
                d.resolve(JSON.parse($('updates', response).text()));
            }, d.reject);
            return d.promise();
        },

        update: function (data) {
            var d = $.Deferred(),
                iq = $iq({to: this.service, type: 'set', id: this._connection.getUniqueId('crypho')})
                    .c('update', {xmlns: Strophe.NS.CRYPHO}).t(JSON.stringify(data));
            this._connection.sendIQ(iq.tree(), d.resolve, d.reject);
            return d.promise();
        },

        // Accounts
        getPlans: function () {
            var d = $.Deferred(),
                iq = $iq({to: this.service, type: 'get', id: this._connection.getUniqueId('crypho')})
                    .c('plans', {xmlns: Strophe.NS.CRYPHO});
            this._connection.sendIQ(iq.tree(), function (resp) {
                d.resolve(JSON.parse($('plans', resp).text()));
            }, d.reject);
            return d.promise();
        },

        getAccount: function () {
            var d = $.Deferred(),
                iq = $iq({to: this.service, type: 'get', id: this._connection.getUniqueId('crypho')})
                    .c('account', {xmlns: Strophe.NS.CRYPHO});
            this._connection.sendIQ(iq.tree(), function (resp) {
                d.resolve(JSON.parse($('account', resp).text()));
            }, d.reject);
            return d.promise();
        },

        updateAccountDetails: function (details) {
            var d = $.Deferred(),
                iq = $iq({to: this.service, type: 'set', id: this._connection.getUniqueId('crypho')})
                    .c('account', {xmlns: Strophe.NS.CRYPHO})
                    .c('details').t(JSON.stringify(details));
            this._connection.sendIQ(iq.tree(), d.resolve, d.reject);
            return d.promise();
        },

        getCCards: function () {
            var d = $.Deferred(),
                iq = $iq({to: this.service, type: 'get', id: this._connection.getUniqueId('crypho')})
                    .c('ccards', {xmlns: Strophe.NS.CRYPHO});
            this._connection.sendIQ(iq.tree(), function (response) {
                d.resolve(JSON.parse($('ccards', response).text()));
            }, d.reject);
            return d.promise();
        },

        createCCardPayment: function (token) {
            var d = $.Deferred(),
                iq = $iq({to: this.service, type: 'set', id: this._connection.getUniqueId('crypho')})
                    .c('ccards', {xmlns: Strophe.NS.CRYPHO})
                    .c('create').t(token);
            this._connection.sendIQ(iq.tree(), function (response) {
                d.resolve(JSON.parse($('ccard', response).text()));
            }, d.reject);
            return d.promise();
        },

        switchPlan: function (plan, ccard, token) {
            var d = $.Deferred(),
                payload = JSON.stringify({plan: plan, ccard: ccard, token: token}),
                iq = $iq({to: this.service, type: 'set', id: this._connection.getUniqueId('crypho')})
                    .c('account', {xmlns: Strophe.NS.CRYPHO})
                    .c('upgrade').t(payload);
            this._connection.sendIQ(iq.tree(), d.resolve, d.reject);
            return d.promise();
        },

        addAccountMember: function (email) {
            var d = $.Deferred(),
                iq = $iq({to: this.service, type: 'set', id: this._connection.getUniqueId('crypho')})
                    .c('account', {xmlns: Strophe.NS.CRYPHO})
                    .c('addmember').t(email),
                error;
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
                iq = $iq({to: this.service, type: 'set', id: this._connection.getUniqueId('crypho')})
                    .c('account', {xmlns: Strophe.NS.CRYPHO})
                    .c('removemember').t(uid);
            this._connection.sendIQ(iq.tree(), d.resolve, d.reject);
            return d.promise();
        },

        removeAccountInvitation: function (email) {
            var d = $.Deferred(),
                iq = $iq({to: this.service, type: 'set', id: this._connection.getUniqueId('crypho')})
                    .c('account', {xmlns: Strophe.NS.CRYPHO})
                    .c('removeinvitation').t(email);
            this._connection.sendIQ(iq.tree(), d.resolve, d.reject);
            return d.promise();
        },

        getTokenOffer: function (token) {
            var d = $.Deferred(),
                iq = $iq({to: this.service, type: 'get', id: this._connection.getUniqueId('crypho')})
                    .c('offer', {xmlns: Strophe.NS.CRYPHO})
                    .c('token').t(token);
            this._connection.sendIQ(iq.tree(), function (response) {
                d.resolve(JSON.parse($('plan', response).text()));
            }, d.reject);
            return d.promise();
        }

    });
});
