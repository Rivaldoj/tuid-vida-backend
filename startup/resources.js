const csv =  require('fast-csv');
const fs = require('fs');
require('util.promisify').shim();
var phones = {

}

module.exports.init = async  function(){
    let arg = await readCsv(`${APP_PATH}/resources/arg.csv`);
    phones["+54"] = arg;
}

module.exports.validatePhone = (phone) => {

    console.log(phone);
    if(!phones[phone.country]) return `${phone.country}${phone.area}${phone.phone}`;;
    var match = "";
    var telefono = null;
    switch (phone.country) {
        case "+54":
            let area = phone.area.replace(/^(\s|0|9)*/g, '');
            let ph = phone.phone.replace(/^(\s|15|1)*/g, '');
            telefono = `9${area}${ph}`
            if (telefono.length != 11) return false;
            break;
        default:
            telefono = `${phone.area}${phone.phone}`
    }
    var match = telefono.substring(1,7);
    var result = phones[phone.country].find(e=>{return e.match == match && e.tipo == "Movil"});
    if (result) return `${phone.country}${telefono}`;
    return false;
}

function readCsv(file){
    return new Promise((resolve, reject) => {
      var array = [];
      fs.createReadStream(file)  
      .pipe(csv.parse({ delimiter: ';' })
        .on('data', (row) => {
          array.push({
              localidad : row[0],
              match: row[4],
              tipo : row[5] 
          });
        })
        .on('end', () => {
          
          resolve(array);
        })
        .on('error', (reject) => {
        })
      );
    })
  
  }
