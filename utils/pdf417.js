var dbr = require('dynamsoft-javascript-barcode');
dbr.BarcodeReader.productKeys = CONFIG.get('dynamsoft.productKeys'); 
let settings = reader.getRuntimeSettings();
settings.localizationModes = [2,0,0,0,0,0,0,0];
settings.deblurLevel = 9;

module.exports.decode = async function (data) {
    var documento = null;
    return new Promise((resolve, reject) => {
        dbr.BarcodeReader.createInstance().then(reader => {
            reader.updateRuntimeSettings(settings);
            reader.decode(data).then(results => {
                reader.destroy();
                if (results.length > 0){
                    pdf417 = results[0].BarcodeText.replace(/\uFFFD/g, '').split('@');
                    if(pdf417[3].length == 1){
                        documento = {
                        tramite: pdf417[0],
                        apellido:pdf417[1],
                        nombre:  pdf417[2],
                        sexo:    pdf417[3],
                        dni:     cleanDoc(pdf417[4]),
                        tipo:    pdf417[5],
                        fechaNac:pdf417[6],
                        fechaexp:pdf417[7]
                    };
                    }else{
                        documento = {
                            tramite: pdf417[10],
                            apellido:pdf417[4],
                            nombre:  pdf417[5],
                            sexo:    pdf417[8],
                            dni:     pdf417[1],
                            tipo:    pdf417[2],
                            fechaNac:pdf417[7],
                            fechaexp:pdf417[9],
                            cuil:    pdf417[3]
                        };
                    }
                }
                resolve(documento);
            }).catch(err=>{
               resolve(null);
            });
        }).catch(err=>{
            resolve(null);
        });
    });
    
   
}


function cleanDoc(document){
    return document.replace(/[^.\d]/g, '').replace(/^0+/, '');;
}


