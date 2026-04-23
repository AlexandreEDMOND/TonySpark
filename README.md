# TonySpark

Web-app React qui utilise ta webcam pour detecter le squelette de tes mains en temps reel.

- **Choisir la caméra** parmi celles branchées sur ta machine.
- **Détecter le squelette de tes mains** en temps réel (0, 1 ou 2 mains) avec les 21 landmarks MediaPipe.

L'image webcam reste **locale dans le navigateur**. Il n'y a pas de backend a lancer pour l'instant.

## Idee mise de cote

Le suivi du regard via un backend Python [GazeFollower](https://github.com/GanchengZhu/GazeFollower) a ete teste, mais il lance une calibration plein ecran via pygame. Sur macOS, cette fenetre prend le focus et rend l'experience instable. L'idee est donc gardee pour plus tard, mais elle est retiree de l'app actuelle.

## Architecture

```
┌──────────────┐
│  Browser     │
│  React       │
│  MediaPipe   │
└──────────────┘
       │
       └──── ouvre la webcam pour detecter les mains
```

## Démarrage

```bash
./start.sh
```

Ou :

```bash
npm install
npm run dev
```

Ouvre <http://localhost:5273>.

## Comment ça marche

- `@mediapipe/tasks-vision` charge le modele MediaPipe pour le squelette des mains, execute cote browser.
- `TrackingView` lit la video webcam, lance `HandLandmarker.detectForVideo`, puis dessine les 21 points et connexions de chaque main sur un canvas.
- La camera selectionnee est geree depuis l'interface via `CameraSelector`.

## Limites

- Le navigateur doit avoir l'autorisation d'utiliser la camera.
- Les modeles MediaPipe sont charges depuis les CDN/configurations definis dans `src/lib/tracker.js`.
- La detection depend de la lumiere, du cadrage et de la qualite de la webcam.

## Stack

- **Frontend** : React 18 + Vite, MediaPipe Tasks Vision (WebAssembly + GPU)

## Scripts

- `npm run dev` — serveur de dev frontend (port 5273)
- `npm run build` — build de prod dans `dist/`
