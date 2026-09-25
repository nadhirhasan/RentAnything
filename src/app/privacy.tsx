import { B, H, LegalPage, Li, P } from '@/components/legal';

export default function PrivacyScreen() {
  return (
    <LegalPage title="Privacy policy">
      <P>
        RentAnything connects people in Sri Lanka who want to rent a vehicle with the owners who rent them out.
        This policy explains what information we collect, why, and the choices you have. It is written to meet
        Sri Lanka&apos;s Personal Data Protection Act, No. 9 of 2022.
      </P>

      <H>What we collect</H>
      <Li>
        <B>Account details:</B> your name, email address and password (stored encrypted by our login provider).
      </Li>
      <Li>
        <B>Contact numbers:</B> the phone and WhatsApp numbers owners add so customers can reach them.
      </Li>
      <Li>
        <B>Listings:</B> vehicle details, prices, photos, and where the vehicle is parked (a map point and town).
      </Li>
      <Li>
        <B>Your location while searching:</B> if you allow it, your phone&apos;s location is used to show the
        nearest vehicles. It is sent with each search and is not stored in your account.
      </Li>
      <Li>
        <B>Contact history:</B> when you tap Call or WhatsApp we record which listing you contacted and when. This
        lets owners confirm who rented from them and decides who can leave a review.
      </Li>
      <Li>
        <B>Bookings:</B> the dates, driver option, your message to the owner, the agreed price, what happened at
        pickup, and ratings owners give customers.
      </Li>
      <Li>
        <B>Owner payments:</B> the fees you owe RentAnything and the payments you report (amount, method and
        reference).
      </Li>
      <Li>
        <B>Reviews, feedback and reports</B> you submit.
      </Li>

      <H>How we use it</H>
      <Li>To show listings, sorted by distance, and to let you contact owners.</Li>
      <Li>To let owners manage their listings and see who contacted them.</Li>
      <Li>To publish reviews and keep the service safe: checking reports, hiding fake listings and stopping abuse
        such as collecting phone numbers in bulk.</Li>
      <Li>To send account emails such as confirming your email or resetting your password.</Li>
      <P>We do not sell your personal information and we do not show third-party advertising.</P>

      <H>What other people can see</H>
      <Li>
        <B>Everyone:</B> listings, their town and distance (never the exact parking spot), the owner&apos;s name,
        and reviews showing the reviewer&apos;s first name and last initial.
      </Li>
      <Li>
        <B>Signed-in users who tap Call or WhatsApp:</B> the owner&apos;s phone / WhatsApp number.
      </Li>
      <Li>
        <B>Owners:</B> the names of people who contacted them about a listing in the last 14 days, to confirm who
        rented it.
      </Li>
      <Li>
        <B>When you send a booking request:</B> the owner sees your name, how long you&apos;ve been on
        RentAnything, your number of rentals and the ratings other owners gave you. Once they accept, you both see
        each other&apos;s phone number.
      </Li>
      <Li>Reports are private. Owners never see who reported them.</Li>

      <H>Where your data is stored</H>
      <P>
        Our database, login and photo storage are provided by Supabase and hosted in Mumbai, India. Supabase
        processes the data only on our instructions. Data sent over the internet is encrypted.
      </P>

      <H>How long we keep it</H>
      <P>
        We keep your information while your account is open. When you delete your account we delete your profile,
        listings, photos, reviews and contact history straight away. Backups are overwritten within 30 days.
      </P>

      <H>Your rights</H>
      <Li>See and correct your details in Account at any time.</Li>
      <Li>
        Delete your account and data: Account → Delete account in the app, or on the web at /delete-account.
      </Li>
      <Li>Switch off location access in your phone&apos;s settings. You can choose a town instead.</Li>
      <Li>Ask us what information we hold about you, or complain about how we use it, using the contact below.</Li>

      <H>Children</H>
      <P>RentAnything is for people aged 18 and over.</P>

      <H>Changes</H>
      <P>If we change this policy we will update the date above and tell you in the app for important changes.</P>

      <H>Contact</H>
      <P>Questions about your privacy: use Help &amp; support in the Account tab.</P>
    </LegalPage>
  );
}
