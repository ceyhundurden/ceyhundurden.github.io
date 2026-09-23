# Brain

Herkese açık, sonsuz ve karanlık bir tuval üzerinde gezilebilen dijital zihin haritası.
Ana modüller, alt modüller ve aralarındaki bağlar; her düğümde kısa notlar
(anekdot, alıntı, bağlantı, görsel, video, kod). Mimari için bkz. `ARCHITECTURE.md`.

Yayın adresi: **https://ceyhundurden.github.io**

## Nasıl çalışır

Site tamamen statiktir (Next.js `output: "export"`), GitHub Pages'ten sunulur; sunucu yoktur.

- **Veri:** repodaki `public/brain.json` tek doğruluk kaynağıdır. Ziyaretçiler bu statik
  dosyayı okur.
- **Düzenleme:** giriş yapınca tarayıcı, veriyi doğrudan GitHub API'den (en güncel hali)
  okur. Yaptığın her değişiklik anında ekrana yansır; son değişiklikten 3 sn sonra tüm
  `brain.json` tek bir commit olarak `main`'e gönderilir (`Ctrl+S` ile hemen kaydedebilirsin).
  Sağ üstteki gösterge durumu söyler: *Kaydedilmemiş değişiklik → Kaydediliyor… →
  Kaydedildi · ~1 dk içinde yayında*. Kaydetme başarısız olursa değişiklikler tarayıcıda
  kalır, **Tekrar dene** ile yeniden gönderilir. Kaydedilmemiş değişiklik varken sayfadan
  çıkmaya çalışırsan tarayıcı uyarır.
- **Yayın:** `main`'e her push'ta GitHub Actions (`.github/workflows/deploy.yml`) siteyi
  derleyip Pages'e yükler. Yani admin commit'i yaklaşık 1 dakika içinde canlıya çıkar.
- **Yetki:** parola yok; yetkiyi GitHub'ın kendisi uygular. Giriş, yalnızca bu repoya
  yazabilen bir fine-grained token ile yapılır. Token yalnızca tarayıcının `localStorage`'ında
  (`brain.gh-token`) durur, **Çıkış** ile silinir.

## Token oluşturma

1. https://github.com/settings/personal-access-tokens/new adresine git.
2. Bir ad ve süre ver (ör. 90 gün).
3. **Repository access** → **Only select repositories** → `ceyhundurden.github.io`.
4. **Permissions** → **Repository permissions** → **Contents: Read and write**
   (Metadata: Read-only otomatik eklenir). Başka izin verme.
5. **Generate token**, çıkan `github_pat_…` değerini kopyala.
6. Sitede sağ üstteki **Giriş** → token'ı yapıştır → **Giriş yap**.

Token'ın süresi dolarsa ya da iptal edilirse site bunu açılışta fark eder, token'ı siler ve
seni salt okunur moda düşürür; yeni bir token ile tekrar giriş yapman yeterli.

## Yerel geliştirme

```bash
npm install
npm run dev        # http://localhost:3000
```

Ziyaretçi modunda veri `public/brain.json`'dan okunur.

> **Dikkat:** yerelde de giriş yaparsan düzenlemeler doğrudan **canlı repoya** commit edilir
> (GitHub API'ye yazılır, yerel dosyaya değil) ve ~1 dk sonra siteye çıkar. Sadece arayüz
> denemesi yapacaksan giriş yapma. Yerel `public/brain.json` ile repodaki arasında fark
> oluşursa push'tan önce `git pull` yap.

Statik çıktıyı üretmek için: `npm run build` → `out/` klasörü (istersen `npx serve out` ile
bak). Kod kalitesi: `npm run lint`, `npx tsc --noEmit`.

## Yayın akışı

1. GitHub'da `ceyhundurden/ceyhundurden.github.io` reposu (public) ve bu projeyi `main`
   dalına push et.
2. Repo → **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Her push'ta (ya da Actions sekmesinden **Run workflow** ile) site derlenir ve yayınlanır.
4. İçerik düzenlemeleri de birer commit olduğundan aynı akışla yayına çıkar; kod değiştirmeden
   önce `git pull` ile bu commit'leri yerele çekmeyi unutma.

## Kullanım

**Herkes:** sürükleyerek gezin (bırakınca süzülür), tekerlek / iki parmakla yakınlaş,
imlecin etrafındaki mercekle yakından bak. Düğüme tıkla → sağda okuma paneli açılır.
`/` ile ara, Enter ile modüle uç. Adres çubuğundaki `#düğüm-id` ile bir modüle doğrudan
bağlantı verilebilir.

**Düzenleme modu:** sağ üstteki **Giriş** → token → **Düzenle** anahtarını aç (kısayol `E`).

- **Boşluğa tıkla** → başlık yaz, Enter → yeni ana modül.
- Düğümün kenarındaki **+** tutamağını **boşluğa sürükle** → alt modül (adını yazıp Enter).
- **+** tutamağını **başka bir düğüme sürükle** → bağıntı (kesikli çizgi).
- **Düğümü gövdesinden sürükle** → taşı; bırakınca konum kaydedilir.
- **Düğüme tıkla** → panelde başlık, renk (ana modüller) ve bloklar düzenlenir; değişiklikler
  otomatik kaydedilir.
- **Kenara tıkla** → etiket ver ya da sil.
- `Delete` seçili düğümü / bağlantıyı siler (onay ister), `Esc` seçimi bırakır, `Ctrl+S` hemen kaydeder.

## Yedek

Tüm veri `public/brain.json`'dadır ve her değişiklik bir git commit'idir; geçmiş sürümlere
repo geçmişinden dönülebilir.
