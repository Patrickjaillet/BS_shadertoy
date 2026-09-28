    // =========================================================
    // Lot 3 — Render graph.
    //
    // À partir des inputs[] de chaque passe renderable active (cf.
    // pass-registry.js:setPassInput, format défini dans pass-model.js),
    // calcule l'ORDRE dans lequel les passes doivent être rendues chaque
    // frame pour que toute passe qui lit une autre passe en iChannel la
    // trouve déjà à jour (rendue plus tôt dans la même frame).
    //
    // Cas particulier central, comme sur shadertoy.com : un Buffer qui se
    // lit LUI-MÊME sur un de ses iChannel (ex. Buffer A → iChannel0 =
    // Buffer A) n'est PAS une erreur, c'est le mécanisme de feedback
    // (accumulation d'état d'une frame à l'autre : simulation, traînées,
    // buffers de vie type "Game of Life", etc.). C'est justement pour ça
    // que buffer-manager.js alloue deux render targets par buffer actif
    // (ping-pong) : la passe écrit dans le target "write" de la frame
    // courante en lisant le target "read" (résultat de la frame
    // précédente), jamais les deux en même temps sur la même texture.
    //
    // Un cycle entre passes DIFFÉRENTES (Buffer A lit Buffer B qui lit
    // Buffer A) n'a en revanche pas de sens : aucun ordre de rendu dans la
    // frame ne peut satisfaire les deux en même temps sans ping-pong
    // partagé entre elles, ce que shadertoy.com ne propose pas non plus.
    // C'est signalé comme une erreur de render graph (pas une erreur de
    // compilation GLSL — le code de chaque passe compile très bien isolé).
    // =========================================================

    // Dépendances "pass" d'une passe : les canaux dont l'input est de type
    // "pass" et qui ciblent une AUTRE passe (le self-feedback n'est pas une
    // dépendance d'ordonnancement — la passe se lit elle-même via le
    // render target "read" de la frame précédente, cf. buffer-manager.js).
    // Les inputs de type "asset" (Lot 5) ou non branchés n'imposent aucune
    // contrainte d'ordre : ils sont résolus indépendamment du render graph.
    function getPassDependencies(pass) {
        const deps = [];
        pass.inputs.forEach((input) => {
            if (input && input.type === "pass" && input.id !== pass.id) {
                deps.push(input.id);
            }
        });
        return deps;
    }

    function isSelfFeedback(pass, channelIndex) {
        const input = pass.inputs[channelIndex];
        return !!(input && input.type === "pass" && input.id === pass.id);
    }

    // -------------------------------------------------------------------
    // Tri topologique (DFS, détection de cycle) sur les passes renderable
    // actives. Retourne { order, cycles } :
    //   - order  : liste de passes dans un ordre de rendu valide (les
    //              dépendances "pass" d'une passe apparaissent avant elle).
    //              Ordre stable pour les passes indépendantes (garde
    //              l'ordre canonique du registre, cf.
    //              sortPassesByCanonicalOrder), pour un rendu déterministe
    //              d'une frame à l'autre.
    //   - cycles : liste de cycles invalides détectés, chacun sous la
    //              forme d'un tableau d'ids de passes (ex. ["bufferA",
    //              "bufferB"]) formant la boucle. Une passe impliquée dans
    //              un cycle invalide est EXCLUE de `order` (elle ne peut
    //              pas être rendue de façon cohérente) mais reste dans le
    //              registre — l'utilisateur peut corriger son branchement
    //              via le picker (Lot 4) sans perdre son code.
    // Le self-feedback n'entre jamais dans ce calcul de cycle : voir
    // getPassDependencies ci-dessus, qui l'exclut déjà des dépendances.
    // -------------------------------------------------------------------
    function buildRenderGraph(passes) {
        const renderable = passes.filter(isRenderablePass);
        const byId = {};
        renderable.forEach((p) => { byId[p.id] = p; });

        const WHITE = 0, GRAY = 1, BLACK = 2;
        const color = {};
        renderable.forEach((p) => { color[p.id] = WHITE; });

        const order = [];
        const cycles = [];
        const excluded = new Set();

        function visit(pass, stack) {
            if (color[pass.id] === BLACK) return;
            if (color[pass.id] === GRAY) {
                // Cycle trouvé : la portion de `stack` depuis la première
                // occurrence de pass.id jusqu'à maintenant forme la boucle.
                const startIdx = stack.indexOf(pass.id);
                const cycle = stack.slice(startIdx).concat(pass.id);
                cycles.push(cycle);
                cycle.forEach((id) => excluded.add(id));
                return;
            }
            color[pass.id] = GRAY;
            stack.push(pass.id);
            getPassDependencies(pass).forEach((depId) => {
                const depPass = byId[depId];
                if (!depPass) return; // référence une passe désactivée/inexistante : ignorée (débranchée par disablePass)
                visit(depPass, stack);
            });
            stack.pop();
            color[pass.id] = BLACK;
            order.push(pass);
        }

        // Parcourt dans l'ordre canonique du registre pour un résultat
        // déterministe : deux passes sans dépendance entre elles gardent
        // l'ordre Common|Buffer A-D|Cubemap A|Sound|Image existant.
        renderable.forEach((p) => visit(p, []));

        const validOrder = order.filter((p) => !excluded.has(p.id));

        return { order: validOrder, cycles, excludedIds: Array.from(excluded) };
    }
