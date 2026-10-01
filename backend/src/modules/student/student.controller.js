/**
 * @file student.controller.js
 * @description HTTP controllers for student profile and onboarding.
 */

import * as studentService from './student.service.js';
import { updateStudentProfileSchema, validateDocumentMagicBytes } from './student.schemas.js';
import { BadRequestError } from '../../utils/errors.js';

export async function getProfileHandler(req, res, next) {
  try {
    const profile = await studentService.getProfile(req.user.userId);
    res.status(200).json({
      success: true,
      data: profile
    });
  } catch (err) {
    next(err);
  }
}

export async function updateProfileHandler(req, res, next) {
  try {
    const validated = updateStudentProfileSchema.parse(req.body || {});
    const updated = await studentService.updateProfile(req.user.userId, validated);
    res.status(200).json({
      success: true,
      data: updated
    });
  } catch (err) {
    next(err);
  }
}

export async function requestPhotoUpdateHandler(req, res, next) {
  try {
    let photoUrl = req.body?.photoUrl || req.body?.facePhotoUrl;

    if (req.file) {
      const valid = validateDocumentMagicBytes(req.file.buffer, req.file.mimetype);
      if (!valid) {
        throw new BadRequestError('Invalid photo format. Only authentic JPEG/PNG images are allowed.');
      }
      photoUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    }

    if (!photoUrl || typeof photoUrl !== 'string') {
      throw new BadRequestError('A valid face photo is required for updating verification reference');
    }

    const result = await studentService.requestPhotoUpdate(req.user.userId, photoUrl);
    res.status(200).json({
      success: true,
      data: result
    });
  } catch (err) {
    next(err);
  }
}

export async function getIdentityStatusHandler(req, res, next) {
  try {
    const status = await studentService.getIdentityStatus(req.user.userId);
    res.status(200).json({
      success: true,
      data: status
    });
  } catch (err) {
    next(err);
  }
}

export async function submitOnboardingHandler(req, res, next) {
  try {
    let facePhotoUrl = req.body?.facePhotoUrl || req.body?.face_photo_url;
    let collegeIdUrl = req.body?.collegeIdUrl || req.body?.college_id_url;

    // Handle multipart uploads if provided
    if (req.files?.faceImage?.[0]) {
      const file = req.files.faceImage[0];
      facePhotoUrl = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
    }
    if (req.files?.idDocument?.[0]) {
      const file = req.files.idDocument[0];
      collegeIdUrl = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
    }

    const payload = {
      name: req.body?.name || req.body?.fullName,
      departmentId: req.body?.departmentId || req.body?.department_id,
      semester: req.body?.semester,
      facePhotoUrl,
      collegeIdUrl
    };

    const updated = await studentService.submitOnboarding(req.user.userId, payload);
    res.status(200).json({
      success: true,
      message: 'Onboarding profile submitted successfully. Pending admin approval.',
      data: updated
    });
  } catch (err) {
    next(err);
  }
}

export async function verifyFaceHandler(req, res, next) {
  try {
    const result = await studentService.verifyFace(req.user.userId);
    res.status(200).json({
      success: true,
      data: result
    });
  } catch (err) {
    next(err);
  }
}

export async function getDepartmentsHandler(req, res, next) {
  try {
    const departments = await studentService.getDepartments();
    res.status(200).json({
      success: true,
      data: departments
    });
  } catch (err) {
    next(err);
  }
}
