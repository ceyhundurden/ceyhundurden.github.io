# Brain — Mimari

Herkese açık, sonsuz bir tuval üzerinde gezilebilen kişisel zihin haritası.
Uzun yazı yok; kısa anekdotlardan oluşan, birbirine bağlı düğümler var.

## 1. Teknoloji

Yayın adresi: **https://ceyhundurden.github.io** (repo `ceyhundurden/ceyhundurden.github.io`, public).

| Katman | Seçim | Neden |
|---|---|---|
| Framework | Next.js 15 + TypeScript, `output: "export"` (tamamen statik) | GitHub Pages sunucu çalıştıramaz; sadece statik dosya sunar |
| Tuval | HTML5 Canvas 2D + kendi kamera sistemimiz | Binlerce düğümde akıcı; mercek (fisheye) efektini piksel seviyesinde uygulayabilmek için |
| UI katmanı | React + düz CSS (CSS Modules) | Paneller, formlar, popover'lar canvas'ın üstünde DOM olarak |
| Veri | Repodaki `public/brain.json` | Tek doğruluk kaynağı. Ziyaretçi statik dosyayı okur |
| Yazma | Tarayıcıdan GitHub Contents API ile `public/brain.json`'a commit | Sunucusuz admin paneli |
| Yetki | Fine-grained GitHub token (yalnızca bu repo, Contents: read/write), tarayıcıda `localStorage` | Parola kontrolü yapacak sunucu yok; yetkiyi GitHub'ın kendisi uygular |
| Yayın | GitHub Actions: `main`'e her push'ta build edip Pages'e deploy eder | Admin commit'i ≈1 dk içinde canlıya çıkar |

### Kaydetme akışı
1. Düzenleme modunda grafın çalışan kopyası tarayıcıda tutulur. Her değişiklik anında ekrana yansır.
2. Son değişiklikten 3 sn sonra tüm `brain.json` tek commit olarak gönderilir (`sha` ile).
   Sha uyuşmazlığında (409/422) dosya yeniden çekilir ve tekrar denenir.
3. Durum göstergesi: *Kaydedilmemiş değişiklik → Kaydediliyor → Kaydedildi · ~1 dk içinde yayında*.
   Kaydedilmemiş değişiklik varken sayfadan çıkılırsa uyarı verilir.
4. Admin modunda veri, en güncel hali için GitHub API'den okunur. Ziyaretçiler `/brain.json`'u okur.

## 2. Veri modeli

```ts
type NodeKind = "main" | "sub";

interface BrainNode {
  id: string;
  kind: NodeKind;          // ana modül / alt modül
  title: string;
  x: number; y: number;    // dünya koordinatı (sınırsız)
  color?: string;          // ana modül rengi; alt modüller ebeveynden miras alır
  blocks: ContentBlock[];  // girdiler
  createdAt: string; updatedAt: string;
}

type ContentBlock =
  | { id: string; type: "text";  text: string }                 // kısa anekdot
  | { id: string; type: "quote"; text: string; source?: string }
  | { id: string; type: "link";  url: string; title?: string; note?: string }
  | { id: string; type: "image"; url: string; caption?: string }
  | { id: string; type: "video"; url: string; caption?: string } // YouTube/Vimeo embed
  | { id: string; type: "code";  code: string; lang?: string };

type EdgeKind = "child" | "link";   // child = hiyerarşi (düz çizgi), link = bağıntı (kesikli)

interface BrainEdge { id: string; source: string; target: string; kind: EdgeKind; label?: string }

interface Graph { nodes: BrainNode[]; edges: BrainEdge[] }
```

## 3. API

API sunucusu yok. İstemci tarafında bir `Backend` arayüzü var:

- `StaticBackend` (ziyaretçi): `GET /brain.json` ile salt okunur erişim
- `GitHubBackend` (admin): Contents API ile `public/brain.json`'u okur (`sha` ile) ve yazar

Graf üzerindeki tüm işlemler (düğüm/kenar ekle, güncelle, sil) tarayıcıda saf
fonksiyonlarla yapılır (`src/lib/graph-ops.ts`) ve `validate.ts` ile doğrulanır.

Düğüm silinince ona bağlı kenarlar da silinir.

## 4. Tuval motoru (`src/engine/`)

- **Kamera:** `{x, y, zoom}`. Sürükleyerek kaydırma (bırakınca ataletle süzülür),
  imlece doğru tekerlek zoom'u (0.1x–4x), dokunmatikte iki parmak.
- **Sonsuzluk hissi:** Arka plan prosedüreldir, yani saklanmaz, hesaplanır. 3 parallax
  katmanında, hücre koordinatından hash'lenen deterministik "yıldız" noktaları ve çok
  hafif bir nokta ızgarası. Nereye gidilirse gidilsin boşluk devam eder, hiçbir zaman
  kenara çarpılmaz. Kenarlarda hafif vinyet, uzakta hafif sis.
- **Mercek:** İmlecin etrafında yarıçapı ~160px olan bir fisheye bozulması
  (Sarkar–Brown). Yıldızlara, kenarlara ve düğümlere ekran uzayında uygulanır.
  İmlece yakın düğümler büyür, uzaktakiler sıkışır. Kenarı ince, parlak bir halka.
  Zaman içinde yumuşak geçişle açılıp kapanır; imleç tuvalden çıkınca söner.
- **Çizim:** `requestAnimationFrame` döngüsünde ekran dışındaki düğümler atlanır.
  Ana modüller büyük ve parlayan, alt modüller küçük olur. `child` kenarlar düz ve
  hafif kavisli, `link` kenarlar kesikli çizilir.
- **Hit-test:** Ekran koordinatı → dünya koordinatı (merceğin tersiyle birlikte).

## 5. Etkileşim

**Ziyaretçi modu (herkes)**
- Kaydır / zoom yap / merceği gez.
- Düğüme tıklayınca kamera yumuşakça oraya kayar, sağda okuma paneli açılır
  (başlık, bloklar, bağlı düğümler listesi, onlara tıklayıp atlama).
- Düğümün üstüne gelince komşu ağı vurgulanır, gerisi solar.
- `/` tuşuyla arama yapılır, sonuca uçulur.

**Düzenleme modu (giriş yapınca, sağ üstte anahtar)**
- **Boşluğa tıkla** → popover açılır, başlık yazıp Enter'a basınca **ana modül** oluşur.
- **Düğümden boşluğa sürükle** (düğüm kenarındaki `+` tutamağından) → **alt modül**
  oluşur ve bir `child` kenarıyla bağlanır.
- **Düğümden düğüme sürükle** (tutamaktan) → **bağıntı** (`link` kenarı) oluşur.
- **Düğümü gövdesinden sürükle** → taşınır, bırakınca konum kaydedilir.
- **Düğüme tıkla** → sağ panel düzenleyiciye döner: başlık, renk, blok ekle/sil/sırala.
- **Kenara tıkla** → sil / etiket ver.
- `Delete` tuşu seçili öğeyi siler (onay ister). `Esc` seçimi bırakır.

## 6. Klasör yapısı

```
src/
  app/            page.tsx (tuval), login/page.tsx (token girişi)
  engine/         camera.ts, lens.ts, background.ts, renderer.ts, hittest.ts
  components/     BrainCanvas.tsx, NodePanel.tsx, BlockEditor.tsx, CreatePopover.tsx, Toolbar.tsx, Search.tsx, SaveStatus.tsx
  lib/            types.ts, graph-ops.ts, validate.ts, backend.ts (Static + GitHub)
public/brain.json
.github/workflows/deploy.yml
```
