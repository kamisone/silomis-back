export type Lang = 'fr' | 'en';

/** Unknown/unsupported locales fall back to French — silomis's default checkout locale. */
export function resolveLang(locale?: string | null): Lang {
  return locale === 'en' ? 'en' : 'fr';
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
  },
} as const;
