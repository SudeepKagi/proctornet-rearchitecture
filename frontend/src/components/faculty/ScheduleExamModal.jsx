/**
 * @file ScheduleExamModal.jsx
 * @description Simplified Exam Creator & Scheduler for Faculty.
 * Direct flow: Title, Date, Time, Select Question Pool -> Submit.
 * All students get the exact same questions from the selected pool.
 */

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../ui/dialog.jsx';
import { Button } from '../ui/button.jsx';
import { Input } from '../ui/input.jsx';
import { Alert, AlertDescription } from '../ui/alert.jsx';
import { ACADEMIC_DEPARTMENTS } from '../../constants/departments.js';
import * as facultyApi from '../../api/facultyApi.js';
import {
  Calendar,
  Clock,
  Layers,
  Sparkles,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';

export function ScheduleExamModal({ isOpen, onClose, onSuccess }) {
  const [loadingPools, setLoadingPools] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Available pools
  const [pools, setPools] = useState([]);

  // Form State: Title, Date, Time, Duration, Pool, Audience
  const [title, setTitle] = useState('');
  const [examDate, setExamDate] = useState('');
  const [startTime, setStartTime] = useState('10:00');
  const [durationMinutes, setDurationMinutes] = useState('60');
  const [selectedPoolId, setSelectedPoolId] = useState('');
  const [targetSemester, setTargetSemester] = useState('6');
  const [targetDepartment, setTargetDepartment] = useState(
    'Computer Science and Engineering'
  );

  useEffect(() => {
    if (isOpen) {
      setError('');
      loadQuestionPools();
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      setExamDate(tomorrow.toISOString().split('T')[0]);
    }
  }, [isOpen]);

  async function loadQuestionPools() {
    setLoadingPools(true);
    try {
      const data = await facultyApi.listQuestionPools();
      const poolList = Array.isArray(data) ? data : [];
      setPools(poolList);
      if (poolList.length > 0) {
        setSelectedPoolId(poolList[0].topic_id);
      }
    } catch {
      setError('Failed to load Question Pools. Please check your network connection.');
    } finally {
      setLoadingPools(false);
    }
  }

  async function handleSubmit(e) {
    if (e) e.preventDefault();
    if (!title.trim()) {
      setError('Please provide an exam title.');
      return;
    }
    if (!examDate) {
      setError('Please select an exam date.');
      return;
    }
    if (!startTime) {
      setError('Please select a start time.');
      return;
    }
    if (!selectedPoolId) {
      setError('Please select a question pool for this exam.');
      return;
    }

    setSubmitting(true);
    setError('');

    const startObj = new Date(`${examDate}T${startTime}`);
    if (isNaN(startObj.getTime())) {
      setError('Please provide a valid exam date and start time.');
      setSubmitting(false);
      return;
    }

    const startDateTime = startObj.toISOString();
    const durationNum = Number(durationMinutes) || 60;
    const endDateTime = new Date(startObj.getTime() + durationNum * 60000).toISOString();

    try {
      await facultyApi.scheduleExam({
        title: title.trim(),
        duration_minutes: durationNum,
        target_semester: Number(targetSemester),
        target_department: targetDepartment,
        scheduled_start_time: startDateTime,
        scheduled_end_time: endDateTime,
        pool_id: selectedPoolId,
      });

      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      setError(err?.message || 'Failed to schedule exam. Please check input parameters.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !submitting && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2 text-blue-600 font-semibold text-xs uppercase tracking-wider mb-1">
            <Sparkles size={14} />
            <span>Create & Schedule Exam</span>
          </div>
          <DialogTitle className="text-xl font-bold text-slate-900 dark:text-slate-100">
            New Exam Schedule
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            Set the exam schedule and select a question pool. All candidates will receive the exact same questions.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive" className="py-2 text-xs">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {/* 1. Exam Title */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Exam Title <span className="text-rose-500">*</span>
            </label>
            <Input
              placeholder="e.g. Midterm: Computer Networks & Security"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="h-10 text-sm"
              required
            />
          </div>

          {/* 2. Date & Start Time */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Exam Date <span className="text-rose-500">*</span>
              </label>
              <Input
                type="date"
                min={new Date().toISOString().split('T')[0]}
                value={examDate}
                onChange={(e) => setExamDate(e.target.value)}
                className="h-10 text-xs"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Start Time <span className="text-rose-500">*</span>
              </label>
              <Input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="h-10 text-xs"
                required
              />
            </div>
          </div>

          {/* 3. Duration */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Duration (minutes) <span className="text-rose-500">*</span>
            </label>
            <div className="flex items-center gap-2">
              {['30', '45', '60', '90', '120'].map((mins) => (
                <button
                  key={mins}
                  type="button"
                  onClick={() => setDurationMinutes(mins)}
                  className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors cursor-pointer ${
                    durationMinutes === mins
                      ? 'bg-blue-600 border-blue-600 text-white font-semibold'
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {mins}m
                </button>
              ))}
              <Input
                type="number"
                min="5"
                max="360"
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(e.target.value)}
                className="w-20 h-8 text-xs text-center"
              />
            </div>
          </div>

          {/* 4. Select Question Pool */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Select Question Pool <span className="text-rose-500">*</span>
            </label>
            {loadingPools ? (
              <div className="text-xs text-slate-400 py-3 text-center border border-dashed rounded-lg">
                Loading question pools...
              </div>
            ) : pools.length === 0 ? (
              <div className="text-xs text-amber-600 p-3 bg-amber-50 dark:bg-amber-950/40 rounded-lg border border-amber-200">
                No question pools available. Please create questions first in the Question Bank.
              </div>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {pools.map((p) => {
                  const isSelected = selectedPoolId === p.topic_id;
                  return (
                    <div
                      key={p.topic_id}
                      onClick={() => setSelectedPoolId(p.topic_id)}
                      className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                        isSelected
                          ? 'border-blue-600 bg-blue-50/70 dark:bg-blue-950/40 dark:border-blue-500 shadow-2xs'
                          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                            isSelected
                              ? 'border-blue-600 bg-blue-600 text-white'
                              : 'border-slate-300 dark:border-slate-600'
                          }`}
                        >
                          {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {p.name}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">
                            {p.subject_name || 'Academic Subject'} • {p.total_questions || 0} questions
                          </div>
                        </div>
                      </div>
                      <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800">
                        {p.total_questions || 0} Qs
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 5. Target Audience (Department & Semester) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Department
              </label>
              <select
                value={targetDepartment}
                onChange={(e) => setTargetDepartment(e.target.value)}
                className="w-full h-9 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs px-2.5 text-slate-800 dark:text-slate-200 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
              >
                {ACADEMIC_DEPARTMENTS.map((dept) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Target Semester
              </label>
              <select
                value={targetSemester}
                onChange={(e) => setTargetSemester(e.target.value)}
                className="w-full h-9 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs px-2.5 text-slate-800 dark:text-slate-200 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
              >
                {[1, 2, 3, 4, 5, 6, 7, 8].map((sem) => (
                  <option key={sem} value={sem}>
                    Semester {sem}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <DialogFooter className="pt-3 gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={submitting}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting || loadingPools || pools.length === 0}
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold"
            >
              {submitting ? 'Scheduling Exam...' : 'Schedule Exam'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default ScheduleExamModal;
