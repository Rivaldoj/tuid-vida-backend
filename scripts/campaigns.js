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

const util = require('util');

(async () =>{
    require('../startup/aws')();
    global.VIDA_DB = await mysql.createPool( CONFIG.get('vida').db);
    global.VIDA_DB.sync_query = util.promisify(VIDA_DB.query).bind(VIDA_DB);
    global.PADRON_DB = mysql.createPool({ ...CONFIG.get('padron').db, dateStrings: true });
    global.PADRON_DB.sync_query = util.promisify(PADRON_DB.query).bind(PADRON_DB);
    const person = require('../services/padron/person');
    try {
      //let users = await VIDA_DB.sync_query("select * from usuario u join usuario_empresa ue on ue.cuil = u.cuil where ue.empresa = 'CAJA BAPRO' and u.fecha_fallecido is null and u.notificaciones = 1 and u.email is not null and u.email != '' and u.emailVrf = 1 and (u.fecha_valida is null or u.fecha_valida < DATE_SUB(now(), interval 6 day))");
      let users = await readCsv('./noregistrados.csv');
      console.log(users);
      console.log(users.length, users[0]);
      var enviados = 0;

      for (i=1; i< users.length; i++){
        var name = users[i].nombre;
        var lname = users[i].apellido;
        var email = users[i].email;
        var cuil = users[i].cuil;
        
        name = users[i][3].trim();

        lname = users[i][2].trim();
        email = users[i][1].trim();
        cuil = users[i][0].trim();

       

        var token = tokenizer.tokenize({email:email });
        let params = {
          title: `${name} tu Fe de Vida fácil`,
          name:  `${lname} ${name}`,
          desubscribeUrl: `${unsubscribeUrl}?token=${token}`
        }
        let fallecido = await person.deceased(cuil);
        if (!fallecido.fallecido){
          enviados++;
          await mail.send('campaigns/noregistrados', params , email, null, null );
          if ( enviados % 100 == 0 ){ slack.debug(`${enviados} Email de campaña enviados`);}
          console.log(`Mail enviado a ${params.name} : ${email}`);
        }
        await sleep(100);
        

      }
      await sleep(2500);
      process.exit();
    }catch (err){
      console.log(err);
    }
})()


function sleep(ms) {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  function readCsv(file){
    return new Promise((resolve, reject) => {
      console.log("Arranca");
      var array = [];
      fs.createReadStream(file)  
      .pipe(csv.parse({ delimiter: ';' })
        .on('data', (row) => {
          array.push(row);
        })
        .on('end', () => {
          console.log('Done.');
          resolve(array);
        })
        .on('error', (reject) => {
          console.log(reject);
        })
      );
    })
  
  }
  

