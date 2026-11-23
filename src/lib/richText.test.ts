import { describe, expect, it } from 'vitest';
import { sanitizeRichText } from './richText';

describe('rich text rendered from stored lesson content', () => {
  it('removes scripts, handlers and executable links while preserving educational text', () => {
    const html = sanitizeRichText('<p onclick="alert(1)">Aula <strong>segura</strong><script>alert(1)</script><a href="javascript:alert(1)">link</a><img src="https://school.test/image.png" onerror="alert(1)"></p>');
    expect(html).toContain('<strong>segura</strong>');
    expect(html).not.toMatch(/script|onclick|onerror|javascript:/i);
    const root = document.createElement('div'); root.innerHTML = html;
    expect(root.querySelector('a')).not.toHaveAttribute('href');
    expect(root.querySelector('img')).toHaveAttribute('src', 'https://school.test/image.png');
  });

  it('rejects embedded HTML, SVG and non-image data URLs', () => {
    const html = sanitizeRichText('<iframe src="https://untrusted.test"></iframe><svg onload="alert(1)"><script>alert(2)</script></svg><img src="data:text/html,bad"><a href="https://school.test/lesson">Material</a>');
    expect(html).not.toMatch(/iframe|svg|script|data:text/i);
    const root = document.createElement('div'); root.innerHTML = html;
    expect(root.querySelector('a')).toHaveAttribute('rel', 'noopener noreferrer');
  });
});
