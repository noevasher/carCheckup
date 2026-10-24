<!--
Sync Impact Report
==================
Version change: 1.0.0 → 1.0.1
Bump rationale: PATCH. Wording only: the UX/UI supervision rule in Principle IV now uses the
normative "DEBEN" like the other rules, and typos were fixed ("supervisador" → "supervisados",
"standares" → "estándares"). Its meaning is unchanged.

Modified principles: IV. Mobile-First y PWA Instalable (wording)
Added sections: none
Removed sections: none
Dependent templates read the constitution at runtime and were not modified.
Follow-up TODOs: none
-->
# Car Checkup Constitution

**Visión Técnica**: Plataforma de gestión de mantenimiento automotriz diseñada para usuarios
sin experiencia mecánica. El sistema se centra en reducir la fricción en la captura de datos
(especialmente el kilometraje) y utiliza un motor de estimación para alertar sobre
mantenimientos próximos.

## Core Principles

### I. Fricción Cero en la Captura de Datos

- Todo flujo que requiera captura manual de datos DEBE completarse con el menor número posible
  de clics/toques; cada spec DEBE declarar el número de interacciones del flujo principal.
- La actualización de kilometraje es el flujo crítico del producto: DEBE ser accesible desde la
  pantalla principal y completarse sin navegación intermedia.
- Los formularios DEBEN usar valores por defecto inteligentes (último valor conocido, vehículo
  activo, fecha actual) y el teclado/entrada adecuados al tipo de dato (p. ej., numérico).
- Todo campo que no sea estrictamente necesario DEBE ser opcional o inferido.

**Rationale**: La calidad de las alertas depende de datos frescos; si capturarlos cuesta
esfuerzo, el usuario deja de hacerlo y el motor de estimación pierde precisión.

### II. Tipado Estricto de Extremo a Extremo

- TypeScript es OBLIGATORIO en frontend y backend, con `strict: true` en todos los `tsconfig`.
- Está PROHIBIDO el uso de `any` (explícito o implícito); se DEBE usar `unknown` con validación
  o tipos precisos. El linter DEBE hacer cumplir esta regla (`@typescript-eslint/no-explicit-any`
  como error).
- El esquema de Prisma es la fuente de verdad de los modelos de datos. Los tipos de dominio y
  DTOs del API DEBEN derivarse de los tipos generados por Prisma y compartirse con el frontend;
  NO se permiten definiciones duplicadas escritas a mano que puedan divergir.
- Toda entrada externa (requests HTTP, webhooks de pagos, variables de entorno) DEBE validarse
  en tiempo de ejecución antes de tratarse como tipada.

**Rationale**: Un único origen de tipos evita desincronización entre base de datos, API y UI,
y convierte errores de integración en errores de compilación.

### III. Escalabilidad por Diseño

- El modelo de datos y el API DEBEN asumir que un usuario puede tener N vehículos; ningún flujo
  puede presuponer un único vehículo por usuario.
- Los procesos masivos (cron de recordatorios, recálculo de estimaciones, envío de correos)
  DEBEN procesarse por lotes/paginación, ser idempotentes y tolerar reintentos sin duplicar
  notificaciones.
- Las consultas DEBEN evitar patrones N+1 y apoyarse en índices definidos en el esquema Prisma
  para los accesos por usuario, vehículo y fecha de próximo mantenimiento.
- El backend DEBE ser stateless para permitir escalado horizontal.

**Rationale**: El valor del producto está en los recordatorios automáticos, que se ejecutan
sobre toda la base de usuarios; su costo debe crecer de forma lineal y predecible.

### IV. Mobile-First y PWA Instalable

- El frontend DEBE diseñarse primero para pantallas móviles; las vistas de escritorio son una
  extensión progresiva, no el punto de partida.
- La aplicación DEBE ser una PWA instalable (manifest válido, service worker, iconos) y
  ofrecer una experiencia usable con conectividad intermitente para los flujos de captura.
- Los objetivos táctiles y la tipografía DEBEN cumplir tamaños mínimos legibles en móvil.
- Los diseños de la interfaz DEBEN estar supervisados para cumplir los estándares de calidad
  de un experto UX/UI, y elegir un diseño sobrio, serio pero amigable para el contexto de la
  aplicación.


**Rationale**: El usuario registra datos junto a su vehículo, con el teléfono en la mano;
la app debe sentirse nativa en ese contexto.

### V. Diseñado para Usuarios sin Experiencia Mecánica

- La interfaz DEBE usar lenguaje claro y no técnico; cualquier término mecánico DEBE ir
  acompañado de una explicación breve.
- Las alertas del motor de estimación DEBEN indicar qué hacer, cuándo (fecha o kilometraje
  estimado) y por qué, sin requerir que el usuario conozca los intervalos de mantenimiento.
- Las estimaciones DEBEN ser explicables: el sistema DEBE poder mostrar en qué datos se basa
  (último kilometraje registrado, ritmo de uso estimado, intervalo aplicado).

**Rationale**: El público objetivo no sabe cuándo ni qué mantener; el sistema asume ese
conocimiento y lo comunica de forma comprensible.

## Stack Tecnológico Obligatorio

- **Frontend**: React + Vite, configurado como Progressive Web App instalable. Mobile-First.
- **Backend**: Node.js + Express exponiendo una API REST.
- **Lenguaje**: TypeScript en frontend y backend (ver Principio II).
- **Base de datos**: PostgreSQL gestionado en Supabase.
- **ORM**: Prisma para migraciones y consultas tipadas en el backend. Todo cambio de esquema
  DEBE realizarse mediante migraciones de Prisma versionadas.

Sustituir cualquier componente de este stack requiere una enmienda a esta constitución.

## Infraestructura y Servicios de Terceros

- **Hosting frontend**: Vercel.
- **Hosting backend**: Servidor Node.js independiente (p. ej., Render, Railway o VPS).
- **Hosting base de datos**: Supabase.
- **Autenticación**: Supabase Auth. El backend DEBE verificar los tokens de Supabase en cada
  request autenticado; no se implementan sistemas de autenticación propios.
- **Correos transaccionales**: Resend, Brevo o Nodemailer (SMTP), detrás de una interfaz común
  que permita cambiar de proveedor sin modificar la lógica de negocio.
- **Monetización (donaciones)**: Stripe y PayPal, seleccionable por el usuario. Las
  confirmaciones de pago DEBEN validarse mediante webhooks verificados por firma.
- **Monetización (anuncios)**: Google AdMob / AdSense para PWA/Web. Los anuncios NO DEBEN
  interrumpir ni añadir pasos a los flujos de captura de datos (ver Principio I).
- Los secretos y credenciales de servicios externos DEBEN gestionarse mediante variables de
  entorno y nunca versionarse en el repositorio.

## Governance

- Esta constitución prevalece sobre cualquier otra práctica o convención del proyecto. Todo
  plan (`/speckit-plan`) DEBE superar el "Constitution Check" y toda revisión de código DEBE
  verificar el cumplimiento de los principios.
- Cualquier desviación DEBE justificarse explícitamente en la sección de complejidad del plan
  correspondiente, indicando la alternativa más simple descartada y por qué.
- **Enmiendas**: se proponen mediante `/speckit-constitution`, documentando el cambio, su
  justificación y el impacto en specs/planes existentes, junto con un plan de migración si
  aplica.
- **Versionado** (SemVer):
  - MAJOR: eliminación o redefinición incompatible de principios o del stack obligatorio.
  - MINOR: nuevo principio o sección, o ampliación material de una guía existente.
  - PATCH: aclaraciones, redacción o correcciones sin cambio semántico.
- **Revisión de cumplimiento**: al iniciar cada nueva feature se DEBE confirmar que la
  constitución sigue vigente para el alcance propuesto.

**Version**: 1.0.1 | **Ratified**: 2026-10-20 | **Last Amended**: 2026-10-23
