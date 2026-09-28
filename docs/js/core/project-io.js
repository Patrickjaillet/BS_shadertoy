    // =========================================================
    // Lot 8 — Persistance projet.
    //
    // Un « projet » = l'ensemble des passes actives (code) + les 4 inputs
    // iChannel de chacune + l'onglet actif + un nom. Trois usages :
    //   1. AUTOSAVE dans localStorage (restauré au chargement de la page) ;
    //   2. EXPORT / IMPORT d'un fichier .json (partage, sauvegarde) ;
    //   3. « New project », et restauration d'une passe Image de preset
    //      (code ET inputs, cf. restoreImagePreset).
    //
    // Pas de backend : pas de « shader ID » partageable comme sur
    // shadertoy.com — le partage se fait par le fichier .json exporté.
    //
    // Format (version 1) :
    //   {
    //     format: "bs-shader-studio-project", version: 1,
    //     name: "…", savedAt: "ISO-8601", activePassId: "image",
    //     passes: [ { id: "image", code: "…", inputs: [null|input ×4] }, … ]
    //   }
    // avec input = { type:"pass", id } | { type:"asset", assetId } |
    //              { type:"special", kind } (cf. pass-model.js).
    //
    // Ce qui n'est PAS persisté (état d'exécution, pas donnée de projet) :
    // temps courant, position de la souris, scroll/curseur des onglets,
    // lecture du son, contenu des buffers (un feedback repart à zéro), et
    // la résolution par Buffer (aucune UI pour la modifier pour l'instant).
    //
    // Chargé juste avant viewport.js : la restauration de l'autosave se
    // fait ici, à l'exécution du script, donc AVANT le premier
    // compileShader() lancé par mountViewport().
    // =========================================================

    const PROJECT_FORMAT = "bs-shader-studio-project";
    const PROJECT_VERSION = 1;
    const PROJECT_AUTOSAVE_KEY = "bs-shader-studio:autosave:v1";
    const PROJECT_AUTOSAVE_DELAY_MS = 800;
    const PROJECT_MAX_FILE_BYTES = 2 * 1024 * 1024;
    const PROJECT_NAME_MAX = 60;
    const PROJECT_DEFAULT_NAME = "Untitled";

    let projectName = PROJECT_DEFAULT_NAME;
    let projectLastSavedSignature = null;
    let projectAutosaveTimer = null;
    let projectAutosaveWarned = false;

    // -------------------------------------------------------------------
    // Sérialisation
    // -------------------------------------------------------------------
    function cloneProjectInput(input) {
        if (!input) return null;
        if (input.type === "pass") return { type: "pass", id: input.id };
        if (input.type === "asset") return { type: "asset", assetId: input.assetId };
        if (input.type === "special") return { type: "special", kind: input.kind };
        return null;
    }

    function sanitizeProjectName(name) {
        if (typeof name !== "string") return PROJECT_DEFAULT_NAME;
        const clean = name.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, PROJECT_NAME_MAX);
        return clean || PROJECT_DEFAULT_NAME;
    }

    // Objet projet à partir de l'état courant. Le code de la passe active
    // vit dans CodeMirror tant qu'on n'a pas changé d'onglet : on le
    // rapatrie dans le registre d'abord.
    function serializeProject(withTimestamp = true) {
        const active = getActivePass();
        if (active && typeof editor !== "undefined" && editor) active.code = editor.getValue();
        const project = {
            format: PROJECT_FORMAT,
            version: PROJECT_VERSION,
            name: projectName,
            activePassId: active ? active.id : "image",
            passes: getPasses().map((p) => ({
                id: p.id,
                code: p.code,
                inputs: p.inputs.map(cloneProjectInput)
            }))
        };
        if (withTimestamp) project.savedAt = new Date().toISOString();
        return project;
    }

    function createDefaultProject() {
        return {
            format: PROJECT_FORMAT,
            version: PROJECT_VERSION,
            name: PROJECT_DEFAULT_NAME,
            activePassId: "image",
            passes: [{ id: "image", code: DEFAULT_SHADER, inputs: [null, null, null, null] }]
        };
    }

    // -------------------------------------------------------------------
    // Validation. Ne fait jamais confiance au contenu : un fichier édité
    // à la main, tronqué ou d'une autre version ne doit ni planter le
    // chargement ni laisser un input orphelin qui casserait le render
    // graph. Retourne { ok, project, warnings } ou { ok:false, error }.
    // -------------------------------------------------------------------
    function knownProjectAssetIds() {
        const ids = new Set();
        if (typeof getAssetsByCategory === "function") {
            ["textures", "cubemaps", "volumes", "videos", "music"].forEach((cat) => {
                getAssetsByCategory(cat).forEach((a) => ids.add(a.assetId));
            });
        }
        return ids;
    }

    function knownProjectSpecialKinds() {
        return typeof CHANNEL_PICKER_SPECIAL_INPUTS !== "undefined"
            ? new Set(CHANNEL_PICKER_SPECIAL_INPUTS.map((s) => s.kind))
            : new Set(["keyboard"]);
    }

    // Nettoie UN input : retourne { input, warning }. `passIds` = ids des
    // passes qui existeront dans le projet. Un input qui pointe vers une
    // passe absente, non renderable, ou vers un asset inconnu devient null
    // (même politique que disablePass() pour les inputs orphelins).
    function sanitizeProjectInput(raw, passIds, assetIds, specialKinds, where) {
        if (raw === null || raw === undefined) return { input: null };
        if (!isValidPassInput(raw)) return { input: null, warning: `${where} : input invalide, débranché` };
        if (raw.type === "pass") {
            const ok = passIds.has(raw.id) && PASS_RENDERABLE_TYPES.includes(raw.id) && raw.id !== "sound";
            return ok ? { input: { type: "pass", id: raw.id } }
                      : { input: null, warning: `${where} : passe « ${raw.id} » absente du projet, débranché` };
        }
        if (raw.type === "asset") {
            return assetIds.has(raw.assetId) ? { input: { type: "asset", assetId: raw.assetId } }
                      : { input: null, warning: `${where} : asset « ${raw.assetId} » inconnu, débranché` };
        }
        return specialKinds.has(raw.kind) ? { input: { type: "special", kind: raw.kind } }
                  : { input: null, warning: `${where} : entrée « ${raw.kind} » inconnue, débranchée` };
    }

    function sanitizeProjectInputs(rawInputs, passId, passIds, assetIds, specialKinds, warnings) {
        const out = [null, null, null, null];
        // Common et Sound n'ont pas d'iChannel (cf. channel-picker.js).
        if (passId === "common" || passId === "sound") return out;
        for (let i = 0; i < 4; i++) {
            const raw = Array.isArray(rawInputs) ? rawInputs[i] : null;
            const r = sanitizeProjectInput(raw, passIds, assetIds, specialKinds, `${PASS_LABELS[passId]}.iChannel${i}`);
            out[i] = r.input;
            if (r.warning) warnings.push(r.warning);
        }
        return out;
    }

    function validateProject(raw) {
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
            return { ok: false, error: "Le fichier ne contient pas un projet." };
        }
        if (raw.format !== PROJECT_FORMAT) {
            return { ok: false, error: "Ce fichier n'est pas un projet BS Shader Studio." };
        }
        if (!Number.isInteger(raw.version) || raw.version < 1) {
            return { ok: false, error: "Version de projet illisible." };
        }
        if (raw.version > PROJECT_VERSION) {
            return { ok: false, error: `Projet créé avec une version plus récente (v${raw.version}) : mettez l'application à jour.` };
        }
        if (!Array.isArray(raw.passes) || raw.passes.length === 0) {
            return { ok: false, error: "Le projet ne contient aucune passe." };
        }

        const warnings = [];
        const seen = new Map(); // id → entrée brute retenue
        raw.passes.forEach((entry) => {
            if (!entry || typeof entry !== "object" || typeof entry.id !== "string" || typeof entry.code !== "string") {
                warnings.push("Une passe illisible a été ignorée.");
                return;
            }
            if (!PASS_TYPES.includes(entry.id)) {
                warnings.push(`Passe inconnue « ${entry.id} » ignorée.`);
                return;
            }
            if (seen.has(entry.id)) {
                warnings.push(`Passe « ${entry.id} » en double : la première est conservée.`);
                return;
            }
            seen.set(entry.id, entry);
        });
        if (!seen.has("image")) {
            return { ok: false, error: "Le projet n'a pas de passe Image." };
        }

        const passIds = new Set(seen.keys());
        const assetIds = knownProjectAssetIds();
        const specialKinds = knownProjectSpecialKinds();
        const passes = PASS_TYPES
            .filter((id) => seen.has(id))
            .map((id) => ({
                id: id,
                code: seen.get(id).code,
                inputs: sanitizeProjectInputs(seen.get(id).inputs, id, passIds, assetIds, specialKinds, warnings)
            }));
        // Ordre canonique (celui des onglets), pas celui du fichier.
        const canonical = ["common", "bufferA", "bufferB", "bufferC", "bufferD", "cubemapA", "sound", "image"];
        passes.sort((a, b) => canonical.indexOf(a.id) - canonical.indexOf(b.id));

        return {
            ok: true,
            warnings: warnings,
            project: {
                format: PROJECT_FORMAT,
                version: PROJECT_VERSION,
                name: sanitizeProjectName(raw.name),
                activePassId: passIds.has(raw.activePassId) ? raw.activePassId : "image",
                passes: passes
            }
        };
    }

    // -------------------------------------------------------------------
    // Application d'un projet (déjà validé) à l'application vivante.
    //
    // On désactive d'abord TOUTES les passes optionnelles avant de les
    // recréer : disablePass() libère leurs render targets/matériaux (et
    // coupe le son), ce qui remet aussi à zéro tout état de feedback —
    // un projet chargé ne doit pas hériter des pixels du précédent.
    // `opts.compile === false` pour le tout premier chargement (le
    // renderer n'existe pas encore : viewport.js compile ensuite).
    // -------------------------------------------------------------------
    function applyProject(project, opts) {
        const compile = !(opts && opts.compile === false);

        getPasses().map((p) => p.id)
            .filter((id) => !PASS_ALWAYS_ON.includes(id))
            .forEach((id) => disablePass(id));

        project.passes.forEach((p) => {
            if (p.id === "image") getPass("image").code = p.code;
            else enablePass(p.id, p.code);
        });
        project.passes.forEach((p) => {
            for (let i = 0; i < 4; i++) setPassInput(p.id, i, cloneProjectInput(p.inputs[i]));
        });

        if (typeof passEditorViewState !== "undefined") passEditorViewState = {};
        setActivePassId(getPass(project.activePassId) ? project.activePassId : "image");

        isProgrammaticChange = true;
        editor.setValue(getActivePass().code);
        isProgrammaticChange = false;
        editor.setCursor({ line: 0, ch: 0 });

        projectName = sanitizeProjectName(project.name);
        syncProjectNameField();
        syncPresetSelectToImageCode();

        if (typeof renderPassTabs === "function") renderPassTabs();
        if (compile) {
            if (typeof resetTransportTime === "function") resetTransportTime();
            compileShader();
        }
    }

    // Le menu Preset affiche le preset dont le code est celui de l'Image
    // courante, sinon « Custom » (option masquée de index.html).
    function syncPresetSelectToImageCode() {
        const select = document.getElementById("presetSelect");
        const image = getPass("image");
        if (!select || !image) return;
        const match = Object.keys(SHADER_PRESETS).find((k) => SHADER_PRESETS[k] === image.code);
        select.value = match || "custom";
    }

    function syncProjectNameField() {
        const field = document.getElementById("projectNameInput");
        if (field && field.value !== projectName) field.value = projectName;
    }

    // -------------------------------------------------------------------
    // Presets / Reset : restaurent la passe Image (code + 4 inputs) sans
    // toucher aux autres passes. Un preset ne définit pas de Buffer ; en
    // revanche il ne doit pas hériter des textures branchées sur l'Image
    // précédente, d'où la restauration explicite des inputs.
    // -------------------------------------------------------------------
    function restoreImagePreset(key) {
        const code = SHADER_PRESETS[key];
        if (typeof code !== "string") return false;
        if (typeof switchToPassTab === "function") switchToPassTab("image");

        const passIds = new Set(getPasses().map((p) => p.id));
        const assetIds = knownProjectAssetIds();
        const specialKinds = knownProjectSpecialKinds();
        const presetInputs = (typeof SHADER_PRESET_INPUTS !== "undefined" && SHADER_PRESET_INPUTS[key]) || [];
        for (let i = 0; i < 4; i++) {
            const r = sanitizeProjectInput(presetInputs[i], passIds, assetIds, specialKinds, `preset.iChannel${i}`);
            setPassInput("image", i, r.input);
        }

        getPass("image").code = code;
        isProgrammaticChange = true;
        editor.setValue(code);
        isProgrammaticChange = false;
        compileShader(); // rafraîchit aussi les 4 carrés iChannel et l'Inspector
        return true;
    }

    // -------------------------------------------------------------------
    // Autosave (localStorage)
    // -------------------------------------------------------------------
    function scheduleProjectAutosave() {
        clearTimeout(projectAutosaveTimer);
        projectAutosaveTimer = setTimeout(flushProjectAutosave, PROJECT_AUTOSAVE_DELAY_MS);
    }

    function flushProjectAutosave() {
        clearTimeout(projectAutosaveTimer);
        try {
            const signature = JSON.stringify(serializeProject(false));
            if (signature === projectLastSavedSignature) return;
            localStorage.setItem(PROJECT_AUTOSAVE_KEY, JSON.stringify(serializeProject(true)));
            projectLastSavedSignature = signature;
        } catch (err) {
            // Stockage indisponible (mode privé, quota…) : l'app reste
            // utilisable, on prévient une seule fois.
            if (!projectAutosaveWarned) {
                projectAutosaveWarned = true;
                console.warn("Autosave impossible :", err);
                showToast("Autosave indisponible : pensez à exporter le projet (Save)");
            }
        }
    }

    // Restaure l'autosave s'il existe et est valide. `?fresh` dans l'URL
    // l'ignore (filet de sécurité si un projet sauvegardé bloque la page,
    // ex. boucle GLSL infinie). Retourne true si un projet a été restauré.
    function restoreProjectAutosave() {
        try {
            if (typeof location !== "undefined" && /[?&]fresh\b/.test(location.search || "")) return false;
            const text = localStorage.getItem(PROJECT_AUTOSAVE_KEY);
            if (!text) return false;
            const result = validateProject(JSON.parse(text));
            if (!result.ok) { console.warn("Autosave ignorée :", result.error); return false; }
            applyProject(result.project, { compile: false });
            projectLastSavedSignature = JSON.stringify(serializeProject(false));
            return true;
        } catch (err) {
            console.warn("Autosave illisible :", err);
            return false;
        }
    }

    // -------------------------------------------------------------------
    // Export / import fichier .json
    // -------------------------------------------------------------------
    function projectFileName() {
        const slug = projectName.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
        return (slug || "shader-project") + ".bsproject.json";
    }

    function saveProjectToFile() {
        const json = JSON.stringify(serializeProject(true), null, 2);
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = projectFileName();
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        flushProjectAutosave();
        showToast("Project saved: " + a.download);
    }

    // Importe un texte JSON. Séparé de la lecture du fichier pour rester
    // testable. Retourne { ok, error?, warnings? }.
    function importProjectFromText(text) {
        let raw;
        try { raw = JSON.parse(text); }
        catch (err) { return { ok: false, error: "Fichier JSON invalide." }; }
        const result = validateProject(raw);
        if (!result.ok) return result;
        applyProject(result.project);
        flushProjectAutosave();
        return { ok: true, warnings: result.warnings };
    }

    async function openProjectFromFile(file) {
        if (!file) return;
        if (file.size > PROJECT_MAX_FILE_BYTES) {
            showToast("Fichier trop volumineux (max 2 Mo)");
            return;
        }
        let text;
        try { text = await file.text(); }
        catch (err) { showToast("Lecture du fichier impossible"); return; }

        // On valide AVANT de demander confirmation : inutile de proposer
        // d'écraser le projet courant par un fichier inutilisable.
        let raw;
        try { raw = JSON.parse(text); }
        catch (err) { showToast("Fichier JSON invalide"); return; }
        const check = validateProject(raw);
        if (!check.ok) { showToast(check.error); return; }
        if (!window.confirm("Remplacer le projet actuel par « " + check.project.name + " » ?")) return;

        const result = importProjectFromText(text);
        if (!result.ok) { showToast(result.error); return; }
        if (result.warnings.length) {
            console.warn("Import de projet — avertissements :\n" + result.warnings.join("\n"));
            showToast(`Project loaded (${result.warnings.length} avertissement${result.warnings.length > 1 ? "s" : ""}, cf. console)`);
        } else {
            showToast("Project loaded: " + projectName);
        }
    }

    function newProject() {
        if (!window.confirm("Créer un nouveau projet ? Le projet actuel sera remplacé.")) return;
        applyProject(createDefaultProject());
        flushProjectAutosave();
        showToast("New project");
    }

    // -------------------------------------------------------------------
    // Câblage UI (topbar) + déclencheurs d'autosave
    // -------------------------------------------------------------------
    (function wireProjectUi() {
        const $ = (id) => document.getElementById(id);
        if ($("projectSaveBtn")) $("projectSaveBtn").addEventListener("click", saveProjectToFile);
        if ($("projectNewBtn")) $("projectNewBtn").addEventListener("click", newProject);
        const fileInput = $("projectFileInput");
        if ($("projectOpenBtn") && fileInput) {
            $("projectOpenBtn").addEventListener("click", () => fileInput.click());
            fileInput.addEventListener("change", () => {
                const file = fileInput.files && fileInput.files[0];
                fileInput.value = ""; // permet de rouvrir le même fichier
                openProjectFromFile(file);
            });
        }
        const nameField = $("projectNameInput");
        if (nameField) {
            nameField.addEventListener("change", () => {
                projectName = sanitizeProjectName(nameField.value);
                nameField.value = projectName;
                scheduleProjectAutosave();
            });
        }
        // Toute modification du code (y compris un commit de slider, qui
        // passe par isProgrammaticChange) est candidate à l'autosave ; les
        // changements d'inputs/onglets passent par compileAllPasses().
        if (typeof editor !== "undefined" && editor) editor.on("change", scheduleProjectAutosave);
        window.addEventListener("pagehide", flushProjectAutosave);
        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "hidden") flushProjectAutosave();
        });
    })();

    restoreProjectAutosave();
