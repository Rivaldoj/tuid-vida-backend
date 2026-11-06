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
const manuales = require('./manuales');
const forms = require('./forms');
const sisa = require('./sisa');


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
    manuales,
    forms,
    sisa
}