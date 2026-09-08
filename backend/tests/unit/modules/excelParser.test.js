/**
 * @file excelParser.test.js
 * @description Level 1 unit tests for Excel and CSV spreadsheet ingestion.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import {
  parseUserRoster,
  normalizeHeader
} from '../../../src/modules/users/excelParser.service.js';

describe('Users Module — Excel & CSV Ingestion (Level 1 Unit Tests)', () => {
  describe('Header Normalization', () => {
    it('normalizes common USN/Enrollment header variants', () => {
      assert.equal(normalizeHeader('USN'), 'identifier');
      assert.equal(normalizeHeader('usn'), 'identifier');
      assert.equal(normalizeHeader('Enrollment Number'), 'identifier');
      assert.equal(normalizeHeader('enrollment_number'), 'identifier');
      assert.equal(normalizeHeader('Registration Number'), 'identifier');
    });

    it('normalizes common Employee ID header variants', () => {
      assert.equal(normalizeHeader('Employee ID'), 'identifier');
      assert.equal(normalizeHeader('employee_id'), 'identifier');
      assert.equal(normalizeHeader('Faculty ID'), 'identifier');
      assert.equal(normalizeHeader('Staff ID'), 'identifier');
    });

    it('normalizes Name and Email headers', () => {
      assert.equal(normalizeHeader('Name'), 'name');
      assert.equal(normalizeHeader('Full Name'), 'name');
      assert.equal(normalizeHeader('Email'), 'email');
      assert.equal(normalizeHeader('Institutional Email'), 'email');
      assert.equal(normalizeHeader('Phone Number'), 'phone');
    });

    it('flags forbidden password header', () => {
      assert.equal(normalizeHeader('Password'), 'password_forbidden');
      assert.equal(normalizeHeader('password'), 'password_forbidden');
    });
  });

  describe('CSV Buffer Parsing', () => {
    it('successfully parses valid student CSV rows', () => {
      const csvContent = `USN,Name,Email,Phone\n1MS21CS001,Alice Smith,alice@university.edu,+1234567890\n1MS21CS002,Bob Jones,bob@university.edu,+1987654321`;
      const buffer = Buffer.from(csvContent, 'utf-8');

      const result = parseUserRoster(buffer, { defaultRole: 'STUDENT' });
      assert.equal(result.totalRows, 2);
      assert.equal(result.validRows.length, 2);
      assert.equal(result.invalidRows.length, 0);

      assert.equal(result.validRows[0].identifier, '1MS21CS001');
      assert.equal(result.validRows[0].name, 'Alice Smith');
      assert.equal(result.validRows[0].email, 'alice@university.edu');
      assert.equal(result.validRows[0].role, 'STUDENT');
    });

    it('captures row-level errors for invalid rows', () => {
      const csvContent = `USN,Name,Email\n1MS21CS001,,alice@university.edu\n1MS21CS002,Bob Jones,bad-email\n,Charlie Brown,charlie@university.edu`;
      const buffer = Buffer.from(csvContent, 'utf-8');

      const result = parseUserRoster(buffer, { defaultRole: 'STUDENT' });
      assert.equal(result.totalRows, 3);
      assert.equal(result.validRows.length, 0);
      assert.equal(result.invalidRows.length, 3);

      assert.match(result.invalidRows[0].error, /Name/);
      assert.match(result.invalidRows[1].error, /email address format/);
      assert.match(result.invalidRows[2].error, /USN/);
    });

    it('detects in-file duplicate emails and identifiers', () => {
      const csvContent = `USN,Name,Email\n1MS21CS001,Alice Smith,alice@university.edu\n1MS21CS002,Alice Clone,alice@university.edu\n1MS21CS001,Bob Jones,bob@university.edu`;
      const buffer = Buffer.from(csvContent, 'utf-8');

      const result = parseUserRoster(buffer, { defaultRole: 'STUDENT' });
      assert.equal(result.validRows.length, 1);
      assert.equal(result.invalidRows.length, 2);

      assert.match(result.invalidRows[0].error, /Duplicate email/);
      assert.match(result.invalidRows[1].error, /Duplicate identifier/);
    });

    it('rejects spreadsheet with forbidden password column', () => {
      const csvContent = `USN,Name,Email,Password\n1MS21CS001,Alice Smith,alice@university.edu,secret123`;
      const buffer = Buffer.from(csvContent, 'utf-8');

      const result = parseUserRoster(buffer, { defaultRole: 'STUDENT' });
      assert.equal(result.validRows.length, 0);
      assert.equal(result.invalidRows.length, 1);
      assert.match(result.invalidRows[0].error, /forbidden password column/);
    });
  });

  describe('Excel (.xlsx) Binary Buffer Parsing', () => {
    it('successfully parses valid Excel workbook', () => {
      const data = [
        { 'Employee ID': 'FAC-101', 'Name': 'Dr. Alan Turing', 'Email': 'alan@university.edu' },
        { 'Employee ID': 'FAC-102', 'Name': 'Dr. Ada Lovelace', 'Email': 'ada@university.edu' }
      ];
      const worksheet = XLSX.utils.json_to_sheet(data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Faculty');
      const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

      const result = parseUserRoster(excelBuffer, { defaultRole: 'FACULTY' });
      assert.equal(result.totalRows, 2);
      assert.equal(result.validRows.length, 2);
      assert.equal(result.validRows[0].identifier, 'FAC-101');
      assert.equal(result.validRows[0].name, 'Dr. Alan Turing');
      assert.equal(result.validRows[0].role, 'FACULTY');
    });
  });
});
