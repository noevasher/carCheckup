# Feature Specification: Gestión de Vehículos y Registro Rápido de Kilometraje

**Feature Branch**: `001-vehicles-mileage`

**Created**: 2026-10-20

**Status**: Draft

**Input**: User description: "Vehículos + kilometraje: alta de N vehículos por usuario y registro
rápido de kilometraje desde la pantalla principal; base de todo lo demás."

## Clarifications

### Session 2026-10-20

- Q: ¿La captura de kilometraje sin conexión entra en esta primera versión? → A: Sí, offline
  completo: lecturas guardadas en el dispositivo, marcadas como pendientes y sincronizadas
  automáticamente sin duplicados.
- Q: ¿Cómo se identifican marca y modelo del vehículo? → A: Catálogo + texto libre: si el
  usuario elige del catálogo, el vehículo queda vinculado a esa entrada; si no aparece, se guarda
  el texto libre y el vehículo se considera no catalogado.
- Q: ¿Qué unidad de distancia se admite? → A: Solo kilómetros; las millas quedan para una
  versión posterior.
- Q: ¿El alta debe pedir datos extra para el futuro motor de estimación? → A: Sí, tipo de
  combustible y uso habitual, ambos opcionales.
- Q: ¿Puede el usuario registrar una lectura con una fecha pasada? → A: Sí, opcional: por
  defecto la fecha actual; puede cambiarse a una fecha pasada (nunca futura) sin añadir toques al
  flujo rápido, y el valor debe quedar entre las lecturas vecinas.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Registrar mi primer vehículo (Priority: P1)

Un usuario recién registrado, sin conocimientos de mecánica, da de alta su vehículo indicando
solo lo imprescindible (marca, modelo, año y kilometraje actual) para empezar a usar la app.

**Why this priority**: Sin un vehículo registrado no existe ningún otro flujo del producto
(kilometraje, estimaciones, recordatorios). Es el punto de entrada obligatorio.

**Independent Test**: Un usuario sin vehículos completa el alta y ve su vehículo en la pantalla
principal con el kilometraje inicial indicado.

**Acceptance Scenarios**:

1. **Given** un usuario autenticado sin vehículos, **When** abre la app, **Then** se le guía
   directamente al alta de vehículo en lugar de mostrar una pantalla vacía.
2. **Given** el formulario de alta, **When** el usuario elige marca y modelo de las sugerencias,
   indica año y kilometraje actual y confirma, **Then** el vehículo queda guardado y aparece en
   la pantalla principal con ese kilometraje como primera lectura.
3. **Given** una marca o modelo que no aparece en las sugerencias, **When** el usuario lo escribe
   libremente, **Then** el sistema lo acepta sin bloquear el alta.
4. **Given** un campo obligatorio vacío o un año/kilometraje no válido, **When** el usuario
   intenta guardar, **Then** se le indica qué campo corregir con un mensaje en lenguaje claro.
5. **Given** el formulario de alta, **When** el usuario deja sin indicar el tipo de combustible y
   el uso habitual, **Then** el vehículo se guarda igualmente y esos datos pueden completarse
   después desde la edición del vehículo.

---

### User Story 2 - Actualizar el kilometraje en segundos (Priority: P1)

El usuario abre la app junto a su coche, ve el vehículo activo en la pantalla principal y
registra la lectura actual del odómetro sin navegar a otras pantallas.

**Why this priority**: Es el flujo crítico definido por la constitución (Principio I). La
frescura de este dato determina la calidad de todas las alertas futuras.

**Independent Test**: Con un vehículo existente, el usuario registra una nueva lectura desde la
pantalla principal con un máximo de 2 toques más la escritura del número, y la pantalla muestra
el kilometraje actualizado.

**Interacciones del flujo principal**: 1 toque para abrir la captura (con el campo numérico ya
enfocado y el teclado numérico abierto) + escritura del valor + 1 toque para confirmar = **2
toques**.

**Acceptance Scenarios**:

1. **Given** un usuario con un vehículo, **When** toca la acción de actualizar kilometraje en la
   pantalla principal, **Then** aparece la captura con el teclado numérico listo y el último
   kilometraje conocido visible como referencia.
2. **Given** la captura abierta, **When** introduce un valor mayor o igual al último registrado y
   confirma, **Then** la lectura se guarda con la fecha y hora actuales y la pantalla principal
   refleja el nuevo valor sin pasos adicionales.
3. **Given** un valor menor que la última lectura, **When** intenta confirmar, **Then** el sistema
   no lo guarda y explica que el kilometraje no puede disminuir, ofreciendo corregir la última
   lectura si fue un error.
4. **Given** la captura abierta, **When** el usuario cambia la fecha a un día pasado e introduce
   un valor comprendido entre las lecturas anterior y posterior a esa fecha, **Then** la lectura
   se guarda en su posición cronológica; si el valor no encaja, se rechaza explicando el rango
   válido.
5. **Given** un valor que implica un recorrido inusualmente alto desde la última lectura, **When**
   confirma, **Then** el sistema pide una confirmación adicional antes de guardarlo.
6. **Given** el usuario sin conexión, **When** registra una lectura, **Then** esta queda guardada
   en el dispositivo, se muestra como pendiente de sincronizar y se sincroniza automáticamente al
   recuperar la conexión.

---

### User Story 3 - Gestionar varios vehículos (Priority: P2)

Un usuario con más de un vehículo (p. ej., el suyo y el de su pareja) los registra todos, cambia
entre ellos y actualiza el kilometraje de cualquiera.

**Why this priority**: La constitución exige soportar N vehículos por usuario, pero la mayoría
de usuarios empezará con uno; aporta valor una vez existe el flujo básico.

**Independent Test**: Un usuario añade un segundo vehículo, cambia el vehículo activo desde la
pantalla principal y registra kilometraje en cada uno de forma independiente.

**Acceptance Scenarios**:

1. **Given** un usuario con un vehículo, **When** añade otro, **Then** ambos aparecen en la
   pantalla principal y el recién creado pasa a ser el vehículo activo.
2. **Given** varios vehículos, **When** el usuario cambia el vehículo activo con un solo toque,
   **Then** la acción de actualizar kilometraje aplica a ese vehículo.
3. **Given** varios vehículos, **When** el usuario vuelve a abrir la app, **Then** el vehículo
   activo por defecto es el último con el que interactuó.

---

### User Story 4 - Editar, consultar historial y eliminar (Priority: P3)

El usuario corrige datos de un vehículo, consulta el historial de lecturas de kilometraje,
corrige o elimina una lectura errónea y elimina un vehículo que ya no tiene.

**Why this priority**: Necesario para mantener los datos correctos, pero no bloquea el uso
básico del producto.

**Independent Test**: El usuario edita el año de un vehículo, elimina una lectura errónea del
historial y elimina un vehículo tras confirmar, verificando que los cambios se reflejan.

**Acceptance Scenarios**:

1. **Given** un vehículo, **When** el usuario edita sus datos y guarda, **Then** los cambios se
   reflejan inmediatamente.
2. **Given** un vehículo con lecturas, **When** abre su historial, **Then** ve las lecturas
   ordenadas de la más reciente a la más antigua con fecha y valor.
3. **Given** una lectura errónea, **When** la elimina o corrige, **Then** el kilometraje actual
   del vehículo se recalcula a partir de las lecturas restantes, manteniendo que los valores no
   disminuyan en el tiempo.
4. **Given** un vehículo, **When** el usuario solicita eliminarlo, **Then** el sistema pide
   confirmación explícita advirtiendo que se borrará su historial, y solo tras confirmar lo
   elimina.

---

### Edge Cases

- ¿Qué pasa si el usuario intenta eliminar la única lectura válida que le queda a un vehículo
  (sea o no la del alta)? No se permite: todo vehículo conserva al menos una lectura válida, que
  solo puede corregirse. La lectura del alta puede eliminarse si existen otras.
- ¿Qué pasa si el usuario intenta dar de alta o editar un vehículo sin conexión? El sistema se lo
  indica con un mensaje claro, conserva lo escrito en el formulario y le permite guardarlo en
  cuanto vuelva la conexión. Solo el registro de lecturas funciona sin conexión.
- ¿Qué pasa si se registran dos lecturas offline desde dos dispositivos con valores
  incompatibles? Al sincronizar, se conservan ambas ordenadas por fecha de la lectura; si alguna
  rompe la regla de no disminución, se marca para que el usuario la revise.
- ¿Qué pasa si se cambió el odómetro del vehículo (reemplazo o reinicio)? Fuera de alcance en
  esta versión; el usuario puede corregir lecturas manualmente.
- ¿Qué pasa si el usuario introduce separadores de miles o decimales? Se aceptan separadores de
  miles y se ignoran decimales; solo se almacenan kilómetros enteros.
- ¿Qué pasa con un año de fabricación futuro o muy antiguo? Se acepta desde 1950 hasta el año
  actual + 1 (modelos del año siguiente).
- ¿Qué pasa si un usuario intenta ver o modificar un vehículo de otra cuenta? El sistema lo
  impide; cada usuario solo accede a sus propios vehículos.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Los usuarios DEBEN poder registrar un vehículo indicando marca, modelo, año y
  kilometraje actual como únicos campos obligatorios; apodo, matrícula, tipo de combustible y
  uso habitual son opcionales y DEBEN poder omitirse sin pasos adicionales.
- **FR-001a**: El tipo de combustible DEBE elegirse entre: gasolina, diésel, híbrido o eléctrico.
  El uso habitual DEBE elegirse entre: ciudad, carretera o mixto. Ambos DEBEN poder completarse o
  cambiarse más tarde al editar el vehículo.
- **FR-002**: El sistema DEBE sugerir marcas y modelos de un catálogo mientras el usuario
  escribe. Si el usuario elige una sugerencia, el vehículo DEBE quedar vinculado a esa entrada
  del catálogo; si escribe un valor que no está en el catálogo, el sistema DEBE aceptarlo como
  texto libre y marcar el vehículo como no catalogado.
- **FR-003**: El sistema DEBE guardar el kilometraje indicado en el alta como primera lectura del
  vehículo.
- **FR-004**: Los usuarios DEBEN poder registrar un número ilimitado de vehículos en su cuenta.
- **FR-005**: La pantalla principal DEBE mostrar el vehículo activo con su kilometraje actual, la
  fecha de la última lectura y una acción de actualizar kilometraje accesible sin navegación
  intermedia.
- **FR-006**: El flujo de actualización de kilometraje DEBE completarse con un máximo de 2 toques
  más la escritura del valor, abriéndose con el campo numérico enfocado y el teclado numérico.
- **FR-007**: El sistema DEBE registrar cada lectura con su valor (km enteros) y la fecha/hora de
  la lectura, usando por defecto la fecha/hora actual. El usuario PUEDE cambiarla a una fecha
  pasada desde la misma captura; cambiarla es opcional y no cuenta en los 2 toques del flujo
  principal. No se admiten fechas futuras.
- **FR-008**: El sistema DEBE rechazar una lectura cuyo valor sea menor que el de la lectura
  inmediatamente anterior en fecha o mayor que el de la inmediatamente posterior, y explicar el
  motivo en lenguaje claro.
- **FR-009**: El sistema DEBE pedir una confirmación adicional cuando una lectura implique un
  promedio superior a 1.500 km por día desde la lectura anterior.
- **FR-010**: Los usuarios DEBEN poder capturar lecturas sin conexión; las lecturas pendientes
  DEBEN marcarse visiblemente y sincronizarse automáticamente al recuperar la conexión, sin
  duplicados.
- **FR-011**: Los usuarios DEBEN poder cambiar el vehículo activo desde la pantalla principal con
  un solo toque; el sistema DEBE recordar el último vehículo activo entre sesiones.
- **FR-012**: Los usuarios DEBEN poder editar los datos de un vehículo, consultar su historial de
  lecturas y corregir o eliminar lecturas individuales (salvo la última que quede).
- **FR-013**: Los usuarios DEBEN poder eliminar un vehículo tras una confirmación explícita que
  advierta que se borrará su historial.
- **FR-014**: El sistema DEBE restringir cada vehículo y lectura a su usuario propietario; ningún
  usuario puede ver ni modificar datos de otro.
- **FR-015**: Todos los mensajes de validación DEBEN usar lenguaje claro y no técnico, indicando
  qué campo corregir y cómo.
- **FR-016**: Cuando un usuario sin vehículos abra la app, el sistema DEBE llevarlo directamente
  al alta de vehículo.

### Key Entities *(include if feature involves data)*

- **Usuario**: Persona propietaria de la cuenta. Tiene cero o más vehículos y recuerda cuál es su
  vehículo activo.
- **Vehículo**: Coche perteneciente a un usuario. Atributos: marca, modelo, año, apodo
  (opcional), matrícula (opcional), tipo de combustible (opcional), uso habitual (opcional),
  fecha de alta, referencia al modelo del catálogo (vacía si
  es no catalogado). Su kilometraje actual es el de su lectura más
  reciente.
- **Modelo de catálogo**: Combinación marca/modelo conocida por el sistema que sirve para las
  sugerencias y, en features posteriores, para asociar intervalos de mantenimiento específicos.
- **Lectura de kilometraje**: Registro del odómetro de un vehículo en un momento dado. Atributos:
  valor en km enteros, fecha/hora de la lectura (actual o pasada), origen (alta inicial o actualización) y estado de
  sincronización. Pertenece a un único vehículo; las lecturas de un vehículo no disminuyen con
  el tiempo.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un usuario nuevo completa el alta de su primer vehículo en menos de 60 segundos.
- **SC-002**: Una actualización de kilometraje se completa en menos de 10 segundos desde que la
  pantalla principal está visible, con un máximo de 2 toques.
- **SC-003**: El 90 % de los usuarios en pruebas completa el alta y la primera actualización de
  kilometraje sin ayuda en el primer intento.
- **SC-004**: El 100 % de las lecturas capturadas sin conexión se sincroniza sin pérdidas ni
  duplicados al recuperar la conectividad.
- **SC-005**: Al menos el 60 % de los usuarios activos registra una lectura de kilometraje en
  cada periodo de 30 días.
- **SC-006**: La pantalla principal muestra el vehículo activo y su kilometraje en menos de
  2 segundos en una conexión móvil típica, independientemente del número de vehículos del
  usuario.

## Assumptions

- El registro completo de cuentas (recuperación de contraseña, perfil, proveedores sociales) se
  especifica en otra feature. Esta feature incluye solo un inicio de sesión mínimo con el
  proveedor de autenticación del proyecto (enlace mágico por correo), necesario para usar y
  validar la app.
- El alta, la edición y la eliminación de vehículos requieren conexión en esta versión.
- El kilometraje se maneja en kilómetros; el soporte de millas queda fuera de alcance en esta
  versión.
- El catálogo de marcas y modelos no restringe el alta; su fuente y mantenimiento se definen en
  la planificación. Los vehículos no catalogados recibirán estimaciones genéricas en features
  posteriores.
- El umbral de 1.500 km/día para lecturas inusuales es un valor inicial ajustable.
- El motor de estimación, las alertas de mantenimiento, los recordatorios y el historial de
  servicios quedan fuera de alcance y se especificarán en features posteriores que consumirán
  las lecturas definidas aquí.
- La gestión del reemplazo o reinicio del odómetro queda fuera de alcance.
- Los vehículos no se comparten entre cuentas en esta versión.
