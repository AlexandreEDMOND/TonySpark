# TonySpark

TonySpark est une web-app React qui transforme la webcam en interface de controle gestuel. Elle detecte les mains en temps reel avec MediaPipe, affiche des curseurs virtuels et permet de manipuler des fenetres de test avec un pincement pouce-index.

## Fonctionnalites

- Selection de la camera depuis l'interface.
- Detection locale de 0, 1 ou 2 mains avec les 21 landmarks MediaPipe.
- Affichage optionnel du squelette des mains et des curseurs virtuels.
- Pincement pouce-index pour saisir et deplacer une fenetre.
- Redimensionnement d'une fenetre avec deux mains pincees sur la meme cible.
- Inertie au relachement pour donner une sensation de lancer.
- HUD temps reel avec FPS, nombre de mains et position des curseurs.

L'image webcam reste locale dans le navigateur. TonySpark n'a pas de backend a lancer.

## Demo d'usage

1. Autorise l'acces camera au chargement de la page.
2. Choisis la camera si plusieurs peripheriques sont disponibles.
3. Place l'index sur une fenetre.
4. Pince pouce-index pour la saisir, deplace ta main, puis relache.
5. Pince avec deux mains sur la meme fenetre pour la redimensionner.

## Architecture

```text
Browser
  React + Vite
  MediaPipe Tasks Vision
  Webcam getUserMedia
        |
        +-- detection des mains
        +-- calcul des gestes
        +-- rendu video/canvas/fenetres
```

## Demarrage

```bash
./start.sh
```

Ou manuellement :

```bash
npm install
npm run dev
```

Ouvre ensuite <http://localhost:5273>.

## Comment ca marche

- `@mediapipe/tasks-vision` charge le modele Hand Landmarker en WebAssembly avec delegation GPU.
- `TrackingView` lit le flux webcam, execute `HandLandmarker.detectForVideo`, dessine les landmarks et produit les interactions normalisees.
- `src/lib/gestures.js` convertit la distance pouce-index en etat de pincement avec hysteresis.
- `GestureWindowLayer` affiche les fenetres pilotables et leur etat visuel.
- `App` gere les captures de fenetres, le redimensionnement a deux mains, le z-index, les limites de scene et l'inertie.

## Stack

- React 18
- Vite 5
- MediaPipe Tasks Vision

## Scripts

- `npm run dev` : serveur de developpement Vite
- `npm run build` : build de production dans `dist/`
- `npm run preview` : preview du build Vite

## Limites

- Le navigateur doit avoir l'autorisation d'utiliser la camera.
- Le chargement initial depend des modeles MediaPipe et du WASM servis par les URLs configurees dans `src/lib/tracker.js`.
- La detection depend de la lumiere, du cadrage, de la qualite de la webcam et de la visibilite des doigts.

## Idee mise de cote

Le suivi du regard via un backend Python [GazeFollower](https://github.com/GanchengZhu/GazeFollower) a ete teste, mais il lance une calibration plein ecran via pygame. Sur macOS, cette fenetre prend le focus et rend l'experience instable. L'idee est gardee pour plus tard, mais elle est retiree de l'app actuelle.
