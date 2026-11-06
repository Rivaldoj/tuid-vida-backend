const slack = require('./../../../utils/slack');
const whatsapp = require('./../../../utils/whatsapp');

module.exports.whatsapp = (req,res,next) => {
    var text = JSON.stringify(req.body);
    var print = false;
    if (req.body.entry && req.body.entry.length > 0 ){
      for(i=0; i < req.body.entry.length; i++){
        if (req.body.entry[i].changes && req.body.entry[i].changes.length > 0 ){
          for(j=0; j < req.body.entry[i].changes.length; j++){
            let val = req.body.entry[i].changes[j];
            if (val.value && val.value.metadata && val.value.metadata.display_phone_number){
                if (val.value.messages){
                    var ct = "¿Como estás?";
                    if (val.value.contacts && val.value.contacts.length > 0){
                        if (val.value.contacts[0].profile.name){
                            ct = val.value.contacts[0].profile.name;
                        }
                    }
                    val.value.messages.forEach(e=>{
                        if (e.type == "text"){
                            print = true;
                            text = `${e.from} : ${e.text.body}\n`
                            
                            processMessage(e.from, e.text.body, e.type,ct)
                        }else if (e.type == "button") {
                            processMessage(e.from, e.button.text, e.type,ct);
                        }
                        
                    });
                }
            }
          }
        }
      }
    }
    if (print) slack.debug(text);
    return res.status(200).send("Webhook received");
}

async function processMessage(phone, text, type,name){
    var au = "";
    var params = [
        {
        "type": "body",
        "parameters": [
              {
                "type": "text",
                "text": name
        }]} 
    ]
    console.log(phone, text, type, name);
    if (type == 'button') {
       switch (text){
            case 'Contactar a soporte': "";
            au = 'contact_support'
                whatsapp.sendTemplateBot(phone,"contact_support",'es_AR',[]).then((a)=>{}).catch(err=>{console.log('err',err)});
            break
            case 'Dejar de recibir alertas':
                au = 'validateunsubscribe'
                whatsapp.sendTemplateBot(phone,"validateunsubscribe",'es_AR',[]).then((a)=>{}).catch(err=>{console.log('err',err)});
            break;
            case 'No, no enviar más': 
            au = 'unsubscribeall'
            whatsapp.send(phone,"Disculpas las molestias, dejaremos de enviarte recordatorios").then((a)=>{
                VIDA_DB.sync_query("update usuario set notificaciones = 0 where RIGHT(telefono, 10) = RIGHT (?,10) and telefonoVrf = 1", [phone])
            }).catch(err=>{console.log('err',err)});
            break;
            case 'Si, volver a enviar' : 
            au = 'unsubscribeperiodo'
            whatsapp.send(phone,"Disculpe las molestias, te volveremos a notificar cuando comience un nuevo periodo").then((a)=>{
                VIDA_DB.query("select cuil from usuario where RIGHT(telefono, 10) = RIGHT (?,10) and telefonoVrf = 1 order by ultima_notificacion desc", [phone], function(err,user){
                    console.log(user, err);
                    if(user && user.length > 0 ){
                        VIDA_DB.query("update usuario_empresa set notificaciones_periodo = 0 where cuil = ?",[user[0].cuil], function(err,doc){
                            console.log(err,doc)
                        });
                    }
                })
            }).catch(err=>{console.log('err',err)});
            break;
            default:
                if(last_message.length > 0 && last_message[0].last > limit){
                    whatsapp.sendTemplateBot(phone,"autorespuesta",'es_AR',params).then((a)=>{}).catch(err=>{console.log('err',err)});
                }
            break;
        }
        // no entendi tu consulta solo puedo procesar mensajes de texto.
    }else if (type == "text"){
        var last_message = await VIDA_DB.sync_query("select *, TIMESTAMPDIFF(SECOND,NOW(),date) as last from whatsapp where number = ? order by date desc", [text]);
        console.log(last_message);
       
        
        if(last_message.length == 0 || text.toLowerCase() == 'ayuda'){
            whatsapp.sendTemplateBot(phone,"autorespuesta",'es_AR',params).then((a)=>{}).catch(err=>{console.log('err',err)});
        }else {
            switch (text){
                case 'Contactar a soporte': "";
                    au = 'contact_support'
                    whatsapp.sendTemplateBot(phone,"contact_support",'es_AR',[]).then((a)=>{console.log(a)}).catch(err=>{console.log('err',err)});
                break
                case 'Dejar de recibir alertas':
                    au = 'validateunsubscribe'
                    whatsapp.sendTemplateBot(phone,"validateunsubscribe",'es_AR',[]).then((a)=>{console.log(a)}).catch(err=>{console.log('err',err)});
                break;
                case 'No, no enviar más': 
                au = 'unsubscribeall'
                whatsapp.send(phone,"Disculpas las molestias, dejaremos de enviarte recordatorios").then((a)=>{
                    VIDA_DB.sync_query("update usuario set notificaciones = 0 where telefono = ? and telefonoVrf = 1", [phone])

                }).catch(err=>{console.log('err',err)});
                break;
                case 'Si, volver a enviar' : 
                au = 'unsubscribeperiodo'
                whatsapp.send(phone,"Disculpe las molestias, te volveremos a notificar cuando comience un nuevo periodo").then((a)=>{
                    VIDA_DB.query("select cuil from usuario where telefono = ? and telefonoVrf = 1 order by ultima_notificacion desc", [phone], function(err,user){
                        console.log(user, err);
                        if(user && user.length > 0 ){
                            VIDA_DB.query("update usuario_empresa set notificaciones_periodo = 0 where cuil = ?",[user[0].cuil], function(err,doc){
                                console.log(err,doc)
                            });
                        }
                    })
                }).catch(err=>{console.log('err',err)});
                default:
                    if(last_message.length > 0 && last_message[0].last > limit){
                        whatsapp.sendTemplateBot(phone,"autorespuesta",'es_AR',params).then((a)=>{console.log(a)}).catch(err=>{console.log('err',err)});
                    }
                break;
            }
        }
    }else{
        au = 'no_entendo'
        whatsapp.send(phone,"Por favor enviame un mensaje de texto para que lo pueda entender. Si necesitas ayuda podes escribir : AYUDA")
    }
    await VIDA_DB.sync_query("insert into whatsapp (number, whatsapp_id, message,response_template) values (?,?,?,?)", [phone,'',text,au]);
   

}

