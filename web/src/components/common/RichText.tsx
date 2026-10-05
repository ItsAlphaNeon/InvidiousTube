import { useMemo, type MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { parseStartTime } from '../../api/format';

const ALLOWED = new Set(['A', 'B', 'I', 'BR', 'STRONG', 'EM', 'SPAN', 'S', 'P', 'U']);

/** Very small allow-list sanitizer for the HTML Invidious returns in descriptions and comments. */
function sanitize(html: string): string {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const root = doc.body.firstElementChild as HTMLElement;
  const walk = (node: Element) => {
    for (const child of Array.from(node.children)) {
      if (!ALLOWED.has(child.tagName)) {
        child.replaceWith(...Array.from(child.childNodes));
        continue;
      }
      for (const attr of Array.from(child.attributes)) {
        if (child.tagName === 'A' && (attr.name === 'href' || attr.name === 'data-jump-time')) continue;
        child.removeAttribute(attr.name);
      }
      if (child.tagName === 'A') {
        const href = child.getAttribute('href') || '';
        if (/^\s*javascript:/i.test(href)) child.removeAttribute('href');
        rewriteLink(child as HTMLAnchorElement);
      }
      walk(child);
    }
  };
  walk(root);
  return root.innerHTML;
}

/** Turns youtube.com links into in-app links. */
function rewriteLink(a: HTMLAnchorElement) {
  const href = a.getAttribute('href') || '';
  try {
    const u = new URL(href, 'https://www.youtube.com');
    const host = u.hostname.replace(/^www\.|^m\./, '');
    if (host === 'youtu.be') {
      const t = u.searchParams.get('t');
      a.setAttribute('href', `/watch?v=${u.pathname.slice(1)}${t ? `&t=${t}` : ''}`);
      return;
    }
    if (host === 'youtube.com' || href.startsWith('/')) {
      if (u.pathname === '/redirect') {
        const q = u.searchParams.get('q');
        if (q) a.setAttribute('href', q);
        return;
      }
      a.setAttribute('href', u.pathname + u.search);
      return;
    }
  } catch {
    /* ignore */
  }
}

interface Props {
  html: string;
  className?: string;
  /** called when a timestamp link for the current video is clicked */
  onTimestamp?: (seconds: number) => void;
  currentVideoId?: string;
}

export function RichText({ html, className, onTimestamp, currentVideoId }: Props) {
  const navigate = useNavigate();
  const clean = useMemo(() => sanitize(html || ''), [html]);

  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    const a = (e.target as HTMLElement).closest('a');
    if (!a) return;
    const href = a.getAttribute('href');
    if (!href) return;
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
    if (href.startsWith('/')) {
      e.preventDefault();
      const u = new URL(href, location.origin);
      const jump = a.getAttribute('data-jump-time');
      if (u.pathname === '/watch' && onTimestamp && (u.searchParams.get('v') === currentVideoId || jump)) {
        if (u.searchParams.get('v') === currentVideoId || !u.searchParams.get('v')) {
          onTimestamp(jump ? Number(jump) : parseStartTime(u.searchParams.get('t')));
          return;
        }
      }
      if (u.pathname.startsWith('/hashtag/')) {
        navigate(`/hashtag/${u.pathname.split('/')[2]}`);
        return;
      }
      navigate(u.pathname + u.search);
      return;
    }
    a.setAttribute('target', '_blank');
    a.setAttribute('rel', 'noopener noreferrer');
  };

  return <div className={'rich-text' + (className ? ' ' + className : '')} onClick={onClick} dangerouslySetInnerHTML={{ __html: clean }} />;
}
