# BS — Shader Studio

Éditeur de shaders GLSL en temps réel (Three.js + CodeMirror) façon
shadertoy.com : multi-pass (**Common / Buffer A-D / Cubemap A / Sound / Image**),
sélecteur d'input `iChannel0-3`, bibliothèque d'assets, viewport intégré et
panneau de sliders (`#define` exposés) au-dessus.

> État du projet et décisions de conception : voir `../ROADMAP.md`
> (Lots 0 à 8 terminés ; Lot 9 « finitions » en cours).

## Structure

```
index.html                 Page principale (structure + liens CSS/JS)

css/
  base.css                  Reset, variables, layout général, CodeMirror, toast
  topbar.css                 Barre du haut (brand, télémétrie, sélecteur de preset)
  editor.css                  Rail éditeur (CodeMirror, toolbar, onglets de passes)
  inspector.css                Panneau Inspector (sliders, cartes de paramètres)
  viewport.css                  Cadre laiton, transport, canvas
  channel-picker.css             Modale « Select input for iChannelN »
  sound-bar.css                   Barre Sound (play/pause + progression de génération)
  export-modal.css                 Modale d'export vidéo
  style.css                         (ancien monolithe du Lot 0, plus référencé)

js/
  core/
    shaders-presets.js     Presets de démarrage (+ inputs iChannel de chaque preset)
    state.js                 État global partagé, CodeMirror, mountRenderer()
    project-io.js             Persistance : projet JSON, autosave localStorage, export/import

  passes/
    pass-model.js            Objet Pass (id, code, inputs[4], target) + gabarits
    pass-registry.js          Passes actives du projet (activer/désactiver, inputs)
    render-graph.js            Ordre de rendu (tri topologique, feedback, cycles)
    sound-pass.js               Sound shader : rendu offline par blocs + lecture Web Audio,
                                calée sur la timeline (iTime)

  buffers/
    buffer-manager.js        Render targets ping-pong des Buffer A-D
    cubemap-pass.js            Rendu 6 faces de Cubemap A

  assets/
    asset-library.js         Métadonnées + génération procédurale des assets
    asset-loader.js            Chargement/cache des textures, cubemaps, volumes, vidéos, musique (mp3 de assets/music/)
    keyboard-input.js          Entrée Keyboard : KeyboardEvent → texture 256×3 (état/pression/toggle)

  compiler/
    glsl-transform.js        Transforms GLSL purs (#define, boucles, texture2D→texture)
    shader-compiler.js        Assemble et compile chaque passe (wrappers Image/Cubemap/Sound)

  ui/
    editor-tabs.js           Onglets de passes
    editor-toolbar.js         Copy/Paste + auto-compilation
    sliders.js                 Slider SVG maison
    inspector.js                Cartes de paramètres par passe
    channel-picker/
      channel-picker.js        Modale d'input (6 onglets) + carrés iChannel0-3
      channel-picker-render.js  Grilles de vignettes + pagination

  video-export.js             Export vidéo WebM/MP4 image par image
  viewport.js                  Transport (play/pause/reset), boucle de rendu, render graph
```

## Ordre de chargement

Les scripts sont classiques (`<script src="...">`, pas de modules ES), donc
ils partagent un même scope global et **doivent** rester chargés dans l'ordre
de `index.html` :

1. `core/shaders-presets.js`, `core/state.js`
2. `passes/pass-model.js`
3. `buffers/buffer-manager.js`, `buffers/cubemap-pass.js`
4. `passes/pass-registry.js`, `passes/render-graph.js`, `passes/sound-pass.js`
5. `assets/asset-library.js`, `assets/asset-loader.js`, `assets/keyboard-input.js`
6. `ui/editor-tabs.js`, `ui/channel-picker/*`
7. `compiler/glsl-transform.js`, `compiler/shader-compiler.js`
8. `ui/sliders.js`, `ui/inspector.js`, `video-export.js`, `ui/editor-toolbar.js`
9. `core/project-io.js` — restaure l'autosave, donc avant le premier compile
10. `viewport.js` — en dernier : monte le renderer et lance la boucle (`mountViewport()`)

## Sound shader

Ajoutez l'onglet **Sound** (bouton `+`) et implémentez
`vec2 mainSound(int samp, float time)` (sortie stéréo dans [-1, 1]). Le shader est
évalué offline sur 60 s à 44,1 kHz (barre de progression), puis lu en boucle
avec le bouton play de la barre Sound. La position audio suit `iTime` : pause et
reset du viewport se répercutent sur le son.

## Keyboard

Dans le sélecteur d'input (onglet **Misc**), **Keyboard** branche le clavier sur un
`iChannelN`, comme sur shadertoy.com : une texture 256×3 où la colonne `x` est le
`keyCode` de la touche et la ligne `y` l'information lue :

| `y` | Signification |
|---|---|
| 0 | **état** : 1 tant que la touche est enfoncée |
| 1 | **pression** : 1 pendant une seule frame, à l'appui |
| 2 | **toggle** : bascule 0/1 à chaque nouvel appui |

```glsl
// flèche gauche = 37, haut = 38, droite = 39, bas = 40, espace = 32, A-Z = 65-90
float down    = texelFetch(iChannel0, ivec2(37, 0), 0).x;
float pressed = texelFetch(iChannel0, ivec2(32, 1), 0).x;
float toggle  = texelFetch(iChannel0, ivec2(75, 2), 0).x; // touche K
```

Les frappes dans l'éditeur de code ou un champ de saisie sont ignorées par le shader.
Tant qu'un shader écoute le clavier, espace et les flèches ne font plus défiler la page.
Le clavier reste actif même quand la timeline est en pause.

## Projets

Le projet (code de chaque passe, inputs iChannel, onglet actif, nom) est
**sauvegardé automatiquement** dans le navigateur (`localStorage`) et restauré au
rechargement. Depuis la barre du haut : **New** (projet vierge), **Open** (importer un
fichier `.json`) et **Save** (exporter `<nom>.bsproject.json`). Il n'y a pas de serveur :
pour partager un shader, envoyez le fichier exporté.

Si un projet sauvegardé bloque la page au chargement (ex. boucle GLSL infinie), ouvrez
la page avec `?fresh` (`index.html?fresh`) pour ignorer l'autosave, puis corrigez ou
exportez ce qui peut l'être.

## Lancer le projet

Ouvrez simplement `index.html` dans un navigateur (double-clic ou
`open index.html`). Aucun serveur n'est nécessaire : toutes les dépendances
externes (Three.js, CodeMirror, polices) sont chargées via CDN.
