/**
 * @file QuestionBankPage.jsx
 * @description Faculty Question Bank & Rich Question Authoring Workspace.
 * Conforms to Phase 26 Track 1 Workstream A.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Card } from '../../components/common/Card.jsx';
import { Button } from '../../components/common/Button.jsx';
import { Badge } from '../../components/common/Badge.jsx';
import { Spinner } from '../../components/common/Spinner.jsx';
import * as qbApi from '../../api/questionBankApi.js';

export function QuestionBankPage() {
  const [banks, setBanks] = useState([]);
  const [selectedBankId, setSelectedBankId] = useState('');
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [filterDifficulty, setFilterDifficulty] = useState('');
  const [filterBloom, setFilterBloom] = useState('');
  const [filterType, setFilterType] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [isBankModalOpen, setIsBankModalOpen] = useState(false);
  const [isQuestionModalOpen, setIsQuestionModalOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState(null);

  // Bank Form State
  const [bankFormData, setBankFormData] = useState({ name: '', description: '', is_shared: false });

  // Question Form State
  const [questionFormData, setQuestionFormData] = useState({
    prompt: '',
    question_type: 'MCQ',
    difficulty: 'MEDIUM',
    bloom_level: 'APPLY',
    points: 1,
    tags: '',
    options: [
      { text: '', is_correct: true },
      { text: '', is_correct: false }
    ],
    numeric_tolerance: 0,
    rubric_criteria: [],
    grading_guidelines: ''
  });

  const loadBanks = useCallback(async () => {
    try {
      const data = await qbApi.listQuestionBanks();
      setBanks(data);
      if (data.length > 0 && !selectedBankId) {
        setSelectedBankId(data[0].id);
      }
    } catch (err) {
      setError(err.message || 'Failed to load question banks');
    }
  }, [selectedBankId]);

  const loadQuestions = useCallback(async () => {
    setLoading(true);
    try {
      const data = await qbApi.listQuestions({
        bankId: selectedBankId || undefined,
        difficulty: filterDifficulty || undefined,
        bloomLevel: filterBloom || undefined,
        questionType: filterType || undefined,
        query: searchQuery || undefined
      });
      setQuestions(data?.questions || []);
    } catch (err) {
      setError(err.message || 'Failed to load questions');
    } finally {
      setLoading(false);
    }
  }, [selectedBankId, filterDifficulty, filterBloom, filterType, searchQuery]);

  useEffect(() => {
    loadBanks();
  }, [loadBanks]);

  useEffect(() => {
    loadQuestions();
  }, [loadQuestions]);

  const handleCreateBank = async (e) => {
    e.preventDefault();
    try {
      const newBank = await qbApi.createQuestionBank(bankFormData);
      setIsBankModalOpen(false);
      setBankFormData({ name: '', description: '', is_shared: false });
      await loadBanks();
      if (newBank) setSelectedBankId(newBank.id);
    } catch (err) {
      setError(err.message || 'Failed to create question bank');
    }
  };

  const handleOpenCreateQuestion = () => {
    setEditingQuestion(null);
    setQuestionFormData({
      prompt: '',
      question_type: 'MCQ',
      difficulty: 'MEDIUM',
      bloom_level: 'APPLY',
      points: 1,
      tags: '',
      options: [
        { text: 'Option A', is_correct: true },
        { text: 'Option B', is_correct: false }
      ],
      numeric_tolerance: 0,
      rubric_criteria: [
        { name: 'Core Concept & Accuracy', max_points: 3, description: 'Demonstrates deep conceptual understanding' },
        { name: 'Clarity & Justification', max_points: 2, description: 'Clear structured reasoning' }
      ],
      grading_guidelines: ''
    });
    setIsQuestionModalOpen(true);
  };

  const handleOpenEditQuestion = (q) => {
    setEditingQuestion(q);
    setQuestionFormData({
      prompt: q.prompt,
      question_type: q.question_type,
      difficulty: q.difficulty || 'MEDIUM',
      bloom_level: q.bloom_level || 'APPLY',
      points: q.points || 1,
      tags: Array.isArray(q.tags) ? q.tags.join(', ') : '',
      options: q.options && q.options.length > 0 ? q.options : [
        { text: 'Option A', is_correct: true },
        { text: 'Option B', is_correct: false }
      ],
      numeric_tolerance: q.numeric_tolerance || 0,
      rubric_criteria: q.rubric?.criteria || [],
      grading_guidelines: q.rubric?.guidelines || ''
    });
    setIsQuestionModalOpen(true);
  };

  const handleSaveQuestion = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        bankId: selectedBankId,
        prompt: questionFormData.prompt,
        questionType: questionFormData.question_type,
        difficulty: questionFormData.difficulty,
        bloomLevel: questionFormData.bloom_level,
        points: Number(questionFormData.points),
        tags: questionFormData.tags ? questionFormData.tags.split(',').map(t => t.trim()).filter(Boolean) : []
      };

      if (questionFormData.question_type === 'MCQ' || questionFormData.question_type === 'TRUE_FALSE') {
        payload.options = questionFormData.options;
      } else if (questionFormData.question_type === 'NUMERIC') {
        payload.tolerance = Number(questionFormData.numeric_tolerance) || 0;
      } else {
        // Subjective
        payload.rubric = {
          criteria: questionFormData.rubric_criteria,
          guidelines: questionFormData.grading_guidelines
        };
      }

      if (editingQuestion) {
        await qbApi.updateQuestion(editingQuestion.id, payload);
      } else {
        await qbApi.createQuestion(payload);
      }

      setIsQuestionModalOpen(false);
      loadQuestions();
    } catch (err) {
      setError(err.message || 'Failed to save question');
    }
  };

  const handleCloneQuestion = async (qId) => {
    try {
      await qbApi.cloneQuestion(qId);
      loadQuestions();
    } catch (err) {
      setError(err.message || 'Failed to clone question');
    }
  };

  const handleArchiveQuestion = async (qId) => {
    if (!window.confirm('Are you sure you want to archive this question?')) return;
    try {
      await qbApi.archiveQuestion(qId);
      loadQuestions();
    } catch (err) {
      setError(err.message || 'Failed to archive question');
    }
  };

  return (
    <div className="container" style={{ padding: '2rem 1.5rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--color-text-primary)' }}>
            Question Bank & Authoring
          </h1>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
            Author curriculum items with Bloom taxonomies, rubrics, and LaTeX formulas.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <Button variant="secondary" size="sm" onClick={() => setIsBankModalOpen(true)}>
            + New Question Bank
          </Button>
          <Button variant="primary" size="sm" onClick={handleOpenCreateQuestion} disabled={!selectedBankId}>
            + Author Question
          </Button>
        </div>
      </div>

      {error && (
        <div style={{ padding: '0.75rem 1rem', marginBottom: '1.5rem', borderRadius: '0.5rem', backgroundColor: 'var(--color-danger-light)', border: '1px solid var(--color-danger-border)', color: 'var(--color-danger)', fontSize: '0.875rem' }}>
          {error}
        </div>
      )}

      {/* Bank Selector and Filter Bar */}
      <Card padding="normal" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', alignItems: 'end' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>
              Active Bank
            </label>
            <select
              value={selectedBankId}
              onChange={(e) => setSelectedBankId(e.target.value)}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid var(--color-border-subtle)', backgroundColor: 'var(--color-surface)' }}
            >
              {banks.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} {b.is_shared ? '(Shared)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>
              Question Type
            </label>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid var(--color-border-subtle)', backgroundColor: 'var(--color-surface)' }}
            >
              <option value="">All Types</option>
              <option value="MCQ">Multiple Choice (MCQ)</option>
              <option value="TRUE_FALSE">True / False</option>
              <option value="NUMERIC">Numeric</option>
              <option value="SHORT_ANSWER">Short Answer</option>
              <option value="ESSAY">Essay</option>
              <option value="CODE">Source Code</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>
              Difficulty
            </label>
            <select
              value={filterDifficulty}
              onChange={(e) => setFilterDifficulty(e.target.value)}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid var(--color-border-subtle)', backgroundColor: 'var(--color-surface)' }}
            >
              <option value="">All Difficulties</option>
              <option value="EASY">Easy</option>
              <option value="MEDIUM">Medium</option>
              <option value="HARD">Hard</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>
              Bloom Level
            </label>
            <select
              value={filterBloom}
              onChange={(e) => setFilterBloom(e.target.value)}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid var(--color-border-subtle)', backgroundColor: 'var(--color-surface)' }}
            >
              <option value="">All Levels</option>
              <option value="REMEMBER">Remember</option>
              <option value="UNDERSTAND">Understand</option>
              <option value="APPLY">Apply</option>
              <option value="ANALYZE">Analyze</option>
              <option value="EVALUATE">Evaluate</option>
              <option value="CREATE">Create</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>
              Keyword Search
            </label>
            <input
              type="text"
              placeholder="Search prompt, tags..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid var(--color-border-subtle)', backgroundColor: 'var(--color-surface)' }}
            />
          </div>
        </div>
      </Card>

      {/* Questions List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '4rem 0' }}>
          <Spinner size="lg" label="Loading questions..." />
        </div>
      ) : questions.length === 0 ? (
        <Card padding="spacious" style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>
          <p style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>No Questions Found</p>
          <p style={{ fontSize: '0.875rem', marginBottom: '1.5rem' }}>
            No questions match your current bank and filter criteria.
          </p>
          <Button variant="primary" size="sm" onClick={handleOpenCreateQuestion}>
            Author First Question
          </Button>
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {questions.map((q) => (
            <Card key={q.id} padding="normal">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                    <Badge variant="primary">{q.question_type}</Badge>
                    <Badge variant={q.difficulty === 'HARD' ? 'danger' : q.difficulty === 'MEDIUM' ? 'warning' : 'success'}>
                      {q.difficulty}
                    </Badge>
                    <Badge variant="neutral">Bloom: {q.bloom_level}</Badge>
                    <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                      v{q.version || 1} • {q.points || 1} pt{q.points === 1 ? '' : 's'}
                    </span>
                    {q.status === 'ARCHIVED' && <Badge variant="danger">ARCHIVED</Badge>}
                  </div>

                  <div style={{ fontSize: '0.9375rem', fontWeight: 500, color: 'var(--color-text-primary)', marginBottom: '0.5rem', lineHeight: 1.5 }}>
                    {q.prompt}
                  </div>

                  {q.tags && q.tags.length > 0 && (
                    <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                      {q.tags.map((tag, idx) => (
                        <span key={idx} style={{ fontSize: '0.75rem', padding: '0.125rem 0.375rem', borderRadius: '0.25rem', backgroundColor: 'var(--color-surface-secondary)', color: 'var(--color-text-muted)' }}>
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <Button variant="secondary" size="sm" onClick={() => handleOpenEditQuestion(q)}>
                    Edit
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => handleCloneQuestion(q.id)}>
                    Clone
                  </Button>
                  {q.status !== 'ARCHIVED' && (
                    <Button variant="danger" size="sm" onClick={() => handleArchiveQuestion(q.id)}>
                      Archive
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* New Bank Modal */}
      {isBankModalOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ maxWidth: '480px', width: '100%', backgroundColor: 'var(--color-surface)', borderRadius: '0.75rem', padding: '1.5rem', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)' }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '1rem' }}>Create Question Bank</h3>
            <form onSubmit={handleCreateBank} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.25rem' }}>Bank Name *</label>
                <input
                  required
                  type="text"
                  value={bankFormData.name}
                  onChange={(e) => setBankFormData({ ...bankFormData, name: e.target.value })}
                  placeholder="e.g. CS201 Data Structures & Algorithms"
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid var(--color-border-subtle)' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.25rem' }}>Description</label>
                <textarea
                  rows={3}
                  value={bankFormData.description}
                  onChange={(e) => setBankFormData({ ...bankFormData, description: e.target.value })}
                  placeholder="Bank scope, topics covered, target grade level..."
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid var(--color-border-subtle)' }}
                />
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={bankFormData.is_shared}
                  onChange={(e) => setBankFormData({ ...bankFormData, is_shared: e.target.checked })}
                />
                Share with department faculty (Co-authoring)
              </label>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                <Button variant="secondary" size="sm" type="button" onClick={() => setIsBankModalOpen(false)}>
                  Cancel
                </Button>
                <Button variant="primary" size="sm" type="submit">
                  Create Bank
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Author / Edit Question Modal */}
      {isQuestionModalOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ maxWidth: '800px', width: '100%', maxHeight: '90vh', overflowY: 'auto', backgroundColor: 'var(--color-surface)', borderRadius: '0.75rem', padding: '1.75rem', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.3)' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1rem' }}>
              {editingQuestion ? 'Edit Question' : 'Author New Question'}
            </h3>

            <form onSubmit={handleSaveQuestion} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem' }}>Question Type</label>
                  <select
                    value={questionFormData.question_type}
                    onChange={(e) => setQuestionFormData({ ...questionFormData, question_type: e.target.value })}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid var(--color-border-subtle)' }}
                  >
                    <option value="MCQ">Multiple Choice</option>
                    <option value="TRUE_FALSE">True / False</option>
                    <option value="NUMERIC">Numeric</option>
                    <option value="SHORT_ANSWER">Short Answer</option>
                    <option value="ESSAY">Essay</option>
                    <option value="CODE">Source Code</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem' }}>Difficulty</label>
                  <select
                    value={questionFormData.difficulty}
                    onChange={(e) => setQuestionFormData({ ...questionFormData, difficulty: e.target.value })}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid var(--color-border-subtle)' }}
                  >
                    <option value="EASY">Easy</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HARD">Hard</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem' }}>Bloom Taxonomy</label>
                  <select
                    value={questionFormData.bloom_level}
                    onChange={(e) => setQuestionFormData({ ...questionFormData, bloom_level: e.target.value })}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid var(--color-border-subtle)' }}
                  >
                    <option value="REMEMBER">Remember</option>
                    <option value="UNDERSTAND">Understand</option>
                    <option value="APPLY">Apply</option>
                    <option value="ANALYZE">Analyze</option>
                    <option value="EVALUATE">Evaluate</option>
                    <option value="CREATE">Create</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem' }}>Points / Weight</label>
                  <input
                    type="number"
                    min="1"
                    value={questionFormData.points}
                    onChange={(e) => setQuestionFormData({ ...questionFormData, points: e.target.value })}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid var(--color-border-subtle)' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                  Question Prompt (Supports LaTeX formulas, e.g. $E = mc^2$ or $\int x dx$) *
                </label>
                <textarea
                  required
                  rows={4}
                  value={questionFormData.prompt}
                  onChange={(e) => setQuestionFormData({ ...questionFormData, prompt: e.target.value })}
                  placeholder="Enter problem prompt..."
                  style={{ width: '100%', padding: '0.75rem', borderRadius: '0.375rem', border: '1px solid var(--color-border-subtle)', fontFamily: 'inherit' }}
                />
              </div>

              {/* LaTeX Preview Banner */}
              {questionFormData.prompt.includes('$') && (
                <div style={{ padding: '0.75rem 1rem', borderRadius: '0.375rem', backgroundColor: 'var(--color-surface-secondary)', border: '1px solid var(--color-border-subtle)', fontSize: '0.875rem' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-primary)', display: 'block', marginBottom: '0.25rem' }}>
                    LaTeX Formula Preview:
                  </span>
                  <div>{questionFormData.prompt}</div>
                </div>
              )}

              {/* MCQ Options Editor */}
              {(questionFormData.question_type === 'MCQ' || questionFormData.question_type === 'TRUE_FALSE') && (
                <div>
                  <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.5rem' }}>Options</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {questionFormData.options.map((opt, idx) => (
                      <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <input
                          type="radio"
                          name="correct_option"
                          checked={opt.is_correct}
                          onChange={() => {
                            const newOpts = questionFormData.options.map((o, i) => ({
                              ...o,
                              is_correct: i === idx
                            }));
                            setQuestionFormData({ ...questionFormData, options: newOpts });
                          }}
                        />
                        <input
                          type="text"
                          required
                          value={opt.text}
                          onChange={(e) => {
                            const newOpts = [...questionFormData.options];
                            newOpts[idx].text = e.target.value;
                            setQuestionFormData({ ...questionFormData, options: newOpts });
                          }}
                          placeholder={`Option ${idx + 1}`}
                          style={{ flex: 1, padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid var(--color-border-subtle)' }}
                        />
                        {questionFormData.options.length > 2 && (
                          <button
                            type="button"
                            onClick={() => {
                              const newOpts = questionFormData.options.filter((_, i) => i !== idx);
                              setQuestionFormData({ ...questionFormData, options: newOpts });
                            }}
                            style={{ background: 'none', border: 'none', color: 'var(--color-danger)', cursor: 'pointer' }}
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                    {questionFormData.question_type === 'MCQ' && (
                      <Button
                        variant="secondary"
                        size="sm"
                        type="button"
                        onClick={() => {
                          setQuestionFormData({
                            ...questionFormData,
                            options: [...questionFormData.options, { text: '', is_correct: false }]
                          });
                        }}
                        style={{ alignSelf: 'flex-start', marginTop: '0.25rem' }}
                      >
                        + Add Option
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {/* Subjective Rubric Criteria */}
              {['SHORT_ANSWER', 'ESSAY', 'CODE'].includes(questionFormData.question_type) && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <label style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Rubric Criteria & Partial Credit Breakdown</label>
                    <button
                      type="button"
                      onClick={() => {
                        setQuestionFormData({
                          ...questionFormData,
                          rubric_criteria: [
                            ...questionFormData.rubric_criteria,
                            { name: 'New Criterion', max_points: 2, description: '' }
                          ]
                        });
                      }}
                      style={{ fontSize: '0.75rem', color: 'var(--color-primary)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}
                    >
                      + Add Criterion
                    </button>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {questionFormData.rubric_criteria.map((c, idx) => (
                      <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 3fr auto', gap: '0.5rem', alignItems: 'center', backgroundColor: 'var(--color-surface-secondary)', padding: '0.5rem', borderRadius: '0.375rem' }}>
                        <input
                          type="text"
                          placeholder="Criterion Name"
                          value={c.name}
                          onChange={(e) => {
                            const newCrit = [...questionFormData.rubric_criteria];
                            newCrit[idx].name = e.target.value;
                            setQuestionFormData({ ...questionFormData, rubric_criteria: newCrit });
                          }}
                          style={{ padding: '0.375rem', borderRadius: '0.25rem', border: '1px solid var(--color-border-subtle)', fontSize: '0.8125rem' }}
                        />
                        <input
                          type="number"
                          placeholder="Max Pts"
                          value={c.max_points}
                          onChange={(e) => {
                            const newCrit = [...questionFormData.rubric_criteria];
                            newCrit[idx].max_points = Number(e.target.value);
                            setQuestionFormData({ ...questionFormData, rubric_criteria: newCrit });
                          }}
                          style={{ padding: '0.375rem', borderRadius: '0.25rem', border: '1px solid var(--color-border-subtle)', fontSize: '0.8125rem' }}
                        />
                        <input
                          type="text"
                          placeholder="Grading expectations..."
                          value={c.description}
                          onChange={(e) => {
                            const newCrit = [...questionFormData.rubric_criteria];
                            newCrit[idx].description = e.target.value;
                            setQuestionFormData({ ...questionFormData, rubric_criteria: newCrit });
                          }}
                          style={{ padding: '0.375rem', borderRadius: '0.25rem', border: '1px solid var(--color-border-subtle)', fontSize: '0.8125rem' }}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const newCrit = questionFormData.rubric_criteria.filter((_, i) => i !== idx);
                            setQuestionFormData({ ...questionFormData, rubric_criteria: newCrit });
                          }}
                          style={{ background: 'none', border: 'none', color: 'var(--color-danger)', cursor: 'pointer' }}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>

                  <div style={{ marginTop: '0.75rem' }}>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                      Model Solution / Evaluator Guidelines
                    </label>
                    <textarea
                      rows={2}
                      value={questionFormData.grading_guidelines}
                      onChange={(e) => setQuestionFormData({ ...questionFormData, grading_guidelines: e.target.value })}
                      placeholder="Expected steps, key concepts, or common candidate pitfalls..."
                      style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid var(--color-border-subtle)', fontSize: '0.8125rem' }}
                    />
                  </div>
                </div>
              )}

              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                  Tags (Comma separated)
                </label>
                <input
                  type="text"
                  placeholder="e.g. algorithms, trees, binary-search"
                  value={questionFormData.tags}
                  onChange={(e) => setQuestionFormData({ ...questionFormData, tags: e.target.value })}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid var(--color-border-subtle)' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
                <Button variant="secondary" size="sm" type="button" onClick={() => setIsQuestionModalOpen(false)}>
                  Cancel
                </Button>
                <Button variant="primary" size="sm" type="submit">
                  {editingQuestion ? 'Update Question' : 'Save Question'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default QuestionBankPage;
