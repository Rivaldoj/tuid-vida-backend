'use strict';

const login = require('./login');
const users = require('./users');
const registrations = require('./registrations');
const validations = require('./validations');
const dashboard = require('./dashboard');
const api = require('./api');
const webhooks = require('./webhooks');
module.exports = {
    login,
    users,
    registrations,
    validations,
    dashboard,
    api,
    webhooks,
};