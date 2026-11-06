const fs = require('fs');
const path = require('path');

const CONFIG = require('config');
const outDir = path.join(__dirname, '../html/tyc');
const supportEmail = CONFIG.get('authenticator').supportContact || 'soporte@tuid.ar';

const brands = CONFIG.get('authenticator').whitebrands.map((wb) => ({
  id: wb.id,
  name: wb.displayName || wb.name || wb.id,
}));

function tycHtml(brand) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Términos y Condiciones - ${brand.name}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 24px 16px; }
    h1 { font-size: 1.5rem; margin-bottom: 0.25rem; }
    h2 { font-size: 1.1rem; margin-top: 1.5rem; }
    p, li { font-size: 0.95rem; }
    .updated { color: #666; font-size: 0.85rem; margin-bottom: 1.5rem; }
  </style>
</head>
<body>
  <h1>Términos y Condiciones</h1>
  <p class="updated">${brand.name}</p>

  <p>Al utilizar la aplicación de autenticación e identidad digital de <strong>${brand.name}</strong>, usted acepta los presentes Términos y Condiciones. Si no está de acuerdo, no utilice el servicio.</p>

  <h2>1. Objeto del servicio</h2>
  <p>El servicio permite verificar la identidad del usuario mediante validación de documento, datos biométricos y, cuando corresponda, prueba de vida (liveness), con el fin de completar procesos de registro y autenticación solicitados por <strong>${brand.name}</strong>.</p>

  <h2>2. Requisitos del usuario</h2>
  <ul>
    <li>Ser mayor de 18 años.</li>
    <li>Proporcionar información veraz y actualizada.</li>
    <li>Utilizar un documento de identidad válido y vigente.</li>
    <li>Contar con un dispositivo compatible con los requisitos técnicos de la aplicación.</li>
  </ul>

  <h2>3. Uso permitido</h2>
  <p>El usuario se compromete a utilizar el servicio de forma lícita, personal e intransferible. Queda prohibido suplantar identidades, manipular imágenes o intentar eludir los controles de seguridad.</p>

  <h2>4. Validación y resultados</h2>
  <p>La aprobación o rechazo del proceso de identificación depende de los criterios técnicos y de negocio definidos por <strong>${brand.name}</strong> y de la verificación contra fuentes autorizadas. El resultado no garantiza por sí solo la aprobación de productos o servicios adicionales.</p>

  <h2>5. Propiedad intelectual</h2>
  <p>La aplicación, su diseño, marcas y contenidos son propiedad de sus titulares. No se otorga ningún derecho de uso más allá del acceso al servicio conforme a estos términos.</p>

  <h2>6. Limitación de responsabilidad</h2>
  <p>El servicio se provee según disponibilidad técnica. No nos responsabilizamos por interrupciones derivadas de fallas de conectividad, del dispositivo del usuario o de terceros proveedores, dentro de los límites permitidos por la ley aplicable.</p>

  <h2>7. Modificaciones</h2>
  <p><strong>${brand.name}</strong> podrá actualizar estos Términos y Condiciones. Las versiones vigentes estarán disponibles a través de la aplicación. El uso continuado del servicio implica la aceptación de las modificaciones.</p>

  <h2>8. Contacto</h2>
  <p>Para consultas relacionadas con estos términos: <a href="mailto:${supportEmail}">${supportEmail}</a></p>
</body>
</html>`;
}

function privacyHtml(brand) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Política de Privacidad - ${brand.name}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 24px 16px; }
    h1 { font-size: 1.5rem; margin-bottom: 0.25rem; }
    h2 { font-size: 1.1rem; margin-top: 1.5rem; }
    p, li { font-size: 0.95rem; }
    .updated { color: #666; font-size: 0.85rem; margin-bottom: 1.5rem; }
  </style>
</head>
<body>
  <h1>Política de Privacidad</h1>
  <p class="updated">${brand.name}</p>

  <p>La presente Política de Privacidad describe cómo <strong>${brand.name}</strong> trata los datos personales en el marco del servicio de autenticación e identidad digital.</p>

  <h2>1. Responsable del tratamiento</h2>
  <p>El responsable del tratamiento de los datos es <strong>${brand.name}</strong>, quien utiliza la plataforma de identidad digital para verificar a sus usuarios.</p>

  <h2>2. Datos que recopilamos</h2>
  <ul>
    <li>Datos del documento de identidad (número, nombre, apellido, fechas, imágenes del documento).</li>
    <li>Datos biométricos (fotografía facial, resultados de comparación y prueba de vida).</li>
    <li>Datos de contacto (correo electrónico y teléfono, cuando se solicitan).</li>
    <li>Datos del dispositivo (identificador, sistema operativo, versión de la app).</li>
    <li>Información declarada sobre condición de Persona Expuesta Políticamente (PEP) y Sujeto Obligado, cuando aplique.</li>
  </ul>

  <h2>3. Finalidad del tratamiento</h2>
  <ul>
    <li>Verificar la identidad del usuario.</li>
    <li>Prevenir fraude y suplantación de identidad.</li>
    <li>Cumplir obligaciones legales y regulatorias.</li>
    <li>Gestionar el alta y autenticación en los servicios de <strong>${brand.name}</strong>.</li>
  </ul>

  <h2>4. Base legal</h2>
  <p>El tratamiento se realiza con el consentimiento del titular, para la ejecución de medidas precontractuales o contractuales, y para el cumplimiento de obligaciones legales aplicables en materia de identificación y prevención de lavado de activos.</p>

  <h2>5. Conservación</h2>
  <p>Los datos se conservan durante el tiempo necesario para cumplir las finalidades indicadas y las obligaciones legales de conservación que correspondan a <strong>${brand.name}</strong>.</p>

  <h2>6. Cesión y transferencia</h2>
  <p>Los datos pueden ser tratados por proveedores tecnológicos que actúan como encargados del tratamiento (por ejemplo, servicios de almacenamiento en la nube y verificación biométrica), bajo contratos que garantizan la confidencialidad y seguridad. No se venden datos personales a terceros.</p>

  <h2>7. Seguridad</h2>
  <p>Se aplican medidas técnicas y organizativas razonables para proteger los datos personales contra acceso no autorizado, pérdida o alteración.</p>

  <h2>8. Derechos del titular</h2>
  <p>Usted puede ejercer los derechos de acceso, rectificación, actualización, supresión y demás previstos en la normativa aplicable, contactando a <a href="mailto:${supportEmail}">${supportEmail}</a>.</p>

  <h2>9. Cambios en esta política</h2>
  <p>Podemos actualizar esta Política de Privacidad. La versión vigente estará disponible en la aplicación. Le recomendamos revisarla periódicamente.</p>

  <h2>10. Contacto</h2>
  <p>Consultas sobre privacidad: <a href="mailto:${supportEmail}">${supportEmail}</a></p>
</body>
</html>`;
}

fs.mkdirSync(outDir, { recursive: true });

brands.forEach((brand) => {
  fs.writeFileSync(path.join(outDir, `${brand.id}_tyc.html`), tycHtml(brand), 'utf8');
  fs.writeFileSync(path.join(outDir, `${brand.id}_privacy.html`), privacyHtml(brand), 'utf8');
  console.log(`Generated: ${brand.id}_tyc.html, ${brand.id}_privacy.html`);
});

console.log(`Done. ${brands.length * 2} files in ${outDir}`);
