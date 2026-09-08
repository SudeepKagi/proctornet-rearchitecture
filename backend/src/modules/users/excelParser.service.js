/**
 * @file excelParser.service.js
 * @description Ingestion service for Microsoft Excel (.xlsx, .xls) and CSV rosters.
 * Implements header normalization, row format validation, and duplicate detection.
 */

import * as XLSX from 'xlsx';

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

/**
 * Normalizes an arbitrary header string to a canonical field key.
 * @param {string} rawHeader
 * @returns {string}
 */
export function normalizeHeader(rawHeader) {
  if (!rawHeader || typeof rawHeader !== 'string') return '';
  const cleaned = rawHeader.trim().toLowerCase().replace(/[\s_-]+/g, '');

  if (['usn', 'enrollmentnumber', 'enrollmentno', 'registrationnumber'].includes(cleaned)) {
    return 'identifier';
  }
  if (['employeeid', 'employeeno', 'facultyid', 'facultyno', 'staffid'].includes(cleaned)) {
    return 'identifier';
  }
  if (['name', 'fullname', 'studentname', 'facultyname'].includes(cleaned)) {
    return 'name';
  }
  if (['email', 'emailaddress', 'institutionalemail'].includes(cleaned)) {
    return 'email';
  }
  if (['phone', 'phonenumber', 'mobile', 'mobilenumber'].includes(cleaned)) {
    return 'phone';
  }
  if (['role', 'userrole'].includes(cleaned)) {
    return 'role';
  }
  if (cleaned.includes('password')) {
    return 'password_forbidden';
  }

  return rawHeader.trim();
}

/**
 * Parses an Excel or CSV buffer and validates rows.
 * @param {Buffer} fileBuffer
 * @param {object} [options]
 * @param {'STUDENT' | 'FACULTY'} [options.defaultRole='STUDENT']
 * @returns {{ validRows: Array<object>, invalidRows: Array<object>, totalRows: number }}
 */
export function parseUserRoster(fileBuffer, options = {}) {
  const defaultRole = options.defaultRole || 'STUDENT';

  let workbook;
  try {
    workbook = XLSX.read(fileBuffer, { type: 'buffer' });
  } catch (err) {
    throw new Error('Failed to read spreadsheet file: Invalid format or corrupted archive');
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error('Spreadsheet contains no worksheets');
  }

  const worksheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json(worksheet, { defval: '', raw: false });

  if (rawRows.length === 0) {
    return { validRows: [], invalidRows: [], totalRows: 0 };
  }

  const validRows = [];
  const invalidRows = [];
  const seenEmails = new Set();
  const seenIdentifiers = new Set();

  for (let i = 0; i < rawRows.length; i++) {
    const rawRow = rawRows[i];
    const rowNumber = i + 2; // Row 1 is header
    const normalized = {};

    for (const [key, val] of Object.entries(rawRow)) {
      const canonicalKey = normalizeHeader(key);
      normalized[canonicalKey] = typeof val === 'string' ? val.trim() : String(val).trim();
    }

    // 1. Check for forbidden password column
    if (normalized.password_forbidden !== undefined && normalized.password_forbidden !== '') {
      invalidRows.push({
        rowNumber,
        data: rawRow,
        error: 'Spreadsheet contains forbidden password column. Passwords must be generated server-side.'
      });
      continue;
    }

    const name = normalized.name;
    const email = normalized.email?.toLowerCase();
    const identifier = normalized.identifier;
    const phone = normalized.phone || null;
    const role = (normalized.role || defaultRole).toUpperCase();

    // 2. Validate mandatory fields
    if (!name || name.length < 2) {
      invalidRows.push({
        rowNumber,
        data: rawRow,
        error: 'Missing or invalid Name (minimum 2 characters required)'
      });
      continue;
    }

    if (!email || !EMAIL_REGEX.test(email)) {
      invalidRows.push({
        rowNumber,
        data: rawRow,
        error: `Invalid email address format: '${email || ''}'`
      });
      continue;
    }

    if (!identifier || identifier.length < 3) {
      invalidRows.push({
        rowNumber,
        data: rawRow,
        error: `Missing or invalid ${role === 'FACULTY' ? 'Employee ID' : 'USN / Enrollment Number'}`
      });
      continue;
    }

    if (!['STUDENT', 'FACULTY', 'INVIGILATOR'].includes(role)) {
      invalidRows.push({
        rowNumber,
        data: rawRow,
        error: `Invalid role '${role}'. Only STUDENT, FACULTY, or INVIGILATOR may be provisioned via bulk roster.`
      });
      continue;
    }

    // 3. In-file duplicate detection
    if (seenEmails.has(email)) {
      invalidRows.push({
        rowNumber,
        data: rawRow,
        error: `Duplicate email '${email}' detected within the spreadsheet`
      });
      continue;
    }

    const idKey = `${role}:${identifier.toLowerCase()}`;
    if (seenIdentifiers.has(idKey)) {
      invalidRows.push({
        rowNumber,
        data: rawRow,
        error: `Duplicate identifier '${identifier}' detected within the spreadsheet for role ${role}`
      });
      continue;
    }

    seenEmails.add(email);
    seenIdentifiers.add(idKey);

    validRows.push({
      rowNumber,
      name,
      email,
      phone,
      identifier,
      role
    });
  }

  return {
    validRows,
    invalidRows,
    totalRows: rawRows.length
  };
}
