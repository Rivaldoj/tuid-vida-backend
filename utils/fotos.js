// Enlaces a la foto de una certificacion. La logica no depende de AWS: la firma de la foto se inyecta (`firmar`) para poder probarla.
const crypto = require('crypto');

const DIAS_POR_DEFECTO = 7;
const MAX_INTENTOS = 5;
const MAX_DIAS = 7; // limite de las URL firmadas de S3 con clave de usuario IAM

// Codigo no adivinable, apto para URL (base64url sin depender de la version de Node)
function generarCodigo() {
    return crypto.randomBytes(18).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function codigoValido(codigo) {
    return typeof codigo === 'string' && /^[A-Za-z0-9_-]{20,40}$/.test(codigo);
}

// Clave de la foto de la certificacion en el bucket: la del ultimo login de la persona (la que muestra la ficha de Auditoria)
function claveFotoCertificacion(dni, sexo) {
    return 'login/' + dni + sexo + '.jpeg';
}

// Ultimos digitos del CUIL con los que la persona confirma que es ella
function digitosCuil(cuil, cantidad) {
    const d = String(cuil == null ? '' : cuil).replace(/\D/g, '');
    return d.slice(-cantidad);
}

function confirmaCuil(cuil, ingresado, cantidad) {
    const esperado = digitosCuil(cuil, cantidad);
    const recibido = String(ingresado == null ? '' : ingresado).replace(/\D/g, '');
    if (esperado.length !== cantidad || recibido.length !== cantidad) return false;
    return crypto.timingSafeEqual(Buffer.from(esperado), Buffer.from(recibido));
}

// Crea el enlace para una certificacion (id_validacion) y devuelve { codigo, vence_en }
async function crearEnlace(db, { idValidacion, idUsuario, creadoPor, dias }) {
    const d = Math.min(Math.max(parseInt(dias, 10) || DIAS_POR_DEFECTO, 1), MAX_DIAS);
    const codigo = generarCodigo();
    await db.sync_query(
        'INSERT INTO fotos_enlaces (codigo, id_validacion, id_usuario, creado_por, creado_en, vence_en) VALUES (?, ?, ?, ?, NOW(), DATE_ADD(NOW(), INTERVAL ? DAY))',
        [codigo, idValidacion, idUsuario, creadoPor || null, d]);
    return { codigo, dias: d };
}

// Busca un enlace vigente. Devuelve { enlace } o { error: 'invalido' | 'vencido' | 'bloqueado' }
async function buscarEnlace(db, codigo) {
    if (!codigoValido(codigo)) return { error: 'invalido' };
    const [e] = await db.sync_query(
        'SELECT f.*, (f.vence_en < NOW()) AS vencido FROM fotos_enlaces f WHERE f.codigo = ?', [codigo]);
    if (!e) return { error: 'invalido' };
    if (e.vencido) return { error: 'vencido' };
    if (e.intentos_fallidos >= MAX_INTENTOS) return { error: 'bloqueado' };
    return { enlace: e };
}

async function registrarFallo(db, id) {
    await db.sync_query('UPDATE fotos_enlaces SET intentos_fallidos = intentos_fallidos + 1 WHERE id = ?', [id]);
}

async function registrarAcceso(db, id) {
    await db.sync_query('UPDATE fotos_enlaces SET accesos = accesos + 1, ultimo_acceso = NOW(), intentos_fallidos = 0 WHERE id = ?', [id]);
}

module.exports = {
    DIAS_POR_DEFECTO, MAX_INTENTOS, generarCodigo, codigoValido, claveFotoCertificacion, digitosCuil, confirmaCuil,
    crearEnlace, buscarEnlace, registrarFallo, registrarAcceso
};
