import { useState, useEffect, useRef, useCallback } from 'react';
import {
  KeyRound, Copy, RefreshCw, Trash2, Check, Clock,
  Shield, Sun, Moon, LayoutList, LayoutGrid,
} from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { generateTOTP, getTimeRemaining } from '@/lib/totpUtils';
import { cn } from '@/lib/utils';
import { loadStorage, saveStorage } from '@/lib/storage';

interface TOTPResult {
  secret: string;
  code: string;
  timestamp: number;
}

export default function SidePanel() {
  const [secretInput, setSecretInput] = useState('');
  const [results, setResults] = useState<TOTPResult[]>([]);
  const [timeRemaining, setTimeRemaining] = useState(getTimeRemaining());
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [isDark, setIsDark] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load persisted state from chrome.storage.local on mount
  useEffect(() => {
    let cancelled = false;
    async function init() {
      const stored = await loadStorage();
      if (cancelled) return;

      document.documentElement.classList.toggle('dark', stored.theme === 'dark');
      setIsDark(stored.theme === 'dark');
      setViewMode(stored.viewMode);

      const initial: TOTPResult[] = [];
      for (const secret of stored.secrets) {
        const code = await generateTOTP(secret);
        if (code) initial.push({ secret, code, timestamp: Date.now() });
      }
      if (!cancelled) {
        setResults(initial);
        setIsLoaded(true);
      }
    }
    init();
    return () => { cancelled = true; };
  }, []);

  // Persist secrets whenever results change (guard prevents wiping on mount)
  useEffect(() => {
    if (!isLoaded) return;
    saveStorage({ secrets: results.map((r) => r.secret) });
  }, [results, isLoaded]);

  function setView(mode: 'list' | 'grid') {
    setViewMode(mode);
    saveStorage({ viewMode: mode });
  }

  function toggleTheme() {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle('dark', next);
    saveStorage({ theme: next ? 'dark' : 'light' });
  }

  const regenerateCodes = useCallback(async () => {
    const updatedResults = await Promise.all(
      results.map(async (result) => ({
        ...result,
        code: (await generateTOTP(result.secret)) || 'ERROR',
        timestamp: Date.now(),
      }))
    );
    setResults(updatedResults);
  }, [results]);

  useEffect(() => {
    if (!isLoaded) return;
    let lastTimeRemaining = getTimeRemaining();

    const tick = () => {
      const remaining = getTimeRemaining();
      setTimeRemaining(remaining);
      if (remaining > lastTimeRemaining && results.length > 0) {
        regenerateCodes();
      }
      lastTimeRemaining = remaining;
    };

    tick();
    intervalRef.current = setInterval(tick, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isLoaded, results.length, regenerateCodes]);

  const handleGetCode = useCallback(async (overrideText?: string) => {
    const raw = (overrideText ?? secretInput).trim();
    if (!raw) {
      toast.error('Please enter a 2FA secret key');
      return;
    }

    const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
    setIsGenerating(true);
    const newResults: TOTPResult[] = [];
    let skipped = 0;

    for (const line of lines) {
      const normalized = line.replace(/[\s-]/g, '').toUpperCase();
      if (results.some((r) => r.secret.replace(/[\s-]/g, '').toUpperCase() === normalized)) {
        skipped++;
        continue;
      }
      const code = await generateTOTP(line);
      if (code) newResults.push({ secret: line, code, timestamp: Date.now() });
    }

    setIsGenerating(false);

    if (newResults.length === 0) {
      toast.error(skipped > 0 ? 'All secrets already in the list' : 'No valid secret keys found');
      return;
    }

    setResults((prev) => [...prev, ...newResults]);
    setSecretInput('');
    toast.success(`Generated ${newResults.length} code${newResults.length > 1 ? 's' : ''}`);
  }, [secretInput, results]);

  // Global paste: Ctrl+V anywhere (when not focused in textarea)
  useEffect(() => {
    function onGlobalPaste(e: ClipboardEvent) {
      if (document.activeElement === textareaRef.current) return;
      const text = e.clipboardData?.getData('text')?.trim() || '';
      if (!text) return;
      e.preventDefault();
      setSecretInput(text);
      handleGetCode(text);
    }
    window.addEventListener('paste', onGlobalPaste);
    return () => window.removeEventListener('paste', onGlobalPaste);
  }, [handleGetCode]);

  function handleCopy(text: string, index: number) {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    toast.success('Copied!');
    setTimeout(() => setCopiedIndex(null), 2000);
  }

  function normalizeSecret(secret: string) {
    return secret.replace(/[\s-]/g, '').toLowerCase();
  }

  function handleCopySecret(secret: string, idx: number) {
    handleCopy(normalizeSecret(secret), idx + 2000);
  }

  function handleCopyCode(code: string, idx: number) {
    handleCopy(code, idx + 1000);
  }

  function handleDelete(idx: number) {
    setResults((prev) => prev.filter((_, i) => i !== idx));
  }

  function handleClearAll() {
    setResults([]);
  }

  const progressPercent = (timeRemaining / 30) * 100;
  const isExpiringSoon = timeRemaining <= 5;

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <Shield className="h-6 w-6 text-primary animate-pulse" />
      </div>
    );
  }

  return (
    <>
      <Toaster position="top-center" richColors />

      {/* Header */}
      <header className="border-b border-border sticky top-0 z-50 bg-background/90 backdrop-blur-sm">
        <div className="px-3 py-2.5 flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 border border-primary/20 shrink-0">
            <Shield className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-sm text-primary leading-tight truncate">
              2FA TOTP Authenticator
            </h1>
          </div>
          <button
            onClick={toggleTheme}
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            className="h-7 w-7 rounded-md border border-border hover:bg-muted transition-colors flex items-center justify-center text-muted-foreground hover:text-foreground shrink-0"
          >
            {isDark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
          </button>
        </div>
      </header>

      <main className="px-3 py-3 space-y-3">

        {/* Input section */}
        <div className="rounded-lg border border-border bg-card p-3 space-y-2">
          <div className="flex gap-2 items-start">
            <textarea
              ref={textareaRef}
              rows={2}
              placeholder={"JBSWY3DPEHPK3PXP\nor paste multiple secrets, one per line"}
              value={secretInput}
              onChange={(e) => setSecretInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.ctrlKey) {
                  e.preventDefault();
                  handleGetCode();
                }
              }}
              className="flex-1 rounded-md border border-input bg-background px-2.5 py-1.5 text-xs font-mono ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
              autoComplete="off"
              spellCheck={false}
              aria-label="2FA secret key input"
            />
            <button
              onClick={() => handleGetCode()}
              disabled={isGenerating}
              className="h-9 px-3 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 shrink-0 flex items-center gap-1.5"
            >
              <KeyRound className="h-3.5 w-3.5" />
              Get Code
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            Ctrl+V to auto-paste &amp; generate. Ctrl+Enter to submit.
          </p>
        </div>

        {/* Results section */}
        {results.length > 0 && (
          <div className="rounded-lg border border-border bg-card p-3 space-y-2 animate-fade-in">
            {/* Header row */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-xs">Codes</span>
                {/* Countdown */}
                <div className={cn(
                  'flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs transition-colors',
                  isExpiringSoon ? 'bg-destructive/20 text-destructive' : 'bg-secondary text-secondary-foreground'
                )}>
                  <Clock className={cn('h-3 w-3', isExpiringSoon && 'animate-pulse')} />
                  <span className="font-mono font-medium">{timeRemaining}s</span>
                  <div className="w-10 h-1 bg-muted rounded-full overflow-hidden">
                    <div
                      className={cn('h-full transition-all duration-1000 ease-linear', isExpiringSoon ? 'bg-destructive' : 'bg-primary')}
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>
              </div>
              <div className="flex gap-1.5 items-center">
                {/* View toggle */}
                <div className="flex rounded-md border border-border overflow-hidden">
                  <button
                    onClick={() => setView('list')}
                    title="List view"
                    className={cn('h-6 px-2 text-xs flex items-center gap-1 transition-colors', viewMode === 'list' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground')}
                  >
                    <LayoutList className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => setView('grid')}
                    title="Grid view"
                    className={cn('h-6 px-2 text-xs flex items-center gap-1 transition-colors border-l border-border', viewMode === 'grid' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground')}
                  >
                    <LayoutGrid className="h-3 w-3" />
                  </button>
                </div>
                <button
                  onClick={regenerateCodes}
                  className="h-6 px-2 rounded-md border border-border text-xs font-medium hover:bg-muted transition-colors flex items-center gap-1"
                  title="Refresh codes"
                >
                  <RefreshCw className="h-3 w-3" />
                </button>
                <button
                  onClick={handleClearAll}
                  className="h-6 px-2 rounded-md border border-border text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors flex items-center gap-1"
                  title="Clear all"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>

            {/* List view */}
            {viewMode === 'list' && (
              <div className="space-y-1">
                {results.map((result, idx) => (
                  <div
                    key={`${result.secret}-${idx}`}
                    className={cn(
                      'flex items-center gap-1.5 px-2 py-1.5 rounded-md bg-secondary/50 border transition-colors',
                      isExpiringSoon ? 'border-destructive/40' : 'border-border'
                    )}
                  >
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-[10px] font-bold">
                      {idx + 1}
                    </span>
                    <code className="flex-1 font-mono text-[10px] text-muted-foreground truncate min-w-0">
                      {normalizeSecret(result.secret)}
                    </code>
                    <span
                      onClick={() => handleCopyCode(result.code, idx)}
                      title="Click to copy"
                      className={cn(
                        'font-mono text-sm font-bold tracking-widest cursor-pointer select-none hover:opacity-70 shrink-0 transition-opacity',
                        isExpiringSoon ? 'text-destructive animate-pulse' : 'text-primary'
                      )}
                    >
                      {result.code.slice(0, 3)}&nbsp;{result.code.slice(3)}
                    </span>
                    <button
                      onClick={() => handleCopySecret(result.secret, idx)}
                      className="h-6 px-1.5 rounded border border-border text-[10px] hover:bg-muted transition-colors flex items-center gap-0.5 shrink-0"
                      title="Copy secret"
                    >
                      {copiedIndex === idx + 2000 ? <Check className="h-2.5 w-2.5 text-success" /> : <Copy className="h-2.5 w-2.5" />}
                    </button>
                    <button
                      onClick={() => handleCopyCode(result.code, idx)}
                      className="h-6 px-1.5 rounded border border-border text-[10px] hover:bg-muted transition-colors flex items-center gap-0.5 shrink-0"
                      title="Copy code"
                    >
                      {copiedIndex === idx + 1000 ? <Check className="h-2.5 w-2.5 text-success" /> : <Copy className="h-2.5 w-2.5" />}
                    </button>
                    <button
                      onClick={() => handleDelete(idx)}
                      className="h-6 w-6 rounded hover:bg-destructive/10 transition-colors flex items-center justify-center text-muted-foreground hover:text-destructive shrink-0"
                      title="Remove"
                    >
                      <Trash2 className="h-2.5 w-2.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Grid view */}
            {viewMode === 'grid' && (
              <div className="grid grid-cols-2 gap-1.5">
                {results.map((result, idx) => (
                  <div
                    key={`${result.secret}-${idx}`}
                    className={cn(
                      'p-2 rounded-md bg-secondary/50 border flex flex-col gap-1.5',
                      isExpiringSoon ? 'border-destructive/40' : 'border-border'
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary/10 text-primary text-[10px] font-bold">
                        {idx + 1}
                      </span>
                      <button
                        onClick={() => handleDelete(idx)}
                        className="h-5 w-5 rounded hover:bg-destructive/10 transition-colors flex items-center justify-center text-muted-foreground hover:text-destructive"
                        title="Remove"
                      >
                        <Trash2 className="h-2.5 w-2.5" />
                      </button>
                    </div>
                    <div
                      onClick={() => handleCopyCode(result.code, idx)}
                      title="Click to copy"
                      className={cn(
                        'font-mono text-xl font-bold tracking-widest text-center cursor-pointer select-none hover:opacity-70 transition-opacity',
                        isExpiringSoon ? 'text-destructive animate-pulse' : 'text-primary'
                      )}
                    >
                      {result.code.slice(0, 3)}&nbsp;{result.code.slice(3)}
                    </div>
                    <code className="font-mono text-[10px] text-muted-foreground text-center truncate">
                      {normalizeSecret(result.secret)}
                    </code>
                    <div className="flex gap-1 justify-center">
                      <button
                        onClick={() => handleCopySecret(result.secret, idx)}
                        className="h-6 px-1.5 rounded border border-border text-[10px] hover:bg-muted transition-colors flex items-center gap-0.5"
                        title="Copy secret"
                      >
                        {copiedIndex === idx + 2000 ? <Check className="h-2.5 w-2.5 text-success" /> : <Copy className="h-2.5 w-2.5" />}
                        <span>Secret</span>
                      </button>
                      <button
                        onClick={() => handleCopyCode(result.code, idx)}
                        className="h-6 px-1.5 rounded border border-border text-[10px] hover:bg-muted transition-colors flex items-center gap-0.5"
                        title="Copy code"
                      >
                        {copiedIndex === idx + 1000 ? <Check className="h-2.5 w-2.5 text-success" /> : <Copy className="h-2.5 w-2.5" />}
                        <span>Code</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </main>
    </>
  );
}
