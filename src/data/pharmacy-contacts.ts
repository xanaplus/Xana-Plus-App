/**
 * Pharmacy WhatsApp lines, as given by the owner on 21 Oct 2026 and used by the
 * website (assets/pharmacy-contacts.js). `wa` is the number for wa.me links:
 * 254…, with no +, no leading 0 and no spaces, or the chat does not open.
 */
export type PharmacyContact = {
  id: string;
  name: string;
  /** Pickup branch id in `stores`, so the customer's own branch can go first. */
  storeId?: string;
  kind: 'branch' | 'standalone';
  note: string;
  phone: string;
  wa: string;
};

export const PHARMACY_CONTACTS: readonly PharmacyContact[] = [
  { id: 'syokimau', name: 'Syokimau (Bellway Park)', storeId: 'syokimau', kind: 'branch', note: 'Pharmacy, shop and clinic', phone: '+254 718 555554', wa: '254718555554' },
  { id: 'ruiru', name: 'Ruiru', storeId: 'ruiru', kind: 'branch', note: 'Pharmacy, shop and clinic', phone: '+254 142 631157', wa: '254142631157' },
  { id: 'trm-drive', name: 'TRM Drive', kind: 'standalone', note: 'Pharmacy', phone: '+254 142 605347', wa: '254142605347' },
  { id: 'lumumba-drive', name: 'Lumumba Drive', kind: 'standalone', note: 'Pharmacy', phone: '+254 142 605372', wa: '254142605372' },
  { id: 'githurai', name: 'Githurai', kind: 'standalone', note: 'Pharmacy', phone: '+254 142 605361', wa: '254142605361' },
  { id: 'katani', name: 'Katani', kind: 'standalone', note: 'Pharmacy inside the Katani minimart', phone: '+254 119 304913', wa: '254119304913' },
];

export const WHATSAPP_GREETING = 'Hello Xana Pharmacy, I have a question for the pharmacist.';

export const whatsappLink = (contact: PharmacyContact) =>
  `https://wa.me/${contact.wa}?text=${encodeURIComponent(WHATSAPP_GREETING)}`;

/** Order-collection branches first (the customer's own branch leading), then the standalone pharmacies. */
export function groupedPharmacyContacts(storeId?: string) {
  const branches = PHARMACY_CONTACTS.filter(contact => contact.kind === 'branch');
  return {
    branches: [...branches.filter(contact => contact.storeId === storeId), ...branches.filter(contact => contact.storeId !== storeId)],
    standalone: PHARMACY_CONTACTS.filter(contact => contact.kind === 'standalone'),
  };
}
