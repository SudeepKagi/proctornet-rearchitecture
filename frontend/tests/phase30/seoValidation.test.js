/**
 * @file seoValidation.test.js
 * @description Automated verification of technical SEO assets and metadata integrity.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Technical SEO & Metadata Validation', () => {
  const publicDir = path.resolve(__dirname, '../../public');

  it('verifies robots.txt exists and specifies appropriate allow/disallow rules', () => {
    const robotsPath = path.join(publicDir, 'robots.txt');
    expect(fs.existsSync(robotsPath)).toBe(true);

    const content = fs.readFileSync(robotsPath, 'utf8');
    expect(content).toContain('User-agent: *');
    expect(content).toContain('Allow: /');
    expect(content).toContain('Allow: /about');
    expect(content).toContain('Allow: /features');
    expect(content).toContain('Allow: /architecture');
    expect(content).toContain('Disallow: /candidate/');
    expect(content).toContain('Disallow: /faculty/');
    expect(content).toContain('Disallow: /invigilator/');
    expect(content).toContain('Disallow: /admin/');
    expect(content).toContain('Disallow: /developer/');
    expect(content).toContain('Sitemap: /sitemap.xml');
  });

  it('verifies sitemap.xml exists and contains valid XML URLs for all core public routes', () => {
    const sitemapPath = path.join(publicDir, 'sitemap.xml');
    expect(fs.existsSync(sitemapPath)).toBe(true);

    const content = fs.readFileSync(sitemapPath, 'utf8');
    expect(content).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(content).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');

    const expectedRoutes = [
      'https://proctornet.academic.edu/',
      'https://proctornet.academic.edu/about',
      'https://proctornet.academic.edu/features',
      'https://proctornet.academic.edu/how-it-works',
      'https://proctornet.academic.edu/for-students',
      'https://proctornet.academic.edu/for-faculty',
      'https://proctornet.academic.edu/for-institutions',
      'https://proctornet.academic.edu/ai-proctoring',
      'https://proctornet.academic.edu/security',
      'https://proctornet.academic.edu/accessibility',
      'https://proctornet.academic.edu/architecture',
      'https://proctornet.academic.edu/documentation',
      'https://proctornet.academic.edu/faq',
      'https://proctornet.academic.edu/terms',
      'https://proctornet.academic.edu/privacy',
      'https://proctornet.academic.edu/cookies',
      'https://proctornet.academic.edu/acceptable-use',
      'https://proctornet.academic.edu/academic-integrity',
      'https://proctornet.academic.edu/ai-proctoring-notice',
      'https://proctornet.academic.edu/accessibility-statement',
    ];

    expectedRoutes.forEach((route) => {
      expect(content).toContain(`<loc>${route}</loc>`);
    });
  });

  it('verifies index.html contains non-commercial academic descriptions and OpenGraph tags', () => {
    const indexPath = path.resolve(__dirname, '../../index.html');
    const content = fs.readFileSync(indexPath, 'utf8');

    expect(content).toContain('student-built academic software engineering project');
    expect(content).toContain('property="og:site_name"');
    expect(content).toContain('name="twitter:card"');
    expect(content).toContain('name="theme-color" content="#1e3a8a"');
  });
});
