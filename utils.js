define([
    'jquery',
    'underscore',
    ], function ($, _ ) {

    var _startedOn = {};

    var exports = {
        // Measures the amount of time a deferred takes to complete
        time: function (d, name) {
            _startedOn[name] = new Date().getTime();
            d.then(function () {
                var elapsed = new Date().getTime() - _startedOn[name];
                console.log(name + ' ' + d.state() + ' in ' + elapsed + 'msec');
                delete _startedOn[name];
            });
            return d;
        }
    };
    return exports;
});