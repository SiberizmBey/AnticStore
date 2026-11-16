import { useState, type FormEvent } from 'react';
import { AlertTriangle, Github, KeyRound } from 'lucide-react';
import { useStore } from '../context/StoreContext';

interface GitHubTokenCardProps {
  hasRateLimitError?: boolean;
  hasRepoError?: boolean;
}

export function GitHubTokenCard({
  hasRateLimitError = false,
  hasRepoError = false,
}: GitHubTokenCardProps) {
  const {
    platformInfo,
    githubTokenConfigured,
    githubTokenStorageAvailable,
    saveGitHubToken,
    clearGitHubToken,
  } = useStore();
  const [token, setToken] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    setIsSaving(true);
    try {
      await saveGitHubToken(token);
      setToken('');
      setMessage('Anahtar güvenle kaydedildi; katalog yeniden eşitlendi.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'GitHub anahtarı kaydedilemedi.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemove = async () => {
    setMessage(null);
    try {
      await clearGitHubToken();
      setMessage('GitHub anahtarı kaldırıldı.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'GitHub anahtarı kaldırılamadı.');
    }
  };

  const openTokenPage = () => {
    const url = 'https://github.com/settings/personal-access-tokens/new';
    if (window.anticStoreDesktop) {
      void window.anticStoreDesktop.openExternal(url);
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  const hasError = hasRateLimitError || hasRepoError;
  const description = hasRateLimitError
    ? 'GitHub istek sınırına ulaşıldı. Kişisel erişim anahtarı ekleyerek sürüm eşitlemesini yeniden deneyin.'
    : hasRepoError
    ? 'Bir depo bulunamıyor veya erişilemiyor. Katalogdaki githubRepo yolunu ve özel depolar için salt okunur erişim iznini kontrol edin.'
    : 'İsteğe bağlı bir anahtar, GitHub sürüm bilgilerinin daha güvenilir eşitlenmesine yardımcı olur.';

  return (
    <section
      role={hasError ? 'alert' : 'region'}
      className={`p-4 rounded-2xl border ${
        hasError ? 'bg-amber-500/10 border-amber-500/30' : 'bg-card border-subtle'
      }`}
    >
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="p-2 rounded-xl bg-inner border border-subtle shrink-0">
            {hasError ? (
              <AlertTriangle className="w-4 h-4 text-amber-400" />
            ) : (
              <Github className="w-4 h-4 accent-text" />
            )}
          </div>
          <div className="space-y-1">
            <p className="text-xs font-bold text-primary">
              {hasRateLimitError
                ? 'GitHub istek sınırına ulaşıldı'
                : hasRepoError
                ? 'Bir GitHub deposuna erişilemiyor'
                : githubTokenConfigured
                ? 'GitHub erişim anahtarı'
                : 'GitHub sürüm bilgileri'}
            </p>
            <p className="text-[11px] text-secondary leading-relaxed">
              {description} Anahtar bu cihazda şifrelenerek saklanır.
            </p>
            {!platformInfo.isDesktop && (
              <p className="text-[11px] text-muted">
                Anahtar yönetimi Koru masaüstü uygulamasında kullanılabilir.
              </p>
            )}
            {message && (
              <p className="text-[11px] text-secondary" aria-live="polite">
                {message}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-col sm:items-end gap-2 shrink-0">
          <button
            type="button"
            onClick={openTokenPage}
            className="inline-flex items-center gap-1.5 text-[11px] font-semibold accent-text hover:underline cursor-pointer"
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>GitHub’dan anahtar al</span>
          </button>
          <p className="text-[10px] text-muted">
            Yalnız katalog depolarına erişim verin; özel depolar için Contents: Read-only seçin.
          </p>
          {platformInfo.isDesktop && githubTokenStorageAvailable && (
            <form onSubmit={handleSave} className="flex flex-wrap gap-2">
              <input
                type="password"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                autoComplete="new-password"
                placeholder={githubTokenConfigured ? 'Yeni anahtar girin' : 'GitHub erişim anahtarı'}
                aria-label="GitHub kişisel erişim anahtarı"
                className="min-w-0 w-52 px-3 py-2 rounded-xl bg-input border border-input focus:border-accent focus:outline-none text-xs text-primary placeholder:text-muted"
              />
              <button
                type="submit"
                disabled={!token.trim() || isSaving}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold btn-primary-koza disabled:opacity-40 cursor-pointer"
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>{isSaving ? 'Kaydediliyor...' : 'Kaydet ve Yenile'}</span>
              </button>
              {githubTokenConfigured && (
                <button
                  type="button"
                  onClick={() => void handleRemove()}
                  className="px-3 py-2 rounded-xl bg-inner border border-subtle text-xs font-semibold text-secondary hover:text-primary cursor-pointer"
                >
                  Kaldır
                </button>
              )}
            </form>
          )}
          {platformInfo.isDesktop && !githubTokenStorageAvailable && (
            <p className="text-[11px] text-amber-400">
              Bu sistem güvenli anahtar saklamayı desteklemiyor.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
