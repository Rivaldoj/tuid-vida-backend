const users = require('./user');
const client = require('./client');
const dashboard = require('./dashboard');
const validations = require('./validations');
const registrations = require('./registrations');
const unsubscribe = require('./unsubscribe');
const payments = require('./payments');
const utils = require('./utils');
const tickets = require('./ticket');
const auditoria = require('./auditoria');
const configuracion = require('./configuracion');
const textos = require('./textos');
const manuales = require('./manuales');
const forms = require('./forms');
const sisa = require('./sisa');
const backups = require('./backups');


module.exports = {
    users,
    dashboard,
    client,
    validations,
    registrations,
    unsubscribe,
    payments,
    utils,
    tickets,
    auditoria,
    configuracion,
    textos,
    manuales,
    forms,
    sisa,
    backups
}