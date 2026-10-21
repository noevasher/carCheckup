# Feature Specification: Motor de Estimación de Mantenimiento

**Feature Branch**: `002-maintenance-estimation`

**Created**: 2026-10-20

**Status**: Draft

**Input**: User description: "Motor de estimación de mantenimiento: para cada vehículo calcular los
próximos servicios recomendados (cambio de aceite, filtros, frenos, llantas, etc.), los km
restantes y la fecha estimada según el ritmo de uso derivado de sus lecturas de kilometraje,
mostrando alertas explicables en la pantalla principal (qué hacer, cuándo y por qué), y permitir
registrar cuándo se realizó cada servicio para reiniciar su cálculo"

## Clarifications

### Session 2026-10-20

- Q: ¿Desde dónde se calcula un mantenimiento sin historial? → A: Se supone que se hizo al
  registrar el vehículo en la app (km y fecha de alta). Además, mientras no haya lecturas
  suficientes para calcular el ritmo real, el ritmo por defecto se estima según el uso habitual
  indicado (ciudad, carretera o mixto).
- Q: ¿El uso "Ciudad" debe acortar los intervalos? → A: Sí, con uso "Ciudad" se reduce un 20 % el
  intervalo en km de aceite, filtros y frenos.
- Q: ¿Qué debe pasar si al registrar un servicio el km del taller es mayor que el último
  kilometraje registrado en la app? → A: Se acepta y ese km se registra también como nueva
  lectura de kilometraje del vehículo, con las mismas validaciones de orden y plausibilidad.
- Q: ¿El usuario puede crear sus propios tipos de mantenimiento? → A: No en esta versión; en su
  lugar se amplía el catálogo inicial con banda de distribución, alineación y balanceo, cambio de
  llantas y aceite de transmisión.
- Q: ¿El usuario puede posponer una alerta de mantenimiento sin marcarla como hecha? → A: Sí,
  "Recuérdamelo en una semana" la oculta de la pantalla principal durante 7 días; en el detalle
  sigue visible con su estado real.
- Q: Si el usuario tiene varios vehículos, ¿cómo se entera de que uno que no está activo tiene un
  mantenimiento vencido? → A: El chip de cada vehículo en el selector muestra una marca si tiene
  mantenimientos vencidos o próximos; al tocarlo se ven sus alertas.
- Q: ¿Qué debe mostrar la pantalla principal cuando todos los mantenimientos del vehículo están
  "Al día"? → A: Una línea "Todo al día" y solo el próximo mantenimiento (qué y cuándo), con
  enlace al detalle.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ver qué mantenimiento toca y cuándo (Priority: P1)

Un usuario sin conocimientos de mecánica abre la app y, junto a su vehículo, ve los próximos
mantenimientos más urgentes: qué hay que hacer, cuántos kilómetros faltan, en qué fecha
aproximada tocará y por qué se recomienda.

**Why this priority**: Es la propuesta de valor central del producto (Visión Técnica y
Principio V de la constitución). Sin ella, registrar el kilometraje no le aporta nada al usuario.

**Independent Test**: Con un vehículo que tiene varias lecturas de kilometraje, la pantalla
principal muestra los mantenimientos más próximos con km restantes, fecha estimada y una
explicación, y la lista completa está disponible en una pantalla de detalle.

**Acceptance Scenarios**:

1. **Given** un vehículo con mantenimientos vencidos o próximos, **When** el usuario abre la
   pantalla principal, **Then** ve hasta 3 de ellos ordenados por urgencia, cada uno con su
   nombre en lenguaje claro, km restantes y fecha estimada.
2. **Given** un mantenimiento cuyo kilometraje o fecha ya se superó, **When** se muestra,
   **Then** aparece marcado como "Vencido" e indica por cuántos km o días se pasó.
3. **Given** un mantenimiento que vence en menos de 1.000 km o 30 días, **When** se muestra,
   **Then** aparece marcado como "Próximo".
4. **Given** cualquier mantenimiento mostrado, **When** el usuario pide la explicación,
   **Then** ve en qué se basa el cálculo: intervalo aplicado (km y/o meses, y si se redujo por
   uso en ciudad), último servicio considerado, kilometraje actual y ritmo de uso estimado.
5. **Given** un vehículo con uso habitual "Ciudad", **When** se calcula el cambio de aceite con
   el intervalo recomendado, **Then** el intervalo aplicado es 8.000 km en lugar de 10.000 km.
6. **Given** un vehículo recién registrado con una sola lectura y uso "Carretera", **When** se
   calcula la fecha estimada, **Then** se usa un ritmo de 60 km/día y la explicación indica que
   es un promedio por su uso habitual.
7. **Given** el usuario abre el detalle de mantenimientos del vehículo, **When** se carga,
   **Then** ve todos los mantenimientos aplicables a ese vehículo con su estado.
8. **Given** una alerta en la pantalla principal, **When** el usuario elige "Recuérdamelo en
   una semana", **Then** la alerta deja de mostrarse en la pantalla principal durante 7 días y
   su lugar lo ocupa el siguiente mantenimiento más urgente; en el detalle sigue apareciendo con
   su estado real y la indicación "pospuesto hasta <fecha>".
9. **Given** un vehículo eléctrico, **When** se calculan sus mantenimientos, **Then** no
   aparecen servicios que no le aplican (p. ej., cambio de aceite de motor o bujías).
10. **Given** un usuario con varios vehículos y un mantenimiento vencido en uno que no es el
    activo, **When** ve la pantalla principal, **Then** el chip de ese vehículo en el selector
    muestra una marca de "vencido" con el número de mantenimientos vencidos, y al tocarlo se
    muestran sus alertas.
11. **Given** un vehículo con todos sus mantenimientos "Al día", **When** el usuario abre la
    pantalla principal, **Then** ve "Todo al día" y el siguiente mantenimiento con su fecha
    estimada, con enlace al detalle completo.

---

### User Story 2 - Registrar que hice un mantenimiento (Priority: P1)

Cuando el usuario lleva su vehículo al taller, registra que se hizo un mantenimiento para que el
cálculo de ese servicio se reinicie desde ese momento.

**Why this priority**: Sin registrar servicios, todas las alertas acabarían en "Vencido" para
siempre y perderían credibilidad. Es imprescindible para que el motor sea útil más allá del
primer ciclo.

**Independent Test**: Sobre un mantenimiento "Vencido", el usuario registra que lo hizo hoy; el
mantenimiento pasa a "Al día" y su próxima fecha y km se recalculan desde ese servicio.

**Interacciones del flujo principal**: 1 toque en "Ya lo hice" sobre la alerta (fecha de hoy y
kilometraje actual ya rellenados) + 1 toque para confirmar = **2 toques**.

**Acceptance Scenarios**:

1. **Given** un mantenimiento mostrado en la pantalla principal o en el detalle, **When** el
   usuario toca "Ya lo hice" y confirma, **Then** se registra el servicio con la fecha de hoy y
   el kilometraje actual, y el mantenimiento se recalcula a partir de ese registro.
2. **Given** el registro de un servicio, **When** el usuario cambia la fecha a un día pasado o
   el kilometraje en que se hizo, **Then** el cálculo usa esos valores.
3. **Given** que en una visita al taller se hicieron varios servicios, **When** el usuario los
   registra, **Then** puede marcar varios mantenimientos en un único registro.
4. **Given** una fecha de servicio futura, o un kilometraje que no encaja con las lecturas
   anteriores y posteriores a esa fecha, **When** intenta guardar, **Then** el sistema lo
   rechaza explicando por qué y cuál es el rango válido.
5. **Given** que el kilometraje del taller es mayor que el último registrado en la app,
   **When** el usuario guarda el servicio, **Then** el servicio se guarda y ese kilometraje
   queda registrado también como nueva lectura del vehículo, sin pasos adicionales.
6. **Given** un servicio registrado por error, **When** el usuario lo elimina o corrige desde el
   historial de servicios, **Then** el mantenimiento se recalcula con el registro anterior que
   quede.

---

### User Story 3 - Indicar el historial previo de mantenimientos (Priority: P2)

Un usuario que ya tenía su vehículo antes de usar la app indica cuándo se hizo por última vez
cada servicio (si lo sabe), para que las primeras recomendaciones sean realistas.

**Why this priority**: Mejora mucho la precisión inicial, pero el motor funciona sin ello
calculando cada mantenimiento desde el registro del vehículo en la app (FR-015).

**Independent Test**: Para un vehículo recién registrado, el usuario indica la fecha o el km del
último cambio de aceite y el mantenimiento se recalcula desde ese dato.

**Acceptance Scenarios**:

1. **Given** un mantenimiento sin ningún servicio registrado, **When** se muestra, **Then**
   indica que se calculó desde que se registró el vehículo y ofrece "Indicar cuándo se hizo".
2. **Given** el usuario no recuerda cuándo se hizo, **When** elige "No lo sé", **Then** el
   sistema mantiene el cálculo desde el registro del vehículo y deja de preguntarle por ese
   mantenimiento.
3. **Given** el usuario indica solo el mes/año aproximado o solo el kilometraje aproximado,
   **When** guarda, **Then** el sistema lo acepta y calcula con el dato disponible.

---

### User Story 4 - Ajustar mantenimientos a mi vehículo (Priority: P3)

Un usuario cuyo manual o taller indica intervalos distintos ajusta el intervalo de un
mantenimiento, o desactiva uno que no aplica a su vehículo.

**Why this priority**: Los intervalos genéricos son razonables para la mayoría; personalizarlos
es útil para usuarios más involucrados, pero no es necesario para el valor básico.

**Independent Test**: El usuario cambia el intervalo del cambio de aceite de 10.000 a 15.000 km
y la próxima fecha y km se recalculan; desactiva "Banda de distribución" (su motor usa cadena) y
deja de verse.

**Acceptance Scenarios**:

1. **Given** un mantenimiento, **When** el usuario cambia su intervalo en km y/o meses,
   **Then** el cálculo usa el nuevo intervalo solo para ese vehículo y la explicación indica que
   es un intervalo personalizado.
2. **Given** un mantenimiento personalizado, **When** el usuario elige "Volver al recomendado",
   **Then** se restaura el intervalo por defecto.
3. **Given** un mantenimiento que no aplica, **When** el usuario lo desactiva, **Then** deja de
   mostrarse en alertas y detalle, y puede reactivarse después.

---

### Edge Cases

- ¿Qué pasa si el vehículo tiene una sola lectura de kilometraje o lecturas que abarcan menos de
  7 días? El ritmo de uso no se puede calcular con fiabilidad: se usa el ritmo promedio según el
  uso habitual indicado (ciudad 30 km/día, carretera 60 km/día, mixto o sin indicar 40 km/día) y
  la explicación lo indica ("ritmo estimado por tu uso en ciudad; se ajustará cuando registres más
  kilometraje").
- ¿Qué pasa si el vehículo no se ha movido (ritmo 0 km/día)? La fecha estimada se rige solo por
  el intervalo de tiempo; si un mantenimiento solo tiene intervalo en km, se muestra "sin fecha
  estimada" y se indica que depende de cuánto se use el vehículo.
- ¿Qué pasa si un mantenimiento tiene intervalo en km y en meses? Vence con lo que ocurra
  primero, y la explicación indica cuál de los dos manda.
- ¿Qué pasa si hay lecturas marcadas "por revisar" (feature 001)? No se usan para calcular el
  ritmo de uso ni el kilometraje actual.
- ¿Qué pasa si se corrige o elimina una lectura de kilometraje? Los mantenimientos del vehículo
  se recalculan con los datos corregidos.
- ¿Qué pasa si el usuario cambia el tipo de combustible o el uso habitual del vehículo? Los
  mantenimientos aplicables y sus intervalos se recalculan.
- ¿Qué pasa si el tipo de combustible no está indicado? Se muestran los mantenimientos comunes a
  vehículos de combustión y se sugiere indicar el combustible para afinar las recomendaciones.
- ¿Qué pasa si el usuario intenta ver o modificar los mantenimientos de un vehículo de otra
  cuenta? El sistema lo impide, igual que con vehículos y lecturas.
- ¿Qué pasa sin conexión? Se muestran los últimos mantenimientos calculados conocidos. Si el
  usuario intenta registrar un servicio sin conexión, el formulario conserva todo lo escrito,
  indica que se guardará al recuperar la señal y permite reintentar sin duplicar el registro.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema DEBE disponer de un catálogo de mantenimientos recomendados, cada uno con
  nombre en lenguaje claro, descripción breve de por qué importa, intervalo en km y/o en meses, y
  tipos de combustible a los que aplica.
- **FR-002**: El catálogo inicial DEBE incluir estos 13 mantenimientos, con los intervalos por
  defecto de la sección Assumptions: cambio de aceite y filtro de aceite, filtro de aire del
  motor, filtro de aire de cabina, rotación de llantas, alineación y balanceo, cambio de llantas,
  revisión de frenos, cambio de líquido de frenos, cambio de anticongelante/refrigerante, bujías,
  banda de distribución, aceite de transmisión y revisión de batería. Los usuarios no pueden
  crear mantenimientos propios en esta versión.
- **FR-003**: El sistema DEBE calcular para cada mantenimiento aplicable a un vehículo: km
  objetivo, km restantes, fecha estimada y estado (Vencido, Próximo o Al día).
- **FR-004**: El km objetivo DEBE ser el km del último servicio considerado + intervalo en km; la
  fecha límite por tiempo DEBE ser la fecha del último servicio considerado + intervalo en meses;
  el mantenimiento vence con lo que ocurra primero.
- **FR-005**: La fecha estimada por km DEBE calcularse con el ritmo de uso del vehículo: promedio
  de km por día entre las lecturas válidas de los últimos 90 días (mínimo 2 lecturas separadas
  al menos 7 días); si no hay datos suficientes, se usan todas las lecturas válidas disponibles
  y, si aun así no alcanza, un ritmo promedio según el uso habitual del vehículo: ciudad
  30 km/día, carretera 60 km/día, mixto o sin indicar 40 km/día.
- **FR-006**: Un mantenimiento DEBE estar "Vencido" si su km objetivo ≤ km actual o su fecha
  límite ≤ hoy; "Próximo" si faltan ≤ 1.000 km o ≤ 30 días; y "Al día" en otro caso.
- **FR-007**: La pantalla principal DEBE mostrar, para el vehículo activo, hasta 3 mantenimientos
  no pospuestos en estado Vencido o Próximo, ordenados por urgencia (vencidos primero, luego por
  fecha estimada más cercana), con nombre, estado, km restantes (o km de retraso) y fecha
  estimada. Si no hay ninguno, DEBE mostrar "Todo al día" y solo el siguiente mantenimiento
  (nombre y fecha estimada), con enlace al detalle.
- **FR-007a**: Los usuarios DEBEN poder posponer una alerta de la pantalla principal durante
  7 días ("Recuérdamelo en una semana") sin registrar el servicio. Posponer no cambia el estado
  ni el cálculo del mantenimiento; el detalle DEBE seguir mostrándolo con la fecha hasta la que
  está pospuesto. Registrar el servicio, cambiar su intervalo o desactivarlo anula el aplazamiento.
- **FR-007b**: En el selector de vehículos, cada vehículo DEBE mostrar una marca cuando tenga
  mantenimientos no pospuestos en estado Vencido (marca de alerta con el número de vencidos) o,
  si no tiene vencidos, en estado Próximo (marca discreta). La marca DEBE tener un texto
  accesible equivalente (p. ej., "2 mantenimientos vencidos").
- **FR-008**: Cada mantenimiento mostrado DEBE poder explicarse indicando: qué hacer y por qué
  (descripción), intervalo aplicado y si es personalizado o reducido por uso en ciudad, último
  servicio considerado (o que se calcula desde el registro del vehículo), kilometraje actual,
  ritmo de uso y su origen (lecturas o promedio por uso habitual), y cuál de los dos límites
  (km o tiempo) determina la fecha.
- **FR-009**: Los usuarios DEBEN poder ver el detalle de todos los mantenimientos aplicables de
  un vehículo con su estado.
- **FR-010**: Los usuarios DEBEN poder registrar un servicio realizado en 2 toques desde una
  alerta, con fecha (por defecto hoy) y kilometraje (por defecto el actual) editables, y notas
  opcionales.
- **FR-011**: Un registro de servicio DEBE poder incluir uno o varios mantenimientos realizados
  en la misma visita.
- **FR-012**: El sistema DEBE rechazar registros de servicio con fecha futura o con un
  kilometraje que no encaje entre las lecturas de kilometraje anterior y posterior a esa fecha
  (mismas reglas de orden que las lecturas, feature 001), explicando el motivo y el rango válido
  en lenguaje claro.
- **FR-012a**: Cuando el kilometraje de un servicio sea mayor que el último kilometraje
  registrado del vehículo, el sistema DEBE guardar el servicio y registrar ese kilometraje como
  nueva lectura del vehículo en la misma operación, aplicando la confirmación de distancia
  inusual de la feature 001 si corresponde.
- **FR-013**: Para cada mantenimiento, el último servicio considerado DEBE ser el registro más
  reciente (por fecha) que lo incluya; al registrar, corregir o eliminar servicios, el cálculo
  DEBE actualizarse.
- **FR-014**: Los usuarios DEBEN poder consultar el historial de servicios de un vehículo y
  corregir o eliminar registros.
- **FR-015**: Cuando un mantenimiento no tenga ningún servicio registrado ni historial previo
  indicado por el usuario, el sistema DEBE calcularlo como si se hubiera hecho al registrar el
  vehículo en la app (kilometraje y fecha de la lectura inicial), y la explicación DEBE indicarlo
  ("calculado desde que registraste el vehículo; indica cuándo se hizo para afinarlo").
- **FR-016**: Los usuarios DEBEN poder indicar, para un mantenimiento sin historial, la fecha
  y/o el kilometraje aproximados del último servicio, o indicar que no lo saben.
- **FR-017**: El cálculo DEBE tener en cuenta el tipo de combustible del vehículo para decidir
  qué mantenimientos aplican. Con uso habitual "Ciudad", el intervalo en km de los mantenimientos
  marcados como sensibles a uso severo (cambio de aceite y filtro de aceite, filtro de aire del
  motor, filtro de aire de cabina y revisión de frenos) DEBE reducirse un 20 %, y la explicación
  DEBE indicarlo ("uso en ciudad: intervalo reducido de 10.000 a 8.000 km"). Los intervalos
  personalizados por el usuario no se ajustan.
- **FR-018**: Los usuarios DEBEN poder personalizar el intervalo en km y/o meses de cualquier
  mantenimiento de un vehículo, restaurar el recomendado, y desactivar o reactivar
  mantenimientos para ese vehículo.
- **FR-019**: Los mantenimientos DEBEN recalcularse cuando cambien las lecturas de kilometraje,
  los servicios registrados, el combustible o uso habitual, o las personalizaciones del vehículo.
- **FR-020**: Todos los textos de mantenimientos, estados, explicaciones y errores DEBEN usar
  lenguaje claro y no técnico; cualquier término mecánico DEBE incluir una explicación breve.
- **FR-021**: El sistema DEBE restringir mantenimientos, servicios y personalizaciones al usuario
  propietario del vehículo.

### Key Entities *(include if feature involves data)*

- **Mantenimiento recomendado (catálogo)**: Tipo de servicio que el sistema sabe recomendar.
  Atributos: nombre, descripción en lenguaje claro, intervalo en km (opcional), intervalo en
  meses (opcional), combustibles a los que aplica, si su intervalo en km se reduce por uso en
  ciudad.
- **Configuración de mantenimiento por vehículo**: Personalización opcional de un mantenimiento
  para un vehículo concreto: intervalo personalizado en km/meses, activo o desactivado, y dato de
  historial previo indicado por el usuario (fecha y/o km aproximados, o "no lo sé"), y fecha
  hasta la que la alerta está pospuesta (opcional).
- **Registro de servicio**: Visita en la que se realizaron uno o varios mantenimientos.
  Atributos: vehículo, fecha, kilometraje, mantenimientos incluidos, notas opcionales.
- **Estimación de mantenimiento**: Resultado calculado (no introducido por el usuario) para un
  vehículo y un mantenimiento: km objetivo, km restantes, fecha límite por tiempo, fecha
  estimada, estado, límite determinante y datos usados para la explicación.
- **Ritmo de uso**: Promedio de km por día del vehículo derivado de sus lecturas válidas, con
  indicación de su origen: calculado con lecturas, o promedio según el uso habitual indicado.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El 90 % de los usuarios en pruebas identifica correctamente, en menos de
  10 segundos desde la pantalla principal, cuál es su próximo mantenimiento y cuándo toca.
- **SC-002**: El 85 % de los usuarios en pruebas explica con sus palabras por qué se le recomienda
  un mantenimiento tras leer la explicación de la app.
- **SC-003**: Registrar un servicio realizado desde una alerta se completa en menos de
  10 segundos y con un máximo de 2 toques cuando la fecha y el km por defecto son correctos.
- **SC-004**: Para un vehículo con un ritmo de uso estable, la fecha estimada del próximo
  mantenimiento por km difiere en menos de 15 días de la fecha real en que se alcanza ese km.
- **SC-005**: Tras registrar un servicio, corregir una lectura o cambiar un intervalo, las
  estimaciones actualizadas se ven al volver a la pantalla principal, sin pasos adicionales.
- **SC-006**: La pantalla principal sigue mostrando el vehículo activo, su kilometraje y sus
  mantenimientos próximos en menos de 2 segundos en una conexión móvil típica (perfil "Fast 4G"),
  independientemente del número de vehículos y servicios registrados.

## Assumptions

- Depende de la feature `001-vehicles-mileage` (vehículos, lecturas válidas, combustible y uso
  habitual) y reutiliza su autenticación y reglas de propiedad de datos.
- Intervalos por defecto genéricos (basados en recomendaciones habituales de fabricantes para
  turismos; "lo que ocurra primero"):

  | Mantenimiento | Km | Meses | Aplica a | Uso severo (−20 % km en ciudad) |
  |---|---|---|---|---|
  | Cambio de aceite y filtro de aceite | 10.000 | 12 | Gasolina, diésel, híbrido | Sí |
  | Filtro de aire del motor | 20.000 | 24 | Gasolina, diésel, híbrido | Sí |
  | Filtro de aire de cabina | 15.000 | 12 | Todos | Sí |
  | Rotación de llantas | 10.000 | 12 | Todos | No |
  | Revisión de frenos | 20.000 | 12 | Todos | Sí |
  | Cambio de líquido de frenos | — | 24 | Todos | No |
  | Cambio de anticongelante/refrigerante | 60.000 | 48 | Gasolina, diésel, híbrido | No |
  | Bujías | 40.000 | 48 | Gasolina, híbrido | No |
  | Revisión de batería | — | 12 | Todos | No |
  | Alineación y balanceo | 10.000 | 12 | Todos | No |
  | Cambio de llantas | 50.000 | 72 | Todos | No |
  | Banda de distribución | 100.000 | 72 | Gasolina, diésel, híbrido | No |
  | Aceite de transmisión | 60.000 | 48 | Gasolina, diésel, híbrido | No |

- La descripción de "Banda de distribución" indica que algunos motores usan cadena en lugar de
  banda y que, en ese caso, el usuario puede desactivar el mantenimiento.
- Los mantenimientos creados por el usuario quedan fuera de alcance de esta versión.

- Los intervalos específicos por marca/modelo quedan fuera de esta versión; el vínculo al
  catálogo de modelos (feature 001) permitirá añadirlos después.
- Umbral de "Próximo": 1.000 km o 30 días. Ritmos promedio por uso habitual (aprox. 11.000,
  22.000 y 15.000 km/año): ciudad 30 km/día, carretera 60 km/día, mixto o sin indicar
  40 km/día. Reducción por uso en ciudad: 20 %. Todos son valores iniciales ajustables.
- Los recordatorios por correo o notificación push quedan fuera de alcance; se especificarán en
  una feature posterior que consumirá las estimaciones definidas aquí.
- El coste de los servicios, el taller y la subida de facturas o fotos quedan fuera de alcance.
- Guardar un servicio o una personalización necesita conexión en el momento de enviarlo; sin ella
  no se pierde lo escrito y el envío se reintenta sin duplicados. Consultar las últimas
  estimaciones calculadas funciona sin conexión. La cola offline de servicios queda para una
  versión posterior.
- La app no sustituye el manual del fabricante; la explicación lo indica cuando se usan
  intervalos genéricos.
