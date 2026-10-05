/**
 * Pharmacy care data — repeat prescriptions on file and the active Rx order.
 *
 * Mirrors Figma screen 08b (My Prescriptions). Extracted from the Profile
 * sheet so the pharmacy screens and Profile read the same records.
 */

export type RepeatScript = {
  productId: string;
  prescriber: string;
  refillsLeft: number;
  /** Display date, e.g. "30 Sep 2026". */
  nextRefill: string;
  /** Set when the prescription has lapsed and a new one is required. */
  expired?: boolean;
  dueInDays?: number;
};

export const REPEAT_SCRIPTS: RepeatScript[] = [
  {
    productId: 'ibuprofen-400mg-30s',
    prescriber: 'Dr. Achieng’ · Nairobi Hospital',
    refillsLeft: 2,
    nextRefill: '30 Sep 2026',
    dueInDays: 5,
  },
  {
    productId: 'milk-magnesia-200ml',
    prescriber: 'Dr. Kamau · Kilimani Health',
    refillsLeft: 1,
    nextRefill: '04 Oct 2026',
  },
  {
    productId: 'calpol-infant-100ml',
    prescriber: 'Paediatrics desk · Xana Plus Ruiru',
    refillsLeft: 0,
    nextRefill: '18 Oct 2026',
    expired: true,
  },
];

/** The four dispensing stages shown on the active-order stepper. */
export const RX_STAGES = ['Received', 'With Pharmacist', 'Dispensed', 'Ready'] as const;
export type RxStage = (typeof RX_STAGES)[number];

export type ActiveRxOrder = {
  reference: string;
  stage: RxStage;
  readyBy: string;
  collectionPoint: string;
  productIds: string[];
};

export const ACTIVE_RX_ORDER: ActiveRxOrder = {
  reference: 'RX-8841',
  stage: 'Dispensed',
  readyBy: '4:30 PM today',
  collectionPoint: 'Xana Life Pharmacy Desk · Syokimau',
  productIds: ['ibuprofen-400mg-30s'],
};

/** Clinical services bookable from the care portal. */
export const CLINICAL_SERVICES = [
  { id: 'vaccinations', title: 'Vaccinations', description: 'Flu, travel and childhood schedules' },
  { id: 'bp-check', title: 'BP & sugar checks', description: 'Walk-in screening at the pharmacy desk' },
  { id: 'consultation', title: 'Pharmacist consultation', description: 'Private 15-minute clinical review' },
];

/** Topic chips offered before starting a consultation. */
export const CONSULT_TOPICS = [
  'Side effects',
  'Dosage & timing',
  'Drug interactions',
  'Pregnancy & breastfeeding',
  'Children’s doses',
  'Chronic medication',
  'Something else',
];

export const PHARMACIST = {
  name: 'Dr. Wanjiru Kamau',
  role: 'Pharmacist',
  registration: 'PPB Reg. No. 12345',
  responseTime: 'Usually replies in under 3 minutes',
};

/** Regulatory footer required on pharmacy screens. */
export const PPB_FOOTER = [
  'Licensed by the Kenya Pharmacy & Poisons Board (PPB)',
  'Xana Life Care Services · Xana Plus Syokimau & Xana Plus Ruiru',
];
