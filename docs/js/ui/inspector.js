    // Lot 2 : parseAndPopulateInspector opère sur la passe ACTIVE de
    // l'éditeur (celle dont l'onglet est sélectionné, cf. editor-tabs.js),
    // plus seulement "image" en dur (Lot 1). Les params portent un
    // uniformName préfixé par passe (ex. "bufferA_RAYON") en plus de leur
    // name d'origine (ex. "RAYON", tel qu'écrit dans le #define).
    // L'Inspector affiche et identifie chaque carte via uniformName pour
    // rester unique même si plusieurs passes actives partagent un nom de
    // constante ; la ré-écriture dans l'éditeur (commitParameterToEditor)
    // continue elle de chercher le #define par son `name` d'origine,
    // propre au texte de la passe affichée.
    function parseAndPopulateInspector() {
        const pass = getActivePass();
        if (!pass) return;
        const code = editor.getValue();
        pass.code = code;
        const container = document.getElementById("inspectorContainer");
        const filter = document.getElementById("paramSearch").value.toLowerCase();

        const loopNames = findLoopConstantNames(code);
        const params = extractParams(code, pass.id).filter(p => !loopNames.has(p.name));

        currentParameters = params;
        container.innerHTML = "";

        params.forEach((param, idx) => {
            if (filter && !param.uniformName.toLowerCase().includes(filter)) return;

            let min = 0;
            let max = param.value * 2.5;
            if (param.value < 0) {
                min = param.value * 3;
                max = Math.abs(param.value);
            } else if (param.value === 0) {
                min = -1.0;
                max = 1.0;
            }
            if (min === max) {
                min = 0;
                max = 10;
            }

            let step = 0.01;
            if (Math.abs(param.value) < 0.01 && param.value !== 0) step = 0.0001;
            else if (Math.abs(param.value) > 50) step = 1.0;

            const sliderId = "slider_" + idx + "_" + param.uniformName;

            const card = document.createElement("div");
            card.className = "param-card";
            card.innerHTML = `
                <div class="param-top">
                    <span class="param-name" title="${param.uniformName}">${param.uniformName}</span>
                    <input type="number" step="${step}" value="${param.value}" class="param-num-input param-num" data-uniform-name="${param.uniformName}" data-name="${param.name}">
                </div>
                ${buildSliderSVG(sliderId, min, max, param.value)}
            `;

            container.appendChild(card);

            const svg = card.querySelector("svg.svg-slider");
            attachSliderEvents(svg, (val) => {
                const numInput = card.querySelector(".param-num-input");
                let display = Math.abs(val) < 0.01 && val !== 0 ? val.toFixed(4) : val.toFixed(3).replace(/0+$/,'').replace(/\.$/,'');
                numInput.value = display;
                setLiveParameterValue(param.uniformName, val);
            }, (val) => {
                commitParameterToEditor(param.name, val);
            });
        });

        container.querySelectorAll(".param-num-input").forEach(input => {
            input.addEventListener("change", (e) => {
                const uniformName = e.target.getAttribute("data-uniform-name");
                const name = e.target.getAttribute("data-name");
                const val = parseFloat(e.target.value);
                const card = e.target.closest(".param-card");
                const svg = card.querySelector("svg.svg-slider");
                if (svg) sliderSetValue(svg, val);
                setLiveParameterValue(uniformName, val);
                commitParameterToEditor(name, val);
            });
        });
    }

    function setLiveParameterValue(uniformName, newValue) {
        // Push the value straight to the live shader uniform — no recompile,
        // no editor text touched, so this is cheap enough to run every drag tick.
        // Lookup by uniformName (préfixé par passe) pour rester unique même
        // si deux passes actives partagent un nom de #define d'origine.
        //
        // Lot 3 : le render graph (viewport.js:runRenderGraph) rend
        // désormais réellement toutes les passes actives, pas seulement
        // "image" — et lit currentParameters pour la passe dont l'onglet
        // est actif dans l'éditeur (`getActivePass().id === pass.id`),
        // exactement le même tableau que celui peuplé ici par
        // parseAndPopulateInspector() pour la passe active, quelle qu'elle
        // soit. Un drag de slider sur l'onglet Buffer A doit donc pousser
        // la valeur en direct au Buffer A affiché à l'écran (via Image qui
        // le lit, ou directement si Buffer A alimente le canvas), pas
        // seulement mettre à jour le chiffre affiché sur la carte — ce
        // qu'un garde-fou "image uniquement" hérité du Lot 2 empêchait
        // encore ici avant ce lot.
        const p = currentParameters.find((p) => p.uniformName === uniformName);
        if (p) p.value = newValue;
    }

    function commitParameterToEditor(paramName, newValue) {
        // Sync the tweaked value back into the visible code. Only called once,
        // when a drag ends (or from the numeric input), since rewriting the
        // whole editor on every pointermove is what caused the render stalls.
        const code = editor.getValue();
        const pattern = new RegExp('(#define\\s+' + paramName + '\\s+)[-+]?\\d*\\.?\\d+(?:[eE][-+]?\\d+)?');

        if (pattern.test(code)) {
            let formatted = newValue.toString();
            if (!formatted.includes('.') && !formatted.includes('e')) {
                formatted += '.0';
            }

            isProgrammaticChange = true;
            const cursor = editor.getCursor();
            const scroll = editor.getScrollInfo();

            const updatedCode = code.replace(pattern, '$1' + formatted);
            editor.setValue(updatedCode);

            editor.setCursor(cursor);
            editor.scrollTo(scroll.left, scroll.top);
            isProgrammaticChange = false;
        }
    }

    document.getElementById("compileBtn").addEventListener("click", () => {
        compileShader();
        showToast("Shader recompiled");
    });

    document.getElementById("paramSearch").addEventListener("input", parseAndPopulateInspector);

    // Lot 2 : les presets et le reset ciblent toujours la passe "Image"
    // (ce sont des presets de shader complet façon shadertoy.com, pas des
    // fragments de Buffer/Cubemap/Sound). S'ils sont déclenchés depuis un
    // autre onglet, on bascule d'abord sur Image pour ne jamais écraser
    // silencieusement le code d'une autre passe affichée.
    // Lot 8 : restoreImagePreset() (core/project-io.js) restaure le code
    // ET les 4 inputs iChannel de l'Image, pas seulement le code.
    document.getElementById("presetSelect").addEventListener("change", (e) => {
        if (restoreImagePreset(e.target.value)) {
            showToast("Preset loaded: " + e.target.options[e.target.selectedIndex].text);
        }
    });

    document.getElementById("resetParamsBtn").addEventListener("click", () => {
        restoreImagePreset("default");
        document.getElementById("presetSelect").value = "default";
        showToast("Parameters reset");
    });
