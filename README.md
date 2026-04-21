# TonySpark ⚡

Petite web-app React qui utilise ta webcam pour :

- **Choisir la caméra** à utiliser parmi celles branchées sur ta machine.
- **Détecter le squelette de tes mains** en temps réel (0, 1 ou 2 mains simultanées) avec les 21 landmarks MediaPipe.
- **Estimer la direction de ton regard** à partir des landmarks iris (MediaPipe FaceLandmarker).

Tout tourne **localement dans le navigateur** — aucune image n'est envoyée sur le réseau.

## Démarrage rapide

```bash
./start.sh
```

Le script installe les dépendances npm si besoin puis lance le serveur de dev Vite sur <http://localhost:5273>.

La première ouverture te demandera l'autorisation d'accéder à la caméra. Une fois accordée, la liste des webcams disponibles apparaît dans la barre du haut.

## Comment ça marche

- `@mediapipe/tasks-vision` charge deux modèles : `HandLandmarker` (numHands=2) et `FaceLandmarker` (avec landmarks iris).
- À chaque frame, la vidéo passe dans les deux modèles via `detectForVideo`.
- Le squelette des mains est dessiné sur un `<canvas>` superposé (mirroir comme la vidéo).
- Le regard est estimé en calculant le décalage de l'iris par rapport au centre de l'œil, normalisé par la taille de l'œil. Ça donne un vecteur 2D qui est projeté sur l'image puis lissé dans le temps.

## Calibration du regard (9 points)

Pour améliorer la précision, tu peux calibrer le regard sur ta morphologie et ta position actuelle :

1. Clique sur **Calibrer** dans la barre du haut (bouton actif quand une caméra et les modèles sont prêts).
2. L'écran s'assombrit et une cible apparaît tour à tour aux 9 positions d'une grille 3×3.
3. À chaque cible :
   - **Phase jaune (0.8 s)** — « Prépare-toi », le temps que ton regard se pose. L'anneau se remplit et un compteur indique les secondes restantes.
   - **Phase rose (1.2 s)** — « Capture en cours », les échantillons bruts du regard sont enregistrés. Garde les yeux fixés sur la cible.
4. À la fin des 9 points, un modèle polynomial (ordre 2, ajusté par moindres carrés) est entraîné et la croix rose de gaze suit alors ta mire avec précision.

Tant que la calibration n'est pas faite, le regard est affiché avec une sensibilité fixe approximative.

- **Recalibrer** — relance la séquence (utile si tu changes de position ou d'écran).
- **Reset** — supprime la calibration et retombe sur l'estimation brute.

Astuce : garde la tête immobile pendant la calibration — la projection écran n'intègre pas encore la pose de la tête.

## Lissage adaptatif (filtre One Euro)

Le point de regard est lissé par un **filtre One Euro** (Casiez et al., 2012) : la fréquence de coupure s'adapte automatiquement à la vitesse du mouvement, ce qui enlève le jitter au repos sans introduire de retard lors des saccades.

## Limites restantes

Même calibrée, l'estimation reste imparfaite :

- La pose 3D de la tête n'est pas compensée (tourner la tête pollue le signal iris).
- La calibration est valide pour la position actuelle de ta tête face à la caméra ; un gros déplacement demande une recalibration.
- Pour un eye-tracker industriel il faudrait en plus : correction de la pose 3D de la tête, modèle 3D œil/iris, filtre de Kalman.

Un indicateur en croix rose montre l'estimation courante ; les deux points jaunes marquent les iris détectés.

## Scripts

- `npm run dev` — serveur de dev
- `npm run build` — build de prod dans `dist/`
- `npm run preview` — sert le build

## Stack

- React 18 + Vite
- MediaPipe Tasks Vision (WebAssembly + GPU)
