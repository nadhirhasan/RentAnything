// Plain-English explanations behind the "?" icons (docs/SPEC.md §14).
// Pure: no runtime imports, so `node --test` can run it.

export type Help = { title: string; text: string };

export const HELP = {
  minDays: {
    title: 'Minimum hire',
    text:
      'This is the smallest number of days you can rent this vehicle. ' +
      'Example: if it says 30 days, you must rent it for 30 days or more. You cannot rent it for 1 or 2 days.',
  },
  minDaysOwner: {
    title: 'Minimum rental days',
    text:
      'The smallest number of days a customer can rent your vehicle. ' +
      'Choose 1 if you give it for one day. Choose 7 if you give it only by the week. ' +
      'Choose 30 if you give it only by the month. Customers will see this clearly.',
  },
  freeKm: {
    title: 'Free km per day',
    text:
      'How many km the customer can drive each day without paying more. ' +
      'Example: 100 km a day for 3 days = 300 km free. ' +
      'If there is no limit, tick "Unlimited km".',
  },
  extraKm: {
    title: 'Extra km charge',
    text:
      'Money for each km driven after the free km. ' +
      'Example: 300 km free, you drive 350 km, extra km is Rs 45. ' +
      'You pay 50 × Rs 45 = Rs 2,250 more.',
  },
  offers: {
    title: 'Weekly and monthly price',
    text:
      'A lower price when you rent for a long time. ' +
      'The weekly price is for 7 days. The monthly price is for 30 days. ' +
      'The app always shows you the cheapest price. ' +
      '"Km included" means the free km for all 7 or 30 days. Empty means no km limit.',
  },
  doubleSeat: {
    title: 'Double seat',
    text:
      'The van has two rows of seats behind the driver, so more people can travel. ' +
      'Many buddy vans are changed like this. Switch it off if there is only one row.',
  },
  selfDrive: {
    title: 'Self-drive',
    text:
      'You drive the vehicle yourself. No driver comes with it. ' +
      'The owner will usually ask for your driving licence and NIC.',
  },
  driver: {
    title: 'With a driver',
    text:
      'The owner or their driver drives the vehicle for you. ' +
      'The driver price is for one day and includes everything: the driver\'s food and room. ' +
      'You do not pay for those separately. If it says 0, the driver is already in the day price.',
  },
  deposit: {
    title: 'Refundable deposit',
    text:
      'Money you give the owner when you take the vehicle. ' +
      'The owner gives it all back when you return the vehicle with no damage. ' +
      'You pay it to the owner in cash. RentAnything does not keep it.',
  },
  documents: {
    title: 'Documents needed',
    text:
      'Papers you must show the owner when you take the vehicle. Bring the originals. ' +
      'NIC = National Identity Card. ' +
      'Guarantor = a person who knows you and will take responsibility for you if there is a problem.',
  },
  fuelPolicy: {
    title: 'Fuel',
    text:
      'Same fuel level: return the vehicle with the same amount of fuel you got. ' +
      'Pay for fuel used: the owner charges you for the fuel you used. ' +
      'Fuel included: fuel is already in the price.',
  },
  available: {
    title: 'Available for rent',
    text:
      'When this is off, nobody can see, message or book your vehicle. ' +
      'Turn it off when the vehicle is busy or being repaired. Turn it on again when it is ready.',
  },
  nightToNight: {
    title: 'How days are counted',
    text:
      'In Sri Lanka a rental day is from night to night. ' +
      'Example: you need the vehicle on the 27th. You take it on the 26th evening and bring it back on the 27th night. ' +
      'That is 1 day.',
  },
  estimate: {
    title: 'Estimated total',
    text:
      'This is only a guide. We calculate it from the owner\'s prices, your days and your km. ' +
      'You and the owner agree the final price when you meet. ' +
      'You pay the owner in cash. You do not pay anything in the app.',
  },
  agreedPrice: {
    title: 'Agreed price',
    text:
      'The full amount you and the customer agreed when you met. ' +
      'RentAnything\'s small fee is calculated from this amount. It is added to your balance when the rental starts.',
  },
  handoverCode: {
    title: 'Handover code',
    text:
      'A 4-number code that starts the rental in the app. ' +
      'Customer: when you are happy with the vehicle, show this code to the owner. ' +
      'Owner: type the customer\'s code in the app. ' +
      'Only rentals started with the code are protected: both of you get a rental record, ' +
      'a verified review, and help from RentAnything if something goes wrong. ' +
      'Customers, only give the code after you get the vehicle.',
  },
  fee: {
    title: 'RentAnything fee',
    text:
      'Customers pay the owner in cash. ' +
      'For each rental that starts with the code, the owner pays RentAnything a small fee in coins. ' +
      'Your first rentals are free, and there is a highest fee per rental, so long rentals never cost too much. ' +
      'Example: 5% of Rs 40,000 = Rs 2,000 = 200 coins.',
  },
  balance: {
    title: 'Your wallet',
    text:
      'Coins are how you pay RentAnything. 1 coin = a fixed amount of rupees (shown on this page). ' +
      'Each rental that starts takes some coins. If you go below zero, you owe coins. ' +
      'If you owe too many, or for too long, people cannot find your vehicles. ' +
      'Buy coins with a bank transfer, LankaQR or eZ Cash, tell us in the app, and your vehicles come back straight away. ' +
      'You can also buy coins in advance.',
  },
  rewards: {
    title: 'Owner rewards',
    text:
      'Start every rental with the customer\'s code and you get: ' +
      'free first rentals, a success score and badges (Rising Star, Top Rated, Top Rated Plus), ' +
      'a higher place in search (more customers see you), ' +
      'a rental record with the customer\'s details, and help from RentAnything if a customer causes trouble. ' +
      'Rentals without the code get none of this.',
  },
  successScore: {
    title: 'Success score',
    text:
      'Shows how happy customers are with you, like on Upwork. ' +
      'Good: reviews with 4 or 5 stars, and rentals started with the code that had no problems. ' +
      'Bad: reviews with 1 or 2 stars, cancelling after you accepted, not turning up, a vehicle not as described, ' +
      'or skipping the code. Score = good ÷ (good + bad), from the last 12 months. ' +
      'Badges: Rising Star (80%+ and 1 rental), Top Rated (90%+ and 5 rentals), Top Rated Plus (90%+ and 20 rentals).',
  },
  rentalRecord: {
    title: 'Rental record',
    text:
      'Proof of this rental: who rented which vehicle, for which days and for what price. ' +
      'It is saved in the app for both of you. Share it or take a screenshot to keep a copy. ' +
      'If there is a problem (damage, a missing vehicle, a deposit not returned), show it to RentAnything or the police.',
  },
  hiddenNumbers: {
    title: 'Why phone numbers are hidden',
    text:
      'Phone numbers, emails and links are hidden in chat until the owner accepts your booking. ' +
      'This stops scams and keeps both of you safe. ' +
      'After the owner accepts, you can see each other\'s number and call or WhatsApp.',
  },
} satisfies Record<string, Help>;

// "Minimum 1 month", "Minimum 2 weeks", "Minimum 3 days" — null for 1 day.
export function minHireLabel(minDays: number): string | null {
  if (!minDays || minDays <= 1) return null;
  return `Minimum ${minHirePeriod(minDays)}`;
}

function minHirePeriod(minDays: number): string {
  if (minDays % 30 === 0) return `${minDays / 30} month${minDays > 30 ? 's' : ''}`;
  if (minDays % 7 === 0) return `${minDays / 7} week${minDays > 7 ? 's' : ''}`;
  return `${minDays} days`;
}

// The sentence under the title on the vehicle page.
export function minHireSentence(minDays: number): string | null {
  if (!minDays || minDays <= 1) return null;
  const period = minHirePeriod(minDays);
  const days = period.endsWith('days') ? '' : ` (${minDays} days)`;
  return `You must rent this vehicle for at least ${period}${days}.`;
}
