require.config({
    baseUrl: '.',

    urlArgs: 'cb=' + Math.random(),

    packages: [
        {
            name: 'crypho',
            location: '..',
        },
        {
            name: 'strophe-plugins',
            location: '../bower_components/strophe.plugins/',
        }

    ],

    paths: {
        jquery: '../bower_components/jquery/dist/jquery',
        underscore: '../bower_components/underscore/underscore',
        backbone: '../bower_components/backbone/backbone',
        strophe: '../bower_components/strophe/strophe',
        sjcl: 'sjcl',
        globals: 'globals-mock',
        xmppMocker: 'xmpp-mocker',
    },

    shim: {
        strophe: {
            deps: ['jquery'],
            exports: 'Strophe'
        },

        'crypho/scrypt': {
            deps: ['sjcl']
        }
    }
});


require([
        'specs/sweatshop_spec',
        'specs/husher_spec',
        'specs/scrypt_spec',
        'specs/protocol_spec'
    ], function ($) {

    var jasmineEnv = jasmine.getEnv();
    window.onload();
});