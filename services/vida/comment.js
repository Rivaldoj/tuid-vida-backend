const mailing = require('../../utils/mail');
const slack = require('../../utils/slack');
const hs = require('../../utils/hubspot');
const resources = require('./../../startup/resources');
const { randomUUID } = require('crypto');

const config = CONFIG.get('vida');
const issues = {
    "100": {
        multiple : false,
        title: "Solicito Ayuda modo de uso"
    },
    "101": {
        multiple: true,
        title: "Confirmar Registración o Fe de Vida"
    },
    "102":  {
        multiple: true,
        title: "Quiero saber si mi Fe de Vida está Vigente "
    },
    "103": { 
        multiple: false,
        title: "Problemas con el Registro"
    }, 
    "104": {
        multiple: true,
        title: "Envió de Código de validación"
    }, 
    "105": {
        multiple: true,
        title: "Solicito Certificado de Fe de Vida"
    }, 
    "106":  {
        multiple: true,
        title: "Cuando debo Renovar mi Fe de Vida"
    },
    "107":  {
        multiple: true,
        title: "Otorgar permisos para TuID Vida"
    },
    "108": {
        multiple: false,
        title: "No puedo realizar Fe de Vida"
    },
    "109": {
        multiple: true,
        title: "No me acreditaron el beneficio previsional"
    },
    "110": {
        multiple: false,
        title: "Cambio de Dispositivo"
    } 

}
module.exports.comment = async (req, res, next) =>{
    res.response = {
        "res": 'error',
        "status": 400,
        "message": "Internal Server Error"
    };
    var autoresponse = 0
    var templateName = "contact"
    req.body.title = "Contacto " + req.client.name;
    req.body.app = req.client.name;
    req.body.email = req.body.email.replace(' ','');
    if ( req.body.phone ){
        let tel = resources.validatePhone(req.body.phone);
        if (!tel){
            res.response.message = "Error al validar el número de teléfono celular.\nAsegurese que el número ingresado corresponda a un celular";
            return res.status(res.response.status).json(res.response);
        }
        req.body.telefono = tel;
    }
    var letter = "";

    if (req.body.code && issues[req.body.code] ){
        autoresponse = 1;
        templateName = "auto_response/" + req.body.code;
        req.body.title = issues[req.body.code].title;
        if (issues[req.body.code].multiple) {
            let result = await VIDA_DB.sync_query(newQueries.support,[req.body.cuil,req.body.cuil]);

            // borrar steve
            if(result.length>0){
                let data = {
                    registrado: 1,
                    validado: 0,
                    auditado_registro: 0,
                    auditado_validacion: 0,
                    alerta_registro: 0,
                    alerta_validacion: 0
                }
            }
            // fin borrar

            if (req.body.code == "101" || req.body.code == "104" || req.body.code == "105") {
                if (result.length == 0){
                    letter = "C"
                    req.body.title = "Usuario no registrado";
                    // usuario no registrado
                }else if(!result[0].empresa){
                    letter = "D";
                    req.body.title = "Su entidad aun no está adherida al sistema";
                    // entidad no registrada
                }else if (result.findIndex(e=>{return e.status == 'PENDING'}) > -1 ){
                    letter = "A";
                    req.body.title = "Falta  dar Fe de Vida para concluir con el tramite";
                     //hacer la fe de vida
                }else if (result.findIndex(e=>{return e.status == 'OK'}) >  -1 ){
                    letter = "B";
                    req.body.title = "Fe de vida satisfactoria";
                   // si alguna esta ok no se muestra vencida
                }else if (result.findIndex(e=>{return e.status == 'LATE'}) >  -1 ){
                    letter = "E";
                    req.body.title = "Fe de vida satisfactoria"; //  pero fuera de la fecha estipulada
                    // si solo hay vencida se muestra vencida
                }
            }else if (req.body.code == "102"){
                if (result.length == 0){
                    letter = "C"
                    req.body.title = "Usuario no registrado";
                    // usuario no registrado
                }else if(!result[0].empresa){
                    letter = "D";
                    req.body.title = "Su entidad aun no está adherida al sistema";
                    // entidad no registrada
                }else if (result.findIndex(e=>{return e.status == 'PENDING'}) > -1 ){
                    letter = "A";
                    req.body.title = "Debe actualizar su Fe de Vida para el actual periodo";
                     //hacer la fe de vida
                }else if (result.findIndex(e=>{return e.status == 'OK'}) >  -1 ){
                    letter = "B";
                    req.body.title = "Fe de vida satisfactoria";
                   // si alguna esta ok no se muestra vencida
                }else if (result.findIndex(e=>{return e.status == 'LATE'}) >  -1 ){
                    letter = "E";
                    req.body.title = "Fe de vida satisfactoria";
                    // si solo hay vencida se muestra vencida
                } 
            }else if (req.body.code == "106"){
                if (result.length == 0){
                    letter = "C"
                    req.body.title = "Usuario no registrado";
                    // usuario no registrado
                }else if(!result[0].empresa){
                    letter = "D";
                    req.body.title = "Su entidad aun no está adherida al sistema";
                    // entidad no registrada
                }else if (result.findIndex(e=>{return e.status == 'PENDING'}) > -1 ){
                    letter =  "A";
                    req.body.fecha = result[0].fecha_recordatorio;
                    req.body.title = "Inicio nuevo periodo acreditacion Fe de Vida";
                     //hacer la fe de vida
                }else if (result.findIndex(e=>{return e.status == 'OK'}) >  -1 ){
                    letter = "B";
                    req.body.title = "Usted ya ha cumplimentado la certificación";
                    req.body.fecha = result[0].next;
                   // si alguna esta ok no se muestra vencida
                }else if (result.findIndex(e=>{return e.status == 'LATE'}) >  -1 ){
                    letter = "E";
                    req.body.title = "Fe de vida satisfactoria"; // pero fuera de la fecha estipulada
                    req.body.fecha = result[0].next;
                    // si solo hay vencida se muestra vencida
                }
            }else if (req.body.code == "109"){
                if (result.length == 0){
                    letter = "C"
                    req.body.title = "Usuario no registrado";
                    // usuario no registrado
                }else if(!result[0].empresa){
                    letter = "D";
                    req.body.title = "Su entidad aun no está adherida al sistema";
                    // entidad no registrada
                }else if (result.findIndex(e=>{return e.status == 'PENDING'}) > -1 ){
                    letter = "A";
                    req.body.title = "Falta  dar Fe de Vida para concluir con el tramite";
                    req.body.fecha = result[0].next;
                     //hacer la fe de vida
                }else if (result.findIndex(e=>{return e.status == 'OK'}) >  -1 ){
                    letter = "B";
                    req.body.title = "Fe de vida satisfactoria";
                   // si alguna esta ok no se muestra vencida
                }else if (result.findIndex(e=>{return e.status == 'LATE'}) >  -1 ){
                    letter = "E";
                    req.body.title = "Fe de vida satisfactoria"; //  pero fuera de la fecha estipulada
                    // si solo hay vencida se muestra vencida
                }
                if(letter == "B" || letter ==  "A"){
                    if (result[0].empresa.includes("BAPRO")){
                        req.body.correo_cliente =config.clients.bapro.supportContact.email;
                        req.body.telefono_cliente = config.clients.bapro.supportContact.phone;
                    }else if  (result[0].empresa.includes("EFECTIVO")){
                        req.body.correo_cliente = config.clients.compania.supportContact.email;
                        req.body.telefono_cliente = config.clients.compania.supportContact.phone;
                    }else if  (result[0].empresa.includes("CSSPCEPBA")){
                        req.body.correo_cliente = config.clients.cpba.supportContact.email;
                        req.body.telefono_cliente = config.clients.cpba.supportContact.phone;
                    }else{
                        req.body.correo_cliente = config.clients.tuid.supportContact.email;
                        req.body.telefono_cliente = config.clients.tuid.supportContact.phone;
                    }
                }

            }
            templateName = templateName + letter;   
        }
    }else{
        req.body.code = "";
    }
    req.body.letter = letter;
    req.body.autoresponse = autoresponse;
    req.body.empresa = "Sin información";

    try{
        let empresas = await VIDA_DB.sync_query("select * from usuario_empresa where cuil = ?", [req.body.cuil]);
        if ( empresas.length > 0 ){
            req.body.empresa = empresas[0].empresa;
        }else{
            res.response.message = "El CUIT ingresado no corresponde con un beneficiario de las entidades adheridas"
            return res.status(res.response.status).json(res.response);
        }
    }catch(err){
        console.log(err);
    }
    if (!req.body.os) req.body.os = "";
    if (!req.body.version) req.body.version = "";

    req.body.ticket = getPriority(req.body);

    let ticketId = new Date().getTime();
    let provider = "TI";
    let query = 'INSERT INTO comentarios (cuil,email,asunto,mensaje,nombre,telefono, autoresponse, proveedor, external_id, fecha, prioridad, estado, nombre_ticket) VALUES(?,?,?,?,?,?,?,?,?, NOW(),?,?, ? )';
    VIDA_DB.query(query, [req.body.cuil, req.body.email, req.body.asunto, req.body.mensaje,req.body.nombre,req.body.telefono, autoresponse, provider, ticketId, req.body.ticket.priority, req.body.ticket.estado, req.body.ticket.title], function (err) {
        if (err) {
            console.log(err);
            res.response.details = err;
            return res.status(res.response.status).json(res.response);
        } else {
            res.response.res = "ok";
            res.response.status = 200;
            res.response.message = "Nos pondremos en contacto a la brevedad";
            res.response.url = null;
            
            if (ticketId){
                res.response.message = `Creamos el ticket ${provider}${ticketId}. ${res.response.message}`;
                req.body.title = `[${provider}${ticketId}] ${req.body.title}`; 
                if (req.body.ticket.priority == "HIGH" && req.body.ticket.estado == "O" ) {
                        res.response.url = `${config.supportUrl}?text=${encodeURI(`Hola TuID. Mi nombre es ${req.body.nombre} (CUIL ${req.body.cuil}). Los contacto por el ticket ${req.body.title}. Podrian ayudarme?`)}`;
                }
            }
            if (autoresponse == 1){
                slack.debug(`Contacto a soporte ${req.body.cuil}: ${req.body.asunto} autoresponse: ${templateName} Ticket: ${provider}${ticketId}`);
                mailing.send(templateName,req.body,req.body.email, config.supportContact, null);
            }else{
                slack.debug(`Contacto a soporte ${req.body.cuil}: ${req.body.asunto} Ticket: ${provider}${ticketId}`);
            }
            mailing.send('contact',req.body,config.supportContact, config.supportContact, null  );
            return res.status(res.response.status).json(res.response);
        }
    });
}






//HUBSPOT
async function step1(data, callback){
 
    hs.getCustomer(data.email,function(err,response){
      if (err){
        slack.debug("Error en herramienta de tickets - Obteniendo usuario");
        return callback(true, null)
      }
      if (response.total > 0){ // Existe el cliente
        data.customerId = response.results[0].id;
        step2(data, callback);
      }else{ // No existe el cliente   
        hs.createCustomer(data, function(err,response){
          if (err){
            slack.debug("Error en herramienta de tickets - Creando usuario");
            return callback(true, null)
          } 
          data.customerId = response.id;
          step2(data,callback)
        })
      }
    });
  }
  
  async function step2(data, callback){
  
      hs.createTicket(data, function(err,response){
        if(err) {
          slack.debug("Error en herramienta de tickets - Creando Ticket");
          return callback(true, null);
        }
        hs.setCustomer(response.id, data.customerId, function(err, doc){
          if(err) {
            slack.debug("Error en herramienta de tickets - Asignando Ticket");
            return callback(true, null);
          }else{
            callback(false, response.id);
          }
        })
      })
  }

function getPriority(body){

    var letter = body.letter;
    var code = body.code;
    var result = {
        priority : "LOW", // 
        stage : "4", // closed
        title : body.title,
        estado : "C"
    }
    if(letter != ""){
        switch (letter) {
            case "A": // Falta dar fe de vida
                result.priority = "MEDIUM";
                result.stage = "1";
                result.estado = "O";
                break;
            case "B": // Fe de vida staisfactoria
                result.priority = "LOW";
                result.stage = "4";
                result.estado = "C";
                break;

            case "C": // No registrado
                result.priority = "HIGH";
                result.stage = "1";
                result.estado = "O";
                break;
            case "D": // Entidad no adherida
                result.priority = "LOW";
                result.stage = "4";

                result.estado = "C";
                break;
            case "E":// Fuera de termino pero dadad
                result.priority = "LOW";
                result.stage = "4";

                result.estado = "C";
                break; 
            default: break;
        }
    }else if (code == "100" | code == "107" | code == "108" | code == "103"){
        result.priority = "HIGH";
        result.stage = "1";
        result.estado = "O";
    }else if (code == "" ){ // Contacto TUID Vida
        result.priority = "HIGH";
        result.stage = "1";
        result.estado = "O";
        result.title = body.asunto;
    }
    return result;

}






var newQueries = {
     "support": `SELECT u.id_usuario,
     ue.empresa,
     u.auditor,
     a.auditor2,
     u.cuil,
     date(u.fecha_valida) as fecha_valida,
     date(ue.fecha_recordatorio) as fecha_recordatorio,
     date(ue.notificacion) as notificacion, date(ue.proxima) as proxima ,
     if (e.tipo = 'D',
     if(
     date(u.fecha_valida) is null || DATEDIFF(NOW(),DATE(u.fecha_valida)) > e.periodicidad * 30 ,
     'PENDING','OK'),
     if(now() > date(ue.fecha_recordatorio),
     if(date(u.fecha_valida) >= date(ue.fecha_recordatorio),if(date(u.fecha_valida) > date(ue.notificacion),
     'LATE','OK'),
     'PENDING'),
     'OK')) as status,
     if (e.tipo = 'D', if (fecha_valida is not null, date(DATE_ADD(fecha_valida, INTERVAL e.periodicidad * 30 DAY)),now()) , proxima) as next
     from usuario u left join usuario_empresa ue on (u.cuil = ue.cuil) join empresa e on (e.id = ue.empresa) left join (Select a.id_usuario, max(a.fecha)as afecha, a.empresa, a.auditor as auditor2 from auditoria a left join usuario u on (u.id_usuario = a.id_usuario)
     where u.cuil = ? and a.similitud > 1 group by a.id_usuario, a.empresa) as a on (u.id_usuario = a.id_usuario)
     WHERE u.cuil = ? and if(a.empresa is null,ue.empresa=ue.empresa ,ue.empresa = a.empresa) order by next asc`,

    "support_old": `SELECT u.id_usuario,
     ue.empresa,
     u.auditor,
     u.cuil,
     date(u.fecha_valida) as fecha_valida,
     date(ue.fecha_recordatorio) as fecha_recordatorio,
     date(ue.notificacion) as notificacion, date(ue.proxima) as proxima ,
     if (e.tipo = 'D',
     if(
     date(u.fecha_valida) is null || DATEDIFF(NOW(),DATE(u.fecha_valida)) > e.periodicidad * 30 ,
     'PENDING','OK'),
     if(now() > date(ue.fecha_recordatorio),
     if(date(u.fecha_valida) >= date(ue.fecha_recordatorio),if(date(u.fecha_valida) > date(ue.notificacion),
     'LATE','OK'),
     'PENDING'),
     'OK')) as status,
     if (e.tipo = 'D', if (fecha_valida is not null, date(DATE_ADD(fecha_valida, INTERVAL e.periodicidad * 30 DAY)),now()) , proxima) as next
     from usuario u left join usuario_empresa ue on (u.cuil = ue.cuil) join empresa e on (e.id = ue.empresa) left join (Select  a.id_usuario, max(a.fecha)as afecha, a.empresa from auditoria a left join usuario u on (u.id_usuario = a.id_usuario)
     where u.cuil = ? and a.similitud > 1 group by a.id_usuario, a.empresa) as a on (u.id_usuario = a.id_usuario)
     WHERE u.cuil = ? and if(a.empresa is null,ue.empresa=ue.empresa ,ue.empresa = a.empresa) order by next asc`,

     "old_query": `SELECT u.id_usuario,
           ue.empresa, 
           u.cuil,
           date(u.fecha_valida) as fecha_valida,
           date(ue.fecha_recordatorio) as fecha_recordatorio,
           date(ue.notificacion) as notificacion, date(ue.proxima) as proxima ,
           if (ue.empresa = 'EFECTIVO SI', 
                if(now() > date(ue.notificacion), if(date(u.fecha_valida) >= date(ue.notificacion) ||  datediff(now(),date(fecha_valida)) < 30 ,'OK','PENDING'), if(date(u.fecha_valida) >= date(ue.fecha_recordatorio), 'OK','PENDING')),
                if(now() > date(ue.fecha_recordatorio), if(date(u.fecha_valida) >= date(ue.fecha_recordatorio),if(date(u.fecha_valida) > date(ue.notificacion),'LATE','OK'),'PENDING'),'OK')
           ) as status,
           if (ue.empresa = 'EFECTIVO SI', notificacion, proxima) as next
           from usuario u left join usuario_empresa ue on (u.cuil = ue.cuil) 
           WHERE u.cuil = ? order by next asc`
}

