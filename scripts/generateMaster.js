
global.APP_PATH = __dirname;
global.MAX =30000; 5000;

process.env["NODE_CONFIG_DIR"] = APP_PATH + "/../config/";
global.CONFIG = require('config');

const fs = require('fs'); 
const mysql = require('mysql');
const util = require('util');
const slack = require('../utils/slack');
require('util.promisify').shim();
global.NEW_MASTER_DB = mysql.createPool( CONFIG.get('newMaster').db);
global.NEW_MASTER_DB.sync_query = util.promisify(NEW_MASTER_DB.query).bind(NEW_MASTER_DB);

const dbfDriver = require('dbffile');


(async () => {
    let dirs = [
      //      {path:"bcra", sexo: null, table: "banco"},
      //{path:"entidadesPagadoras", sexo: null, table: "bancoEntidades"},
    //   {path:"entidadesPagadoras", sexo: null, table: "entidad_pagadora"},
        {path:"pagos", sexo: null, table: "beneficiario"},
    ]
    const queries = {
        banco : "insert ignore into banco (IDBANCO, banco) values ?",
        bancoEntidades : "insert ignore into banco (IDBanco, banco) values ? ",
        entidad_pagadora: "insert ignore into entidad_pagadora (IDEntidad, IDBanco, IDSucursal, sucursal, domicilio, localidad, CP, provincia) values ?",
        beneficiario: "insert  ignore into beneficiario (cuil, IDEntidad,caja,fechaActual,fechaProxima) values ?"
    }
    for (o=0; o<dirs.length; o++){
       console.log(dirs[o])
        let dir = `${APP_PATH}/master/${dirs[o].path}`;
        const files = fs.readdirSync(dir).filter(e=>{return e.substr(e.length - 4) == ".dbf"});
        for (p=0;p<files.length;p++){
            let file = `${dir}/${files[p]}`;
            let dbf = await dbfDriver.DBFFile.open(file);
            
            console.log(`DBF file contains ${dbf.recordCount} records of ${file}`);
            console.log(`Field names: ${dbf.fields.map(f => f.name).join(', ')}`);
            var index = 0 ;
            while (index < dbf.recordCount){
                let records = await dbf.readRecords(MAX);
                var insert = [];
                switch (dirs[o].table){
                    case "banco":
                    records.forEach(e=>{
                        insert.push([e.CAMPO1,e.ENTIDAD]);
                    });
                    break
                    case "bancoEntidades": 
                    records.forEach(e=>{
                        insert.push([Number(e.IDBANCO),e.BANCO]);
                    });
                    break;
                    case "entidad_pagadora" :
                    records.forEach(e=>{
                        insert.push([Number(e.LUGAR_DE_P),Number(e.IDBANCO),Number( e.IDSUCURSAL), e.SUCURSAL, e.DOMICILIO, e.LOCALIDAD, e.CP, e.PROVINCIA]);
                    });
                    break;
                    case "beneficiario" :
                    records.forEach(e=>{
                        var fecha = null
                        if (e.FECPAGOACT.length == 8) fecha = e.FECPAGOACT.slice(4) + '-' + e.FECPAGOACT.slice(2, 4) + '-' + e.FECPAGOACT.slice(0, 2);
                        var prox = null;
                        if (e.PROXFECPAG.length == 8 ) prox = e.PROXFECPAG.slice(4) + '-' + e.PROXFECPAG.slice(2, 4) + '-' + e.PROXFECPAG.slice(0, 2);
                        insert.push([ Number(e.CUIL),Number(e.ENTPAGADOR), 'ANSES', fecha, prox]); // agregar estado ben
                        
                    });
                    break;
                }
                try {
                    if (dirs[o].path == "bcra"){
                        await NEW_MASTER_DB.sync_query(queries['banco'], [insert]);
                    }else {
                        await NEW_MASTER_DB.sync_query(queries[dirs[o].table], [insert]);
                    }
                }catch(err){
                    console.log(err);
                }
                index += MAX;
                console.log(index);
            }
        }

    }
    process.exit();
})()


