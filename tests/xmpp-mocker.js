define (['jquery', 'strophe'], function ($, wrapper) {

    wrapper.Strophe.Bosh.prototype._processRequest = function (i) {};

    return {
        Strophe: wrapper.Strophe,
        $iq: wrapper.$iq,

        jquerify: function (builder) {
            var xml = '';
            if (builder.tree) {
                xml = wrapper.Strophe.serialize(builder.tree());
            } else {
                xml = wrapper.Strophe.serialize(builder);
            }
            return $($.parseXML(xml));
        },

        createRequest: function (iq) {
            iq = typeof iq.tree === "function" ? iq.tree() : iq;
            var req = new wrapper.Strophe.Request(iq, function () {});
            req.getResponse = function () {
                var env = new wrapper.Strophe.Builder('env', {type: 'mock'}).tree();
                env.appendChild(iq);
                return env;
            };
            return req;
        },

        receive: function (c, req) {
            c._dataRecv(this.createRequest(req));
        },

        mockConnection: function (callback) {
            var c = new wrapper.Strophe.Connection('');
            // c.connect_callback = callback;
            c.jid = 'mocker@xmpp/r2';
            c._changeConnectStatus(wrapper.Strophe.Status.CONNECTED);
            c.authenticated = true;
            c.disconnect = function () {
                c._doDisconnect();
            };
            return c;
        }
    };
});