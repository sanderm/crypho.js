define(['underi18n'], function (underi18n) {
    var globals = function () {
        return {
            audio: true,
            lang: 'en',
            transl: new underi18n.MessageFactory({}),
            support: {
                notifications: false
            },
            minPasswdEntropy: 45.0,
            idleCheckInterval: 60000,
            idleThreshold: 10,
            logoutThreshold: 60
        };
    };
    return globals();
});