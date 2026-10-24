import { MAINTENANCE_NAMES_ES, MAINTENANCE_WHY_ES } from '@car-checkup/shared/i18n';
import {
  type DigestNotice,
  type DigestVehicle,
  type EmailSelection,
  noticeDetail,
  vehicleName,
} from '@car-checkup/shared/reminders';

const colors = {
  bg: '#f6f7f9',
  surface: '#ffffff',
  text: '#17202b',
  muted: '#4f5b6b',
  primary: '#1f3a5f',
  border: '#d6dbe3',
  danger: '#b42318',
  dangerBg: '#fdecea',
  warning: '#8a5200',
  warningBg: '#fdf1dc',
  info: '#1f3a5f',
  infoBg: '#e8eef8',
};

export const escapeHtml = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

interface NoticeView {
  title: string;
  label: string;
  detail: string;
  why: string;
  tone: { fg: string; bg: string };
  cta: { text: string; url: string } | null;
}

function noticeView(
  n: DigestNotice,
  vehicle: DigestVehicle,
  appUrl: string,
  today: string,
  timeZone: string,
): NoticeView {
  if (n.kind === 'MILEAGE_UPDATE' || n.typeCode === null) {
    return {
      title: 'Actualiza el kilometraje',
      label: 'Kilometraje',
      detail: 'Hace más de 30 días que no registras el kilometraje.',
      why: 'Con el kilometraje al día, las fechas de tus mantenimientos son más precisas.',
      tone: { fg: colors.info, bg: colors.infoBg },
      cta: { text: 'Actualizar kilometraje', url: `${appUrl}/?capture=${vehicle.id}` },
    };
  }
  const overdue = n.kind === 'MAINTENANCE_OVERDUE';
  return {
    title: MAINTENANCE_NAMES_ES[n.typeCode],
    label: overdue ? 'Vencido' : 'Próximo',
    detail: `${capitalize(noticeDetail(n, today, timeZone))}.`,
    why: MAINTENANCE_WHY_ES[n.typeCode],
    tone: overdue
      ? { fg: colors.danger, bg: colors.dangerBg }
      : { fg: colors.warning, bg: colors.warningBg },
    cta: null,
  };
}

export interface DigestEmailInput<T extends DigestNotice> {
  selection: EmailSelection<T>;
  appUrl: string;
  unsubscribeUrl: string;
  today: string;
  timeZone: string;
}

/** Daily digest email (contracts/notifications.md): HTML + plain text, ≤ 600 px, inline styles. */
export function renderDigestEmail<T extends DigestNotice>(
  input: DigestEmailInput<T>,
): { subject: string; html: string; text: string } {
  const { selection, appUrl, unsubscribeUrl, today, timeZone } = input;
  const total = selection.shown.length + selection.hiddenCount;
  const first = selection.groups[0];
  const firstNotice = first?.notices[0];

  let subject = `Tienes ${String(total)} avisos de mantenimiento`;
  if (total === 1 && first !== undefined && firstNotice !== undefined) {
    const view = noticeView(firstNotice, first.vehicle, appUrl, today, timeZone);
    subject =
      firstNotice.kind === 'MILEAGE_UPDATE'
        ? `¿Cuánto marca hoy tu ${vehicleName(first.vehicle)}?`
        : `Tu ${vehicleName(first.vehicle)}: ${view.title.toLowerCase()} ${view.label.toLowerCase()}`;
  }

  const blocks = selection.groups.map(({ vehicle, notices }) => {
    const name =
      escapeHtml(vehicleName(vehicle)) +
      (vehicle.nickname !== null
        ? ` <span style="font-weight:400;color:${colors.muted}">· ${escapeHtml(`${vehicle.make} ${vehicle.model}`)}</span>`
        : '');
    const vehicleUrl = `${appUrl}/vehicles/${vehicle.id}/maintenance`;
    const items = notices
      .map((n) => {
        const v = noticeView(n, vehicle, appUrl, today, timeZone);
        const cta =
          v.cta === null
            ? ''
            : `<p style="margin:12px 0 0"><a href="${escapeHtml(v.cta.url)}" style="display:inline-block;background:${colors.primary};color:#ffffff;text-decoration:none;font-weight:600;padding:10px 16px;border-radius:10px">${escapeHtml(v.cta.text)}</a></p>`;
        return `<tr><td style="padding:12px 0;border-top:1px solid ${colors.border}">
          <p style="margin:0;font-weight:600;font-size:16px;color:${colors.text}">${escapeHtml(v.title)}
            <span style="display:inline-block;margin-left:6px;padding:2px 10px;border-radius:999px;font-size:13px;color:${v.tone.fg};background:${v.tone.bg}">${escapeHtml(v.label)}</span></p>
          <p style="margin:4px 0 0;font-size:15px;color:${colors.text}">${escapeHtml(v.detail)}</p>
          <p style="margin:4px 0 0;font-size:14px;color:${colors.muted}">${escapeHtml(v.why)}</p>${cta}
        </td></tr>`;
      })
      .join('');
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${colors.surface};border:1px solid ${colors.border};border-radius:14px;margin:0 0 16px">
      <tr><td style="padding:16px 20px">
        <p style="margin:0 0 4px;font-size:18px;font-weight:700;color:${colors.text}">${name}</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${items}</table>
        <p style="margin:12px 0 0"><a href="${escapeHtml(vehicleUrl)}" style="color:${colors.primary};font-weight:600">Ver en Car Checkup →</a></p>
      </td></tr></table>`;
  });

  const more =
    selection.hiddenCount > 0
      ? `<p style="margin:0 0 16px;font-size:15px;color:${colors.text}">Y ${String(selection.hiddenCount)} avisos más en <a href="${escapeHtml(appUrl)}" style="color:${colors.primary}">la app</a>.</p>`
      : '';

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:${colors.bg};font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${colors.bg}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px">
<tr><td style="padding:0 4px 16px"><p style="margin:0;font-size:20px;font-weight:700;color:${colors.primary}">Car Checkup</p>
<p style="margin:8px 0 0;font-size:16px;color:${colors.text}">Hola, esto es lo que conviene revisar en tus vehículos:</p></td></tr>
<tr><td>${blocks.join('')}${more}</td></tr>
<tr><td style="padding:8px 4px 0;font-size:13px;line-height:1.5;color:${colors.muted}">
Recibes este correo porque activaste los avisos por correo en Car Checkup. Las notificaciones del teléfono se gestionan en los ajustes de tu dispositivo.<br>
<a href="${escapeHtml(unsubscribeUrl)}" style="color:${colors.muted}">Dejar de recibir estos correos</a>
</td></tr></table></td></tr></table></body></html>`;

  const textBlocks = selection.groups.map(({ vehicle, notices }) => {
    const lines = notices.map((n) => {
      const v = noticeView(n, vehicle, appUrl, today, timeZone);
      return `- ${v.title} (${v.label}): ${v.detail}${v.cta === null ? '' : ` ${v.cta.text}: ${v.cta.url}`}`;
    });
    return `${vehicleName(vehicle)}\n${lines.join('\n')}\nVer en Car Checkup: ${appUrl}/vehicles/${vehicle.id}/maintenance`;
  });
  const text = [
    'Hola, esto es lo que conviene revisar en tus vehículos:',
    '',
    ...textBlocks.flatMap((b) => [b, '']),
    ...(selection.hiddenCount > 0
      ? [`Y ${String(selection.hiddenCount)} avisos más en la app: ${appUrl}`, '']
      : []),
    `Dejar de recibir estos correos: ${unsubscribeUrl}`,
  ].join('\n');

  return { subject, html, text };
}

/** RFC 8058 one-click unsubscribe headers. */
export const listUnsubscribeHeaders = (oneClickUrl: string): Record<string, string> => ({
  'List-Unsubscribe': `<${oneClickUrl}>`,
  'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
});

export interface DonationThanksInput {
  kind: 'ONE_TIME' | 'MONTHLY_CHARGE';
  provider: 'STRIPE' | 'PAYPAL';
  amountCents: number;
  confirmedAt: Date;
  adFreeUntil: Date | null;
  timeZone: string;
  appUrl: string;
  supportEmail: string | null;
}

/** Thank-you email and receipt of a confirmed donation (FR-011): no card or payer data. */
export function renderDonationThanksEmail(input: DonationThanksInput): {
  subject: string;
  html: string;
  text: string;
} {
  const date = (d: Date) =>
    new Intl.DateTimeFormat('es-MX', { dateStyle: 'long', timeZone: input.timeZone }).format(d);
  const amount = `${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(input.amountCents / 100)} MXN`;
  const method = input.provider === 'STRIPE' ? 'Tarjeta' : 'PayPal';
  const kind = input.kind === 'ONE_TIME' ? 'Donación única' : 'Donación mensual';
  const subject = '¡Gracias por apoyar Car Checkup!';
  const rows: [string, string][] = [
    ['Fecha', date(input.confirmedAt)],
    ['Tipo', kind],
    ['Monto', amount],
    ['Medio de pago', method],
  ];
  const benefit =
    input.adFreeUntil === null
      ? null
      : `Disfruta la app sin anuncios hasta el ${date(input.adFreeUntil)}.`;
  const contact =
    input.supportEmail === null
      ? null
      : `¿Dudas o necesitas un reembolso? Escríbenos a ${input.supportEmail}.`;

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:${colors.bg};font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${colors.bg}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px">
<tr><td style="padding:0 4px 16px"><p style="margin:0;font-size:20px;font-weight:700;color:${colors.primary}">Car Checkup</p>
<p style="margin:8px 0 0;font-size:18px;font-weight:700;color:${colors.text}">¡Gracias por tu apoyo!</p>
<p style="margin:8px 0 0;font-size:16px;color:${colors.text}">Tu donación ayuda a mantener Car Checkup gratis y sin complicaciones para todos.</p></td></tr>
<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${colors.surface};border:1px solid ${colors.border};border-radius:14px">
<tr><td style="padding:16px 20px"><p style="margin:0 0 8px;font-size:16px;font-weight:700;color:${colors.text}">Comprobante</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 0;border-top:1px solid ${colors.border};font-size:15px;color:${colors.muted}">${escapeHtml(k)}</td><td align="right" style="padding:6px 0;border-top:1px solid ${colors.border};font-size:15px;color:${colors.text};font-weight:600">${escapeHtml(v)}</td></tr>`,
    )
    .join('')}</table>
${benefit === null ? '' : `<p style="margin:12px 0 0;font-size:15px;color:${colors.text}">${escapeHtml(benefit)}</p>`}
<p style="margin:12px 0 0"><a href="${escapeHtml(`${input.appUrl}/support/history`)}" style="color:${colors.primary};font-weight:600">Ver mis donaciones →</a></p>
</td></tr></table></td></tr>
<tr><td style="padding:16px 4px 0;font-size:13px;line-height:1.5;color:${colors.muted}">
Este correo es un comprobante informativo; no es una factura fiscal.${contact === null ? '' : `<br>${escapeHtml(contact)}`}
</td></tr></table></td></tr></table></body></html>`;

  const text = [
    '¡Gracias por tu apoyo!',
    'Tu donación ayuda a mantener Car Checkup gratis y sin complicaciones para todos.',
    '',
    ...rows.map(([k, v]) => `${k}: ${v}`),
    ...(benefit === null ? [] : ['', benefit]),
    '',
    `Ver mis donaciones: ${input.appUrl}/support/history`,
    '',
    'Este correo es un comprobante informativo; no es una factura fiscal.',
    ...(contact === null ? [] : [contact]),
  ].join('\n');

  return { subject, html, text };
}
