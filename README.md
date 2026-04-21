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

## Limites de l'estimation du regard

Sans calibration personnalisée (faire fixer 5-9 points à l'utilisateur et ajuster un modèle), le regard n'est qu'une **approximation** :

- La sensibilité horizontale/verticale n'est pas ajustée à ta morphologie.
- La pose de la tête n'est pas prise en compte pour projeter sur un écran réel.
- Pour un eye-tracker précis il faudrait : calibration, correction de la pose 3D de la tête, filtre de Kalman.

Un indicateur en croix rose montre l'estimation courante ; les deux points jaunes marquent les iris détectés.

## Scripts

- `npm run dev` — serveur de dev
- `npm run build` — build de prod dans `dist/`
- `npm run preview` — sert le build

## Stack

- React 18 + Vite
- MediaPipe Tasks Vision (WebAssembly + GPU)
