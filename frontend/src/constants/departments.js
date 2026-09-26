/**
 * @file departments.js
 * @description Standard academic departments for institutional candidate & faculty onboarding.
 */

export const ACADEMIC_DEPARTMENTS = [
  'Computer Science and Engineering (CSE)',
  'Electronics and Communication Engineering (ECE)',
  'Information Science and Engineering (ISE)',
  'Electrical and Electronics Engineering (EEE)',
  'Mechanical Engineering (ME)',
  'Civil Engineering (CE)',
  'Artificial Intelligence & Machine Learning (AIML)',
  'Data Science & Engineering (DSE)',
  'Biotechnology (BT)',
  'Chemical Engineering (CHE)',
  'Aerospace Engineering (AE)',
  'Robotics & Automation',
  'Biomedical Engineering',
  'Industrial & Production Engineering',
  'Mathematics & Computing',
  'Physics & Applied Sciences',
  'Other',
];

/**
 * Matches an arbitrary department string (e.g. "ECE", "CS", "Computer Science")
 * to the closest canonical department option.
 * @param {string} val
 * @returns {{ selectedOption: string, customValue: string }}
 */
export function resolveDepartment(val) {
  if (!val || typeof val !== 'string' || !val.trim()) {
    return { selectedOption: '', customValue: '' };
  }
  const clean = val.trim();

  // 1. Exact match
  const exact = ACADEMIC_DEPARTMENTS.find(
    (d) => d.toLowerCase() === clean.toLowerCase()
  );
  if (exact) return { selectedOption: exact, customValue: '' };

  // 2. Acronym inside parentheses (e.g. "ECE" matches "Electronics and Communication Engineering (ECE)")
  const acronymMatch = ACADEMIC_DEPARTMENTS.find((d) => {
    const m = d.match(/\(([^)]+)\)/);
    return m && m[1].toLowerCase() === clean.toLowerCase();
  });
  if (acronymMatch) return { selectedOption: acronymMatch, customValue: '' };

  // 3. Base name match without acronym (e.g. "Computer Science and Engineering")
  const nameMatch = ACADEMIC_DEPARTMENTS.find((d) => {
    const baseName = d.replace(/\s*\([^)]+\)/, '').trim().toLowerCase();
    return baseName === clean.toLowerCase();
  });
  if (nameMatch) return { selectedOption: nameMatch, customValue: '' };

  // 4. Starts with match (e.g. "Computer Science" -> "Computer Science and Engineering (CSE)")
  const prefixMatch = ACADEMIC_DEPARTMENTS.find((d) =>
    d.toLowerCase().startsWith(clean.toLowerCase())
  );
  if (prefixMatch) return { selectedOption: prefixMatch, customValue: '' };

  // 5. Unrecognized department -> "Other" with customValue preserved
  return { selectedOption: 'Other', customValue: clean };
}
