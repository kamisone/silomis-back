import { baseLayout, ctaButton, mutedText, esc } from './layout';
import { resolveLang } from './copy';

export interface SendInStatusEmailData {
  orderNumber: string;
  customerName: string;
  status: string;
  /** What the shop wrote at this step, if anything. */
  note: string | null;
  /** Public URLs of the shop's photographs at this step. */
  photoUrls: string[];
  trackingUrl: string | null;
  returnTrackingNumber: string | null;
  returnTrackingUrl: string | null;
  returnAddress: { name: string; line1: string; zip: string; city: string; country: string };
  locale?: string | null;
}

/**
 * One message per step of the item's round trip. The two the customer is
 * really waiting for — "we have it" and "it's done" — carry the shop's
 * photograph inline, which is the whole reassurance of a send-in service.
 */
const COPY = {
  fr: {
    greeting: (name: string) => `Bonjour ${name},`,
    orderRef: 'Référence commande',
    track: 'Suivre mon article',
    help: "Une question ? Répondez simplement à cet e-mail.",
    steps: {
      awaiting_item: { subject: 'Envoyez-nous votre article', heading: 'À vous de jouer : envoyez-nous votre article', message: "Votre broderie est réservée. Glissez le bon d'envoi (sur votre page de suivi) dans le colis et postez votre article à l'adresse ci-dessous." },
      received: { subject: 'Nous avons bien reçu votre article', heading: 'Votre article est arrivé', message: "Il est entre nos mains — voici la photo à réception. Nous préparons la broderie." },
      in_production: { subject: 'Votre broderie est en cours', heading: 'Sur la machine', message: 'Votre article est en cours de broderie.' },
      done: { subject: 'Votre broderie est terminée', heading: 'C’est fait !', message: "Voici votre article brodé. Nous préparons son retour." },
      returned: { subject: 'Votre article est en route', heading: 'Votre article vous revient', message: "Il a été remis au transporteur." },
      delivered: { subject: 'Votre article est livré', heading: 'Bien arrivé', message: "Votre article brodé vous est parvenu. Nous espérons qu'il vous plaira !" },
      problem: { subject: 'Un point à voir sur votre article', heading: 'Nous avons besoin de vous', message: "Nous avons rencontré un souci avec votre article. Le détail est ci-dessous — répondez-nous pour décider de la suite." },
      cancelled: { subject: 'Votre commande de broderie est annulée', heading: 'Commande annulée', message: "Cette commande a été annulée. Si vous n'êtes pas à l'origine de cette demande, répondez-nous." },
    },
    sendTo: 'Adresse d’envoi',
    tracking: 'Numéro de suivi',
  },
  en: {
    greeting: (name: string) => `Hello ${name},`,
    orderRef: 'Order reference',
    track: 'Follow my item',
    help: 'Any question? Just reply to this email.',
    steps: {
      awaiting_item: { subject: 'Send us your item', heading: 'Over to you: send us your item', message: 'Your embroidery is booked. Slip the send-in note (on your tracking page) into the parcel and post your item to the address below.' },
      received: { subject: 'We have your item', heading: 'Your item has arrived', message: "It's in our hands — here it is as it arrived. We're getting the embroidery ready." },
      in_production: { subject: 'Your embroidery is in progress', heading: 'On the machine', message: 'Your item is being embroidered.' },
      done: { subject: 'Your embroidery is done', heading: 'Done!', message: "Here is your embroidered item. We're getting it ready to come back to you." },
      returned: { subject: 'Your item is on its way back', heading: 'Your item is coming home', message: 'It has been handed to the carrier.' },
      delivered: { subject: 'Your item has been delivered', heading: 'Safely delivered', message: 'Your embroidered item has reached you. We hope you love it!' },
      problem: { subject: 'Something to sort out with your item', heading: 'We need you', message: "We've hit a snag with your item. The details are below — reply to decide what to do next." },
      cancelled: { subject: 'Your embroidery order is cancelled', heading: 'Order cancelled', message: "This order has been cancelled. If that wasn't you, reply to this email." },
    },
    sendTo: 'Send it to',
    tracking: 'Tracking number',
  },
  es: {
    greeting: (name: string) => `Hola ${name},`,
    orderRef: 'Referencia del pedido',
    track: 'Seguir mi artículo',
    help: '¿Alguna duda? Responde a este correo.',
    steps: {
      awaiting_item: { subject: 'Envíanos tu artículo', heading: 'Te toca: envíanos tu artículo', message: 'Tu bordado está reservado. Mete la nota de envío (en tu página de seguimiento) en el paquete y envía tu artículo a la dirección de abajo.' },
      received: { subject: 'Hemos recibido tu artículo', heading: 'Tu artículo ha llegado', message: 'Ya lo tenemos: así llegó. Estamos preparando el bordado.' },
      in_production: { subject: 'Tu bordado está en marcha', heading: 'En la máquina', message: 'Tu artículo se está bordando.' },
      done: { subject: 'Tu bordado está terminado', heading: '¡Listo!', message: 'Aquí tienes tu artículo bordado. Lo preparamos para devolvértelo.' },
      returned: { subject: 'Tu artículo está en camino', heading: 'Tu artículo vuelve a casa', message: 'Se ha entregado al transportista.' },
      delivered: { subject: 'Tu artículo ha sido entregado', heading: 'Entregado', message: 'Tu artículo bordado ya está contigo. ¡Esperamos que te encante!' },
      problem: { subject: 'Algo que resolver con tu artículo', heading: 'Te necesitamos', message: 'Hemos tenido un problema con tu artículo. Los detalles están abajo: responde para decidir el siguiente paso.' },
      cancelled: { subject: 'Tu pedido de bordado se ha cancelado', heading: 'Pedido cancelado', message: 'Este pedido se ha cancelado. Si no has sido tú, responde a este correo.' },
    },
    sendTo: 'Envíalo a',
    tracking: 'Número de seguimiento',
  },
  it: {
    greeting: (name: string) => `Ciao ${name},`,
    orderRef: 'Riferimento ordine',
    track: 'Segui il mio articolo',
    help: 'Domande? Rispondi a questa e-mail.',
    steps: {
      awaiting_item: { subject: 'Inviaci il tuo articolo', heading: 'Tocca a te: inviaci il tuo articolo', message: "Il tuo ricamo è prenotato. Metti la nota di spedizione (sulla tua pagina di tracciamento) nel pacco e spedisci l'articolo all'indirizzo qui sotto." },
      received: { subject: 'Abbiamo ricevuto il tuo articolo', heading: 'Il tuo articolo è arrivato', message: 'È nelle nostre mani: eccolo come è arrivato. Stiamo preparando il ricamo.' },
      in_production: { subject: 'Il tuo ricamo è in corso', heading: 'Sulla macchina', message: 'Il tuo articolo è in ricamo.' },
      done: { subject: 'Il tuo ricamo è terminato', heading: 'Fatto!', message: 'Ecco il tuo articolo ricamato. Lo prepariamo per il ritorno.' },
      returned: { subject: 'Il tuo articolo è in viaggio', heading: 'Il tuo articolo torna a casa', message: 'È stato consegnato al corriere.' },
      delivered: { subject: 'Il tuo articolo è stato consegnato', heading: 'Consegnato', message: 'Il tuo articolo ricamato ti è arrivato. Speriamo ti piaccia!' },
      problem: { subject: 'Un punto da chiarire sul tuo articolo', heading: 'Abbiamo bisogno di te', message: 'Abbiamo avuto un intoppo con il tuo articolo. I dettagli sono qui sotto: rispondi per decidere il da farsi.' },
      cancelled: { subject: 'Il tuo ordine di ricamo è annullato', heading: 'Ordine annullato', message: 'Questo ordine è stato annullato. Se non sei stato tu, rispondi a questa e-mail.' },
    },
    sendTo: 'Invialo a',
    tracking: 'Numero di tracciamento',
  },
  de: {
    greeting: (name: string) => `Hallo ${name},`,
    orderRef: 'Bestellnummer',
    track: 'Meinen Artikel verfolgen',
    help: 'Fragen? Antworten Sie einfach auf diese E-Mail.',
    steps: {
      awaiting_item: { subject: 'Schicken Sie uns Ihren Artikel', heading: 'Jetzt sind Sie dran: Schicken Sie uns Ihren Artikel', message: 'Ihre Stickerei ist reserviert. Legen Sie den Einsendezettel (auf Ihrer Sendungsseite) ins Paket und schicken Sie den Artikel an die Adresse unten.' },
      received: { subject: 'Wir haben Ihren Artikel', heading: 'Ihr Artikel ist angekommen', message: 'Er ist bei uns – so ist er angekommen. Wir bereiten die Stickerei vor.' },
      in_production: { subject: 'Ihre Stickerei ist in Arbeit', heading: 'Auf der Maschine', message: 'Ihr Artikel wird bestickt.' },
      done: { subject: 'Ihre Stickerei ist fertig', heading: 'Fertig!', message: 'Hier ist Ihr bestickter Artikel. Wir bereiten den Rückversand vor.' },
      returned: { subject: 'Ihr Artikel ist auf dem Rückweg', heading: 'Ihr Artikel kommt nach Hause', message: 'Er wurde an den Versanddienst übergeben.' },
      delivered: { subject: 'Ihr Artikel wurde zugestellt', heading: 'Angekommen', message: 'Ihr bestickter Artikel ist bei Ihnen. Wir hoffen, er gefällt Ihnen!' },
      problem: { subject: 'Etwas zu klären bei Ihrem Artikel', heading: 'Wir brauchen Sie', message: 'Es gab ein Problem mit Ihrem Artikel. Die Details stehen unten – antworten Sie, um das weitere Vorgehen abzustimmen.' },
      cancelled: { subject: 'Ihre Stickerei-Bestellung ist storniert', heading: 'Bestellung storniert', message: 'Diese Bestellung wurde storniert. Falls das nicht Sie waren, antworten Sie auf diese E-Mail.' },
    },
    sendTo: 'Senden an',
    tracking: 'Sendungsnummer',
  },
  nl: {
    greeting: (name: string) => `Hallo ${name},`,
    orderRef: 'Bestelnummer',
    track: 'Mijn item volgen',
    help: 'Vragen? Beantwoord gewoon deze e-mail.',
    steps: {
      awaiting_item: { subject: 'Stuur ons je item', heading: 'Jouw beurt: stuur ons je item', message: 'Je borduurwerk staat gereserveerd. Stop de inzendbon (op je trackingpagina) in het pakket en stuur je item naar het adres hieronder.' },
      received: { subject: 'We hebben je item', heading: 'Je item is aangekomen', message: 'Het is bij ons — zo kwam het aan. We maken het borduurwerk klaar.' },
      in_production: { subject: 'Je borduurwerk is in de maak', heading: 'Op de machine', message: 'Je item wordt geborduurd.' },
      done: { subject: 'Je borduurwerk is klaar', heading: 'Klaar!', message: 'Hier is je geborduurde item. We maken het klaar voor de terugreis.' },
      returned: { subject: 'Je item is onderweg terug', heading: 'Je item komt naar huis', message: 'Het is aan de vervoerder overgedragen.' },
      delivered: { subject: 'Je item is bezorgd', heading: 'Bezorgd', message: 'Je geborduurde item is bij je. We hopen dat je er blij mee bent!' },
      problem: { subject: 'Iets te regelen met je item', heading: 'We hebben je nodig', message: 'Er is iets misgegaan met je item. De details staan hieronder — antwoord om te beslissen hoe verder.' },
      cancelled: { subject: 'Je borduurbestelling is geannuleerd', heading: 'Bestelling geannuleerd', message: 'Deze bestelling is geannuleerd. Was jij dat niet? Antwoord dan op deze e-mail.' },
    },
    sendTo: 'Stuur het naar',
    tracking: 'Trackingnummer',
  },
  pl: {
    greeting: (name: string) => `Dzień dobry ${name},`,
    orderRef: 'Numer zamówienia',
    track: 'Śledź mój przedmiot',
    help: 'Pytania? Po prostu odpowiedz na tego e-maila.',
    steps: {
      awaiting_item: { subject: 'Wyślij nam swój przedmiot', heading: 'Twoja kolej: wyślij nam swój przedmiot', message: 'Twój haft jest zarezerwowany. Włóż kartę wysyłki (ze strony śledzenia) do paczki i wyślij przedmiot na poniższy adres.' },
      received: { subject: 'Mamy Twój przedmiot', heading: 'Twój przedmiot dotarł', message: 'Jest u nas — tak do nas dotarł. Przygotowujemy haft.' },
      in_production: { subject: 'Twój haft jest w toku', heading: 'Na maszynie', message: 'Twój przedmiot jest haftowany.' },
      done: { subject: 'Twój haft jest gotowy', heading: 'Gotowe!', message: 'Oto Twój wyhaftowany przedmiot. Przygotowujemy go do odesłania.' },
      returned: { subject: 'Twój przedmiot jest w drodze powrotnej', heading: 'Twój przedmiot wraca do domu', message: 'Został przekazany przewoźnikowi.' },
      delivered: { subject: 'Twój przedmiot został dostarczony', heading: 'Dostarczono', message: 'Twój wyhaftowany przedmiot dotarł do Ciebie. Mamy nadzieję, że się podoba!' },
      problem: { subject: 'Coś do wyjaśnienia w sprawie Twojego przedmiotu', heading: 'Potrzebujemy Ciebie', message: 'Napotkaliśmy problem z Twoim przedmiotem. Szczegóły poniżej — odpowiedz, aby ustalić, co dalej.' },
      cancelled: { subject: 'Twoje zamówienie haftu zostało anulowane', heading: 'Zamówienie anulowane', message: 'To zamówienie zostało anulowane. Jeśli to nie Ty, odpowiedz na tego e-maila.' },
    },
    sendTo: 'Wyślij na adres',
    tracking: 'Numer przesyłki',
  },
} as const;

export function renderSendInStatus(data: SendInStatusEmailData): { subject: string; html: string } {
  const c = COPY[resolveLang(data.locale)];
  const step = c.steps[data.status as keyof typeof c.steps] ?? c.steps.in_production;
  const subject = `${step.subject} – ${data.orderNumber}`;

  const photos = data.photoUrls
    .map((u) => `<img src="${esc(u)}" alt="" style="display:block;width:100%;max-width:520px;border-radius:10px;margin:0 0 12px;"/>`)
    .join('');
  const address =
    data.status === 'awaiting_item'
      ? `<div style="margin:0 0 20px;padding:14px 16px;border-radius:10px;background:#f0fafa;border-left:3px solid #0d8f8c;">
           <div style="font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#0d8f8c;">${c.sendTo}</div>
           <div style="font-size:15px;font-weight:700;color:#0f172a;margin-top:4px;">${esc(data.returnAddress.name)}</div>
           <div style="font-size:14px;color:#1e293b;">${esc(data.returnAddress.line1)}<br>${esc(data.returnAddress.zip)} ${esc(data.returnAddress.city)}<br>${esc(data.returnAddress.country)}</div>
         </div>`
      : '';
  const tracking =
    data.status === 'returned' && data.returnTrackingNumber
      ? `<p style="margin:0 0 20px;font-size:14px;color:#1e293b;">${c.tracking}: <strong>${esc(data.returnTrackingNumber)}</strong>${data.returnTrackingUrl ? ` — <a href="${esc(data.returnTrackingUrl)}" style="color:#0d8f8c;">${esc(data.returnTrackingUrl)}</a>` : ''}</p>`
      : '';

  const body = `
    <p style="margin:0 0 6px;font-size:15px;">${c.greeting(esc(data.customerName))}</p>
    <p style="margin:0 0 20px;font-size:15px;">${step.message}</p>
    ${data.note ? `<p style="margin:0 0 20px;padding:12px 14px;border-radius:10px;background:#f8fafc;font-size:14px;color:#1e293b;white-space:pre-line;">${esc(data.note)}</p>` : ''}
    ${photos}
    ${address}
    ${tracking}
    <p style="font-size:13px;color:#64748b;margin:0;">${c.orderRef} : <strong style="color:#0f172a;">${esc(data.orderNumber)}</strong></p>
    ${data.trackingUrl ? ctaButton(c.track, data.trackingUrl) : ''}
    ${mutedText(c.help)}
  `;

  return { subject, html: baseLayout(step.heading, body, data.locale) };
}
