/**
 * @file FaqPage.jsx
 * @description Searchable, categorized FAQ accordion for ProctorNet educational project.
 */

import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { usePageMeta } from '../../hooks/usePageMeta.js';
import { FAQ_ITEMS, FAQ_CATEGORIES } from '../../content/faqData.js';

export function FaqPage() {
  usePageMeta({
    title: 'Frequently Asked Questions',
    description:
      'Find answers to common questions about ProctorNet: candidate requirements, exam blueprints, client-side screen analysis, privacy guarantees, and open-source architecture.',
    canonical: '/faq',
  });

  const [activeCategory, setActiveCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [openItems, setOpenItems] = useState(new Set(['faq-academic-nature']));

  const toggleItem = (id) => {
    setOpenItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const filteredItems = useMemo(() => {
    return FAQ_ITEMS.filter((item) => {
      const matchesCategory = activeCategory === 'All' || item.category === activeCategory;
      const matchesSearch =
        !searchQuery.trim() ||
        item.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.answer.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.tags?.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchesCategory && matchesSearch;
    });
  }, [activeCategory, searchQuery]);

  return (
    <div className="container" style={{ paddingTop: '48px', paddingBottom: '80px', maxWidth: '880px' }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '40px' }}>
        <span className="badge-academic" style={{ marginBottom: '16px' }}>
          Questions &amp; Answers
        </span>
        <h1
          style={{
            fontSize: 'clamp(2rem, 4vw, 2.75rem)',
            fontWeight: 800,
            color: 'var(--color-text-primary)',
            letterSpacing: '-0.02em',
            margin: '12px 0 16px 0',
          }}
        >
          Frequently Asked Questions
        </h1>
        <p style={{ fontSize: '1.125rem', lineHeight: 1.6, color: 'var(--color-text-muted)', maxWidth: '640px', margin: '0 auto' }}>
          Explore detailed answers covering student readiness, faculty workflows, ethical proctoring boundaries, and system architecture.
        </p>
      </div>

      {/* Search Input Bar */}
      <div style={{ marginBottom: '28px' }}>
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by keyword (e.g. webcam, offline, grading, privacy)..."
          aria-label="Search FAQs"
          style={{
            width: '100%',
            padding: '14px 20px',
            fontSize: '1rem',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--color-border-medium)',
            backgroundColor: 'var(--color-surface)',
            color: 'var(--color-text-primary)',
            outline: 'none',
            boxShadow: 'var(--shadow-sm)',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Category Tabs */}
      <div
        role="tablist"
        aria-label="FAQ Categories"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '8px',
          marginBottom: '36px',
          justifyContent: 'center',
        }}
      >
        {FAQ_CATEGORIES.map((cat) => {
          const isActive = cat === activeCategory;
          return (
            <button
              key={cat}
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveCategory(cat)}
              style={{
                padding: '8px 16px',
                borderRadius: 'var(--radius-full)',
                border: '1px solid',
                borderColor: isActive ? 'var(--color-primary)' : 'var(--color-border-subtle)',
                backgroundColor: isActive ? 'var(--color-primary)' : 'var(--color-surface)',
                color: isActive ? '#ffffff' : 'var(--color-text-body)',
                fontWeight: 600,
                fontSize: '0.875rem',
                cursor: 'pointer',
                transition: 'all var(--transition-fast)',
              }}
            >
              {cat}
            </button>
          );
        })}
      </div>

      {/* FAQ Accordion List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '48px' }}>
        {filteredItems.length === 0 ? (
          <div className="card-interactive" style={{ padding: '40px', textAlign: 'center' }}>
            <p style={{ fontSize: '1rem', color: 'var(--color-text-muted)', margin: 0 }}>
              No matching questions found for "{searchQuery}". Try a different keyword or view all categories.
            </p>
          </div>
        ) : (
          filteredItems.map((item) => {
            const isOpen = openItems.has(item.id);
            return (
              <div
                key={item.id}
                className="card-interactive"
                style={{
                  padding: 0,
                  overflow: 'hidden',
                  borderColor: isOpen ? 'var(--color-primary-border)' : 'var(--color-border-subtle)',
                }}
              >
                <button
                  type="button"
                  onClick={() => toggleItem(item.id)}
                  aria-expanded={isOpen}
                  aria-controls={`faq-answer-${item.id}`}
                  style={{
                    width: '100%',
                    padding: '20px 24px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '16px',
                    background: 'none',
                    border: 'none',
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                    {item.question}
                  </span>
                  <span
                    style={{
                      fontSize: '1.25rem',
                      fontWeight: 600,
                      color: isOpen ? 'var(--color-primary)' : 'var(--color-text-muted)',
                      transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform var(--transition-fast)',
                    }}
                  >
                    ▾
                  </span>
                </button>

                {isOpen && (
                  <div
                    id={`faq-answer-${item.id}`}
                    style={{
                      padding: '0 24px 24px 24px',
                      borderTop: '1px solid var(--color-border-subtle)',
                      paddingTop: '16px',
                    }}
                  >
                    <p style={{ fontSize: '0.9375rem', lineHeight: 1.7, color: 'var(--color-text-body)', margin: '0 0 16px 0' }}>
                      {item.answer}
                    </p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {item.tags?.map((tag, tIdx) => (
                        <span
                          key={tIdx}
                          style={{
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            padding: '2px 8px',
                            borderRadius: 'var(--radius-sm)',
                            backgroundColor: 'var(--color-surface-secondary)',
                            color: 'var(--color-text-muted)',
                          }}
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Still have questions? */}
      <div
        className="glass-panel"
        style={{
          padding: '32px',
          textAlign: 'center',
          backgroundColor: 'var(--color-surface)',
        }}
      >
        <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '8px' }}>
          Have a Question Not Answered Here?
        </h3>
        <p style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)', maxWidth: '540px', margin: '0 auto 20px auto' }}>
          Reach out to the student development team with technical inquiries, bug reports, or academic evaluation questions.
        </p>
        <Link to="/contact" className="btn-academic-primary" style={{ padding: '8px 20px', fontSize: '0.875rem' }}>
          Contact Project Team →
        </Link>
      </div>
    </div>
  );
}
