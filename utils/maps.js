const request = require('request');

module.exports.getAddress = async (lat,long)=>{
    let url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${long}&key=${CONFIG.get('maps').key}`;
    return new Promise((resolve, reject) => {
        if (lat && long && lat !=0 ){
            request.get(url, function(err,res,bd){
                if (err){ 
                    resolve("");
                }else if (bd){
                    let body = JSON.parse(bd);

                    if (body.results && body.results.length > 0 && body.results[0].formatted_address){
                        resolve(body.results[0].formatted_address);
                    }else{
                        resolve("");
                    }
                }
            
            })
        }else {
            resolve("");
        }
    });
}
