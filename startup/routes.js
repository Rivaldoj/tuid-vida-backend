const express = require('express');
const vida = require('../routes/vida');
const vidaV2 = require('../services/vida/v2/router');
const vidaAdmin = require('../routes/vidaAdmin');
const authenticator = require('../routes/authenticator');
const authenticatorAdmin = require('../routes/authenticatorAdmin');
const whiteBrandAuth = require('../middleware/authenticator');
const vidaAuth = require('../middleware/vida');
const validations = require('../services/vida/validations');
const helmet = require('helmet');
const morgan = require('morgan');
const cors = require('cors');
const slack = require('./../utils/slack');
const error = require('../middleware/error');
const whatsapp = require('./../services/vida/whatsappBot/whatsapp');
const webhookSigner = require('./../utils/webhookSigner');

const corsConfig = {
    origin: "*",
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    preflightContinue: false,
    optionsSuccessStatus: 202,

    exposedHeaders: 'Authorization',
    allowedHeaders: 'Origin, Access-Control-Allow-Origin, Content-Type, Authorization, Content-Length, X-Requested-With, token, X-App-Attest-KeyId, X-App-Attest-Challenge, X-App-Attest-Assertion',
    // credentials: true
  };


module.exports = function (app) {
    app.use(helmet());
    app.use(morgan('tiny'));
    app.use(function(req, res, next) { 
      res.response = {};
      next();
    });
    app.use(express.json({
      limit: '50mb',
      verify: function (req, res, buf) {
        req.rawBody = buf;
      }
    }));
    app.use(express.urlencoded({limit: '50mb', extended: true}));
    // app.use(express.urlencoded({ extended: true }));
    app.use('*', cors(corsConfig));
    // ROUTES GOES HERE
    app.get('/users/health', (req,res,next) => {
      return res.status(200).json({status: "Ok"});
    });
  
    app.use('/authenticator/admin', authenticatorAdmin.router);
    app.use('/authenticator',[whiteBrandAuth], authenticator.router);
    app.use('/vida/admin', vidaAdmin.router);
    // Pagina publica "Su foto de la certificacion" (enlace que vence + ultimos 3 digitos del CUIL). Ver services/vida/fotos.js
    app.use('/vida/f', require('../services/vida/fotos')({
      db: { sync_query: (...args) => VIDA_DB.sync_query(...args) },
      requiereCuil: CONFIG.has('vida.fotoRequiereCuil') && CONFIG.get('vida.fotoRequiereCuil') === true,
      firmarFoto: (clave, segundos) => new (require('aws-sdk').S3)().getSignedUrl('getObject', { Bucket: CONFIG.get('vida').bucketName, Key: clave, Expires: segundos })
    }));
    

    app.post('/validaciones', validations.validations);
    app.post('/formularios', validations.forms);
    
    app.get('/certificates',function(req,res){  
      res.redirect('https://tuid.ar')
  })

    app.get('/sms',(req,res,next) => {
      return res.status(200).json({provider: CONFIG.get('sms').defaultProvider});
    });
    // UNIVERSAL LINKS ASSOCIATION
    app.get('/apple-app-site-association',(req,res)=>{
      return res.status(200).json({
        "applinks": {
          "apps": [],
          "details": [
          {
            "appID": "WLQK6ZCV78.com.tuid.vida", 
            "paths": ["*"]
          }
          ]
        }
      })
    })  
    app.post('/webhooks/whatsapp',whatsapp.whatsapp);

    // Claves publicas para que los receptores verifiquen la firma de nuestros webhooks
    app.get('/.well-known/webhook-keys', (req, res) => {
      res.set('Cache-Control', 'public, max-age=3600');
      return res.status(200).json(webhookSigner.jwks());
    });
    app.get('/.well-known/webhook-public-key.pem', (req, res) => {
      const pem = webhookSigner.activePublicKeyPem();
      if (!pem) return res.status(404).send('Sin clave publica configurada');
      res.set('Cache-Control', 'public, max-age=3600');
      return res.type('application/x-pem-file').send(pem);
    });

    app.get("/", (req, res) => res.send("TuID Backend API"));
    app.use('/vida/v2', vidaV2);
    app.use('',vidaAuth, vida.router); // implementando

    // LAST USE TO CALL 
    app.use(error);

}