import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api/invidious';
import { resolveYouTubeUrl } from '../../api/youtubeUrl';
import { useClickOutside } from '../../hooks/useClickOutside';
import { Icon } from '../../icons';
import { useLibrary } from '../../stores/library';

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function SearchBox({ autoFocus, onDone }: { autoFocus?: boolean; onDone?: () => void }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const urlQuery = params.get('search_query') ?? '';
  const [value, setValue] = useState(urlQuery);
  const [focused, setFocused] = useState(false);
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const history = useLibrary((s) => s.searchHistory);
  const addSearch = useLibrary((s) => s.addSearch);
  const removeSearch = useLibrary((s) => s.removeSearch);

  useEffect(() => setValue(urlQuery), [urlQuery]);

  const debounced = useDebounced(value.trim(), 150);
  const { data } = useQuery({
    queryKey: ['suggest', debounced],
    queryFn: () => api.suggestions(debounced),
    enabled: debounced.length > 0 && open,
    staleTime: 5 * 60 * 1000,
  });

  const items = useMemo(() => {
    const q = value.trim().toLowerCase();
    const hist = history.filter((h) => !q || h.toLowerCase().startsWith(q)).slice(0, q ? 3 : 12);
    const sugg = (q ? data?.suggestions || [] : []).filter((s) => !hist.some((h) => h.toLowerCase() === s.toLowerCase()));
    return [...hist.map((text) => ({ text, history: true })), ...sugg.slice(0, 14 - hist.length).map((text) => ({ text, history: false }))];
  }, [value, history, data]);

  useClickOutside([wrapRef], () => setOpen(false), open);

  const submit = (q: string) => {
    const query = q.trim();
    if (!query) return;
    setOpen(false);
    inputRef.current?.blur();
    onDone?.();
    // Pasted YouTube links (videos, channels, playlists, youtu.be, ...) open directly
    if (/^https?:\/\//i.test(query) || /^(www\.|m\.)?(youtube\.com|youtu\.be)\//i.test(query)) {
      const target = resolveYouTubeUrl(/^https?:/i.test(query) ? query : `https://${query}`);
      if (target) {
        navigate(target);
        return;
      }
    }
    addSearch(query);
    navigate(`/results?search_query=${encodeURIComponent(query)}`);
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit(sel >= 0 && items[sel] ? items[sel].text : value);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) setOpen(true);
      const n = items.length;
      if (!n) return;
      const next = e.key === 'ArrowDown' ? (sel + 1 >= n ? -1 : sel + 1) : sel - 1 < -1 ? n - 1 : sel - 1;
      setSel(next);
    } else if (e.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  const shown = sel >= 0 && items[sel] ? items[sel].text : value;

  const startVoice = () => {
    const SR = (window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec })
      .SpeechRecognition || (window as unknown as { webkitSpeechRecognition?: new () => SpeechRec }).webkitSpeechRecognition;
    if (!SR) {
      alert('Voice search is not supported in this browser.');
      return;
    }
    const rec = new SR();
    rec.lang = navigator.language || 'en-US';
    rec.interimResults = true;
    rec.onresult = (ev) => {
      const r = ev.results[ev.results.length - 1];
      const text = r[0].transcript;
      setValue(text);
      if (r.isFinal) submit(text);
    };
    rec.start();
  };

  return (
    <div className="masthead-search" ref={wrapRef}>
      <form className={'search-form' + (focused ? ' focused' : '')} onSubmit={onSubmit} role="search">
        <div className="search-input-wrap">
          {focused && <Icon name="search" className="search-inner-icon" />}
          <input
            ref={inputRef}
            className="search-input"
            name="search_query"
            placeholder="Search"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            autoFocus={autoFocus}
            value={shown}
            onChange={(e) => {
              setValue(e.target.value);
              setSel(-1);
              setOpen(true);
            }}
            onFocus={() => {
              setFocused(true);
              setOpen(true);
            }}
            onBlur={() => setFocused(false)}
            onKeyDown={onKeyDown}
          />
          {value && (
            <button
              type="button"
              className="icon-btn search-clear"
              aria-label="Clear search query"
              onClick={() => {
                setValue('');
                setSel(-1);
                inputRef.current?.focus();
              }}
            >
              <Icon name="close" />
            </button>
          )}
        </div>
        <button type="submit" className="search-button" aria-label="Search" data-tooltip="Search">
          <Icon name="search" />
        </button>
        {open && items.length > 0 && (
          <div className="search-suggestions" role="listbox">
            {items.map((it, i) => {
              const q = value.trim();
              const rest = it.text.toLowerCase().startsWith(q.toLowerCase()) ? it.text.slice(q.length) : null;
              return (
                <div
                  key={(it.history ? 'h:' : 's:') + it.text}
                  className={'suggestion' + (i === sel ? ' selected' : '')}
                  role="option"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    submit(it.text);
                  }}
                  onMouseEnter={() => setSel(-1)}
                >
                  <Icon name={it.history ? 'history' : 'search'} className="suggestion-icon" />
                  <span className={'suggestion-text' + (it.history ? ' is-history' : '')}>
                    {rest !== null ? (
                      <>
                        {q}
                        <b>{rest}</b>
                      </>
                    ) : (
                      <b>{it.text}</b>
                    )}
                  </span>
                  {it.history && (
                    <button
                      className="suggestion-remove"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        removeSearch(it.text);
                      }}
                    >
                      Remove
                    </button>
                  )}
                </div>
              );
            })}
            <div className="suggestion-footer">Report search predictions</div>
          </div>
        )}
      </form>
      <button className="icon-btn mic-button" aria-label="Search with your voice" data-tooltip="Search with your voice" onClick={startVoice}>
        <Icon name="mic" />
      </button>
    </div>
  );
}

interface SpeechRec {
  lang: string;
  interimResults: boolean;
  onresult: (ev: { results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void;
  start: () => void;
}
