import { B, H, LegalPage, Li, P } from '@/components/legal';

export default function TermsScreen() {
  return (
    <LegalPage title="Terms of use">
      <P>
        These terms apply when you use RentAnything, on the web or in the app. By creating an account or using the
        service you agree to them.
      </P>

      <H>What RentAnything is</H>
      <P>
        RentAnything is a listing service. It helps customers find rental vehicles and contact their owners.
        <B> We are not a party to any rental.</B> The agreement, price, payment, deposit, insurance and handover
        are between the customer and the owner.
      </P>

      <H>Your account</H>
      <Li>You must be 18 or older and give accurate information.</Li>
      <Li>Keep your password safe. You are responsible for what happens on your account.</Li>

      <H>If you list a vehicle</H>
      <Li>You must own the vehicle or have the owner&apos;s permission to rent it out.</Li>
      <Li>
        The vehicle must have a valid revenue licence, insurance that covers rental use, and, where needed, the
        permits required to rent it. Drivers you provide must hold a valid licence.
      </Li>
      <Li>Listings must be accurate: real photos of this vehicle, correct prices, km limits and terms.</Li>
      <Li>Keep the availability switch up to date. Switch it off when the vehicle is out on hire.</Li>
      <Li>Treat customers fairly and honour the price you agreed with them.</Li>

      <H>Bookings and RentAnything&apos;s fee</H>
      <Li>
        Customers can send a booking request. When the owner accepts, both see each other&apos;s phone number. At
        pickup, the customer shows a 4-digit code and the owner enters it to start the rental.
      </Li>
      <Li>
        The customer pays the owner directly, usually in cash. <B>RentAnything doesn&apos;t take payments for
        rentals.</B>
      </Li>
      <Li>
        When a rental starts with the customer&apos;s code, RentAnything&apos;s fee (a percentage of the agreed
        price, with a maximum per rental, shown on your coins page) is taken from the owner&apos;s coins. A new
        owner&apos;s first rentals are free. Owners buy coins by bank transfer, LankaQR or eZ Cash. Coins have a
        fixed value in rupees, are only used for RentAnything fees, and are not refunded as cash.
      </Li>
      <Li>
        If an owner owes too many coins, or owes them for too long, their vehicles are hidden and they can&apos;t
        accept bookings until they buy coins. Owners can&apos;t delete their account while they owe coins.
      </Li>
      <Li>
        Don&apos;t arrange rentals outside the app to avoid the fee after meeting through a booking. If a customer
        tells us a rental happened without the code, we may charge the fee on the listed price.
      </Li>

      <H>If you rent a vehicle</H>
      <Li>Check the vehicle, the owner&apos;s documents and the agreement before you pay or drive.</Li>
      <Li>
        <B>Be careful with advance payments.</B> Never pay large amounts before seeing the vehicle. Report any
        listing that asks for money in a suspicious way.
      </Li>
      <Li>Only self-drive if you hold a valid licence for that vehicle class.</Li>

      <H>Reviews</H>
      <Li>Only people who contacted an owner through RentAnything can review. Reviews must be honest and about
        your own experience.</Li>
      <Li>No insults, personal information, phone numbers or fake reviews. Owners may reply publicly.</Li>

      <H>Not allowed</H>
      <Li>Fake, misleading or duplicate listings, or vehicles that are stolen or not road-legal.</Li>
      <Li>Collecting owners&apos; numbers in bulk, spam, or using the service for anything illegal.</Li>
      <Li>Harassing or threatening other users.</Li>
      <Li>
        Sharing phone numbers or links in chat to get around bookings, or asking for money before the other person
        has seen the vehicle.
      </Li>

      <H>Moderation</H>
      <P>
        We may hide or remove listings and reviews, block chats, and suspend accounts that break these terms.
        Listings reported by several people may be hidden automatically until we check them. When a chat is
        reported or a booking is disputed, we may read that chat to decide.
      </P>

      <H>Our liability</H>
      <P>
        We work to keep listings accurate and the service safe, but we don&apos;t inspect vehicles or check owners
        in person. As far as the law allows, RentAnything is not liable for losses from rentals arranged through the
        service, including accidents, damage, disputes over payment or deposits, or information given by other
        users.
      </P>

      <H>Changes and ending</H>
      <P>
        We may update these terms and will tell you about important changes in the app. You can stop using
        RentAnything and delete your account at any time.
      </P>

      <H>Law</H>
      <P>These terms are governed by the laws of Sri Lanka.</P>

      <H>Contact</H>
      <P>Use Help &amp; support in the Account tab.</P>
    </LegalPage>
  );
}
