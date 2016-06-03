define([
    'jquery',
    'underscore',
    'xmppMocker',
    'globals',
    'crypho/husher',
    'crypho/protocol' ], function ($, _, xmppMocker,  globals, husher) {

    var Strophe = xmppMocker.Strophe,
        $iq = xmppMocker.$iq;
    var NS_CRYPHO = 'http://crypho.com/ns/crypho';
    var NS_JABBER_CLIENT = 'jabber:client';
    var IQ_TYPES = {SET:'set', GET:'get'};
    husher.sweatshop.registerWorker('sjcl', '../../sjcl.worker.js');

    jasmine.DEFAULT_TIMEOUT_INTERVAL = 10000;

    describe('Crypho Protocol Tests', function () {
        var userID = 'qux', password = 'quxpass', email = 'qux@foobarqux.com',
            fooHusher, barHusher,
            connection, successHandler, errorHandler,
            response, node, parsed, PUB_KEYS;

        PUB_KEYS = [
                "4aVv1/0/jZtwysw3m2wxDtLFeZYnUyyJ3eHvpVuMf4wB5LqWglJiTlRUYm2yUOFwzIuy/Px03qPOdLblrNSPhDsSOaS3uDTqwgnxMa11XgvqMqiPQOIH4hs8mfi1X2sO",
                "MyEumhF6xmvM6L6e+gT2tU0Ef3FmKN54Ln/cMiJhI8zVnvuW5YLrmRc642Z0cW93n+ieCLKNV9zfLtCrRV9+Hjb7P5LbuVY8CCyppE+HhqG2t+stLeWDZXHQAXkELZrS"
            ];

        beforeAll(function(done){
            var gh_p, fh_p, bh_p;

            globals.me = {
                userID : function(){return userID;},
                email: function(){return email;}
            };

            globals.spaces = {
                get : function(space_id){
                    return {
                        encryptKeys : function(key) {
                            var res = [];
                            _.each(PUB_KEYS, function (v){
                                res.push(globals.husher.encrypt(v, key));
                            });
                            return res;
                        }
                    };
                }
            };
            globals.husher = new husher.Husher();
            fooHusher = new husher.Husher();
            barHusher = new husher.Husher();

            gh_p = globals.husher.generate(password, email);
            fh_p =  fooHusher.generate('foopass', 'foo@foobarqux.com');
            bh_p =  barHusher.generate('barpass', 'bar@foobarqux.com');

            $.when(gh_p, fh_p, bh_p).done(function(){done();});
        });

        beforeEach(function () {
            connection = xmppMocker.mockConnection();
            successHandler = jasmine.createSpy('successHandler');
            errorHandler = jasmine.createSpy('errorHandler');
            response = '';
            node = '';
            parsed = '';
        });

        afterAll(function () {
            delete globals.husher;
            delete globals.me;
            delete globals.spaces;
        });

        it('is available to the xmpp connection upon attaching', function () {
            expect(connection.Crypho).toBeDefined();
        });

        it('has registered the NS to Strophe upon attaching', function () {
            expect(Strophe.NS.CRYPHO).toEqual(NS_CRYPHO);
        });

        it('handles deleteSpace', function () {
            var spaceid = 'foo';

            spyOn(connection, 'send').and.callFake(function(request) {
                checkIQ(request, IQ_TYPES.SET);
                node = getProtocolCommand("iq > deletespace", request);
                expect($(node).attr('uid')).toEqual(spaceid);
                sendResponse(toResponse(request));
            });
            connection.Crypho.deleteSpace(spaceid).done(successHandler).fail(errorHandler);
            expectResult(response);
        });

        it('handles updateSpace', function () {
            var title = 'foo', spaceid = 'bar';

            spyOn(connection, 'send').and.callFake(function(request) {
                checkIQ(request, IQ_TYPES.SET);
                node = getProtocolCommand('iq > spaceupdate', request);
                expect($(node).attr('uid')).toEqual(spaceid);
                parsed = JSON.parse(node.innerHTML);
                expect(parsed.title).toEqual(title);
                sendResponse(toResponse(request));
            });
            connection.Crypho.updateSpace(spaceid, title).done(successHandler).fail(errorHandler);
            expectResult(response);
        });

        it('handles createGroupSpace', function () {
            var members = ['foo', 'bar'], spaceid = 'foobar';

            spyOn(connection, 'send').and.callFake(function(request) {
                var keys;

                checkIQ(request, IQ_TYPES.SET);
                node = getProtocolCommand(['iq > createspace', 'iq > spacekeys'], request);
                if (node.tagName === 'createspace') {
                    parsed = JSON.parse(node.innerHTML);
                    expect(parsed.members).toBeDefined();
                    expect(parsed.members).toEqual(members);
                    keys = {
                        'foo' : fooHusher.toSession().encryptionKey.pub,
                        'bar' : barHusher.toSession().encryptionKey.pub,
                    };
                    sendResponse(toResponse(request).c('keys', {xmlns:NS_CRYPHO}).t(JSON.stringify(keys)));
                } else
                if (node.tagName === 'spacekeys') {
                    parsed = JSON.parse(node.innerHTML);

                    // Both recipients should be able to decrypt the same key
                    var key = globals.husher.decrypt(parsed[globals.me.userID()]);
                    expect(key).toEqual(fooHusher.decrypt(parsed.foo));
                    expect(key).toEqual(barHusher.decrypt(parsed.bar));
                    // Foo should be able to verify the key was signed by the requester.
                    expect(
                        fooHusher.verify(key,
                                         node.getAttribute('signature'),
                                         globals.husher.signingKey.pub)
                    ).toBeTruthy();
                    sendResponse(toResponse(request).c('space', {xmlns:NS_CRYPHO}).t(spaceid));
                }
            });

            connection.Crypho.createGroupSpace(members).done(successHandler).fail(errorHandler);
            expectResult(spaceid);
        });

        it('handles getSpaces', function () {
            var userid = 'qux', spaces = {'foo':'bar'};

            spyOn(connection, 'send').and.callFake(function(request) {
                checkIQ(request, IQ_TYPES.GET);
                node = getProtocolCommand('iq > spaces', request);
                sendResponse(toResponse(request).c('spaces', {xmlns:NS_CRYPHO}).t(JSON.stringify(spaces)));
            });
            connection.Crypho.getSpaces(userid).done(successHandler).fail(errorHandler);
            expectResult(spaces);
        });

        it('handles getSpace', function () {
            var spaceid = "foo", space = {'foo':'bar'};

            spyOn(connection, 'send').and.callFake(function(request) {
                checkIQ(request, IQ_TYPES.GET);
                node = getProtocolCommand('iq > space', request);
                sendResponse(toResponse(request).c('space', {xmlns:NS_CRYPHO}).t(JSON.stringify(space)));
            });
            connection.Crypho.getSpace(spaceid).done(successHandler).fail(errorHandler);
            expectResult(space);
        });

        it('handles invite', function () {
            var emails = ['foo@bar.com', 'bar@foo.com'],
                message = "Lorem ipsum dolor sit amet...";

            spyOn(connection, 'send').and.callFake(function(request) {
                checkIQ(request, IQ_TYPES.SET);
                node = getProtocolCommand('iq > invite', request);
                parsed = JSON.parse(node.innerHTML);
                expect(parsed.emails).toEqual(emails);
                expect(parsed.message).toEqual(message);
                sendResponse(toResponse(request));
            });
            connection.Crypho.invite(emails, message).done(successHandler).fail(errorHandler);
            expectResult(response);
        });

        it('handles getInvitations', function () {
            var invitations = {};

            spyOn(connection, 'send').and.callFake(function(request) {
                checkIQ(request, IQ_TYPES.GET);
                node = getProtocolCommand('iq > invitations', request);
                sendResponse(toResponse(request).c('invitations', {xmlns:NS_CRYPHO}).t(JSON.stringify(invitations)));
            });
            connection.Crypho.getInvitations().done(successHandler).fail(errorHandler);
            expectResult(invitations);
        });

        it('handles getSentInvitations', function () {
            var invitations = {};

            spyOn(connection, 'send').and.callFake(function(request) {
                checkIQ(request, IQ_TYPES.GET);
                node = getProtocolCommand('iq > sentinvitations', request);
                sendResponse(toResponse(request).c('invitations', {xmlns:NS_CRYPHO}).t(JSON.stringify(invitations)));
            });
            connection.Crypho.getSentInvitations().done(successHandler).fail(errorHandler);
            expectResult(invitations);
        });

        it('handles rejectInvitation', function () {
            var invitationid = 3;

            spyOn(connection, 'send').and.callFake(function(request) {
                checkIQ(request, IQ_TYPES.SET);
                node = getProtocolCommand("iq > rejectinvitation", request);
                parsed = JSON.parse(node.innerHTML);
                expect(parsed.uid).toEqual(invitationid);
                sendResponse(toResponse(request));
            });
            connection.Crypho.rejectInvitation(invitationid).done(successHandler).fail(errorHandler);
            expectResult(response);
        });

        it('handles retractInvitation', function () {
            var invitationid = 3;

            spyOn(connection, 'send').and.callFake(function(request) {
                checkIQ(request, IQ_TYPES.SET);
                node = getProtocolCommand("iq > retractinvitation", request);
                parsed = JSON.parse(node.innerHTML);
                expect(parsed.uid).toEqual(invitationid);
                sendResponse(toResponse(request));
            });
            connection.Crypho.retractInvitation(invitationid).done(successHandler).fail(errorHandler);
            expectResult(response);
        });

        it('handles acceptInvitation', function () {
            var spaceid = 'foobar', invitationid = 'foobarqux';

            spyOn(connection, 'send').and.callFake(function(request) {
                var res;

                checkIQ(request, IQ_TYPES.SET);
                node = getProtocolCommand(['iq > acceptinvitation', 'iq > spacekeys'], request);
                if (node.tagName === 'acceptinvitation' ) {
                    expect (node.innerHTML).toEqual(invitationid);
                    res = toResponse(request).c('invitor', {xmlns:NS_CRYPHO});
                    res.c('uid').t('foo').up();
                    res.c('pubkey').t(fooHusher.toSession().encryptionKey.pub);
                    sendResponse(res);
                } else
                if (node.tagName === 'spacekeys') {
                    parsed = JSON.parse(node.innerHTML);
                    // Both recipients should be able to decrypt the same key
                    var key = fooHusher.decrypt(parsed.foo);
                    expect(key).toEqual(globals.husher.decrypt(parsed[globals.me.userID()]));
                    // Foo should be able to verify the key was signed by the requester.
                    expect(
                        fooHusher.verify(key,
                                         node.getAttribute('signature'),
                                         globals.husher.signingKey.pub)
                    ).toBeTruthy();
                    sendResponse(toResponse(request).c('space', {xmlns:NS_CRYPHO}).t(spaceid));
                }
            });

            connection.Crypho.acceptInvitation(invitationid).done(successHandler).fail(errorHandler);
            expectResult(spaceid);
        });

        it('handles setUserRolesInSpace', function () {
            var spaceid = 'foobar', userid = 'foo', diff = {'foo':'bar'};

            spyOn(connection, 'send').and.callFake(function(request) {
                checkIQ(request, IQ_TYPES.SET);
                node = getProtocolCommand("iq > userrole", request);
                parsed = JSON.parse(node.innerHTML);
                expect(parsed.spaceid).toEqual(spaceid);
                expect(parsed.userid).toEqual(userid);
                expect(parsed.diff).toEqual(diff);
                sendResponse(toResponse(request));
            });
            connection.Crypho.setUserRolesInSpace(spaceid, userid, diff).done(successHandler).fail(errorHandler);
            expectResult(response);
        });

        it('handles addSpaceMember', function () {
            var spaceid = 'foobar', memberid = "foo";

            spyOn(connection, 'send').and.callFake(function(request) {
                checkIQ(request, IQ_TYPES.SET);
                node = getProtocolCommand(['iq > addmember', 'iq > spacekeys'], request);
                if (node.tagName === 'addmember' ) {
                    expect ($(node).attr('spaceid')).toEqual(spaceid);
                    expect ($(node).attr('memberid')).toEqual(memberid);
                    sendResponse(toResponse(request).c('key', {xmlns:NS_CRYPHO}).t(fooHusher.toSession().encryptionKey.pub));
                } else
                if (node.tagName === 'spacekeys') {
                    parsed = JSON.parse(node.innerHTML);
                    for (var i in parsed) {
                        var decrypted = globals.husher.decrypt(parsed[i], fooHusher.encryptionKey.sec);
                        expect(PUB_KEYS).toEqual(jasmine.arrayContaining([decrypted]));
                    }
                    sendResponse(toResponse(request));
                }
            });
            connection.Crypho.addSpaceMember(spaceid, memberid).done(successHandler).fail(errorHandler);
            expectResult(response);
        });

        it('handles removeSpaceMember', function () {
            var spaceid = 'foobar', memberid = 'bar';

            spyOn(connection, 'send').and.callFake(function(request) {
                checkIQ(request, IQ_TYPES.SET);
                node = getProtocolCommand(['iq > removemember', 'iq > spacekeys'], request);
                if (node.tagName === 'removemember' ) {
                    expect ($(node).attr('spaceid')).toEqual(spaceid);
                    expect ($(node).attr('memberid')).toEqual(memberid);

                    var spacekeys = {'foo': fooHusher.toSession().encryptionKey.pub};
                    sendResponse(toResponse(request).c('keys', {xmlns:NS_CRYPHO}).t(JSON.stringify(spacekeys)));
                } else
                if (node.tagName === 'spacekeys') {
                    parsed = JSON.parse(node.innerHTML);
                    // Foo should be able to verify the key was signed by the requester.
                    var key = globals.husher.decrypt(parsed.foo, fooHusher.encryptionKey.sec);
                    expect(key).toBeDefined();
                    expect(
                        fooHusher.verify(key,
                                         node.getAttribute('signature'),
                                         globals.husher.signingKey.pub)
                    ).toBeTruthy();
                    sendResponse(toResponse(request));
                }
            });
            connection.Crypho.removeSpaceMember(spaceid, memberid).done(successHandler).fail(errorHandler);
            expectResult(response);
        });

        it('handles leaveSpace', function () {
            var spaceid = 'foobar';

            spyOn(connection, 'send').and.callFake(function(request) {
                checkIQ(request, IQ_TYPES.SET);
                node = getProtocolCommand('iq > leavespace', request);
                expect($(node).attr('spaceid')).toEqual(spaceid);
                sendResponse(toResponse(request));
            });
            connection.Crypho.leaveSpace(spaceid).done(successHandler).fail(errorHandler);
            expectResult(response);
        });

        it('handles addSpaceKey', function () {
            var spaceid = 'foobar';

            spyOn(connection, 'send').and.callFake(function(request) {
                checkIQ(request, IQ_TYPES.SET);
                node = getProtocolCommand(['iq > addspacekey', 'iq > spacekeys'], request);
                if (node.tagName === 'addspacekey' ) {
                    expect ($(node).attr('spaceid')).toEqual(spaceid);
                    var spacekeys = {'foo': fooHusher.toSession().encryptionKey.pub};
                    sendResponse(toResponse(request).c('keys', {xmlns:NS_CRYPHO}).t(JSON.stringify(spacekeys)));
                } else
                if (node.tagName === 'spacekeys') {
                    parsed = JSON.parse(node.innerHTML);
                    var key = globals.husher.decrypt(parsed.foo, fooHusher.encryptionKey.sec);
                    expect(key).toBeDefined();
                    expect(
                        fooHusher.verify(key,
                                         node.getAttribute('signature'),
                                         globals.husher.signingKey.pub)
                    ).toBeTruthy();
                    sendResponse(toResponse(request));
                }
            });
            connection.Crypho.addSpaceKey(spaceid).done(successHandler).fail(errorHandler);
            expectResult(response);
        });

        it('handles setPassword', function (done) {
            var newpass = 'foobar', keypair;

            spyOn(connection, 'send').and.callFake(function(request) {
                checkIQ(request, IQ_TYPES.SET);
                node = getProtocolCommand('iq > changepassword', request);
                parsed = JSON.parse(node.innerHTML);
                expect(globals.husher.toSession().pub).toEqual(parsed.pub);
                sendResponse(toResponse(request));
            });

            husher._strengthenScrypt(newpass).done(function (strengthened) {
                var savedHusher = _.clone(globals.husher);
                globals.husher.pkey = strengthened.key;
                globals.husher.psalt = strengthened.salt;
                globals.husher.pN = strengthened.N;
                globals.husher.pr = strengthened.r;
                globals.husher.pp = strengthened.p;
                keypair = globals.husher.toJSON(globals.me.email());
                connection.Crypho.setPassword(keypair).done(successHandler).fail(errorHandler);
                globals.husher = savedHusher;
                expectResult(response);
                done();
            });
        });

        it('handles setFullname', function () {
            var fullname = 'foobar';

            spyOn(connection, 'send').and.callFake(function(request) {
                checkIQ(request, IQ_TYPES.SET);
                node = getProtocolCommand("iq > setfullname", request);
                expect (node.innerHTML).toEqual(fullname);
                sendResponse(toResponse(request));
            });
            connection.Crypho.setFullname(fullname).done(successHandler).fail(errorHandler);
            expectResult(response);
        });

        it('handles getTwoFactorData', function () {
            var tfa = {'foo': 'bar', 'bar': 'foo'};

            spyOn(connection, 'send').and.callFake(function(request) {
                checkIQ(request, IQ_TYPES.GET);
                node = getProtocolCommand('iq > twofactor', request);
                sendResponse(toResponse(request).c('twofactor', {xmlns:NS_CRYPHO}).t(JSON.stringify(tfa)));
            });
            connection.Crypho.getTwoFactorData().done(successHandler).fail(errorHandler);
            expectResult(tfa);
        });

        it('handles setMobile', function () {
            var local = 'foo', country = 'bar';

            spyOn(connection, 'send').and.callFake(function(request) {
                checkIQ(request, IQ_TYPES.SET);
                node = getProtocolCommand("iq > mobile", request);
                parsed = JSON.parse(node.innerHTML);
                expect(parsed.local).toEqual(local);
                expect(parsed.country).toEqual(country);
                sendResponse(toResponse(request));
            });
            connection.Crypho.setMobile(local, country).done(successHandler).fail(errorHandler);
            expectResult(response);
        });

        it('handles ping', function () {
            var spaceid = "foo";

            spyOn(connection, 'send').and.callFake(function(request) {
                checkIQ(request, IQ_TYPES.GET);
                node = getProtocolCommand("iq > ping", request);
                sendResponse(toResponse(request));
            });
            connection.Crypho.ping(spaceid).done(successHandler).fail(errorHandler);
            expectResult(response);
        });

        it('handles getUpdates', function () {
            var updates = {'foo': 'bar'};

            spyOn(connection, 'send').and.callFake(function(request) {
                checkIQ(request, IQ_TYPES.GET);
                node = getProtocolCommand('iq > updates', request);
                sendResponse(toResponse(request).c('updates', {xmlns:NS_CRYPHO}).t(JSON.stringify(updates)));
            });
            connection.Crypho.getUpdates().done(successHandler).fail(errorHandler);
            expectResult(updates);
        });

        it('handles getUpdates with params', function () {
            var updates = {'foo': 'bar'}, data = {'qux': 'foo'};

            spyOn(connection, 'send').and.callFake(function(request) {
                checkIQ(request, IQ_TYPES.GET);
                node = getProtocolCommand('iq > updates', request);
                parsed = JSON.parse(node.innerHTML);
                expect(parsed).toEqual(data);
                sendResponse(toResponse(request).c('updates', {xmlns:NS_CRYPHO}).t(JSON.stringify(updates)));
            });
            connection.Crypho.getUpdates(data).done(successHandler).fail(errorHandler);
            expectResult(updates);
        });

        it('handles update', function () {
            var data = {'qux': 'foo'};

            spyOn(connection, 'send').and.callFake(function(request) {
                checkIQ(request, IQ_TYPES.SET);
                node = getProtocolCommand('iq > update', request);
                parsed = JSON.parse(node.innerHTML);
                expect(parsed).toEqual(data);
                sendResponse(toResponse(request));
            });
            connection.Crypho.update(data).done(successHandler).fail(errorHandler);
            expectResult(response);
        });

        it('handles getPlans', function () {
            var plans = {'foo': 'bar'};

            spyOn(connection, 'send').and.callFake(function(request) {
                checkIQ(request, IQ_TYPES.GET);
                node = getProtocolCommand('iq > plans', request);
                sendResponse(toResponse(request).c('plans', {xmlns:NS_CRYPHO}).t(JSON.stringify(plans)));
            });
            connection.Crypho.getPlans().done(successHandler).fail(errorHandler);
            expectResult(plans);
        });

        it('handles getAccount', function () {
            var account = {'foo': 'bar'};

            spyOn(connection, 'send').and.callFake(function(request) {
                checkIQ(request, IQ_TYPES.GET);
                node = getProtocolCommand('iq > account', request);
                sendResponse(toResponse(request).c('account', {xmlns:NS_CRYPHO}).t(JSON.stringify(account)));
            });
            connection.Crypho.getAccount().done(successHandler).fail(errorHandler);
            expectResult(account);
        });

        it('handles updateAccountDetails', function () {
            var data = {'foo': 'bar'};

            spyOn(connection, 'send').and.callFake(function(request) {
                checkIQ(request, IQ_TYPES.SET);
                node = getProtocolCommand('iq > account', request);
                parsed = JSON.parse($('details', node)[0].innerHTML);
                expect(parsed).toEqual(data);
                sendResponse(toResponse(request));
            });
            connection.Crypho.updateAccountDetails(data).done(successHandler).fail(errorHandler);
            expectResult(response);
        });

        it('handles getCCards', function () {
            var ccards = {'foo': 'bar'};

            spyOn(connection, 'send').and.callFake(function(request) {
                checkIQ(request, IQ_TYPES.GET);
                node = getProtocolCommand('iq > ccards', request);
                sendResponse(toResponse(request).c('ccards', {xmlns:NS_CRYPHO}).t(JSON.stringify(ccards)));
            });
            connection.Crypho.getCCards().done(successHandler).fail(errorHandler);
            expectResult(ccards);
        });

        it('handles createCCardPayment', function () {
            var ccard = {'foo': 'bar'}, token = 'qux';

            spyOn(connection, 'send').and.callFake(function(request) {
                checkIQ(request, IQ_TYPES.SET);
                node = getProtocolCommand('iq > ccards', request);
                expect($('create', node)[0].innerHTML).toEqual(token);
                sendResponse(toResponse(request).c('ccard', {xmlns:NS_CRYPHO}).t(JSON.stringify(ccard)));
            });
            connection.Crypho.createCCardPayment(token).done(successHandler).fail(errorHandler);
            expectResult(ccard);
        });

        it('handles switchPlan', function () {
            var plan = 'plan', ccard = {'foo': 'bar'}, token = 'qux';

            spyOn(connection, 'send').and.callFake(function(request) {
                checkIQ(request, IQ_TYPES.SET);
                node = getProtocolCommand('iq > account', request);
                parsed = JSON.parse($('upgrade', node)[0].innerHTML);
                expect(parsed.plan).toEqual(plan);
                expect(parsed.ccard).toEqual(ccard);
                expect(parsed.token).toEqual(token);
                sendResponse(toResponse(request));
            });
            connection.Crypho.switchPlan(plan, ccard, token).done(successHandler).fail(errorHandler);
            expectResult(response);
        });

        it('handles addAccountMember', function () {
            var email = "foo@bar.com";

            spyOn(connection, 'send').and.callFake(function(request) {
                checkIQ(request, IQ_TYPES.SET);
                node = getProtocolCommand('iq > account', request);
                expect($('addmember', node)[0].innerHTML).toEqual(email);
                sendResponse(toResponse(request));
            });
            connection.Crypho.addAccountMember(email).done(successHandler).fail(errorHandler);
            expectResult(response);
        });

        it('handles removeAccountMember', function () {
            var uid ='foobar';

            spyOn(connection, 'send').and.callFake(function(request) {
                checkIQ(request, IQ_TYPES.SET);
                node = getProtocolCommand('iq > account', request);
                expect($('removemember', node)[0].innerHTML).toEqual(uid);
                sendResponse(toResponse(request));
            });
            connection.Crypho.removeAccountMember(uid).done(successHandler).fail(errorHandler);
            expectResult(response);
        });

        it('handles removeAccountInvitation', function () {
            var email = "foo@bar.com";

            spyOn(connection, 'send').and.callFake(function(request) {
                checkIQ(request, IQ_TYPES.SET);
                node = getProtocolCommand('iq > account', request);
                expect($('removeinvitation', node)[0].innerHTML).toEqual(email);
                sendResponse(toResponse(request));
            });
            connection.Crypho.removeAccountInvitation(email).done(successHandler).fail(errorHandler);
            expectResult(response);
        });

        it('handles getTokenOffer', function () {
            var plan = {'foo': 'bar'}, token = 'qux';

            spyOn(connection, 'send').and.callFake(function(request) {
                checkIQ(request, IQ_TYPES.GET);
                node = getProtocolCommand('iq > offer', request);
                expect($('token', node)[0].innerHTML).toEqual(token);
                sendResponse(toResponse(request).c('plan', {xmlns:NS_CRYPHO}).t(JSON.stringify(plan)));
            });
            connection.Crypho.getTokenOffer(token).done(successHandler).fail(errorHandler);
            expectResult(plan);
        });

        it('handles getDevices', function () {
            var devices = {'foo': 'bar'};

            spyOn(connection, 'send').and.callFake(function(request) {
                checkIQ(request, IQ_TYPES.GET);
                node = getProtocolCommand('iq > devices', request);
                sendResponse(toResponse(request).c('devices', {xmlns:NS_CRYPHO}).t(JSON.stringify(devices)));
            });
            connection.Crypho.getDevices().done(successHandler).fail(errorHandler);
            expectResult(devices);
        });

        it('handles discoverContacts', function () {
            var hashes = ['foo', 'bar'], matches = {'foo': 'bar'};

            spyOn(connection, 'send').and.callFake(function(request) {
                checkIQ(request, IQ_TYPES.GET);
                node = getProtocolCommand('iq > discovercontacts', request);
                expect($('item', node).length).toEqual(hashes.length);
                sendResponse(toResponse(request).c('matches', {xmlns:NS_CRYPHO}).t(JSON.stringify(matches)));
            });
            connection.Crypho.discoverContacts(hashes).done(successHandler).fail(errorHandler);
            expectResult(matches);
        });

        function expectResult(result){
            expect(errorHandler).not.toHaveBeenCalled();
            expect(successHandler).toHaveBeenCalledWith(result);
        }

        function toResponse(req){
            req = xmppMocker.jquerify(req);
            return $iq({type: 'result', id: $('iq', req).attr('id'), from: 'crypho.xmpp'});
        }

        function sendResponse(res) {
            response = res.tree();
            xmppMocker.receive(connection, response);
        }

        function checkIQ(node, method){
            expect(node.tagName).toEqual("iq");
            expect($(node).attr('xmlns')).toEqual(NS_JABBER_CLIENT);
            expect($(node).attr('type')).toEqual(method);
            var id = $(node).attr('id');
            expect(id).toBeDefined();
            expect(id).toMatch(/\w:\w/);
        }

        function getProtocolCommand(select, node) {
            var nodes, res, i;

            if (select.constructor === Array) {
                for (i = 0; i < select.length; i++) {
                    nodes = $(select[i], node);
                    if (nodes.length > 0) {
                        break;
                    }
                }
            } else {
                nodes = $(select, node);
            }
            expect(nodes.length).toEqual(1);
            res = nodes[0];
            expect($(res).attr('xmlns')).toEqual(NS_CRYPHO);
            expect($(res).attr('version')).toBeDefined();
            return res;
        }
    });

});
