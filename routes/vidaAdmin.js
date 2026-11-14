const express   = require('express');
const router = express.Router();
const services = require('../services/vida/admin');
const adminMiddleware = require('../middleware/vidaAdmin');
var multer = require('multer');
var upload = multer({ dest: 'uploads/' });

router.use(express.json({limit: '50mb'}));
router.use(express.urlencoded({limit: '50mb', extended: true}));
router.use(function(req, res, next) {
    res.header('Access-Control-Allow-Origin', '*'); 
    res.header('Access-Control-Allow-Methods', 'GET, PUT, POST, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, Content-Type, Authorization, Content-Length, X-Requested-With, token');
    if ('OPTIONS' == req.method) {
        res.send(200);
    }
    else {
        next();
    }
});


const hasPermission = function(permission) {
  return  async (req, res, next) => {
    console.log(req.user.newPermissions);
      if (req.user.newPermissions.indexOf(permission) == -1 ){
          return res.status(200).json({
              error: 1,
              data: "Error de permisos"
          })
      } 
      next();
  }
}


// Alcanza con tener alguno de los permisos (los textos los usan Auditoria, Notificaciones y quien administra los textos)
const hasAnyPermission = function(permissions) {
  return async (req, res, next) => {
      if (!permissions.some((p) => req.user.newPermissions.indexOf(p) !== -1)) {
          return res.status(200).json({ error: 1, data: "Error de permisos" })
      }
      next();
  }
}


router.get('/health', function (req, res, next) {res.json({status: 'UP'});});
router.post('/login', services.users.login); // --
router.post('/forgot', services.users.forgot); //
router.post('/reset', services.users.reset); //
router.get("/unsubscribe", services.unsubscribe.unsubscribe);

router.get('/auth', adminMiddleware, services.users.auth);//
router.get('/auth/getUsers', adminMiddleware, services.users.getUsers); //
router.get('/auth/getEmail', adminMiddleware, services.users.getEmail); //--
router.get('/auth/getEmpresa', adminMiddleware, services.users.getEmpresas); //-- inseguro
router.post('/auth/register', adminMiddleware, services.users.register); //
router.post('/auth/delete', adminMiddleware, services.users.delete); //
router.post('/auth/update', adminMiddleware, services.users.update); //
router.get('/auth/listanegra', adminMiddleware, services.client.getListaNegra);// Seguro
router.post('/auth/listanegra', adminMiddleware, services.client.listanegra);// Mejorar con on duplicate key update
router.post('/auth/deleteListaNegra', adminMiddleware, services.client.listanegra);// seguro
router.get('/auth/dashboard2', adminMiddleware, services.dashboard.get); // --
router.get('/auth/buscarregistraciones', adminMiddleware, services.registrations.search);
router.get('/auth/buscarvalidaciones', adminMiddleware, services.validations.search); // --
router.get('/auth/imgregistracion', adminMiddleware, services.registrations.images);
router.get('/auth/imgsBackup', adminMiddleware, services.registrations.backupImages);
router.get('/auth/getValidation', adminMiddleware, services.validations.get); // --
router.get('/auth/getRegister', adminMiddleware, services.registrations.get); 

router.put('/auth/registrados/:idUsuario/extra', adminMiddleware,hasPermission("EXTRA"), services.registrations.updateExtra); 
router.get('/auth/imgValidation', adminMiddleware, services.validations.imgValidation);
router.get('/auth/downloadValidation', adminMiddleware, services.validations.downloadValidations);
router.get('/auth/downloadRegister', adminMiddleware, services.registrations.downloadRegisters);
router.post('/auth/updateContact', adminMiddleware, services.users.updateContact);
router.post('/auth/updateNotificaciones', adminMiddleware, services.users.updateNotificaciones);
router.put('/auth/updateFallecido',adminMiddleware,hasPermission("FALLECIDOS"),  services.users.updateFallecido);
router.post('/auth/reminder', adminMiddleware, services.users.reminder);
router.post('/auth/notification', adminMiddleware, services.users.notification);
//NOTIFICACIONES push por rango de fechas y con mensajes prearmados (Modulo de Textos, canal push)
const notificacionesSrv = require('../services/vida/admin/notificaciones').crear({
  db: { sync_query: (...args) => VIDA_DB.sync_query(...args) },
  push: require('../utils/push')
});
router.get('/auth/notificaciones/mensajes', adminMiddleware, hasPermission("NOTIFICACIONES"), notificacionesSrv.mensajes);
router.post('/auth/notificaciones/destinatarios', adminMiddleware, hasPermission("NOTIFICACIONES"), notificacionesSrv.destinatarios);
router.post('/auth/notificaciones/enviar', adminMiddleware, hasPermission("NOTIFICACIONES"), notificacionesSrv.enviar);
router.get('/auth/notificaciones/historial', adminMiddleware, hasPermission("NOTIFICACIONES"), notificacionesSrv.historial);
router.get('/auth/download', adminMiddleware, services.registrations.download);
router.post('/auth/upload', adminMiddleware, upload.single('file'),services.users.upload);
router.post('/auth/manuallyregister', adminMiddleware, services.registrations.manuallyRegister);

router.get("/auth/payments", adminMiddleware, services.payments.getPayments); // Validar los que estan en la tabla de usuario empresa
router.get('/auth/errors', adminMiddleware, services.registrations.getErrors);
router.get('/auth/errorsImages', adminMiddleware, services.registrations.errorImages);
router.get('/auth/alerts', adminMiddleware, services.validations.getAlerts);
router.get('/auth/webnotifications', adminMiddleware,hasPermission("WEBNOTIFICATIONS"), services.utils.notifications);
router.post('/auth/notify', adminMiddleware,hasPermission("NOTIFICACIONES"), services.utils.notify);

//TICKETS
router.get('/auth/tickets', adminMiddleware,hasPermission("SOPORTE"), services.tickets.get);
router.get('/auth/tickets/users', adminMiddleware,hasPermission("SOPORTE"), services.tickets.supportUsers);
router.put('/auth/tickets/:proveedor/:external_id/status/:newStatus', adminMiddleware,hasPermission("SOPORTE"), services.tickets.changeStatus);
router.put('/auth/tickets/:proveedor/:external_id/asign/:email', adminMiddleware,hasPermission("SOPORTE"), services.tickets.asign);
router.put('/auth/tickets/:proveedor/:external_id/procesando/:procesando', adminMiddleware,hasPermission("SOPORTE"), services.tickets.changeProcess);
router.put('/auth/tickets/:proveedor/:external_id/channel/:channelId', adminMiddleware,hasPermission("SOPORTE"), services.tickets.channel);
router.post('/auth/tickets/:proveedor/:external_id/category', adminMiddleware,hasPermission("SOPORTE"), services.tickets.closeIssue);
router.get('/auth/tickets/categories', adminMiddleware,hasPermission("SOPORTE"), services.tickets.categories);

//REPORTS
router.get('/auth/reports/pending', adminMiddleware,hasPermission("REPORTSSUP"), services.registrations.pendingReport, services.registrations.sendReport);
router.get('/auth/reports/tickets/monthly', adminMiddleware,hasPermission("REPORTSSUP"), services.tickets.monthly, services.registrations.sendReport);
router.get('/auth/reports/tickets/daily', adminMiddleware,hasPermission("REPORTSSUP"), services.tickets.daily, services.registrations.sendReport);
router.get('/auth/reports/dashboard/informe', adminMiddleware,hasPermission("DASHBOARD"), services.dashboard.informeMensual);
router.get('/auth/reports/dashboard/registrations', adminMiddleware,hasPermission("DASHBOARD"), services.dashboard.reportRegistrations, services.registrations.sendReport);
router.get('/auth/reports/dashboard/validations', adminMiddleware,hasPermission("DASHBOARD"), services.dashboard.reportValidations, services.registrations.sendReport);

//AUDITORIA
router.get('/auth/auditoria/informe-observados', adminMiddleware,hasPermission("AUDITORIA"), services.auditoria.informeObservados);
router.get('/auth/auditoria/validaciones', adminMiddleware,hasPermission("AUDITORIA"), services.auditoria.list);
router.get('/auth/auditoria/filtros', adminMiddleware,hasPermission("AUDITORIA"), services.auditoria.filtros);
router.get('/auth/auditoria/validaciones/:id_validacion/ok', adminMiddleware,hasPermission("AUDITORIA"), services.auditoria.validacionOk);
router.get('/auth/auditoria/validaciones/:id_validacion/alert', adminMiddleware,hasPermission("AUDITORIA"), services.auditoria.validacionAlert);
router.get('/auth/auditoria/registraciones/:id_usuario/ok', adminMiddleware,hasPermission("AUDITORIA"), services.auditoria.registracionOk);
router.get('/auth/auditoria/registraciones/:id_usuario/alert', adminMiddleware,hasPermission("AUDITORIA"), services.auditoria.registracionAlert);
router.get('/auth/auditoria/sendMail', adminMiddleware,hasPermission("AUDITORIA"), services.auditoria.sendEmail);
router.delete('/auth/auditoria/validaciones/:id_validacion', adminMiddleware,hasPermission("AUDITORIA"), services.validations.delete);

//CONFIGURACION (solo Administrador de TUID)
router.get('/auth/configuracion/auditoria', adminMiddleware, hasPermission("CONFIGURACION"), services.configuracion.getAuditoria);
router.post('/auth/configuracion/auditoria', adminMiddleware, hasPermission("CONFIGURACION"), services.configuracion.setAuditoria);
router.get('/auth/backups', adminMiddleware, hasPermission("BACKUPS"), services.backups.get);
router.post('/auth/backups/ejecutar', adminMiddleware, hasPermission("BACKUPS"), services.backups.ejecutar);
router.get('/auth/backups/descargar', adminMiddleware, hasPermission("BACKUPS"), services.backups.descargar);
router.post('/auth/backups/configuracion', adminMiddleware, hasPermission("BACKUPS"), services.backups.setConfig);
router.get('/auth/configuracion/control-nombres', adminMiddleware, hasPermission("CONFIGURACION"), services.configuracion.getControlNombres);
router.post('/auth/configuracion/control-nombres', adminMiddleware, hasPermission("CONFIGURACION"), services.configuracion.setControlNombres);
router.get('/auth/configuracion/certificado', adminMiddleware, hasPermission("CONFIGURACION"), services.configuracion.getCertificado);
router.post('/auth/configuracion/certificado', adminMiddleware, hasPermission("CONFIGURACION"), services.configuracion.setCertificado);

//CORREO DE AUDITORIA con la foto de la certificacion (texto del Modulo de Textos)
router.post('/auth/auditoria/enviar-correo', adminMiddleware, hasPermission("AUDITORIA"), require('../services/vida/admin/correos').crearEnviarCorreo({
  db: { sync_query: (...args) => VIDA_DB.sync_query(...args) },
  firmarFoto: (clave, segundos) => new (require('aws-sdk').S3)().getSignedUrl('getObject', { Bucket: CONFIG.get('vida').bucketName, Key: clave, Expires: segundos }),
  enviar: async (html, asunto, para) => {
    const soporte = CONFIG.get('vida').supportContact;
    require('../utils/mail').sendHtml(html, para, asunto, soporte, [soporte]);
  },
  urlBase: () => services.textos.urlBasePublica()
}));

//EMPRESAS y sus ADMINISTRADORES (solo Administrador de TUID). El administrador de cada empresa habilita a sus usuarios desde "Gestionar usuarios".
const empresasSrv = require('../services/vida/admin/empresas').crear({
  db: { sync_query: (...args) => VIDA_DB.sync_query(...args) },
  enviar: async (plantilla, params, para) => { require('../utils/mail').send(plantilla, params, para, null, null); }, // remitente por defecto del sistema (aws.emailFrom)
  urlPanel: () => (CONFIG.has('vida.panelUrl') ? String(CONFIG.get('vida.panelUrl')).replace(/\/+$/, '') : 'https://vida.autenticartuid.com')
});
router.get('/auth/empresas', adminMiddleware, hasPermission("EMPRESAS"), empresasSrv.listar);
router.post('/auth/empresas', adminMiddleware, hasPermission("EMPRESAS"), empresasSrv.crear);
router.put('/auth/empresas/:id', adminMiddleware, hasPermission("EMPRESAS"), empresasSrv.actualizar);
router.get('/auth/empresas/:id/cuentas', adminMiddleware, hasPermission("EMPRESAS"), empresasSrv.cuentas);
router.post('/auth/empresas/:id/administradores', adminMiddleware, hasPermission("EMPRESAS"), empresasSrv.invitar);
router.post('/auth/empresas/:id/cuentas/:idUsuario/estado', adminMiddleware, hasPermission("EMPRESAS"), empresasSrv.estadoCuenta);
router.post('/auth/empresas/:id/acceso', adminMiddleware, hasPermission("EMPRESAS"), empresasSrv.accesoEmpresa);

//TEXTOS (mensajes de WhatsApp, correos y notificaciones): leer y armar contactos = Auditoria / Notificaciones / Textos; editar = solo Administrador (TEXTOS)
router.get('/auth/textos', adminMiddleware, hasAnyPermission(["TEXTOS","AUDITORIA","NOTIFICACIONES"]), services.textos.list);
router.get('/auth/textos/contacto', adminMiddleware, hasAnyPermission(["TEXTOS","AUDITORIA"]), services.textos.contacto);
router.post('/auth/textos/preview', adminMiddleware, hasPermission("TEXTOS"), services.textos.preview);
router.post('/auth/textos', adminMiddleware, hasPermission("TEXTOS"), services.textos.create);
router.put('/auth/textos/:id', adminMiddleware, hasPermission("TEXTOS"), services.textos.update);
router.get('/auth/textos/:id/historial', adminMiddleware, hasPermission("TEXTOS"), services.textos.historial);
router.post('/auth/textos/:id/restaurar/:idHistorial', adminMiddleware, hasPermission("TEXTOS"), services.textos.restaurar);

//REGISTROMANUAL
router.get('/auth/manuales', adminMiddleware, hasPermission("REGISTROMANUAL"), services.manuales.list);//PROBAR
router.get('/auth/manuales/accept/:idUsuario', adminMiddleware, hasPermission("REGISTROMANUAL"), services.manuales.accept);//DESARROLLAR
router.get('/auth/manuales/images', adminMiddleware, hasPermission("REGISTROMANUAL"), services.manuales.checkImages);//PROBAR
router.get('/auth/manuales/delete/:idUsuario', adminMiddleware, hasPermission("REGISTROMANUAL"), services.manuales.delete);// PROBAR

//FORMULARIOS
router.get('/auth/formularios', adminMiddleware, hasPermission("FORMULARIOS"), services.forms.getFormularios);// PROBAR
router.get('/auth/respuestas', adminMiddleware, hasPermission("FORMULARIOS"), services.forms.getRespuestas);// PROBAR

//SISA
router.get('/auth/sisa', adminMiddleware, hasPermission("SISA"), services.sisa.getDoctor);// PROBAR


//TESTS STEVE
router.get('/auth/auditoria/test',adminMiddleware, hasPermission("AUDITORIA"), services.auditoria.test);
//

module.exports.router = router;

