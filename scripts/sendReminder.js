global.APP_PATH = __dirname+"/..";
process.env["NODE_CONFIG_DIR"] = APP_PATH + "/config/";
global.CONFIG = require('config');
const mysql = require('mysql');
const util = require('util');
const mail = require('../utils/mail');
const tokenizer = require('../utils/tokenizer');
const whatsapp = require('../utils/whatsapp');
require('util.promisify').shim();
const unsubscribeUrl = CONFIG.get('vida').unsubscribeUrl;

const push = require('../utils/push');
const slack = require('../utils/slack');
const { nextTick } = require('process');
(async () =>{

    require('../startup/aws')();
    global.VIDA_DB = await mysql.createPool( CONFIG.get('vida').db );
    global.VIDA_DB.sync_query = util.promisify(VIDA_DB.query).bind(VIDA_DB);

    global.PADRON_DB = mysql.createPool({ ...CONFIG.get('padron').db, dateStrings: true });
    global.PADRON_DB.sync_query = util.promisify(PADRON_DB.query).bind(PADRON_DB);
    const person = require('../services/padron/person');
    var oldQuery = `
    select 
    u.nombre,
    RIGHT(u.cuil, 1) as verificador,
    u.id_usuario,
    u.apellido, 
    if (u.notificaciones_whatsapp < curdate(), 1,0) as notificaciones_whatsapp,
    u.dni, 
    u.sexo,
    u.email,
    if (u.telefonoVrf = 1, u.telefono, null) as telefono,
    u.cuil, 
    u.id_device,
    date(a.afecha) as fecha_valida, 
    date(u.ultima_notificacion) as ultima_notificacion, 
    if (ue.notificaciones_periodo = 1 && u.notificaciones = 1, 1,0 ) as notificaciones, 
    date(fecha_recordatorio) as recordatorio, 
    date(notificacion) as notificacion,
    date(proxima) as proxima,
    datediff(now(), u.ultima_notificacion) as dias_ultima_not,
    if ((
            now() > date(fecha_recordatorio) 
            && datediff(now(), u.ultima_notificacion ) > 5
            && (a.afecha is null || date(a.afecha) < date(fecha_recordatorio) )
            && e.tipo = 'E'
        ) || (
            datediff(now(), u.ultima_notificacion ) > 5
            && (a.afecha is null || datediff(now(),date(a.afecha)) > e.periodicidad * 30)
            && e.tipo = 'D' 
        )
     ,1,0) as notificar,
     ue.empresa
     from usuario u left join usuario_empresa ue on (ue.cuil = u.cuil) join empresa e on (e.id = ue.empresa) left join (Select a.id_usuario, max(a.fecha)as afecha, a.empresa from auditoria a left join usuario u on (u.id_usuario = a.id_usuario)
    where a.similitud > 1
    group by a.id_usuario, a.empresa) as a on (u.id_usuario = a.id_usuario) where u.similitud > 1 and ue.empresa = a.empresa  and u.fecha_fallecido is null `;
    

    var newQuery = `select 
    u.nombre,
    RIGHT(u.cuil, 1) as verificador,
    u.id_usuario,
    u.apellido, 
    if (u.notificaciones_whatsapp < curdate(), 1,0) as notificaciones_whatsapp,
    u.dni, 
    u.sexo,
    u.email,
    if (u.telefonoVrf = 1, u.telefono, null) as telefono,
    u.cuil, 
    u.id_device,
    date(aux.afecha) as fecha_valida, 
    date(u.ultima_notificacion) as ultima_notificacion, 
    if (ue.notificaciones_periodo = 1 && u.notificaciones = 1, 1,0 ) as notificaciones, 
    date(fecha_recordatorio) as recordatorio, 
    date(notificacion) as notificacion,
    date(proxima) as proxima,
    datediff(now(), u.ultima_notificacion) as dias_ultima_not,
    if ((	e.tipo = 'E' &&
            now() > date(fecha_recordatorio) 
            && (aux.afecha is null || date(aux.afecha) < date(fecha_recordatorio) ) 
            
        ) || ( e.tipo = 'D' &&  (aux.afecha is null || datediff(now(),date(aux.afecha)) > e.periodicidad * 30))
     ,1,0) as notificar,
     ue.empresa
     from usuario u 
     join usuario_empresa ue on (ue.cuil = u.cuil)      
     join empresa e on (e.id = ue.empresa) 
     left join (
     	Select a.id_usuario, max(a.fecha)as afecha, a.empresa 
     	from auditoria a  
     	where a.similitud > 1 
     	group by a.id_usuario , a.empresa ) aux 
     	on (aux.empresa = ue.empresa and aux.id_usuario = u.id_usuario)
     where
     u.fecha_fallecido is null and 
     datediff(now(), u.ultima_notificacion ) > 5`;
    var now = new Date().getDay(); 
    var verificador1 = now - 1;
    var verificador2 = verificador1 + 5;
    var params = [];
    
    if (verificador1 > 4 ) {
        newQuery = `${newQuery} and datediff(now(),u.fecha) <= 1`;
    }else{
        console.log(verificador1, verificador2);
        newQuery = `${newQuery} and (RIGHT(u.cuil, 1) in (?,?) or datediff(now(),u.fecha) <= 1)`;
        params.push(verificador1,verificador2);
    }

    var result = await VIDA_DB.sync_query(newQuery,params);
    console.log(result);
    
    var count = 0;
    console.log(result.filter(e=>{return e.notificar == 1 }))
    for(i=0; i < result.length; i++){
   

        if  (result[i].notificar && result[i].notificaciones){
            let fallecido = await person.deceased(result[i].cuil);
            if (fallecido.fallecido){console.log('posible fallecido');  continue};
         
            if (result[i].email) {
                console.log(`Mail to : ${result[i].nombre} ${result[i].apellido}`);
                var token = tokenizer.tokenize({cuil:result[i].cuil });
                let params = {
                    title: "Actualización de certificado de supervivencia",
                    name : `${result[i].nombre} ${result[i].apellido}`,
                    url : `${unsubscribeUrl}?token=${token}`
                }
                await mail.send('reminder', params,result[i].email,null, null ); 
                console.log(`Mail send to ${result[i].email}`);
            }else if (result[i].telefono && result[i].notificaciones_whatsapp){ 
                if(result[i].telefono.substring(0,3) == "+54" || result[i].telefono.substring(0,2) == "54"){
                    var ph = result[i].telefono.replace('+','');
                    console.log(`Whatsapp to : ${result[i].nombre} ${result[i].apellido} ${ph}`);
                    let res = await whatsapp.sendTemplate(ph,"recordatorio", "es_AR",{name: `${result[i].nombre} ${result[i].apellido}`, gender: result[i].sexo, document: result[i].dni});
                    console.log(res);
                    if (res.error){ // si hay error en el envio no enviar por un año, si no hay error no enviar por 30 dias
                        await VIDA_DB.sync_query('update usuario set notificaciones_whatsapp = DATE_ADD(CURDATE(), interval 365 day) where id_usuario = ?',[result[i].id_usuario] );
                    }else{
                        await VIDA_DB.sync_query('update usuario set notificaciones_whatsapp = DATE_ADD(CURDATE(), interval 30 day) where id_usuario = ?',[result[i].id_usuario] );
                    }
                }
            }
            if (result[i].id_device) {
                push.send(
                    result[i].id_device, 
                    `${result[i].nombre} ${result[i].apellido} actualiza tu FE DE VIDA`,
                    "Evite inconvenientes en el pago del haber previsional", 
                    {
                        "action": "life", // url
                        "info": {
                            "document": `${result[i].dni}`,
                            "gender": `${result[i].sexo}`,
                            "name": `${result[i].nombre} ${result[i].apellido}`
                        }
                    }); 
                console.log(`Push to : ${result[i].nombre} ${result[i].apellido}`);
            }
            count++;
            let res = await VIDA_DB.sync_query('update usuario set ultima_notificacion = now() where id_usuario = ?',[result[i].id_usuario] );
            
        }
    }
    
    slack.debug(`Email y notificaciones enviado a: ${count} usuarios. Identificador ${verificador1} - ${verificador2}`);
    await sleep(3000);
    process.exit();
})()


function sleep(ms) {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }


