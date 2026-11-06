const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');
const s3 = new AWS.S3();
const lodash = require('lodash');

//bucket: validador-de-id
//sourceFile: temp/filename.png
//destination: login
//filename: dnisexo.jpeg

module.exports.moveFile = async function (bucket, sourceFile,destination,filename,next) { 
    var error = null;
    let finish = lodash.after(1, function () {
        if (error) return next(error);
        var params = {
            Bucket: bucket,
            Delete: { // required
                Objects: [ // required
                    {
                        Key: sourceFile // required
                    }
                ],
            },
        };
        s3.deleteObjects(params, function(err, data) {
            if (err){
                return next(err);
            } // an error occurred
            next();           // successful response
        });
    });
    var params1 = {
        CopySource: bucket + '/' + sourceFile,
        Bucket: bucket + '/' + destination,
        Key: filename
    };

    s3.copyObject(params1, function(err, data) {
        if (err){
            error = err;
        } // an error occurred
        finish();           // successful response
    });
}

module.exports.copyFile = async function (bucket, sourceFile,destination,filename,next) { 
    var error = null;
    let finish = lodash.after(1, function () {
        if (error) return next(error);
        next();
    });
    var params1 = {
        CopySource: bucket + '/' + sourceFile,
        Bucket: bucket + '/' + destination,
        Key: filename
    };
    console.log(params1)
    s3.copyObject(params1, function(err, data) {
        
        if (err){
            error = err;
            console.log(err);
        } // an error occurred
        finish();           // successful response
    });
}

module.exports.copyFilePromise = async function (bucket, sourceFile,destination,filename) { 
    return new Promise( (resolve, reject)=>{
        var params1 = {
            CopySource: bucket + '/' + sourceFile,
            Bucket: bucket + '/' + destination,
            Key: filename
        };
        s3.copyObject(params1, function(err, data) {
            if (err) reject(err);
            else resolve(true);
        });
    })
}

function decode_base64(base64str , filename, next){
    var buf = Buffer.from(base64str,'base64');
    let dir = path.join(APP_PATH,'./uploads/',filename);
    fs.writeFile(dir, buf, function(error){
        if(error){
            console.log(error);
            next(error) ;
        }else{
            //console.log('File created from base64 string!');
            next();
        }
    });
}




module.exports.base64toBucket = (base64,filename,bucket,next) => {
    var ruta = './uploads/'+filename;

    decode_base64(base64,filename, function (err) {
        if(err){
           next(err);
        };
        fs.readFile(ruta, function (err, data) {
            if (err) throw err;
            var params = {Bucket: bucket, Key: filename, Body: data};
            console.log(params);
            s3.putObject(params, function (err, data) {

                if (err) {
                    fs.unlink(ruta, (err) => {
                        if (err) throw err;
                    });
                    next(err);
                } else {
                    fs.unlink(ruta, (err) => {
                        if (err) throw err;
                    });
                    next();
                }
            });
        });
    });
}




module.exports.moveUserFiles = (filename,bucket, from,to, next) => {
    let finish = lodash.after(4, function () {
        var params = {
            Bucket: bucket,
            Delete: { // required
                Objects: [ // required
                    {Key: 'temp/' + filename +'_S.jpeg'},
                    {Key: 'temp/' + filename +'_F.jpeg'},
                    {Key: 'temp/' + filename +'_B.jpeg'},
                    {Key: 'temp/' + filename +'_P.jpeg'}
                ],
            },
        };
        s3.deleteObjects(params, function(err, data) {
            if (err) next(err); // an error occurred
            else next();           // successful response
        });

    });

    var params1 = {
        CopySource: bucket + from + '/' + filename +'_S.jpeg',
        Bucket: bucket + to ,
        Key: filename +'_S.jpeg'
    };
    s3.copyObject(params1, function(err, data) {
        if (err) next(err); // an error occurred
        else finish();           // successful response
    });
    var params2 = {
        CopySource: bucket + from + '/' + filename +'_F.jpeg',
        Bucket: bucket + to ,
        Key: filename +'_F.jpeg'
    };
    s3.copyObject(params2, function(err, data) {
        if (err) next(err); // an error occurred
        else finish();           // successful response
    });
    var params3 = {
        CopySource: bucket + from + '/' + filename +'_B.jpeg',
        Bucket: bucket + to ,
        Key: filename +'_B.jpeg'
    };
    s3.copyObject(params3, function(err, data) {
        if (err) next(err); // an error occurred
        else finish();           // successful response
    });
    var params4 = {
        CopySource: bucket + from + '/' + filename +'_P.jpeg',
        Bucket: bucket + to ,
        Key: filename +'_P.jpeg'
    };
    s3.copyObject(params4, function(err, data) {
        if (err) next(err); // an error occurred
        else finish();           // successful response
    });

}

module.exports.listBackups = (dni, sexo) =>{
    return new Promise((resolve, reject)=>{
        let mbucket = 'validador-de-id';
        let folder = 'backup/';
        var params = { 
            Bucket: mbucket,
            Delimiter: '/',
            Prefix: folder + dni + sexo
           }
           
           s3.listObjects(params, function (err, data) {
            if(err){
                console.log("ERRORBUCKETBACKUPD",err);
                reject("ERROR");
                return;
            }
            let ret = [];
            for(let c of data.Contents){
                let signed = s3.getSignedUrl('getObject', {
                    Bucket: mbucket,
                    Key: c.Key,
                    Expires: 10000000
                });
                ret.push({ date: c.LastModified, img: signed});
            }
            resolve(ret);
            return;
           });
    })
} 