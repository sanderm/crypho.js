define (['jquery', 'strophe'], function ($, wrapper) {
    var Strophe = wrapper.Strophe;
    Strophe.Bosh.prototype._processRequest = function (i) {};

    return {
        Strophe: Strophe,
        $iq: wrapper.$iq,

        jquerify: function (builder) {
            var xml = '';
            if (builder.tree) {
                xml = Strophe.serialize(builder.tree());
            } else {
                xml = Strophe.serialize(builder);
            }
            return $($.parseXML(xml));
        },

        createRequest: function (iq) {
            iq = typeof iq.tree === "function" ? iq.tree() : iq;
            var req = new Strophe.Request(iq, function () {});
            req.getResponse = function () {
                var env = new Strophe.Builder('env', {type: 'mock'}).tree();
                env.appendChild(iq);
                return env;
            };
            return req;
        },

        receive: function (c, req) {
            c._dataRecv(this.createRequest(req));
        },

        mockConnection: function (callback) {
            var c = new Strophe.Connection('');
            c.connect_callback = callback;
            c.authenticated = true;
            c.connected = true;
            c.jid = 'mocker@xmpp/r2';
            c._changeConnectStatus(Strophe.Status.CONNECTED);
            c.disconnect = function () {
                c._doDisconnect();
            };
            return c;
        }
    };
});