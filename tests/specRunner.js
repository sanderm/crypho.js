require.config({
    baseUrl: '.',

    urlArgs: 'cb=' + Math.random(),

    packages: [
        {
            name: 'crypho',
            location: '..',
        }
    ],

    paths: {
        jquery: '../bower_components/jquery/dist/jquery',
        underscore: '../bower_components/underscore/underscore',
        backbone: '../bower_components/backbone/backbone',
        sjcl: 'sjcl'
    },

    shim: {
    }
});


require([
    'specs/sweatshop_spec',
    'specs/husher_spec'
    ], function ($) {

    var jasmineEnv = jasmine.getEnv();

    window.onload();
});