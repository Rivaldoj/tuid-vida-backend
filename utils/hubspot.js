const request = require('request');

let api = CONFIG.get('hubspot');
let endpoint = 'https://api.hubapi.com/crm/v3/objects'
module.exports.createTicket = async function (params, next){
 
    let post = {
        properties: {
            "hs_pipeline": "0",
            "hs_pipeline_stage": params.ticket.stage,
            "hs_ticket_priority": params.ticket.priority,
            "hubspot_owner_id": null,
            "content": params.mensaje,
            "source_type": "APP",
            "subject": params.ticket.title
        }
    }
    request.post(`${endpoint}/tickets/?hapikey=${api.key}`,{
        json: post
    }, function(err, res, body){
        next(err,body);
    })
}

module.exports.get = async function (ticketId, next){

   
    request.get(`${endpoint}/tickets/${ticketId}/?hapikey=${api.key}`, function(err, res, body){
        next(err,body);
    })
}


module.exports.setCustomer = async function (ticketId, contactId, next){
    request.put(`${endpoint}/tickets/${ticketId}/associations/contacts/${contactId}/16?hapikey=${api.key}`, function(err, res, body){
        next(err,body);
    })
}


module.exports.getCustomer = async function ( email,next){
    const PublicObjectSearchRequest = { filterGroups: [
        {"filters":[{"value":email,"propertyName":"email","operator":"EQ"}]}], sorts: ["email"], query: email, properties: ["email"], limit: 10, after: 0 };
    request.post(`${endpoint}/contacts/search/?hapikey=${api.key}`,{json: PublicObjectSearchRequest}, function(err, res, body){
        next(err,body);
    })
}



module.exports.createCustomer = async function ( params,next){
    let json ={
        "properties": {
        "company": params.empresa,
        "email": params.email,
        "firstname": params.nombre,
        "lastname": "",
        "phone": params.telefono,
        "website": "",
        "cuil": params.cuil
        }
      }
      console.log(json);
    request.post(`${endpoint}/contacts/?hapikey=${api.key}`,{json: json}, function(err, res, body){
        console.log(body);
        next(err,body);
    })
}