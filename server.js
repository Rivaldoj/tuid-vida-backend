global.APP_PATH = __dirname;
process.env["NODE_CONFIG_DIR"] = APP_PATH + "/config/";
global.CONFIG = require('config');
const express = require('express');
require ('express-async-errors');
const app = express();
const slack = require('./utils/slack');
const telep = require('./utils/sms');
const phone = require('./startup/resources.js');
const liveness = require('./utils/liveness');

global.TESTING = process.env["TESTING"] == "true" ;
console.log(`****************************\nStarting ${TESTING?"TESTING":"PROD"}\n****************************`);

function notifyCrashAndExit(kind, err) {
    const stack = (err && err.stack) ? err.stack : String(err);
    console.log(kind, err);
    if (TESTING) {
        process.exit(1);
        return;
    }
    let exited = false;
    function done() {
        if (exited) return;
        exited = true;
        process.exit(1);
    }
    setTimeout(done, 2000);
    slack.error('*' + kind + '*\n```' + String(stack).slice(0, 2500) + '```', done);
}

process.on('uncaughtException', function (err) {
    notifyCrashAndExit('uncaughtException', err);
});
process.on('unhandledRejection', function (reason) {
    notifyCrashAndExit('unhandledRejection', reason);
});

phone.init();
setTimeout(() => {
    require('./startup/db')();
    require('./startup/sequelize.db')();
    require('./startup/aws')();
    require('./startup/routes.js')(app);
    require('./utils/webhooks').startRetryWorker();
    if (!TESTING) require('./utils/backups').iniciar();
    let port = process.env.PORT || CONFIG.get('port');

    app.listen(port,TESTING?'0.0.0.0':null, ()=>{
        console.log("Listening port: " + port);
        console.log("Swagger Vida v2: http://localhost:" + port + "/vida/v2/docs");
        console.log("Swagger Authenticator v2: http://localhost:" + port + "/authenticator/v2/docs");
        if (port == 8080 && !TESTING) telep.send("5491163576089","Levantando servidor en produccion", function(er,doc){});
        if(!TESTING)slack.debug("Listening port: " + port);

    });

}, 2200);

