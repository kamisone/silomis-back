import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Test products exist to measure demand before buying inventory: they behave
 * like real products all the way through checkout, and are refused when the
 * customer tries to continue to payment.
 *
 * The refusal happens before any Stripe call, so no PaymentIntent is ever
 * created for a test product and no charge is possible.
 *
 * The message is deliberately a generic failure and carries no distinguishing
 * error code — a customer inspecting the response must not be able to tell a
 * test product from a real outage.
 */
const GENERIC_FAILURE_MESSAGE: Record<string, string> = {
  fr: "Une erreur s'est produite de notre côté. Nous vous prions de nous excuser, veuillez réessayer plus tard.",
  en: 'Something went wrong on our side. We apologise — please try again later.',
  es: 'Se ha producido un error por nuestra parte. Le pedimos disculpas — inténtelo de nuevo más tarde.',
  it: 'Si è verificato un errore da parte nostra. Ci scusiamo — riprova più tardi.',
  de: 'Bei uns ist ein Fehler aufgetreten. Wir bitten um Entschuldigung — bitte versuchen Sie es später erneut.',
  nl: 'Er is aan onze kant iets misgegaan. Onze excuses — probeer het later opnieuw.',
  pl: 'Wystąpił błąd po naszej stronie. Przepraszamy — spróbuj ponownie później.',
};

export function testCheckoutBlockedException(locale?: string | null): BadRequestException {
  const message = GENERIC_FAILURE_MESSAGE[(locale ?? 'fr').slice(0, 2)] ?? GENERIC_FAILURE_MESSAGE.en;
  return new BadRequestException({ message });
}

/**
 * True when any of the given products is a test product, i.e. the resulting
 * order must never reach payment. Called at order creation; the answer is
 * denormalised onto `shop_orders.isTestOrder`.
 */
export async function containsTestProduct(prisma: PrismaService, productIds: string[]): Promise<boolean> {
  if (!productIds.length) return false;
  const count = await prisma.product.count({ where: { id: { in: productIds }, isTestProduct: true } });
  return count > 0;
}
