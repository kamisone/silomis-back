import { esc } from './layout';
import { COPY, resolveLang } from './copy';

/** The stored PickupPointSnapshot, narrowed to what an email needs. */
export interface PickupPointEmailData {
  name: string;
  address: string;
  postcode: string;
  city: string;
  country: string;
  /** Carrier's own reference — what the customer quotes if they need to ask about it. */
  id: string;
  type?: 'relay' | 'locker' | null;
  openingHours?: Array<{ weekday: number; slots: string[] }> | null;
}

/**
 * "Where to collect" panel, shared by the confirmation and shipped emails.
 *
 * A customer who chose a relay point three streets away has no other record of
 * which one it was — the order page is behind a tracking token and the picker is
 * long gone. Repeating the address and opening hours in both emails is the
 * difference between a self-service collection and a support ticket.
 *
 * Table-based and inline-styled like the rest of the templates: email clients
 * cannot be relied on for flexbox or external CSS.
 */
export function pickupPointBlock(point: PickupPointEmailData, locale?: string | null): string {
  const c = COPY[resolveLang(locale)].pickup;

  const hours = (point.openingHours ?? [])
    .filter((day) => day.weekday >= 1 && day.weekday <= 7)
    .map((day) => {
      const label = c.weekdays[day.weekday - 1] ?? '';
      const value = day.slots.length ? day.slots.join(' · ') : c.closed;
      return `<tr>
        <td style="padding:1px 12px 1px 0;font-size:12px;color:#64748b;white-space:nowrap;">${esc(label)}</td>
        <td style="padding:1px 0;font-size:12px;color:#0f172a;text-align:right;">${esc(value)}</td>
      </tr>`;
    })
    .join('');

  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:20px 0;border:1px solid #e2e8f0;border-radius:8px;background:#f8fafc;">
      <tr>
        <td style="padding:16px 18px;">
          <p style="margin:0 0 2px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;color:#64748b;">${esc(c.title)}</p>
          <p style="margin:0 0 10px;font-size:13px;color:#64748b;">${esc(c.intro)}</p>

          <p style="margin:0;font-size:15px;font-weight:700;color:#0f172a;">${esc(point.name)}</p>
          <p style="margin:2px 0 0;font-size:14px;color:#334155;">${esc(point.address)}</p>
          <p style="margin:0;font-size:14px;color:#334155;">${esc(point.postcode)} ${esc(point.city)}${point.country ? `, ${esc(point.country)}` : ''}</p>
          <p style="margin:8px 0 0;font-size:12px;color:#64748b;">${esc(c.ref)} : <strong style="color:#0f172a;">${esc(point.id)}</strong></p>

          ${
            hours
              ? `<p style="margin:14px 0 4px;font-size:12px;font-weight:700;color:#0f172a;">${esc(c.hours)}</p>
                 <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${hours}</table>`
              : ''
          }
        </td>
      </tr>
    </table>
  `;
}
