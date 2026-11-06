'use strict';

const register = require('./register');
const auth = require('./auth');
const searchdni = require('./searchdni');
const chance = require('./chance');
const validation = require('./validation');
const confirmation = require('./confirmation');
const comment = require('./comment');
const pep = require('./pepInformationService');
const meta = require('./meta')



module.exports = {
    register,
    auth,
    searchdni,
    chance,
    validation,
    confirmation,
    comment,
    pep,
    meta
}