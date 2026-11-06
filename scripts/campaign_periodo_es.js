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

global.PADRON_DB = mysql.createPool({ ...CONFIG.get('padron').db, dateStrings: true });
global.PADRON_DB.sync_query = util.promisify(PADRON_DB.query).bind(PADRON_DB);
const person = require('../services/padron/person');
    try {
     


let tuidQuery = `SELECT u.telefono, u.email ,u.cuil,u.nombre, u.apellido,u.fecha,u.similitud,u.notificaciones,u.estado,ue.empresa, ue.fecha_recordatorio, ue.proxima, ue.notificacion,u.fecha_valida, u.ultima_notificacion,
if (ue.empresa = 'EFECTIVO SI', 
    if(now() > date(ue.notificacion), if(date(u.fecha_valida) >= date(ue.notificacion),'OK','PENDING'), if(date(u.fecha_valida) >= date(ue.fecha_recordatorio), 'OK','PENDING')),
    if(now() > date(ue.fecha_recordatorio), if(date(u.fecha_valida) >= date(ue.fecha_recordatorio),if(date(u.fecha_valida) > date(ue.notificacion),'LATE','OK'),'PENDING'),'OK')
) as status,
if (ue.empresa = 'EFECTIVO SI' && now() > date(ue.notificacion) ,  if (u.fecha_valida is not null, date(DATE_ADD(u.fecha_valida, INTERVAL 30 DAY)),ue.proxima ) , null) as validez,  
if (ue.empresa = 'EFECTIVO SI', notificacion, proxima) as next
FROM usuario u left join usuario_empresa ue on (u.cuil = ue.cuil) where u.similitud > 1 `;

let qr = `select * from (${tuidQuery} order by u.id_usuario) aux where aux.status = 'PENDING' and aux.notificaciones = 1 and aux.empresa = 'CAJA BAPRO' and email != '' `;


      let users = await VIDA_DB.sync_query(qr)
      console.log(users);
      for (i=1; i< users.length; i++){
        let name = users[i].nombre;
        let email = users[i].email;
        var token = tokenizer.tokenize({email:email });
        let params = {
          title: `${name} Informacion Importante sobre tu Beneficio Previsional`,
          nombre: name,
          desubscribeUrl: `${unsubscribeUrl}?token=${token}`
        }
      
        let result = await VIDA_DB.sync_query("insert into mails (email, last) values (?,UTC_TIMESTAMP()) on duplicate key update last= UTC_TIMESTAMP()",[email]);
        let isFallecido = await person.deceased(users[i].cuil);
        if (!isFallecido.fallecido){
          mail.send('campaigns/bapro', params , email, null, null );
        }else{
          slack.debug(`${users[i].cuil} ${name} ${users[i].apellido} posible fallecido - ${isFallecido.fecha} - Ultima fe de vida ${users[i].fecha_valida}}`);
        }
        if ( i % 100 == 0 ){ slack.debug(`${i} Email de campaña enviados`);}
        console.log(`Mail enviado a ${name} : ${email}`);

      }

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
      .pipe(csv.parse({ delimiter: ',' })
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
  

