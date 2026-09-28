    const DEFAULT_SHADER = `#define DISTORSION_LENTILLE_MIN 0.5
#define DISTORSION_LENTILLE_AMP 0.4
#define DISTORSION_LENTILLE_FREQ 1.5

#define CAMERA_RAYON_BASE 3.5
#define CAMERA_RAYON_AMP 0.5
#define CAMERA_RAYON_FREQ 0.4

#define CAMERA_AZIMUT_FREQ 0.3

#define CAMERA_ELEVATION_AMP 0.6
#define CAMERA_ELEVATION_FREQ 0.25

#define VISEE_OSCILLATION_X_AMP 0.3
#define VISEE_OSCILLATION_X_FREQ 0.5
#define VISEE_OSCILLATION_Y_AMP 0.3
#define VISEE_OSCILLATION_Y_FREQ 0.4

#define PLAN_FOCAL_DISTANCE 1.2

#define SYM_SECTEUR_ANGLE 0.785398
#define SYM_SECTEUR_DEMI_ANGLE 0.392699

#define FRACTAL_FREQ_DEPART 1.0
#define FRACTAL_FREQ_LIMITE 9.0
#define FRACTAL_FREQ_DIVISEUR 0.8

#define PAS_BASE 0.002
#define PAS_RAYON_CIBLE 0.5
#define PAS_DIVISEUR_ECHELLE 40.0

#define SHADER_AMPLITUDE_LUMIERE 350.0
#define SHADER_TAILLE_BOITE_LOG 8.0
#define SHADER_GAMMA 1.4

void mainImage(out vec4 couleurPixel, in vec2 coordonneePixel) {
    vec2 resolution = iResolution.xy;
    float temps = iTime;
    couleurPixel = vec4(0.0);
    
    vec2 positionNormalisee = (coordonneePixel + coordonneePixel - resolution) / resolution.y;
    float rayonCamera = CAMERA_RAYON_BASE + CAMERA_RAYON_AMP * sin(temps * CAMERA_RAYON_FREQ);
    float angleAzimut = temps * CAMERA_AZIMUT_FREQ;
    float angleElevation = sin(temps * CAMERA_ELEVATION_FREQ) * CAMERA_ELEVATION_AMP;
    float bruitAleatoire = fract(dot(coordonneePixel, sin(coordonneePixel)));
    float distancePas;
    
    positionNormalisee *= 1. + dot(positionNormalisee, positionNormalisee) * (DISTORSION_LENTILLE_MIN + DISTORSION_LENTILLE_AMP * sin(temps * DISTORSION_LENTILLE_FREQ));
    
    vec3 origineRayon = vec3(sin(angleAzimut) * cos(angleElevation), sin(angleElevation), cos(angleAzimut) * cos(angleElevation)) * rayonCamera;
    vec3 directionVisee = normalize(vec3(sin(temps * VISEE_OSCILLATION_X_FREQ) * VISEE_OSCILLATION_X_AMP, cos(temps * VISEE_OSCILLATION_Y_FREQ) * VISEE_OSCILLATION_Y_AMP, 0) - origineRayon);
    vec3 axeHorizontal = normalize(cross(directionVisee, vec3(0, 1, 0)));
    vec3 directionRayon = normalize(positionNormalisee.x * axeHorizontal + positionNormalisee.y * cross(axeHorizontal, directionVisee) + PLAN_FOCAL_DISTANCE * directionVisee);
    
    for(float etape = 0.; etape < 100.; etape++) {
        vec3 positionEspace = origineRayon + bruitAleatoire * directionRayon;
        positionEspace.z -= 4.;
        
        angleAzimut = abs(mod(atan(positionEspace.y, positionEspace.x), SYM_SECTEUR_ANGLE) - SYM_SECTEUR_DEMI_ANGLE);
        positionEspace.xy = length(positionEspace.xy) * vec2(cos(angleAzimut), sin(angleAzimut));
        positionEspace.xy = vec2(log(length(positionEspace.xy) + 1e-3), cos(atan(positionEspace.y, positionEspace.x) * 2.));
        
        for(float frequence = FRACTAL_FREQ_DEPART; frequence < FRACTAL_FREQ_LIMITE; frequence /= FRACTAL_FREQ_DIVISEUR) {
            positionEspace += cos(ceil(positionEspace.yzx * frequence - temps)) / frequence;
        }
        
        distancePas = PAS_BASE + abs(length(positionEspace) - PAS_RAYON_CIBLE) / PAS_DIVISEUR_ECHELLE;
        couleurPixel += (sin(bruitAleatoire - temps + vec4(6, 2, 4, 0)) + .5) / (distancePas * SHADER_AMPLITUDE_LUMIERE);
        bruitAleatoire += distancePas;
    }
    
    couleurPixel = pow(tanh(couleurPixel / SHADER_TAILLE_BOITE_LOG), vec4(SHADER_GAMMA));
}`;

    const WARP_SHADER = `#define VITESSE_TUNNEL 1.5
#define NOMBRE_COUCHES 3.0
#define DENSITE_ETOILES 80.0
#define LONGUEUR_TRAINEE 0.35
#define COULEUR_INTENSITE 1.2

void mainImage(out vec4 couleurPixel, in vec2 coordonneePixel) {
    vec2 resolution = iResolution.xy;
    vec2 uv = (coordonneePixel - 0.5 * resolution) / resolution.y;
    float angle = atan(uv.y, uv.x);
    float rayon = length(uv);

    vec3 couleur = vec3(0.0);

    for (float couche = 0.0; couche < NOMBRE_COUCHES; couche++) {
        float decalageTemps = iTime * VITESSE_TUNNEL * (1.0 + couche * 0.4);
        float profondeur = fract(rayon * DENSITE_ETOILES - decalageTemps + couche * 17.13);
        float trainee = smoothstep(0.0, LONGUEUR_TRAINEE, profondeur) * smoothstep(1.0, 1.0 - LONGUEUR_TRAINEE, profondeur);
        float eclat = trainee * (1.0 / (rayon + 0.05)) * COULEUR_INTENSITE;
        vec3 teinte = 0.5 + 0.5 * cos(angle * 3.0 + couche * 2.0 + vec3(0.0, 2.0, 4.0));
        couleur += eclat * teinte * 0.15;
    }

    couleur = pow(couleur, vec3(0.8));
    couleurPixel = vec4(couleur, 1.0);
}`;

    const CALM_SHADER = `#define VITESSE_DERIVE 0.08
#define ECHELLE_MOTIF 2.5
#define NOMBRE_OCTAVES 4.0

float bruitDouceur(vec2 p) {
    return sin(p.x) * sin(p.y);
}

void mainImage(out vec4 couleurPixel, in vec2 coordonneePixel) {
    vec2 resolution = iResolution.xy;
    vec2 uv = (coordonneePixel - 0.5 * resolution) / resolution.y;

    vec3 teinteBase = vec3(0.05, 0.12, 0.22);
    vec3 teinteLueur = vec3(0.3, 0.55, 0.7);

    float temps = iTime * VITESSE_DERIVE;
    float motif = 0.0;
    float amplitude = 0.5;
    vec2 position = uv * ECHELLE_MOTIF;

    for (float octave = 0.0; octave < NOMBRE_OCTAVES; octave++) {
        motif += amplitude * bruitDouceur(position + temps * (1.0 + octave * 0.3));
        position *= 1.7;
        amplitude *= 0.55;
    }

    motif = motif * 0.5 + 0.5;
    vec3 couleur = mix(teinteBase, teinteLueur, motif);
    couleur += 0.03 * sin(temps * 2.0 + uv.x * 4.0);

    couleurPixel = vec4(couleur, 1.0);
}`;

    const SHADER_PRESETS = { default: DEFAULT_SHADER, warp: WARP_SHADER, calm: CALM_SHADER };

    // Lot 8 : inputs iChannel0-3 que chaque preset impose à la passe Image
    // (mêmes formes qu'un slot de pass-model.js : null | { type, … }).
    // Ces trois presets n'échantillonnent aucune texture, donc rien n'est
    // branché ; charger un preset débranche ce qui l'était sur l'Image
    // précédente au lieu de le laisser traîner, cf. restoreImagePreset()
    // dans core/project-io.js. Un futur preset qui a besoin d'une texture
    // la déclare ici, ex. [{ type: "asset", assetId: "tex_bayer" }, null, null, null].
    const SHADER_PRESET_INPUTS = {
        default: [null, null, null, null],
        warp: [null, null, null, null],
        calm: [null, null, null, null]
    };
