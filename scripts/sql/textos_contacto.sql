-- GENERADO por scripts/generar-textos-contacto.js: respuestas automaticas de Contacto (correo, formato html). Se pueden editar desde el panel (Textos).
-- Si el texto esta desactivado o no existe, el sistema usa el archivo html/mails/auto_response/<codigo>.ejs.
INSERT IGNORE INTO textos (clave, canal, formato, nombre, asunto, cuerpo, actualizado_por, actualizado_en) VALUES
('CONTACTO_100', 'email', 'html', 'Respuesta a Contacto 100 - Solicito Ayuda modo de uso', NULL, '<p>Estimad@ <strong>{{nombre}}</strong> ,</p>

<p>Para utilizar la aplicaci&oacute;n Movil <strong>TuID Vida</strong> le detallo los pasos a seguir.</p>

<p>Instalar la aplicaci&oacute;n <strong>TuID Vida</strong> desde:</p>

<table border="0" cellspacing="0" cellpadding="0">
  <tbody> 
    <tr>
      <td width="150" rowspan="2" valign="top"><p></p>
          <p><strong> </strong></p></td>
      <td width="132" valign="top"><p><strong><a href="https://bit.ly/2wUxl9V" target="_blank" rel="noopener noreferrer"><img src="https://tuid.ar/images/logos/play-store-3.jpg" alt="play-store-3" width="150" border="0" /></a></strong><strong> </strong></p></td>
      <td width="275" align="left" valign="middle"><p> <a href="https://bit.ly/2wUxl9V" style="margin-left:20px" target="_blank" rel="noopener noreferrer">https://bit.ly/2wUxl9V </a></p></td>
    </tr>
    <tr>
      <td width="132" valign="top"><p><strong><a href="https://apple.co/2QgPyFq" target="_blank" rel="noopener noreferrer"><img src="https://tuid.ar/images/logos/play-store-2.jpg" alt="play-store-2" width="150" border="0" /></a></strong></p></td>
      <td width="275" align="left" valign="middle"><p> <a href="https://apple.co/2QgPyFq" style="margin-left:20px" target="_blank" rel="noopener noreferrer">https://apple.co/2QgPyFq</a></p></td>
    </tr>
  </tbody>
</table>


<p>Ver <strong>video con instrucciones</strong>:  <a href="https://tuid.ar/ayudatv">https://tuid.ar/ayudatv </a> </p>

<p>Ante cualquier inconveniente con la registraci&oacute;n o con el uso. Se recomienda utilizar el <strong>Formulario de Contacto</strong> que se encuentra en la aplicaci&oacute;n o al <strong>WhatsApp +54911 2344-3283</strong>. Toda consulta ser&aacute; respondida en el d&iacute;a de lunes a viernes o primer d&iacute;a h&aacute;bil. </p>

<p><strong>Si su Movil no es compatible</strong> podr&aacute; utilizar <strong>cualquier dispositivo</strong> que tenga instalado <strong>TuID Vida</strong>. No es necesario que sea personal. Puede ser de familiar, amigo o un asistente.</p>
<p>Una vez instalada la aplicaci&oacute;n. Debe proceder de la siguiente forma:</p>

<p><strong>Proceso de Registraci&oacute;n:</strong></p>
<ul type="disc">
  <li><strong>Proceso 1</strong> Solicitamos se realice <strong>Escaneo de Frente del DNI</strong>.</li>

<p>Sugerimos que este proceso se realice en un espacio con buena iluminaci&oacute;n. En caso de no ser posible la aplicaci&oacute;n cuenta con flash. Esta funci&oacute;n se debe habilitar de ser necesario. </p>
<p>Centrar el DNI en el recuadro que aparece en pantalla. La captura se realiza en forma autom&aacute;tica al hacer foco.</p>

  <li><strong>Proceso 2</strong> Luego girar el DNI y se <strong>Escanea el Dorso</strong></li>

<p>Girar el DNI cuando la imagen en pantalla lo indique. Centrar el DNI como en el proceso anterior. </p>

  <li><strong>Proceso 3</strong> Solicitamos al usurario que se tome una <strong>Selfie</strong></li>

<p>Luego deber&aacute; tomarse una Selfie (autofoto) con buena iluminaci&oacute;n. Esta se rea realiza en forma autom&aacute;tica mediante detecci&oacute;n de Parpadeos / Pesta&ntilde;eos. </p>

  <li><strong>Proceso 4</strong> Comprobaci&oacute;n de datos Biom&eacute;tricos</li>

<p>Si el porcentaje de coincidencia obtenido es superior al 80% la Validaci&oacute;n es considerada exitosa. </p>

  <li><strong>Proceso 5</strong> Validamos Tel&eacute;fono <strong>M&oacute;vil</strong> e <strong>Email</strong></li>

<p>           Como complemento solicitamos el ingreso del Correo Electr&oacute;nico y su N&uacute;mero de M&oacute;vil. </p>
<p>           Se le envira un Codigo  el que deber&aacute; ser ingresado para concluir al Tr&aacute;mite.</p>
<p>           Esta informaci&oacute;n es muy importante ya que nos permitir&aacute; enviarle informaci&oacute;n, notificaciones de su inter&eacute;s y la cerfificacion.</p>
</ul>

<p><strong>Proceso de Autenticaci&oacute;n</strong>:</p>
<ul type="disc">
  <li>Fe de Vida o Supervivencia</li>

<p>Una vez realizado el proceso de registraci&oacute;n. Para dar Fe de Vida <strong>solo ser&aacute; necesario</strong> que desde la aplicaci&oacute;n se saque una <strong>Selfie</strong> (Autofoto) simplemente realizando los movimientos indicados en pantalla. </p>

<p>Para este proceso podr&aacute; utilizar cualquier M&oacute;vil que tenga instalada la aplicaci&oacute;n.</p>
</ul>

<p>Trabajamos para brindarle el servicio que se merece y cuidar su salud evitando que pueda dar cumplimiento con el tramite de <strong>Fe de Vida</strong> sin moverse de su casa.</p>', 'migracion', NOW()),
('CONTACTO_101A', 'email', 'html', 'Respuesta a Contacto 101A - Confirmar Registración o Fe de Vida (falta dar Fe de Vida)', NULL, '<p>Estimad@ <strong>{{nombre}}</strong> ,</p>
	
            <p>Su CUIL {{cuil}} se encuenta registrad@ <strong>satisfactoriamente</strong>.    Debe actualizar su <strong>Fe de Vida</strong> para    este periodo. </p>
            <p>Para realizar el tramite de    Supervivencia debe seguir los siguientes pasos: <strong></strong></p>
			
            <ol>
              <li><strong>  </strong>    A fin de facilitar el uso le recomiendo <strong>habilitar    las instrucciones por medio de audio</strong> al inicio de la soluci&oacute;n.</li>
              <li>     Ingresar en el <strong>boton Fe de Vida</strong> </li>
              <li>                            Ingresar <strong>Numero de DNI</strong> y    Seleccionar <strong>Sexo</strong> (Tenga la    precausion de <strong>seleccionar    correctamente</strong> el <strong>Genero</strong>)</li>
              <li>     Sacarse una <strong>Selfie</strong> realizando <strong>3 pesta&ntilde;eos</strong>. (Si tierne dificultades    para pesta&ntilde;ear puede abrir y cerar los ojos. Esperando que el conteo del    audio le guie)</li>
             
            </ol>
            <p>Si tiene dudas puede<strong> ver las instrucciones en video </strong><a href="https://tuid.ar/ayudafv">https://tuid.ar/ayudafv </a> </p>
          <p><strong> </strong>Cualquier duda o inquietud puede comunicarse mediante el <strong>formulario de contacto</strong> de la    aplicaci&oacute;n o al <strong>WhatsApp    +54911 2344-3283</strong></p>
          <p>Antes de dar<strong> Fe de Vida </strong>tenga en cuenta:<strong></strong></p>
  
          <ul type="disc">
              <li>A fin de facilitar el uso a aquellas personas con <strong>problemas de visi&oacute;n</strong> puede         habilitar las instrucciones por medio de <strong>audio</strong> al inicio de la soluci&oacute;n.</li>
          </ul>
      
          <ul type="disc">
              <li>Alerta Rojo en barra inferior &ldquo;<strong>No         se detecta Rostro</strong>&rdquo;. Se debe a iluminaci&oacute;n insuficiente o sombras en el rostro.         Trate siempre de colocar el m&oacute;vil a la altura de los ojos.</li>
          </ul>
    
          <ul type="disc">
              <li>Durante el proceso de Registraci&oacute;n o Fe de Vida debe tener la         precauci&oacute;n que en el momento de tomarse una Selfie que la c&aacute;mara tome solamente su rostro.         Si detecta m&aacute;s de un rostro, aunque sea una fotograf&iacute;a de fondo         aparecer&aacute; un alerta roja en la barra inferior y se reiniciara el conteo         de movimientos. Deber&aacute; iniciar nuevamente la cuenta de movimientos.</li>
          </ul>

          <p>Si tiene dudas si su Certificaci&oacute;n ha sido exitosa <strong>puede controlar sus certificaciones</strong> consultando en el <strong>Men&uacute;</strong> de la    aplicaci&oacute;n, la opci&oacute;n <strong>Historial</strong>. De haber sido exitosa la certificaci&oacute;n y dio de    alta un Correo Electronico deber&aacute; <strong>recibir por Email</strong> una notificaci&oacute;n.</p>

          
          El <strong>Codigo</strong> que se le envia es para validar el email o el m&oacute;vil de esta forma <strong> verificar que el dato de contacto</strong> se haya ingresado correctamente. <strong>No valida la Fe de Vida</strong>. El mismo puede llegar a    demorar todo depende de la compa&ntilde;&iacute;a telefonica o del trafico de internet. Si    se encuentra en el exterior no lo recibira el codigo de validacion telefonico,    ya que no esta habilitado para trafico internacional.<strong></strong>
          <p>Ante cualquier inconveniente con la registraci&oacute;n o con el    uso. Se recomienda utilizar el <strong>Formulario    de Contacto</strong> que se encuentra en la aplicaci&oacute;n. Toda consulta ser&aacute;    respondida en el d&iacute;a de lunes a viernes o primer d&iacute;a h&aacute;bil. </p>', 'migracion', NOW()),
('CONTACTO_101B', 'email', 'html', 'Respuesta a Contacto 101B - Confirmar Registración o Fe de Vida (Fe de Vida satisfactoria)', NULL, '<p><strong>Asunto: </strong>Fe de Vida Satisfactoria</p>

<p><span lang="es">Estimad@  </span><span lang="es"> {{nombre}},</span></p>

<p><span lang="es">Su CUIL {{cuil}} ha registrado y dado <strong>Fe de Vida</strong> satisfactoriamente.</span> </p>

<p>Si tiene dudas si su Certificaci&oacute;n ha sido exitosa puede controlar sus certificaciones consultando en el <strong>Men&uacute;</strong> de la aplicaci&oacute;n la opci&oacute;n <strong>Historial</strong>. De haber sido exitosa la certificaci&oacute;n figurara alli el registro indicando fecha y hora ademas deber&aacute; recibir por Email una notificaci&oacute;n.</p>

<p>Si figura el registro en la aplicaci&oacute;n <strong><u>no es necesario que notifique su realizacion</u></strong>. </p>

<p>El <strong>Codigo</strong> que se le envia es para validar el email o el celular y es <strong>para verificar el dato de contacto</strong> se haya ingresado correctamente. No la Fe de Vida. El mismo puede llegar a demorar todo depende de la compa&ntilde;&iacute;a telefonica o del trafico de internet. Si se encuentra en el exterior no lo recibira el codigo de validacion telefonico, ya que no esta habilitado para trafico internacional.<strong></strong></p>

<p>Es importante que tenga los datos de contacto actualizados. Brindar el <strong>Email</strong> nos permitir&aacute; enviarles las certificaciones y el n&uacute;mero de <strong>M&oacute;vil</strong>, notificaciones, recordatorios y comunicaciones de su inter&eacute;s.</p>

<p><span lang="es">Trabajamos para brindarle el servicio que se merece y cuidar su salud evitando que pueda dar cumplimiento con el tramite de <strong>Fe de Vida</strong> sin moverse de su casa.</span></p>

<p><span lang="es">Gracias por su tiempo y por utilizar <strong>TuID Vida</strong>. Cualquier duda o inquietud puede comunicarse mediante el formulario de contacto de la aplicaci&oacute;n.</span></p>

<table border="0" cellpadding="0" width="100%">
  <tbody>
    <tr>
      <td colspan="2"></td></tr></tbody></table>', 'migracion', NOW()),
('CONTACTO_101C', 'email', 'html', 'Respuesta a Contacto 101C - Confirmar Registración o Fe de Vida (usuario no registrado)', NULL, '<p>Estimad@ <strong>{{nombre}}</strong> ,</p>

<p>Segun nuestros registros el CUIL {{cuil}} no se encuentra registrado. Por favor, verifique que nos haya informado correctamente el número de CUIL.</p>
<p>Para utilizar la aplicaci&oacute;n Movil <strong>TuID Vida</strong> le detallo los pasos a seguir.</p>

<p>Instalar la aplicaci&oacute;n <strong>TuID Vida</strong> desde:</p>

<table border="0" cellspacing="0" cellpadding="0">
  <tbody> 
    <tr>
      <td width="150" rowspan="2" valign="top"><p></p>
          <p><strong> </strong></p></td>
      <td width="132" valign="top"><p><strong><a href="https://bit.ly/2wUxl9V" target="_blank" rel="noopener noreferrer"><img src="https://tuid.ar/images/logos/play-store-3.jpg" alt="play-store-3" width="150" border="0" /></a></strong><strong> </strong></p></td>
      <td width="275" align="left" valign="middle"><p> <a href="https://bit.ly/2wUxl9V" style="margin-left:20px" target="_blank" rel="noopener noreferrer">https://bit.ly/2wUxl9V </a></p></td>
    </tr>
    <tr>
      <td width="132" valign="top"><p><strong><a href="https://apple.co/2QgPyFq" target="_blank" rel="noopener noreferrer"><img src="https://tuid.ar/images/logos/play-store-2.jpg" alt="play-store-2" width="150" border="0" /></a></strong></p></td>
      <td width="275" align="left" valign="middle"><p> <a href="https://apple.co/2QgPyFq" style="margin-left:20px" target="_blank" rel="noopener noreferrer">https://apple.co/2QgPyFq</a></p></td>
    </tr>
  </tbody>
</table>


<p>Ver <strong>video con instrucciones</strong>:  <a href="https://tuid.ar/ayudatv">https://tuid.ar/ayudatv </a> </p>

<p>Ante cualquier inconveniente con la registraci&oacute;n o con el uso. Se recomienda utilizar el <strong>Formulario de Contacto</strong> que se encuentra en la aplicaci&oacute;n o al <strong>WhatsApp +54911 2344-3283</strong>. Toda consulta ser&aacute; respondida en el d&iacute;a de lunes a viernes o primer d&iacute;a h&aacute;bil. </p>

<p><strong>Si su Movil no es compatible</strong> podr&aacute; utilizar <strong>cualquier dispositivo</strong> que tenga instalado <strong>TuID Vida</strong>. No es necesario que sea personal. Puede ser de familiar, amigo o un asistente.</p>
<p>Una vez instalada la aplicaci&oacute;n. Debe proceder de la siguiente forma:</p>

<p><strong>Proceso de Registraci&oacute;n:</strong></p>
<ul type="disc">
  <li><strong>Proceso 1</strong> Solicitamos se realice <strong>Escaneo de Frente del DNI</strong>.</li>

<p>Sugerimos que este proceso se realice en un espacio con buena iluminaci&oacute;n. En caso de no ser posible la aplicaci&oacute;n cuenta con flash. Esta funci&oacute;n se debe habilitar de ser necesario. </p>
<p>Centrar el DNI en el recuadro que aparece en pantalla. La captura se realiza en forma autom&aacute;tica al hacer foco.</p>

  <li><strong>Proceso 2</strong> Luego girar el DNI y se <strong>Escanea el Dorso</strong></li>

<p>Girar el DNI cuando la imagen en pantalla lo indique. Centrar el DNI como en el proceso anterior. </p>

  <li><strong>Proceso 3</strong> Solicitamos al usurario que se tome una <strong>Selfie</strong></li>

<p>Luego deber&aacute; tomarse una Selfie (autofoto) con buena iluminaci&oacute;n. Esta se rea realiza en forma autom&aacute;tica mediante detecci&oacute;n de Parpadeos / Pesta&ntilde;eos. </p>

  <li><strong>Proceso 4</strong> Comprobaci&oacute;n de datos Biom&eacute;tricos</li>

<p>Si el porcentaje de coincidencia obtenido es superior al 80% la Validaci&oacute;n es considerada exitosa. </p>

  <li><strong>Proceso 5</strong> Validamos Tel&eacute;fono <strong>M&oacute;vil</strong> e <strong>Email</strong></li>

<p>           Como complemento solicitamos el ingreso del Correo Electr&oacute;nico y su N&uacute;mero de M&oacute;vil. </p>
<p>           Se le envira un Codigo  el que deber&aacute; ser ingresado para concluir al Tr&aacute;mite.</p>
<p>           Esta informaci&oacute;n es muy importante ya que nos permitir&aacute; enviarle informaci&oacute;n, notificaciones de su inter&eacute;s y la cerfificacion.</p>
</ul>

<p><strong>Proceso de Autenticaci&oacute;n</strong>:</p>
<ul type="disc">
  <li>Fe de Vida o Supervivencia</li>

<p>Una vez realizado el proceso de registraci&oacute;n. Para dar Fe de Vida <strong>solo ser&aacute; necesario</strong> que desde la aplicaci&oacute;n se saque una <strong>Selfie</strong> (Autofoto) simplemente realizando los movimientos indicados en pantalla. </p>

<p>Para este proceso podr&aacute; utilizar cualquier M&oacute;vil que tenga instalada la aplicaci&oacute;n.</p>
</ul>

<p>Trabajamos para brindarle el servicio que se merece y cuidar su salud evitando que pueda dar cumplimiento con el tramite de <strong>Fe de Vida</strong> sin moverse de su casa.</p>', 'migracion', NOW()),
('CONTACTO_101D', 'email', 'html', 'Respuesta a Contacto 101D - Confirmar Registración o Fe de Vida (entidad no adherida)', NULL, '<p>Estimad@ <strong> {{nombre}}</strong> ,</p>
CUIL: {{cuil}}

<p>Gracias por utilizar <strong>TuID Vida</strong>. Pero lamentablemente <strong>su entidad aun no est&aacute; adherida al sistema</strong>. Si le pareci&oacute; &uacute;til manifieste a su entidad su interes <strong></strong>.</p>
<p>Recuerde que por el momento deber&aacute; acreditar su <strong>Fe de Vida</strong> por los <strong>canales habituales</strong>.</p>
<p>Gracias por su tiempo. Cualquier duda o inquietud puede comunicarse mediante el <strong>Formulario de Contacto</strong> de la aplicaci&oacute;n o por <strong>Whatsapp </strong><strong>+54911 2344-3283 </strong>para mayor rapidez. </p>', 'migracion', NOW()),
('CONTACTO_101E', 'email', 'html', 'Respuesta a Contacto 101E - Confirmar Registración o Fe de Vida (fuera de término)', NULL, '<p><strong>Asunto: </strong>Fe de Vida Satisfactoria pero fuera de la fecha estipulada</p>

<p><span lang="es">Estimad@  </span><span lang="es"> {{nombre}},</span></p>

<p><span lang="es">Su CUIL {{cuil}} ha registrado y dado <strong>Fe de Vida</strong> satisfactoriamente aunque fuera
  del limite estipulado.</span> </p>

<p>Si no le han acreditado el beneficio previsional es por no haber realizado dicha certificacion dentro de los terminos establecidos.<strong><u> Ante cualquier inquietud contactese con su entidad pagadora.</u></strong>  </p>

<p>De todos modos si tiene alguna inquietud con respecto a sus haberes le sugerimos contactarse con su entidad pagadora a fin de informarse al respecto.</p>

<p>Es importante que tenga los datos de contacto actualizados. Brindar el <strong>Email</strong> nos permitir&aacute; enviarles las certificaciones y el n&uacute;mero de <strong>M&oacute;vil</strong>, notificaciones, recordatorios y comunicaciones de su inter&eacute;s.</p>

<p><span lang="es">Trabajamos para brindarle el servicio que se merece y cuidar su salud evitando que pueda dar cumplimiento con el tramite de <strong>Fe de Vida</strong> sin moverse de su casa.</span></p>

<p><span lang="es">Gracias por su tiempo y por utilizar <strong>TuID Vida</strong>. Cualquier duda o inquietud puede comunicarse mediante el formulario de contacto de la aplicaci&oacute;n.</span></p>

<table border="0" cellpadding="0" width="100%">
  <tbody>
    <tr>
      <td colspan="2"></td></tr></tbody></table>', 'migracion', NOW()),
('CONTACTO_102A', 'email', 'html', 'Respuesta a Contacto 102A - Quiero saber si mi Fe de Vida está Vigente (falta dar Fe de Vida)', NULL, '<p>Estimad@ <strong>{{nombre}}</strong> ,</p>
  CUIL {{cuil}}
  
    <p>Usted se encuenta registrad@ <strong>satisfactoriamente</strong>. Debe actualizar su <strong>Fe de Vida</strong> para este periodo. Siga los siguientes pasos.<u></u></p>
  
    <p>Para realizar el tramite de Supervivencia debe ingresar en el boton <strong>Fe de Vida</strong> <strong></strong></p>

    <ol>
    <li> A fin de facilitar el uso le recomiendo <strong>habilitar las instrucciones por medio de audio</strong> al inicio de la soluci&oacute;n.</li>
    <li> Ingresar en el <strong>boton Fe de Vida</strong> </li>
    <li> Ingresar <strong>Numero de DNI</strong> y Seleccionar <strong>Sexo</strong> (Tenga la precausion de <strong>seleccionar correctamente</strong> el <strong>Genero</strong>)</li>
    <li> Sacarse una <strong>Selfie</strong> realizando <strong>3 pesta&ntilde;eos</strong>. (Si tierne dificultades para pesta&ntilde;ear puede abrir y cerar los ojos. Esperando que el conteo del audio le guie.</li>
    </ol>
    <p>Si tiene dudas puede<strong> ver las instrucciones en video </strong><a href="https://tuid.ar/ayudafv">https://tuid.ar/ayudafv </a></p>

    <p>Cualquier duda o inquietud puede comunicarse mediante el <strong>formulario de contacto</strong> de la aplicaci&oacute;n o al <strong>WhatsApp +54911 2344-3283</strong></p>
    
    <p>Antes de dar<strong> Fe de Vida </strong>tenga en cuenta:<strong></strong></p>

    <ul type="disc">
    <li>  A fin de facilitar el uso a aquellas personas con <strong>problemas de visi&oacute;n</strong> puede habilitar las instrucciones por medio de <strong>audio</strong> al inicio de la soluci&oacute;n.</li>
    </ul>
    <ul type="disc">
    <li>  Alerta Rojo en barra inferior &ldquo;<strong>No se detecta Rostro</strong>&rdquo;. Se debe a iluminaci&oacute;n insuficiente o sombras en el rostro. Trate siempre de colocar el m&oacute;vil a la altura de los ojos.</li>
    </ul>
    <ul type="disc">
    <li>  Durante el proceso de Registraci&oacute;n o Fe de Vida debe tener la precauci&oacute;n que en el momento de tomarse una Selfie que la c&aacute;mara tome solamente su rostro. Si detecta m&aacute;s de un rostro, aunque sea una fotograf&iacute;a de fondo aparecer&aacute; un alerta roja en la barra inferior y se reiniciara el conteo de movimientos. Deber&aacute; iniciar nuevamente la cuenta de movimientos.</li>
    </ul>
    <p>Si tiene dudas si su Certificaci&oacute;n ha sido exitosa <strong>puede controlar sus certificaciones</strong> consultando en el <strong>Men&uacute;</strong> de la aplicaci&oacute;n, la opci&oacute;n <strong>Historial</strong>. De haber sido exitosa la certificaci&oacute;n y dio de alta un Correo Electronico deber&aacute; <strong>recibir por Email</strong> una notificaci&oacute;n.</p>
    
El <strong>Codigo</strong> que se le envia es para validar el email o el m&oacute;vil de esta forma <strong>verificar que el dato de contacto</strong> se haya ingresado correctamente. <strong>No valida la Fe de Vida</strong>. El mismo puede llegar a demorar todo depende de la compa&ntilde;&iacute;a telefonica o del trafico de internet. Si se encuentra en el exterior no lo recibira el codigo de validacion telefonico, ya que no esta habilitado para trafico internacional.<strong></strong>
<p>Ante cualquier inconveniente con la registraci&oacute;n o con el uso. Se recomienda utilizar el <strong>Formulario de Contacto</strong> que se encuentra en la aplicaci&oacute;n. Toda consulta ser&aacute; respondida en el d&iacute;a de lunes a viernes o primer d&iacute;a h&aacute;bil. </p>', 'migracion', NOW()),
('CONTACTO_102B', 'email', 'html', 'Respuesta a Contacto 102B - Quiero saber si mi Fe de Vida está Vigente (Fe de Vida satisfactoria)', NULL, '<p><strong>Asunto: </strong>Fe de Vida Satisfactoria</p>
<p><strong>CUIL: </strong>{{cuil}}</p>

<p><span lang="es">Estimad@  </span><span lang="es"> {{nombre}},</span></p>

<p><span lang="es">Se ha registrado y dado <strong>Fe de Vida</strong> satisfactoriamente.</span> </p>

<p>Si tiene dudas si su Certificaci&oacute;n ha sido exitosa puede controlar sus certificaciones consultando en el <strong>Men&uacute;</strong> de la aplicaci&oacute;n la opci&oacute;n <strong>Historial</strong>. De haber sido exitosa la certificaci&oacute;n figurara alli el registro indicando fecha y hora ademas deber&aacute; recibir por Email una notificaci&oacute;n.</p>

<p>Si figura el registro en la aplicaci&oacute;n <strong><u>no es necesario que notifique su realizacion</u></strong>. </p>

<p>El <strong>Codigo</strong> que se le envia es para validar el email o el celular y es <strong>para verificar el dato de contacto</strong> se haya ingresado correctamente. No la Fe de Vida. El mismo puede llegar a demorar todo depende de la compa&ntilde;&iacute;a telefonica o del trafico de internet. Si se encuentra en el exterior no lo recibira el codigo de validacion telefonico, ya que no esta habilitado para trafico internacional.<strong></strong></p>

<p>Es importante que tenga los datos de contacto actualizados. Brindar el <strong>Email</strong> nos permitir&aacute; enviarles las certificaciones y el n&uacute;mero de <strong>M&oacute;vil</strong>, notificaciones, recordatorios y comunicaciones de su inter&eacute;s.</p>

<p><span lang="es">Trabajamos para brindarle el servicio que se merece y cuidar su salud evitando que pueda dar cumplimiento con el tramite de <strong>Fe de Vida</strong> sin moverse de su casa.</span></p>

<p><span lang="es">Gracias por su tiempo y por utilizar <strong>TuID Vida</strong>. Cualquier duda o inquietud puede comunicarse mediante el formulario de contacto de la aplicaci&oacute;n.</span></p>

<table border="0" cellpadding="0" width="100%">
  <tbody>
    <tr>
      <td colspan="2"></td></tr></tbody></table>', 'migracion', NOW()),
('CONTACTO_102C', 'email', 'html', 'Respuesta a Contacto 102C - Quiero saber si mi Fe de Vida está Vigente (usuario no registrado)', NULL, '<p>Estimad@ <strong>{{nombre}}</strong> ,</p>

<p>Segun nuestros registros el CUIL {{cuil}} no se encuentra registrado. Por favor, verifique que nos haya informado correctamente el número de CUIL.</p>
<p>Para utilizar la aplicaci&oacute;n Movil <strong>TuID Vida</strong> le detallo los pasos a seguir.</p>

<p>Instalar la aplicaci&oacute;n <strong>TuID Vida</strong> desde:</p>

<table border="0" cellspacing="0" cellpadding="0">
  <tbody> 
    <tr>
      <td width="150" rowspan="2" valign="top"><p></p>
          <p><strong> </strong></p></td>
      <td width="132" valign="top"><p><strong><a href="https://bit.ly/2wUxl9V" target="_blank" rel="noopener noreferrer"><img src="https://tuid.ar/images/logos/play-store-3.jpg" alt="play-store-3" width="150" border="0" /></a></strong><strong> </strong></p></td>
      <td width="275" align="left" valign="middle"><p> <a href="https://bit.ly/2wUxl9V" style="margin-left:20px" target="_blank" rel="noopener noreferrer">https://bit.ly/2wUxl9V </a></p></td>
    </tr>
    <tr>
      <td width="132" valign="top"><p><strong><a href="https://apple.co/2QgPyFq" target="_blank" rel="noopener noreferrer"><img src="https://tuid.ar/images/logos/play-store-2.jpg" alt="play-store-2" width="150" border="0" /></a></strong></p></td>
      <td width="275" align="left" valign="middle"><p> <a href="https://apple.co/2QgPyFq" style="margin-left:20px" target="_blank" rel="noopener noreferrer">https://apple.co/2QgPyFq</a></p></td>
    </tr>
  </tbody>
</table>


<p>Ver <strong>video con instrucciones</strong>:  <a href="https://tuid.ar/ayudatv">https://tuid.ar/ayudatv </a> </p>

<p>Ante cualquier inconveniente con la registraci&oacute;n o con el uso. Se recomienda utilizar el <strong>Formulario de Contacto</strong> que se encuentra en la aplicaci&oacute;n o al <strong>WhatsApp +54911 2344-3283</strong>. Toda consulta ser&aacute; respondida en el d&iacute;a de lunes a viernes o primer d&iacute;a h&aacute;bil. </p>

<p><strong>Si su Movil no es compatible</strong> podr&aacute; utilizar <strong>cualquier dispositivo</strong> que tenga instalado <strong>TuID Vida</strong>. No es necesario que sea personal. Puede ser de familiar, amigo o un asistente.</p>
<p>Una vez instalada la aplicaci&oacute;n. Debe proceder de la siguiente forma:</p>

<p><strong>Proceso de Registraci&oacute;n:</strong></p>
<ul type="disc">
  <li><strong>Proceso 1</strong> Solicitamos se realice <strong>Escaneo de Frente del DNI</strong>.</li>

<p>Sugerimos que este proceso se realice en un espacio con buena iluminaci&oacute;n. En caso de no ser posible la aplicaci&oacute;n cuenta con flash. Esta funci&oacute;n se debe habilitar de ser necesario. </p>
<p>Centrar el DNI en el recuadro que aparece en pantalla. La captura se realiza en forma autom&aacute;tica al hacer foco.</p>

  <li><strong>Proceso 2</strong> Luego girar el DNI y se <strong>Escanea el Dorso</strong></li>

<p>Girar el DNI cuando la imagen en pantalla lo indique. Centrar el DNI como en el proceso anterior. </p>

  <li><strong>Proceso 3</strong> Solicitamos al usurario que se tome una <strong>Selfie</strong></li>

<p>Luego deber&aacute; tomarse una Selfie (autofoto) con buena iluminaci&oacute;n. Esta se rea realiza en forma autom&aacute;tica mediante detecci&oacute;n de Parpadeos / Pesta&ntilde;eos. </p>

  <li><strong>Proceso 4</strong> Comprobaci&oacute;n de datos Biom&eacute;tricos</li>

<p>Si el porcentaje de coincidencia obtenido es superior al 80% la Validaci&oacute;n es considerada exitosa. </p>

  <li><strong>Proceso 5</strong> Validamos Tel&eacute;fono <strong>M&oacute;vil</strong> e <strong>Email</strong></li>

<p>           Como complemento solicitamos el ingreso del Correo Electr&oacute;nico y su N&uacute;mero de M&oacute;vil. </p>
<p>           Se le envira un Codigo  el que deber&aacute; ser ingresado para concluir al Tr&aacute;mite.</p>
<p>           Esta informaci&oacute;n es muy importante ya que nos permitir&aacute; enviarle informaci&oacute;n, notificaciones de su inter&eacute;s y la cerfificacion.</p>
</ul>

<p><strong>Proceso de Autenticaci&oacute;n</strong>:</p>
<ul type="disc">
  <li>Fe de Vida o Supervivencia</li>

<p>Una vez realizado el proceso de registraci&oacute;n. Para dar Fe de Vida <strong>solo ser&aacute; necesario</strong> que desde la aplicaci&oacute;n se saque una <strong>Selfie</strong> (Autofoto) simplemente realizando los movimientos indicados en pantalla. </p>

<p>Para este proceso podr&aacute; utilizar cualquier M&oacute;vil que tenga instalada la aplicaci&oacute;n.</p>
</ul>

<p>Trabajamos para brindarle el servicio que se merece y cuidar su salud evitando que pueda dar cumplimiento con el tramite de <strong>Fe de Vida</strong> sin moverse de su casa.</p>', 'migracion', NOW()),
('CONTACTO_102D', 'email', 'html', 'Respuesta a Contacto 102D - Quiero saber si mi Fe de Vida está Vigente (entidad no adherida)', NULL, '<p>Estimad@ <strong>{{nombre}}</strong> ,</p>
CUIL {{cuil}}

<p>Gracias por utilizar <strong>TuID Vida</strong>. Pero lamentablemente <strong>su entidad aun no est&aacute; adherida al sistema</strong>. Si le pareci&oacute; &uacute;til manifieste a su entidad su interes <strong></strong>.</p>
<p>Recuerde que por el momento deber&aacute; acreditar su <strong>Fe de Vida</strong> por los <strong>canales habituales</strong>.</p>
<p>Gracias por su tiempo. Cualquier duda o inquietud puede comunicarse mediante el <strong>Formulario de Contacto</strong> de la aplicaci&oacute;n o por <strong>Whatsapp </strong><strong>+54911 2344-3283 </strong>para mayor rapidez. </p>', 'migracion', NOW()),
('CONTACTO_102E', 'email', 'html', 'Respuesta a Contacto 102E - Quiero saber si mi Fe de Vida está Vigente (fuera de término)', NULL, '<p><strong>Asunto: </strong>Fe de Vida Satisfactoria pero fuera de la fecha estipulada</p>

<p><span lang="es">Estimad@  </span><span lang="es"> {{nombre}},</span></p>

<p><span lang="es">Su CUIL {{cuil}} ha registrado y dado <strong>Fe de Vida</strong> satisfactoriamente aunque fuera
  del limite estipulado.</span> </p>

<p>Si no le han acreditado el beneficio previsional es por no haber realizado dicha certificacion dentro de los terminos establecidos.<strong><u> Ante cualquier inquietud contactese con su entidad pagadora.</u></strong></p>

<p>De todos modos si tiene alguna inquietud con respecto a sus haberes le sugerimos contactarse con su entidad pagadora a fin de informarse al respecto.</p>

<p>Es importante que tenga los datos de contacto actualizados. Brindar el <strong>Email</strong> nos permitir&aacute; enviarles las certificaciones y el n&uacute;mero de <strong>M&oacute;vil</strong>, notificaciones, recordatorios y comunicaciones de su inter&eacute;s.</p>

<p><span lang="es">Trabajamos para brindarle el servicio que se merece y cuidar su salud evitando que pueda dar cumplimiento con el tramite de <strong>Fe de Vida</strong> sin moverse de su casa.</span></p>

<p><span lang="es">Gracias por su tiempo y por utilizar <strong>TuID Vida</strong>. Cualquier duda o inquietud puede comunicarse mediante el formulario de contacto de la aplicaci&oacute;n.</span></p>

<table border="0" cellpadding="0" width="100%">
  <tbody>
    <tr>
      <td colspan="2"></td></tr></tbody></table>', 'migracion', NOW()),
('CONTACTO_103', 'email', 'html', 'Respuesta a Contacto 103 - Tengo dificultades con el Escaneo', NULL, '<p>Estimad@ <strong>{{nombre}}</strong> ,</p>
CUIL {{cuil}}

<p>Lamentamos el contratiempo. Nos informa que tiene <strong>dificultades con el escaneo</strong>.  Puede consultar en nuestro sitio web haciendo click en   <a href="https://tuid.ar/productos/tuid-vida/preguntas-frecuentes-fe-de-vida"><strong>Ayuda</strong> </a>. Encontrara las Preguntas Frecuentes que nos realizan otros usuarios.</p>

<p>Si consultada la ayuda continua sin poder resolver su problema proceda de la siguiente manera:</p>

<p>El problema que nos manifiesta normalmente se da porque la fotografia del DNI es muy oscura o el holograma que esta sobre la foto la hace ilegible para el sistema e impide que se realice el escaneo.</p>

<p>Para poder ayudarle solicitamos que nos env&iacute;e:</p>
<ol start="1" type="1">
  <li>Foto de <strong>Frente</strong> y <strong>Dorso</strong> del <strong>DNI</strong> lo <u>m&aacute;s legible posible</u>. Si su DNI es del modelo anterior y cuenta con la libreta Celeste por favor enviar las im&aacute;genes de este documento ya que la fotografia suele estar de mejor calidad.</li>
</ol>

<ol start="2" type="1">
  <li>Una Selfie o Foto de frente. Sin anteojos. La camara debe estar a la altura de los ojos. Como si fuera una foto carnet.</li>
</ol>

<p>De esta forma intentaremos dar de alta manualmente.</p>

<p>Cualquier consulta o inquietud no dude en consultarnos por <strong>Whatsapp </strong><strong>+54911 2344-3283 </strong>para mayor rapidez. Tambien puede enviar las im&aacute;genes solicitadas por este medio.</p>', 'migracion', NOW()),
('CONTACTO_104A', 'email', 'html', 'Respuesta a Contacto 104A - Envío de Código de validación (falta dar Fe de Vida)', NULL, '<p>Estimad@ <strong>{{nombre}}</strong> ,</p>
	
            <p>Su CUIL: {{cuil}} se encuenta registrad@ <strong>satisfactoriamente</strong>.    Debe actualizar su <strong>Fe de Vida</strong> para    este periodo. </p>
            <p>Para realizar el tramite de    Supervivencia debe seguir los siguientes pasos: <strong></strong></p>
			
            <ol>
              <li><strong>  </strong>    A fin de facilitar el uso le recomiendo <strong>habilitar    las instrucciones por medio de audio</strong> al inicio de la soluci&oacute;n.</li>
              <li>     Ingresar en el <strong>boton Fe de Vida</strong> </li>
              <li>                            Ingresar <strong>Numero de DNI</strong> y    Seleccionar <strong>Sexo</strong> (Tenga la    precausion de <strong>seleccionar    correctamente</strong> el <strong>Genero</strong>)</li>
              <li>     Sacarse una <strong>Selfie</strong> realizando <strong>3 pesta&ntilde;eos</strong>. (Si tierne dificultades    para pesta&ntilde;ear puede abrir y cerar los ojos. Esperando que el conteo del    audio le guie)</li>
             
            </ol>
            <p>Si tiene dudas puede<strong> ver las instrucciones en video </strong><a href="https://tuid.ar/ayudafv">https://tuid.ar/ayudafv </a> </p>
          <p><strong> </strong>Cualquier duda o inquietud puede comunicarse mediante el <strong>formulario de contacto</strong> de la    aplicaci&oacute;n o al <strong>WhatsApp    +54911 2344-3283</strong></p>
          <p>Antes de dar<strong> Fe de Vida </strong>tenga en cuenta:<strong></strong></p>
  
          <ul type="disc">
              <li>A fin de facilitar el uso a aquellas personas con <strong>problemas de visi&oacute;n</strong> puede         habilitar las instrucciones por medio de <strong>audio</strong> al inicio de la soluci&oacute;n.</li>
          </ul>
      
          <ul type="disc">
              <li>Alerta Rojo en barra inferior &ldquo;<strong>No         se detecta Rostro</strong>&rdquo;. Se debe a iluminaci&oacute;n insuficiente o sombras en el rostro.         Trate siempre de colocar el m&oacute;vil a la altura de los ojos.</li>
          </ul>
    
          <ul type="disc">
              <li>Durante el proceso de Registraci&oacute;n o Fe de Vida debe tener la         precauci&oacute;n que en el momento de tomarse una Selfie que la c&aacute;mara tome solamente su rostro.         Si detecta m&aacute;s de un rostro, aunque sea una fotograf&iacute;a de fondo         aparecer&aacute; un alerta roja en la barra inferior y se reiniciara el conteo         de movimientos. Deber&aacute; iniciar nuevamente la cuenta de movimientos.</li>
          </ul>

          <p>Si tiene dudas si su Certificaci&oacute;n ha sido exitosa <strong>puede controlar sus certificaciones</strong> consultando en el <strong>Men&uacute;</strong> de la    aplicaci&oacute;n, la opci&oacute;n <strong>Historial</strong>. De haber sido exitosa la certificaci&oacute;n y dio de    alta un Correo Electronico deber&aacute; <strong>recibir por Email</strong> una notificaci&oacute;n.</p>

          
          El <strong>Codigo</strong> que se le envia es para validar el email o el m&oacute;vil de esta forma <strong> verificar que el dato de contacto</strong> se haya ingresado correctamente. <strong>No valida la Fe de Vida</strong>. El mismo puede llegar a    demorar todo depende de la compa&ntilde;&iacute;a telefonica o del trafico de internet. Si    se encuentra en el exterior no lo recibira el codigo de validacion telefonico,    ya que no esta habilitado para trafico internacional.<strong></strong>
          <p>Ante cualquier inconveniente con la registraci&oacute;n o con el    uso. Se recomienda utilizar el <strong>Formulario    de Contacto</strong> que se encuentra en la aplicaci&oacute;n. Toda consulta ser&aacute;    respondida en el d&iacute;a de lunes a viernes o primer d&iacute;a h&aacute;bil. </p>', 'migracion', NOW()),
('CONTACTO_104B', 'email', 'html', 'Respuesta a Contacto 104B - Envío de Código de validación (Fe de Vida satisfactoria)', NULL, '<p><strong>Asunto: </strong>Fe de Vida Satisfactoria</p>

<p><span lang="es">Estimad@  </span><span lang="es"> {{nombre}},</span></p>

<p><span lang="es">Su CUIL {{cuil}} ha registrado y dado <strong>Fe de Vida</strong> satisfactoriamente.</span> </p>

<p>Si tiene dudas si su Certificaci&oacute;n ha sido exitosa puede controlar sus certificaciones consultando en el <strong>Men&uacute;</strong> de la aplicaci&oacute;n la opci&oacute;n <strong>Historial</strong>. De haber sido exitosa la certificaci&oacute;n figurara alli el registro indicando fecha y hora ademas deber&aacute; recibir por Email una notificaci&oacute;n.</p>

<p>Si figura el registro en la aplicaci&oacute;n <strong><u>no es necesario que notifique su realizacion</u></strong>. </p>

<p>El <strong>Codigo</strong> que se le envia es para validar el email o el celular y es <strong>para verificar el dato de contacto</strong> se haya ingresado correctamente. No la Fe de Vida. El mismo puede llegar a demorar todo depende de la compa&ntilde;&iacute;a telefonica o del trafico de internet. Si se encuentra en el exterior no lo recibira el codigo de validacion telefonico, ya que no esta habilitado para trafico internacional.<strong></strong></p>

<p>Es importante que tenga los datos de contacto actualizados. Brindar el <strong>Email</strong> nos permitir&aacute; enviarles las certificaciones y el n&uacute;mero de <strong>M&oacute;vil</strong>, notificaciones, recordatorios y comunicaciones de su inter&eacute;s.</p>

<p><span lang="es">Trabajamos para brindarle el servicio que se merece y cuidar su salud evitando que pueda dar cumplimiento con el tramite de <strong>Fe de Vida</strong> sin moverse de su casa.</span></p>

<p><span lang="es">Gracias por su tiempo y por utilizar <strong>TuID Vida</strong>. Cualquier duda o inquietud puede comunicarse mediante el formulario de contacto de la aplicaci&oacute;n.</span></p>

<table border="0" cellpadding="0" width="100%">
  <tbody>
    <tr>
      <td colspan="2"></td></tr></tbody></table>', 'migracion', NOW()),
('CONTACTO_104C', 'email', 'html', 'Respuesta a Contacto 104C - Envío de Código de validación (usuario no registrado)', NULL, '<p>Estimad@ <strong>{{nombre}}</strong> ,</p>

<p>Segun nuestros registros el CUIL {{cuil}} no se encuentra registrado. Por favor, verifique que nos haya informado correctamente el número de CUIL.</p>
<p>Para utilizar la aplicaci&oacute;n Movil <strong>TuID Vida</strong> le detallo los pasos a seguir.</p>

<p>Instalar la aplicaci&oacute;n <strong>TuID Vida</strong> desde:</p>

<table border="0" cellspacing="0" cellpadding="0">
  <tbody> 
    <tr>
      <td width="150" rowspan="2" valign="top"><p></p>
          <p><strong> </strong></p></td>
      <td width="132" valign="top"><p><strong><a href="https://bit.ly/2wUxl9V" target="_blank" rel="noopener noreferrer"><img src="https://tuid.ar/images/logos/play-store-3.jpg" alt="play-store-3" width="150" border="0" /></a></strong><strong> </strong></p></td>
      <td width="275" align="left" valign="middle"><p> <a href="https://bit.ly/2wUxl9V" style="margin-left:20px" target="_blank" rel="noopener noreferrer">https://bit.ly/2wUxl9V </a></p></td>
    </tr>
    <tr>
      <td width="132" valign="top"><p><strong><a href="https://apple.co/2QgPyFq" target="_blank" rel="noopener noreferrer"><img src="https://tuid.ar/images/logos/play-store-2.jpg" alt="play-store-2" width="150" border="0" /></a></strong></p></td>
      <td width="275" align="left" valign="middle"><p> <a href="https://apple.co/2QgPyFq" style="margin-left:20px" target="_blank" rel="noopener noreferrer">https://apple.co/2QgPyFq</a></p></td>
    </tr>
  </tbody>
</table>


<p>Ver <strong>video con instrucciones</strong>:  <a href="https://tuid.ar/ayudatv">https://tuid.ar/ayudatv </a> </p>

<p>Ante cualquier inconveniente con la registraci&oacute;n o con el uso. Se recomienda utilizar el <strong>Formulario de Contacto</strong> que se encuentra en la aplicaci&oacute;n o al <strong>WhatsApp +54911 2344-3283</strong>. Toda consulta ser&aacute; respondida en el d&iacute;a de lunes a viernes o primer d&iacute;a h&aacute;bil. </p>

<p><strong>Si su Movil no es compatible</strong> podr&aacute; utilizar <strong>cualquier dispositivo</strong> que tenga instalado <strong>TuID Vida</strong>. No es necesario que sea personal. Puede ser de familiar, amigo o un asistente.</p>
<p>Una vez instalada la aplicaci&oacute;n. Debe proceder de la siguiente forma:</p>

<p><strong>Proceso de Registraci&oacute;n:</strong></p>
<ul type="disc">
  <li><strong>Proceso 1</strong> Solicitamos se realice <strong>Escaneo de Frente del DNI</strong>.</li>

<p>Sugerimos que este proceso se realice en un espacio con buena iluminaci&oacute;n. En caso de no ser posible la aplicaci&oacute;n cuenta con flash. Esta funci&oacute;n se debe habilitar de ser necesario. </p>
<p>Centrar el DNI en el recuadro que aparece en pantalla. La captura se realiza en forma autom&aacute;tica al hacer foco.</p>

  <li><strong>Proceso 2</strong> Luego girar el DNI y se <strong>Escanea el Dorso</strong></li>

<p>Girar el DNI cuando la imagen en pantalla lo indique. Centrar el DNI como en el proceso anterior. </p>

  <li><strong>Proceso 3</strong> Solicitamos al usurario que se tome una <strong>Selfie</strong></li>

<p>Luego deber&aacute; tomarse una Selfie (autofoto) con buena iluminaci&oacute;n. Esta se rea realiza en forma autom&aacute;tica mediante detecci&oacute;n de Parpadeos / Pesta&ntilde;eos. </p>

  <li><strong>Proceso 4</strong> Comprobaci&oacute;n de datos Biom&eacute;tricos</li>

<p>Si el porcentaje de coincidencia obtenido es superior al 80% la Validaci&oacute;n es considerada exitosa. </p>

  <li><strong>Proceso 5</strong> Validamos Tel&eacute;fono <strong>M&oacute;vil</strong> e <strong>Email</strong></li>

<p>           Como complemento solicitamos el ingreso del Correo Electr&oacute;nico y su N&uacute;mero de M&oacute;vil. </p>
<p>           Se le envira un Codigo  el que deber&aacute; ser ingresado para concluir al Tr&aacute;mite.</p>
<p>           Esta informaci&oacute;n es muy importante ya que nos permitir&aacute; enviarle informaci&oacute;n, notificaciones de su inter&eacute;s y la cerfificacion.</p>
</ul>

<p><strong>Proceso de Autenticaci&oacute;n</strong>:</p>
<ul type="disc">
  <li>Fe de Vida o Supervivencia</li>

<p>Una vez realizado el proceso de registraci&oacute;n. Para dar Fe de Vida <strong>solo ser&aacute; necesario</strong> que desde la aplicaci&oacute;n se saque una <strong>Selfie</strong> (Autofoto) simplemente realizando los movimientos indicados en pantalla. </p>

<p>Para este proceso podr&aacute; utilizar cualquier M&oacute;vil que tenga instalada la aplicaci&oacute;n.</p>
</ul>

<p>Trabajamos para brindarle el servicio que se merece y cuidar su salud evitando que pueda dar cumplimiento con el tramite de <strong>Fe de Vida</strong> sin moverse de su casa.</p>', 'migracion', NOW()),
('CONTACTO_104D', 'email', 'html', 'Respuesta a Contacto 104D - Envío de Código de validación (entidad no adherida)', NULL, '<p>Estimad@ <strong>{{nombre}}</strong> ,</p>
CUIL: {{cuil}}

<p>Gracias por utilizar <strong>TuID Vida</strong>. Pero lamentablemente <strong>su entidad aun no est&aacute; adherida al sistema</strong>. Si le pareci&oacute; &uacute;til manifieste a su entidad su interes <strong></strong>.</p>
<p>Recuerde que por el momento deber&aacute; acreditar su <strong>Fe de Vida</strong> por los <strong>canales habituales</strong>.</p>
<p>Gracias por su tiempo. Cualquier duda o inquietud puede comunicarse mediante el <strong>Formulario de Contacto</strong> de la aplicaci&oacute;n o por <strong>Whatsapp </strong><strong>+54911 2344-3283 </strong>para mayor rapidez. </p>', 'migracion', NOW()),
('CONTACTO_104E', 'email', 'html', 'Respuesta a Contacto 104E - Envío de Código de validación (fuera de término)', NULL, '<p><strong>Asunto: </strong>Fe de Vida Satisfactoria pero fuera de la fecha estipulada</p>

<p><span lang="es">Estimad@  </span><span lang="es"> {{nombre}},</span></p>

<p><span lang="es">Su CUIL {{cuil}} ha registrado y dado <strong>Fe de Vida</strong> satisfactoriamente aunque fuera
  del limite estipulado.</span> </p>


  <p>Si no le han acreditado el beneficio previsional es por no haber realizado dicha certificacion dentro de los terminos establecidos.<strong><u> Ante cualquier inquietud contactese con su entidad pagadora.</u></strong></p>

<p>De todos modos si tiene alguna inquietud con respecto a sus haberes le sugerimos contactarse con su entidad pagadora a fin de informarse al respecto.</p>

<p>Es importante que tenga los datos de contacto actualizados. Brindar el <strong>Email</strong> nos permitir&aacute; enviarles las certificaciones y el n&uacute;mero de <strong>M&oacute;vil</strong>, notificaciones, recordatorios y comunicaciones de su inter&eacute;s.</p>

<p><span lang="es">Trabajamos para brindarle el servicio que se merece y cuidar su salud evitando que pueda dar cumplimiento con el tramite de <strong>Fe de Vida</strong> sin moverse de su casa.</span></p>

<p><span lang="es">Gracias por su tiempo y por utilizar <strong>TuID Vida</strong>. Cualquier duda o inquietud puede comunicarse mediante el formulario de contacto de la aplicaci&oacute;n.</span></p>

<table border="0" cellpadding="0" width="100%">
  <tbody>
    <tr>
      <td colspan="2"></td></tr></tbody></table>', 'migracion', NOW()),
('CONTACTO_105A', 'email', 'html', 'Respuesta a Contacto 105A - Solicito Certificado de Fe de Vida (falta dar Fe de Vida)', NULL, '<p>Estimad@ <strong>{{nombre}}</strong> ,</p>
	
            <p>Su CUIL: {{cuil}} se encuenta registrad@ <strong>satisfactoriamente</strong>.    Debe actualizar su <strong>Fe de Vida</strong> para    este periodo. </p>
            <p>Para realizar el tramite de    Supervivencia debe seguir los siguientes pasos: <strong></strong></p>
			
            <ol>
              <li><strong>  </strong>    A fin de facilitar el uso le recomiendo <strong>habilitar    las instrucciones por medio de audio</strong> al inicio de la soluci&oacute;n.</li>
              <li>     Ingresar en el <strong>boton Fe de Vida</strong> </li>
              <li>                            Ingresar <strong>Numero de DNI</strong> y    Seleccionar <strong>Sexo</strong> (Tenga la    precausion de <strong>seleccionar    correctamente</strong> el <strong>Genero</strong>)</li>
              <li>     Sacarse una <strong>Selfie</strong> realizando <strong>3 pesta&ntilde;eos</strong>. (Si tierne dificultades    para pesta&ntilde;ear puede abrir y cerar los ojos. Esperando que el conteo del    audio le guie)</li>
             
            </ol>
            <p>Si tiene dudas puede<strong> ver las instrucciones en video </strong><a href="https://tuid.ar/ayudafv">https://tuid.ar/ayudafv </a> </p>
          <p><strong> </strong>Cualquier duda o inquietud puede comunicarse mediante el <strong>formulario de contacto</strong> de la    aplicaci&oacute;n o al <strong>WhatsApp    +54911 2344-3283</strong></p>
          <p>Antes de dar<strong> Fe de Vida </strong>tenga en cuenta:<strong></strong></p>
  
          <ul type="disc">
              <li>A fin de facilitar el uso a aquellas personas con <strong>problemas de visi&oacute;n</strong> puede         habilitar las instrucciones por medio de <strong>audio</strong> al inicio de la soluci&oacute;n.</li>
          </ul>
      
          <ul type="disc">
              <li>Alerta Rojo en barra inferior &ldquo;<strong>No         se detecta Rostro</strong>&rdquo;. Se debe a iluminaci&oacute;n insuficiente o sombras en el rostro.         Trate siempre de colocar el m&oacute;vil a la altura de los ojos.</li>
          </ul>
    
          <ul type="disc">
              <li>Durante el proceso de Registraci&oacute;n o Fe de Vida debe tener la         precauci&oacute;n que en el momento de tomarse una Selfie que la c&aacute;mara tome solamente su rostro.         Si detecta m&aacute;s de un rostro, aunque sea una fotograf&iacute;a de fondo         aparecer&aacute; un alerta roja en la barra inferior y se reiniciara el conteo         de movimientos. Deber&aacute; iniciar nuevamente la cuenta de movimientos.</li>
          </ul>

          <p>Si tiene dudas si su Certificaci&oacute;n ha sido exitosa <strong>puede controlar sus certificaciones</strong> consultando en el <strong>Men&uacute;</strong> de la    aplicaci&oacute;n, la opci&oacute;n <strong>Historial</strong>. De haber sido exitosa la certificaci&oacute;n y dio de    alta un Correo Electronico deber&aacute; <strong>recibir por Email</strong> una notificaci&oacute;n.</p>

          
          El <strong>Codigo</strong> que se le envia es para validar el email o el m&oacute;vil de esta forma <strong> verificar que el dato de contacto</strong> se haya ingresado correctamente. <strong>No valida la Fe de Vida</strong>. El mismo puede llegar a    demorar todo depende de la compa&ntilde;&iacute;a telefonica o del trafico de internet. Si    se encuentra en el exterior no lo recibira el codigo de validacion telefonico,    ya que no esta habilitado para trafico internacional.<strong></strong>
          <p>Ante cualquier inconveniente con la registraci&oacute;n o con el    uso. Se recomienda utilizar el <strong>Formulario    de Contacto</strong> que se encuentra en la aplicaci&oacute;n. Toda consulta ser&aacute;    respondida en el d&iacute;a de lunes a viernes o primer d&iacute;a h&aacute;bil. </p>', 'migracion', NOW()),
('CONTACTO_105B', 'email', 'html', 'Respuesta a Contacto 105B - Solicito Certificado de Fe de Vida (Fe de Vida satisfactoria)', NULL, '<p><strong>Asunto: </strong>Fe de Vida Satisfactoria</p>

<p><span lang="es">Estimad@  </span><span lang="es"> {{nombre}},</span></p>

<p><span lang="es">Su CUIL {{cuil}} ha registrado y dado <strong>Fe de Vida</strong> satisfactoriamente.</span> </p>

<p>Si tiene dudas si su Certificaci&oacute;n ha sido exitosa puede controlar sus certificaciones consultando en el <strong>Men&uacute;</strong> de la aplicaci&oacute;n la opci&oacute;n <strong>Historial</strong>. De haber sido exitosa la certificaci&oacute;n figurara alli el registro indicando fecha y hora ademas deber&aacute; recibir por Email una notificaci&oacute;n.</p>

<p>Si figura el registro en la aplicaci&oacute;n <strong><u>no es necesario que notifique su realizacion</u></strong>. </p>

<p>El <strong>Codigo</strong> que se le envia es para validar el email o el celular y es <strong>para verificar el dato de contacto</strong> se haya ingresado correctamente. No la Fe de Vida. El mismo puede llegar a demorar todo depende de la compa&ntilde;&iacute;a telefonica o del trafico de internet. Si se encuentra en el exterior no lo recibira el codigo de validacion telefonico, ya que no esta habilitado para trafico internacional.<strong></strong></p>

<p>Es importante que tenga los datos de contacto actualizados. Brindar el <strong>Email</strong> nos permitir&aacute; enviarles las certificaciones y el n&uacute;mero de <strong>M&oacute;vil</strong>, notificaciones, recordatorios y comunicaciones de su inter&eacute;s.</p>

<p><span lang="es">Trabajamos para brindarle el servicio que se merece y cuidar su salud evitando que pueda dar cumplimiento con el tramite de <strong>Fe de Vida</strong> sin moverse de su casa.</span></p>

<p><span lang="es">Gracias por su tiempo y por utilizar <strong>TuID Vida</strong>. Cualquier duda o inquietud puede comunicarse mediante el formulario de contacto de la aplicaci&oacute;n.</span></p>

<table border="0" cellpadding="0" width="100%">
  <tbody>
    <tr>
      <td colspan="2"></td></tr></tbody></table>', 'migracion', NOW()),
('CONTACTO_105C', 'email', 'html', 'Respuesta a Contacto 105C - Solicito Certificado de Fe de Vida (usuario no registrado)', NULL, '<p>Estimad@ <strong>{{nombre}}</strong> ,</p>

<p>Segun nuestros registros el CUIL {{cuil}} no se encuentra registrado. Por favor, verifique que nos haya informado correctamente el número de CUIL.</p>
<p>Para utilizar la aplicaci&oacute;n Movil <strong>TuID Vida</strong> le detallo los pasos a seguir.</p>

<p>Instalar la aplicaci&oacute;n <strong>TuID Vida</strong> desde:</p>

<table border="0" cellspacing="0" cellpadding="0">
  <tbody> 
    <tr>
      <td width="150" rowspan="2" valign="top"><p></p>
          <p><strong> </strong></p></td>
      <td width="132" valign="top"><p><strong><a href="https://bit.ly/2wUxl9V" target="_blank" rel="noopener noreferrer"><img src="https://tuid.ar/images/logos/play-store-3.jpg" alt="play-store-3" width="150" border="0" /></a></strong><strong> </strong></p></td>
      <td width="275" align="left" valign="middle"><p> <a href="https://bit.ly/2wUxl9V" style="margin-left:20px" target="_blank" rel="noopener noreferrer">https://bit.ly/2wUxl9V </a></p></td>
    </tr>
    <tr>
      <td width="132" valign="top"><p><strong><a href="https://apple.co/2QgPyFq" target="_blank" rel="noopener noreferrer"><img src="https://tuid.ar/images/logos/play-store-2.jpg" alt="play-store-2" width="150" border="0" /></a></strong></p></td>
      <td width="275" align="left" valign="middle"><p> <a href="https://apple.co/2QgPyFq" style="margin-left:20px" target="_blank" rel="noopener noreferrer">https://apple.co/2QgPyFq</a></p></td>
    </tr>
  </tbody>
</table>


<p>Ver <strong>video con instrucciones</strong>:  <a href="https://tuid.ar/ayudatv">https://tuid.ar/ayudatv </a> </p>

<p>Ante cualquier inconveniente con la registraci&oacute;n o con el uso. Se recomienda utilizar el <strong>Formulario de Contacto</strong> que se encuentra en la aplicaci&oacute;n o al <strong>WhatsApp +54911 2344-3283</strong>. Toda consulta ser&aacute; respondida en el d&iacute;a de lunes a viernes o primer d&iacute;a h&aacute;bil. </p>

<p><strong>Si su Movil no es compatible</strong> podr&aacute; utilizar <strong>cualquier dispositivo</strong> que tenga instalado <strong>TuID Vida</strong>. No es necesario que sea personal. Puede ser de familiar, amigo o un asistente.</p>
<p>Una vez instalada la aplicaci&oacute;n. Debe proceder de la siguiente forma:</p>

<p><strong>Proceso de Registraci&oacute;n:</strong></p>
<ul type="disc">
  <li><strong>Proceso 1</strong> Solicitamos se realice <strong>Escaneo de Frente del DNI</strong>.</li>

<p>Sugerimos que este proceso se realice en un espacio con buena iluminaci&oacute;n. En caso de no ser posible la aplicaci&oacute;n cuenta con flash. Esta funci&oacute;n se debe habilitar de ser necesario. </p>
<p>Centrar el DNI en el recuadro que aparece en pantalla. La captura se realiza en forma autom&aacute;tica al hacer foco.</p>

  <li><strong>Proceso 2</strong> Luego girar el DNI y se <strong>Escanea el Dorso</strong></li>

<p>Girar el DNI cuando la imagen en pantalla lo indique. Centrar el DNI como en el proceso anterior. </p>

  <li><strong>Proceso 3</strong> Solicitamos al usurario que se tome una <strong>Selfie</strong></li>

<p>Luego deber&aacute; tomarse una Selfie (autofoto) con buena iluminaci&oacute;n. Esta se rea realiza en forma autom&aacute;tica mediante detecci&oacute;n de Parpadeos / Pesta&ntilde;eos. </p>

  <li><strong>Proceso 4</strong> Comprobaci&oacute;n de datos Biom&eacute;tricos</li>

<p>Si el porcentaje de coincidencia obtenido es superior al 80% la Validaci&oacute;n es considerada exitosa. </p>

  <li><strong>Proceso 5</strong> Validamos Tel&eacute;fono <strong>M&oacute;vil</strong> e <strong>Email</strong></li>

<p>           Como complemento solicitamos el ingreso del Correo Electr&oacute;nico y su N&uacute;mero de M&oacute;vil. </p>
<p>           Se le envira un Codigo  el que deber&aacute; ser ingresado para concluir al Tr&aacute;mite.</p>
<p>           Esta informaci&oacute;n es muy importante ya que nos permitir&aacute; enviarle informaci&oacute;n, notificaciones de su inter&eacute;s y la cerfificacion.</p>
</ul>

<p><strong>Proceso de Autenticaci&oacute;n</strong>:</p>
<ul type="disc">
  <li>Fe de Vida o Supervivencia</li>

<p>Una vez realizado el proceso de registraci&oacute;n. Para dar Fe de Vida <strong>solo ser&aacute; necesario</strong> que desde la aplicaci&oacute;n se saque una <strong>Selfie</strong> (Autofoto) simplemente realizando los movimientos indicados en pantalla. </p>

<p>Para este proceso podr&aacute; utilizar cualquier M&oacute;vil que tenga instalada la aplicaci&oacute;n.</p>
</ul>

<p>Trabajamos para brindarle el servicio que se merece y cuidar su salud evitando que pueda dar cumplimiento con el tramite de <strong>Fe de Vida</strong> sin moverse de su casa.</p>', 'migracion', NOW()),
('CONTACTO_105D', 'email', 'html', 'Respuesta a Contacto 105D - Solicito Certificado de Fe de Vida (entidad no adherida)', NULL, '<p>Estimad@ <strong>{{nombre}}</strong> ,</p>
CUIL {{cuil}}

<p>Gracias por utilizar <strong>TuID Vida</strong>. Pero lamentablemente <strong>su entidad aun no est&aacute; adherida al sistema</strong>. Si le pareci&oacute; &uacute;til manifieste a su entidad su interes <strong></strong>.</p>
<p>Recuerde que por el momento deber&aacute; acreditar su <strong>Fe de Vida</strong> por los <strong>canales habituales</strong>.</p>
<p>Gracias por su tiempo. Cualquier duda o inquietud puede comunicarse mediante el <strong>Formulario de Contacto</strong> de la aplicaci&oacute;n o por <strong>Whatsapp </strong><strong>+54911 2344-3283 </strong>para mayor rapidez. </p>', 'migracion', NOW()),
('CONTACTO_105E', 'email', 'html', 'Respuesta a Contacto 105E - Solicito Certificado de Fe de Vida (fuera de término)', NULL, '<p><strong>Asunto: </strong>Fe de Vida Satisfactoria pero fuera de la fecha estipulada</p>

<p><span lang="es">Estimad@  </span><span lang="es"> {{nombre}},</span></p>

<p><span lang="es">Su CUIL {{cuil}} ha registrado y dado <strong>Fe de Vida</strong> satisfactoriamente aunque fuera
  del limite estipulado.</span> </p>

<p>Si no le han acreditado el beneficio previsional es por no haber realizado dicha certificacion dentro de los terminos establecidos.<strong><u> Ante cualquier inquietud contactese con su entidad pagadora.</u></strong></p>

<p>De todos modos si tiene alguna inquietud con respecto a sus haberes le sugerimos contactarse con su entidad pagadora a fin de informarse al respecto.</p>

<p>Es importante que tenga los datos de contacto actualizados. Brindar el <strong>Email</strong> nos permitir&aacute; enviarles las certificaciones y el n&uacute;mero de <strong>M&oacute;vil</strong>, notificaciones, recordatorios y comunicaciones de su inter&eacute;s.</p>

<p><span lang="es">Trabajamos para brindarle el servicio que se merece y cuidar su salud evitando que pueda dar cumplimiento con el tramite de <strong>Fe de Vida</strong> sin moverse de su casa.</span></p>

<p><span lang="es">Gracias por su tiempo y por utilizar <strong>TuID Vida</strong>. Cualquier duda o inquietud puede comunicarse mediante el formulario de contacto de la aplicaci&oacute;n.</span></p>

<table border="0" cellpadding="0" width="100%">
  <tbody>
    <tr>
      <td colspan="2"></td></tr></tbody></table>', 'migracion', NOW()),
('CONTACTO_106A', 'email', 'html', 'Respuesta a Contacto 106A - Cuándo debo Renovar mi Fe de Vida (falta dar Fe de Vida)', NULL, '<p>Estimad@ <strong>{{nombre}}</strong> ,</p>
CUIL: {{cuil}}

          <p>A partir del  <strong>{{fecha}}</strong>  puede actualizar su certificacion de  <strong>Fe de Vida</strong>. Evite retencion de beneficio previcional.</p>
        <p>Una vez realizado el tramite el sistema no le permitira realizar una nueva certificacion hasta el  <strong>proximo</strong>  <strong>periodo</strong>  que incia el   <strong>"ProximoPeriodo"</strong></p>
        <p>Si tiene dudas de como dar  <strong>Fe de Vida</strong>  o no lo recuerda puede ver las instrucciones en video <a href="https://tuid.ar/ayudafv" target="_blank" rel="noopener noreferrer">https://tuid.ar/ayudafv</a></p>
        <p>Recuerde que puede controlar sus certificaciones consultando en  <strong>Historial</strong>  de Certificaciones en el  <strong>Menu</strong>  de la aplicaci&oacute;n. Si figura en el Historial  <strong>no es necesario que comunique su realizacion.</strong></p>

        <p><span lang="es">Es importante que tenga los datos de contacto actualizados. Brindar el  <strong>Email</strong>  nos permitir&aacute; enviarles las certificaciones y el n&uacute;mero de  <strong>M&oacute;vil</strong>,  <strong>notificaciones, recordatorios y comunicaciones</strong>  de su inter&eacute;s.</span></p>
        <p>Ante cualquier inconveniente con el uso. Se recomienda utilizar el <strong>Formulario de Contacto</strong> que se encuentra en la aplicaci&oacute;n o al <strong>WhatsApp +54911 2344-3283</strong>. Toda consulta ser&aacute; respondida en el d&iacute;a de lunes a viernes o primer d&iacute;a h&aacute;bil. </p>
        <p>Para temas relacionados con <strong>otros tr&aacute;mites que no est&eacute;n relacionados</strong> con su acreditaci&oacute;n de Fe de Vida debe dirigirse a <a>"CorreoInstitucion"</a> o llame al <strong>&quot;TelefonoInstitucion&quot; </strong>.</p>', 'migracion', NOW()),
('CONTACTO_106B', 'email', 'html', 'Respuesta a Contacto 106B - Cuándo debo Renovar mi Fe de Vida (Fe de Vida satisfactoria)', NULL, '<p>Estimad@ <strong>{{nombre}}</strong> ,</p>
CUIL: {{cuil}}

          <p>Usted ya ha cumplimentado la certificacion para el presente periodo. Una vez realizado el tramite el sistema no le permitira dar <strong>Fe de Vida</strong> hasta en inicio del nuevo periodo <strong>{{fecha}}</strong> . </p>
          <p>Si tiene dudas de como dar <strong>Fe de Vida</strong> o no lo recuerda puede ver las instrucciones en video<a href="https://tuid.ar/ayudafv" target="_blank" rel="noopener noreferrer"> https://tuid.ar/ayudafv</a></p>
        <p>Recuerde que puede controlar sus certificaciones consultando en <strong>Historial</strong> de Certificaciones en el <strong>Menu</strong> de la aplicaci&oacute;n. Si figura en el Historial <strong>no es necesario que comunique su realizacion.</strong></p>
        
        <p>Es importante que tenga los datos de contacto actualizados. Brindar el <strong>Email</strong> nos permitir&aacute; enviarles las certificaciones y el n&uacute;mero de <strong>M&oacute;vil</strong>, <strong>notificaciones, recordatorios y comunicaciones</strong> de su inter&eacute;s.</p>
        
        <p>Gracias por su tiempo. Cualquier duda o inquietud puede comunicarse mediante el formulario de contacto de la aplicaci&oacute;n o  al  <strong>WhatsApp +54911 2344-3283</strong></p>
        <p>Para temas relacionados con <strong>otros tr&aacute;mites que no est&eacute;n relacionados</strong> con su acreditaci&oacute;n de Fe de Vida debe dirigirse a <a>"CorreoInstitucion"</a> o llame al <strong>&quot;TelefonoInstitucion&quot;  </strong>.</p>', 'migracion', NOW()),
('CONTACTO_106C', 'email', 'html', 'Respuesta a Contacto 106C - Cuándo debo Renovar mi Fe de Vida (usuario no registrado)', NULL, '<p>Estimad@ <strong>{{nombre}}</strong> ,</p>

<p>Segun nuestros registros el CUIL {{cuil}} no se encuentra registrado. Por favor, verifique que nos haya informado correctamente el número de CUIL.</p>
<p>Para utilizar la aplicaci&oacute;n Movil <strong>TuID Vida</strong> le detallo los pasos a seguir.</p>

<p>Instalar la aplicaci&oacute;n <strong>TuID Vida</strong> desde:</p>

<table border="0" cellspacing="0" cellpadding="0">
  <tbody> 
    <tr>
      <td width="150" rowspan="2" valign="top"><p></p>
          <p><strong> </strong></p></td>
      <td width="132" valign="top"><p><strong><a href="https://bit.ly/2wUxl9V" target="_blank" rel="noopener noreferrer"><img src="https://tuid.ar/images/logos/play-store-3.jpg" alt="play-store-3" width="150" border="0" /></a></strong><strong> </strong></p></td>
      <td width="275" align="left" valign="middle"><p> <a href="https://bit.ly/2wUxl9V" style="margin-left:20px" target="_blank" rel="noopener noreferrer">https://bit.ly/2wUxl9V </a></p></td>
    </tr>
    <tr>
      <td width="132" valign="top"><p><strong><a href="https://apple.co/2QgPyFq" target="_blank" rel="noopener noreferrer"><img src="https://tuid.ar/images/logos/play-store-2.jpg" alt="play-store-2" width="150" border="0" /></a></strong></p></td>
      <td width="275" align="left" valign="middle"><p> <a href="https://apple.co/2QgPyFq" style="margin-left:20px" target="_blank" rel="noopener noreferrer">https://apple.co/2QgPyFq</a></p></td>
    </tr>
  </tbody>
</table>


<p>Ver <strong>video con instrucciones</strong>:  <a href="https://tuid.ar/ayudatv">https://tuid.ar/ayudatv </a> </p>

<p>Ante cualquier inconveniente con la registraci&oacute;n o con el uso. Se recomienda utilizar el <strong>Formulario de Contacto</strong> que se encuentra en la aplicaci&oacute;n o al <strong>WhatsApp +54911 2344-3283</strong>. Toda consulta ser&aacute; respondida en el d&iacute;a de lunes a viernes o primer d&iacute;a h&aacute;bil. </p>

<p><strong>Si su Movil no es compatible</strong> podr&aacute; utilizar <strong>cualquier dispositivo</strong> que tenga instalado <strong>TuID Vida</strong>. No es necesario que sea personal. Puede ser de familiar, amigo o un asistente.</p>
<p>Una vez instalada la aplicaci&oacute;n. Debe proceder de la siguiente forma:</p>

<p><strong>Proceso de Registraci&oacute;n:</strong></p>
<ul type="disc">
  <li><strong>Proceso 1</strong> Solicitamos se realice <strong>Escaneo de Frente del DNI</strong>.</li>

<p>Sugerimos que este proceso se realice en un espacio con buena iluminaci&oacute;n. En caso de no ser posible la aplicaci&oacute;n cuenta con flash. Esta funci&oacute;n se debe habilitar de ser necesario. </p>
<p>Centrar el DNI en el recuadro que aparece en pantalla. La captura se realiza en forma autom&aacute;tica al hacer foco.</p>

  <li><strong>Proceso 2</strong> Luego girar el DNI y se <strong>Escanea el Dorso</strong></li>

<p>Girar el DNI cuando la imagen en pantalla lo indique. Centrar el DNI como en el proceso anterior. </p>

  <li><strong>Proceso 3</strong> Solicitamos al usurario que se tome una <strong>Selfie</strong></li>

<p>Luego deber&aacute; tomarse una Selfie (autofoto) con buena iluminaci&oacute;n. Esta se rea realiza en forma autom&aacute;tica mediante detecci&oacute;n de Parpadeos / Pesta&ntilde;eos. </p>

  <li><strong>Proceso 4</strong> Comprobaci&oacute;n de datos Biom&eacute;tricos</li>

<p>Si el porcentaje de coincidencia obtenido es superior al 80% la Validaci&oacute;n es considerada exitosa. </p>

  <li><strong>Proceso 5</strong> Validamos Tel&eacute;fono <strong>M&oacute;vil</strong> e <strong>Email</strong></li>

<p>           Como complemento solicitamos el ingreso del Correo Electr&oacute;nico y su N&uacute;mero de M&oacute;vil. </p>
<p>           Se le envira un Codigo  el que deber&aacute; ser ingresado para concluir al Tr&aacute;mite.</p>
<p>           Esta informaci&oacute;n es muy importante ya que nos permitir&aacute; enviarle informaci&oacute;n, notificaciones de su inter&eacute;s y la cerfificacion.</p>
</ul>

<p><strong>Proceso de Autenticaci&oacute;n</strong>:</p>
<ul type="disc">
  <li>Fe de Vida o Supervivencia</li>

<p>Una vez realizado el proceso de registraci&oacute;n. Para dar Fe de Vida <strong>solo ser&aacute; necesario</strong> que desde la aplicaci&oacute;n se saque una <strong>Selfie</strong> (Autofoto) simplemente realizando los movimientos indicados en pantalla. </p>

<p>Para este proceso podr&aacute; utilizar cualquier M&oacute;vil que tenga instalada la aplicaci&oacute;n.</p>
</ul>

<p>Trabajamos para brindarle el servicio que se merece y cuidar su salud evitando que pueda dar cumplimiento con el tramite de <strong>Fe de Vida</strong> sin moverse de su casa.</p>', 'migracion', NOW()),
('CONTACTO_106D', 'email', 'html', 'Respuesta a Contacto 106D - Cuándo debo Renovar mi Fe de Vida (entidad no adherida)', NULL, '<p>Estimad@ <strong>{{nombre}}</strong> ,</p>
CUIL: {{cuil}}

<p>Gracias por utilizar <strong>TuID Vida</strong>. Pero lamentablemente <strong>su entidad aun no est&aacute; adherida al sistema</strong>. Si le pareci&oacute; &uacute;til manifieste a su entidad su interes <strong></strong>.</p>
<p>Recuerde que por el momento deber&aacute; acreditar su <strong>Fe de Vida</strong> por los <strong>canales habituales</strong>.</p>
<p>Gracias por su tiempo. Cualquier duda o inquietud puede comunicarse mediante el <strong>Formulario de Contacto</strong> de la aplicaci&oacute;n o por <strong>Whatsapp </strong><strong>+54911 2344-3283 </strong>para mayor rapidez. </p>', 'migracion', NOW()),
('CONTACTO_106E', 'email', 'html', 'Respuesta a Contacto 106E - Cuándo debo Renovar mi Fe de Vida (fuera de término)', NULL, '<p><strong>Asunto: </strong>Fe de Vida Satisfactoria pero fuera de la fecha estipulada</p>

<p><span lang="es">Estimad@  </span><span lang="es"> {{nombre}},</span></p>

<p><span lang="es">Su CUIL {{cuil}} ha registrado y dado <strong>Fe de Vida</strong> satisfactoriamente aunque fuera
  del limite estipulado.</span> </p>

<p>Si no le han acreditado el beneficio previsional es por no haber realizado dicha certificacion dentro de los terminos establecidos.<strong><u> Ante cualquier inquietud contactese con su entidad pagadora.</u></strong></p>

<p>De todos modos si tiene alguna inquietud con respecto a sus haberes le sugerimos contactarse con su entidad pagadora a fin de informarse al respecto.</p>

<p>Es importante que tenga los datos de contacto actualizados. Brindar el <strong>Email</strong> nos permitir&aacute; enviarles las certificaciones y el n&uacute;mero de <strong>M&oacute;vil</strong>, notificaciones, recordatorios y comunicaciones de su inter&eacute;s.</p>

<p><span lang="es">Trabajamos para brindarle el servicio que se merece y cuidar su salud evitando que pueda dar cumplimiento con el tramite de <strong>Fe de Vida</strong> sin moverse de su casa.</span></p>

<p><span lang="es">Gracias por su tiempo y por utilizar <strong>TuID Vida</strong>. Cualquier duda o inquietud puede comunicarse mediante el formulario de contacto de la aplicaci&oacute;n.</span></p>

<table border="0" cellpadding="0" width="100%">
  <tbody>
    <tr>
      <td colspan="2"></td></tr></tbody></table>', 'migracion', NOW()),
('CONTACTO_107', 'email', 'html', 'Respuesta a Contacto 107 - Otorgar permisos para TuID Vida', NULL, '<p>Estimad@ <strong>{{nombre}}</strong> ,</p>

<p>Lamentamos el contratiempo. La aplicacikon necesita que se le otorguen <strong>ciertos permisos</strong> para utilizar recursos del movil, como uso de la camara, almacenamiento, localizacion, etc. Sin ello no es posible que funcione.</p>

<p>Si usted no esta familiarizado con al configuracion de App le sugerimos <strong>desinstalar</strong> y volver a <strong>instalar</strong> la aplicaci&oacute;n, otorgando esta vez todos los permisos.</p>

<p>Caso contrario se debe modificar la configuracion de la Aplicaci&oacute;n de la siguiente manera.</p>
<p>Ir a <strong>Ajustes </strong>del dispositivo<strong>:</strong> </p>

<ol start="1" type="1">
  <li>Abrir la aplicaci&oacute;n <strong>Ajustes</strong>.</li>
  <li>Ir a la opci&oacute;n <strong>Aplicaciones</strong> o <strong>Administrador de Aplicaciones</strong> (esta opci&oacute;n puede variar en funci&oacute;n del dispositivo).</li>
  <li>Selecciona <strong>TuID Vida</strong>.</li>
  <li>Despl&aacute;zate hacia abajo hasta la secci&oacute;n &quot;<strong>Permisos</strong>&quot;.</li>
  <li>Otorgar permisos para <strong>Almacenamiento</strong>, <strong>C&aacute;mara</strong> y <strong>Localizaci&oacute;n</strong>.</li>

</ol>

<p>Ante cualquier inconveniente con la registraci&oacute;n o con el uso. Se recomienda utilizar el <strong>Formulario de Contacto</strong> que se encuentra en la aplicaci&oacute;n o al  <strong>WhatsApp +54911 2344-3283</strong>. Toda consulta ser&aacute; respondida en el d&iacute;a de lunes a viernes o primer d&iacute;a h&aacute;bil. </p>', 'migracion', NOW()),
('CONTACTO_108', 'email', 'html', 'Respuesta a Contacto 108 - No puedo realizar Fe de Vida', NULL, '<p>Estimad@ <strong>{{nombre}}</strong> ,</p>
CUIL {{cuil}}

<p>Lamentamos el contratiempo. Le sugerimos tener en cuenta algunas recomentaciones que se detallan mas abajo.</p>

<p><strong><u>Algunas Recomendaciones a tener en cuenta:</u></strong></p>

<p>Antes de dar<strong> Fe de Vida </strong>tenga en cuenta:<strong></strong></p>

<ul type="disc">
  <li>Si recibe una notificaci&oacute;n que existe una <strong>nueva versi&oacute;n </strong>de TuID Vida <strong>Actual&iacute;cela</strong>. Siempre incluir&aacute; mejoras en el servicio.</li>
</ul>

<ul type="disc">
  <li>A fin de facilitar el uso a aquellas personas con <strong>problemas de visi&oacute;n</strong> puede habilitar las instrucciones por medio de <strong>audio</strong> al inicio de la soluci&oacute;n.</li>
</ul>

<ul type="disc">
  <li>Alerta Rojo en barra inferior &ldquo;<strong>No se detecta Rostro</strong>&rdquo;. Se debe a iluminaci&oacute;n insuficiente o sombras en el rostro. Trate siempre de colocar el m&oacute;vil a la altura de los ojos.</li>
</ul>

<ul type="disc">
  <li>Durante el proceso de <strong>Registraci&oacute;n</strong> o <strong>Fe de Vida</strong> debe tener la precauci&oacute;n que en el momento de tomarse una Selfie que la c&aacute;mara tome solamente su rostro. Si detecta m&aacute;s de un rostro, aunque sea una fotograf&iacute;a de fondo aparecer&aacute; un alerta roja en la barra inferior y se reiniciara el conteo de movimientos. Deber&aacute; iniciar nuevamente la cuenta de movimientos.</li>
</ul>

<p><strong>Si tiene dudas</strong> si su Certificaci&oacute;n ha sido exitosa puede controlar sus certificaciones consultando en el <strong>Men&uacute;</strong> de la aplicaci&oacute;n, la opci&oacute;n <strong>Historial</strong>. De haber sido exitosa la certificaci&oacute;n deber&aacute; <strong>recibir por Email</strong> una notificaci&oacute;n. </p>

<p>Si ha cambiado su Movil o tenido alg&uacute;n desperfeto podr&aacute; utilizar <strong>cualquier M&oacute;vil</strong> que tenga instalado <strong>TuID Vida</strong>. No es necesario que sea el mismo con el que se registr&oacute;.</p>

<p>Ante cualquier inconveniente con la registraci&oacute;n o con el uso. Se recomienda utilizar el <strong>Formulario de Contacto</strong> que se encuentra en la aplicaci&oacute;n o al  <strong>WhatsApp +54911 2344-3283</strong>. Toda consulta ser&aacute; respondida en el d&iacute;a de lunes a viernes o primer d&iacute;a h&aacute;bil. </p>', 'migracion', NOW()),
('CONTACTO_109A', 'email', 'html', 'Respuesta a Contacto 109A - No me acreditaron el beneficio previsional (falta dar Fe de Vida)', NULL, '<p>Estimad@ <strong>{{nombre}}</strong> ,</p>
<p>CUIL: {{cuil}}</p>

          <p>No le han    acreditado el beneficio previsional porque no realizo la certificacion de Fe    de Vida para el actual periodo o lo realizo fuera de termino. Actualice el    tramite mediante la aplicaci&oacute;n. No es necesario que realice ninguna notificacion. </p>
        <p>A los    efectos de agilizar el tramite de acreditacion le sugerimos contactarse al    email  <a href="mailto:{{correo_cliente}}">{{correo_cliente}}</a> o llame al <strong>{{telefono_cliente}} </strong>.</p>
      <p>Recuerde que el proximo periodo inicia el {{fecha}}. Si intenta    dar <strong>Fe de Vida</strong> antes de dicha    fecha el sistema no le permitira.</p>
        <p>Si tiene dudas de    como dar <strong>Fe de Vida</strong> o no lo    recuerda puede ver las instrucciones en video <a href="https://tuid.ar/ayudafv">https://tuid.ar/ayudafv</a></p>
        <p>Para controlar sus    certificaciones puede hacerlo consultando en <strong>Historial</strong> de    Certificaciones en el <strong>Menu</strong> de la aplicaci&oacute;n. Si figura en el Historial <strong>no es necesario que comunique su    realizacion.</strong></p>
        
        <p>Gracias    por su tiempo. Cualquier duda o inquietud puede comunicarse mediante el <strong>formulario de contacto</strong> de la    aplicaci&oacute;n o  <span lang="es">al  </span><strong>WhatsApp    +54911 2344-3283</strong> </p>', 'migracion', NOW()),
('CONTACTO_109B', 'email', 'html', 'Respuesta a Contacto 109B - No me acreditaron el beneficio previsional (Fe de Vida satisfactoria)', NULL, '<p>Estimad@ <strong>{{nombre}}</strong> ,</p>
<p>CUIL: {{cuil}}</p>

          <p>Su certificacion de <strong>Fe de Vida</strong> se encuentra al dia. Sugerimos se contactarse al email   <a href="mailto:{{correo_cliente}}"> {{correo_cliente}} </a> o llame al <strong> {{telefono_cliente}} </strong>. </p>
          <p>Gracias por su tiempo. Cualquier duda o inquietud puede comunicarse mediante el <strong>formulario de contacto</strong> de la aplicaci&oacute;n o  <span lang="es">al  </span><strong>WhatsApp +54911 2344-3283</strong> </p>', 'migracion', NOW()),
('CONTACTO_109C', 'email', 'html', 'Respuesta a Contacto 109C - No me acreditaron el beneficio previsional (usuario no registrado)', NULL, '<p>Estimad@ <strong>{{nombre}}</strong> ,</p>

<p>Segun nuestros registros el CUIL {{cuil}} no se encuentra registrado. Por favor, verifique que nos haya informado correctamente el número de CUIL.</p>
<p>Para utilizar la aplicaci&oacute;n Movil <strong>TuID Vida</strong> le detallo los pasos a seguir.</p>

<p>Instalar la aplicaci&oacute;n <strong>TuID Vida</strong> desde:</p>

<table border="0" cellspacing="0" cellpadding="0">
  <tbody> 
    <tr>
      <td width="150" rowspan="2" valign="top"><p></p>
          <p><strong> </strong></p></td>
      <td width="132" valign="top"><p><strong><a href="https://bit.ly/2wUxl9V" target="_blank" rel="noopener noreferrer"><img src="https://tuid.ar/images/logos/play-store-3.jpg" alt="play-store-3" width="150" border="0" /></a></strong><strong> </strong></p></td>
      <td width="275" align="left" valign="middle"><p> <a href="https://bit.ly/2wUxl9V" style="margin-left:20px" target="_blank" rel="noopener noreferrer">https://bit.ly/2wUxl9V </a></p></td>
    </tr>
    <tr>
      <td width="132" valign="top"><p><strong><a href="https://apple.co/2QgPyFq" target="_blank" rel="noopener noreferrer"><img src="https://tuid.ar/images/logos/play-store-2.jpg" alt="play-store-2" width="150" border="0" /></a></strong></p></td>
      <td width="275" align="left" valign="middle"><p> <a href="https://apple.co/2QgPyFq" style="margin-left:20px" target="_blank" rel="noopener noreferrer">https://apple.co/2QgPyFq</a></p></td>
    </tr>
  </tbody>
</table>


<p>Ver <strong>video con instrucciones</strong>:  <a href="https://tuid.ar/ayudatv">https://tuid.ar/ayudatv </a> </p>

<p>Ante cualquier inconveniente con la registraci&oacute;n o con el uso. Se recomienda utilizar el <strong>Formulario de Contacto</strong> que se encuentra en la aplicaci&oacute;n o al <strong>WhatsApp +54911 2344-3283</strong>. Toda consulta ser&aacute; respondida en el d&iacute;a de lunes a viernes o primer d&iacute;a h&aacute;bil. </p>

<p><strong>Si su Movil no es compatible</strong> podr&aacute; utilizar <strong>cualquier dispositivo</strong> que tenga instalado <strong>TuID Vida</strong>. No es necesario que sea personal. Puede ser de familiar, amigo o un asistente.</p>
<p>Una vez instalada la aplicaci&oacute;n. Debe proceder de la siguiente forma:</p>

<p><strong>Proceso de Registraci&oacute;n:</strong></p>
<ul type="disc">
  <li><strong>Proceso 1</strong> Solicitamos se realice <strong>Escaneo de Frente del DNI</strong>.</li>

<p>Sugerimos que este proceso se realice en un espacio con buena iluminaci&oacute;n. En caso de no ser posible la aplicaci&oacute;n cuenta con flash. Esta funci&oacute;n se debe habilitar de ser necesario. </p>
<p>Centrar el DNI en el recuadro que aparece en pantalla. La captura se realiza en forma autom&aacute;tica al hacer foco.</p>

  <li><strong>Proceso 2</strong> Luego girar el DNI y se <strong>Escanea el Dorso</strong></li>

<p>Girar el DNI cuando la imagen en pantalla lo indique. Centrar el DNI como en el proceso anterior. </p>

  <li><strong>Proceso 3</strong> Solicitamos al usurario que se tome una <strong>Selfie</strong></li>

<p>Luego deber&aacute; tomarse una Selfie (autofoto) con buena iluminaci&oacute;n. Esta se rea realiza en forma autom&aacute;tica mediante detecci&oacute;n de Parpadeos / Pesta&ntilde;eos. </p>

  <li><strong>Proceso 4</strong> Comprobaci&oacute;n de datos Biom&eacute;tricos</li>

<p>Si el porcentaje de coincidencia obtenido es superior al 80% la Validaci&oacute;n es considerada exitosa. </p>

  <li><strong>Proceso 5</strong> Validamos Tel&eacute;fono <strong>M&oacute;vil</strong> e <strong>Email</strong></li>

<p>           Como complemento solicitamos el ingreso del Correo Electr&oacute;nico y su N&uacute;mero de M&oacute;vil. </p>
<p>           Se le envira un Codigo  el que deber&aacute; ser ingresado para concluir al Tr&aacute;mite.</p>
<p>           Esta informaci&oacute;n es muy importante ya que nos permitir&aacute; enviarle informaci&oacute;n, notificaciones de su inter&eacute;s y la cerfificacion.</p>
</ul>

<p><strong>Proceso de Autenticaci&oacute;n</strong>:</p>
<ul type="disc">
  <li>Fe de Vida o Supervivencia</li>

<p>Una vez realizado el proceso de registraci&oacute;n. Para dar Fe de Vida <strong>solo ser&aacute; necesario</strong> que desde la aplicaci&oacute;n se saque una <strong>Selfie</strong> (Autofoto) simplemente realizando los movimientos indicados en pantalla. </p>

<p>Para este proceso podr&aacute; utilizar cualquier M&oacute;vil que tenga instalada la aplicaci&oacute;n.</p>
</ul>

<p>Trabajamos para brindarle el servicio que se merece y cuidar su salud evitando que pueda dar cumplimiento con el tramite de <strong>Fe de Vida</strong> sin moverse de su casa.</p>', 'migracion', NOW()),
('CONTACTO_109D', 'email', 'html', 'Respuesta a Contacto 109D - No me acreditaron el beneficio previsional (entidad no adherida)', NULL, '<p>Estimad@ <strong>{{nombre}}</strong> ,</p>
<p>CUIL: {{cuil}}</p>


<p>Gracias por utilizar <strong>TuID Vida</strong>. Pero lamentablemente <strong>su entidad aun no est&aacute; adherida al sistema</strong>. Si le pareci&oacute; &uacute;til manifieste a su entidad su interes <strong></strong>.</p>
<p>Recuerde que por el momento deber&aacute; acreditar su <strong>Fe de Vida</strong> por los <strong>canales habituales</strong>.</p>
<p>Gracias por su tiempo. Cualquier duda o inquietud puede comunicarse mediante el <strong>Formulario de Contacto</strong> de la aplicaci&oacute;n o por <strong>Whatsapp </strong><strong>+54911 2344-3283 </strong>para mayor rapidez. </p>', 'migracion', NOW()),
('CONTACTO_109E', 'email', 'html', 'Respuesta a Contacto 109E - No me acreditaron el beneficio previsional (fuera de término)', NULL, '<p><strong>Asunto: </strong>Fe de Vida Satisfactoria pero fuera de la fecha estipulada</p>

<p><span lang="es">Estimad@  </span><span lang="es"> {{nombre}},</span></p>

<p><span lang="es">Su CUIL {{cuil}} ha registrado y dado <strong>Fe de Vida</strong> satisfactoriamente aunque fuera
  del limite estipulado.</span> </p>

<p>Si no le han acreditado el beneficio previsional es por no haber realizado dicha certificacion dentro de los terminos establecidos.<strong><u> Ante cualquier inquietud contactese con su entidad pagadora.</u></strong></p>

<p>De todos modos si tiene alguna inquietud con respecto a sus haberes le sugerimos contactarse con su entidad pagadora a fin de informarse al respecto.</p>

<p>Es importante que tenga los datos de contacto actualizados. Brindar el <strong>Email</strong> nos permitir&aacute; enviarles las certificaciones y el n&uacute;mero de <strong>M&oacute;vil</strong>, notificaciones, recordatorios y comunicaciones de su inter&eacute;s.</p>

<p><span lang="es">Trabajamos para brindarle el servicio que se merece y cuidar su salud evitando que pueda dar cumplimiento con el tramite de <strong>Fe de Vida</strong> sin moverse de su casa.</span></p>

<p><span lang="es">Gracias por su tiempo y por utilizar <strong>TuID Vida</strong>. Cualquier duda o inquietud puede comunicarse mediante el formulario de contacto de la aplicaci&oacute;n.</span></p>

<table border="0" cellpadding="0" width="100%">
  <tbody>
    <tr>
      <td colspan="2"></td></tr></tbody></table>', 'migracion', NOW()),
('CONTACTO_110', 'email', 'html', 'Respuesta a Contacto 110 - Cambio de Dispositivo', NULL, '<p>Estimad@ <strong>{{nombre}}</strong> ,</p>
<p>CUIL: {{cuil}}</p>

<p>Si ha <strong>cambiado o extraviado Movil </strong>podr&aacute; utilizar <strong>cualquier dispositivo</strong> que tenga instalado <strong>TuID Vida</strong>. No es necesario que sea personal. Puede ser de unfamiliar, amigo o un asistente.</p>

<p>Ante cualquier inconveniente con la registraci&oacute;n o con el uso. Se recomienda utilizar el <strong>Formulario de Contacto</strong> que se encuentra en la aplicaci&oacute;n o por <strong>WhatsApp </strong>al<strong> +54911 2344-3283</strong>. Toda consulta ser&aacute; respondida en el d&iacute;a de lunes a viernes o primer d&iacute;a h&aacute;bil. </p>

<p>Trabajamos para brindarle el servicio que se merece y cuidar su salud para que pueda dar cumplimiento con el tramite de <strong>Fe de Vida</strong> sin moverse de su casa.</p>', 'migracion', NOW());
