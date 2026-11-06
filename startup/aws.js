const AWS = require('aws-sdk');
const config = require('config');

module.exports = function(){
  AWS.config.update({credentials: {
    secretAccessKey : config.get('aws').credentials.secretAccessKey,
    accessKeyId : config.get('aws').credentials.accessKeyId,
  },region : config.get('aws').region });
}