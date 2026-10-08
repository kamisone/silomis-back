import { Lang, resolveLang } from '../email/templates/copy';

/**
 * What a customer reads on their phone, in the language they shopped in.
 *
 * Short on purpose. 160 characters is one SMS in the GSM alphabet and 70 once
 * a single character falls outside it (every Polish message, most Portuguese
 * ones), and a tracking link alone is ~90. So each message is one sentence:
 * what happened, the order number, and the link that says the rest.
 */
export type CustomerSmsKind =
  | 'order_confirmed'
  | 'payment_failed'
  | 'order_shipped'
  | 'order_cancelled'
  | 'send_in_received'
  | 'send_in_returned'
  | 'send_in_problem'
  | 'order_message'
  | 'access_link';

type Line = (n: string) => string;

const COPY: Record<Lang, Record<CustomerSmsKind, Line>> = {
  fr: {
    order_confirmed: (n) => `Merci ! Votre commande ${n} est confirmée. Suivez-la ici :`,
    payment_failed: (n) => `Le paiement de votre commande ${n} n'a pas abouti. Réessayez ici :`,
    order_shipped: (n) => `Votre commande ${n} est expédiée ! Suivi :`,
    order_cancelled: (n) => `Votre commande ${n} a été annulée. Détails :`,
    send_in_received: (n) => `Nous avons bien reçu votre article (commande ${n}). Suivi :`,
    send_in_returned: (n) => `Votre article brodé (commande ${n}) vous a été renvoyé. Suivi :`,
    send_in_problem: (n) => `Nous avons besoin de vous pour votre commande ${n}. Détails :`,
    order_message: (n) => `Nous avons répondu à votre message sur la commande ${n} :`,
    access_link: (n) => `Votre lien de suivi pour la commande ${n} :`,
  },
  en: {
    order_confirmed: (n) => `Thank you! Your order ${n} is confirmed. Track it here:`,
    payment_failed: (n) => `The payment for your order ${n} did not go through. Try again here:`,
    order_shipped: (n) => `Your order ${n} has shipped! Tracking:`,
    order_cancelled: (n) => `Your order ${n} has been cancelled. Details:`,
    send_in_received: (n) => `We have received your item (order ${n}). Tracking:`,
    send_in_returned: (n) => `Your embroidered item (order ${n}) is on its way back. Tracking:`,
    send_in_problem: (n) => `We need your input on order ${n}. Details:`,
    order_message: (n) => `We have replied to your message about order ${n}:`,
    access_link: (n) => `Your tracking link for order ${n}:`,
  },
  es: {
    order_confirmed: (n) => `¡Gracias! Tu pedido ${n} está confirmado. Síguelo aquí:`,
    payment_failed: (n) => `El pago de tu pedido ${n} no se ha completado. Inténtalo de nuevo:`,
    order_shipped: (n) => `¡Tu pedido ${n} ha sido enviado! Seguimiento:`,
    order_cancelled: (n) => `Tu pedido ${n} ha sido cancelado. Detalles:`,
    send_in_received: (n) => `Hemos recibido tu artículo (pedido ${n}). Seguimiento:`,
    send_in_returned: (n) => `Tu artículo bordado (pedido ${n}) ya va de vuelta. Seguimiento:`,
    send_in_problem: (n) => `Necesitamos tu respuesta sobre el pedido ${n}. Detalles:`,
    order_message: (n) => `Hemos respondido a tu mensaje sobre el pedido ${n}:`,
    access_link: (n) => `Tu enlace de seguimiento del pedido ${n}:`,
  },
  it: {
    order_confirmed: (n) => `Grazie! Il tuo ordine ${n} è confermato. Seguilo qui:`,
    payment_failed: (n) => `Il pagamento dell'ordine ${n} non è andato a buon fine. Riprova qui:`,
    order_shipped: (n) => `Il tuo ordine ${n} è stato spedito! Tracciamento:`,
    order_cancelled: (n) => `Il tuo ordine ${n} è stato annullato. Dettagli:`,
    send_in_received: (n) => `Abbiamo ricevuto il tuo articolo (ordine ${n}). Tracciamento:`,
    send_in_returned: (n) => `Il tuo articolo ricamato (ordine ${n}) è in viaggio verso di te. Tracciamento:`,
    send_in_problem: (n) => `Abbiamo bisogno di te per l'ordine ${n}. Dettagli:`,
    order_message: (n) => `Abbiamo risposto al tuo messaggio sull'ordine ${n}:`,
    access_link: (n) => `Il tuo link di tracciamento per l'ordine ${n}:`,
  },
  de: {
    order_confirmed: (n) => `Danke! Deine Bestellung ${n} ist bestätigt. Hier verfolgen:`,
    payment_failed: (n) => `Die Zahlung für deine Bestellung ${n} ist fehlgeschlagen. Erneut versuchen:`,
    order_shipped: (n) => `Deine Bestellung ${n} wurde versandt! Sendungsverfolgung:`,
    order_cancelled: (n) => `Deine Bestellung ${n} wurde storniert. Details:`,
    send_in_received: (n) => `Wir haben deinen Artikel erhalten (Bestellung ${n}). Status:`,
    send_in_returned: (n) => `Dein bestickter Artikel (Bestellung ${n}) ist auf dem Rückweg. Status:`,
    send_in_problem: (n) => `Wir brauchen deine Rückmeldung zu Bestellung ${n}. Details:`,
    order_message: (n) => `Wir haben auf deine Nachricht zu Bestellung ${n} geantwortet:`,
    access_link: (n) => `Dein Link zur Bestellung ${n}:`,
  },
  nl: {
    order_confirmed: (n) => `Bedankt! Je bestelling ${n} is bevestigd. Volg hem hier:`,
    payment_failed: (n) => `De betaling voor je bestelling ${n} is mislukt. Probeer het opnieuw:`,
    order_shipped: (n) => `Je bestelling ${n} is verzonden! Volgen:`,
    order_cancelled: (n) => `Je bestelling ${n} is geannuleerd. Details:`,
    send_in_received: (n) => `We hebben je artikel ontvangen (bestelling ${n}). Volgen:`,
    send_in_returned: (n) => `Je geborduurde artikel (bestelling ${n}) is onderweg terug. Volgen:`,
    send_in_problem: (n) => `We hebben je reactie nodig over bestelling ${n}. Details:`,
    order_message: (n) => `We hebben je bericht over bestelling ${n} beantwoord:`,
    access_link: (n) => `Je volglink voor bestelling ${n}:`,
  },
  pl: {
    order_confirmed: (n) => `Dziękujemy! Zamówienie ${n} zostało potwierdzone. Śledź je tutaj:`,
    payment_failed: (n) => `Płatność za zamówienie ${n} nie powiodła się. Spróbuj ponownie:`,
    order_shipped: (n) => `Zamówienie ${n} zostało wysłane! Śledzenie:`,
    order_cancelled: (n) => `Zamówienie ${n} zostało anulowane. Szczegóły:`,
    send_in_received: (n) => `Otrzymaliśmy Twój przedmiot (zamówienie ${n}). Śledzenie:`,
    send_in_returned: (n) => `Twój wyhaftowany przedmiot (zamówienie ${n}) wraca do Ciebie. Śledzenie:`,
    send_in_problem: (n) => `Potrzebujemy Twojej odpowiedzi w sprawie zamówienia ${n}. Szczegóły:`,
    order_message: (n) => `Odpowiedzieliśmy na Twoją wiadomość dot. zamówienia ${n}:`,
    access_link: (n) => `Twój link do zamówienia ${n}:`,
  },
  pt: {
    order_confirmed: (n) => `Obrigado! A sua encomenda ${n} está confirmada. Acompanhe aqui:`,
    payment_failed: (n) => `O pagamento da encomenda ${n} não foi concluído. Tente novamente:`,
    order_shipped: (n) => `A sua encomenda ${n} foi enviada! Seguimento:`,
    order_cancelled: (n) => `A sua encomenda ${n} foi cancelada. Detalhes:`,
    send_in_received: (n) => `Recebemos o seu artigo (encomenda ${n}). Seguimento:`,
    send_in_returned: (n) => `O seu artigo bordado (encomenda ${n}) está a caminho. Seguimento:`,
    send_in_problem: (n) => `Precisamos da sua resposta sobre a encomenda ${n}. Detalhes:`,
    order_message: (n) => `Respondemos à sua mensagem sobre a encomenda ${n}:`,
    access_link: (n) => `O seu link de seguimento da encomenda ${n}:`,
  },
};

/** `[Brand] sentence` and, on its own line, the link — a bare URL is what phones make tappable. */
export function renderCustomerSms(kind: CustomerSmsKind, orderNumber: string, url: string | null, locale?: string | null): string {
  const brand = process.env.SELLER_NAME ?? 'Silomis';
  const sentence = COPY[resolveLang(locale)][kind](orderNumber);
  if (url) return `${brand}: ${sentence}\n${url}`;
  // Every line ends by announcing the link ("… Details:"). Without a link that
  // announcement goes — the whole trailing phrase when it follows a full
  // sentence, else just the colon.
  const withoutLabel = sentence.replace(/([.!?])\s+[^.!?]*:$/, '$1');
  return `${brand}: ${withoutLabel !== sentence ? withoutLabel : sentence.replace(/\s*:$/, '.')}`;
}

// ── Not about an order: a checkout code and the abandoned-cart reminder ────

const CODE_COPY: Record<Lang, (code: string) => string> = {
  fr: (c) => `${c} est votre code de vérification. Il expire dans 10 minutes.`,
  en: (c) => `${c} is your verification code. It expires in 10 minutes.`,
  es: (c) => `${c} es tu código de verificación. Caduca en 10 minutos.`,
  it: (c) => `${c} è il tuo codice di verifica. Scade tra 10 minuti.`,
  de: (c) => `${c} ist dein Bestätigungscode. Er läuft in 10 Minuten ab.`,
  nl: (c) => `${c} is je verificatiecode. Hij verloopt over 10 minuten.`,
  pl: (c) => `${c} to Twój kod weryfikacyjny. Wygasa za 10 minut.`,
  pt: (c) => `${c} é o seu código de verificação. Expira em 10 minutos.`,
};

/** The code leads, so a phone's notification preview and its autofill both see it first. */
export function renderVerificationSms(code: string, locale?: string | null): string {
  const brand = process.env.SELLER_NAME ?? 'Silomis';
  return `${brand}: ${CODE_COPY[resolveLang(locale)](code)}`;
}

/**
 * The reminder and the way out of it. A marketing text has to say how to stop
 * them; with a phone as the gateway there is no short code, so the customer
 * replies STOP to this number and SmsController.receiveFromGateway records it.
 */
const CART_COPY: Record<Lang, { body: string; stop: string }> = {
  fr: { body: 'Votre panier vous attend ! Finalisez votre commande ici :', stop: 'STOP pour ne plus recevoir de SMS' },
  en: { body: 'Your basket is waiting! Complete your order here:', stop: 'Reply STOP to opt out' },
  es: { body: '¡Tu cesta te espera! Completa tu pedido aquí:', stop: 'Responde STOP para no recibir más SMS' },
  it: { body: 'Il tuo carrello ti aspetta! Completa l\'ordine qui:', stop: 'Rispondi STOP per non ricevere più SMS' },
  de: { body: 'Dein Warenkorb wartet! Schließe deine Bestellung hier ab:', stop: 'Antworte STOP zum Abmelden' },
  nl: { body: 'Je winkelmand wacht op je! Rond je bestelling hier af:', stop: 'Antwoord STOP om af te melden' },
  pl: { body: 'Twój koszyk czeka! Dokończ zamówienie tutaj:', stop: 'Odpowiedz STOP, aby zrezygnować' },
  pt: { body: 'O seu carrinho está à espera! Conclua a encomenda aqui:', stop: 'Responda STOP para deixar de receber' },
};

export function renderAbandonedCartSms(url: string, locale?: string | null): string {
  const brand = process.env.SELLER_NAME ?? 'Silomis';
  const c = CART_COPY[resolveLang(locale)];
  return `${brand}: ${c.body}\n${url}\n${c.stop}`;
}

/**
 * Whether an inbound text is an opt-out. The keywords carriers and customers
 * actually use, in the shop's languages; matched on the whole message so a
 * customer writing "please don't stop sending" is not unsubscribed.
 */
export function isStopReply(text: string): boolean {
  const word = text.trim().toLowerCase().replace(/[.!]+$/, '');
  return ['stop', 'arret', 'arrêt', 'stopp', 'parar', 'basta', 'stopa', 'unsubscribe', 'desabonner', 'désabonner'].includes(word);
}
