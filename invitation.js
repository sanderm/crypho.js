define([
    'jquery',
    'underscore',
    'backbone',
    'underi18n',
    './XMPP',
    'globals'
], function ($, _, Backbone, underi18n, XMPP, globals) {

    var Invitation = {};

    // Generic model for invitations both received and sent.
    Invitation.Invitation = Backbone.Model.extend({

        idAttribute: 'uid',

        accept: function () {
            var self = this,
                space;
            return XMPP.connection.Crypho.acceptInvitation(this.get('uid')).done(function (id) {
                var onSpaceCreated = function (space) {
                    space.infostream.createActionItem({}, 'spaceCreated');
                    globals.spaces.off('add', onSpaceCreated);
                };
                globals.spaces.on('add', onSpaceCreated);
            });
        },

        reject: function () {
            var self = this;
            return XMPP.connection.Crypho.rejectInvitation(this.get('uid'))
                .done(function () {
                    if (self.collection) {
                        self.collection.remove(self);
                    }
                });
        },

        retract: function () {
            var self = this;
            return XMPP.connection.Crypho.retractInvitation(this.get('uid'))
                .done(function () {
                    if (self.collection) {
                        self.collection.remove(self);
                    }
                });
        }
    });

    Invitation.Invitations = Backbone.Collection.extend({

        model: Invitation.Invitation,

        initialize: function () {
            // When we receive a headline notification update.
            XMPP.connection.Crypho.on('invitationsupdated', this.fetch, this);
        },

        fetch: function(options) {
            var self = this,
                d = $.Deferred(),
                p = XMPP.connection.Crypho.getInvitations();
            p.done(function (json) {
                self.reset(json);
                d.resolve(self);
            });
            p.fail(d.reject);
            return d.promise();
        }

    });

    Invitation.SentInvitations = Backbone.Collection.extend({

        model: Invitation.Invitation,

        initialize: function () {
            // When we receive a headline notification update.
            XMPP.connection.Crypho.on('invitationsupdated', this.fetch, this);
        },

        fetch: function(options) {
            var self = this,
                d = $.Deferred();

            XMPP.connection.Crypho.getSentInvitations()
                .done(function (invitations) {
                    self.reset(invitations);
                    d.resolve(self);
                })
                .fail(d.reject);

            return d.promise();
        }

    });

    return Invitation;
});