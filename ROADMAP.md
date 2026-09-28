# ROADMAP — BS Shader Studio → 100% Shadertoy-like

Objectif : passer d'un éditeur mono-shader à un environnement multi-pass
complet façon shadertoy.com — onglets **Common / Image / Buffer A-D / Cubemap A / Sound**,
et un vrai sélecteur d'input pour `iChannel0-3` avec les mêmes catégories que
sur shadertoy.com (Misc, Textures, Cubemaps, Volumes, Vidéos, Music) et le
même style de vignettes que sur les captures fournies.

État actuel : **Lot 1 terminé.** Un seul shader est encore effectivement
rendu à l'écran (l'équivalent du tab "Image"), `iChannel0-3` toujours câblés
en dur sur des textures noires 1×1 — aucun picker, aucun rendu multi-pass
réel, aucun repertoire d'assets. Ce qui a changé au Lot 1 : ce shader n'est
plus un simple `editor.getValue()` mais un objet **Pass** (`pass-model.js`)
géré dans un **registre de passes** (`pass-registry.js`, Image toujours
présente, Buffer A-D/Cubemap A/Sound/Common activables). `extractParams`/
`buildShaderCode` opèrent désormais par passe, avec des noms d'uniforms
préfixés (ex. `bufferA_RAYON`) pour éviter toute collision entre passes, et
l'injection du code de Common en tête de passe est déjà câblée (mais inerte
tant qu'aucune passe Common n'est activée). Comportement runtime inchangé
pour l'utilisateur.

**Lot 2 terminé.** Le registre de passes est maintenant exploité par une
vraie barre d'onglets (`editor-tabs.js`) : Common/Buffer A-D/Cubemap
A/Sound/Image, activables via un bouton `+`, désactivables via une croix,
avec un CodeMirror unique dont le contenu est échangé au clic (scroll/
curseur conservés par onglet). Le bouton "Compile" et l'auto-compile
recompilent désormais **toutes** les passes actives (`compileAllPasses`),
chacune avec son propre statut (`passCompileStatus`) affiché en badge
rouge sur son onglet ; l'`error-console` précise quelle passe a échoué
quand ce n'est pas "image". Le code de `Common` est injecté en tête de
chaque autre passe avant compilation. Seule la passe "image" reste
effectivement rendue à l'écran — Buffer A-D/Cubemap A/Sound compilent et
signalent leurs erreurs mais n'ont pas encore d'effet visuel réel, ce qui
arrive avec le render graph du Lot 3.

**Lot 3 terminé.** Le render graph (`render-graph.js:buildRenderGraph`) calcule
désormais, à chaque `compileAllPasses()`, un ordre de rendu par tri
topologique sur les `inputs[]` de type `"pass"` des passes actives : une
passe qui en lit une autre est rendue après elle dans la même frame. Le
self-feedback (un Buffer qui se lit lui-même) est explicitement exclu du
calcul de dépendance — c'est le mécanisme de ping-pong voulu, pas une
erreur — alors qu'un cycle entre deux passes différentes (Buffer A ↔
Buffer B) est détecté et signalé (`"Cycle error"` dans l'error-console,
passes concernées listées) plutôt que de planter le tri ; les passes
impliquées sont exclues du rendu jusqu'à correction du branchement mais
restent éditables. `buffer-manager.js` alloue une paire de
`THREE.WebGLRenderTarget` par Buffer A-D actif (ping-pong, redimensionnée
avec le canvas à chaque frame, résolution explicite déjà possible via
`setBufferResolution` même sans UI dédiée) ; `viewport.js:runRenderGraph`
exécute chaque passe du graphe dans l'ordre calculé, lui assigne ses
uniforms de temps/souris/date globaux et ses `iChannel0-3` résolus en
temps réel (texture *read* du Buffer ciblé, avec la bonne
`iChannelResolution` — plus figée à `(1,1,1)`, cf. écarts ci-dessous), la
rend vers l'écran (`image`) ou son render target d'écriture (Buffer),
et swap son ping-pong aussitôt après. `iTime`/`iFrame` restent globaux et
partagés entre toutes les passes. Cubemap A et Sound apparaissent déjà
dans le graphe (ordre correct) mais ne sont pas encore rendues, faute de
cible GPU dédiée — ça arrive aux Lots 6 et 7. Prochaine étape : Lot 4
(sélecteur d'input iChannel).

**Lot 4 terminé.** 4 carrés `iChannel0-3` sont maintenant affichés sous
l'éditeur (`renderChannelSlots`, dans `channel-picker.js`), reflétant les
`inputs[]` de la passe **active** de l'éditeur (pas seulement "image" —
chaque onglet a ses propres canaux) ; un clic ouvre la modale "Select
input for iChannelN" (`channelPickerModal`), une croix au survol débranche
sans l'ouvrir. La modale a ses 6 onglets Misc/Textures/Cubemaps/Volumes/
Vidéos/Music (`channel-picker.js`), une grille 3 colonnes de vignettes
3:2 avec nom, auteur et métadonnées, et une pagination à 9 items/page
(`channel-picker-render.js`). L'onglet **Misc** est câblé en direct sur le
projet courant : il liste les Buffers A-D et Cubemap A réellement actifs
(lus depuis `pass-registry.js`, la passe hôte elle-même et "image" étant
exclues) ainsi que 4 entrées spéciales Keyboard/Webcam/Microphone/
Soundcloud. Une sélection appelle `setPassInput` puis `compileShader()`
(le render graph du Lot 3 recalcule aussitôt l'ordre de rendu avec le
nouveau branchement) et rafraîchit les 4 carrés. `pass-model.js` gagne un
3ᵉ type d'input, `{ type: "special", kind }`, pour que ces 4 entrées
matérielles soient sélectionnables et stockées dès ce lot, même sans
acquisition réelle avant le Lot 9 — retombent comme "asset" sur le
fallback noir 1×1 du compilateur, sans aucun changement requis côté
`shader-compiler.js`. **Lot 5 terminé.** `asset-library.js` référence 13 textures (2 pages à 9/page),
6 cubemaps, 2 volumes 3D, 4 vidéos et 4 pistes musique, tous **générés
procéduralement** (aucun fichier propriétaire embarqué, auteur affiché :
« BS Shader Studio (procédural) ») ; `asset-loader.js` les charge avec cache par
`assetId` et met à jour les vidéos/musiques dynamiques à chaque frame.

**Lot 6 terminé.** Cubemap A est rendue face par face vers un
`WebGLCubeRenderTarget` (`cubemap-pass.js`) et échantillonnable en `samplerCube` ;
le compilateur déclare `sampler2D`/`samplerCube`/`sampler3D` par canal d'après
l'input branché, ce qui rend aussi cubemaps et volumes de la bibliothèque utilisables.

**Lot 7 terminé.** Le Sound shader (`vec2 mainSound(int samp, float time)`) est évalué
offline par blocs GPU de 512×512 (60 s à 44,1 kHz), décodé en `AudioBuffer` et lu via
Web Audio (`sound-pass.js`), avec barre dédiée (play/pause + progression). La lecture est
**calée sur la timeline** : pause/reprise/reset du viewport et export vidéo se répercutent
sur le son, avec recalage automatique en cas de dérive d'horloge.

**Lot 8 terminé.** Le projet complet (code de chaque passe + 4 inputs iChannel de chacune +
onglet actif + nom) est sérialisé en JSON versionné par `core/project-io.js`. Il est
**sauvegardé automatiquement** dans `localStorage` (restauré au rechargement de la page) et
peut être **exporté / importé** en fichier `.json` depuis la topbar (New / Open / Save). Un
fichier importé est validé et nettoyé (jamais d'input orphelin qui casserait le render graph).
Les menus Preset et Reset restaurent maintenant le code **et** les inputs de la passe Image.
Prochaine étape : Lot 9 (finitions).

**Lot 9 en cours.** Premier item livré : **Keyboard** est une entrée réelle (`assets/keyboard-input.js`,
texture 256×3 état/pression/toggle, contrat shadertoy.com). **Webcam** et **Microphone** sont
retirés du projet (plus proposés dans le picker ; un ancien projet qui les référence est nettoyé à
l'ouverture). Restent : vérification de l'export vidéo avec le render graph, indicateur de performance.

---

## Vue d'ensemble des lots

| Lot | Contenu | Dépend de | Statut |
|---|---|---|---|
| 0 | Réorganisation des répertoires | — | ✅ Fait |
| 1 | Modèle de données multi-pass (Common/Image/Buffer A-D/Cubemap A/Sound) | 0 | ✅ Fait |
| 2 | Onglets d'édition + compilation multi-pass | 1 | ✅ Fait |
| 3 | Render graph (ping-pong buffers, ordre de rendu, feedback) | 1, 2 | ✅ Fait |
| 4 | Sélecteur d'input iChannel (UI façon shadertoy.com) | 0 | ✅ Fait |
| 5 | Bibliothèque d'assets (Misc/Textures/Cubemaps/Volumes/Vidéos/Music) | 0, 4 | ✅ Fait |
| 6 | Cubemap A (pass dédié, rendu 6 faces) | 1, 3 | ✅ Fait |
| 7 | Sound shader (rendu offline vers texture audio + lecture) | 1, 3 | ✅ Fait |
| 8 | Persistance projet (sauvegarde/chargement du set complet de passes+inputs) | 1-7 | ✅ Fait |
| 9 | Finitions UX (erreurs par pass, perf, export) | tout | ⏳ En cours (Keyboard ✅) |

---

## Lot 0 — Réorganisation des répertoires ✅ Terminé

Structure cible (à partir de l'existant `index.html`, `css/`, `js/`) :

```
index.html

css/
  base.css                 (reset, variables, layout général — ex style.css découpé)
  topbar.css
  editor.css                (CodeMirror, toolbar, tabs de passes)
  inspector.css              (sliders, cartes de paramètres)
  viewport.css                (cadre laiton, transport, canvas)
  channel-picker.css          (nouvelle modale "Select input for iChannelN")
  export-modal.css

js/
  core/
    state.js                  (état global partagé : passes actives, temps, playback…)
    shaders-presets.js         (presets de démarrage, un par passe : Common/Image/Buffer A…)

  passes/
    pass-model.js              (classe/objet "Pass" : id, type, code, inputs[4], buffer cible)
    pass-registry.js            (liste ordonnée des passes du projet courant, ajout/suppression)
    render-graph.js              (calcule l'ordre topologique de rendu à partir des dépendances iChannel)

  compiler/
    glsl-transform.js           (extraction #define, réécriture texture2D→texture, etc. — ex shader-compiler.js scindé)
    shader-compiler.js           (assemble le code final par passe, gère #include du Common)

  ui/
    editor-tabs.js               (onglets Common/Image/Buffer A-D/Cubemap A/Sound dans l'éditeur)
    editor-toolbar.js
    sliders.js
    inspector.js
    channel-picker/
      channel-picker.js          (logique de la modale, onglets Misc/Textures/…)
      channel-picker-render.js    (génération des grilles de vignettes, pagination)

  assets/
    asset-library.js              (métadonnées : nom, auteur, dimensions, format — un objet par item des 6 onglets)
    asset-loader.js                (charge la texture/vidéo/cubemap/audio réel une fois sélectionné)

  buffers/
    buffer-manager.js              (alloue/redimensionne les render targets ping-pong des Buffer A-D)
    cubemap-pass.js                  (rendu 6 faces pour Cubemap A)
    sound-pass.js                     (rendu offline du Sound shader vers une texture, lecture Web Audio)

  video-export.js
  viewport.js                        (boucle de rendu, transport, canvas — orchestration finale, plus légère)

assets/
  textures/         (miniatures + fichiers : abstract1.jpg, bayer.png, blue-noise.png, …)
  cubemaps/          (forest/, st-peters/, uffizi/ — 6 faces chacun + versions blurred)
  volumes/            (grey-noise-3d.bin, rgba-noise-3d.bin ou équivalent .png slices)
  videos/              (placeholders/textes de substitution — voir note licences ci-dessous)
  music/                (placeholders/textes de substitution — voir note licences ci-dessous)
  thumbnails/            (vignettes 128×128 générées pour chaque asset, pour le picker)
```

**Tâches**
- [x] Créer l'arborescence ci-dessus (dossiers vides pour les fichiers pas encore écrits : `js/passes/`, `js/buffers/`, `js/assets/`, `js/ui/channel-picker/`, `assets/textures|cubemaps|volumes|videos|music|thumbnails/`)
- [x] Découper `css/style.css` actuel en les 7 fichiers listés, 7 `<link>` dans `index.html`
- [x] Scinder `shader-compiler.js` actuel en `glsl-transform.js` + `shader-compiler.js`
- [x] Scinder `viewport.js` actuel : garder la boucle de rendu + transport, déplacer la logique de canvas/renderer dans `state.js` (exposée comme `mountRenderer()`, appelée depuis `viewport.js`)
- [x] Mettre à jour tous les `<script src>` de `index.html`

Écarts mineurs par rapport au plan initial, sans impact sur les lots suivants :
- `shaders.js` renommé `core/shaders-presets.js` (le plan le mentionnait déjà sous ce nom dans l'arborescence cible, mais pas explicitement dans les tâches).
- `editor-tabs.js`, `channel-picker.js`, `channel-picker-render.js`, `asset-library.js`, `asset-loader.js`, `pass-model.js`, `pass-registry.js`, `render-graph.js`, `buffer-manager.js`, `cubemap-pass.js`, `sound-pass.js` : dossiers créés, fichiers **pas encore écrits** (arrivent aux Lots 1 à 7 respectifs). `channel-picker.css` existe déjà mais est vide (juste un commentaire d'intention), pour que `index.html` puisse déjà le référencer sans 404.
- Aucun fichier réel dans `assets/` (textures/cubemaps/volumes/vidéos/musique) : arrive au Lot 5.
- Comportement runtime inchangé — ce lot ne touche qu'à l'organisation des fichiers, pas à la logique.

---

## Lot 1 — Modèle de données multi-pass ✅ Terminé

Introduire un objet **Pass** qui remplace le `editor.getValue()` unique actuel :

```js
// pass-model.js
{
  id: "image" | "common" | "bufferA" | "bufferB" | "bufferC" | "bufferD" | "cubemapA" | "sound",
  label: "Image",
  code: "...",
  inputs: [ null, null, null, null ],   // 4 slots iChannel0-3, chacun = ref vers un Asset ou une autre Pass
  target: null | "bufferA" | ...,        // null = écrit à l'écran ; sinon écrit dans un render target
}
```

- **Common** : pas de sortie propre, son code est concaténé en tête de toutes les autres passes (comme sur shadertoy.com — fonctions/constantes partagées).
- **Image** : pass finale, toujours présente, écrit à l'écran.
- **Buffer A-D** : passes optionnelles, écrivent dans un render target dédié, peuvent se lire elles-mêmes (feedback) via un de leurs propres `iChannel`.
- **Cubemap A** : pass optionnelle, écrit dans une cubemap render target (6 faces).
- **Sound** : pass optionnelle, écrit dans une texture audio 512×2, lue par Web Audio.

**Tâches**
- [x] Définir `pass-model.js` (constructeur + validation)
- [x] `pass-registry.js` : liste des passes actives du projet (Image toujours présente, les autres activables/désactivables)
- [x] Adapter `extractParams`/`buildShaderCode` (actuel `shader-compiler.js`) pour opérer **par passe** au lieu d'un seul `editor.getValue()` global
- [x] Chaque passe garde ses propres `#define` → ses propres sliders dans l'Inspector (préfixés par le nom de la passe pour éviter les collisions, ex. `bufferA.RAYON`)

Écarts mineurs par rapport au plan initial, sans impact sur les lots suivants :
- Préfixe implémenté comme `bufferA_RAYON` (underscore) plutôt que `bufferA.RAYON` (point) : un point n'est pas un caractère valide dans un identifiant GLSL, l'underscore est le nom d'uniform réellement déclaré et utilisé à l'écran. L'affichage humain dans l'Inspector suit la même forme (`bufferA_RAYON`) ; libre de le re-formatter en `bufferA.RAYON` côté UI uniquement au Lot 2/9 si souhaité, sans toucher au modèle.
- Chaque paramètre extrait porte maintenant `{ name, uniformName, value, raw }` au lieu de `{ name, value, raw }` : `name` reste le nom du `#define` tel qu'écrit dans le code de la passe (utilisé pour la ré-écriture texte dans l'éditeur), `uniformName` est le nom préfixé par passe (déclaré comme `uniform float`, utilisé comme clé dans l'Inspector et dans `shaderUniforms`). Le corps du shader garde son `#define NOM ancien_nom` original, réécrit pour pointer vers `uniformName` — pas de réécriture du reste du corps, donc code d'origine intact.
- Injection de **Common** en tête de passe déjà câblée dans `buildShaderCode` (3ᵉ paramètre `commonCode`) : ce n'était pas explicitement demandé au Lot 1 (prévu Lot 2, "Injecter le code de Common en tête de chaque autre passe avant compilation") mais logique à poser ici puisque `buildShaderCode` prend déjà `pass` en entrée ; ne change rien au runtime tant qu'aucune passe Common n'est activée (`commonCode` vide → `commonPrefix` vide).
- Le rendu à l'écran reste, comme au Lot 0, une seule passe (`image`) exécutée par `compileShader()`/`viewport.js` — le registre peut désormais contenir plusieurs passes (`enablePass`/`disablePass` fonctionnels et testés), mais seule `image` est effectivement compilée et rendue tant que le Lot 2 (onglets d'édition) et le Lot 3 (render graph) ne sont pas faits. Comportement runtime inchangé pour l'utilisateur.
- `pass-registry.js` expose aussi `getRenderablePasses()` et `sortPassesByCanonicalOrder()`, pas explicitement listés dans les tâches mais nécessaires pour que l'ordre d'onglets du Lot 2 (`Common | Buffer A-D | Cubemap A | Sound | Image`) et le filtrage du futur render graph (Lot 3) aient une base déjà en place.

---

## Lot 2 — Onglets d'édition + compilation multi-pass ✅ Terminé

UI : une barre d'onglets au-dessus du `CodeMirror`, un par passe active, dans l'ordre `Common | Buffer A | Buffer B | Buffer C | Buffer D | Cubemap A | Sound | Image` (ordre shadertoy.com), plus un bouton `+` pour activer une passe optionnelle et une croix pour la désactiver.

**Tâches**
- [x] `editor-tabs.js` : rendu des onglets, switch actif → recharge le bon `code` dans CodeMirror (sauvegarder le scroll/curseur par onglet comme le fait déjà `commitParameterToEditor` pour un seul buffer)
- [x] Un CodeMirror unique dont le contenu est swappé au clic d'onglet (pas 8 instances CodeMirror — coût mémoire/perf)
- [x] Compilation : bouton "Compile" et auto-compile recompilent **toutes les passes actives**, pas seulement celle affichée
- [x] Erreurs de compilation affichées par passe (badge rouge sur l'onglet concerné + `error-console` qui précise quelle passe a échoué)
- [x] Injecter le code de `Common` en tête de chaque autre passe avant compilation

Écarts mineurs par rapport au plan initial, sans impact sur les lots suivants :
- `index.html` référençait déjà `js/ui/editor-tabs.js` (posé au Lot 0) et `index.html`/`editor.css` avaient déjà le conteneur `#passTabsBar` et tout le CSS `.pass-tab*` prêts à l'emploi ; ce lot n'a donc touché ni au HTML ni au CSS, seulement à la logique JS.
- La compilation multi-pass (`compilePassMaterial`/`compileAllPasses`) et l'Inspector par-onglet (`parseAndPopulateInspector` sur `getActivePass()`) existaient déjà, rédigés en avance, dans des fichiers `js/inspector.js` et `js/shader-compiler.js` à la racine de `js/` — reliquats du découpage du Lot 0, non référencés par `index.html` (qui charge `js/ui/inspector.js` et `js/compiler/shader-compiler.js`). Ce lot a repris ce travail tel quel dans les fichiers réellement chargés, plutôt que de le ré-écrire, et supprimé les doublons racine (`inspector.js`, `shader-compiler.js`, `state.js`, `sliders.js`, `editor-toolbar.js`, `shaders.js`) qui n'étaient plus que du code mort désynchronisé. Seul `editor-tabs.js` restait réellement à écrire.
- Le rendu à l'écran reste, comme avant ce lot, la seule passe `image` (`compileAllPasses` compile bien **toutes** les passes actives et remonte un statut par passe, mais seule `image` est effectivement appliquée au `quadMesh` affiché) — Buffer A-D/Cubemap A/Sound sont donc éditables, compilables et signalent leurs erreurs, mais n'ont pas d'effet visuel réel avant le render graph du Lot 3.
- Activer une passe optionnelle depuis le bouton `+` déclenche immédiatement une compilation (`compileShader()`) et bascule l'éditeur dessus, pour que l'utilisateur voie tout de suite si le code de départ (`PASS_STARTER_CODE`) compile ; ce n'était pas demandé explicitement mais évite un onglet neuf silencieusement en erreur.
- `video-export.js` a un bug pré-existant sans rapport avec ce lot (`shaderUniforms[p.name]` au lieu de `p.uniformName` lors de l'export) : laissé tel quel, sa révision est explicitement prévue au Lot 9 ("vérifier compatibilité avec le nouveau render graph multi-pass").

---

## Lot 3 — Render graph (multi-pass, ping-pong, feedback) ✅ Terminé

C'était le cœur technique : passer d'un seul `renderer.render(scene, camera)` par frame à un vrai graphe multi-pass.

**Tâches**
- [x] `render-graph.js` : à partir des `inputs[]` de chaque passe, calculer l'ordre de rendu (tri topologique). Détection des cycles légitimes (un Buffer qui se lit lui-même = feedback intentionnel, pas une erreur) vs cycles invalides entre passes différentes.
- [x] `buffer-manager.js` : pour chaque Buffer A-D actif, deux render targets (ping-pong) — on écrit dans l'un pendant qu'on lit l'autre, puis on swap chaque frame. Redimensionnement synchronisé avec le canvas principal (viewport resolution), sauf si l'utilisateur fixe une résolution différente par buffer (comme shadertoy.com le permet via un menu résolution par buffer).
- [x] Boucle de rendu (`viewport.js`) réécrite : pour chaque frame, exécuter le render graph dans l'ordre calculé, avec les bons `iChannelResolution[]`/`iChannelTime[]` par passe selon ce qui est branché sur chaque slot.
- [x] `iFrame`/`iTime` restent globaux et partagés entre toutes les passes (comme sur shadertoy.com).

Écarts mineurs par rapport au plan initial, sans impact sur les lots suivants :
- L'essentiel du Lot 3 (`render-graph.js`, `buffer-manager.js`, l'intégration dans `viewport.js`/`shader-compiler.js`, déjà référencés dans `index.html`) avait été écrit et câblé en avance — même schéma qu'au Lot 2 avec `editor-tabs.js`/`inspector.js` rédigés avant l'heure. Ce lot a consisté à l'auditer et le compléter plutôt qu'à l'écrire de zéro : validation du tri topologique par un test isolé (self-feedback, cycle invalide à 2 passes, chaîne à 3 passes, passes indépendantes — les 4 cas se comportent comme attendu), puis deux corrections réelles trouvées à l'audit.
- **Correction 1 — `iChannelResolution` figée.** `refreshPassChannelUniforms` (`viewport.js`) mettait déjà à jour la texture de chaque `iChannelN` à chaque frame mais laissait `iChannelResolution` à sa valeur de compilation `(1,1,1)`, jamais réévaluée — un Buffer redimensionné avec le canvas (resize fenêtre) donnait donc une résolution d'iChannel fausse à toute passe qui le lit, sans recompilation. Ajout de `buffer-manager.js:getBufferResolution(passId)` (taille réelle du render target *read* courant) et mise à jour de `iChannelResolution[i]` en même temps que la texture, chaque frame, dans `refreshPassChannelUniforms`.
- **Correction 2 — slider live-preview limité à "Image".** `inspector.js:setLiveParameterValue` portait un garde-fou `if (getActivePass().id !== "image") return` explicitement commenté "tant que le render graph du Lot 3 n'existe pas" — resté en place après l'écriture du render graph, qui lit pourtant déjà `currentParameters` pour la passe active quelle qu'elle soit (`viewport.js:runRenderGraph`, `params = ... currentParameters : runtime.params`). Conséquence concrète : glisser un slider sur l'onglet Buffer A ne mettait à jour que le chiffre affiché sur la carte, pas le rendu du Buffer à l'écran, jusqu'au prochain clic sur "Compile". Garde-fou supprimé ; le live-preview fonctionne maintenant identiquement sur toutes les passes actives, pas seulement Image.
- Cubemap A et Sound sont déjà correctement ordonnées dans `buildRenderGraph` (`isRenderablePass` les inclut) mais `runRenderGraph` les saute explicitement (`pass.id === "cubemapA" || pass.id === "sound"`) faute de cible GPU dédiée — intentionnel, prévu aux Lots 6/7 respectifs, pas une régression de ce lot.
- Le menu de résolution par buffer mentionné dans la roadmap générale n'est pas une tâche explicite de ce lot et n'a pas d'UI ; l'API (`setBufferResolution`) est prête côté `buffer-manager.js` pour ne pas avoir à re-router les appelants quand cette UI arrivera (Lot 9 ou à la demande).

---

## Lot 4 — Sélecteur d'input iChannel (style shadertoy.com) ✅ Terminé

Reproduire la modale des captures fournies : une fenêtre "Select input for iChannelN" avec 6 onglets **Misc / Textures / Cubemaps / Volumes / Vidéos / Music**, grille de vignettes 3 colonnes, pagination en bas pour les onglets qui dépassent 9 items.

**Tâches**
- [x] `channel-picker.js` : composant modale générique, ouvert au clic sur un des 4 slots iChannel (affichés sous chaque onglet de passe, comme les carrés `iChannel0-3` de shadertoy.com sous l'éditeur)
- [x] `channel-picker-render.js` : génère la grille depuis `asset-library.js`, gère la pagination (9 par page comme dans les captures)
- [x] CSS `channel-picker.css` : reproduire fidèlement le style des captures — fond gris clair, vignette 3:2, nom + "by shadertoy" en gras + métadonnées (dimensions, channels, format) sous chaque vignette, onglet actif souligné/grisé
- [x] Onglet **Misc** : lister aussi les Buffers A-D et Cubemap A du projet courant (comme sur shadertoy.com, où on peut brancher un buffer sur un iChannel d'un autre) + Keyboard/Webcam/Microphone/Soundcloud comme entrées spéciales (voir Lot 9 pour lesquelles sont réellement implémentables)
- [x] Sélection → ferme la modale, met à jour `inputs[N]` de la passe active, déclenche une recompilation

Écarts par rapport au plan initial, sans impact sur les lots suivants :
- **Pas de captures disponibles dans cette session** (mentionnées dans la roadmap mais non fournies avec le zip re-uploadé) : impossible de pixel-matcher "fond gris clair" et la mise en page exacte des vignettes. La structure demandée est respectée à l'identique (6 onglets, grille 3 colonnes, vignette 3:2, nom + auteur + métadonnées, pagination 9/page, onglet actif souligné) mais habillée avec la palette sombre/laiton du reste du site plutôt qu'un fond clair, qui aurait juré visuellement à côté du reste de l'UI. Le Lot 9 prévoit déjà explicitement une "revue finale du style CSS de la modale iChannel contre les captures fournies" — c'est le bon moment pour un pixel-matching une fois les captures disponibles dans une session avec ces fichiers.
- `channel-picker.js` ne lit pas encore `asset-library.js` (qui n'existe pas avant le Lot 5) pour les 5 onglets Textures/Cubemaps/Volumes/Vidéos/Music : ils affichent un état vide explicite ("La bibliothèque d'assets arrive au Lot 5") via un hook optionnel `typeof getAssetsByCategory === "function"`, même idiome que le reste du code pour ses dépendances pas-encore-écrites (`typeof disposeBufferTarget`, `typeof getBufferReadTexture`, etc.). Le Lot 5 n'aura donc qu'à écrire `asset-library.js` et exposer cette fonction : aucun changement requis dans `channel-picker.js`/`channel-picker-render.js`.
- L'onglet **Misc** ne dépend pas d'`asset-library.js` : il est câblé directement sur `pass-registry.js` (Buffers A-D / Cubemap A réellement actifs dans le projet), comme demandé explicitement dans les tâches de ce lot plutôt que reporté au Lot 5.
- `pass-model.js` gagne un 3ᵉ type d'input `{ type: "special", kind }` (non prévu explicitement dans la forme du Lot 3) pour que les 4 entrées matérielles soient sélectionnables et persistées dès ce lot — elles retombent sur le fallback noir 1×1 du compilateur exactement comme un input "asset" non résolu, sans toucher à `shader-compiler.js`/`render-graph.js`. Aucune acquisition réelle (webcam/micro/clavier) avant le Lot 9 ; Soundcloud reste noté comme nécessitant une clé API externe à évaluer séparément.
- Pas de vignette-texture réelle pour les Buffers/Cubemap A dans la grille (pas de snapshot GPU→image exporté dans ce lot) : un glyphe (label du buffer, icône par entrée spéciale) tient lieu de vignette identifiante en attendant, cohérent avec l'absence de vraies miniatures avant le Lot 5 de toute façon.
- Testé sans navigateur (pas d'accès réseau dans cet environnement pour charger Three.js/CodeMirror depuis le CDN) : validation par relecture + tests Node isolés de la logique pure (filtrage de l'onglet Misc — exclut bien la passe hôte et "image", conserve les autres Buffers/Cubemap A + les 4 entrées spéciales ; état vide des onglets Lot 5 ; pagination 9/page sur un jeu de 23 items) et vérification syntaxique (`node --check`) de tous les fichiers touchés. Une passe manuelle dans un vrai navigateur reste recommandée avant de considérer ce lot définitivement clos.

---

## Lot 5 — Bibliothèque d'assets ✅ Terminé

**Tâches**
- [x] `asset-library.js` : métadonnées (`name`, `author`, dimensions, canaux, format, vignette) pour Textures (Abstract 1-3, Bayer, Blue Noise, Font 1, Gray Noise Medium/Small, Lichen + 4 items de remplissage), Cubemaps (Forest, St. Peter's Basilica, Uffizi Gallery + variantes Blurred) et Volumes (Grey Noise3D, RGBA Noise3D)
- [x] Assets **procéduraux** (Canvas 2D / tableaux typés) plutôt que fichiers dans `assets/textures|cubemaps|volumes/` — pas d'accès réseau ici, et les originaux sont propriétaires
- [x] `asset-loader.js` : `loadAssetTexture` / `loadAssetCubemap` / `loadAssetVolume` → `THREE.CanvasTexture` / `CubeTexture` / `Data3DTexture`, avec cache par `assetId`
- [x] Pagination fonctionnelle (Textures : 13 items = 2 pages à 9/page ; Cubemaps 6 et Volumes 2 tiennent sur 1 page)
- [x] **Vidéos (Britney Spears, Claude Van Damme, 1961 Commercial, Google Logo) et Music** : noms shadertoy conservés (option validée), contenu de substitution généré — voir ci-dessous

Écarts et décisions :
- **Auteur** : les assets portent `BS Shader Studio (procédural)`, pas "by shadertoy" comme dans les captures — ce ne sont pas les vrais fichiers shadertoy.com, les leur attribuer serait trompeur. Les noms, eux, reprennent ceux de la roadmap.
- **Jeu de données réduit** (autorisé par la roadmap) : pas 22/6/2 pages comme sur shadertoy.com. Textures compte 4 items « remplissage » (Gray Noise Large, Checker, Stripes, Voronoi Cells) ajoutés uniquement pour dépasser 9 items et exercer la pagination.
- **Approximations visuelles** : « Blue Noise » = grille jitterée (pas de vrai void-and-cluster), volumes = value-noise simple, cubemaps = dégradés par face (pas des photos). Ils remplissent le rôle fonctionnel, pas la fidélité photo.
- **Au Lot 5 seules les textures 2D étaient échantillonnables** (`sampler2D`). **Mis à jour au Lot 6** : cubemaps et volumes sont désormais réellement échantillonnables (`samplerCube` / `sampler3D` déclarés selon l'input).
- **Bug corrigé au passage** : `viewport.js:refreshPassChannelUniforms` écrasait chaque frame les inputs `"asset"` par le fallback noir ; il résout maintenant l'asset (cache) et met à jour `iChannelResolution`.
- Testé par tests Node avec canvas/THREE factices (13 textures, cache, 6 faces cubemap, volume, hook du picker) + `node --check`. Pas de rendu navigateur ici : à vérifier visuellement (vignettes, texture branchée sur un iChannel).

**Vidéos et Music (décision validée : noms shadertoy, contenu de substitution généré)**
- **Vidéos** : 4 animations Canvas 2D procédurales (barres d'égaliseur, cercles orbitaux, bande « 1961 » avec grain, pastilles 4 couleurs), 512×288, redessinées chaque frame en `CanvasTexture`. `meta` affiche « substitut généré » dans le picker : rien ne laisse croire qu'il s'agit des originaux.
- **Music** : 4 pistes synthétisées Web Audio (oscillateurs + LFO), exposées comme la texture 512×2 de shadertoy (ligne 0 = spectre FFT, ligne 1 = forme d'onde, lue via `.x`). Le son est réellement audible ; l'`AudioContext` démarre au clic de sélection (geste utilisateur, donc autoplay autorisé).
- **Les noms des pistes Music ne figuraient pas dans la roadmap** (contrairement aux vidéos) : « Music 1-4 » sont des noms provisoires — envoyez les noms voulus et je remplace les 4 `label` dans `asset-library.js`.
- `author` reste `BS Shader Studio (procédural)` même avec les noms shadertoy (honnêteté sur l'origine du contenu).
- Mécanisme : `loadAssetTexture` résout aussi vidéos/musique (même cache) ; `asset-loader.js:updateDynamicAssets(t)` met à jour uniquement les assets réellement chargés, appelé une fois par frame par `runRenderGraph`. Pas de bouton pause/mute pour la musique pour l'instant (à prévoir avec le Lot 9 si besoin) ; changer d'input ne coupe pas les oscillateurs déjà démarrés.
- Testé avec mocks Node (4 vidéos, 4 pistes, cache, texture 512×2, remplissage spectre/onde) ; rendu et son réels à vérifier dans un navigateur.

---

## Lot 6 — Cubemap A ✅ Terminé

**Tâches**
- [x] `cubemap-pass.js` : rendu de la passe Cubemap A vers un `THREE.WebGLCubeRenderTarget` (512², `HalfFloatType`), 6 rendus par frame — un par face
- [x] `iChannelN` de type cubemap sélectionnable dans le picker (onglet Misc → « Cubemap A », déjà listé au Lot 4) et échantillonnable via `samplerCube`
- [x] `buildShaderCode` déclare `samplerCube` / `sampler3D` / `sampler2D` **par canal** d'après l'input branché (`getInputSamplerType`, `asset-loader.js`)
- [x] (note du Lot 5) cubemaps de la bibliothèque (Forest, Uffizi…) et volumes (Grey/RGBA Noise3D) désormais réellement échantillonnables : plus de fallback noir

Décisions et écarts :
- **Pas de `THREE.CubeCamera`** : le wrapper généré pour Cubemap A (`cubemapMainWrapper`) calcule la direction du rayon par face avec la **table OpenGL des cubemaps**, et appelle `mainCubemap(fragColor, fragCoord, vec3(0), rayDir)` comme sur shadertoy.com. Un uniforme `_cubeFace` (0-5) sélectionne la face ; `renderer.setRenderTarget(cubeRT, face)` fait le reste. Les caméras de CubeCamera suivent une autre convention (pensée pour les matériaux Three intégrés) et auraient demandé des retournements.
- **Vérifié mathématiquement** : test Node d'aller-retour sur 486 points (6 faces × 9×9) — la direction écrite par le wrapper, relue par la fonction d'échantillonnage de la spec GL, retombe sur la même face et les mêmes (s,t).
- **Résolution unifiée** : `resolveChannelBinding` (`shader-compiler.js`) est le point unique de résolution d'un slot → `{texture, width, height, depth}`, utilisé à la compilation *et* par `viewport.js:refreshPassChannelUniforms` chaque frame. Le type de texture liée suit toujours le sampler déclaré (un mismatch 2D/cube est une erreur WebGL). Fallbacks **typés** : cube noir 1×1 et volume noir 1×1×1 (`asset-loader.js`), jamais `null`. `iChannelResolution` reçoit maintenant aussi la profondeur (volumes).
- **Cubemap A ne peut pas se lire lui-même** (lecture + écriture de la même texture = feedback WebGL illégal, pas de ping-pong sur les 6 faces) : dans ce cas le slot retombe sur le cube noir. Le picker excluait déjà la passe hôte de l'onglet Misc.
- Cubemap A n'est plus sauté par `runRenderGraph` ; `disposeBufferTarget("cubemapA")` libère la cible cubemap quand la passe est désactivée. Sound reste sauté (Lot 7).
- `Data3DTexture` (Three ≥ r134) et `DataTexture3D` (r128) sont tous deux gérés côté loader.
- Testé sans navigateur : tests Node (déclaration des 3 types de sampler, wrapper cubemap vs image, résolution/fallbacks/self-lecture, volume 32³, aller-retour des faces) + `node --check`. **À vérifier visuellement** : activer Cubemap A, la brancher sur `iChannel0` d'Image et échantillonner `texture(iChannel0, dir)` ; idem avec « Forest » ou « Uffizi Gallery » ; le rendu réel (orientation des faces, précision half-float) n'a pas pu être testé ici.

---

## Lot 7 — Sound shader ✅ Terminé

**Tâches**
- [x] `sound-pass.js` : évaluation **offline** du Sound shader sur toute la durée (60 s à 44,1 kHz), puis lecture via Web Audio API
- [x] Rendu offline par blocs GPU, `AudioBuffer` + `AudioBufferSourceNode` pour la lecture
- [x] UI : barre Sound avec bouton play/pause dédié et indicateur de génération (pourcentage + barre de progression)
- [x] Lecture synchronisée avec la timeline `iTime` (play/pause/reset du viewport, export vidéo, recalage de dérive)
- [x] `AudioBuffer` mis en cache par génération (plus de copie de 2,6 M d'échantillons à chaque lecture)

Décisions et écarts :
- **Blocs 512×512, pas 512×2** : la roadmap évoquait une texture 512×2 « comme Keyboard/Soundcloud », mais c'est le format des entrées du picker, pas celui du Sound shader. Le fonctionnement retenu est celui de shadertoy.com : un bloc de 512×512 = 262 144 échantillons, **un échantillon par pixel** (n° = décalage du bloc + rangée×512 + colonne, temps = n° / `iSampleRate`) → 11 blocs pour 60 s.
- **Encodage** : chaque canal stéréo est codé sur 16 bits dans un RGBA8 (L = R+G, R = B+A), relu avec `readRenderTargetPixels` puis décodé en `Float32`. Sortie clampée à [-1,1], NaN → silence. `soundMainWrapper` (`shader-compiler.js`) fournit `main()` ; le code utilisateur implémente `vec2 mainSound(int samp, float time)`.
- **Modèle asynchrone** : une frame d'animation est cédée entre deux blocs (interface non figée), la génération est **annulable** (une nouvelle compilation supplante la précédente, via un jeton) et **dédupliquée** par signature (code Sound + Common + valeurs des paramètres) — recompiler une autre passe ne régénère pas 60 s d'audio.
- **Lecture** : jamais automatique (autoplay bloqué sans geste utilisateur), bouton play/pause dans la barre ; lecture en boucle. Si le son jouait pendant une régénération, il reprend **à la même position** avec le nouveau son (confort de live-coding). Pause = position mémorisée.
- **Corrigé au passage** : le gabarit par défaut du Sound utilisait `in int sample` ; `samp` (nom de shadertoy.com) évite tout souci de mot réservé GLSL.
- **Sound et Common n'ont pas d'iChannel** (comme sur shadertoy.com) : les 4 carrés sont masqués pour ces deux onglets, et Sound n'apparaît plus dans l'onglet Misc du picker (aucune texture à échantillonner).
- Libération : désactiver la passe Sound coupe le son, annule une génération en cours et libère la cible (`disposeBufferTarget("sound")` → `disposeSoundPass`).
- **Bug bloquant corrigé (hérité du Lot 3)** : `index.html` chargeait `js/passes/render-graph.js` alors que le fichier se trouvait dans `js/render-graph.js` → `buildRenderGraph` indéfini, aucune passe compilable dans un vrai navigateur. Le fichier est déplacé dans `js/passes/` et tous les chemins `<script>` ont été vérifiés un par un. Mon audit du Lot 3 (tests Node isolés) ne pouvait pas le voir.
- Testé avec le vrai `sound-pass.js` et un « GPU » simulé appliquant exactement les formules du wrapper : 11 blocs rendus, erreur max 1,5e-5 sur une sinusoïde y compris aux frontières de blocs et au dernier échantillon, pas de régénération si le code est identique, play/pause/reprise, régénération pendant la lecture, annulation, erreur de compilation, dispose ; `node --check` sur tous les fichiers touchés. **Non testé** dans un navigateur : temps de génération réel (dépend de la complexité du shader et du GPU), et rendu sonore.
- **Synchronisation avec la timeline (finition du lot)** : position audio = `iTime mod 60 s`. `viewport.js` expose `setTransportPlaying()` / `resetTransportTime()` (globaux, utilisés par les boutons du transport) qui appellent `syncSoundToTransport()`. Le son joue si l'utilisateur l'a demandé (`soundWanted`) **et** que la timeline tourne : mettre le viewport en pause coupe le son (l'intention est conservée), la reprise repart à la position d'`iTime`, Reset repart de 0. Cliquer play sur la barre Sound alors que la timeline est en pause relance la timeline. `correctSoundDrift()` (appelée à chaque frame) recale le son si l'écart avec `iTime` dépasse 0,25 s (calcul circulaire, donc pas de faux recalage au bouclage à 60 s). L'export vidéo coupe le son pendant l'encodage et le restaure ensuite.
- **Nettoyage** : `js/render-graph.js` (doublon identique de `js/passes/render-graph.js`, non référencé) supprimé.
- Test complémentaire de cette finition (vrai `sound-pass.js`, GPU et `AudioContext` simulés) : génération (11 blocs, erreur max 1,5e-5), dédup, lecture calée sur `iTime`, pause/reprise/reset, dérive et bouclage, play avec timeline en pause, régénération pendant la lecture, annulation, erreur de compilation, dispose (intention comprise). Toujours **non testé dans un navigateur** : temps de génération réel selon le GPU, rendu sonore, ressenti de la synchro.
- Non fait (hors périmètre, non bloquant) : durée fixée à 60 s (pas de réglage) ; `css/style.css` (ancien monolithe du Lot 0, non référencé par `index.html`) est resté dans le dépôt, à supprimer si plus utile.

---

## Lot 8 — Persistance projet ✅ Terminé

**Tâches**
- [x] Sérialiser l'état complet (code de chaque passe + inputs branchés) en JSON
- [x] Sauvegarde locale (`localStorage` **et** export/import fichier `.json`) — pas de backend, donc pas de vrai « shader ID » partageable comme sur shadertoy.com : le partage se fait par le fichier exporté
- [x] Adapter `resetParamsBtn`/preset select existants pour aussi restaurer les inputs iChannel, pas seulement le code

**Format (version 1)** — `{ format: "bs-shader-studio-project", version: 1, name, savedAt, activePassId, passes: [{ id, code, inputs: [×4] }] }`, avec les mêmes formes d'input que `pass-model.js` (`pass` / `asset` / `special`). Les passes sont écrites dans l'ordre canonique des onglets. `version` sert aux évolutions futures : un fichier d'une version plus récente est refusé avec un message explicite plutôt que mal interprété.

**Ce qui est fait, et où**
- `core/project-io.js` (nouveau, chargé juste avant `viewport.js`) : `serializeProject`, `validateProject`, `applyProject`, autosave, export/import, `restoreImagePreset`.
- **Topbar** : champ nom du projet + boutons **New / Open / Save** (`index.html`, `css/topbar.css`) ; le menu Preset gagne une option masquée « Custom », affichée quand l'Image ne correspond à aucun preset.
- **Autosave** : `localStorage`, clé `bs-shader-studio:autosave:v1`. Déclenché (debounce 800 ms) après chaque édition de code et après chaque `compileAllPasses()` (donc aussi branchement d'input, ajout/retrait de passe) ; forcé à `pagehide` et quand l'onglet passe en arrière-plan ; pas de réécriture si rien n'a changé. Restauré **à l'exécution du script**, avant le premier `compileShader()` de `viewport.js`. Si le stockage est indisponible (mode privé, quota), l'app continue et prévient une fois d'exporter à la main.
- **Presets / Reset** : `shaders-presets.js` gagne `SHADER_PRESET_INPUTS` (les inputs que chaque preset impose à l'Image ; aujourd'hui tous `null`, ces trois shaders n'échantillonnent rien). `restoreImagePreset()` remplace code **et** inputs de l'Image, en une seule compilation, et ne touche à aucune autre passe. Concrètement : charger un preset ne laisse plus une texture de l'ancienne Image branchée par accident.

Décisions et écarts :
- **Validation avant tout.** Un fichier importé est contrôlé (format, version, passes, doublons, ids inconnus) puis **nettoyé** : un input qui pointe vers une passe absente du projet, vers Sound, vers un asset ou une entrée spéciale inconnus est débranché avec un avertissement (même politique que `disablePass()` pour les orphelins) ; Common et Sound n'ont pas d'iChannel ; les champs superflus sont retirés. Une passe inconnue ou illisible est ignorée, un projet sans passe Image est refusé. La validation a lieu **avant** la demande de confirmation « Remplacer le projet actuel ? ». Limite de 2 Mo par fichier. Les avertissements vont dans la console, le toast n'en donne que le nombre.
- **Charger un projet repart de zéro** : toutes les passes optionnelles sont désactivées puis recréées (libération des render targets et du son), la timeline revient à 0. Un projet chargé n'hérite donc ni des pixels d'un feedback précédent, ni d'un son en cours.
- **Non persisté** (état d'exécution, pas donnée de projet) : temps courant, souris, curseur/scroll par onglet, lecture du son, contenu des buffers, résolution par Buffer (`setBufferResolution`, toujours sans UI), échelle de rendu.
- **Filet de sécurité `?fresh`** : ajouter `?fresh` à l'URL ignore l'autosave. Utile si un projet sauvegardé fige la page au chargement (ex. boucle GLSL infinie) : sans cela, l'autosave serait restauré à chaque rechargement. Un autosave corrompu ou invalide est ignoré sans planter.
- **Les valeurs de sliders** sont déjà écrites dans le code (`#define`) à la fin d'un glissement, donc elles font partie de la sauvegarde ; un glissement en cours au moment exact d'une fermeture n'est pas capturé.
- **Presets et « New »** : « New project » remplace tout (avec confirmation) ; les presets, eux, ne remplacent que l'Image, comme avant ce lot.
- Testé sans navigateur, avec le vrai `project-io.js`, le vrai `pass-registry.js`/`pass-model.js`/`asset-library.js` et un DOM/`localStorage` simulés : sérialisation d'un projet à 6 passes avec inputs de tous types, aller-retour export→import strictement identique, remplacement complet et libération des buffers, 9 cas de rejet, nettoyage d'un fichier « sale » (10 avertissements), autosave (écriture, dédup, restauration au boot sans compilation), autosave corrompu / `?fresh` / quota, presets/reset (Buffer A intact, une seule compilation), export (nom de fichier), ouverture (annulation, fichier invalide sans confirmation, trop gros, avertissements), New, debounce sur édition. **Non testé dans un navigateur** : rendu de la topbar (largeur sur petits écrans), téléchargement/ouverture réels d'un fichier, comportement de `localStorage` selon le navigateur.

---

## Lot 9 — Finitions ⏳ En cours

- [x] Keyboard comme inputs réels (`KeyboardEvent` → texture 256×3) — voir « Décisions et écarts » ci-dessous
- [x] Enlever tout Webcam du projet — voir « Webcam / Microphone — décisions et écarts »
- [x] Enlever tout Microphone du projet — voir « Webcam / Microphone — décisions et écarts »
- [x] Music : vraies pistes de `assets/music/` branchables sur `iChannel0-3` — voir « Music — décisions et écarts » ci-dessous
- [x] Retrait de l'onglet **Misc** du picker et de l'entrée **Soundcloud** — voir « Misc / Soundcloud — décisions et écarts » ci-dessous
- [x] Correctifs Buffers (pause, Reset, `iFrame == 0`, float linéaire) — voir « Buffers — correctifs » ci-dessous
- [x] Menu « + » des onglets de passes coupé (Buffer A-D introuvables) — corrigé, voir « Buffers — correctifs »
- [ ] Export vidéo (déjà existant) : vérifier compatibilité avec le nouveau render graph multi-pass
- [ ] Indicateur de performance par passe (temps GPU approximatif) si besoin

**Buffers — correctifs**
Reproduits dans un vrai Chromium (WebGL2) avec le vrai `index.html`, lecture directe des pixels du render target d'un Buffer A en self-feedback.
- **Buffer non figé en pause** : `runRenderGraph` rendait tous les Buffers à chaque frame même timeline arrêtée ; un feedback (accumulation, fondu, simulation) continuait d'évoluer alors qu'`iTime`/`iFrame` étaient gelés. Les passes à cible (Buffers, Cubemap A) ne se rendent plus que si la timeline tourne, si un export vidéo est en cours, ou sur demande ponctuelle (`requestBufferStep` : recompilation, Reset, cible recréée). Image continue de se rendre (souris, sliders).
- **Reset ne vidait pas les Buffers** : il ne remettait que `iTime`/`iFrame` à 0, l'état accumulé restait. `clearAllBufferTargets()` vide les deux cibles ping-pong (état initial nul, comme sur shadertoy.com) ; en pause, une frame est rendue pour afficher l'état initial.
- **`iFrame` ne valait jamais 0** : le temps et le compteur étaient incrémentés *avant* le rendu, donc la 1re frame voyait `iFrame = 1` et le motif `if (iFrame == 0) { init }` ne se déclenchait jamais. Ils avancent maintenant *après* le rendu (1re frame : `iTime = 0`, `iFrame = 0`, y compris après Reset).
- **Float32 non filtrable** : les cibles étaient toujours en `FloatType` + filtrage linéaire ; sans `OES_texture_float_linear` (mobile, Safari, certains iGPU) la texture est incomplète et se lit noire. Fallback `HalfFloatType` si l'extension manque (Float32 conservé sinon, pour la précision des simulations).
- **Menu « + » invisible** : le menu d'ajout de passe (Common, Buffer A-D, Cubemap A, Sound) était un enfant de `.pass-tabs`, qui a `overflow-x:auto` ; le CSS force alors `overflow-y` à `auto` et le menu (plus haut que la barre de ~34 px) était coupé, donc impossible d'ajouter/ouvrir un Buffer depuis l'UI. Le menu est maintenant attaché à `<body>` en `position:fixed`, placé sous le bouton (`editor-tabs.js`, `editor.css`). Vérifié dans Chromium : les 7 entrées sont visibles et cliquables, clic sur Buffer A → onglet créé et actif, retour sur l'onglet possible.
- **Non touché** : l'export vidéo garde son comportement (les Buffers avancent pendant l'export). La vérification de compatibilité multi-pass de l'export (tâche Lot 9 ouverte) reste à faire.
- **Testé (Chromium headless, SwiftShader)** : buffer gelé en pause (deux lectures identiques), reprise, Reset en lecture (état vidé, `iFrame == 0` déclenché), Reset en pause (frame 0 rendue puis figé), recompilation en pause, type Float32 sélectionné, aucune erreur JS. Non testé : le fallback Half-float (l'extension existe dans cet environnement).

**Misc / Soundcloud — décisions et écarts**
- **Retrait** : le picker n'a plus que 5 onglets (Textures / Cubemaps / Volumes / Vidéos / Music), il s'ouvre sur **Textures**. L'entrée Soundcloud (sans source réelle) disparaît.
- **Conséquence assumée** : Misc était le seul endroit où l'on branchait **Buffer A-D, Cubemap A et Keyboard** sur un iChannel. Depuis l'UI, on ne peut donc plus câbler de nouveau feedback/multi-pass ni le clavier. Le moteur est inchangé : les inputs déjà câblés (presets, projets, autosaves) restent chargés et fonctionnels, et la croix du slot permet toujours de les débrancher.
- `CHANNEL_PICKER_SPECIAL_INPUTS` ne garde que `keyboard` (kind reconnu au chargement). Un input `soundcloud` ancien est débranché avec un avertissement (même politique que webcam/microphone).
- Pour rétablir le câblage des passes/clavier : réintroduire un onglet (ou un groupe « Passes ») alimenté par `getPasses()` — la logique de sélection `type: "pass"`/`"special"` est toujours dans `selectChannelPickerItem`.
- Testé : `node --check` + test Node du picker (5 onglets, défaut Textures, items lus depuis `getAssetsByCategory`). Non testé dans un navigateur.

**Music — décisions et écarts (vraies pistes)**
- **Remplacement des 4 tonalités synthétisées du Lot 5** par les 4 mp3 de `assets/music/` : *Hack Systemet*, *Iconoclast*, *Vectorization Enable*, *Volum Til Maks* (ids `mus_hack_systemet`, `mus_iconoclast`, `mus_vectorization_enable`, `mus_volum_til_maks`). Déclarées dans `MUSIC_ASSETS` (`asset-library.js`) : pour ajouter une piste, déposer le fichier et ajouter une ligne.
- **Contrat shadertoy conservé** : texture **512×2** `R8`, ligne 0 = spectre (FFT 1024), ligne 1 = forme d'onde, lue via `.x` ; `iChannelResolution = (512, 2, 1)`. Le code GLSL collé depuis shadertoy.com fonctionne tel quel.
- **Lecture** : élément `<audio>` (streaming, pas de décodage complet de fichiers de 5-7 Mo) → `MediaElementSource` → `AnalyserNode` → sortie. La piste **boucle**.
- **Suivi de la timeline** : une piste ne joue que si la timeline tourne **et** qu'elle est branchée sur un slot d'une passe active (`updateMusicPlayback`, vérifié chaque frame). Pause du viewport, débranchement ou export vidéo la coupent ; Reset la ramène à 0 (`resetMusicPlayback`). Ceci corrige aussi la limite du Lot 5 (« changer d'input ne coupe pas les oscillateurs »).
- **`iChannelTime[i]`** = temps de lecture de la piste (comme sur shadertoy.com) au lieu d'`iTime` pour un slot Music (`getChannelTime`).
- **Autoplay** : le premier chargement suit un clic dans le picker (geste utilisateur). Pour un projet restauré au chargement de la page sans geste, le navigateur peut refuser : la lecture repart au premier clic/touche.
- **Écart — auteur** : les crédits des artistes ne sont pas connus, `author` vaut « Fichier local » (`MUSIC_AUTHOR`) — à remplacer par le vrai crédit.
- **Écart — vignettes** : forme d'onde décorative déterministe (pas l'onde réelle du fichier, qui imposerait de décoder 24 Mo au chargement).
- **Écart — projets existants** : un input `mus_track1..4` (anciennes pistes synthétisées) enregistré dans un projet/autosave est débranché avec un avertissement, comme tout asset inconnu.
- **Limites** : l'export vidéo n'enregistre pas l'audio de ces pistes (le temps y est piloté à la main, `iChannelTime` = temps d'export) ; ouvert en `file://`, le navigateur rend le `MediaElementSource` muet (cross-origin) — servir le site en http(s) (GitHub Pages, serveur local).
- **Testé** : `node --check` + test Node avec `Audio`/`AudioContext` simulés (4 pistes au picker, texture 512×2 remplie, play au branchement, pause/reprise timeline, reset à 0, débranchement/rebranchement, `iChannelTime`). **Non testé dans un navigateur** : son réel, réactivité du spectre, politique d'autoplay.

**Keyboard — décisions et écarts**
- **Contrat identique à shadertoy.com** : texture **256×3**, `R8` (`RedFormat`/`UnsignedByte`), colonne `x` = `keyCode` (0-255), ligne `y=0` **état** (touche enfoncée), `y=1` **pression** (1 pendant exactement une frame rendue, au `keydown`), `y=2` **toggle** (bascule à chaque nouvel appui). Le code GLSL collé depuis shadertoy.com (`texelFetch(iChannel0, ivec2(KEY, row), 0).x`) fonctionne tel quel.
- **`navigator.mediaDevices` écarté** : la roadmap le citait pour cette tâche, mais cette API sert à la webcam/au micro, pas au clavier. Le clavier n'a besoin que de `KeyboardEvent` : aucune permission, aucun geste utilisateur requis.
- **`keyCode` et non `event.code`** : `keyCode` est déprécié, mais c'est le seul identifiant numérique stable, celui que shadertoy.com expose (flèches 37-40, espace 32, A-Z 65-90…). `event.code` (« KeyA ») n'a pas d'équivalent numérique et casserait le code collé. Un code ≥ 256 est ignoré.
- **Où** : `assets/keyboard-input.js` (nouveau, chargé après `asset-loader.js`) ; `resolveChannelBinding` (`shader-compiler.js`) résout `{ type:"special", kind:"keyboard" }` en cette texture avec `iChannelResolution = (256, 3, 1)` ; `viewport.js:runRenderGraph` appelle `updateKeyboardTexture()` **une fois par frame** pour que toutes les passes voient le même état. Type de sampler déclaré : `sampler2D` (aucun changement dans `getInputSamplerType`). Une seule texture partagée par tous les slots/passes qui branchent le clavier.
- **Filtrage `NEAREST`** : chaque texel est un état discret ; un filtrage linéaire mélangerait les 3 lignes.
- **Durée de vie de la pression** : deux ensembles (pressions « fraîches » puis « montrées ») garantissent qu'une pression est visible pendant **exactement une** frame rendue, y compris si `keydown` et `keyup` surviennent entre deux frames. L'auto-repeat système (`event.repeat`) ne recompte ni pression ni toggle.
- **Champs de saisie ignorés** : une frappe dont la cible est CodeMirror, `input`, `textarea`, `select` ou un élément `contentEditable` n'atteint pas le shader (sinon taper du code ferait « jouer » le shader). En revanche `keyup` est **toujours** pris en compte, pour ne jamais laisser une touche « collée » après un changement de focus.
- **Anti-touche-collée** : `blur` de la fenêtre et onglet masqué (`visibilitychange`) relâchent tout (états et pressions ; le toggle, état persistant voulu, est conservé).
- **Défilement de page** : `preventDefault` uniquement pour espace/PageUp/PageDown/Début/Fin/flèches, **seulement** si au moins une passe active a un slot branché sur Keyboard, et jamais dans un champ de saisie. Sinon la page se comporte normalement.
- **Inertie** : les listeners sont posés au chargement mais ne font rien tant que la texture n'a pas été créée (première résolution d'un slot Keyboard) : zéro effet pour les projets qui n'utilisent pas le clavier. La texture reste ensuite en mémoire même si le slot est débranché (coût négligeable : 768 octets).
- **Actif même en pause** : la boucle de rendu tourne toujours, donc le clavier reste réactif quand la timeline est en pause.
- **Non couvert (hors périmètre)** : pas de représentation visuelle/aide dans le picker au-delà du libellé « Keyboard · 256 × 3 · touches » ; Soundcloud reste une entrée sans source (fallback noir 1×1) ; Webcam et Microphone ont été retirés ensuite (cf. ci-dessous).
- **Testé** : (1) tests Node sur le vrai `keyboard-input.js` (cycle état/pression/toggle, auto-repeat, keydown+keyup entre deux frames, champs de saisie, touche relâchée depuis un champ, `blur`/onglet masqué, codes hors plage, uploads GPU seulement si changement, `preventDefault` conditionnel) ; (2) comptage exact : la pression est vue par **1** frame rendue ; (3) intégration avec le vrai `resolveChannelBinding` + `asset-loader.js` (texture 256×3, résolution `(256,3,1)`, texture partagée, webcam/micro/soundcloud toujours en fallback noir 1×1, ordre des `<script>`) ; (4) **test de bout en bout dans un vrai Chrome (WebGL2, SwiftShader)** avec le vrai `index.html` : shader `texelFetch` lisant la touche A, pixels relus à l'écran (état, pression 1 frame, toggle on/off/persistance après relâchement), vraie frappe dans CodeMirror sans effet sur le shader, autre touche sans effet, `preventDefault` de l'espace selon que le clavier est branché ou non, aucune erreur JS. Three.js r128 et CodeMirror chargés depuis npm à la place du CDN.

**Webcam / Microphone — décisions et écarts**
- **Retrait complet** : `Webcam` et `Microphone` disparaissent de l'onglet Misc du picker (`CHANNEL_PICKER_SPECIAL_INPUTS` ne garde que `keyboard` et `soundcloud`), de leurs glyphes de vignette (`channel-picker-render.js`) et de la liste de secours de `project-io.js`. Il n'y avait **aucune acquisition à supprimer** : ni `getUserMedia`, ni `navigator.mediaDevices`, ni élément `<video>`/`<audio>` de capture — ces entrées n'ont jamais été que des étiquettes sélectionnables retombant sur le noir 1×1 (Lot 4). Aucun code de permission, de flux ou de nettoyage n'était donc en jeu.
- **Une seule source de vérité** : `CHANNEL_PICKER_SPECIAL_INPUTS` fait foi pour les kinds `special` valides. Le nettoyage à l'ouverture (`sanitizeProjectInput`, Lot 8) débranche déjà tout kind qui n'y figure pas — aucune logique de migration supplémentaire n'a été nécessaire.
- **Compatibilité ascendante** : un projet ou un autosave créé avant ce retrait et contenant `{ special, webcam }` ou `{ special, microphone }` **reste chargeable** : le slot est débranché (`null`) et un avertissement explicite est émis (« Image.iChannel0 : entrée « webcam » inconnue, débranchée »), comme pour tout input inconnu. Le shader qui échantillonnait ce canal lit alors du noir, exactement comme avant (le fallback était déjà noir 1×1) : **aucun changement visuel** pour ces projets.
- **Les commentaires historiques sont conservés** dans `channel-picker.js` et `pass-model.js` (« Webcam et Microphone ont été retirés au Lot 9 ») pour éviter qu'ils ne soient réintroduits par erreur ; ce sont les seules mentions restantes dans le code. Les passages des Lots 4 à 8 de cette roadmap décrivent l'état de l'époque et ne sont pas réécrits.
- **Hors périmètre** : `Soundcloud` est conservé (non demandé) ; il reste une entrée sans source, à trancher séparément (clé API externe).
- **Testé** dans un vrai Chrome (WebGL2) avec le vrai `index.html` : picker (Keyboard et Soundcloud seuls visibles, Webcam/Microphone absents), aucune mention dans le DOM rendu, aucune fonction globale n'appelle `getUserMedia`/`mediaDevices`, migration d'un projet ancien (2 avertissements, projet non rejeté, keyboard et soundcloud conservés), autosave ancien contenant webcam/micro (page démarrée, inputs débranchés, shader compilé), espion sur `getUserMedia` (0 appel sur toute la session), non-régression Keyboard (pixel relu à l'écran) et round-trip de projet.

---

## Ordre d'implémentation recommandé

1. Lot 0 (répertoires) — prérequis mécanique, rapide
2. Lot 1 + 2 (modèle multi-pass + onglets) — sans ça rien d'autre n'a de sens
3. Lot 3 (render graph) — rend Buffer A-D réellement fonctionnels
4. Lot 4 + 5 (picker + assets) — rend iChannel0-3 réellement utilisables
5. Lot 6 (Cubemap A) — plus isolé, peut venir après
6. Lot 7 (Sound) — le plus spécifique, dernier des passes
7. Lot 8 (persistance) — une fois le modèle de données stable
8. Lot 9 (finitions) — en continu / à la fin
