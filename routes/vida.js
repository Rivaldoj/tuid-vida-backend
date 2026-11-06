const express   = require('express');
const router = express.Router();
const services = require('../services/vida');
const routerAuth = express.Router();
routerAuth.post("/pendingTask", services.tasks.submit);

router.get("/", (req, res) => res.send("TuID Backend API"));
router.post("/searchdni",  services.login.searchdni);
router.post("/login",  services.login.getAddress, services.login.login2);
router.post("/login2", services.login.getAddress, services.login.login2);
router.post("/register", services.register.cleanData, services.register.checkBlacklist, services.register.verifyRecords, services.register.checkMaster, services.register.uploadImages, services.register.validateUser, services.register.createUser);
router.post("/validation", services.verification.verification);
router.post("/revalidation", services.verification.reverification);
router.post("/confirmation", services.confirmation.confirmation);
router.post("/reconfirmation", services.confirmation.reconfirmation);
router.post("/chance", services.chance.chance);
router.post("/comentary", services.comment.comment);
router.post("/commentary", services.comment.comment);
router.post("/checkDocument", services.login.validateUser);
router.get("/payments",  services.payments.getPayments);
router.get("/entities",  services.utils.getEntities);
router.get("/certificate",  services.login.getCertificate);
router.post("/manual", services.manual.prepareBody,services.manual.validatePhone, services.manual.validatePdf, services.manual.uploadPhotos, services.manual.validateSimilarity,services.manual.create)
router.post("/manual/validate", services.manual.validateCode);
router.get("/test", (req,res)=> {res.status(200).json({res: "ok", message: "ok"})});


router.use("/auth",services.login.validateToken, routerAuth );




module.exports.router = router;