const express   = require('express');
const router = express.Router();
const services = require('../services/authenticator/admin');
const adminMiddleware = require('../middleware/authenticatorAdmin');

router.use(express.json({limit: '50mb'}));
router.use(express.urlencoded({limit: '50mb', extended: true}));

router.post('/login', services.login.login); //
router.get('/health', (req, res) => { res.json({status: 'UP'}); }); //
router.post('/forgot', services.login.forgotPassword); //
router.post('/reset', services.login.resetPassword); //
router.get('/api/code', adminMiddleware.api, services.registrations.validateCode);

router.get('/api/users', adminMiddleware.api, services.registrations.filter, services.registrations.list);
router.get('/api/users/:document/:gender', adminMiddleware.api, services.registrations.searchUserByDocumentAndGender,services.registrations.data);
router.get('/api/document', adminMiddleware.api, services.api.getDni);
router.get('/api/beneficiarios', adminMiddleware.api, services.api.fechaPago);

router.get('/auth', adminMiddleware.web, services.login.auth);//
router.get('/auth/users', adminMiddleware.web, services.users.list); //
router.post('/auth/users', adminMiddleware.web, services.users.create);//
router.delete('/auth/users/:id', adminMiddleware.web, services.users.delete);// Probar
//router.put('/auth/users/:id', adminMiddleware, services.users.update); // probar
router.get('/auth/listanegra', adminMiddleware.web, services.users.getBlacklist); //
router.post('/auth/listanegra', adminMiddleware.web, services.users.postBlacklist); // probar
router.post('/auth/listanegra', adminMiddleware.web, services.users.removeBlackList); // probar
router.get('/auth/dashboard', adminMiddleware.web, services.dashboard.get); //
router.get('/auth/validations', adminMiddleware.web, services.validations.filter, services.validations.list); //
router.get('/auth/validations/download', adminMiddleware.web, services.validations.filter, services.validations.download); //

router.get('/auth/validations/:idValidacion', adminMiddleware.web, services.validations.searchUser, services.validations.data); //
router.get('/auth/registrations', adminMiddleware.web,services.registrations.filter, services.registrations.list);//
router.post('/auth/manuallyregister', adminMiddleware.web, services.registrations.validateCompany, services.registrations.manuallyRegister);//


router.post('/auth/registrations', adminMiddleware.web,services.registrations.cleanBody, services.registrations.create);// probar
router.get('/auth/registrations/:idUser', adminMiddleware.web, services.registrations.searchUser, services.registrations.data); //
router.get('/auth/registrations/download', adminMiddleware.web,services.registrations.filter, services.registrations.download); //

router.get('/auth/webhooks', adminMiddleware.web, services.webhooks.list);
router.post('/auth/webhooks/:id/retry', adminMiddleware.web, services.webhooks.retry);

module.exports.router = router;