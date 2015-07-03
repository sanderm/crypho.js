define([
    'jquery',
    'xmppMocker',
    'globals',
    'crypho/husher',
    'crypho/protocol' ], function ($, xmppMocker,  globals, husher) {

    var NS_CRYPHO = 'http://crypho.com/ns/crypho';
    var NS_JABBER_CLIENT = 'jabber:client';
    var IQ_TYPES = {SET:'set', GET:'get'};
    husher.sweatshop.registerWorker('sjcl', 'sjcl.worker.js');

    describe('Crypho Protocol Tests', function () {
        var connection, successHandler, errorHandler, response;

        beforeEach(function () {
            connection = xmppMocker.mockConnection();
            successHandler = jasmine.createSpy('successHandler');
            errorHandler = jasmine.createSpy('errorHandler');
            response = '';
            expect(globals.husher).not.toBeDefined();

        });

        it('is available to the xmpp connection upon attaching', function () {
            expect(connection.Crypho).toBeDefined();
        });

        it('has registered the NS to Strophe upon attaching', function () {
            expect(Strophe.NS.CRYPHO).toEqual(NS_CRYPHO);
        });

        it('handles deleteSpace', function () {
            var spaceid = 3;
            spyOn(connection, 'send').and.callFake(function(request) {
                var node;
                checkIQ(request, IQ_TYPES.SET);
                node = getProtocolCommand("iq > deletespace", request);
                expect($(node).attr('uid')).toEqual(spaceid.toString());
                sendOKResponse(request);
            });
            promise = connection.Crypho.deleteSpace(spaceid).done(successHandler).fail(errorHandler);
            expect(errorHandler).not.toHaveBeenCalled();
            expect(successHandler).toHaveBeenCalledWith(response);
        });

        it('handles updateSpace', function () {
            var title = 'New Title', spaceid = 3;

            spyOn(connection, 'send').and.callFake(function(request) {
                var node, parsed;
                checkIQ(request, IQ_TYPES.SET);
                node = getProtocolCommand('iq > spaceupdate', request);
                expect($(node).attr('uid')).toEqual(spaceid.toString());
                parsed = JSON.parse(node.innerHTML);
                expect(parsed.title).toEqual(title);
                sendOKResponse(request);
            });
            connection.Crypho.updateSpace(spaceid, title).done(successHandler).fail(errorHandler);
            expect(errorHandler).not.toHaveBeenCalled();
            expect(successHandler).toHaveBeenCalledWith(response);
        });

        it('handles createGroupSpace',function (done) {
            var members = ['9wtaov1lfi16je83673bre28e', 'i116a0crdq758ro5xxjeztwge'],
                spaceid = 'vitm57q9keu6tvpm2vjxv9k25',
                keys, parsed, content;

            keys = {
                '9wtaov1lfi16je83673bre28e' : "9bWVy7zyGO+fse6vUQBepXk+LJbKHXgnxJ+I18uMtzUcES0uSUZAE16T29QoWvrza/b/rK1fvbUmMB9G6Lt+8lThWZisoPwgTHMVztsOkxNT27CuGXowwAPq6LioYwrp",
                'i116a0crdq758ro5xxjeztwge' : "nUCz1eHtVIVZmYIsXm+cQE1DwtoQCCr6mQhn/F0UrvzcOcRDP84zihFawTyncTw4fCUebyrvy/Ju63nCOHf7BZ2kdSNA2H1qw/eXdccl6ltO+aCDQxSIHwrwPVC2uS1n",
            };

            globals.me = {
                userID : function(){return "7aqokiyoejdzztov0kobgxel3";}
            };

            spyOn(connection, 'send').and.callFake(function(request) {
                var node;
                checkIQ(request, IQ_TYPES.SET);
                node = getProtocolCommand(["iq > createspace", "iq > spacekeys"], request);
                if (node.tagName === "createspace" ) {
                    parsed = JSON.parse(node.innerHTML);
                    expect(parsed.members).toBeDefined();
                    expect(parsed.members).toEqual(members);
                    content = "<keys xmlns='http://crypho.com/ns/crypho'>" + JSON.stringify(keys) +"</keys>";
                    sendOKResponse(request, content);
                } else
                if (node.tagName === "spacekeys" ) {
                    parsed = JSON.parse(node.innerHTML);
                    content = "<space xmlns='http://crypho.com/ns/crypho'>"+ spaceid +"</space>";
                    sendOKResponse(request, content);
                }
            });
            globals.husher = new husher.Husher();
            globals.husher.generate("secret").done(function () {
                connection.Crypho.createGroupSpace(members).done(successHandler).fail(errorHandler);
                expect(errorHandler).not.toHaveBeenCalled();
                expect(successHandler).toHaveBeenCalledWith(spaceid);
                delete globals.husher;
                done();
            });
        });

        xit('getSpaces');
        xit('getSpace');
        xit('invite');
        xit('getInvitations');
        xit('getSentInvitations');
        xit('rejectInvitation');
        xit('retractInvitation');
        xit('acceptInvitation');
        xit('setUserRolesInSpace');
        xit('addSpaceMember');
        xit('removeSpaceMember');
        xit('leaveSpace');
        xit('addSpaceKey');
        xit('setPassword');
        xit('setFullname');
        xit('getTwoFactorData');
        xit('setMobile');
        xit('ping');
        xit('getUpdates');
        xit('update');
        xit('getPlans');
        xit('getAccount');
        xit('updateAccountDetails');
        xit('getCCards');
        xit('createCCardPayment');
        xit('switchPlan');
        xit('addAccountMember');
        xit('removeAccountMember');
        xit('removeAccountInvitation');
        xit('getTokenOffer');
        xit('getDevices');
        xit('discoverContacts');

        function sendOKResponse (request, content) {
            request = xmppMocker.jquerify(request);
            response = $iq({type: 'result', id: $('iq', request).attr('id')}).tree();
            if (content) {
                $(response).append($.parseHTML(content));
            }
            xmppMocker.receive(connection, response);
        }

        function checkIQ(request, method){
            expect($(request).attr('xmlns')).toEqual(NS_JABBER_CLIENT);
            expect($(request).attr('type')).toEqual(method);
            var id = $(request).attr('id');
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
