const { Op } = require('sequelize');

// Preguntas de conocimiento para la revancha. Reciben una fila de padron.master (ver services/padron/person.js)
const NONE_OPTION = 'Ninguna es correcta';
const PHONE_CP_RANGE = 20;
const CUIL_MIN = 20000000000;
const CUIL_MAX = 28000000000;

function shuffle(array) {
    let currentIndex = array.length;
    while (currentIndex !== 0) {
        const randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex -= 1;
        [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
    }
    return array;
}

function randomDigits(length) {
    let digits = '';
    for (let i = 0; i < length; i++) digits += Math.floor(Math.random() * 10);
    return digits;
}

// Filas al azar de tablas grandes sin ORDER BY RAND(): salta a un PK aleatorio dentro del rango
async function randomRows(model, pk, where, limit, attributes) {
    const [range] = await model.findAll({
        attributes: [
            [SEQUELIZE.fn('MIN', SEQUELIZE.col(pk)), 'min'],
            [SEQUELIZE.fn('MAX', SEQUELIZE.col(pk)), 'max'],
        ],
        raw: true,
    });
    if (!range || range.min == null) return [];
    const min = Number(range.min);
    const max = Number(range.max);
    const rows = [];
    for (let attempt = 0; rows.length < limit && attempt < limit * 3; attempt++) {
        const start = Math.floor(min + Math.random() * (max - min));
        const row = await model.findOne({ attributes, where: { ...where, [pk]: { ...where[pk], [Op.gte]: start } }, order: [[pk, 'ASC']], raw: true });
        if (row && !rows.some((r) => r[pk] === row[pk])) rows.push(row);
    }
    return rows;
}

function randomSmallRows(model, where, limit) {
    return model.findAll({ where, order: SEQUELIZE.random(), limit, raw: true });
}

function buildOptions(text, correct, decoys) {
    const orden = shuffle([0, 1, 2]);
    const question = { id: '', text };
    let respuesta = 3;
    let i = 0;
    if (correct) {
        respuesta = orden[i];
        question[orden[i++]] = correct;
    }
    decoys.forEach((decoy) => {
        if (i < 3) question[orden[i++]] = decoy;
    });
    question[3] = NONE_OPTION;
    return { question, respuesta, complete: i === 3 };
}

async function questionEmpleador(master) {
    const { empleador } = SEQUELIZE.models;
    const cuit = master.cuitemplea || null;
    const row = cuit ? await empleador.findByPk(cuit, { raw: true }) : null;
    const correct = row && row.EMPLEADOR;
    const where = { EMPLEADOR: { [Op.ne]: null } };
    if (correct) where.CUIT = { [Op.ne]: cuit };
    const decoys = await randomRows(empleador, 'CUIT', where, correct ? 2 : 3);
    return buildOptions('Trabaja o trabajo en alguna de estas empresas', correct, decoys.map((d) => d.EMPLEADOR));
}

async function questionFamiliar(master) {
    const { padron } = SEQUELIZE.models;
    const correct = master.Familiar || null;
    const where = { Familiar: { [Op.ne]: correct } };
    const decoys = await randomRows(padron, 'CUIL', where, correct ? 2 : 3, ['CUIL', 'Familiar']);
    return buildOptions('Esta o estuvo relacionado con alguna de estas personas', correct, decoys.map((d) => d.Familiar));
}

async function questionBanco(master) {
    const { banco } = SEQUELIZE.models;
    const id = master.IdBanco || null;
    const row = id ? await banco.findByPk(id, { raw: true }) : null;
    const correct = row && row.Entidad;
    const where = { Entidad: { [Op.ne]: null } };
    if (correct) where.IdBanco = { [Op.ne]: id };
    const decoys = await randomSmallRows(banco, where, correct ? 2 : 3);
    return buildOptions('Tiene cuenta en alguno de estos Bancos', correct, decoys.map((d) => d.Entidad));
}

// Cambia los ultimos `count` digitos respetando espacios y guiones, para que las opciones tengan el mismo formato
function replaceLastDigits(phone, count) {
    const chars = phone.split('');
    let replaced = 0;
    for (let i = chars.length - 1; i >= 0 && replaced < count; i--) {
        if (/\d/.test(chars[i])) {
            chars[i] = String(Math.floor(Math.random() * 10));
            replaced++;
        }
    }
    return chars.join('');
}

function uniqueValues(make, needed, exclude) {
    const values = [];
    for (let attempt = 0; values.length < needed && attempt < needed * 20; attempt++) {
        const candidate = make();
        if (candidate && candidate !== exclude && !values.includes(candidate)) values.push(candidate);
    }
    return values;
}

function normalizePhone(phone) {
    let digits = phone.replace(/\D/g, '').replace(/^0+/, '');
    if (digits.length > 10 && digits.startsWith('54')) digits = digits.substr(2).replace(/^9/, '');
    return digits;
}

// Todas las opciones con la misma cantidad de digitos, priorizando 10 (caracteristica + numero)
function sameLengthPool(phones, needed) {
    const groups = {};
    phones.forEach((phone) => { (groups[phone.length] = groups[phone.length] || []).push(phone); });
    if (groups[10] && groups[10].length >= needed) return groups[10];
    return Object.values(groups).sort((a, b) => b.length - a.length)[0] || [];
}

// Sin el indice master(CP) la consulta recorre toda la tabla: max_statement_time corta a 1s para no colgar el signup
async function phonesByCp(master, minCp, maxCp, needed) {
    const table = SEQUELIZE.models.padron.getTableName();
    const start = Math.floor(CUIL_MIN + Math.random() * (CUIL_MAX - CUIL_MIN));
    const phones = [];
    for (const operator of ['>=', '<']) {
        try {
            const rows = await SEQUELIZE.query(
                `SET STATEMENT max_statement_time=1 FOR SELECT Telefono FROM ${table} WHERE CP BETWEEN ? AND ? AND Telefono IS NOT NULL AND CUIL <> ? AND CUIL ${operator} ? LIMIT 20`,
                { replacements: [minCp, maxCp, master.CUIL, start], type: SEQUELIZE.QueryTypes.SELECT }
            );
            rows.forEach((row) => {
                const digits = normalizePhone(row.Telefono);
                if (digits.length >= 6) phones.push(digits);
            });
        } catch (err) {
            console.log('No se pudieron buscar telefonos por CP', minCp, maxCp, err.message);
        }
        if (phones.length >= needed) break;
    }
    return phones;
}

async function phoneDecoysFromPadron(master, needed) {
    const cp = Number(master.CP);
    if (!cp) return [];
    for (const range of [0, PHONE_CP_RANGE]) {
        const pool = shuffle(sameLengthPool(await phonesByCp(master, Math.max(cp - range, 0), cp + range, needed), needed));
        let i = 0;
        const decoys = uniqueValues(() => pool.length > 0 && replaceLastDigits(pool[i++ % pool.length], 4), needed);
        if (decoys.length === needed) return decoys;
    }
    return [];
}

async function phonePrefix(master) {
    const { localidad } = SEQUELIZE.models;
    const byCp = master.CP && await localidad.findOne({ where: { CP: master.CP, Prefijo: { [Op.ne]: null } }, raw: true });
    if (byCp) return byCp.Prefijo;
    if (!master.IdProvincia) return null;
    const [byProvince] = await localidad.findAll({
        attributes: ['Prefijo', [SEQUELIZE.fn('COUNT', SEQUELIZE.col('Prefijo')), 'total']],
        where: { ProvinciaCodigo: master.IdProvincia, Prefijo: { [Op.ne]: null } },
        group: ['Prefijo'],
        order: [[SEQUELIZE.literal('total'), 'DESC']],
        limit: 1,
        raw: true,
    });
    return byProvince ? byProvince.Prefijo : null;
}

async function questionTelefono(master) {
    const correct = [master.Telefono, master.Celular].find((phone) => phone && phone.replace(/\D/g, '').length >= 6) || null;
    const needed = correct ? 2 : 3;
    let decoys;
    if (correct) {
        decoys = uniqueValues(() => replaceLastDigits(correct, 4), needed, correct);
    } else {
        decoys = await phoneDecoysFromPadron(master, needed);
        if (decoys.length < needed) {
            const prefix = await phonePrefix(master);
            if (!prefix) return { complete: false };
            const digits = String(prefix).replace(/^0+/, '');
            decoys = uniqueValues(() => digits + randomDigits(Math.max(10 - digits.length, 4)), needed);
        }
    }
    return buildOptions('Alguno de estos numeros de telefono le resulta familiar:', correct, decoys);
}

async function questionRelacionLaboral(master) {
    const { relacionLaboral } = SEQUELIZE.models;
    const id = master.IdRelLab && master.IdRelLab !== 99 ? master.IdRelLab : null;
    const row = id ? await relacionLaboral.findByPk(id, { raw: true }) : null;
    const correct = row && row.denominacion;
    const where = { denominacion: { [Op.ne]: null }, IdRelLab: { [Op.notIn]: correct ? [99, id] : [99] } };
    const decoys = await randomSmallRows(relacionLaboral, where, correct ? 2 : 3);
    return buildOptions('Cual es su relacion laboral actual', correct, decoys.map((d) => d.denominacion));
}

// Los ids se guardan como id_pregunta en usuario/usuarios: no renumerar
const QUESTIONS = {
    4: questionEmpleador,
    5: questionFamiliar,
    7: questionBanco,
    8: questionTelefono,
    9: questionRelacionLaboral,
};

// Prueba la pregunta elegida (FORCE_QUESTION o al azar) y si no hay datos para armarla pasa a las demas
async function generateQuestion(master) {
    const ids = Object.keys(QUESTIONS).map(Number);
    const forced = Number(process.env.FORCE_QUESTION);
    const first = QUESTIONS[forced] ? forced : ids[Math.floor(Math.random() * ids.length)];
    for (const pregunta of [first, ...shuffle(ids.filter((id) => id !== first))]) {
        let result;
        try {
            result = await QUESTIONS[pregunta](master);
        } catch (err) {
            console.log(`Error generando la pregunta ${pregunta}`, err);
            continue;
        }
        if (result.complete) {
            result.question.id = pregunta + '';
            return { pregunta, question: result.question, respuesta: result.respuesta };
        }
    }
    return null;
}

module.exports = {
    QUESTIONS,
    generateQuestion,
};
