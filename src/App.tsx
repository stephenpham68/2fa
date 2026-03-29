import { useState, useEffect, useRef, useCallback } from 'react';
import { KeyRound, Copy, RefreshCw, Trash2, Check, Clock, Shield, ChevronDown, ChevronUp, Sun, Moon, Github, LayoutList, LayoutGrid } from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { generateTOTP, getTimeRemaining } from '@/lib/totpUtils';
import { cn } from '@/lib/utils';

interface TOTPResult {
  secret: string;
  code: string;
  timestamp: number;
}

const FAQ_ITEMS = [
  {
    q: 'What is Two-Factor Authentication (2FA)?',
    a: 'Two-Factor Authentication (2FA) adds a second layer of security to your accounts. In addition to your password, you also enter a 6-digit code that changes every 30 seconds. Even if someone steals your password, they cannot log in without this time-sensitive code.',
  },
  {
    q: 'Is my 2FA secret key safe to enter here?',
    a: "Yes. All processing happens 100% in your browser using the Web Crypto API. Your secret key is never sent to any server. You can verify this by opening your browser's DevTools Network tab — no requests are made when generating codes.",
  },
  {
    q: 'How often does the 2FA code change?',
    a: 'TOTP codes refresh every 30 seconds, following the RFC 6238 standard. A countdown timer shows how many seconds remain before the current code expires. Codes with 5 seconds or less remaining are highlighted in red as a warning.',
  },
  {
    q: 'Which apps and services support TOTP 2FA?',
    a: 'TOTP is supported by thousands of services: Google, Facebook, GitHub, Twitter, Amazon, Dropbox, and most banking and crypto platforms. Compatible authenticator apps include Google Authenticator, Microsoft Authenticator, Authy, 1Password, Bitwarden, and many others.',
  },
  {
    q: 'Where do I find my 2FA secret key?',
    a: "When setting up 2FA on any website, they show a QR code AND a text secret key (usually labeled \"Secret key\" or \"Manual entry key\"). This tool uses that text secret key. It's a Base32 string like: JBSWY3DPEHPK3PXP.",
  },
];

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-muted/50 transition-colors"
        aria-expanded={open}
      >
        <h3 className="font-medium text-sm sm:text-base pr-4">{q}</h3>
        {open ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
      </button>
      {open && (
        <div className="px-5 pb-4 text-sm text-muted-foreground leading-relaxed border-t border-border pt-3">
          {a}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [secretInput, setSecretInput] = useState('');
  const [results, setResults] = useState<TOTPResult[]>([]);
  const [timeRemaining, setTimeRemaining] = useState(getTimeRemaining());
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>(
    () => (localStorage.getItem('2fa-view') as 'list' | 'grid') || 'grid'
  );
  const [isDark, setIsDark] = useState(
    () => document.documentElement.classList.contains('dark')
  );
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function setView(mode: 'list' | 'grid') {
    setViewMode(mode);
    localStorage.setItem('2fa-view', mode);
  }

  function toggleTheme() {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('2fa-theme', next ? 'dark' : 'light');
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
  }, [results.length, regenerateCodes]);

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
      if (code) {
        newResults.push({ secret: line, code, timestamp: Date.now() });
      }
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

  // Global paste: Ctrl+V anywhere on the page (when not focused in textarea)
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
    toast.success('Copied to clipboard');
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

  return (
    <>
      <Toaster position="top-right" richColors />

      {/* Header */}
      <header className="border-b border-border sticky top-0 z-50 bg-background/90 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-4 py-3 sm:py-4 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 border border-primary/20 shrink-0">
            <Shield className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <h1 className="font-bold text-base sm:text-lg text-primary leading-tight">
              Free 2FA Code Generator
            </h1>
            <p className="text-xs text-muted-foreground hidden sm:block">
              TOTP Authenticator Online &mdash; 100% browser-based, RFC 6238
            </p>
          </div>
          <button
            onClick={toggleTheme}
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            className="h-9 w-9 rounded-lg border border-border hover:bg-muted transition-colors flex items-center justify-center text-muted-foreground hover:text-foreground"
          >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-8">

        {/* Tool Card */}
        <section aria-label="2FA Code Generator">
          <div className="rounded-xl border border-border bg-card p-6 space-y-4">
            <div className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-primary" />
              <h2 className="font-semibold text-lg">Generate 2FA Code</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              Enter your TOTP secret key (Base32) to instantly generate a 6-digit 2FA code.
              Supports Google Authenticator, Authy, Microsoft Authenticator, and any TOTP-compatible app.
            </p>

            {/* Textarea + Button */}
            <div className="flex gap-2 items-start">
              <textarea
                ref={textareaRef}
                rows={3}
                placeholder={"e.g., JBSWY3DPEHPK3PXP\nor paste multiple secrets, one per line"}
                value={secretInput}
                onChange={(e) => setSecretInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && e.ctrlKey) {
                    e.preventDefault();
                    handleGetCode();
                  }
                }}
                className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm font-mono ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
                autoComplete="off"
                spellCheck={false}
                aria-label="2FA secret key input"
              />
              <button
                onClick={() => handleGetCode()}
                disabled={isGenerating}
                className="h-10 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 shrink-0 flex items-center gap-2 mt-0"
              >
                <KeyRound className="h-4 w-4" />
                <span className="hidden sm:inline">Get Code</span>
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Paste anywhere on the page (Ctrl+V) to auto-generate. Multiple secrets: one per line. Ctrl+Enter to submit.
            </p>
          </div>
        </section>

        {/* Results */}
        {results.length > 0 && (
          <section aria-label="Generated 2FA codes" className="animate-fade-in">
            <div className="rounded-xl border border-border bg-card p-6 space-y-4">
              {/* Header row */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-sm">Generated Codes</span>
                  {/* Countdown */}
                  <div className={cn(
                    'flex items-center gap-2 px-3 py-1 rounded-full text-xs transition-colors',
                    isExpiringSoon ? 'bg-destructive/20 text-destructive' : 'bg-secondary text-secondary-foreground'
                  )}>
                    <Clock className={cn('h-3 w-3', isExpiringSoon && 'animate-pulse')} />
                    <span className="font-mono font-medium">{timeRemaining}s</span>
                    <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className={cn('h-full transition-all duration-1000 ease-linear', isExpiringSoon ? 'bg-destructive' : 'bg-primary')}
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 items-center">
                  {/* View toggle */}
                  <div className="flex rounded-md border border-border overflow-hidden">
                    <button
                      onClick={() => setView('list')}
                      title="List view"
                      className={cn('h-8 px-2.5 text-xs flex items-center gap-1.5 transition-colors', viewMode === 'list' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground')}
                    >
                      <LayoutList className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">List</span>
                    </button>
                    <button
                      onClick={() => setView('grid')}
                      title="Grid view"
                      className={cn('h-8 px-2.5 text-xs flex items-center gap-1.5 transition-colors border-l border-border', viewMode === 'grid' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground')}
                    >
                      <LayoutGrid className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Grid</span>
                    </button>
                  </div>
                  <button
                    onClick={() => {
                      const all = results.map((r) => `${normalizeSecret(r.secret)} ${r.code}`).join('\n');
                      navigator.clipboard.writeText(all);
                      toast.success(`Copied ${results.length} codes`);
                    }}
                    className="h-8 px-3 rounded-md border border-border text-xs font-medium hover:bg-muted transition-colors flex items-center gap-1.5"
                    title="Copy all codes"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Copy All
                  </button>
                  <button
                    onClick={regenerateCodes}
                    className="h-8 px-3 rounded-md border border-border text-xs font-medium hover:bg-muted transition-colors flex items-center gap-1.5"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Refresh
                  </button>
                  <button
                    onClick={handleClearAll}
                    className="h-8 px-3 rounded-md border border-border text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors flex items-center gap-1.5"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Clear All
                  </button>
                </div>
              </div>

              {/* Results — List view */}
              {viewMode === 'list' && (
                <div className="space-y-1.5">
                  {results.map((result, idx) => (
                    <div
                      key={`${result.secret}-${idx}`}
                      className={cn('flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary/50 border transition-colors', isExpiringSoon ? 'border-destructive/40' : 'border-border')}
                    >
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
                        {idx + 1}
                      </span>
                      <code className="flex-1 font-mono text-xs text-muted-foreground truncate min-w-0">
                        {normalizeSecret(result.secret)}
                      </code>
                      <span
                        onClick={() => handleCopyCode(result.code, idx)}
                        title="Click to copy code"
                        className={cn('font-mono text-base font-bold tracking-widest cursor-pointer select-none hover:opacity-70 shrink-0 transition-opacity', isExpiringSoon ? 'text-destructive animate-pulse' : 'text-primary')}
                      >
                        {result.code.slice(0, 3)}&nbsp;{result.code.slice(3)}
                      </span>
                      <button
                        onClick={() => handleCopySecret(result.secret, idx)}
                        className="h-7 px-2 rounded border border-border text-xs hover:bg-muted transition-colors flex items-center gap-1 shrink-0"
                        title="Copy secret"
                      >
                        {copiedIndex === idx + 2000 ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
                        <span className="hidden sm:inline">Secret</span>
                      </button>
                      <button
                        onClick={() => handleCopyCode(result.code, idx)}
                        className="h-7 px-2 rounded border border-border text-xs hover:bg-muted transition-colors flex items-center gap-1 shrink-0"
                        title="Copy code"
                      >
                        {copiedIndex === idx + 1000 ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
                        <span className="hidden sm:inline">Code</span>
                      </button>
                      <button
                        onClick={() => handleDelete(idx)}
                        className="h-7 w-7 rounded hover:bg-destructive/10 transition-colors flex items-center justify-center text-muted-foreground hover:text-destructive shrink-0"
                        title="Remove"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Results — Grid view */}
              {viewMode === 'grid' && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                  {results.map((result, idx) => (
                    <div
                      key={`${result.secret}-${idx}`}
                      className={cn('p-3 rounded-lg bg-secondary/50 border flex flex-col gap-2', isExpiringSoon ? 'border-destructive/40' : 'border-border')}
                    >
                      {/* Top: badge + delete */}
                      <div className="flex items-center justify-between">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold shrink-0">
                          {idx + 1}
                        </span>
                        <button
                          onClick={() => handleDelete(idx)}
                          className="h-6 w-6 rounded hover:bg-destructive/10 transition-colors flex items-center justify-center text-muted-foreground hover:text-destructive"
                          title="Remove"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                      {/* Big OTP code */}
                      <div
                        onClick={() => handleCopyCode(result.code, idx)}
                        title="Click to copy code"
                        className={cn('font-mono text-2xl font-bold tracking-widest text-center cursor-pointer select-none hover:opacity-70 transition-opacity', isExpiringSoon ? 'text-destructive animate-pulse' : 'text-primary')}
                      >
                        {result.code.slice(0, 3)}&nbsp;{result.code.slice(3)}
                      </div>
                      {/* Secret truncated */}
                      <code className="font-mono text-xs text-muted-foreground text-center truncate">
                        {normalizeSecret(result.secret)}
                      </code>
                      {/* Action buttons */}
                      <div className="flex gap-1 justify-center">
                        <button
                          onClick={() => handleCopySecret(result.secret, idx)}
                          className="h-7 px-2 rounded border border-border text-xs hover:bg-muted transition-colors flex items-center gap-1"
                          title="Copy secret"
                        >
                          {copiedIndex === idx + 2000 ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
                          Secret
                        </button>
                        <button
                          onClick={() => handleCopyCode(result.code, idx)}
                          className="h-7 px-2 rounded border border-border text-xs hover:bg-muted transition-colors flex items-center gap-1"
                          title="Copy code"
                        >
                          {copiedIndex === idx + 1000 ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
                          Code
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {/* How to Use */}
        <section id="how-it-works" aria-labelledby="how-title">
          <div className="rounded-xl border border-border bg-card/50 p-6 space-y-4">
            <h2 id="how-title" className="font-semibold text-lg">How to Generate 2FA Codes</h2>
            <ol className="space-y-3 text-sm text-muted-foreground list-none">
              {[
                { step: '1', text: 'Go to the security settings of your account (Google, GitHub, etc.) and enable Two-Factor Authentication.' },
                { step: '2', text: 'When shown a QR code, look for the option "Can\'t scan? Enter manually" to reveal the text secret key.' },
                { step: '3', text: 'Copy that Base32 secret key and paste it into the input field above.' },
                { step: '4', text: 'Click "Get Code" to instantly generate your 6-digit TOTP code. The code auto-refreshes every 30 seconds.' },
              ].map(({ step, text }) => (
                <li key={step} className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
                    {step}
                  </span>
                  <span className="leading-relaxed pt-0.5">{text}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* About TOTP */}
        <section id="about" aria-labelledby="about-title">
          <div className="rounded-xl border border-border bg-card/50 p-6 space-y-3">
            <h2 id="about-title" className="font-semibold text-lg">What is TOTP Two-Factor Authentication?</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              <strong className="text-foreground">TOTP (Time-based One-Time Password)</strong> is a widely adopted security standard
              defined in <a href="https://datatracker.ietf.org/doc/html/rfc6238" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">RFC 6238</a>.
              It generates a unique 6-digit code every 30 seconds using your secret key combined with the current time,
              processed through HMAC-SHA1 cryptography.
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              This tool runs entirely in your browser — the Web Crypto API handles all cryptographic operations locally.
              No secret keys or codes are ever transmitted to any server, making it safe even for sensitive accounts.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
              {[
                { label: 'Algorithm', value: 'HMAC-SHA1' },
                { label: 'Standard', value: 'RFC 6238' },
                { label: 'Code length', value: '6 digits' },
                { label: 'Time window', value: '30 seconds' },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-lg bg-secondary/50 px-3 py-2 text-center">
                  <div className="text-xs text-muted-foreground">{label}</div>
                  <div className="font-mono font-semibold text-sm text-primary">{value}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" aria-labelledby="faq-title">
          <h2 id="faq-title" className="font-semibold text-lg mb-4">Frequently Asked Questions</h2>
          <div className="space-y-2">
            {FAQ_ITEMS.map((item) => (
              <FaqItem key={item.q} q={item.q} a={item.a} />
            ))}
          </div>
        </section>

      </main>

      {/* Footer */}
      <footer className="border-t border-border mt-12">
        <div className="max-w-4xl mx-auto px-4 py-6 text-center text-xs text-muted-foreground space-y-2">
          <p>
            Free 2FA Code Generator &mdash; TOTP Authenticator Online
          </p>
          <p>
            All cryptographic operations run locally in your browser. No data is stored or transmitted.
          </p>
          <a
            href="https://github.com/stephenpham68/2fa"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors"
          >
            <Github className="h-3.5 w-3.5" />
            Open source on GitHub
          </a>
        </div>
      </footer>
    </>
  );
}
