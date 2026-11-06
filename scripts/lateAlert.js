global.APP_PATH = __dirname+"/..";
process.env["NODE_CONFIG_DIR"] = APP_PATH + "/config/";
global.CONFIG = require('config');
const mail = require('../utils/mail');
const csv =  require('fast-csv');
const fs = require('fs');
const unsubscribeUrl = CONFIG.get('vida').unsubscribeUrl;
require('util.promisify').shim();
const slack = require('../utils/slack');
const tokenizer = require('../utils/tokenizer');
const mysql = require('mysql');
const vidaAdmin = require('../middleware/vidaAdmin');

const util = require('util');

(async () =>{

    require('../startup/aws')();

    global.VIDA_DB = await mysql.createPool( CONFIG.get('vida').db );
    global.VIDA_DB.sync_query = util.promisify(VIDA_DB.query).bind(VIDA_DB);

    try {
      let query = "select *, DATEDIFF(now(),ultimo_archivo)  from empresa where ultimo_archivo is not null and DATEDIFF(now(),ultimo_archivo) > periodicidad * 30 and notificaciones = 1 and ( DATEDIFF(now(),ultima_notificacion) >= 1 or ultima_notificacion is null)"
      let res = await VIDA_DB.sync_query(query);
      for (const empresa of res){
        mail.send('reminderFile',{title: 'Actualizar Informacion para proximo periodo', cliente: empresa.nombre},empresa.email,null,['ignaciorosa90@gmail.com']);
        let result = await VIDA_DB.sync_query("UPDATE empresa set ultima_notificacion = CURDATE() where id = ?",empresa.id);
      }
      VIDA_DB.end();
    }catch (err){
      console.log(err);
    }
   
   
})()


function sleep(ms) {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }


