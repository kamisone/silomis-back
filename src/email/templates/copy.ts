export type Lang = 'fr' | 'en' | 'es' | 'it' | 'de' | 'nl' | 'pl';

const LANGS: Lang[] = ['fr', 'en', 'es', 'it', 'de', 'nl', 'pl'];

/**
 * The seven storefront locales, so a customer who shopped in Dutch is written
 * to in Dutch. Anything else — a locale the shop has not added, or none —
 * falls back to French, silomis's own language.
 */
export function resolveLang(locale?: string | null): Lang {
  const base = (locale ?? '').toLowerCase().split('-')[0] as Lang;
  return LANGS.includes(base) ? base : 'fr';
}

export const COPY = {
  fr: {
    /** Shared by the confirmation and status emails — both name the chosen point. */
    pickup: {
      title: 'Votre point de retrait',
      intro: 'Votre colis vous attendra ici :',
      ref: 'N° du point',
      hours: 'Horaires',
      closed: 'Fermé',
      weekdays: ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'],
    },
    footer: (year: number, name: string) =>
      `© ${year} ${name}. Tous droits réservés.`,

    orderConfirmed: {
      subject: (n: string) => `Commande confirmée – ${n}`,
      greeting: (name: string) => `Bonjour ${name},`,
      intro:
        "Merci pour votre commande ! Nous l'avons bien reçue et allons commencer à la traiter sous peu.",
      colProduct: 'Produit',
      colQty: 'Qté',
      colPrice: 'Prix unitaire',
      colTotal: 'Total',
      subtotal: 'Sous-total',
      shipping: 'Livraison',
      freeShipping: 'Gratuite',
      discount: 'Réduction',
      discountCode: (code: string) => `Réduction (code : ${code})`,
      grandTotal: 'Total',
      orderRef: 'Référence commande',
      embroidery: 'Broderie',
      embroideryThread: 'Fil :',
      trackOrder: 'Suivre ma commande',
      helpText:
        "Si vous avez la moindre question, n'hésitez pas à contacter notre service client.",
    },

    orderStatus: {
      preparing: {
        subjectSuffix: 'est en cours de préparation',
        heading: 'Votre commande est en cours de préparation',
        message: 'Bonne nouvelle — nous préparons votre commande.',
      },
      shipped: {
        subjectSuffix: 'a été expédiée',
        heading: 'Votre commande a été expédiée',
        message: 'Bonne nouvelle — votre commande est en route.',
      },
      delivered: {
        subjectSuffix: 'a été livrée',
        heading: 'Votre commande a été livrée',
        message:
          'Votre commande est arrivée. Nous espérons quelle vous plaira !',
      },
      cancelled: {
        subjectSuffix: 'a été annulée',
        heading: 'Votre commande a été annulée',
        message:
          "Cette commande a été annulée. Si vous n'êtes pas à l'origine de cette demande, veuillez contacter notre service client.",
      },
      greeting: (name: string) => `Bonjour ${name},`,
      subject: (n: string, suffix: string) => `Commande ${n} ${suffix}`,
      orderRef: 'Référence commande',
      trackOrder: 'Suivre ma commande',
      helpText:
        "Si vous avez la moindre question, n'hésitez pas à contacter notre service client.",
    },

    paymentFailed: {
      subject: (n: string) => `Paiement non abouti – ${n}`,
      greeting: (name: string) => `Bonjour ${name},`,
      intro:
        "Nous avons tenté de débiter votre moyen de paiement pour la commande ci-dessous, mais cela n'a pas abouti. Aucun montant n'a été prélevé — votre panier est toujours sauvegardé et prêt dès que vous souhaitez réessayer.",
      orderRef: 'Référence commande',
      cta: 'Réessayer le paiement',
      note: "Si le problème persiste, n'hésitez pas à contacter notre service client — nous serons ravis de vous aider.",
    },

    abandonedCart: {
      subject: 'Vous avez oublié quelque chose !',
      greeting: (name: string) => `Bonjour ${name},`,
      intro:
        'Vous avez laissé des articles dans votre panier. Finalisez votre commande avant quils ne soient plus disponibles.',
      cta: 'Finaliser ma commande',
      note: 'Votre panier est sauvegardé — cliquez simplement pour reprendre là où vous en étiez.',
    },

    reviewRequest: {
      subject: (p: string) => `Comment était votre ${p} ?`,
      greeting: (name: string) => `Bonjour ${name},`,
      intro: (order: string, product: string) =>
        `Votre commande <strong style="color:#0f172a;">${order}</strong> a été livrée. Nous aimerions connaître votre avis sur <strong style="color:#0f172a;">${product}</strong>.`,
      body: 'Votre avis aide les autres clients à faire de meilleurs choix.',
      cta: 'Laisser un avis',
      fallback: 'Ou copiez ce lien dans votre navigateur :',
    },

    backInStock: {
      subject: (p: string) => `De nouveau en stock – ${p}`,
      intro: 'Bonne nouvelle !',
      body: (p: string) =>
        `<strong>${p}</strong>, que vous avez ajouté à votre liste de souhaits, est de nouveau disponible.`,
      cta: 'Voir le produit',
    },
    orderAccessLink: {
      subject: (n: string) => `Votre lien sécurisé – ${n}`,
      greeting: (name: string) => `Bonjour ${name},`,
      intro: (n: string) =>
        `Voici votre lien sécurisé vers la commande <strong>${n}</strong>. Il ouvre le suivi et la conversation avec notre atelier.`,
      cta: 'Ouvrir ma commande',
      ignore:
        "Si vous n'avez pas demandé ce lien, ignorez simplement ce message : personne ne peut ouvrir la conversation sans lui.",
    },
  },

  en: {
    /** Shared by the confirmation and status emails — both name the chosen point. */
    pickup: {
      title: 'Your pickup point',
      intro: 'Your parcel will be waiting for you here:',
      ref: 'Point number',
      hours: 'Opening hours',
      closed: 'Closed',
      weekdays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
    },
    footer: (year: number, name: string) =>
      `© ${year} ${name}. All rights reserved.`,

    orderConfirmed: {
      subject: (n: string) => `Order confirmed – ${n}`,
      greeting: (name: string) => `Hello ${name},`,
      intro:
        "Thanks for your order! We've received it and will start processing it shortly.",
      colProduct: 'Product',
      colQty: 'Qty',
      colPrice: 'Unit price',
      colTotal: 'Total',
      subtotal: 'Subtotal',
      shipping: 'Shipping',
      freeShipping: 'Free',
      discount: 'Discount',
      discountCode: (code: string) => `Discount (code: ${code})`,
      grandTotal: 'Total',
      orderRef: 'Order reference',
      embroidery: 'Embroidery',
      embroideryThread: 'Thread:',
      trackOrder: 'Track my order',
      helpText:
        'If you have any questions, feel free to reach out to our support team.',
    },

    orderStatus: {
      preparing: {
        subjectSuffix: 'is being prepared',
        heading: 'Your order is being prepared',
        message: "Good news — we're getting your order ready to ship.",
      },
      shipped: {
        subjectSuffix: 'has shipped',
        heading: 'Your order has shipped',
        message: 'Good news — your order is on its way.',
      },
      delivered: {
        subjectSuffix: 'has been delivered',
        heading: 'Your order has been delivered',
        message: 'Your order has arrived. We hope you love it!',
      },
      cancelled: {
        subjectSuffix: 'has been cancelled',
        heading: 'Your order has been cancelled',
        message:
          'This order has been cancelled. If you did not request this, please contact our support team.',
      },
      greeting: (name: string) => `Hello ${name},`,
      subject: (n: string, suffix: string) => `Order ${n} ${suffix}`,
      orderRef: 'Order reference',
      trackOrder: 'Track my order',
      helpText:
        'If you have any questions, feel free to reach out to our support team.',
    },

    paymentFailed: {
      subject: (n: string) => `We couldn't process payment for order ${n}`,
      greeting: (name: string) => `Hello ${name},`,
      intro:
        "We tried to charge your payment method for the order below, but it didn't go through. No charge was made — your cart is still saved and ready whenever you'd like to try again.",
      orderRef: 'Order reference',
      cta: 'Retry payment',
      note: "If you keep running into this, feel free to reach out to our support team — we're happy to help.",
    },

    abandonedCart: {
      subject: 'You left something behind!',
      greeting: (name: string) => `Hello ${name},`,
      intro:
        'You still have items waiting in your cart. Complete your order before they sell out.',
      cta: 'Complete my order',
      note: "If you've already completed your purchase, you can safely ignore this email.",
    },

    reviewRequest: {
      subject: (p: string) => `How was your ${p}?`,
      greeting: (name: string) => `Hello ${name},`,
      intro: (order: string, product: string) =>
        `Your order <strong style="color:#0f172a;">${order}</strong> has been delivered. We'd love to hear what you think about <strong style="color:#0f172a;">${product}</strong>.`,
      body: 'Your review helps other shoppers make better choices.',
      cta: 'Write a review',
      fallback: 'Or copy this link into your browser:',
    },

    backInStock: {
      subject: (p: string) => `Back in stock – ${p}`,
      intro: 'Good news!',
      body: (p: string) =>
        `<strong>${p}</strong>, which you added to your wishlist, is back in stock.`,
      cta: 'View product',
    },
    orderAccessLink: {
      subject: (n: string) => `Your secure link – ${n}`,
      greeting: (name: string) => `Hello ${name},`,
      intro: (n: string) =>
        `Here is your secure link to order <strong>${n}</strong>. It opens the tracking page and the conversation with our workshop.`,
      cta: 'Open my order',
      ignore:
        'If you did not ask for this link, simply ignore this message — nobody can open the conversation without it.',
    },
  },
  es: {
    pickup: {
      title: 'Tu punto de recogida',
      intro: 'Tu paquete te esperará aquí:',
      ref: 'N.º del punto',
      hours: 'Horario',
      closed: 'Cerrado',
      weekdays: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'],
    },
    footer: (year: number, name: string) => `© ${year} ${name}. Todos los derechos reservados.`,

    orderConfirmed: {
      subject: (n: string) => `Pedido confirmado – ${n}`,
      greeting: (name: string) => `Hola ${name},`,
      intro: '¡Gracias por tu pedido! Lo hemos recibido y empezaremos a prepararlo en breve.',
      colProduct: 'Producto',
      colQty: 'Cant.',
      colPrice: 'Precio unitario',
      colTotal: 'Total',
      subtotal: 'Subtotal',
      shipping: 'Envío',
      freeShipping: 'Gratis',
      discount: 'Descuento',
      discountCode: (code: string) => `Descuento (código: ${code})`,
      grandTotal: 'Total',
      orderRef: 'Referencia del pedido',
      embroidery: 'Bordado',
      embroideryThread: 'Hilo:',
      trackOrder: 'Seguir mi pedido',
      helpText: 'Si tienes cualquier duda, escribe a nuestro servicio de atención al cliente.',
    },

    orderStatus: {
      preparing: { subjectSuffix: 'se está preparando', heading: 'Tu pedido se está preparando', message: 'Buenas noticias: estamos preparando tu pedido.' },
      shipped: { subjectSuffix: 'ha sido enviado', heading: 'Tu pedido ha sido enviado', message: 'Buenas noticias: tu pedido está en camino.' },
      delivered: { subjectSuffix: 'ha sido entregado', heading: 'Tu pedido ha sido entregado', message: 'Tu pedido ha llegado. ¡Esperamos que te encante!' },
      cancelled: { subjectSuffix: 'ha sido cancelado', heading: 'Tu pedido ha sido cancelado', message: 'Este pedido se ha cancelado. Si no lo has solicitado tú, ponte en contacto con nuestro servicio de atención al cliente.' },
      greeting: (name: string) => `Hola ${name},`,
      subject: (n: string, suffix: string) => `Pedido ${n} ${suffix}`,
      orderRef: 'Referencia del pedido',
      trackOrder: 'Seguir mi pedido',
      helpText: 'Si tienes cualquier duda, escribe a nuestro servicio de atención al cliente.',
    },

    paymentFailed: {
      subject: (n: string) => `No hemos podido procesar el pago del pedido ${n}`,
      greeting: (name: string) => `Hola ${name},`,
      intro: 'Intentamos cobrar tu método de pago para el pedido de abajo, pero no se completó. No se ha realizado ningún cargo: tu carrito sigue guardado para cuando quieras volver a intentarlo.',
      orderRef: 'Referencia del pedido',
      cta: 'Reintentar el pago',
      note: 'Si el problema persiste, escríbenos: estaremos encantados de ayudarte.',
    },

    abandonedCart: {
      subject: '¡Has dejado algo atrás!',
      greeting: (name: string) => `Hola ${name},`,
      intro: 'Todavía tienes artículos esperando en tu carrito. Completa tu pedido antes de que se agoten.',
      cta: 'Completar mi pedido',
      note: 'Si ya has completado tu compra, ignora este correo.',
    },

    reviewRequest: {
      subject: (p: string) => `¿Qué tal tu ${p}?`,
      greeting: (name: string) => `Hola ${name},`,
      intro: (order: string, product: string) =>
        `Tu pedido <strong style="color:#0f172a;">${order}</strong> ha sido entregado. Nos encantaría saber qué te parece <strong style="color:#0f172a;">${product}</strong>.`,
      body: 'Tu opinión ayuda a otros compradores a elegir mejor.',
      cta: 'Escribir una opinión',
      fallback: 'O copia este enlace en tu navegador:',
    },

    backInStock: {
      subject: (p: string) => `De nuevo en stock – ${p}`,
      intro: '¡Buenas noticias!',
      body: (p: string) => `<strong>${p}</strong>, que añadiste a tu lista de deseos, vuelve a estar en stock.`,
      cta: 'Ver el producto',
    },
    orderAccessLink: {
      subject: (n: string) => `Tu enlace seguro – ${n}`,
      greeting: (name: string) => `Hola ${name}:`,
      intro: (n: string) =>
        `Este es tu enlace seguro al pedido <strong>${n}</strong>. Abre el seguimiento y la conversación con nuestro taller.`,
      cta: 'Abrir mi pedido',
      ignore:
        'Si no has pedido este enlace, ignora este mensaje: nadie puede abrir la conversación sin él.',
    },
  },
  it: {
    pickup: {
      title: 'Il tuo punto di ritiro',
      intro: 'Il tuo pacco ti aspetterà qui:',
      ref: 'N. del punto',
      hours: 'Orari',
      closed: 'Chiuso',
      weekdays: ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'],
    },
    footer: (year: number, name: string) => `© ${year} ${name}. Tutti i diritti riservati.`,

    orderConfirmed: {
      subject: (n: string) => `Ordine confermato – ${n}`,
      greeting: (name: string) => `Ciao ${name},`,
      intro: 'Grazie per il tuo ordine! Lo abbiamo ricevuto e inizieremo a prepararlo a breve.',
      colProduct: 'Prodotto',
      colQty: 'Q.tà',
      colPrice: 'Prezzo unitario',
      colTotal: 'Totale',
      subtotal: 'Subtotale',
      shipping: 'Spedizione',
      freeShipping: 'Gratuita',
      discount: 'Sconto',
      discountCode: (code: string) => `Sconto (codice: ${code})`,
      grandTotal: 'Totale',
      orderRef: 'Riferimento ordine',
      embroidery: 'Ricamo',
      embroideryThread: 'Filo:',
      trackOrder: 'Segui il mio ordine',
      helpText: 'Per qualsiasi domanda, contatta il nostro servizio clienti.',
    },

    orderStatus: {
      preparing: { subjectSuffix: 'è in preparazione', heading: 'Il tuo ordine è in preparazione', message: 'Buone notizie: stiamo preparando il tuo ordine.' },
      shipped: { subjectSuffix: 'è stato spedito', heading: 'Il tuo ordine è stato spedito', message: 'Buone notizie: il tuo ordine è in viaggio.' },
      delivered: { subjectSuffix: 'è stato consegnato', heading: 'Il tuo ordine è stato consegnato', message: 'Il tuo ordine è arrivato. Speriamo ti piaccia!' },
      cancelled: { subjectSuffix: 'è stato annullato', heading: 'Il tuo ordine è stato annullato', message: 'Questo ordine è stato annullato. Se non sei stato tu a richiederlo, contatta il nostro servizio clienti.' },
      greeting: (name: string) => `Ciao ${name},`,
      subject: (n: string, suffix: string) => `Ordine ${n} ${suffix}`,
      orderRef: 'Riferimento ordine',
      trackOrder: 'Segui il mio ordine',
      helpText: 'Per qualsiasi domanda, contatta il nostro servizio clienti.',
    },

    paymentFailed: {
      subject: (n: string) => `Non siamo riusciti a elaborare il pagamento dell'ordine ${n}`,
      greeting: (name: string) => `Ciao ${name},`,
      intro: "Abbiamo provato ad addebitare il tuo metodo di pagamento per l'ordine qui sotto, ma non è andato a buon fine. Nessun addebito è stato effettuato: il tuo carrello è ancora salvato per quando vorrai riprovare.",
      orderRef: 'Riferimento ordine',
      cta: 'Riprova il pagamento',
      note: 'Se il problema persiste, scrivici: saremo felici di aiutarti.',
    },

    abandonedCart: {
      subject: 'Hai lasciato qualcosa nel carrello!',
      greeting: (name: string) => `Ciao ${name},`,
      intro: 'Ci sono ancora articoli nel tuo carrello. Completa il tuo ordine prima che si esauriscano.',
      cta: 'Completa il mio ordine',
      note: 'Se hai già completato il tuo acquisto, ignora questa e-mail.',
    },

    reviewRequest: {
      subject: (p: string) => `Com'è il tuo ${p}?`,
      greeting: (name: string) => `Ciao ${name},`,
      intro: (order: string, product: string) =>
        `Il tuo ordine <strong style="color:#0f172a;">${order}</strong> è stato consegnato. Ci piacerebbe sapere cosa pensi di <strong style="color:#0f172a;">${product}</strong>.`,
      body: 'La tua recensione aiuta gli altri clienti a scegliere meglio.',
      cta: 'Scrivi una recensione',
      fallback: 'Oppure copia questo link nel browser:',
    },

    backInStock: {
      subject: (p: string) => `Di nuovo disponibile – ${p}`,
      intro: 'Buone notizie!',
      body: (p: string) => `<strong>${p}</strong>, che avevi aggiunto alla tua lista dei desideri, è di nuovo disponibile.`,
      cta: 'Vedi il prodotto',
    },
    orderAccessLink: {
      subject: (n: string) => `Il tuo link sicuro – ${n}`,
      greeting: (name: string) => `Ciao ${name},`,
      intro: (n: string) =>
        `Ecco il tuo link sicuro all'ordine <strong>${n}</strong>. Apre il tracciamento e la conversazione con il nostro laboratorio.`,
      cta: 'Apri il mio ordine',
      ignore:
        'Se non hai richiesto questo link, ignora pure il messaggio: senza di esso nessuno può aprire la conversazione.',
    },
  },
  de: {
    pickup: {
      title: 'Ihre Abholstelle',
      intro: 'Ihr Paket wartet hier auf Sie:',
      ref: 'Nr. der Abholstelle',
      hours: 'Öffnungszeiten',
      closed: 'Geschlossen',
      weekdays: ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'],
    },
    footer: (year: number, name: string) => `© ${year} ${name}. Alle Rechte vorbehalten.`,

    orderConfirmed: {
      subject: (n: string) => `Bestellung bestätigt – ${n}`,
      greeting: (name: string) => `Hallo ${name},`,
      intro: 'Vielen Dank für Ihre Bestellung! Wir haben sie erhalten und beginnen in Kürze mit der Bearbeitung.',
      colProduct: 'Produkt',
      colQty: 'Menge',
      colPrice: 'Einzelpreis',
      colTotal: 'Gesamt',
      subtotal: 'Zwischensumme',
      shipping: 'Versand',
      freeShipping: 'Kostenlos',
      discount: 'Rabatt',
      discountCode: (code: string) => `Rabatt (Code: ${code})`,
      grandTotal: 'Gesamt',
      orderRef: 'Bestellnummer',
      embroidery: 'Stickerei',
      embroideryThread: 'Garn:',
      trackOrder: 'Meine Bestellung verfolgen',
      helpText: 'Bei Fragen wenden Sie sich gern an unseren Kundenservice.',
    },

    orderStatus: {
      preparing: { subjectSuffix: 'wird vorbereitet', heading: 'Ihre Bestellung wird vorbereitet', message: 'Gute Nachrichten – wir machen Ihre Bestellung versandfertig.' },
      shipped: { subjectSuffix: 'wurde versandt', heading: 'Ihre Bestellung wurde versandt', message: 'Gute Nachrichten – Ihre Bestellung ist unterwegs.' },
      delivered: { subjectSuffix: 'wurde zugestellt', heading: 'Ihre Bestellung wurde zugestellt', message: 'Ihre Bestellung ist angekommen. Wir hoffen, sie gefällt Ihnen!' },
      cancelled: { subjectSuffix: 'wurde storniert', heading: 'Ihre Bestellung wurde storniert', message: 'Diese Bestellung wurde storniert. Falls Sie das nicht veranlasst haben, wenden Sie sich bitte an unseren Kundenservice.' },
      greeting: (name: string) => `Hallo ${name},`,
      subject: (n: string, suffix: string) => `Bestellung ${n} ${suffix}`,
      orderRef: 'Bestellnummer',
      trackOrder: 'Meine Bestellung verfolgen',
      helpText: 'Bei Fragen wenden Sie sich gern an unseren Kundenservice.',
    },

    paymentFailed: {
      subject: (n: string) => `Die Zahlung für Bestellung konnte nicht verarbeitet werden: ${n}`,
      greeting: (name: string) => `Hallo ${name},`,
      intro: 'Wir haben versucht, Ihre Zahlungsmethode für die unten stehende Bestellung zu belasten, aber es hat nicht geklappt. Es wurde nichts abgebucht – Ihr Warenkorb ist weiterhin gespeichert, wann immer Sie es erneut versuchen möchten.',
      orderRef: 'Bestellnummer',
      cta: 'Zahlung erneut versuchen',
      note: 'Falls das Problem bestehen bleibt, schreiben Sie uns – wir helfen gern.',
    },

    abandonedCart: {
      subject: 'Sie haben etwas liegen lassen!',
      greeting: (name: string) => `Hallo ${name},`,
      intro: 'In Ihrem Warenkorb warten noch Artikel. Schließen Sie Ihre Bestellung ab, bevor sie ausverkauft sind.',
      cta: 'Bestellung abschließen',
      note: 'Falls Sie Ihren Kauf bereits abgeschlossen haben, können Sie diese E-Mail ignorieren.',
    },

    reviewRequest: {
      subject: (p: string) => `Wie gefällt Ihnen ${p}?`,
      greeting: (name: string) => `Hallo ${name},`,
      intro: (order: string, product: string) =>
        `Ihre Bestellung <strong style="color:#0f172a;">${order}</strong> wurde zugestellt. Wir würden gern erfahren, was Sie von <strong style="color:#0f172a;">${product}</strong> halten.`,
      body: 'Ihre Bewertung hilft anderen Kunden bei der Auswahl.',
      cta: 'Bewertung schreiben',
      fallback: 'Oder kopieren Sie diesen Link in Ihren Browser:',
    },

    backInStock: {
      subject: (p: string) => `Wieder verfügbar – ${p}`,
      intro: 'Gute Nachrichten!',
      body: (p: string) => `<strong>${p}</strong> aus Ihrer Wunschliste ist wieder verfügbar.`,
      cta: 'Produkt ansehen',
    },
    orderAccessLink: {
      subject: (n: string) => `Ihr sicherer Link – ${n}`,
      greeting: (name: string) => `Hallo ${name},`,
      intro: (n: string) =>
        `Hier ist Ihr sicherer Link zur Bestellung <strong>${n}</strong>. Er öffnet die Sendungsverfolgung und den Austausch mit unserer Werkstatt.`,
      cta: 'Bestellung öffnen',
      ignore:
        'Falls Sie diesen Link nicht angefordert haben, ignorieren Sie diese Nachricht einfach — ohne ihn kann niemand den Austausch öffnen.',
    },
  },
  nl: {
    pickup: {
      title: 'Je afhaalpunt',
      intro: 'Je pakket wacht hier op je:',
      ref: 'Nummer van het punt',
      hours: 'Openingstijden',
      closed: 'Gesloten',
      weekdays: ['Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag', 'Zondag'],
    },
    footer: (year: number, name: string) => `© ${year} ${name}. Alle rechten voorbehouden.`,

    orderConfirmed: {
      subject: (n: string) => `Bestelling bevestigd – ${n}`,
      greeting: (name: string) => `Hallo ${name},`,
      intro: 'Bedankt voor je bestelling! We hebben hem ontvangen en gaan er zo mee aan de slag.',
      colProduct: 'Product',
      colQty: 'Aantal',
      colPrice: 'Stukprijs',
      colTotal: 'Totaal',
      subtotal: 'Subtotaal',
      shipping: 'Verzending',
      freeShipping: 'Gratis',
      discount: 'Korting',
      discountCode: (code: string) => `Korting (code: ${code})`,
      grandTotal: 'Totaal',
      orderRef: 'Bestelnummer',
      embroidery: 'Borduurwerk',
      embroideryThread: 'Garen:',
      trackOrder: 'Mijn bestelling volgen',
      helpText: 'Heb je vragen? Neem gerust contact op met onze klantenservice.',
    },

    orderStatus: {
      preparing: { subjectSuffix: 'wordt klaargemaakt', heading: 'Je bestelling wordt klaargemaakt', message: 'Goed nieuws — we maken je bestelling klaar voor verzending.' },
      shipped: { subjectSuffix: 'is verzonden', heading: 'Je bestelling is verzonden', message: 'Goed nieuws — je bestelling is onderweg.' },
      delivered: { subjectSuffix: 'is bezorgd', heading: 'Je bestelling is bezorgd', message: 'Je bestelling is aangekomen. We hopen dat je er blij mee bent!' },
      cancelled: { subjectSuffix: 'is geannuleerd', heading: 'Je bestelling is geannuleerd', message: 'Deze bestelling is geannuleerd. Als je dit niet zelf hebt aangevraagd, neem dan contact op met onze klantenservice.' },
      greeting: (name: string) => `Hallo ${name},`,
      subject: (n: string, suffix: string) => `Bestelling ${n} ${suffix}`,
      orderRef: 'Bestelnummer',
      trackOrder: 'Mijn bestelling volgen',
      helpText: 'Heb je vragen? Neem gerust contact op met onze klantenservice.',
    },

    paymentFailed: {
      subject: (n: string) => `De betaling voor bestelling is niet gelukt: ${n}`,
      greeting: (name: string) => `Hallo ${name},`,
      intro: 'We hebben geprobeerd je betaalmethode te belasten voor onderstaande bestelling, maar dat is niet gelukt. Er is niets afgeschreven — je winkelwagen is bewaard voor wanneer je het opnieuw wilt proberen.',
      orderRef: 'Bestelnummer',
      cta: 'Betaling opnieuw proberen',
      note: 'Blijft het misgaan? Neem contact met ons op — we helpen je graag.',
    },

    abandonedCart: {
      subject: 'Je bent iets vergeten!',
      greeting: (name: string) => `Hallo ${name},`,
      intro: 'Er staan nog artikelen in je winkelwagen. Rond je bestelling af voordat ze uitverkocht zijn.',
      cta: 'Mijn bestelling afronden',
      note: 'Heb je je aankoop al afgerond? Dan kun je deze e-mail negeren.',
    },

    reviewRequest: {
      subject: (p: string) => `Hoe bevalt je ${p}?`,
      greeting: (name: string) => `Hallo ${name},`,
      intro: (order: string, product: string) =>
        `Je bestelling <strong style="color:#0f172a;">${order}</strong> is bezorgd. We horen graag wat je van <strong style="color:#0f172a;">${product}</strong> vindt.`,
      body: 'Je beoordeling helpt andere klanten bij hun keuze.',
      cta: 'Beoordeling schrijven',
      fallback: 'Of kopieer deze link in je browser:',
    },

    backInStock: {
      subject: (p: string) => `Weer op voorraad – ${p}`,
      intro: 'Goed nieuws!',
      body: (p: string) => `<strong>${p}</strong>, dat je aan je verlanglijst hebt toegevoegd, is weer op voorraad.`,
      cta: 'Product bekijken',
    },
    orderAccessLink: {
      subject: (n: string) => `Je beveiligde link – ${n}`,
      greeting: (name: string) => `Hallo ${name},`,
      intro: (n: string) =>
        `Dit is je beveiligde link naar bestelling <strong>${n}</strong>. Hij opent het volgen van je bestelling en het gesprek met ons atelier.`,
      cta: 'Mijn bestelling openen',
      ignore:
        'Heb je deze link niet aangevraagd? Negeer dit bericht gerust — zonder de link kan niemand het gesprek openen.',
    },
  },
  pl: {
    pickup: {
      title: 'Twój punkt odbioru',
      intro: 'Twoja paczka będzie czekać tutaj:',
      ref: 'Nr punktu',
      hours: 'Godziny otwarcia',
      closed: 'Zamknięte',
      weekdays: ['Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota', 'Niedziela'],
    },
    footer: (year: number, name: string) => `© ${year} ${name}. Wszelkie prawa zastrzeżone.`,

    orderConfirmed: {
      subject: (n: string) => `Zamówienie potwierdzone – ${n}`,
      greeting: (name: string) => `Dzień dobry ${name},`,
      intro: 'Dziękujemy za zamówienie! Otrzymaliśmy je i wkrótce zaczniemy realizację.',
      colProduct: 'Produkt',
      colQty: 'Ilość',
      colPrice: 'Cena jedn.',
      colTotal: 'Razem',
      subtotal: 'Suma częściowa',
      shipping: 'Dostawa',
      freeShipping: 'Bezpłatna',
      discount: 'Rabat',
      discountCode: (code: string) => `Rabat (kod: ${code})`,
      grandTotal: 'Razem',
      orderRef: 'Numer zamówienia',
      embroidery: 'Haft',
      embroideryThread: 'Nić:',
      trackOrder: 'Śledź moje zamówienie',
      helpText: 'W razie pytań skontaktuj się z naszą obsługą klienta.',
    },

    orderStatus: {
      preparing: { subjectSuffix: 'jest przygotowywane', heading: 'Twoje zamówienie jest przygotowywane', message: 'Dobra wiadomość — przygotowujemy Twoje zamówienie do wysyłki.' },
      shipped: { subjectSuffix: 'zostało wysłane', heading: 'Twoje zamówienie zostało wysłane', message: 'Dobra wiadomość — Twoje zamówienie jest w drodze.' },
      delivered: { subjectSuffix: 'zostało dostarczone', heading: 'Twoje zamówienie zostało dostarczone', message: 'Twoje zamówienie dotarło. Mamy nadzieję, że się podoba!' },
      cancelled: { subjectSuffix: 'zostało anulowane', heading: 'Twoje zamówienie zostało anulowane', message: 'To zamówienie zostało anulowane. Jeśli to nie Ty o to prosiłeś/aś, skontaktuj się z naszą obsługą klienta.' },
      greeting: (name: string) => `Dzień dobry ${name},`,
      subject: (n: string, suffix: string) => `Zamówienie ${n} ${suffix}`,
      orderRef: 'Numer zamówienia',
      trackOrder: 'Śledź moje zamówienie',
      helpText: 'W razie pytań skontaktuj się z naszą obsługą klienta.',
    },

    paymentFailed: {
      subject: (n: string) => `Nie udało się przetworzyć płatności za zamówienie ${n}`,
      greeting: (name: string) => `Dzień dobry ${name},`,
      intro: 'Próbowaliśmy obciążyć Twoją metodę płatności za poniższe zamówienie, ale się nie udało. Nic nie zostało pobrane — Twój koszyk jest nadal zapisany, gdybyś chciał(a) spróbować ponownie.',
      orderRef: 'Numer zamówienia',
      cta: 'Ponów płatność',
      note: 'Jeśli problem się powtarza, napisz do nas — chętnie pomożemy.',
    },

    abandonedCart: {
      subject: 'Coś zostało w koszyku!',
      greeting: (name: string) => `Dzień dobry ${name},`,
      intro: 'W Twoim koszyku wciąż czekają produkty. Dokończ zamówienie, zanim się wyprzedadzą.',
      cta: 'Dokończ zamówienie',
      note: 'Jeśli zakup został już sfinalizowany, zignoruj tę wiadomość.',
    },

    reviewRequest: {
      subject: (p: string) => `Jak oceniasz ${p}?`,
      greeting: (name: string) => `Dzień dobry ${name},`,
      intro: (order: string, product: string) =>
        `Twoje zamówienie <strong style="color:#0f172a;">${order}</strong> zostało dostarczone. Chętnie dowiemy się, co sądzisz o <strong style="color:#0f172a;">${product}</strong>.`,
      body: 'Twoja opinia pomaga innym klientom w wyborze.',
      cta: 'Napisz opinię',
      fallback: 'Albo skopiuj ten link do przeglądarki:',
    },

    backInStock: {
      subject: (p: string) => `Ponownie dostępny – ${p}`,
      intro: 'Dobra wiadomość!',
      body: (p: string) => `<strong>${p}</strong>, który dodałeś/aś do listy życzeń, jest znów dostępny.`,
      cta: 'Zobacz produkt',
    },
    orderAccessLink: {
      subject: (n: string) => `Twój bezpieczny link – ${n}`,
      greeting: (name: string) => `Cześć ${name},`,
      intro: (n: string) =>
        `Oto Twój bezpieczny link do zamówienia <strong>${n}</strong>. Otwiera śledzenie przesyłki oraz rozmowę z naszą pracownią.`,
      cta: 'Otwórz moje zamówienie',
      ignore:
        'Jeśli nie prosiłeś o ten link, po prostu zignoruj tę wiadomość — bez niego nikt nie otworzy rozmowy.',
    },
  },
} as const;
