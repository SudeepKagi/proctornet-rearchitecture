/**
 * @file studentDocumentInvariants.test.js
 * @description Level 1 unit tests for student identity document states and transition invariants.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DocumentType,
  DocumentVerificationStatus
} from '../../../src/domain/student/studentDocumentStates.js';
import {
  assertValidDocumentType,
  assertValidDocumentTransition,
  assertMandatoryRejectionNotes,
  assertValidDocumentMimeType,
  assertValidDocumentSize
} from '../../../src/domain/student/studentDocumentInvariants.js';

describe('Student Document Invariants (Level 1)', () => {
  describe('Document Types', () => {
    it('accepts all authoritative document types', () => {
      assert.doesNotThrow(() => assertValidDocumentType(DocumentType.PASSPORT));
      assert.doesNotThrow(() => assertValidDocumentType(DocumentType.NATIONAL_ID));
      assert.doesNotThrow(() => assertValidDocumentType(DocumentType.DRIVING_LICENSE));
      assert.doesNotThrow(() => assertValidDocumentType(DocumentType.STUDENT_ID));
    });

    it('rejects unsupported or arbitrary document types', () => {
      assert.throws(() => assertValidDocumentType('VOTER_CARD'), /Invalid document type/);
      assert.throws(() => assertValidDocumentType('RANDOM'), /Invalid document type/);
    });
  });

  describe('Document State Transitions', () => {
    it('allows legal forward transitions', () => {
      assert.doesNotThrow(() =>
        assertValidDocumentTransition(
          DocumentVerificationStatus.PENDING_UPLOAD,
          DocumentVerificationStatus.PENDING
        )
      );

      assert.doesNotThrow(() =>
        assertValidDocumentTransition(
          DocumentVerificationStatus.PENDING,
          DocumentVerificationStatus.APPROVED
        )
      );

      assert.doesNotThrow(() =>
        assertValidDocumentTransition(
          DocumentVerificationStatus.PENDING,
          DocumentVerificationStatus.REJECTED
        )
      );

      assert.doesNotThrow(() =>
        assertValidDocumentTransition(
          DocumentVerificationStatus.REJECTED,
          DocumentVerificationStatus.SUPERSEDED
        )
      );
    });

    it('forbids illegal state transitions', () => {
      // APPROVED cannot transition to REJECTED or PENDING
      assert.throws(
        () =>
          assertValidDocumentTransition(
            DocumentVerificationStatus.APPROVED,
            DocumentVerificationStatus.REJECTED
          ),
        /Illegal document status transition/
      );

      assert.throws(
        () =>
          assertValidDocumentTransition(
            DocumentVerificationStatus.APPROVED,
            DocumentVerificationStatus.PENDING
          ),
        /Illegal document status transition/
      );

      // SUPERSEDED cannot transition to APPROVED
      assert.throws(
        () =>
          assertValidDocumentTransition(
            DocumentVerificationStatus.SUPERSEDED,
            DocumentVerificationStatus.APPROVED
          ),
        /Illegal document status transition/
      );
    });
  });

  describe('Mandatory Rejection Notes', () => {
    it('requires notes when decision is REJECTED', () => {
      assert.throws(
        () => assertMandatoryRejectionNotes('REJECTED', ''),
        /Rejection reason is mandatory/
      );
      assert.throws(
        () => assertMandatoryRejectionNotes('REJECTED', '   '),
        /Rejection reason is mandatory/
      );
      assert.throws(
        () => assertMandatoryRejectionNotes('REJECTED', null),
        /Rejection reason is mandatory/
      );
      assert.doesNotThrow(() =>
        assertMandatoryRejectionNotes('REJECTED', 'Document illegible; blur detected')
      );
    });

    it('does not require notes when decision is APPROVED', () => {
      assert.doesNotThrow(() => assertMandatoryRejectionNotes('APPROVED'));
      assert.doesNotThrow(() => assertMandatoryRejectionNotes('APPROVED', null));
    });
  });

  describe('MIME Types and Size Limits', () => {
    it('validates allowed MIME types', () => {
      assert.doesNotThrow(() => assertValidDocumentMimeType('image/jpeg'));
      assert.doesNotThrow(() => assertValidDocumentMimeType('image/png'));
      assert.doesNotThrow(() => assertValidDocumentMimeType('application/pdf'));

      assert.throws(() => assertValidDocumentMimeType('image/gif'), /Unsupported MIME type/);
      assert.throws(() => assertValidDocumentMimeType('application/zip'), /Unsupported MIME type/);
      assert.throws(() => assertValidDocumentMimeType('text/plain'), /Unsupported MIME type/);
    });

    it('enforces maximum 10MB size limit', () => {
      assert.doesNotThrow(() => assertValidDocumentSize(1024));
      assert.doesNotThrow(() => assertValidDocumentSize(10 * 1024 * 1024));

      assert.throws(() => assertValidDocumentSize(0), /File size must be between/);
      assert.throws(() => assertValidDocumentSize(-1), /File size must be between/);
      assert.throws(() => assertValidDocumentSize(10 * 1024 * 1024 + 1), /File size must be between/);
    });
  });
});
