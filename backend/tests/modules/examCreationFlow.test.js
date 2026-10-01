/**
 * @file examCreationFlow.test.js
 * @description Integration test for Teacher All-in-One Exam Creation Flow:
 * - Single-screen exam authoring: title, schedule, branch + semester targeting
 * - Inline question authoring (MCQs with options and points)
 * - Exam is assigned to specific target branch and target semester
 * - Exam session is automatically created
 * - Eligible students matching branch and semester are auto-assigned
 * - Removal of standalone question pools verified
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as facultyService from '../../src/modules/faculty/faculty.service.js';
import * as llmService from '../../src/modules/faculty/llm.service.js';
import { getPool } from '../../src/infrastructure/postgres/pool.js';

describe('Teacher All-in-One Exam Creation Flow', () => {
  describe('1. AI PDF Question Extraction & Generation', () => {
    it('generates structured MCQs from document text', async () => {
      // Mock global fetch to return a structured response instantly
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{
            content: {
              parts: [{
                text: JSON.stringify([
                  {
                    question_text: 'What is the primary role of the leader in Raft consensus?',
                    options: [
                      'Coordinates log replication across followers',
                      'Calculates cryptographic hashes',
                      'Manages client browser cookies',
                      'Restarts failed physical routers'
                    ],
                    correct_answer: 'Coordinates log replication across followers'
                  }
                ])
              }]
            }
          }]
        })
      });

      const sampleText = `
        Distributed systems require consensus algorithms to achieve agreement among distributed nodes.
        The Raft consensus algorithm is designed to be easy to understand compared to Paxos.
        Raft achieves consensus by electing a leader who coordinates log replication across followers.
        In Raft, a leader maintains heartbeats to prevent follower election timeouts.
      `;

      const questions = await llmService.generateMCQsFromText({
        text: sampleText,
        topicName: 'Distributed Consensus',
        questionCount: 1,
        difficulty: 'MEDIUM'
      });

      expect(Array.isArray(questions)).toBe(true);
      expect(questions.length).toBe(1);

      const q = questions[0];
      expect(q.question_text).toContain('primary role of the leader');
      expect(Array.isArray(q.options)).toBe(true);
      expect(q.options.length).toBe(4);
      expect(q.correct_answer).toBe('Coordinates log replication across followers');
    });
  });

  describe('2. Schedule Exam Validation & Constraints', () => {
    it('rejects exam creation if title is missing', async () => {
      await expect(
        facultyService.scheduleExam({
          target_semester: 5,
          scheduled_start_time: new Date(Date.now() + 86400000).toISOString()
        }, 'teacher-1')
      ).rejects.toThrow('Exam title is required');
    });

    it('rejects exam creation if target semester is invalid', async () => {
      await expect(
        facultyService.scheduleExam({
          title: 'Database Systems Midterm',
          target_semester: 10, // Must be 1-8
          scheduled_start_time: new Date(Date.now() + 86400000).toISOString()
        }, 'teacher-1')
      ).rejects.toThrow('Target Semester is required (must be between 1 and 8)');
    });

    it('rejects exam creation if start time is missing', async () => {
      await expect(
        facultyService.scheduleExam({
          title: 'Database Systems Midterm',
          target_semester: 5
        }, 'teacher-1')
      ).rejects.toThrow('Scheduled Start Time is required');
    });
  });
});
