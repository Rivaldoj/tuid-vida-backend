const express = require('express');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./swagger');
const services = require('./services');
const vidaAuth = require('../../../middleware/vida');
const vidaLogin = require('../login');

const router = express.Router();

router.get('/', (req, res) => res.send('TuID Backend v2 API'));
router.get('/health', (req, res) => res.json({ status: 'OK' }));
router.use('/docs', swaggerUi.serveFiles(swaggerSpec), swaggerUi.setup(swaggerSpec));

router.use(vidaAuth);

router.post('/searchdni', services.login.searchdni);
router.post('/checkregistration', services.account.checkRegistration);
router.post('/history', services.account.history);
router.post('/refreshdevice', services.account.refreshDevice);
router.post('/login', vidaLogin.getAddress, services.login.loadValidation, services.login.checkLiveness, services.login.compareSelfie, services.login.saveLogin);

router.get('/session', services.register.session);
router.post('/signup', services.register.cleanData, services.register.checkBlacklist, services.register.verifyRecords, services.register.checkMaster, services.register.checkLiveness, services.register.uploadImages, services.register.validateUser, services.register.createUser);

module.exports = router;
