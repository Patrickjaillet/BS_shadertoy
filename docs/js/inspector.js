    function parseAndPopulateInspector() {
        const code = editor.getValue();
        const container = document.getElementById("inspectorContainer");
        const filter = document.getElementById("paramSearch").value.toLowerCase();

        const loopNames = findLoopConstantNames(code);
        const params = extractParams(code).filter(p => !loopNames.has(p.name));

        currentParameters = params;
        container.innerHTML = "";

        params.forEach((param, idx) => {
            if (filter && !param.name.toLowerCase().includes(filter)) return;

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

            const sliderId = "slider_" + idx + "_" + param.name;

            const card = document.createElement("div");
            card.className = "param-card";
            card.innerHTML = `
                <div class="param-top">
                    <span class="param-name" title="${param.name}">${param.name}</span>
                    <input type="number" step="${step}" value="${param.value}" class="param-num-input param-num" data-name="${param.name}">
                </div>
                ${buildSliderSVG(sliderId, min, max, param.value)}
            `;

            container.appendChild(card);

            const svg = card.querySelector("svg.svg-slider");
            attachSliderEvents(svg, (val) => {
                const numInput = card.querySelector(".param-num-input");
                let display = Math.abs(val) < 0.01 && val !== 0 ? val.toFixed(4) : val.toFixed(3).replace(/0+$/,'').replace(/\.$/,'');
                numInput.value = display;
                setLiveParameterValue(param.name, val);
            }, (val) => {
                commitParameterToEditor(param.name, val);
            });
        });

        container.querySelectorAll(".param-num-input").forEach(input => {
            input.addEventListener("change", (e) => {
                const name = e.target.getAttribute("data-name");
                const val = parseFloat(e.target.value);
                const card = e.target.closest(".param-card");
                const svg = card.querySelector("svg.svg-slider");
                if (svg) sliderSetValue(svg, val);
                setLiveParameterValue(name, val);
                commitParameterToEditor(name, val);
            });
        });
    }

    function setLiveParameterValue(paramName, newValue) {
        // Push the value straight to the live shader uniform — no recompile,
        // no editor text touched, so this is cheap enough to run every drag tick.
        const p = currentParameters.find((p) => p.name === paramName);
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

    document.getElementById("presetSelect").addEventListener("change", (e) => {
        const preset = SHADER_PRESETS[e.target.value];
        if (preset) {
            editor.setValue(preset);
            compileShader();
            showToast("Preset loaded: " + e.target.options[e.target.selectedIndex].text);
        }
    });

    document.getElementById("resetParamsBtn").addEventListener("click", () => {
        editor.setValue(DEFAULT_SHADER);
        compileShader();
        showToast("Parameters reset");
    });
