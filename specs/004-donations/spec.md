# Feature Specification: Donaciones con Stripe y PayPal

**Feature Branch**: `004-donations`

**Created**: 2026-10-23

**Status**: Draft

**Input**: User description: "Donaciones con Stripe y PayPal"

## Clarifications

### Session 2026-10-23

- Q: ¿Donar debe dar algún beneficio? → A: Sí, quita los anuncios por un tiempo según el monto:
  1 mes (30 días) por cada 50 MXN donados, proporcional (p. ej., 100 MXN = 60 días).
- Q: ¿Se ofrecen donaciones mensuales? → A: Sí, únicas y mensuales; las mensuales se pueden
  cancelar desde la app y quitan los anuncios mientras estén activas.
- Q: ¿Cómo se invita a donar? → A: Acceso fijo "Apoya Car Checkup" más una tarjeta discreta en la
  pantalla principal que se puede cerrar y no vuelve en 90 días. Quien tiene una donación con
  beneficio vigente no recibe ninguna invitación ni mención de donaciones (ni en la app ni en los
  correos).
- Q: ¿Debe llegar el correo de agradecimiento aunque el usuario se haya dado de baja de los
  correos de recordatorios? → A: Sí, siempre; la baja solo afecta a los recordatorios. No se envía
  si el correo está marcado como no entregable (rebote o queja).
- Q: Con una donación mensual activa, ¿cuándo cuentan los días de una donación única? → A: Se
  guardan y se suman después del final del periodo pagado de la donación mensual.
- Q: ¿Puede el usuario pedir un reembolso desde la app? → A: No; "Mis donaciones" muestra un
  correo de contacto, el responsable reembolsa desde el panel del proveedor y la app refleja el
  estado cuando llega el aviso del proveedor.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Hacer una donación con tarjeta o PayPal (Priority: P1)

Un usuario al que la app le resulta útil abre "Apoya Car Checkup", elige un monto sugerido o
escribe otro, elige pagar con tarjeta o con PayPal, completa el pago en la página segura del
proveedor y vuelve a la app, donde ve un agradecimiento.

**Why this priority**: Es la única vía de ingreso directo prevista en la constitución además de
los anuncios, y el resto de la feature (historial, recibos) no tiene sentido sin el pago.

**Independent Test**: Desde "Apoya Car Checkup", elegir 100 MXN, pagar con tarjeta de prueba y
volver a la app: se muestra el agradecimiento y la donación queda registrada como confirmada
solo cuando el proveedor la confirma.

**Acceptance Scenarios**:

1. **Given** un usuario con sesión, **When** abre "Apoya Car Checkup", **Then** ve en una sola
   pantalla para qué se usan las donaciones, 3 montos sugeridos, la opción "Otro monto" y los dos
   medios de pago ("Tarjeta" y "PayPal").
2. **Given** un monto elegido, **When** toca "Tarjeta" o "PayPal", **Then** pasa a la página de
   pago del proveedor con el monto y la moneda ya puestos, sin volver a escribirlos.
3. **Given** un pago completado, **When** el proveedor lo confirma, **Then** la donación queda
   como confirmada y el usuario ve "¡Gracias por tu apoyo!" al volver a la app.
4. **Given** que el usuario cancela o cierra la página del proveedor, **When** vuelve a la app,
   **Then** ve un mensaje neutro ("No se realizó ningún cargo") y puede intentarlo de nuevo; no
   se registra ninguna donación confirmada.
5. **Given** que el usuario vuelve a la app antes de que llegue la confirmación del proveedor,
   **When** se muestra el resultado, **Then** ve "Estamos confirmando tu pago" y el estado se
   actualiza solo cuando llega la confirmación, sin pedirle que pague otra vez.

---

### User Story 2 - Donar cada mes y poder cancelarlo (Priority: P2)

Un usuario que quiere apoyar de forma constante elige "Cada mes", paga con tarjeta o PayPal y,
cuando quiera, cancela la donación mensual desde la app sin escribir a nadie.

**Why this priority**: Da un ingreso estable, pero la donación única ya cubre el caso básico.

**Independent Test**: Activar una donación mensual de 50 MXN con tarjeta de prueba, ver en la app
"Donación mensual activa" y la app sin anuncios; cancelarla desde la app y comprobar que sigue
activa hasta el final del mes pagado y después ya no se cobra.

**Acceptance Scenarios**:

1. **Given** la pantalla "Apoya Car Checkup", **When** el usuario elige "Cada mes" y un monto,
   **Then** el proveedor le muestra que es un cargo mensual por ese monto antes de confirmarlo.
2. **Given** una donación mensual activa, **When** el usuario abre "Mis donaciones", **Then** ve
   el monto, el medio, la fecha del siguiente cargo y el botón "Cancelar donación mensual".
3. **Given** que el usuario cancela, **When** lo confirma en un segundo paso, **Then** no se le
   vuelve a cobrar y el beneficio sin anuncios dura hasta el final del periodo ya pagado.
4. **Given** un cargo mensual que el proveedor no puede cobrar, **When** lo notifica, **Then** la
   donación mensual queda "Con problema de pago", el usuario ve un aviso para actualizar su
   medio de pago en el proveedor y, si el proveedor la da por cancelada, queda "Cancelada".
5. **Given** una donación mensual activa, **When** el usuario intenta crear otra, **Then** la app
   le indica que ya tiene una y le ofrece gestionarla (solo una mensual activa por usuario).

---

### User Story 3 - Ver mis donaciones y su comprobante (Priority: P2)

Un donante quiere comprobar que su donación se cobró y tener un comprobante.

**Why this priority**: Da confianza y evita dudas o reclamaciones, pero el pago funciona sin ello.

**Independent Test**: Tras una donación confirmada, "Mis donaciones" muestra fecha, monto, medio
de pago y estado, y el usuario recibe un correo de agradecimiento con esos datos.

**Acceptance Scenarios**:

1. **Given** donaciones confirmadas, **When** el usuario abre "Mis donaciones", **Then** ve la
   lista con fecha, monto, moneda, medio de pago y estado, de la más reciente a la más antigua.
2. **Given** una donación confirmada, **When** se confirma, **Then** el usuario recibe un correo
   de agradecimiento con fecha, monto y medio de pago (sin datos de la tarjeta).
3. **Given** una donación reembolsada por el proveedor, **When** llega el aviso del reembolso,
   **Then** su estado cambia a "Reembolsada" en "Mis donaciones".

---

### User Story 4 - Usar la app sin anuncios después de donar (Priority: P2)

Un donante deja de ver anuncios durante el tiempo que le corresponde y sabe hasta cuándo.

**Why this priority**: Es el beneficio que el usuario recibe a cambio; sin él, la promesa de la
pantalla de donación no se cumple. Depende de la feature de anuncios para ser visible, pero el
derecho al beneficio se registra desde esta feature.

**Independent Test**: Tras una donación única confirmada de 100 MXN, la app indica "Sin anuncios
hasta el <fecha + 60 días>" y la parte de anuncios no muestra ninguno hasta esa fecha.

**Acceptance Scenarios**:

1. **Given** una donación única confirmada, **When** se confirma, **Then** el usuario obtiene
   30 días sin anuncios por cada 50 MXN, proporcional y redondeado hacia abajo a días completos.
2. **Given** un beneficio vigente, **When** el usuario hace otra donación única, **Then** los
   días nuevos se suman al final del beneficio vigente (no se pierden).
3. **Given** una donación mensual activa, **When** se usa la app, **Then** no hay anuncios
   mientras siga activa y hasta el final del último periodo pagado.
4. **Given** una donación mensual activa con periodo pagado hasta el 30 de junio, **When** el
   usuario hace además una donación única de 50 MXN y luego cancela la mensual, **Then** no ve
   anuncios hasta el 30 de julio (30 días guardados que empiezan al terminar el periodo pagado).
5. **Given** una donación reembolsada o en disputa, **When** el proveedor lo notifica, **Then**
   se retiran los días que esa donación había dado.
6. **Given** un beneficio vigente, **When** el usuario abre "Apoya Car Checkup" o "Mis
   donaciones", **Then** ve "Sin anuncios hasta el <fecha>".

---

### User Story 5 - Descubrir que se puede apoyar sin que estorbe (Priority: P3)

Un usuario descubre que puede donar sin que la invitación interrumpa sus tareas.

**Why this priority**: Aumenta las donaciones, pero debe respetar el Principio I (fricción cero):
ninguna invitación puede añadir pasos a capturar el kilometraje o registrar un servicio.

**Independent Test**: El acceso "Apoya Car Checkup" está siempre disponible en un lugar fijo de
la app; la tarjeta de invitación aparece solo en la pantalla principal, nunca durante el alta de
vehículos, la captura de kilometraje o el registro de un servicio, y nunca a un donante con
beneficio vigente.

**Acceptance Scenarios**:

1. **Given** cualquier pantalla principal, **When** el usuario busca cómo apoyar, **Then**
   encuentra "Apoya Car Checkup" en un lugar fijo, a un toque.
2. **Given** un flujo de captura en curso, **When** se usa la app, **Then** nunca aparece una
   invitación a donar dentro de ese flujo.
3. **Given** un usuario sin beneficio vigente que ya registró su primer servicio, **When** abre la
   pantalla principal, **Then** ve una tarjeta discreta invitando a apoyar, debajo del contenido
   principal, con un botón para cerrarla.
4. **Given** que el usuario cierra la tarjeta, **When** vuelve a la pantalla principal, **Then**
   no la ve otra vez en 90 días.
5. **Given** un usuario con beneficio vigente (donación única o mensual), **When** usa la app o
   recibe correos, **Then** no ve la tarjeta ni ninguna mención de donaciones; el acceso fijo
   sigue disponible.

---

### Edge Cases

- El usuario toca dos veces "Tarjeta": no se crean dos cobros; se reutiliza la misma sesión de
  pago mientras siga abierta.
- La confirmación del proveedor llega dos veces o fuera de orden: la donación se registra una sola
  vez y su estado final es el correcto.
- La confirmación llega con una firma inválida: se descarta y no cambia ningún estado.
- El usuario cierra la app durante el pago y vuelve horas después: ve el estado real de su
  donación en "Mis donaciones".
- Monto fuera de límites (menor al mínimo o mayor al máximo): la app lo indica antes de ir al
  proveedor.
- Sin conexión: el botón de donar se desactiva con un mensaje claro; no hay donaciones offline.
- Un proveedor no está disponible o mal configurado: la app muestra solo el medio que sí funciona;
  si ninguno funciona, la pantalla explica que donar no está disponible por ahora.
- El usuario elimina un vehículo: las donaciones no dependen de vehículos y no cambian.
- El usuario elimina su cuenta: sus donaciones se conservan sin vínculo con él (anónimas) para
  fines contables; su donación mensual se cancela antes en el proveedor.
- PayPal en una moneda distinta: el donante paga en MXN y PayPal o su banco hacen la conversión;
  la app registra el monto en MXN.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: La app DEBE ofrecer una pantalla "Apoya Car Checkup" accesible desde un lugar fijo
  de la navegación, a un toque desde la pantalla principal.
- **FR-002**: La pantalla DEBE mostrar en lenguaje sencillo para qué se usan las donaciones, 3
  montos sugeridos (50, 100 y 200 MXN) y un campo "Otro monto".
- **FR-003**: Los montos DEBEN estar entre 20 y 10.000 MXN, en pesos enteros; la app valida antes
  de ir al proveedor.
- **FR-004**: El usuario DEBE poder elegir entre pagar con tarjeta (Stripe) o con PayPal; ambos
  con el mismo monto y sin volver a escribirlo.
- **FR-005**: El pago DEBE realizarse en la página segura del proveedor; la app nunca recibe ni
  guarda números de tarjeta o credenciales de PayPal.
- **FR-006**: Una donación DEBE quedar "Confirmada" solo cuando el proveedor la confirme mediante
  un aviso con firma verificada (constitución); el regreso del usuario a la app no basta.
- **FR-007**: Cada confirmación DEBE procesarse una sola vez aunque llegue repetida.
- **FR-008**: Al volver del proveedor, la app DEBE mostrar uno de: agradecimiento (confirmada),
  "Estamos confirmando tu pago" (pendiente) o "No se realizó ningún cargo" (cancelada/fallida).
- **FR-009**: Los reembolsos y disputas notificados por el proveedor DEBEN cambiar el estado de la
  donación ("Reembolsada" / "En disputa").
- **FR-010**: El usuario DEBE poder ver "Mis donaciones" con fecha, monto, moneda, medio y estado,
  y un correo de contacto para dudas o reembolsos. La app no ofrece solicitar reembolsos; se hacen
  desde el panel del proveedor y se reflejan por FR-009.
- **FR-011**: Al confirmarse una donación, el usuario DEBE recibir un correo de agradecimiento
  con fecha, monto y medio de pago, usando el mismo servicio de correo de la feature 003. Se envía
  aunque el usuario se haya dado de baja de los recordatorios (es un comprobante, no un
  recordatorio), excepto si su correo está marcado como no entregable (rebote o queja).
- **FR-012**: Ninguna invitación a donar DEBE aparecer dentro de los flujos de alta de vehículo,
  captura de kilometraje o registro de servicio (Principio I).
- **FR-012a**: La pantalla principal DEBE mostrar una tarjeta discreta de invitación a usuarios
  sin beneficio vigente que ya registraron al menos un servicio; se cierra con un toque y no
  vuelve a mostrarse en 90 días.
- **FR-012b**: Un usuario con beneficio vigente NO DEBE ver la tarjeta ni ninguna mención de
  donaciones en la app ni en los correos (incluido el resumen diario de la feature 003).
- **FR-013**: Cada donación única confirmada DEBE dar 30 días sin anuncios por cada 50 MXN,
  proporcional y redondeado hacia abajo a días completos (20 MXN = 12 días; 100 MXN = 60 días).
  Los días se suman al final del beneficio vigente; si hay una donación mensual activa, se
  guardan y empiezan a contar al terminar el último periodo pagado de esa donación mensual.
- **FR-014**: El usuario DEBE poder elegir entre donación "Una vez" o "Cada mes". Solo puede
  tener una donación mensual activa; los montos y límites son los mismos (FR-002, FR-003).
- **FR-014a**: Una donación mensual activa DEBE quitar los anuncios hasta el final del último
  periodo pagado.
- **FR-014b**: El usuario DEBE poder cancelar su donación mensual desde "Mis donaciones" con una
  confirmación; no se vuelve a cobrar y el beneficio dura hasta el final del periodo pagado.
- **FR-014c**: Los cobros mensuales confirmados, los fallidos y las cancelaciones hechas desde el
  proveedor DEBEN reflejarse en la app ("Activa", "Con problema de pago", "Cancelada"). Con "Con
  problema de pago", "Mis donaciones" DEBE mostrar cómo actualizar el medio de pago: con tarjeta,
  un enlace al portal de cliente del proveedor; con PayPal, instrucciones para hacerlo en su
  cuenta de PayPal.
- **FR-014d**: Los reembolsos y disputas DEBEN retirar los días sin anuncios que dio esa donación.
- **FR-015**: Si un medio de pago no está configurado o no responde, la app DEBE ocultar ese medio
  y seguir ofreciendo el otro.
- **FR-016**: La app DEBE mostrar al donante hasta qué fecha no verá anuncios.

### Key Entities *(include if feature involves data)*

- **Donación**: usuario, tipo (única o cobro mensual), proveedor (Stripe o PayPal), monto y moneda, estado (Pendiente,
  Confirmada, Cancelada, Fallida, Reembolsada, En disputa), identificador del pago en el
  proveedor, fechas de creación y confirmación.
- **Donación mensual**: usuario, proveedor, monto, estado (Activa, Con problema de pago,
  Cancelada), fin del periodo pagado, fecha del siguiente cargo, identificador en el proveedor.
  Cada cobro mensual confirmado se registra también como una Donación.
- **Beneficio sin anuncios**: por usuario, fecha hasta la que no hay anuncios = fin del periodo
  pagado de la donación mensual (si la hay) más los días acumulados de donaciones únicas.
- **Evento del proveedor**: identificador único del aviso, tipo, fecha de recepción; sirve para
  no procesar dos veces el mismo aviso.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un usuario completa una donación con un monto sugerido en menos de 1 minuto y con
  un máximo de 3 toques dentro de la app antes de llegar al proveedor.
- **SC-002**: El 100 % de las donaciones marcadas como "Confirmadas" corresponden a un pago
  confirmado por el proveedor; 0 donaciones duplicadas por avisos repetidos.
- **SC-003**: El 95 % de las donaciones confirmadas se ven como tales en la app en menos de
  1 minuto tras completar el pago.
- **SC-004**: 0 invitaciones a donar dentro de los flujos de captura (verificado en pruebas).
- **SC-006**: El 100 % de los donantes con beneficio vigente ven la fecha de fin del beneficio y
  0 menciones de donaciones en la app o en los correos (verificado en pruebas).
- **SC-007**: Cancelar una donación mensual toma 3 toques o menos desde la pantalla principal y
  no se realiza ningún cargo posterior.
- **SC-005**: El correo de agradecimiento llega en menos de 5 minutos tras la confirmación en el
  95 % de los casos.

## Assumptions

- Moneda principal: pesos mexicanos (MXN), coherente con la zona horaria por defecto
  (America/Mexico_City); otros países pagan en MXN y su banco o PayPal convierte.
- Solo usuarios con sesión pueden donar (toda la app requiere sesión); así las donaciones quedan
  en su historial.
- No se emiten facturas fiscales (CFDI); el correo de agradecimiento es un comprobante informativo.
- Las comisiones de Stripe y PayPal las absorbe el proyecto; el donante paga el monto elegido.
- Las cuentas de Stripe y PayPal del proyecto (modo prueba y producción) las crea el responsable
  del proyecto; la app solo usa sus claves, que se configuran fuera del código (constitución).
- La feature de anuncios (AdSense) aún no existe: esta feature registra el beneficio y su fecha
  de fin; la feature de anuncios DEBE consultarla y no mostrar anuncios mientras esté vigente.
- Los avisos para actualizar el medio de pago de una donación mensual los envía el proveedor; la
  app solo muestra el estado.
- El historial de donaciones se conserva indefinidamente por obligaciones contables, incluso si el
  usuario deja de usar la app.
