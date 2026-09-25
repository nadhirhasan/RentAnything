// Plain-English explanations behind the "?" icons (docs/SPEC.md §14).
// Pure: no runtime imports, so `node --test` can run it.

export type Help = { title: string; text: string };

export const HELP = {
  minDays: {
    title: 'Minimum hire',
    text:
      'The shortest rental the owner accepts. For example, if it says 30 days, you can only book this vehicle for ' +
      '30 days or more. Owners who rent monthly (for a company, a family or a long trip) usually set this.',
  },
  minDaysOwner: {
    title: 'Minimum rental days',
    text:
      'The shortest rental you accept. Customers can’t book fewer days than this. Choose 1 for day hires, 7 for ' +
      'weekly hires or 30 if you only rent monthly. Your listing clearly shows this to customers.',
  },
  freeKm: {
    title: 'Free km per day',
    text:
      'Kilometres included in the day price. For 3 days with 100 km a day, the customer can drive 300 km in total ' +
      'without paying more. Leave it empty or tick Unlimited km if there is no limit.',
  },
  extraKm: {
    title: 'Extra km charge',
    text:
      'What the customer pays for each km over the free km. Example: 350 km driven with 300 km free and Rs 45 / km ' +
      'is 50 × Rs 45 = Rs 2,250 extra.',
  },
  offers: {
    title: 'Weekly and monthly offers',
    text:
      'A cheaper total price for long hires. The weekly price is for 7 days and the monthly price is for 30 days; ' +
      'longer hires are worked out at the same rate. The trip estimate always uses whichever price is cheapest for ' +
      'the customer. "Km included" is the free km for the whole 7 or 30 days (empty = unlimited).',
  },
  doubleSeat: {
    title: 'Double seat',
    text:
      'A van with two rows of seats behind the driver (often a modified buddy van), so it carries more people. ' +
      'Switch it off for a single seat row.',
  },
  selfDrive: {
    title: 'Self-drive',
    text:
      'The customer drives the vehicle themselves. Owners usually ask for a driving licence, NIC and sometimes a ' +
      'deposit or guarantor.',
  },
  driver: {
    title: 'With a driver',
    text:
      'The owner or their driver drives. The driver price is per day and all-inclusive: the driver’s food and stay ' +
      'are part of it, so the customer doesn’t pay those separately. 0 means the day price already includes a driver.',
  },
  deposit: {
    title: 'Refundable deposit',
    text:
      'Money the customer gives the owner at pickup as security. The owner gives it back when the vehicle is ' +
      'returned in the same condition. It is paid in cash between you; RentAnything doesn’t hold it.',
  },
  documents: {
    title: 'Documents needed',
    text:
      'What the customer must show at pickup. NIC = National Identity Card. Guarantor = someone the owner can ' +
      'contact who vouches for the customer. Bring the originals.',
  },
  fuelPolicy: {
    title: 'Fuel policy',
    text:
      'Same fuel level: you get it with some fuel and return it with the same amount. Pay for fuel used: the owner ' +
      'charges for the fuel you used. Fuel included: fuel is part of the price.',
  },
  available: {
    title: 'Available for rent',
    text:
      'When this is off, the vehicle is hidden from search and nobody can message or book it. Switch it off when ' +
      'the vehicle is away or being repaired, and back on when it’s ready.',
  },
  nightToNight: {
    title: 'Night-to-night rental',
    text:
      'In Sri Lanka a rental day runs night to night. If you need the vehicle on the 27th, you collect it on the ' +
      'evening of the 26th and bring it back on the night of the 27th. That is 1 day.',
  },
  estimate: {
    title: 'Estimated total',
    text:
      'A guide worked out from the owner’s prices, the days and the km you enter. The final price is agreed with ' +
      'the owner when you meet, and you pay the owner in cash. You don’t pay anything in the app.',
  },
  agreedPrice: {
    title: 'Agreed price',
    text:
      'The total you and the customer agreed when you met. RentAnything’s fee is a percentage of this and is added ' +
      'to your balance when the rental starts.',
  },
  handoverCode: {
    title: 'Handover code',
    text:
      'A 4-digit code that proves the rental really started. When you both agree at pickup, the customer shows the ' +
      'code and the owner types it in. Customers: only share it when you have the vehicle.',
  },
  fee: {
    title: 'RentAnything fee',
    text:
      'Customers pay the owner directly in cash. Owners pay RentAnything a small fee (a percentage of the agreed ' +
      'price) for each rental that starts through the app.',
  },
  balance: {
    title: 'Your balance',
    text:
      'The fees you owe RentAnything. If it reaches the limit, or a fee stays unpaid too long, your vehicles are ' +
      'hidden from search until you pay. They come back as soon as you report a payment.',
  },
  hiddenNumbers: {
    title: 'Why numbers are hidden',
    text:
      'Phone numbers, emails and links are hidden in chat until the owner accepts a booking. This protects both ' +
      'sides from scams. After the owner accepts, you both see each other’s number with Call and WhatsApp buttons.',
  },
} satisfies Record<string, Help>;

// "1 month minimum", "1 week minimum", "3 days minimum" — null for 1 day.
export function minHireLabel(minDays: number): string | null {
  if (!minDays || minDays <= 1) return null;
  if (minDays % 30 === 0) return `${minDays / 30} month${minDays > 30 ? 's' : ''} minimum`;
  if (minDays % 7 === 0) return `${minDays / 7} week${minDays > 7 ? 's' : ''} minimum`;
  return `${minDays} days minimum`;
}

// The sentence under the title on the vehicle page.
export function minHireSentence(minDays: number): string | null {
  const label = minHireLabel(minDays);
  if (!label) return null;
  const period = label.replace(' minimum', '');
  const days = period.endsWith('days') ? '' : ` (${minDays} days)`;
  return `This vehicle can only be hired for ${period} or more${days}.`;
}
