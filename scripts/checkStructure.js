const dbfDriver = require('dbffile');
const fs = require('fs'); 
global.MAX = 100000;
(async () => {

    let file = `./pba-2.dbf`;
     let dbf = await dbfDriver.DBFFile.open(file,{readMode: 'loose' })
    console.log(`DBF file contains ${dbf.recordCount} records of ${file}`);
    console.log(`Field names: ${dbf.fields.map(f => f.name).join(', ')}`);
    let records = await dbf.readRecords(MAX);
    //records = records.reverse();
    for (i= 0; i< 200; i++){
        console.log(records[i]);
    }
    
})();

