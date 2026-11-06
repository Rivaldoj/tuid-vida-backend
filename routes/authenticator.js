const express   = require('express');
const swaggerUi = require('swagger-ui-express');
const router = express.Router();
const services = require('../services/authenticator');
const v2 = require('../services/authenticator/v2');
const swaggerSpec = require('../services/authenticator/v2/swagger');
const tokenizer = require('../utils/tokenizer');
const appAttest = require('../middleware/appAttest');

const validateToken = (req, res, next) => {
    tokenizer.detokenize(req.body.token, function (err, data) {
        res.response = res.response || { status: 400, res: 'error' };
        res.response.status = 400;
        res.response.res = 'error';

        if (err) {
            return res.status(200).json({status: 400, res: 'error', message: 'Token de identificacion de DNI vencido, inicie el proceso nuevamente'});
        }
        req.body.data = data;
        AUTHENTICATOR_DB.query('select * from usuarios where idUsuario = ?', [data.idUsuario], function (err, result) {
            if (err || !result[0]) {
                res.response.message = 'Usuario no encontrado';
                return res.status(200).json(res.response);
            }
            req.user = result[0];
            next();
        });
    });
};

const v2Router = express.Router();

v2Router.use('/docs', swaggerUi.serveFiles(swaggerSpec), swaggerUi.setup(swaggerSpec));
v2Router.get('/meta', services.meta.getMeta); 
v2Router.get('/tyc', v2.tyc.getTyc);
v2Router.get('/privacy', v2.tyc.getPrivacy);
v2Router.get('/localities', v2.address.getLocalities);
v2Router.post('/address', validateToken, services.pep.getPepDataFromDB, v2.address.updateAddress);

v2Router.get('/session', v2.register.session);
v2Router.post('/search', v2.register.search);
v2Router.get('/attest/challenge', v2.attest.getChallenge);
v2Router.post('/attest/enroll', v2.attest.enroll);
v2Router.post('/signup', appAttest, v2.register.validateUser, services.register.validateData, v2.register.uploadImages, v2.register.validateImages,services.pep.insertIntoPepInfoIffWhiteBrandRequiredMiddelware, v2.register.createUser );
v2Router.post('/chance', services.chance);
v2Router.get('/test/:idJson', appAttest, v2.register.loadTestBody ,v2.register.validateUser, services.register.validateData, v2.register.uploadImages, v2.register.validateImages,services.pep.insertIntoPepInfoIffWhiteBrandRequiredMiddelware, v2.register.createUser );

router.use(express.json({
    limit: '50mb',
    verify: function (req, res, buf) {
        req.rawBody = buf;
    }
}));
router.use(express.urlencoded({limit: '50mb', extended: true}));

router.use('/v2', v2Router);
router.post('/searchdni', services.searchdni);
router.post('/register', services.register.cleanBody,services.register.checkIfExists, services.register.checkBlacklist, services.register.checkMaster,services.register.validateData, services.register.uploadImages, services.register.validateUser,services.pep.insertIntoPepInfoIffWhiteBrandRequiredMiddelware, services.register.createUser );
router.post('/chance', services.chance);
router.post('/auth', services.auth.decodeToken, services.auth.searchUser, services.auth.uploadImageToBucket, services.auth.authenticate, services.auth.createToken);
router.post('/validation',services.validation.decodeToken, services.validation.updateData);
router.post('/confirmation',services.confirmation.decodeToken, services.pep.getPepDataFromDB, services.confirmation.confirm);
router.post('/comentary',services.comment);
router.get('/meta', services.meta.getMeta); // META DATA FROM WHITEBRAND CONGIF
router.get('/testWebhook/*', async(req,res)=>{
    console.log("********** WEBHOOK RECEIVED ! *******************")
    console.log("URL",req.url);
    console.log("Body",req.body);
    console.log("*************************************************")
})
module.exports.router = router;