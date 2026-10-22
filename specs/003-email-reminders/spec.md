# Feature Specification: Recordatorios por Notificación Push y Correo

**Feature Branch**: `003-email-reminders`

**Created**: 2026-10-22

**Status**: Draft

**Input**: User description: "Recordatorios por correo" (ampliada en la clarificación Q2 con
notificaciones push obligatorias y correo opcional elegido al registrar el vehículo)

## Clarifications

### Session 2026-10-22

- Q: ¿Cómo se recuerda un mantenimiento que sigue vencido? → A: Nunca se repite; un solo aviso
  de "Vencido" por ciclo.
- Q: ¿Los avisos vienen activados por defecto? → A: Al registrar el vehículo, el usuario indica
  si además de las notificaciones push quiere recibir los avisos por correo; las notificaciones
  push son obligatorias.
- Q: ¿Qué significa "push obligatoria" si el usuario rechaza el permiso de notificaciones? → A: Si
  lo rechaza, la app le pregunta si quiere recibir los avisos por correo; si también lo rechaza,
  el flujo continúa sin notificaciones y el usuario solo ve los mantenimientos vencidos o próximos
  en la app, con el semáforo por kilometraje o fecha.
- Q: ¿La notificación push debe tener botones de acción directa o solo abrir la app al tocarla?
  → A: Solo abrir la app; las acciones ("Ya lo hice", "Posponer") se hacen dentro de la app.
- Q: ¿Qué tanto detalle debe mostrar la notificación push en la pantalla bloqueada? → A: Detalle
  completo (vehículo, mantenimiento, estado y km/días), sin matrícula ni datos personales.
- Q: ¿Cuánto tiempo se guarda el registro de avisos y envíos? → A: 12 meses; los avisos del ciclo
  vigente de cada mantenimiento se conservan mientras sigan siendo necesarios para no repetirlos.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Recibir un aviso cuando un mantenimiento se acerca o vence (Priority: P1)

Un usuario que no abre la app a diario recibe una notificación push (y, si lo eligió, un correo)
cuando alguno de sus vehículos tiene un mantenimiento próximo o vencido, con qué hacer, cuándo y
por qué, y un enlace para ver el detalle o registrarlo como hecho.

**Why this priority**: Es la promesa central del producto según la constitución (Principio III:
"el valor del producto está en los recordatorios automáticos"). Sin avisos, el usuario tiene que
acordarse de abrir la app, que es justo lo que no hace alguien sin experiencia mecánica.

**Independent Test**: Con un vehículo cuyo cambio de aceite pasa a "Próximo", el usuario recibe
una notificación push en su siguiente horario de envío (y un correo si lo activó) con el
mantenimiento, los km restantes y la fecha estimada; al tocarla se abre ese vehículo en la app.

**Acceptance Scenarios**:

1. **Given** un mantenimiento que pasa a "Próximo", **When** llega el siguiente horario de envío
   del usuario, **Then** recibe una notificación push que lo menciona con km restantes y fecha
   estimada, y además un correo si el vehículo tiene el correo activado.
2. **Given** un mantenimiento que pasa a "Vencido", **When** llega el siguiente horario de envío,
   **Then** recibe el aviso como vencido, con los km o días de retraso.
3. **Given** varios avisos pendientes el mismo día, **When** se envían, **Then** el usuario recibe
   **una sola notificación push** que los resume ("Tienes 3 mantenimientos por revisar") y, si
   corresponde, **un solo correo** que los agrupa por vehículo.
4. **Given** un aviso ya enviado para un mantenimiento en un estado, **When** el proceso vuelve a
   ejecutarse (incluso tras un fallo o reintento), **Then** no se envía el mismo aviso otra vez
   por ningún canal.
5. **Given** un mantenimiento pospuesto o desactivado (feature 002), **When** corresponde enviar
   avisos, **Then** no se incluye mientras esté pospuesto o desactivado.
6. **Given** el usuario registra el servicio (o cambia el intervalo o el historial previo),
   **When** el mantenimiento llegue de nuevo a "Próximo" en su nuevo ciclo, **Then** se vuelve a
   avisar; si solo oscila entre "Al día" y "Próximo" dentro del mismo ciclo, no se repite.
7. **Given** un mantenimiento que sigue vencido tras su aviso, **When** pasan días sin
   registrarlo, **Then** no se vuelve a enviar ningún aviso por él en ese ciclo; sigue visible en
   la app.
8. **Given** el usuario toca la notificación push, **When** se abre la app, **Then** muestra los
   mantenimientos del vehículo correspondiente (o la pantalla principal si hay avisos de varios).

---

### User Story 2 - Elegir el correo al registrar el vehículo y activar las notificaciones (Priority: P1)

Al dar de alta un vehículo, el usuario indica si quiere recibir también los avisos de ese vehículo
por correo. Las notificaciones push son obligatorias: tras registrar el vehículo, la app pide
permiso para enviarlas.

**Why this priority**: Sin un canal activo los avisos no llegan; y el correo debe ser una decisión
explícita del usuario (clarificación Q2).

**Independent Test**: Al registrar un vehículo, el usuario ve la opción "Recibir también los
avisos por correo" (desactivada por defecto) y, tras guardar, la app le pide permiso para
notificaciones; al aceptarlo, el dispositivo queda suscrito.

**Interacciones**: la opción de correo es un único interruptor dentro del alta (0 toques si se
deja como está, 1 toque para activarla); el permiso de notificaciones es 1 toque del sistema.

**Acceptance Scenarios**:

1. **Given** el formulario de alta de vehículo, **When** el usuario lo completa, **Then** ve el
   interruptor "Recibir también los avisos por correo", desactivado por defecto, con una frase que
   explica que las notificaciones push se enviarán siempre.
2. **Given** el usuario guarda el vehículo, **When** el dispositivo aún no tiene permiso de
   notificaciones, **Then** la app explica para qué sirven y solicita el permiso del sistema.
3. **Given** el usuario concede el permiso, **When** se completa, **Then** ese dispositivo queda
   suscrito a las notificaciones push de todos sus vehículos.
4. **Given** el usuario deniega el permiso o el dispositivo no admite notificaciones (p. ej. iPhone
   sin la app instalada en la pantalla de inicio) y no activó el correo, **When** se resuelve la
   petición, **Then** la app le pregunta "¿Quieres recibir los avisos por correo?"; si acepta, se
   activa el correo para ese vehículo.
5. **Given** el usuario también rechaza el correo, **When** continúa, **Then** el registro termina
   con normalidad, no recibe avisos fuera de la app y la app no vuelve a insistir; los
   mantenimientos se ven en la app con el semáforo de estado (rojo vencido, ámbar próximo, verde
   al día, feature 002).
6. **Given** un vehículo ya registrado, **When** el usuario edita el vehículo, **Then** puede
   activar o desactivar los avisos por correo de ese vehículo y, si el dispositivo aún no tiene
   permiso, volver a solicitar las notificaciones.
7. **Given** el usuario usa la app en varios dispositivos, **When** concede el permiso en cada
   uno, **Then** cada dispositivo recibe las notificaciones.

---

### User Story 3 - Recordarme actualizar el kilometraje (Priority: P2)

Si el usuario lleva tiempo sin registrar el kilometraje de un vehículo, recibe un aviso amable
para actualizarlo, porque las estimaciones dependen de ese dato.

**Why this priority**: El Principio I de la constitución explica que la calidad de las alertas
depende de datos frescos. Sin este aviso, las estimaciones de quien no abre la app se basan en
un ritmo de uso supuesto y pierden precisión.

**Independent Test**: Un vehículo sin lecturas en 30 días genera una notificación "¿Cuánto marca
hoy tu Toyota Corolla?" que al tocarla abre directamente la captura rápida de kilometraje.

**Acceptance Scenarios**:

1. **Given** un vehículo cuya última lectura tiene 30 días o más, **When** llega el horario de
   envío, **Then** el usuario recibe un aviso para actualizar el kilometraje de ese vehículo
   (push, y correo si lo tiene activado).
2. **Given** ese aviso enviado, **When** el usuario no registra nada, **Then** no se repite antes
   de otros 30 días.
3. **Given** el mismo día corresponden avisos de mantenimiento y de kilometraje, **When** se
   envían, **Then** van en la misma notificación y en el mismo correo.
4. **Given** el usuario toca el aviso con la sesión iniciada, **When** se abre la app, **Then**
   aparece la captura de kilometraje de ese vehículo, lista para escribir.

---

### User Story 4 - Dejar de recibir correos (Priority: P2)

El usuario puede dejar de recibir los avisos por correo con un solo clic desde cualquier correo,
sin iniciar sesión.

**Why this priority**: Es imprescindible para enviar correos de forma legítima y respetuosa; sin
baja sencilla, los avisos se perciben como spam y dañan la reputación de envío.

**Independent Test**: Desde el enlace "Dejar de recibir estos correos" de un aviso, el usuario se
da de baja confirmando en la página (o en 1 clic con el botón de baja de su cliente de correo); deja de recibir correos pero sigue recibiendo las notificaciones push.

**Acceptance Scenarios**:

1. **Given** un correo de aviso, **When** el usuario pulsa "Dejar de recibir estos correos",
   **Then** se desactiva el correo de todos sus vehículos en un clic desde el cliente de correo o
   confirmando en la página del enlace, sin iniciar sesión, y ve una confirmación con la opción de
   deshacer.
2. **Given** un enlace de baja manipulado o de otro usuario, **When** se usa, **Then** no
   modifica las preferencias de nadie.
3. **Given** el usuario se dio de baja, **When** vuelve a activar el correo en un vehículo desde
   la app, **Then** vuelve a recibir los correos de ese vehículo.

---

### Edge Cases

- ¿Qué pasa si el usuario no ha abierto la app desde hace meses? Los avisos se siguen enviando
  según las reglas; las estimaciones se calculan con el ritmo de uso conocido.
- ¿Qué pasa si el usuario denegó las notificaciones y también rechazó el correo? No le llega
  ningún aviso fuera de la app y la app no vuelve a insistir; ve el estado de sus mantenimientos
  con el semáforo de la feature 002 cuando la abre, y puede activar el correo o volver a pedir el
  permiso desde la edición del vehículo.
- ¿Qué pasa si una suscripción push deja de ser válida (app desinstalada, permiso revocado)? Se
  elimina esa suscripción y no se reintenta en ese dispositivo.
- ¿Qué pasa si el correo rebota de forma permanente o el usuario lo marca como spam? Se dejan de
  enviar correos a esa dirección y la app muestra un aviso para revisarla.
- ¿Qué pasa si el envío falla temporalmente? Se reintenta en el mismo día sin duplicar avisos; si
  no se logra, los avisos pendientes pasan al siguiente horario de envío.
- ¿Qué pasa con un usuario con muchos vehículos? Una notificación con el total y un correo con un
  bloque por vehículo; si hay más de 10 avisos se muestran los 10 más urgentes y un enlace a la app.
- ¿Qué pasa si el usuario elimina un vehículo o su cuenta? No se envían avisos de ese vehículo o
  usuario, aunque estuvieran pendientes.
- ¿Qué pasa si el usuario cambia de zona horaria? El horario de envío se ajusta a la última zona
  horaria conocida de su dispositivo.
- ¿Qué pasa si un mantenimiento pasa de "Próximo" a "Vencido" sin que se haya enviado el aviso de
  "Próximo"? Solo se envía el de "Vencido".
- ¿Qué pasa con los vehículos registrados antes de esta feature? Quedan con el correo desactivado
  y la app pide el permiso de notificaciones la próxima vez que se abra.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema DEBE ejecutar el envío de avisos al menos una vez al día y enviar a cada
  usuario como máximo **una notificación push y un correo por día**, en su horario de envío
  (09:00 en su zona horaria).
- **FR-002**: El sistema DEBE generar un aviso de mantenimiento cuando un mantenimiento activo y
  no pospuesto pasa a "Próximo" o a "Vencido" (reglas de estado de la feature 002), una vez por
  estado y ciclo de mantenimiento.
- **FR-003**: Un ciclo de mantenimiento DEBE reiniciarse solo cuando cambia su punto de partida
  (se registra un servicio que lo incluye o se indica su historial previo) o su intervalo (se
  personaliza o se vuelve al recomendado); en el nuevo ciclo se vuelve a avisar. Que el estado
  vuelva temporalmente a "Al día" (p. ej. porque cambió el ritmo de uso) NO reinicia el ciclo.
- **FR-004**: Un mantenimiento vencido NO DEBE volver a avisarse dentro del mismo ciclo aunque el
  usuario no lo registre; solo se avisa de nuevo en el siguiente ciclo (FR-003).
- **FR-005**: El sistema DEBE generar un aviso de kilometraje cuando la última lectura válida de
  un vehículo tenga 30 días o más, y no repetirlo antes de otros 30 días.
- **FR-006**: Las notificaciones push son obligatorias: DEBEN enviarse a todos los dispositivos
  suscritos del usuario y NO DEBEN poder desactivarse desde la app (el usuario solo puede
  revocarlas desde los ajustes de su dispositivo).
- **FR-007**: El formulario de alta de vehículo DEBE incluir el interruptor "Recibir también los
  avisos por correo", desactivado por defecto, con una frase que indique que las notificaciones
  push se envían siempre; la edición del vehículo DEBE permitir cambiarlo.
- **FR-008**: Tras registrar un vehículo, si el dispositivo no tiene permiso de notificaciones, la
  app DEBE explicar para qué sirven y solicitar el permiso del sistema (indicando que en iPhone
  hay que instalar la app en la pantalla de inicio). Si se deniega o no es posible y el vehículo
  no tiene el correo activado, la app DEBE preguntar "¿Quieres recibir los avisos por correo?";
  si acepta, activa el correo de ese vehículo; si rechaza, el flujo continúa sin notificaciones.
  La explicación y la solicitud del permiso se muestran una sola vez por dispositivo; la pregunta
  del correo se hace en cada alta de vehículo mientras el dispositivo no tenga notificaciones,
  y nunca fuera del alta (la app NO DEBE insistir en otros momentos).
- **FR-008a**: Sin notificaciones ni correo, el usuario DEBE seguir viendo en la app el estado de
  sus mantenimientos con el semáforo de la feature 002 (rojo vencido, ámbar próximo, verde al día,
  por kilometraje o fecha); la edición del vehículo DEBE permitir activar el correo o volver a
  pedir el permiso más tarde.
- **FR-009**: Los correos DEBEN enviarse solo por los vehículos que tengan el correo activado.
- **FR-010**: Todos los avisos pendientes de un usuario en un día DEBEN agruparse: una sola
  notificación push que resuma el total y el más urgente, y un solo correo agrupado por vehículo,
  ordenado por urgencia (vencidos primero), con un máximo de 10 avisos y un enlace a la app si hay
  más.
- **FR-010a**: El texto de la notificación push DEBE mostrar el detalle del aviso más urgente
  (nombre del vehículo tal como aparece en la app, mantenimiento, estado y km o días; p. ej.
  "Toyota Corolla: cambio de aceite vencido, te pasaste 500 km") y, si hay más, cuántos quedan
  ("y 2 avisos más"). NO DEBE incluir la matrícula ni datos personales del usuario.
- **FR-011**: Cada aviso de mantenimiento DEBE indicar en lenguaje claro qué hacer, cuántos km o
  días faltan (o de retraso), la fecha estimada y, en el correo, una frase de por qué importa;
  cada aviso de kilometraje DEBE explicar que actualizarlo mejora las recomendaciones.
- **FR-012**: Las notificaciones push NO DEBEN incluir botones de acción. Al tocar una
  notificación o un enlace del correo, la app DEBE abrir el detalle de
  mantenimientos del vehículo o la captura rápida de kilometraje, según el aviso, exigiendo la
  sesión iniciada; los enlaces NO DEBEN permitir acciones sin sesión (salvo la baja de FR-014).
  Si no hay sesión, tras iniciarla la app DEBE llevar al usuario al destino del aviso.
- **FR-013**: El envío DEBE ser idempotente: ningún aviso se envía dos veces por el mismo canal
  aunque el proceso se ejecute varias veces o se reintente tras un fallo.
- **FR-014**: Cada correo DEBE incluir un enlace de baja que desactive el correo de todos los
  vehículos del usuario en un clic desde el cliente de correo o confirmando en la página del
  enlace, sin iniciar sesión, válido solo para ese usuario, con confirmación y opción de
  deshacer. La baja no afecta a las notificaciones push.
- **FR-015**: El sistema DEBE dejar de enviar correos a una dirección tras un rebote permanente o
  una queja de spam, y mostrar en la app un aviso para revisar la dirección; y DEBE eliminar las
  suscripciones push que el servicio de notificaciones indique como caducadas.
- **FR-016**: El sistema DEBE registrar cada envío (canal, destinatario o dispositivo, fecha,
  avisos incluidos y resultado) para evitar duplicados y poder auditar envíos, y DEBE borrar
  automáticamente los registros de avisos y envíos con más de 12 meses, salvo los avisos del ciclo
  vigente de un mantenimiento, que se conservan mientras sean necesarios para no repetirlos.
  Al eliminar un vehículo o la cuenta se borran sus avisos, envíos y suscripciones.
- **FR-017**: El proceso DEBE poder atender a todos los usuarios en lotes, tolerar reintentos y
  continuar donde se quedó si se interrumpe (Principio III).
- **FR-018**: El contenido de correos y notificaciones DEBE estar en español, ser legible en móvil
  y respetar el estilo sobrio de la app (Principio IV).
- **FR-019**: El sistema DEBE guardar la zona horaria más reciente informada por el dispositivo
  del usuario para calcular su horario de envío; si no la conoce, usa UTC−6.

### Key Entities *(include if feature involves data)*

- **Preferencia de correo por vehículo**: Si los avisos de ese vehículo se envían también por
  correo (elegido al registrarlo, editable).
- **Estado de correo del usuario**: Fecha de baja (si la hubo), estado de la dirección (válida,
  rebotada, queja) y zona horaria conocida.
- **Suscripción push**: Un dispositivo del usuario autorizado a recibir notificaciones: datos de
  la suscripción, fecha de alta, último uso y si está activa.
- **Aviso**: Un motivo para notificar al usuario: tipo (mantenimiento próximo, mantenimiento
  vencido, kilometraje), vehículo, mantenimiento (si aplica), ciclo al que pertenece y fecha en
  que se generó. Clave única para no repetirlo.
- **Envío**: Una notificación o un correo enviado a un usuario: canal, fecha, avisos incluidos,
  resultado (enviado, rebotado, caducado, fallido) e identificador del proveedor.
- **Enlace de baja**: Credencial de un solo propósito asociada a un usuario que permite darse de
  baja del correo sin iniciar sesión.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El 95 % de los avisos se entregan el mismo día en que el mantenimiento pasa a
  "Próximo" o "Vencido" (en el horario de envío del usuario) a los dispositivos suscritos.
- **SC-002**: Ningún usuario recibe más de una notificación y un correo de avisos por día ni el
  mismo aviso dos veces por el mismo canal (0 duplicados en auditoría).
- **SC-003**: El proceso diario atiende 100.000 usuarios con vehículos en menos de 1 hora.
- **SC-004**: Al menos el 70 % de los usuarios que registran un vehículo conceden el permiso de
  notificaciones en ese momento.
- **SC-005**: Darse de baja del correo se completa en 1 clic con el botón de baja del cliente de
  correo (Gmail, Apple Mail) o en 2 clics desde el enlace del correo (enlace + "Confirmar baja"),
  en menos de 10 segundos.
- **SC-006**: Al menos el 30 % de los avisos de kilometraje terminan en una lectura registrada en
  los 7 días siguientes.
- **SC-007**: La tasa de quejas de spam del correo se mantiene por debajo del 0,1 % de los envíos.

## Assumptions

- Depende de las features 001 (vehículos, lecturas, alta y edición de vehículo) y 002
  (estimaciones persistidas con índice por fecha, estados, posponer, desactivar).
- Las notificaciones push se envían con el estándar web de notificaciones de la PWA, sin
  depender de una tienda de apps; en iPhone requieren iOS 16.4 o superior y la app instalada en la
  pantalla de inicio.
- "Push obligatoria" significa que la app no ofrece desactivarla; el sistema operativo siempre
  permite al usuario denegar o revocar el permiso, y eso se respeta.
- La dirección de correo es la de inicio de sesión (Supabase Auth). El proveedor de correo
  (Resend, Brevo o Nodemailer/SMTP) se elige en la planificación detrás de una interfaz común
  (constitución, Infraestructura).
- Horario de envío fijo a las 09:00 locales; elegir la hora queda fuera de alcance. SMS y WhatsApp
  quedan fuera de alcance.
- Los avisos de "Próximo" usan la definición de la feature 002 (≤ 1.000 km o ≤ 30 días).
- Los textos legales (pie del correo, aviso de privacidad sobre notificaciones) se redactan en la
  planificación según la jurisdicción del proyecto.
