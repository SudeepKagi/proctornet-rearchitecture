import React from 'react';

export function PageHeader({ eyebrow, title, description, actions }) {
  return <header className="workspace-header">
    <div>
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h1>{title}</h1>
      {description && <p>{description}</p>}
    </div>
    {actions && <div className="page-header-actions">{actions}</div>}
  </header>;
}
