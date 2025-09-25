// Centralized list of sanitation/health-safety hazard keywords used across analysis
// Keep all entries lowercase
export const SANITATION_HAZARD_KEYWORDS: string[] = [
  'cockroach', 'cockroaches', 'roach', 'roaches',
  'rodent', 'rodents', 'rat', 'rats', 'mouse', 'mice',
  'insect', 'insects', 'bug', 'bugs', 'maggot', 'maggots',
  'mold', 'mould', 'mildew',
  'filthy', 'filth', 'dirty restroom', 'dirty bathroom', 'dirty toilet', 'unsanitary', 'unsanitary conditions',
  'hygiene', 'sanitation', 'infestation', 'infested',
  'food poisoning', 'vomit', 'vomiting', 'diarrhea', 'diarrhoea', 'nausea',
  'undercooked', 'raw chicken', 'raw meat', 'hair in food', 'sewage'
];

export function containsSanitationHazard(text: string): boolean {
  const lower = (text || '').toLowerCase();
  for (const kw of SANITATION_HAZARD_KEYWORDS) {
    if (lower.includes(kw)) return true;
  }
  return false;
}


