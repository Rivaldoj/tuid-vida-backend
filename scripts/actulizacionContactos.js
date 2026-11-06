
global.APP_PATH = __dirname;
global.MAX =100000;

process.env["NODE_CONFIG_DIR"] = APP_PATH + "/../config/";
global.CONFIG = require('config');

const fs = require('fs'); 
const mysql = require('mysql');
const util = require('util');
const csv =  require('fast-csv');
const slack = require('../utils/slack');
require('util.promisify').shim();
global.NEW_MASTER_DB = mysql.createPool( CONFIG.get('newMaster').db);
global.NEW_MASTER_DB.sync_query = util.promisify(NEW_MASTER_DB.query).bind(NEW_MASTER_DB);

global.VIDA_DB = mysql.createPool( CONFIG.get('vida').db);
global.VIDA_DB.sync_query = util.promisify(VIDA_DB.query).bind(VIDA_DB);


(async() =>  {
let users = await readCsv('contactos.csv');
console.log(users);

let query = "update usuario set ? where cuil = ?";

for (i=1; i< users.length;i++){
  let cuil = users[i][1];
  var body = {}
  body.telefono = users[i][0].toLowerCase();
  console.log(i,body,cuil);
  
 if (body.telefono != '') await VIDA_DB.sync_query(query, [body, cuil]);

}
console.log("finished");
process.exit();
})()

function readCsv(file){
  return new Promise((resolve, reject) => {
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
      })
    );
  })
}