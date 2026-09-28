    // =========================================================
    // Lot 5 — Bibliothèque d'assets pour les onglets Textures/Cubemaps/
    // Volumes/Vidéos/Music du picker (Lot 4). L'onglet Misc n'est PAS ici
    // (câblé en direct sur pass-registry.js depuis le Lot 4 — Buffers A-D/
    // Cubemap A/entrées spéciales, pas des assets de bibliothèque).
    //
    // Aucun fichier téléchargé : pas d'accès réseau dans cet environnement
    // pour récupérer les vraies textures/cubemaps shadertoy.com (Bayer,
    // Blue Noise, Forest, St. Peter's Basilica, Uffizi Gallery, etc. sont
    // des fichiers propriétaires de toute façon, cf. note "Vidéos et
    // Music" de la roadmap qui s'applique tout autant ici). Chaque asset
    // texture/cubemap/volume est donc généré PROCÉDURALEMENT en Canvas 2D
    // — exactement la recommandation déjà écrite dans la roadmap pour le
    // bruit ("le bruit peut être généré en JS/canvas à la volée plutôt que
    // téléchargé, pour rester léger"), étendue ici à tous les types
    // d'assets de ce lot faute d'alternative. Les noms reprennent ceux
    // listés dans la roadmap (fidélité du picker demandée) mais `author`
    // indique clairement "BS Shader Studio (procédural)" plutôt que "by
    // shadertoy" : ce ne sont PAS les fichiers réels de shadertoy.com, les
    // attribuer à shadertoy serait trompeur (même principe de prudence que
    // la note Vidéos/Music de la roadmap, appliqué par cohérence ici).
    //
    // Chargement réel (canvas → THREE.Texture/CubeTexture/Data3DTexture,
    // avec cache) : asset-loader.js, chargé juste après ce fichier.
    // =========================================================

    // -------------------------------------------------------------------
    // Générateurs de textures 2D : function(ctx, w, h) qui dessine dans un
    // contexte Canvas 2D déjà dimensionné. Utilisés à deux tailles : petite
    // (vignette du picker, cf. makeThumbnailDataUrl plus bas) et pleine
    // résolution (asset-loader.js, au moment où l'asset est réellement
    // branché sur un iChannel).
    // -------------------------------------------------------------------
    const ASSET_TEXTURE_DRAWERS = {
        abstract1(ctx, w, h) {
            const grad = ctx.createRadialGradient(w * 0.3, h * 0.35, 0, w * 0.3, h * 0.35, w * 0.9);
            grad.addColorStop(0, "#f0d28f"); grad.addColorStop(0.5, "#d9694a"); grad.addColorStop(1, "#2a1410");
            ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);
            for (let i = 0; i < 14; i++) {
                ctx.beginPath();
                ctx.arc(seededRand(i, 1) * w, seededRand(i, 2) * h, seededRand(i, 3) * w * 0.18 + 4, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(255,255,255,${0.05 + seededRand(i, 4) * 0.12})`;
                ctx.fill();
            }
        },
        abstract2(ctx, w, h) {
            ctx.fillStyle = "#101216"; ctx.fillRect(0, 0, w, h);
            const bands = 9;
            for (let i = 0; i < bands; i++) {
                ctx.save();
                ctx.translate(w * (i / bands), 0);
                ctx.rotate(-0.35);
                const hue = 170 + i * 8;
                ctx.fillStyle = `hsl(${hue},55%,${30 + (i % 3) * 12}%)`;
                ctx.fillRect(-w * 0.2, -h * 0.3, w / bands * 1.6, h * 1.8);
                ctx.restore();
            }
        },
        abstract3(ctx, w, h) {
            ctx.fillStyle = "#1c1024"; ctx.fillRect(0, 0, w, h);
            for (let i = 0; i < 10; i++) {
                const cx = seededRand(i, 11) * w, cy = seededRand(i, 12) * h, r = seededRand(i, 13) * w * 0.22 + w * 0.04;
                const sides = 3 + Math.floor(seededRand(i, 14) * 4);
                ctx.beginPath();
                for (let s = 0; s <= sides; s++) {
                    const a = (s / sides) * Math.PI * 2;
                    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
                    s === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
                }
                ctx.closePath();
                ctx.fillStyle = i % 2 === 0 ? "rgba(240,210,143,0.65)" : "rgba(217,105,74,0.55)";
                ctx.fill();
            }
        },
        bayer(ctx, w, h) {
            const m = [
                [0, 8, 2, 10], [12, 4, 14, 6],
                [3, 11, 1, 9], [15, 7, 13, 5]
            ];
            const cell = Math.max(1, Math.floor(Math.min(w, h) / 32));
            for (let y = 0; y < h; y += cell) {
                for (let x = 0; x < w; x += cell) {
                    const v = m[(y / cell | 0) % 4][(x / cell | 0) % 4] / 15;
                    const g = Math.round(v * 255);
                    ctx.fillStyle = `rgb(${g},${g},${g})`;
                    ctx.fillRect(x, y, cell, cell);
                }
            }
        },
        blueNoise(ctx, w, h) {
            ctx.fillStyle = "#000"; ctx.fillRect(0, 0, w, h);
            // Approximation grossière de bruit bleu : grille jitterée
            // (un point aléatoire par cellule) plutôt qu'un vrai bruit
            // bleu (void-and-cluster) — donne un nuage de points sans
            // basses fréquences visibles, suffisant comme substitut visuel.
            const cell = Math.max(3, Math.floor(Math.min(w, h) / 48));
            let seed = 0;
            for (let y = 0; y < h; y += cell) {
                for (let x = 0; x < w; x += cell) {
                    seed++;
                    const jx = x + seededRand(seed, 21) * cell;
                    const jy = y + seededRand(seed, 22) * cell;
                    const g = Math.round(seededRand(seed, 23) * 255);
                    ctx.fillStyle = `rgb(${g},${g},${g})`;
                    ctx.beginPath();
                    ctx.arc(jx, jy, cell * 0.32, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        },
        font1(ctx, w, h) {
            ctx.fillStyle = "#000"; ctx.fillRect(0, 0, w, h);
            ctx.fillStyle = "#fff";
            ctx.textBaseline = "top";
            const cols = 16, rows = 16;
            const cw = w / cols, ch = h / rows;
            ctx.font = `${Math.floor(ch * 0.72)}px monospace`;
            for (let i = 0; i < 256; i++) {
                const cx = (i % cols) * cw, cy = Math.floor(i / cols) * ch;
                const printable = i >= 32 && i < 127;
                if (printable) ctx.fillText(String.fromCharCode(i), cx + cw * 0.12, cy + ch * 0.08);
            }
        },
        grayNoise(ctx, w, h, cellPx) {
            let n = 0;
            for (let y = 0; y < h; y += cellPx) {
                for (let x = 0; x < w; x += cellPx) {
                    const g = Math.round(seededRand(++n, 61) * 255);
                    ctx.fillStyle = `rgb(${g},${g},${g})`;
                    ctx.fillRect(x, y, cellPx, cellPx);
                }
            }
        },
        grayNoiseSmall(ctx, w, h) { ASSET_TEXTURE_DRAWERS.grayNoise(ctx, w, h, Math.max(1, Math.floor(w / 128))); },
        grayNoiseMedium(ctx, w, h) { ASSET_TEXTURE_DRAWERS.grayNoise(ctx, w, h, Math.max(2, Math.floor(w / 32))); },
        grayNoiseLarge(ctx, w, h) { ASSET_TEXTURE_DRAWERS.grayNoise(ctx, w, h, Math.max(4, Math.floor(w / 10))); },
        lichen(ctx, w, h) {
            const base = ctx.createLinearGradient(0, 0, 0, h);
            base.addColorStop(0, "#5c4a2c"); base.addColorStop(1, "#3a3020");
            ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
            for (let i = 0; i < 60; i++) {
                const cx = seededRand(i, 31) * w, cy = seededRand(i, 32) * h;
                const r = seededRand(i, 33) * w * 0.06 + w * 0.015;
                const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
                const green = seededRand(i, 34) > 0.5;
                grad.addColorStop(0, green ? "rgba(95,174,148,0.5)" : "rgba(180,170,120,0.4)");
                grad.addColorStop(1, "rgba(0,0,0,0)");
                ctx.fillStyle = grad;
                ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
            }
        },
        checker(ctx, w, h) {
            const cell = Math.max(4, Math.floor(Math.min(w, h) / 16));
            for (let y = 0; y < h; y += cell) {
                for (let x = 0; x < w; x += cell) {
                    ctx.fillStyle = ((x / cell + y / cell) % 2 === 0) ? "#e8e4da" : "#2a2d33";
                    ctx.fillRect(x, y, cell, cell);
                }
            }
        },
        stripes(ctx, w, h) {
            ctx.save();
            ctx.translate(w / 2, h / 2); ctx.rotate(-0.5); ctx.translate(-w / 2, -h / 2);
            const cell = Math.max(3, Math.floor(w / 24));
            for (let x = -h; x < w + h; x += cell) {
                ctx.fillStyle = ((x / cell | 0) % 2 === 0) ? "#c9a15a" : "#101216";
                ctx.fillRect(x, -h, cell, h * 3);
            }
            ctx.restore();
        },
        voronoiCells(ctx, w, h) {
            const seeds = [];
            for (let i = 0; i < 22; i++) seeds.push({ x: seededRand(i, 41) * w, y: seededRand(i, 42) * h, hue: seededRand(i, 43) * 360 });
            const block = Math.max(3, Math.floor(w / 96));
            for (let y = 0; y < h; y += block) {
                for (let x = 0; x < w; x += block) {
                    let best = 0, bestD = Infinity;
                    for (let s = 0; s < seeds.length; s++) {
                        const dx = seeds[s].x - x, dy = seeds[s].y - y;
                        const d = dx * dx + dy * dy;
                        if (d < bestD) { bestD = d; best = s; }
                    }
                    ctx.fillStyle = `hsl(${seeds[best].hue},40%,32%)`;
                    ctx.fillRect(x, y, block, block);
                }
            }
        }
    };

    // Petit PRNG déterministe (pas Math.random pour tout : on veut la même
    // vignette et le même asset plein format d'un appel à l'autre, sans
    // stocker de bitmap). Deux graines (i, salt) pour varier plusieurs
    // valeurs indépendantes dans une même boucle sans collision visible.
    function seededRand(i, salt) {
        const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
        return x - Math.floor(x);
    }

    // -------------------------------------------------------------------
    // Générateurs de cubemap : function(ctx, w, h, face, blurred) — face
    // ∈ "px","nx","py","ny","pz","nz". "blurred" active un flou canvas
    // (ctx.filter) pour les variantes "* Blurred" façon shadertoy.com
    // (versions pré-floutées utilisées pour l'éclairage ambiant/réflexions
    // grossières plutôt que le fond net).
    // -------------------------------------------------------------------
    function withBlur(ctx, blurred, px, draw) {
        if (blurred) ctx.filter = `blur(${px}px)`;
        draw();
        ctx.filter = "none";
    }

    const ASSET_CUBEMAP_DRAWERS = {
        forest(ctx, w, h, face, blurred) {
            withBlur(ctx, blurred, Math.max(4, w * 0.05), () => {
                if (face === "py") {
                    const g = ctx.createLinearGradient(0, 0, 0, h);
                    g.addColorStop(0, "#bfe4f2"); g.addColorStop(1, "#e9f5e0");
                    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
                } else if (face === "ny") {
                    const g = ctx.createLinearGradient(0, 0, 0, h);
                    g.addColorStop(0, "#4a3a22"); g.addColorStop(1, "#2b2013");
                    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
                } else {
                    const g = ctx.createLinearGradient(0, 0, 0, h);
                    g.addColorStop(0, "#bfe4f2"); g.addColorStop(0.45, "#5c8a4a"); g.addColorStop(1, "#274022");
                    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
                    for (let i = 0; i < 18; i++) {
                        ctx.fillStyle = `rgba(30,60,25,${0.2 + seededRand(i, 51) * 0.3})`;
                        ctx.fillRect(seededRand(i, 52) * w, h * 0.4 + seededRand(i, 53) * h * 0.6, w * 0.03, h * (0.2 + seededRand(i, 54) * 0.4));
                    }
                }
            });
        },
        stPeters(ctx, w, h, face, blurred) {
            withBlur(ctx, blurred, Math.max(4, w * 0.05), () => {
                if (face === "py") {
                    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w * 0.7);
                    g.addColorStop(0, "#fff2cf"); g.addColorStop(1, "#7a5a2c");
                    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
                } else if (face === "ny") {
                    const g = ctx.createLinearGradient(0, 0, 0, h);
                    g.addColorStop(0, "#8a7050"); g.addColorStop(1, "#4a3a26");
                    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
                } else {
                    const g = ctx.createLinearGradient(0, 0, 0, h);
                    g.addColorStop(0, "#d9b978"); g.addColorStop(0.6, "#a9814c"); g.addColorStop(1, "#5c4526");
                    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
                }
            });
        },
        uffizi(ctx, w, h, face, blurred) {
            withBlur(ctx, blurred, Math.max(4, w * 0.05), () => {
                if (face === "py") {
                    const g = ctx.createLinearGradient(0, 0, 0, h);
                    g.addColorStop(0, "#f2ede0"); g.addColorStop(1, "#c9c0a8");
                    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
                } else if (face === "ny") {
                    const g = ctx.createLinearGradient(0, 0, 0, h);
                    g.addColorStop(0, "#8a7860"); g.addColorStop(1, "#5c4e3c");
                    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
                } else {
                    const g = ctx.createLinearGradient(0, 0, 0, h);
                    g.addColorStop(0, "#e8dfc8"); g.addColorStop(1, "#a89878");
                    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
                }
            });
        }
    };

    // -------------------------------------------------------------------
    // Générateurs de volume 3D : function(size) → Uint8Array. Value-noise
    // trilinéaire simple (pas du vrai Perlin/Worley) : suffisant comme
    // substitut visuel pour Grey Noise3D/RGBA Noise3D, sans dépendance
    // externe. `channels` = 1 (R8) ou 4 (RGBA8).
    // -------------------------------------------------------------------
    function valueNoise3D(x, y, z, salt) {
        const n = x * 13.1 + y * 71.7 + z * 37.3 + salt * 999.1;
        return seededRand(Math.floor(n * 1000), Math.floor(n * 37));
    }

    const ASSET_VOLUME_GENERATORS = {
        greyNoise3D(size) {
            const data = new Uint8Array(size * size * size);
            for (let z = 0; z < size; z++)
                for (let y = 0; y < size; y++)
                    for (let x = 0; x < size; x++) {
                        data[x + y * size + z * size * size] = Math.round(valueNoise3D(x / size, y / size, z / size, 0) * 255);
                    }
            return data;
        },
        rgbaNoise3D(size) {
            const data = new Uint8Array(size * size * size * 4);
            for (let z = 0; z < size; z++)
                for (let y = 0; y < size; y++)
                    for (let x = 0; x < size; x++) {
                        const idx = (x + y * size + z * size * size) * 4;
                        for (let c = 0; c < 4; c++) {
                            data[idx + c] = Math.round(valueNoise3D(x / size, y / size, z / size, c + 1) * 255);
                        }
                    }
            return data;
        }
    };

    // -------------------------------------------------------------------
    // Métadonnées du picker. `author` volontairement PAS "shadertoy" (cf.
    // note en tête de fichier). Les items marqués "(filler)" dans leur
    // commentaire ne sont pas dans la liste nommée de la roadmap : ajoutés
    // pour que l'onglet Textures dépasse 9 items et exerce réellement la
    // pagination du Lot 4 (roadmap : "a minima les items visibles sur les
    // captures, le reste peut être un jeu de données réduit mais avec la
    // pagination fonctionnelle").
    // -------------------------------------------------------------------
    const ASSET_AUTHOR = "BS Shader Studio (procédural)";

    const TEXTURE_ASSETS = [
        { assetId: "tex_abstract1", label: "Abstract 1", author: ASSET_AUTHOR, width: 512, height: 512, channels: 3, format: "RGB8", drawer: "abstract1" },
        { assetId: "tex_abstract2", label: "Abstract 2", author: ASSET_AUTHOR, width: 512, height: 512, channels: 3, format: "RGB8", drawer: "abstract2" },
        { assetId: "tex_abstract3", label: "Abstract 3", author: ASSET_AUTHOR, width: 512, height: 512, channels: 3, format: "RGB8", drawer: "abstract3" },
        { assetId: "tex_bayer", label: "Bayer", author: ASSET_AUTHOR, width: 256, height: 256, channels: 1, format: "R8", drawer: "bayer" },
        { assetId: "tex_blue_noise", label: "Blue Noise", author: ASSET_AUTHOR, width: 256, height: 256, channels: 1, format: "R8", drawer: "blueNoise" },
        { assetId: "tex_font1", label: "Font 1", author: ASSET_AUTHOR, width: 512, height: 512, channels: 1, format: "R8", drawer: "font1" },
        { assetId: "tex_gray_noise_medium", label: "Gray Noise Medium", author: ASSET_AUTHOR, width: 256, height: 256, channels: 1, format: "R8", drawer: "grayNoiseMedium" },
        { assetId: "tex_gray_noise_small", label: "Gray Noise Small", author: ASSET_AUTHOR, width: 256, height: 256, channels: 1, format: "R8", drawer: "grayNoiseSmall" },
        { assetId: "tex_lichen", label: "Lichen", author: ASSET_AUTHOR, width: 512, height: 512, channels: 3, format: "RGB8", drawer: "lichen" },
        // -- filler, cf. commentaire ci-dessus --
        { assetId: "tex_gray_noise_large", label: "Gray Noise Large", author: ASSET_AUTHOR, width: 256, height: 256, channels: 1, format: "R8", drawer: "grayNoiseLarge" },
        { assetId: "tex_checker", label: "Checker", author: ASSET_AUTHOR, width: 256, height: 256, channels: 3, format: "RGB8", drawer: "checker" },
        { assetId: "tex_stripes", label: "Stripes", author: ASSET_AUTHOR, width: 256, height: 256, channels: 3, format: "RGB8", drawer: "stripes" },
        { assetId: "tex_voronoi_cells", label: "Voronoi Cells", author: ASSET_AUTHOR, width: 256, height: 256, channels: 3, format: "RGB8", drawer: "voronoiCells" }
    ];

    const CUBEMAP_FACE_SIZE = 256;
    const CUBEMAP_ASSETS = [
        { assetId: "cm_forest", label: "Forest", author: ASSET_AUTHOR, meta: "6 faces · 256² · RGB8", drawer: "forest", blurred: false },
        { assetId: "cm_forest_blurred", label: "Forest Blurred", author: ASSET_AUTHOR, meta: "6 faces · 256² · RGB8 · blurred", drawer: "forest", blurred: true },
        { assetId: "cm_st_peters", label: "St. Peter's Basilica", author: ASSET_AUTHOR, meta: "6 faces · 256² · RGB8", drawer: "stPeters", blurred: false },
        { assetId: "cm_st_peters_blurred", label: "St. Peter's Basilica Blurred", author: ASSET_AUTHOR, meta: "6 faces · 256² · RGB8 · blurred", drawer: "stPeters", blurred: true },
        { assetId: "cm_uffizi", label: "Uffizi Gallery", author: ASSET_AUTHOR, meta: "6 faces · 256² · RGB8", drawer: "uffizi", blurred: false },
        { assetId: "cm_uffizi_blurred", label: "Uffizi Gallery Blurred", author: ASSET_AUTHOR, meta: "6 faces · 256² · RGB8 · blurred", drawer: "uffizi", blurred: true }
    ];

    const VOLUME_SIZE = 32;
    const VOLUME_ASSETS = [
        { assetId: "vol_grey_noise3d", label: "Grey Noise3D", author: ASSET_AUTHOR, meta: `${VOLUME_SIZE}³ · R8`, generator: "greyNoise3D", channels: 1 },
        { assetId: "vol_rgba_noise3d", label: "RGBA Noise3D", author: ASSET_AUTHOR, meta: `${VOLUME_SIZE}³ · RGBA8`, generator: "rgbaNoise3D", channels: 4 }
    ];

    // -------------------------------------------------------------------
    // Vignettes : rendues une fois, à froid, dans un petit canvas hors-
    // DOM (3:2, comme demandé pour le picker), converties en data URI —
    // pas de fichier sur disque, pas de requête réseau. Pour un cubemap,
    // la vignette montre la face "+Z" (vue "de face" représentative) ;
    // pour un volume, une coupe 2D du bruit 3D à mi-profondeur.
    // -------------------------------------------------------------------
    function makeThumbnailDataUrl(draw, w, h) {
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d");
        draw(ctx, w, h);
        return canvas.toDataURL("image/png");
    }

    const THUMB_W = 96, THUMB_H = 64;

    TEXTURE_ASSETS.forEach((a) => {
        a.thumbnailPath = makeThumbnailDataUrl(ASSET_TEXTURE_DRAWERS[a.drawer], THUMB_W, THUMB_H);
    });
    CUBEMAP_ASSETS.forEach((a) => {
        a.thumbnailPath = makeThumbnailDataUrl(
            (ctx, w, h) => ASSET_CUBEMAP_DRAWERS[a.drawer](ctx, w, h, "pz", a.blurred),
            THUMB_W, THUMB_H
        );
    });
    VOLUME_ASSETS.forEach((a) => {
        a.thumbnailPath = makeThumbnailDataUrl((ctx, w, h) => {
            // Coupe médiane du volume, agrandie en blocs pour rester lisible
            // à l'échelle vignette plutôt que d'afficher size×size pixels bruts.
            const data = ASSET_VOLUME_GENERATORS[a.generator](VOLUME_SIZE);
            const midZ = VOLUME_SIZE >> 1;
            const block = w / VOLUME_SIZE;
            for (let y = 0; y < VOLUME_SIZE; y++) {
                for (let x = 0; x < VOLUME_SIZE; x++) {
                    if (a.channels === 1) {
                        const v = data[x + y * VOLUME_SIZE + midZ * VOLUME_SIZE * VOLUME_SIZE];
                        ctx.fillStyle = `rgb(${v},${v},${v})`;
                    } else {
                        const idx = (x + y * VOLUME_SIZE + midZ * VOLUME_SIZE * VOLUME_SIZE) * 4;
                        ctx.fillStyle = `rgb(${data[idx]},${data[idx + 1]},${data[idx + 2]})`;
                    }
                    ctx.fillRect(x * block, (y * block) * (h / w), block + 1, block * (h / w) + 1);
                }
            }
        }, THUMB_W, THUMB_H);
    });

    // -------------------------------------------------------------------
    // Vidéos (décision validée, cf. ROADMAP.md Lot 5) : on garde les NOMS
    // shadertoy.com (fidélité du picker) mais le contenu est un SUBSTITUT
    // GÉNÉRÉ — animations Canvas 2D procédurales. Aucun média propriétaire
    // n'est reproduit ni re-hébergé ; `meta` le dit explicitement dans le
    // picker pour ne pas laisser croire qu'il s'agit des originaux.
    // Music : depuis le Lot 9, ce sont de VRAIS fichiers audio fournis par
    // le projet dans assets/music/ (voir MUSIC_ASSETS plus bas).
    // Chaque asset vidéo est redessiné à chaque frame (asset-loader.js:
    // updateDynamicAssets) ; `draw(ctx, w, h, t)` reçoit le temps en s.
    // -------------------------------------------------------------------
    const VIDEO_W = 512, VIDEO_H = 288;

    const ASSET_VIDEO_DRAWERS = {
        // Barres d'égaliseur colorées qui pulsent
        britneySpears(ctx, w, h, t) {
            ctx.fillStyle = "#1a0f22"; ctx.fillRect(0, 0, w, h);
            const bars = 24;
            for (let i = 0; i < bars; i++) {
                const v = 0.25 + 0.75 * Math.abs(Math.sin(t * 2.2 + i * 0.5));
                ctx.fillStyle = `hsl(${300 + i * 4},80%,${45 + v * 15}%)`;
                ctx.fillRect(i * (w / bars) + 2, h - v * h * 0.9, w / bars - 4, v * h * 0.9);
            }
        },
        // Cercles concentriques en rotation
        claudeVanDamme(ctx, w, h, t) {
            ctx.fillStyle = "#0e1a22"; ctx.fillRect(0, 0, w, h);
            for (let i = 8; i > 0; i--) {
                ctx.beginPath();
                ctx.arc(w / 2 + Math.cos(t + i) * i * 8, h / 2 + Math.sin(t * 1.3 + i) * i * 5, i * 16, 0, Math.PI * 2);
                ctx.fillStyle = `hsl(${180 + i * 12},60%,${25 + i * 4}%)`;
                ctx.fill();
            }
        },
        // Bande sépia avec rayures de « pellicule » et grain
        commercial1961(ctx, w, h, t) {
            ctx.fillStyle = "#c9b48a"; ctx.fillRect(0, 0, w, h);
            ctx.fillStyle = "rgba(60,40,20,0.55)";
            ctx.font = `bold ${h * 0.22}px serif`; ctx.textAlign = "center";
            ctx.fillText("1961", w / 2, h * 0.58);
            for (let i = 0; i < 40; i++) {
                ctx.fillStyle = `rgba(0,0,0,${seededRand(i + Math.floor(t * 12), 71) * 0.25})`;
                ctx.fillRect(seededRand(i + Math.floor(t * 12), 72) * w, 0, 1.5, h);
            }
        },
        // Pastilles aux 4 couleurs qui orbitent
        googleLogo(ctx, w, h, t) {
            ctx.fillStyle = "#f4f4f0"; ctx.fillRect(0, 0, w, h);
            const cols = ["#4285f4", "#ea4335", "#fbbc05", "#34a853"];
            cols.forEach((c, i) => {
                const a = t * 1.4 + i * Math.PI / 2;
                ctx.beginPath();
                ctx.arc(w / 2 + Math.cos(a) * h * 0.28, h / 2 + Math.sin(a) * h * 0.28, h * 0.11, 0, Math.PI * 2);
                ctx.fillStyle = c; ctx.fill();
            });
        }
    };

    const VIDEO_ASSETS = [
        { assetId: "vid_britney_spears", label: "Britney Spears", author: ASSET_AUTHOR, meta: `${VIDEO_W}×${VIDEO_H} · substitut généré`, drawer: "britneySpears" },
        { assetId: "vid_claude_van_damme", label: "Claude Van Damme", author: ASSET_AUTHOR, meta: `${VIDEO_W}×${VIDEO_H} · substitut généré`, drawer: "claudeVanDamme" },
        { assetId: "vid_1961_commercial", label: "1961 Commercial", author: ASSET_AUTHOR, meta: `${VIDEO_W}×${VIDEO_H} · substitut généré`, drawer: "commercial1961" },
        { assetId: "vid_google_logo", label: "Google Logo", author: ASSET_AUTHOR, meta: `${VIDEO_W}×${VIDEO_H} · substitut généré`, drawer: "googleLogo" }
    ];
    VIDEO_ASSETS.forEach((a) => {
        a.thumbnailPath = makeThumbnailDataUrl((ctx, w, h) => {
            // Rendu à la résolution vidéo puis réduit : lisible à 96×64
            const c = document.createElement("canvas"); c.width = VIDEO_W; c.height = VIDEO_H;
            ASSET_VIDEO_DRAWERS[a.drawer](c.getContext("2d"), VIDEO_W, VIDEO_H, 1.0);
            ctx.drawImage(c, 0, 0, w, h);
        }, THUMB_W, THUMB_H);
    });

    // Musique (Lot 9) : vraies pistes fournies dans assets/music/ (elles
    // remplacent les 4 tonalités synthétisées du Lot 5). `src` est relatif
    // à index.html. Pour ajouter une piste : déposer le fichier dans
    // assets/music/ et ajouter une ligne ici (assetId stable : il est
    // enregistré dans les projets/autosaves). `author` est à renseigner
    // avec le vrai crédit de l'artiste.
    const MUSIC_DIR = "assets/music/";
    const MUSIC_AUTHOR = "Fichier local";
    const MUSIC_ASSETS = [
        { assetId: "mus_hack_systemet", label: "Hack Systemet", file: "Hack-Systemet.mp3" },
        { assetId: "mus_iconoclast", label: "Iconoclast", file: "Iconoclast.mp3" },
        { assetId: "mus_vectorization_enable", label: "Vectorization Enable", file: "Vectorization-Enable.mp3" },
        { assetId: "mus_volum_til_maks", label: "Volum Til Maks", file: "Volum-Til-Maks.mp3" }
    ];
    MUSIC_ASSETS.forEach((a, idx) => {
        a.author = MUSIC_AUTHOR;
        a.meta = "512×2 · mp3";
        a.src = MUSIC_DIR + encodeURIComponent(a.file);
        a.thumbnailPath = makeThumbnailDataUrl((ctx, w, h) => {
            // Forme d'onde décorative, déterministe (graine = nom de la piste)
            let seed = 0;
            for (let i = 0; i < a.file.length; i++) seed = (seed * 31 + a.file.charCodeAt(i)) >>> 0;
            const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
            ctx.fillStyle = "#14171c"; ctx.fillRect(0, 0, w, h);
            ctx.fillStyle = "#c9a15a";
            const bars = 48, bw = w / bars;
            for (let i = 0; i < bars; i++) {
                const env = 0.35 + 0.65 * Math.abs(Math.sin((i / bars) * Math.PI * (1.5 + idx * 0.5)));
                const bh = Math.max(2, h * 0.8 * env * (0.4 + 0.6 * rnd()));
                ctx.fillRect(i * bw + 1, (h - bh) / 2, Math.max(1, bw - 2), bh);
            }
        }, THUMB_W, THUMB_H);
    });

    function toPickerAssetItem(a) {
        return { assetId: a.assetId, label: a.label, author: a.author, meta: a.meta || `${a.width}×${a.height} · ${a.channels}ch · ${a.format}`, thumbnailPath: a.thumbnailPath };
    }

    // Hook lu par channel-picker.js (cf. Lot 4 : `typeof getAssetsByCategory
    // === "function"`) — categoryId reprend les ids d'onglet du picker
    // (CHANNEL_PICKER_TABS : "textures","cubemaps","volumes","videos","music").
    function getAssetsByCategory(categoryId) {
        switch (categoryId) {
            case "textures": return TEXTURE_ASSETS.map(toPickerAssetItem);
            case "cubemaps": return CUBEMAP_ASSETS.map(toPickerAssetItem);
            case "volumes": return VOLUME_ASSETS.map(toPickerAssetItem);
            case "videos": return VIDEO_ASSETS.map(toPickerAssetItem);
            case "music": return MUSIC_ASSETS.map(toPickerAssetItem);
            default: return [];
        }
    }
