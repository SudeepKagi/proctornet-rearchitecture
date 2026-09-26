/**
 * @file QuestionRenderer.jsx
 * @description Accessible question renderer supporting MCQ, True/False, Numeric, Short Answer, Essay, and Code.
 * Redesigned with Tailwind CSS and shadcn tokens.
 */

import React from 'react';
import { Input } from '../ui/input.jsx';
import { Textarea } from '../ui/textarea.jsx';
import { Badge } from '../ui/badge.jsx';
import { cn } from '../../utils/cn.js';

export function QuestionRenderer({
  question,
  questionNumber,
  value,
  onChange,
  disabled = false,
}) {
  if (!question) return null;

  const questionType = question.question_type || question.type || 'MCQ';
  const promptText = question.prompt || question.prompt_text || '';
  const options = question.options || [];
  const points = question.points !== undefined ? question.points : (question.default_points !== undefined ? question.default_points : 1);
  const qId = question.id || question.attempt_question_id || question.question_id || String(questionNumber);

  const currentOptionId = value?.selected_option_id || null;
  const currentNumericValue = value?.numeric_value !== undefined ? value.numeric_value : '';

  function handleOptionSelect(optionId) {
    if (disabled) return;
    onChange({
      selected_option_id: optionId,
    });
  }

  function handleNumericChange(e) {
    if (disabled) return;
    const val = e.target.value;
    onChange({
      numeric_value: val === '' ? null : Number(val),
    });
  }

  return (
    <fieldset className="border-0 p-0 m-0 w-full">
      <legend className="block w-full mb-6 text-left">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
            Question {questionNumber}
          </span>
          <Badge variant="secondary" className="text-xs font-medium">
            {points} {points === 1 ? 'mark' : 'marks'}
          </Badge>
        </div>

        <div className="text-base sm:text-lg font-medium text-slate-900 dark:text-slate-100 leading-relaxed">
          {promptText}
        </div>
      </legend>

      {/* Multiple Choice Options (MCQ) */}
      {questionType === 'MCQ' && (
        <div className="space-y-3" role="radiogroup" aria-label={`Options for question ${questionNumber}`}>
          {options.map((opt, idx) => {
            const optId = opt.id || opt.option_id || String(idx);
            const optText = opt.text || opt.option_text || '';
            const isSelected = currentOptionId === optId;
            const letter = String.fromCharCode(65 + idx);

            return (
              <label
                key={optId}
                className={cn(
                  'flex items-center gap-3.5 p-4 rounded-xl border-2 transition-all select-none',
                  disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer',
                  isSelected
                    ? 'border-blue-600 bg-blue-50/60 dark:bg-blue-950/40 dark:border-blue-500 shadow-2xs'
                    : 'border-slate-200 bg-white hover:bg-slate-50/80 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800/60'
                )}
              >
                <input
                  type="radio"
                  name={`question-${qId}`}
                  value={optId}
                  checked={isSelected}
                  disabled={disabled}
                  onChange={() => handleOptionSelect(optId)}
                  className="sr-only"
                />
                <span
                  className={cn(
                    'h-7 w-7 rounded-lg text-xs font-bold flex items-center justify-center shrink-0 transition-colors',
                    isSelected
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                  )}
                >
                  {letter}
                </span>
                <span
                  className={cn(
                    'text-sm sm:text-base leading-snug',
                    isSelected
                      ? 'font-semibold text-blue-950 dark:text-blue-100'
                      : 'text-slate-800 dark:text-slate-200'
                  )}
                >
                  {optText}
                </span>
              </label>
            );
          })}
        </div>
      )}

      {/* True / False Options */}
      {questionType === 'TRUE_FALSE' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {(options.length > 0 ? options : [{ id: 'true', text: 'True' }, { id: 'false', text: 'False' }]).map((opt, idx) => {
            const optId = opt.id || opt.option_id || String(idx);
            const optText = opt.text || opt.option_text || '';
            const isSelected = currentOptionId === optId;
            return (
              <label
                key={optId}
                className={cn(
                  'flex items-center justify-center p-6 rounded-xl border-2 text-base font-semibold transition-all select-none',
                  disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer',
                  isSelected
                    ? 'border-blue-600 bg-blue-50/60 dark:bg-blue-950/40 dark:border-blue-500 text-blue-700 dark:text-blue-300 shadow-2xs'
                    : 'border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 text-slate-800 dark:text-slate-200'
                )}
              >
                <input
                  type="radio"
                  name={`question-${qId}`}
                  value={optId}
                  checked={isSelected}
                  disabled={disabled}
                  onChange={() => handleOptionSelect(optId)}
                  className="sr-only"
                />
                <span>{optText}</span>
              </label>
            );
          })}
        </div>
      )}

      {/* Numeric Input */}
      {questionType === 'NUMERIC' && (
        <div className="max-w-xs space-y-2">
          <label htmlFor={`numeric-${qId}`} className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Enter your numeric response:
          </label>
          <Input
            id={`numeric-${qId}`}
            type="number"
            step="any"
            value={currentNumericValue}
            onChange={handleNumericChange}
            disabled={disabled}
            placeholder="e.g. 42.5"
            className="font-mono text-base h-11"
          />
        </div>
      )}

      {/* Short Answer Input */}
      {questionType === 'SHORT_ANSWER' && (
        <div className="max-w-xl space-y-2">
          <label htmlFor={`short-answer-${qId}`} className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Enter your short answer response:
          </label>
          <Input
            id={`short-answer-${qId}`}
            type="text"
            value={value?.text_response || ''}
            onChange={(e) => !disabled && onChange({ text_response: e.target.value })}
            disabled={disabled}
            placeholder="Type your answer here..."
            className="text-base h-11"
          />
        </div>
      )}

      {/* Essay Input */}
      {questionType === 'ESSAY' && (
        <div className="w-full space-y-2">
          <div className="flex justify-between items-center">
            <label htmlFor={`essay-${qId}`} className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Provide your comprehensive essay response:
            </label>
            <span className="text-xs text-slate-400">
              {((value?.text_response || '').trim().split(/\s+/).filter(Boolean)).length} words
            </span>
          </div>
          <Textarea
            id={`essay-${qId}`}
            rows={10}
            value={value?.text_response || ''}
            onChange={(e) => !disabled && onChange({ text_response: e.target.value })}
            disabled={disabled}
            placeholder="Structure your analysis, arguments, and evidence here..."
            className="leading-relaxed text-sm"
          />
        </div>
      )}

      {/* Code Input */}
      {questionType === 'CODE' && (
        <div className="w-full space-y-2">
          <div className="flex justify-between items-center">
            <label htmlFor={`code-${qId}`} className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Source code solution:
            </label>
            <span className="text-[11px] font-mono text-slate-400">Monospace editor</span>
          </div>
          <Textarea
            id={`code-${qId}`}
            rows={12}
            value={value?.text_response || ''}
            onChange={(e) => !disabled && onChange({ text_response: e.target.value })}
            disabled={disabled}
            placeholder="// Write your code implementation here..."
            spellCheck={false}
            className="font-mono text-xs sm:text-sm bg-slate-950 text-slate-100 border-slate-800 dark:bg-slate-950"
          />
        </div>
      )}
    </fieldset>
  );
}

export default QuestionRenderer;
