/**
 * @file usePageMeta.js
 * @description Dynamic SEO metadata manager for ProctorNet SPA.
 * Manages document title, meta descriptions, canonical URLs, and OpenGraph tags.
 */

import { useEffect } from 'react';

/**
 * Updates document head tags for SEO and social sharing.
 * @param {Object} options
 * @param {string} options.title - Page title (will be suffixed with '| ProctorNet')
 * @param {string} options.description - Meta description text
 * @param {string} [options.canonical] - Canonical path or URL (e.g. '/about')
 */
export function usePageMeta({ title, description, canonical }) {
  useEffect(() => {
    // 1. Update Document Title
    const formattedTitle = title
      ? `${title} | ProctorNet: Academic Examination Platform`
      : 'ProctorNet: Academic Online Examination & Remote Proctoring Platform';
    document.title = formattedTitle;

    // Helper to get or create a meta tag
    const setMetaTag = (attrName, attrValue, content) => {
      let element = document.querySelector(`meta[${attrName}="${attrValue}"]`);
      if (!element) {
        element = document.createElement('meta');
        element.setAttribute(attrName, attrValue);
        document.head.appendChild(element);
      }
      element.setAttribute('content', content || '');
    };

    // 2. Set Meta Descriptions
    if (description) {
      setMetaTag('name', 'description', description);
      setMetaTag('property', 'og:description', description);
      setMetaTag('name', 'twitter:description', description);
    }

    // 3. Set OpenGraph & Twitter Titles
    setMetaTag('property', 'og:title', formattedTitle);
    setMetaTag('name', 'twitter:title', formattedTitle);
    setMetaTag('property', 'og:type', 'website');
    setMetaTag('name', 'twitter:card', 'summary_large_image');

    // 4. Update Canonical Link
    const baseUrl = window.location.origin;
    const fullCanonical = canonical ? `${baseUrl}${canonical}` : window.location.href;
    let linkElement = document.querySelector('link[rel="canonical"]');
    if (!linkElement) {
      linkElement = document.createElement('link');
      linkElement.setAttribute('rel', 'canonical');
      document.head.appendChild(linkElement);
    }
    linkElement.setAttribute('href', fullCanonical);
    setMetaTag('property', 'og:url', fullCanonical);

  }, [title, description, canonical]);
}
