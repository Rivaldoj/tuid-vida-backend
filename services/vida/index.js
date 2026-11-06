const chance = require('./chance');
const register = require('./register');
const login = require('./login');
const confirmation = require('./confirmation');
const verification = require('./verification');
const comment = require('./comment');
const validations = require('./validations');
const payments = require('./payments');
const utils = require('./utils');
const manual = require('./manualRegister');
const tasks = require('./tasks');

module.exports = {
    chance,
    manual,
    register,
    login,
    confirmation,
    verification,
    comment,
    validations,
    payments,
    utils,
    tasks
}