    // =========================================================
    // Lot 2 — Onglets d'édition (Common | Buffer A-D | Cubemap A |
    // Sound | Image), dans l'ordre canonique shadertoy.com.
    //
    // Un seul CodeMirror (créé dans core/state.js) dont le contenu est
    // swappé au clic d'onglet — pas une instance par passe, pour éviter
    // le coût mémoire/perf de 8 CodeMirror. Chaque switch :
    //   1. sauvegarde le code + curseur/scroll de l'onglet quitté dans le
    //      registre de passes (pass.code + un cache local scroll/cursor,
    //      même principe que commitParameterToEditor pour un seul buffer) ;
    //   2. charge le code de l'onglet ciblé dans CodeMirror ;
    //   3. restaure son curseur/scroll s'il en a déjà un, sinon place le
    //      curseur en (0,0).
    //
    // Le bouton "+" ouvre un petit menu listant les types de passe pas
    // encore actifs (getDisabledPassTypes()) ; un clic les active via
    // enablePass() et bascule directement dessus. Chaque onglet non-Image
    // a une croix qui le désactive via disablePass().
    // =========================================================

    // Curseur/scroll CodeMirror par passe, gardé en mémoire ici (pas dans
    // le modèle Pass lui-même : ce n'est pas une donnée de projet, juste
    // un confort d'édition perdu si la page est rechargée, comme pour un
    // seul buffer avant ce lot).
    let passEditorViewState = {};

    function savePassEditorViewState(id) {
        if (!editor) return;
        passEditorViewState[id] = {
            cursor: editor.getCursor(),
            scroll: editor.getScrollInfo()
        };
    }

    function restorePassEditorViewState(id) {
        const state = passEditorViewState[id];
        if (!editor) return;
        if (state) {
            editor.setCursor(state.cursor);
            editor.scrollTo(state.scroll.left, state.scroll.top);
        } else {
            editor.setCursor({ line: 0, ch: 0 });
            editor.scrollTo(0, 0);
        }
    }

    // Bascule l'éditeur sur la passe `id` : sauvegarde l'état de l'onglet
    // quitté, charge le code de la passe ciblée dans CodeMirror, restaure
    // sa vue. Ne fait rien si `id` est déjà l'onglet actif ou n'existe pas
    // dans le registre. Utilisé par renderPassTabs() (clic sur un onglet)
    // et par inspector.js (presets/reset qui forcent un retour sur "image").
    function switchToPassTab(id) {
        const target = getPass(id);
        if (!target) return;
        const current = getActivePass();
        if (current && current.id === id) return;

        if (current && editor) {
            current.code = editor.getValue();
            savePassEditorViewState(current.id);
        }

        setActivePassId(id);

        isProgrammaticChange = true;
        editor.setValue(target.code);
        isProgrammaticChange = false;

        restorePassEditorViewState(id);

        if (typeof parseAndPopulateInspector === "function") parseAndPopulateInspector();
        renderPassTabs();
    }

    function closePassAddMenu() {
        const menu = document.getElementById("passTabAddMenu");
        if (menu) menu.remove();
        document.removeEventListener("mousedown", handleOutsideAddMenuClick, true);
    }

    function handleOutsideAddMenuClick(e) {
        const menu = document.getElementById("passTabAddMenu");
        const addBtn = document.getElementById("passTabAddBtn");
        if (!menu) return;
        if (menu.contains(e.target) || (addBtn && addBtn.contains(e.target))) return;
        closePassAddMenu();
    }

    function openPassAddMenu(anchorEl) {
        closePassAddMenu();
        const disabledTypes = getDisabledPassTypes();
        if (disabledTypes.length === 0) return;

        const menu = document.createElement("div");
        menu.id = "passTabAddMenu";
        menu.className = "pass-tab-add-menu";
        disabledTypes.forEach((typeId) => {
            const item = document.createElement("div");
            item.className = "pass-tab-add-menu-item";
            item.textContent = PASS_LABELS[typeId] || typeId;
            item.addEventListener("click", () => {
                if (editor) getActivePass().code = editor.getValue();
                enablePass(typeId);
                closePassAddMenu();
                switchToPassTab(typeId);
                compileShader();
                showToast(`${PASS_LABELS[typeId] || typeId} pass added`);
            });
            menu.appendChild(item);
        });

        // Ajouté à <body> en position fixe (et non dans la barre d'onglets) :
        // .pass-tabs a overflow-x:auto, ce qui coupait le menu (donc
        // Buffer A-D, Cubemap A, Sound… étaient introuvables).
        const r = anchorEl.getBoundingClientRect();
        menu.style.left = Math.max(4, Math.min(r.left, window.innerWidth - 140)) + "px";
        menu.style.top = (r.bottom + 4) + "px";
        document.body.appendChild(menu);
        window.addEventListener("resize", closePassAddMenu, { once: true });
        // Deferred so the click that opened the menu doesn't immediately
        // close it via the document-level listener below.
        setTimeout(() => document.addEventListener("mousedown", handleOutsideAddMenuClick, true), 0);
    }

    // Rend la barre d'onglets à partir du registre de passes, dans l'ordre
    // canonique déjà maintenu par pass-registry.js (sortPassesByCanonicalOrder).
    // Appelée : au chargement, à chaque switch d'onglet, après activation/
    // désactivation d'une passe, et après chaque compileAllPasses() (pour
    // rafraîchir les badges d'erreur par passe).
    function renderPassTabs() {
        const bar = document.getElementById("passTabsBar");
        if (!bar) return;
        const activeId = getActivePass() ? getActivePass().id : null;
        bar.innerHTML = "";

        getPasses().forEach((pass) => {
            const tab = document.createElement("div");
            tab.className = "pass-tab" + (pass.id === activeId ? " active" : "");
            tab.setAttribute("data-pass-id", pass.id);

            const status = getPassCompileStatus(pass.id);
            const showError = status && !status.ok;

            const label = document.createElement("span");
            label.className = "pass-tab-label";
            label.textContent = pass.label;
            tab.appendChild(label);

            if (showError) {
                const dot = document.createElement("span");
                dot.className = "pass-tab-error";
                dot.title = status.message || "Compilation error";
                tab.appendChild(dot);
            }

            if (!PASS_ALWAYS_ON.includes(pass.id)) {
                const close = document.createElement("span");
                close.className = "pass-tab-close";
                close.innerHTML = '<svg width="9" height="9" viewBox="0 0 24 24" fill="none"><path d="M6 6L18 18M18 6L6 18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';
                close.addEventListener("click", (e) => {
                    e.stopPropagation();
                    const wasActive = pass.id === activeId;
                    disablePass(pass.id);
                    if (wasActive) {
                        // disablePass() a déjà remis activePassId sur "image"
                        // côté registre ; on recharge juste CodeMirror dessus.
                        isProgrammaticChange = true;
                        editor.setValue(getPass("image").code);
                        isProgrammaticChange = false;
                        restorePassEditorViewState("image");
                        if (typeof parseAndPopulateInspector === "function") parseAndPopulateInspector();
                    }
                    renderPassTabs();
                    compileShader();
                    showToast(`${pass.label} pass removed`);
                });
                tab.appendChild(close);
            }

            tab.addEventListener("click", () => switchToPassTab(pass.id));
            bar.appendChild(tab);
        });

        const disabledTypes = getDisabledPassTypes();
        if (disabledTypes.length > 0) {
            const addBtn = document.createElement("div");
            addBtn.id = "passTabAddBtn";
            addBtn.className = "pass-tab-add";
            addBtn.title = "Add pass";
            addBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M12 5V19M5 12H19" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
            addBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                if (document.getElementById("passTabAddMenu")) {
                    closePassAddMenu();
                } else {
                    openPassAddMenu(addBtn);
                }
            });
            bar.appendChild(addBtn);
        }

        // Lot 4 : les 4 carrés iChannel0-3 sous l'éditeur dépendent de la
        // passe active (chaque passe a ses propres inputs), donc doivent
        // être rafraîchis à chaque fois que renderPassTabs() l'est déjà
        // (switch d'onglet, activation/désactivation de passe, badge
        // d'erreur après compilation). Garde-fou typeof : editor-tabs.js
        // charge avant channel-picker.js (cf. index.html), donc l'appel
        // fait au tout premier renderPassTabs() (bas de ce fichier) est un
        // no-op — channel-picker.js peuple les slots lui-même à son
        // propre chargement, juste après.
        if (typeof renderChannelSlots === "function") renderChannelSlots();
        // Lot 7 : la barre Sound apparaît/disparaît avec l'activation de la passe.
        if (typeof renderSoundBar === "function") renderSoundBar();
    }

    renderPassTabs();
