global.APP_PATH = __dirname;
global.MAX = 1000;
process.env["NODE_CONFIG_DIR"] = APP_PATH + "/../config/";
global.CONFIG = require('config');
const fs = require('fs'); 
const csv =  require('fast-csv');
const Client = require('ftp');

const mysql = require('mysql');
const util = require('util');
const slack = require('../utils/slack');
require('util.promisify').shim();

global.VIDA_DB = mysql.createPool( CONFIG.get('vida').db );
global.VIDA_DB.sync_query = util.promisify(VIDA_DB.query).bind(VIDA_DB);
global.APP_PATH = __dirname;
global.FILENAME = "Pasivos.txt";


let keys = Object.keys(CONFIG.get('vida').clients);
var clients = keys.map(e=>{
  if (Boolean(CONFIG.get('vida').clients[e].ftpFolder)){
    var client = {};
    client.id = e;
    client.name = CONFIG.get('vida').clients[e].name;
    client.ftpFolder = CONFIG.get('vida').clients[e].ftpFolder
    return client
  }
  return null
}).filter(e=>{return e});
console.log(clients);
var c = new Client();

c.on('ready', async function() {
  console.log("Estableciendo conexion");
  for(i=0;i< clients.length;i++){
    let list = await directory('/domains/tuid.ar/'+clients[i].ftpFolder);
    console.log(clients[i].ftpFolder);
    console.log(list);
    if (list.findIndex(e=>{return e.name == FILENAME}) > -1) {
      console.log(clients[i].ftpFolder , " Tiene archivo para procesar");
      var filename = '/domains/tuid.ar/'+clients[i].ftpFolder+"/"+FILENAME;
      var newFile = '/domains/tuid.ar/'+clients[i].ftpFolder+"/Pasivos_ProcessAt"+new Date()+".txt";
      let data = await download(filename,clients[i].id);
      if (data){
        let csv = await readCsv(clients[i].id+'.txt');
        var session = await getSession();
        await deleteUsers(session,{empresa: clients[i].name});
        try {
          bulkInsert = [];
          let cantidadUsuarios = csv.length;
          for(j = 0; j<cantidadUsuarios;j++){
    
            let dni = csv[j][0].substring(2,10);
            csv[j].push(clients[i].name);
            csv[j].push(Number(dni));
            bulkInsert.push(csv[j]);
            if (bulkInsert.length == MAX ){
              await addUser(session, bulkInsert);
              bulkInsert = [];
            }
          }
          if (bulkInsert.length > 0) await addUser(session, bulkInsert); // subir remanente
          bulkInsert = [];
          let result = await rename(filename,newFile);
          if (result){
            slack.debug(`${clients[i].name} ${clients[i].id} subio un archivo con ${cantidadUsuarios} usuarios y fue procesado con éxito`);
            VIDA_DB.query("update empresa set ultimo_archivo = NOW() where id = ?", [clients[i].name]);
            console.log("Finaliza con exito");
            await release(session);
          }else{
            await rollback(session);
          }
        }catch(err){
          console.log(err);
          slack.error(`${clients[i].name} subio un archivo y ocurrio un error: ${err}`);
           
          await rollback(session);
        }
     
      }
      
    }
  }
  console.log("Finalizando conexiones");
  VIDA_DB.end();
  c.end();
});

c.connect(CONFIG.get("ftp"));

async function directory(dir){
  return new Promise((resolve, reject) => { 
    c.list(dir, function(err,list){
      if (err) reject(err);
      resolve(list);
    });
  });
}

async function get(file){
  return new Promise((resolve, reject) => { 
    c.get(file, function(err, stream) {
      if (err) reject(err);
      resolve(stream);
    });
    
  });
}

async function rename(file,newFile){
  return new Promise((resolve, reject) => { 
    console.log(file, newFile);
    c.rename(file,newFile, function(err){
      if (err){
          reject(err);
      }else{
          resolve(true);
      }
    });
  });
}



async function download(filename, client){
  console.log(filename);
  let file = await get(filename);
  return new Promise((resolve, reject) => { 
    file.once('close', function() { 
      resolve(true) });
      file.pipe(fs.createWriteStream(client+".txt"));
  });
}

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


function getSession(){
  return new Promise((resolve, reject) => {
    console.log("creating db session");
    VIDA_DB.getConnection(function(err, session) {
      if (err) reject(err);
      session.beginTransaction(function(err) {
           if (err) {    //Transaction Error (Rollback and release connection)         
              session.rollback(function() {
                session.release();
                reject(err);
              });
          }else{
             resolve(session);
          } 
      });      
    });
  })
}

function addUser(session, bulkInsert){
  return new Promise((resolve, reject) => {
    session.query(`
    insert ignore into usuario_empresa(cuil,fecha_recordatorio,notificacion, proxima, empresa, dni) VALUES ?`,
    [bulkInsert],
    function(err, row){
      if (err){
        reject(err);
      }
      resolve(row);
    })
  })
}


function deleteUsers(session, params){
  return new Promise((resolve, reject) => {
    session.query(`delete from usuario_empresa where empresa = ?`,
    [params.empresa],
    function(err, row){
      console.log(row);
      if (err) reject(err);
      resolve(row);
    })
  })
}

function rollback(session){
  return new Promise((resolve, reject) => { 
    session.rollback(function() {
      console.log("Rollback");
      session.release();
      resolve(true);
    });
  });
}

function release(session){
  return new Promise((resolve, reject) => { 
    session.commit(function(){
      session.release();
      resolve(true);
    })
  });

}