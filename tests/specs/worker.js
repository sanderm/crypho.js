function addition(x, y) {
    return x + y;
}


function failure () {
    throw "WorkerError";
}

self.addEventListener('message', function (ev) {

    var data = ev.data;
    switch (data.cmd) {
        case 'add':
            self.postMessage(addition.apply(self, data.args));
            break;
        case 'fail':
            self.postMessage(failure.apply(self, data.args));
            break;
        default:
            break;
    }

}, false);
