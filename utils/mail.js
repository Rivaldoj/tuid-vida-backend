const AWS = require('aws-sdk');
const ejs = require('ejs');


const send = (template, params, to, from, cc) =>{
  if(TESTING) return;
  const temp = APP_PATH + "/html/mails/" + template + ".ejs"; // error si se lo corre de otra 
  ejs.renderFile(temp, params, {}, function(err, str){
    if (err){
        console.log(err);
      return;
    }
    sendTemplatedEmail(str,to, params.title, from, cc);
  });
}

const sendTemplatedEmail = (template, to, title, from, cc) =>{

  if (from == null || from == ""){
    from =  CONFIG.get("aws").emailFrom;
  }
  var ccAr = [];
  if (cc) ccAr = cc;
  var params = {
        Destination: { 
          ToAddresses: [
            to
          ],
          CcAddresses: ccAr
        },
        Message: {
          Body: {
            Html: {
             Charset: "UTF-8",
             Data: template
            },
            Text: {
             Charset: "UTF-8",
             Data: "TEXT_FORMAT_BODY"
            }
           },
           Subject: {
            Charset: 'UTF-8',
            Data: title
           }
          },
        Source: from,
        ReplyToAddresses: [
          from
        ],
      };

      var sendPromise = new AWS.SES({apiVersion: '2010-12-01'}).sendEmail(params).promise();
      sendPromise.then(
        function(data) {
            console.log(data);
        }).catch(
            function(err) {
            console.error(err, err.stack);
        });
    
}


module.exports = {
  send
  }