/**
 * @file candidateIdentity.service.js
 * @description Core business logic for Candidate Government-ID Document Onboarding,
 * Private S3 Presigned Upload/Download lifecycle, file validation, and state synchronization.
 * Conforms to Step 13.5, Step 13.7, and Phase 24 specifications.
 */

import crypto from 'node:crypto';
import { getPool } from '../../infrastructure/postgres/pool.js';
import { config } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import * as candidateIdentityRepo from './candidateIdentity.repository.js';
import * as studentConfigRepo from './studentConfig.repository.js';
import {
  generatePresignedUploadUrl,
  generatePresignedDownloadUrl,
  headEvidenceObject,
  deleteEvidenceObjectVersions,
  getEvidenceObjectHeader
} from '../../infrastructure/storage/s3Storage.js';
import {
  hashDocumentNumber,
  maskDocumentNumber,
  validateDocumentMagicBytes
} from './candidateIdentity.schemas.js';
import {
  assertValidDocumentType,
  assertValidDocumentMimeType,
  assertValidDocumentSize,
  assertValidDocumentTransition,
  assertMandatoryRejectionNotes,
  MAX_DOCUMENT_BYTE_SIZE
} from '../../domain/student/studentDocumentInvariants.js';
import {
  DocumentVerificationStatus
} from '../../domain/student/studentDocumentStates.js';
import { recordAuditEvent } from '../audit/audit.service.js';
import {
  NotFoundError,
  ForbiddenError,
  ConflictError,
  BadRequestError
} from '../../utils/errors.js';

/**
 * Maps MIME type to safe file extension.
 * @param {string} mimeType
 * @returns {string}
 */
function getExtensionForMime(mimeType) {
  switch (mimeType) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'application/pdf':
      return 'pdf';
    default:
      return 'bin';
  }
}

/**
 * Initiates an identity document upload by inserting a PENDING_UPLOAD record
 * and minting an AWS SigV4 presigned PUT URL with 300s TTL.
 *
 * @param {object} params
 * @param {string} params.userId
 * @param {string} params.documentType
 * @param {string} params.documentNumber
 * @param {string} params.fullNameOnDocument
 * @param {string} [params.dateOfBirth]
 * @param {string} [params.expiryDate]
 * @param {string} [params.issueCountry]
 * @param {string} params.fileName
 * @param {string} params.mimeType
 * @param {number} params.byteSize
 * @returns {Promise<{documentId: string, uploadUrl: string, expiresInSeconds: number}>}
 */
export async function requestDocumentUploadUrl({
  userId,
  documentType,
  documentNumber,
  fullNameOnDocument,
  dateOfBirth,
  expiryDate,
  issueCountry,
  fileName,
  mimeType,
  byteSize
}) {
  assertValidDocumentType(documentType);
  assertValidDocumentMimeType(mimeType);
  assertValidDocumentSize(byteSize);

  // Check existing active document
  const activeDoc = await candidateIdentityRepo.findActiveDocumentByUserId(userId);
  if (activeDoc) {
    if (activeDoc.verification_status === DocumentVerificationStatus.APPROVED) {
      throw new ConflictError(
        'Candidate already has an approved identity document. Resubmission is not permitted.',
        'DOCUMENT_ALREADY_APPROVED'
      );
    }
    if (activeDoc.verification_status === DocumentVerificationStatus.PENDING) {
      throw new ConflictError(
        'Candidate already has an identity document pending administrative review.',
        'DOCUMENT_PENDING_REVIEW'
      );
    }
  }

  // Supersede any unconfirmed PENDING_UPLOAD records for this student
  await candidateIdentityRepo.supersedePendingUploads(userId);

  const documentId = crypto.randomUUID();
  const randomHex = crypto.randomBytes(16).toString('hex');
  const ext = getExtensionForMime(mimeType);

  // Authoritative Opaque Key (no studentId to prevent metadata disclosure in S3 logs)
  const s3Key = `identity-documents/${documentId}/${randomHex}.${ext}`;
  const s3Bucket = config.S3_BUCKET_NAME;

  // Mask and hash document number (plaintext is NEVER persisted)
  const documentNumberHash = hashDocumentNumber(documentNumber);
  const documentNumberLast4 = maskDocumentNumber(documentNumber);

  await candidateIdentityRepo.createDocumentRecord({
    documentId,
    userId,
    documentType,
    documentNumberHash,
    documentNumberLast4,
    fullNameOnDocument,
    dateOfBirth,
    expiryDate,
    issueCountry,
    s3Bucket,
    s3Key,
    fileName,
    mimeType,
    byteSize,
    magicBytesVerified: false
  });

  const uploadUrl = await generatePresignedUploadUrl({
    bucket: s3Bucket,
    key: s3Key,
    contentType: mimeType,
    byteSize,
    expiresInSeconds: 300
  });

  return {
    documentId,
    uploadUrl,
    expiresInSeconds: 300
  };
}

/**
 * Confirms binary upload directly from S3, checks HeadObject and magic bytes,
 * and atomically transitions document and user verification status to PENDING.
 *
 * @param {object} params
 * @param {string} params.documentId
 * @param {object} params.user
 * @returns {Promise<{message: string, verificationStatus: string}>}
 */
export async function confirmDocumentUpload({ documentId, user }) {
  const doc = await candidateIdentityRepo.findDocumentById(documentId);
  if (!doc) {
    throw new NotFoundError(`Identity document '${documentId}' not found`);
  }

  // IDOR check: Student can confirm only their own document
  if (doc.user_id !== user.userId) {
    throw new ForbiddenError('Forbidden: You can only confirm your own identity document');
  }

  // Idempotency: If already PENDING, return 200 OK
  if (doc.verification_status === DocumentVerificationStatus.PENDING) {
    return {
      message: 'Document confirmed and submitted for verification',
      verificationStatus: DocumentVerificationStatus.PENDING
    };
  }

  if (doc.verification_status !== DocumentVerificationStatus.PENDING_UPLOAD) {
    throw new ConflictError(
      `Document cannot be confirmed from status '${doc.verification_status}'`,
      'INVALID_DOCUMENT_STATUS'
    );
  }

  // 1. Authoritative S3 HeadObject Verification
  let headResult;
  try {
    headResult = await headEvidenceObject({ bucket: doc.s3_bucket, key: doc.s3_key });
  } catch (err) {
    logger.warn({ err, documentId, key: doc.s3_key }, 'S3 HeadObject failed during document confirmation');
    throw new BadRequestError(
      'Upload verification failed: Document binary was not found in private storage. Please re-upload.',
      'FILE_NOT_FOUND_IN_STORAGE'
    );
  }

  const actualSize = headResult.contentLength;
  if (!actualSize || actualSize === 0 || actualSize > MAX_DOCUMENT_BYTE_SIZE) {
    // Synchronous immediate deletion of invalid object
    await deleteEvidenceObjectVersions({ bucket: doc.s3_bucket, key: doc.s3_key }).catch(() => {});
    await candidateIdentityRepo.updateDocumentStatus(documentId, {
      verificationStatus: DocumentVerificationStatus.REJECTED,
      reviewerNotes: 'Failed upload: empty or oversized file'
    });
    throw new BadRequestError(
      `Upload verification failed: file size (${actualSize} bytes) is empty or exceeds 10 MB limit`,
      'INVALID_FILE_SIZE'
    );
  }

  // 2. Authoritative Magic Bytes Signature Verification (First 16 Bytes via Range request)
  let headerBytes;
  try {
    headerBytes = await getEvidenceObjectHeader({
      bucket: doc.s3_bucket,
      key: doc.s3_key,
      byteCount: 16
    });
  } catch (err) {
    logger.warn({ err, documentId }, 'Failed to retrieve object header for magic bytes verification');
    throw new BadRequestError('Failed to verify document binary header', 'HEADER_READ_FAILED');
  }

  const magicBytesValid = validateDocumentMagicBytes(headerBytes, doc.mime_type);
  if (!magicBytesValid) {
    // Immediate synchronous deletion on signature mismatch
    await deleteEvidenceObjectVersions({ bucket: doc.s3_bucket, key: doc.s3_key }).catch(() => {});
    await candidateIdentityRepo.updateDocumentStatus(documentId, {
      verificationStatus: DocumentVerificationStatus.REJECTED,
      reviewerNotes: 'File signature (magic bytes) does not match declared MIME type'
    });
    throw new BadRequestError(
      `File signature (magic bytes) does not match declared MIME type '${doc.mime_type}'`,
      'INVALID_FILE_SIGNATURE'
    );
  }

  // 3. Atomic Database Synchronization
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // If candidate was previously REJECTED, supersede the previous rejected document
    const activeDocs = await candidateIdentityRepo.findDocumentsByUserId(user.userId, client);
    for (const priorDoc of activeDocs) {
      if (
        priorDoc.document_id !== documentId &&
        priorDoc.verification_status === DocumentVerificationStatus.REJECTED
      ) {
        await candidateIdentityRepo.supersedeDocument(priorDoc.document_id, client);
        await recordAuditEvent(
          {
            actorUserId: user.userId,
            action: 'STUDENT_IDENTITY_DOCUMENT_SUPERSEDED',
            resourceType: 'IDENTITY_DOCUMENT',
            resourceId: priorDoc.document_id,
            metadata: { supersededByDocumentId: documentId }
          },
          client
        ).catch(() => {});
      }
    }

    // Transition document to PENDING
    assertValidDocumentTransition(doc.verification_status, DocumentVerificationStatus.PENDING);
    await candidateIdentityRepo.updateDocumentStatus(
      documentId,
      {
        verificationStatus: DocumentVerificationStatus.PENDING,
        magicBytesVerified: true,
        submittedAt: new Date().toISOString()
      },
      client
    );

    // Synchronize users.verification_status to PENDING
    await candidateIdentityRepo.updateUserVerificationStatus(
      user.userId,
      'PENDING',
      null,
      client
    );

    await recordAuditEvent(
      {
        actorUserId: user.userId,
        action: 'STUDENT_IDENTITY_DOCUMENT_SUBMITTED',
        resourceType: 'IDENTITY_DOCUMENT',
        resourceId: documentId,
        metadata: {
          documentType: doc.document_type,
          mimeType: doc.mime_type,
          byteSize: actualSize
        }
      },
      client
    ).catch(() => {});

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  return {
    message: 'Document confirmed and submitted for verification',
    verificationStatus: DocumentVerificationStatus.PENDING
  };
}

/**
 * Returns the candidate's onboarding and document verification status.
 * @param {string} userId
 * @returns {Promise<object>}
 */
export async function getCandidateIdentityStatus(userId) {
  const activeDoc = await candidateIdentityRepo.findActiveDocumentByUserId(userId);
  const profile = await candidateIdentityRepo.findStudentProfile(userId);

  return {
    hasSubmittedDocument: Boolean(activeDoc),
    document: activeDoc
      ? {
          documentId: activeDoc.document_id,
          documentType: activeDoc.document_type,
          documentNumberLast4: activeDoc.document_number_last4,
          fullNameOnDocument: activeDoc.full_name_on_document,
          verificationStatus: activeDoc.verification_status,
          submittedAt: activeDoc.submitted_at,
          reviewerNotes: activeDoc.reviewer_notes
        }
      : null,
    overallVerificationStatus: profile?.verification_status || 'UNVERIFIED'
  };
}

/**
 * Returns candidate academic profile along with approved exam accommodations.
 * @param {string} userId
 * @returns {Promise<object>}
 */
export async function getCandidateProfile(userId) {
  const profile = await candidateIdentityRepo.findStudentProfile(userId);
  if (!profile) {
    throw new NotFoundError(`Student profile for user '${userId}' not found`);
  }

  const config = await studentConfigRepo.findConfigurationByStudentId(userId);

  return {
    userId: profile.user_id,
    name: profile.name,
    email: profile.email,
    phone: profile.phone,
    enrollmentNumber: profile.enrollment_number,
    department: profile.department,
    semester: profile.semester,
    verificationStatus: profile.verification_status,
    verificationNotes: profile.verification_notes,
    accommodations: config
      ? {
          extraTimeMultiplier: Number(config.extra_time_multiplier),
          breakAllowanceMinutes: config.break_allowance_minutes,
          maxBreaksAllowed: config.max_breaks_allowed,
          assistiveTechnology: config.assistive_technology,
          proctoringStrictness: config.proctoring_strictness
        }
      : {
          extraTimeMultiplier: 1.00,
          breakAllowanceMinutes: 0,
          maxBreaksAllowed: 0,
          assistiveTechnology: { screenReader: false, speechToText: false, keyboardOnly: false },
          proctoringStrictness: 'STANDARD'
        }
  };
}

/**
 * Updates editable candidate profile fields (department, semester, phone).
 * Students cannot modify accommodations or verification status.
 *
 * @param {string} userId
 * @param {object} updates
 * @returns {Promise<object>}
 */
export async function updateCandidateProfile(userId, updates) {
  return await candidateIdentityRepo.updateStudentProfile(userId, updates);
}

/**
 * Administrative: Returns full verification dossier for a student.
 * @param {string} targetUserId
 * @returns {Promise<object>}
 */
export async function getStudentVerificationDossier(targetUserId) {
  const profile = await candidateIdentityRepo.findStudentProfile(targetUserId);
  if (!profile) {
    throw new NotFoundError(`User '${targetUserId}' not found`);
  }

  const activeDoc = await candidateIdentityRepo.findActiveDocumentByUserId(targetUserId);
  const documentHistory = await candidateIdentityRepo.findDocumentsByUserId(targetUserId);
  const config = await studentConfigRepo.findConfigurationByStudentId(targetUserId);

  return {
    user: {
      userId: profile.user_id,
      name: profile.name,
      email: profile.email,
      phone: profile.phone,
      enrollmentNumber: profile.enrollment_number,
      department: profile.department,
      semester: profile.semester,
      accountStatus: profile.status,
      verificationStatus: profile.verification_status,
      verificationNotes: profile.verification_notes
    },
    activeDocument: activeDoc
      ? {
          documentId: activeDoc.document_id,
          documentType: activeDoc.document_type,
          documentNumberLast4: activeDoc.document_number_last4,
          fullNameOnDocument: activeDoc.full_name_on_document,
          dateOfBirth: activeDoc.date_of_birth,
          expiryDate: activeDoc.expiry_date,
          issueCountry: activeDoc.issue_country,
          fileName: activeDoc.file_name,
          mimeType: activeDoc.mime_type,
          byteSize: activeDoc.byte_size,
          magicBytesVerified: activeDoc.magic_bytes_verified,
          verificationStatus: activeDoc.verification_status,
          reviewerNotes: activeDoc.reviewer_notes,
          submittedAt: activeDoc.submitted_at,
          reviewedAt: activeDoc.reviewed_at
        }
      : null,
    documentHistory: documentHistory.map((d) => ({
      documentId: d.document_id,
      documentType: d.document_type,
      documentNumberLast4: d.document_number_last4,
      fileName: d.file_name,
      mimeType: d.mime_type,
      verificationStatus: d.verification_status,
      reviewerNotes: d.reviewer_notes,
      submittedAt: d.submitted_at,
      reviewedAt: d.reviewed_at
    })),
    accommodations: config
      ? {
          extraTimeMultiplier: Number(config.extra_time_multiplier),
          breakAllowanceMinutes: config.break_allowance_minutes,
          maxBreaksAllowed: config.max_breaks_allowed,
          assistiveTechnology: config.assistive_technology,
          proctoringStrictness: config.proctoring_strictness
        }
      : null
  };
}

/**
 * Administrative: Generates a short-lived (300s TTL) presigned GET URL for private document preview.
 * Strictly audited.
 *
 * @param {string} targetUserId
 * @param {string} actorUserId
 * @returns {Promise<{previewUrl: string, mimeType: string, fileName: string, expiresInSeconds: number}>}
 */
export async function getDocumentPreviewUrl(targetUserId, actorUserId) {
  const activeDoc = await candidateIdentityRepo.findActiveDocumentByUserId(targetUserId);
  if (!activeDoc) {
    throw new NotFoundError(`No active identity document found for student '${targetUserId}'`);
  }

  const previewUrl = await generatePresignedDownloadUrl({
    bucket: activeDoc.s3_bucket,
    key: activeDoc.s3_key,
    contentType: activeDoc.mime_type,
    expiresInSeconds: 300
  });

  await recordAuditEvent({
    actorUserId,
    action: 'ADMIN_IDENTITY_DOCUMENT_PREVIEWED',
    resourceType: 'IDENTITY_DOCUMENT',
    resourceId: activeDoc.document_id,
    metadata: {
      targetUserId,
      documentType: activeDoc.document_type,
      mimeType: activeDoc.mime_type
    }
  }).catch(() => {});

  return {
    previewUrl,
    mimeType: activeDoc.mime_type,
    fileName: activeDoc.file_name,
    expiresInSeconds: 300
  };
}

/**
 * Administrative: Approves or Rejects a student's identity document and verification status.
 * Mandatory rejection notes enforced.
 *
 * @param {object} params
 * @param {string} params.targetUserId
 * @param {'APPROVED' | 'REJECTED'} params.decision
 * @param {string} [params.reviewNotes]
 * @param {string} params.actorUserId
 * @returns {Promise<object>}
 */
export async function reviewStudentVerification({
  targetUserId,
  decision,
  reviewNotes,
  actorUserId
}) {
  if (decision !== 'APPROVED' && decision !== 'REJECTED') {
    throw new BadRequestError("Decision must be 'APPROVED' or 'REJECTED'", 'INVALID_DECISION');
  }

  assertMandatoryRejectionNotes(decision, reviewNotes);

  const activeDoc = await candidateIdentityRepo.findActiveDocumentByUserId(targetUserId);
  if (!activeDoc) {
    throw new NotFoundError(`No active identity document found for user '${targetUserId}'`);
  }

  const targetDocStatus =
    decision === 'APPROVED'
      ? DocumentVerificationStatus.APPROVED
      : DocumentVerificationStatus.REJECTED;

  const targetUserStatus = decision === 'APPROVED' ? 'VERIFIED' : 'REJECTED';

  assertValidDocumentTransition(activeDoc.verification_status, targetDocStatus);

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const updatedDoc = await candidateIdentityRepo.updateDocumentStatus(
      activeDoc.document_id,
      {
        verificationStatus: targetDocStatus,
        reviewerNotes: reviewNotes || null,
        reviewedBy: actorUserId,
        reviewedAt: new Date().toISOString()
      },
      client
    );

    const updatedUser = await candidateIdentityRepo.updateUserVerificationStatus(
      targetUserId,
      targetUserStatus,
      reviewNotes || null,
      client
    );

    await recordAuditEvent(
      {
        actorUserId,
        action: `ADMIN_VERIFICATION_${decision}`,
        resourceType: 'IDENTITY_DOCUMENT',
        resourceId: activeDoc.document_id,
        metadata: {
          targetUserId,
          decision,
          reviewNotes: reviewNotes || null,
          beforeDocumentStatus: activeDoc.verification_status,
          afterDocumentStatus: targetDocStatus,
          beforeUserVerificationStatus: updatedUser.verification_status,
          afterUserVerificationStatus: targetUserStatus
        }
      },
      client
    ).catch(() => {});

    await client.query('COMMIT');

    return {
      userId: targetUserId,
      documentId: updatedDoc.document_id,
      verificationStatus: updatedUser.verification_status,
      documentStatus: updatedDoc.verification_status,
      reviewerNotes: updatedDoc.reviewer_notes,
      reviewedAt: updatedDoc.reviewed_at
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
