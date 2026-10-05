import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api/invidious';
import { resolveYouTubeUrl } from '../api/youtubeUrl';
import { Icon } from '../icons';
import { useLibrary } from '../stores/library';

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Full-screen search page, opened from the top bar (lives at #search so Back closes it). */
export function MobileSearch() {
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const params = new URLSearchParams(search);
  const current = pathname === '/results' ? params.get('search_query') || '' : '';
  const [value, setValue] = useState(current);
  const inputRef = useRef<HTMLInputElement>(null);
  const history = useLibrary((s) => s.searchHistory);
  const addSearch = useLibrary((s) => s.addSearch);
  const removeSearch = useLibrary((s) => s.removeSearch);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 30);
    document.body.classList.add('no-scroll');
    return () => {
      clearTimeout(t);
      document.body.classList.remove('no-scroll');
    };
  }, []);

  const debounced = useDebounced(value.trim(), 120);
  const { data } = useQuery({
    queryKey: ['suggest', debounced],
    queryFn: () => api.suggestions(debounced),
    enabled: debounced.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const items = useMemo(() => {
    const q = value.trim().toLowerCase();
    const hist = history.filter((h) => !q || h.toLowerCase().startsWith(q)).slice(0, q ? 4 : 20);
    const sugg = (q ? data?.suggestions || [] : []).filter((s) => !hist.some((h) => h.toLowerCase() === s.toLowerCase()));
    return [...hist.map((text) => ({ text, history: true })), ...sugg.slice(0, 16 - hist.length).map((text) => ({ text, history: false }))];
  }, [value, history, data]);

  const close = () => navigate(-1);
  const submit = (q: string) => {
    const query = q.trim();
    if (!query) return;
    inputRef.current?.blur();
    if (/^https?:\/\//i.test(query) || /^(www\.|m\.)?(youtube\.com|youtu\.be)\//i.test(query)) {
      const target = resolveYouTubeUrl(/^https?:/i.test(query) ? query : `https://${query}`);
      if (target) {
        navigate(target, { replace: true });
        return;
      }
    }
    addSearch(query);
    navigate(`/results?search_query=${encodeURIComponent(query)}`, { replace: true });
  };
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit(value);
  };

  return (
    <div className="m-search">
      <form className="m-search-bar" onSubmit={onSubmit} role="search">
        <button type="button" className="m-icon-btn" onClick={close} aria-label="Back">
          <Icon name="back" />
        </button>
        <div className="m-search-field">
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Search YouTube"
            enterKeyHint="search"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            type="search"
          />
          {value && (
            <button type="button" className="m-icon-btn sm" onClick={() => (setValue(''), inputRef.current?.focus())} aria-label="Clear">
              <Icon name="close" />
            </button>
          )}
        </div>
        <button type="submit" className="m-icon-btn" aria-label="Search">
          <Icon name="search" />
        </button>
      </form>
      <div className="m-search-list">
        {items.map((it) => (
          <div
            key={(it.history ? 'h:' : 's:') + it.text}
            className="m-search-item"
            onClick={() => submit(it.text)}
            onContextMenu={(e) => {
              if (!it.history) return;
              e.preventDefault();
              if (confirm(`Remove "${it.text}" from search history?`)) removeSearch(it.text);
            }}
          >
            <Icon name={it.history ? 'history' : 'search'} />
            <span className="m-search-text">{it.text}</span>
            <button
              className="m-icon-btn sm m-search-fill"
              aria-label="Edit query"
              onClick={(e) => {
                e.stopPropagation();
                setValue(it.text + ' ');
                inputRef.current?.focus();
              }}
            >
              <Icon name="back" />
            </button>
          </div>
        ))}
        {!items.length && !value && <div className="m-search-empty">Search for videos, channels, or paste a YouTube link</div>}
      </div>
    </div>
  );
}
