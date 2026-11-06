const mysql = require('mysql');
const util = require('util');

require('util.promisify').shim();



module.exports = function(){
    global.AUTHENTICATOR_DB = mysql.createPool( CONFIG.get('authenticator').db );
    global.AUTHENTICATOR_DB.sync_query = util.promisify(AUTHENTICATOR_DB.query).bind(AUTHENTICATOR_DB);


    global.VIDA_DB = mysql.createPool( CONFIG.get('vida').db);
    global.VIDA_DB.sync_query = util.promisify(VIDA_DB.query).bind(VIDA_DB);

    global.NEW_MASTER_DB = mysql.createPool( CONFIG.get('newMaster').db);
    global.NEW_MASTER_DB.sync_query = util.promisify(NEW_MASTER_DB.query).bind(NEW_MASTER_DB);

    global.PADRON_DB = mysql.createPool({ ...CONFIG.get('padron').db, dateStrings: true });
    global.PADRON_DB.sync_query = util.promisify(PADRON_DB.query).bind(PADRON_DB);
}

