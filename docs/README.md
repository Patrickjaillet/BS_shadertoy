# BS — Shader Studio

Éditeur de shaders GLSL en temps réel (Three.js + CodeMirror), avec viewport
intégré (plus de fenêtre popup) et panneau de sliders au-dessus.

## Structure

```
index.html              Page principale (structure + liens CSS/JS)
css/
  style.css             Toutes les règles de style
js/
  shaders.js             Presets de shaders GLSL (Default, Warp, Calm)
  state.js                État partagé (canvas, renderer, temps, params…) + init CodeMirror
  shader-compiler.js      Extraction des #define, construction du fragment shader, compilation
  sliders.js               Composant slider SVG maison (construction, drag, mise à jour)
  inspector.js             Panneau "Inspector" (génère les cartes de paramètres/sliders)
  video-export.js          Export vidéo WebM/MP4 image par image
  editor-toolbar.js        Boutons Copy/Paste + auto-compilation à la frappe
  viewport.js               Montage du viewport Three.js (canvas, transport, boucle de rendu)
```

## Ordre de chargement

Les scripts sont classiques (`<script src="...">`, pas de modules ES), donc
ils partagent un même scope global et **doivent** rester chargés dans cet
ordre (déjà en place dans `index.html`) :

1. `shaders.js` — définit les constantes `DEFAULT_SHADER`, `WARP_SHADER`, etc.
2. `state.js` — déclare les variables partagées et initialise CodeMirror
3. `shader-compiler.js`
4. `sliders.js`
5. `inspector.js`
6. `video-export.js`
7. `editor-toolbar.js`
8. `viewport.js` — monte le viewport et lance la boucle de rendu (appelle `mountViewport()` à la fin)

## Lancer le projet

Ouvrez simplement `index.html` dans un navigateur (double-clic ou
`open index.html`). Aucun serveur n'est nécessaire : toutes les dépendances
externes (Three.js, CodeMirror, polices) sont chargées via CDN.
