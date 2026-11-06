
global.APP_PATH = __dirname;
global.MAX = 100000;

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

const dbfDriver = require('dbffile');
const Client = require('ftp');
var c = new Client();
c.on('ready', async function() {
  console.log("Estableciendo conexion");
  run();
});
c.connect(CONFIG.get("ftp"));

async function  run (connection) {
    let dirs = [
      {path:"pagos", table: "beneficiario"},
      {path: "contactos", table: "contactos"},
      {path: "apoderados", table: "apoderados"},
    ]
    const queries = {
        beneficiario: ["insert ignore into beneficiario (cuil, IDEntidad,caja,fechaActual,fechaProxima) values ?", "insert ignore into entidad_pagadora (IDEntidad, IDBanco, IDSucursal, sucursal) values ? "],
        contactos : [`insert into contactos (cuil,email1,email2, celular1, celular2,celular3,telefono,codigoArea) values ? ON DUPLICATE KEY UPDATE 
        celular1 = COALESCE( values(celular1), celular1), 
        celular2 = COALESCE( values(celular2), celular2), 
        celular3 = COALESCE( values(celular3), celular3),
        email1 = COALESCE(values(email1), email1),
        email2 = COALESCE(values(email2), email2), 
        telefono = COALESCE(values(telefono), telefono),
        codigoArea = COALESCE(values(codigoArea),codigoArea),
        ultimaAct = UTC_TIMESTAMP()`],
        apoderados: [`insert ignore into apoderados (cuil, beneficiario) values ?`]
      } 
    const firstQueries = {
        beneficiario: "truncate table beneficiario"
    }
    const lastQueries = {
      beneficiario: [
        "select e.entidad, ue.cuil, e.id, e.fecha_actual, e.fecha_proxima from usuario_empresa ue join empresa e on (ue.empresa = e.id and e.fecha_proxima > curdate() and e.entidad is not null)",
        "insert ignore into beneficiario (cuil, IDEntidad,caja,fechaActual,fechaProxima) values ?"]
    }
    
  var remote = false;
  for (o=0; o<dirs.length; o++){
      console.log(dirs[o])
      var files = [];
      var dir;
      if ( remote ){
        dir = `/domains/tuid.ar/tuid/actualizaciones/${dirs[o].path}/`;
        let list = await directory(dir);
        files = list.map(e=>{return e.name}).filter(e=>{return e.substr(e.length - 4) == ".dbf"});
      }else{
        dir = `${APP_PATH}/master/actualizaciones/${dirs[o].path}/`;
        files = fs.readdirSync(dir).filter(e=>{return e.substr(e.length - 4) == ".dbf"});
      }
     
      for (p=0;p<files.length;p++){
  
          var dbf
          let filePath = `${dir}${files[p]}`;
          if (remote){
            
            await download(filePath, files[p]);
            dbf = await dbfDriver.DBFFile.open(files[p]);
          }else{
            dbf = await dbfDriver.DBFFile.open(filePath);
          }
            console.log(`DBF file contains ${dbf.recordCount} records of ${files[p]}`);
            console.log(`Field names: ${dbf.fields.map(f => f.name).join(', ')}`);
            var index = 0 ;
            console.log("Getting session");
            let session = await getSession();
            session.session_query = util.promisify(session.query).bind(session);
            if (firstQueries[dirs[o].table]){
                let query = await session.session_query(firstQueries[dirs[o].table],[]);
                console.log(query);
            }
            let records = await dbf.readRecords(0);
            while (index < dbf.recordCount){
                let records = await dbf.readRecords(MAX);
                let insert2 = [];
                var insert = [];
                switch (dirs[o].table){
                    case "beneficiario" :
                    let set = new Set(records.map(e=>{return [Number(e.ENTPAGADOR),Number(e.IDBANCO), 0,'Sin Información']}));
                    insert2 = Array.from(set);
                    records.forEach(e=>{
                        if (e.FECPAGACT || e.FECPAGPROX) { 
                          insert.push([ Number(e.CUIL),Number(e.ENTPAGADOR), 'ANSES', e.FECPAGACT, e.FECPAGPROX]); // agregar estado ben
                        }
                    });
                    break;
                    case "contactos":
                      records.forEach(e=>{
                          insert.push([Number(e.CUIL),e.EMAIL1, e.EMAIL2, e.CELULAR1, e.CELULAR2,  e.CELULAR3,  e.TELEFONO, e.DDN]);
                      });
                    break;
                    case "apoderados":
                      records.forEach(e=>{
                        if (e.CUILAPOD > 0 && e.CUIL > 0) { 
                          insert.push([ Number(e.CUILAPOD),Number(e.CUIL) ]);
                        }
                      });
                    break;

                }
                try {
                  if (insert2.length > 0) await session.session_query(queries[dirs[o].table][1], [insert2]); 
                  if (insert.length > 0) await session.session_query(queries[dirs[o].table][0], [insert]);
                }catch(err){
                    console.log(err);
                    console.log("rollbacking");
                    await rollback(session);
                    process.exit();
                }
                index += MAX;
                console.log(index);
            } 
            if (lastQueries[dirs[o].table]){
              console.log("last quering");
              switch (dirs[o].table){
                case 'beneficiario':
                  let result = await VIDA_DB.sync_query(lastQueries[dirs[o].table][0],[]);
                  let insert3 = [];
                  result.forEach(e=>{
                    insert3.push([ Number(e.cuil),e.entidad, e.id, e.fecha_actual, e.fecha_proxima]);
                  })
                  try {
                    await session.session_query(lastQueries[dirs[o].table][1], [insert3]);
                    slack.debug("Fecha de pago de beneficiarios ANSES Y Cajas Locales Actualizada");
                  }catch(err){
                    console.log(err);
                    await rollback(session);
                    process.exit();
                  }
                break;
                case 'contactos':
                  slack.debug(`Tabla ${dirs[o].table} actualizada`);
                break;
                case 'apoderados':
                  slack.debug(`Tabla ${dirs[o].table} actualizada`);
                break;
              }
            }

            fs.unlinkSync(filePath);
            console.log(`Eliminando archivo local ${files[p]} `);
            if (remote) await deleteFile(filePath);
            console.log(`Archivo del servidor ${files[p]} eliminado `);
            console.log("Liberando Sesión");
            await release(session);
        }
     
    } 
    process.exit();
}


//FTP

async function directory(dir){
  return new Promise((resolve, reject) => { 
    c.list(dir, function(err,list){
      if (err) reject(err);
      resolve(list);
    });
  });
}
async function download(file, name){
  console.log(`starting downloading ${file}` );
  let fl = await get(file);
  return new Promise((resolve, reject) => { 
    fl.once('close', function() { 
      console.log(`finishing downloading ${file}` );
      resolve(true) });
      fl.pipe(fs.createWriteStream(name));
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

async function deleteFile(file){
  return new Promise((resolve, reject) => { 
    c.delete(file, function(err, stream) {
      if (err) reject(err);
      resolve(stream);
    });
    
  });
}

function isValidDate(date) {
  if ( date == null) return true
  return date && Object.prototype.toString.call(date) === "[object Date]" && !isNaN(date);
}


// DATABASE
function getSession(){
    return new Promise((resolve, reject) => {
      console.log("creating db session");
      NEW_MASTER_DB.getConnection(function(err, session) {
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

  //csv

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