const levenshtein = require('fast-levenshtein');

   
    var name = 'KARINA ANDREA';
    var lastname = 'D ANCORA';
    var nombres = "D'ANCORA KARINA ANDREA";


    var count = (nombres.match(/�/g) || []).length;


    if (count !== 0){
        count = count + (nombres.match(/,/g) || []).length + 1;
    }
    var nameOnBody = lastname + ' ' + name;
    nameOnBody = nameOnBody.replace(/\'/g," ");
    nombres = nombres.replace(/\'/g," ");
    var distance = levenshtein.get(nombres, nameOnBody);
    if ((nombres.toUpperCase().indexOf(lastname) !== -1) || distance < count) {
        console.log("Los datos del DNI coinciden con nuestra base de datos", distance);
    }else{
        console.log("Los datos del DNI no coinciden con nuestra base de datos por distancia: ", distance);
    }