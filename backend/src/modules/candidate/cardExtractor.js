/**
 * @file cardExtractor.js
 * @description Intelligent OCR extraction service for Student ID Cards and Badges.
 * Utilizes tesseract.js for optical character recognition and heuristic regex parsers
 * tailored to university student identification cards.
 */

import { createWorker } from 'tesseract.js';
import { logger } from '../../utils/logger.js';

let sharedWorkerPromise = null;

/**
 * Gets or initializes a reusable Tesseract worker instance.
 */
async function getWorker() {
  if (!sharedWorkerPromise) {
    sharedWorkerPromise = (async () => {
      const worker = await createWorker('eng');
      return worker;
    })();
  }
  return sharedWorkerPromise;
}

/**
 * Maps extracted branch string to canonical department options.
 * @param {string} branch
 * @returns {string}
 */
export function mapBranchToDepartment(branch) {
  if (!branch || typeof branch !== 'string') return '';
  const b = branch.trim().toLowerCase();

  if (b.includes('electr') && (b.includes('comm') || b.includes('ec') || b.includes('telecom'))) {
    return 'Electronics and Communication Engineering (ECE)';
  }
  if (b.includes('comp') || b.includes('cse') || b.includes('cs') || b.includes('software')) {
    return 'Computer Science and Engineering (CSE)';
  }
  if (b.includes('info') || b.includes('ise') || b.includes('it') || b.includes('is')) {
    return 'Information Science and Engineering (ISE)';
  }
  if (b.includes('electr') && (b.includes('power') || b.includes('eee') || b.includes('electrical & elec'))) {
    return 'Electrical and Electronics Engineering (EEE)';
  }
  if (b.includes('mech')) {
    return 'Mechanical Engineering (ME)';
  }
  if (b.includes('civil')) {
    return 'Civil Engineering (CE)';
  }
  if (b.includes('ai') || b.includes('artificial') || b.includes('ml') || b.includes('machine learning')) {
    return 'Artificial Intelligence & Machine Learning (AIML)';
  }
  if (b.includes('data') || b.includes('ds')) {
    return 'Data Science & Engineering (DSE)';
  }
  if (b.includes('bio')) {
    return 'Biotechnology (BT)';
  }
  if (b.includes('chem')) {
    return 'Chemical Engineering (CHE)';
  }
  if (b.includes('aero')) {
    return 'Aerospace Engineering (AE)';
  }
  if (b.includes('robot')) {
    return 'Robotics & Automation';
  }

  return branch.trim();
}

/**
 * Converts English date string (e.g. "31st July 2027", "31-07-2027", "2027/07/31") to YYYY-MM-DD.
 * @param {string} dateStr
 * @returns {string | null}
 */
export function parseDateToISO(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;

  // Pattern 1: 31st July 2027 or 31 July 2027
  const months = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
  };
  const dmyText = dateStr.match(/(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(\d{4})/i);
  if (dmyText) {
    const day = dmyText[1].padStart(2, '0');
    const monKey = dmyText[2].toLowerCase().substring(0, 3);
    const mon = months[monKey];
    if (mon) {
      const yr = dmyText[3];
      return `${yr}-${mon}-${day}`;
    }
  }

  // Pattern 2: DD/MM/YYYY or DD-MM-YYYY
  const dmy = dateStr.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})\b/);
  if (dmy) {
    const day = dmy[1].padStart(2, '0');
    const month = dmy[2].padStart(2, '0');
    const year = dmy[3];
    return `${year}-${month}-${day}`;
  }

  return null;
}

/**
 * Parses raw OCR text into structured student identification attributes.
 * @param {string} rawText
 * @returns {object} Extracted properties
 */
export function parseStudentIdText(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    return {
      fullName: '',
      studentId: '',
      course: '',
      branch: '',
      department: '',
      institution: '',
      validity: '',
      validityText: '',
      bloodGroup: '',
      rawText: ''
    };
  }

  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  // 1. Student ID / USN / Roll Number
  let studentId = '';
  // Pattern A: Standard Indian University USN (e.g. 1NT23EC158, 1MS21CS042)
  const usnPattern = /\b([0-9][A-Z]{2}[0-9]{2}[A-Z]{2}[0-9]{3})\b/i;
  const usnMatch = rawText.match(usnPattern);
  if (usnMatch) {
    studentId = usnMatch[1].toUpperCase();
  }

  // Pattern B: USN / ADMIN No. label
  if (!studentId) {
    const adminMatch = rawText.match(/USN\s*(?:\/|\&)?\s*(?:ADMIN|REG(?:ISTRATION)?|ROLL)?\s*(?:No\.?|ID)?\s*[:\-]?\s*([a-zA-Z0-9_-]+)/i);
    if (adminMatch && adminMatch[1].length >= 4) {
      studentId = adminMatch[1].toUpperCase();
    }
  }

  // Pattern C: General ID / Reg No
  if (!studentId) {
    const generalMatch = rawText.match(/(?:ID\s*NO|ROLL\s*NO|REG\s*NO|ENROLLMENT|STUDENT\s*ID)\s*[:\-]?\s*([a-zA-Z0-9_-]+)/i);
    if (generalMatch && generalMatch[1].length >= 4) {
      studentId = generalMatch[1].toUpperCase();
    }
  }

  // 2. Course
  let course = '';
  const courseMatch = rawText.match(/COURSE\s*[:\-]?\s*([A-Za-z.\s]+?)(?=\n|\r|BRANCH|USN|$)/i);
  if (courseMatch) {
    course = courseMatch[1].trim();
  }

  // 3. Branch
  let branch = '';
  const branchMatch = rawText.match(/BRANCH\s*[:\-]?\s*([^\n\r]+)/i);
  if (branchMatch) {
    branch = branchMatch[1]
      .replace(/[:\-]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Map to canonical department
  const department = mapBranchToDepartment(branch);

  // 4. Validity / Expiry Date
  let validityText = '';
  let validityISO = '';
  const valMatch = rawText.match(/VALIDITY\s*[:\-©]?\s*([0-9]{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+\s+[0-9]{4}|[0-9]{1,2}[-/][0-9]{1,2}[-/][0-9]{2,4})/i);
  if (valMatch) {
    validityText = valMatch[1].trim();
    validityISO = parseDateToISO(validityText) || '';
  }

  // 5. Blood Group
  let bloodGroup = '';
  const bgMatch = rawText.match(/\b(A|B|AB|O)\s*([+-])\b/i);
  if (bgMatch) {
    bloodGroup = `${bgMatch[1].toUpperCase()}${bgMatch[2]}`;
  }

  // 6. Student Full Name:
  // Often printed right before the COURSE : BE line
  let fullName = '';
  const courseLineIndex = lines.findIndex((l) => /COURSE\s*[:\-]/i.test(l));
  if (courseLineIndex > 0) {
    for (let i = courseLineIndex - 1; i >= 0; i--) {
      const candidate = lines[i]
        .replace(/^[|_\-=~*\\/\s]+|[|_\-=~*\\/\s]+$/g, '')
        .trim();

      // Check if it looks like a person's name (alphabetic, > 3 chars, not university name)
      if (
        candidate.length >= 3 &&
        /^[A-Za-z\s.]+$/.test(candidate) &&
        !/INSTITUTE|COLLEGE|TECHNOLOGY|UNIVERSITY|CAMPUS|STUDENT|IDENTITY|CARD/i.test(candidate) &&
        !/^[A-B-O][+-]$/i.test(candidate)
      ) {
        fullName = candidate;
        break;
      }
    }
  }

  // Fallback: look for NAME: label
  if (!fullName) {
    const nameMatch = rawText.match(/NAME\s*[:\-]?\s*([A-Za-z\s.]+?)(?=\n|\r|COURSE|BRANCH|USN|$)/i);
    if (nameMatch && nameMatch[1].trim().length > 3) {
      fullName = nameMatch[1].trim();
    }
  }

  // 7. Institution Name
  let institution = '';
  const institutionKeywords = /(?:INSTITUTE|COLLEGE|UNIVERSITY|ACADEMY|POLYTECHNIC|VIDYAPEETH|VIDYALAYA)/i;
  const matchedInstLines = [];

  for (const line of lines) {
    if (
      (institutionKeywords.test(line) || /NITTE/i.test(line)) &&
      !/COURSE|BRANCH|USN|VALIDITY|SIGNATURE|STUDENT/i.test(line)
    ) {
      const cleanLine = line
        .replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, '')
        .replace(/\b(?!(?:of|in|at)\b)[A-Za-z]{1,2}\b/gi, '') // strip 1-2 char noise but preserve 'of', 'in'
        .replace(/\s+/g, ' ')
        .trim();
      if (cleanLine.length > 3) {
        matchedInstLines.push(cleanLine);
      }
    }
  }

  if (matchedInstLines.length > 0) {
    institution = matchedInstLines
      .join(' ')
      .replace(/\s+/g, ' ')
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase()); // Title case
  }

  return {
    fullName,
    studentId,
    course,
    branch,
    department,
    institution,
    validity: validityISO,
    validityText,
    bloodGroup,
    rawText
  };
}

/**
 * Runs OCR on an image buffer or file path and extracts structured card data.
 * @param {Buffer | string} imageInput
 * @returns {Promise<object>}
 */
export async function extractStudentIdCard(imageInput) {
  try {
    const worker = await getWorker();
    const result = await worker.recognize(imageInput);
    const rawText = result?.data?.text || '';

    logger.info({ rawLength: rawText.length }, 'Completed Student ID OCR recognition');

    const parsed = parseStudentIdText(rawText);
    return parsed;
  } catch (err) {
    logger.error({ err: err.message }, 'Failed to process Student ID with OCR');
    throw err;
  }
}
