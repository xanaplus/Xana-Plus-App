import type { IconName } from '@/components/ui';

export type ClinicalCategory = 'vitals' | 'immunization' | 'consultations' | 'chronic-care';

export type ClinicalService = {
  id: string;
  name: string;
  description: string;
  category: ClinicalCategory;
  durationMinutes: number;
  price: number;
  priceLabel: string;
  tag: string;
  icon: IconName;
  badge?: string;
};

/** The six services on the Clinical Services Directory frame. */
export const CLINICAL_SERVICES: ClinicalService[] = [
  {
    id: 'bp-check',
    name: 'Blood Pressure Check',
    description: 'Fast automated and manual auscultatory reading with lifestyle & medication guidance.',
    category: 'vitals',
    durationMinutes: 10,
    price: 150,
    priceLabel: 'Standard Rate',
    tag: 'Free with refill',
    icon: 'heart',
    badge: 'Popular',
  },
  {
    id: 'glucose-hba1c',
    name: 'Blood Glucose & HbA1c',
    description: 'Instant capillary blood sugar reading & optional 3-month average screening.',
    category: 'chronic-care',
    durationMinutes: 15,
    price: 350,
    priceLabel: 'Service Rate',
    tag: 'Instant Digital Log',
    icon: 'molecule',
  },
  {
    id: 'vaccination',
    name: 'Vaccination & Immunization',
    description: 'Flu shots, Hepatitis B, Tetanus, Typhoid, and travel boosters administered in-suite.',
    category: 'immunization',
    durationMinutes: 20,
    price: 1200,
    priceLabel: 'Starting from',
    tag: 'Cold-Chain Assured',
    icon: 'bandage',
    badge: 'In-Suite',
  },
  {
    id: 'consultation',
    name: 'Pharmacist Consultation',
    description: 'Detailed medication therapy review, drug-drug interaction audit, and chronic refill planning.',
    category: 'consultations',
    durationMinutes: 25,
    price: 500,
    priceLabel: 'Clinical Fee',
    tag: 'Private Consultation Room',
    icon: 'stethoscope',
  },
  {
    id: 'cholesterol',
    name: 'Cholesterol & Lipid Profile',
    description: 'Rapid fingerstick lipid panel including total cholesterol, HDL, and triglycerides.',
    category: 'vitals',
    durationMinutes: 15,
    price: 800,
    priceLabel: 'Rapid Panel Rate',
    tag: 'Fasting Recommended',
    icon: 'thermometer',
  },
  {
    id: 'malaria-typhoid',
    name: 'Malaria & Typhoid Antigen',
    description: 'PPB-approved point-of-care rapid diagnostic testing with immediate results.',
    category: 'vitals',
    durationMinutes: 15,
    price: 400,
    priceLabel: 'Test Fee',
    tag: 'Certified Kit',
    icon: 'scale',
  },
];

export const CLINICAL_CATEGORY_LABELS: { value: ClinicalCategory | null; label: string }[] = [
  { value: null, label: 'All Services' },
  { value: 'vitals', label: 'Vitals & Screening' },
  { value: 'immunization', label: 'Immunization' },
  { value: 'consultations', label: 'Consultations' },
  { value: 'chronic-care', label: 'Chronic Care' },
];

export const clinicalServiceById = (id: string): ClinicalService | undefined =>
  CLINICAL_SERVICES.find(service => service.id === id);
