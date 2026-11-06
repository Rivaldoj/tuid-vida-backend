


module.exports.authenticatorConsume = async (client, action) => {
// actions R = Signup, L= Login, C=Code consumption, S= SMS, E=Email, F failedRegistrations
var query = "";
switch (action) {
    case "R":
      query = `insert into reports (date, aplicacion, registrations)
       values (DATE(UTC_TIMESTAMP()),?, 1) on duplicate key update registrations = registrations + 1` 
    break;
    case "L":
        query = `insert into reports (date, aplicacion, authentications)
        values ( DATE(UTC_TIMESTAMP()),?, 1) on duplicate key update authentications = authentications + 1` 
    break;
    case "S":
        query = `insert into reports (date, aplicacion, sms)
        values (DATE(UTC_TIMESTAMP()),?, 1) on duplicate key update sms = sms + 1` 
    break;
    case "E":
        query = `insert into reports (date, aplicacion, emails)
        values (DATE(UTC_TIMESTAMP()),?, 1) on duplicate key update emails = emails + 1` 
    break;
    case "F":
        query = `insert into reports (date, aplicacion, failedAuthentications)
        values (DATE(UTC_TIMESTAMP()),?, 1) on duplicate key update failedAuthentications = failedAuthentications + 1` 
    break;
    case "C": 
        query = `insert into reports (date, aplicacion, authCodeRequests)
        values (DATE(UTC_TIMESTAMP()),?, 1) on duplicate key update authCodeRequests = authCodeRequests + 1`     
    break;    
    default:
    return  
  }
  if(!TESTING)AUTHENTICATOR_DB.query(query, client, function(err,result){
      console.log(err,result);
  })
  //AUTHENTICATOR_DB.sync_query(query, client);
  return;

}