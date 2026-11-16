-- Correo de recuperacion de clave del panel, editable desde el panel (Textos). Variable: {{token}} (el codigo de 12 caracteres).
-- Con el estilo del pie de pagina (tabla, Arial 16px, fondo blanco) y el pie compartido PIE_CORREO al final (lo agrega el sistema).
-- Repetible: INSERT IGNORE no pisa un texto ya existente ni sus ediciones. Si se desactiva o se borra, el sistema envia el mensaje fijo de siempre.
-- NO EJECUTADO en produccion.
INSERT IGNORE INTO textos (clave, canal, formato, nombre, asunto, cuerpo, actualizado_por, actualizado_en) VALUES
('RECUPERAR_CLAVE_PANEL', 'email', 'html', 'Recuperar contraseña del panel (correo)', 'Confirmacion TuID',
'<table style="width:94%;max-width:600px;border:none;border-spacing:0;text-align:left;font-family:Arial,sans-serif;font-size:16px;line-height:22px;color:#363636;">
  <tr>
    <td style="padding:20px 0px;background-color:#ffffff;">
      <p>Está recibiendo este email porque usted (o alguien más) pidió un cambio de contraseña para su cuenta.</p>
      <p>Por favor ingrese el siguiente token y su nueva contraseña para completar el proceso:</p>
      <p style="font-size:22px;letter-spacing:2px;"><strong>{{token}}</strong></p>
      <p>Si usted no solicitó esto, por favor ignore este email y su contraseña permanecerá sin cambios.</p>
    </td>
  </tr>
</table>', 'migracion', NOW());

-- Deshacer: DELETE FROM textos WHERE clave = 'RECUPERAR_CLAVE_PANEL';
