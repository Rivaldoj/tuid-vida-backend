// Uso: node scripts/testQuestions.js <dni> <sexo> [idPregunta|auto] [repeticiones]
// "auto" usa generateQuestion (la pregunta elegida y, si queda incompleta, las demas), como en el signup
global.APP_PATH = __dirname + '/..';
process.env.NODE_CONFIG_DIR = APP_PATH + '/config/';
global.CONFIG = require('config');

const mysql = require('mysql');
const util = require('util');
const { initSequelize } = require('../startup/sequelize.init');

global.SEQUELIZE = initSequelize({ sync: false });
global.PADRON_DB = mysql.createPool({ ...CONFIG.get('padron').db, dateStrings: true });
global.PADRON_DB.sync_query = util.promisify(PADRON_DB.query).bind(PADRON_DB);

const person = require('../services/padron/person');
const { QUESTIONS, generateQuestion } = require('../services/padron/questions');

function problems(question, respuesta) {
    const options = [0, 1, 2, 3].map((key) => question[key]);
    const found = [];
    if (options.some((option) => option === undefined || option === null || String(option).trim() === '')) {
        found.push('opcion vacia');
    }
    const normalized = options.map((option) => String(option).trim().toUpperCase());
    if (new Set(normalized).size !== normalized.length) found.push('opciones repetidas');
    if (respuesta === undefined || question[respuesta] === undefined) found.push('respuesta fuera de rango');
    return found;
}

function print(label, result, found) {
    console.log(`\n${label} ${found.length > 0 ? 'FALLA: ' + found.join(', ') : 'OK'}`);
    if (result && result.question) {
        console.log(`  ${result.question.text}`);
        [0, 1, 2, 3].forEach((key) => {
            console.log(`  ${key === result.respuesta ? '*' : ' '} ${key}: ${result.question[key]}`);
        });
    }
}

async function main() {
    const [dni, sexo, only, times] = process.argv.slice(2);
    if (!dni || !sexo) {
        console.log('Uso: node scripts/testQuestions.js <dni> <sexo> [idPregunta|auto] [repeticiones]');
        process.exit(1);
    }

    const found = await person.findPerson(dni, sexo);
    if (!found) throw new Error(`${dni} ${sexo} no esta en el padron`);
    const master = found.row;

    console.log('Datos del padron:', {
        CUIL: master.CUIL,
        cuitemplea: master.cuitemplea,
        Familiar: master.Familiar,
        IdBanco: master.IdBanco,
        Telefono: master.Telefono,
        Celular: master.Celular,
        CP: master.CP,
        IdProvincia: master.IdProvincia,
        IdRelLab: master.IdRelLab,
    });

    const repeat = Number(times) || 1;
    let failures = 0;

    if (only === 'auto') {
        for (let i = 0; i < repeat; i++) {
            const result = await generateQuestion(master);
            const issues = result ? problems(result.question, result.respuesta) : ['sin pregunta posible'];
            if (result && !QUESTIONS[result.pregunta]) issues.push(`pregunta ${result.pregunta} no habilitada`);
            if (issues.length > 0) failures++;
            print(`auto [${i + 1}/${repeat}] -> #${result ? result.pregunta : '-'}`, result, issues);
        }
    } else {
        const ids = only ? [Number(only)] : Object.keys(QUESTIONS).map(Number);
        for (const id of ids) {
            if (!QUESTIONS[id]) throw new Error(`Pregunta ${id} inexistente. Validas: ${Object.keys(QUESTIONS).join(', ')}`);
            for (let i = 0; i < repeat; i++) {
                const result = await QUESTIONS[id](master);
                const issues = result.complete ? problems(result.question, result.respuesta) : ['incompleta (en signup se pasa a otra pregunta)'];
                if (issues.length > 0) failures++;
                print(`#${id}${repeat > 1 ? ` [${i + 1}/${repeat}]` : ''}`, result, issues);
            }
        }
    }

    console.log(`\n${failures === 0 ? 'Sin fallas' : failures + ' falla(s)'}`);
}

main()
    .catch((err) => {
        console.error(err);
        process.exitCode = 1;
    })
    .finally(() => {
        PADRON_DB.end();
        return SEQUELIZE.close();
    });
