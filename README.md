# TonySpark

TonySpark est une web-app React qui transforme la webcam en interface de controle gestuel. Elle detecte les mains en temps reel avec MediaPipe, affiche des curseurs virtuels et permet de manipuler des fenetres de test avec un pointeur pilote par l'index.

## Fonctionnalites

- Selection de la camera depuis l'interface.
- Detection locale de 0, 1 ou 2 mains avec les 21 landmarks MediaPipe.
- Affichage optionnel du squelette des mains et des curseurs virtuels.
- Le curseur suit l'index en temps reel.
- Clic gestuel par flexion rapide de l'index, comme un clic souris.
- Drag et resize par pinch pouce-index.
- Reglage live des seuils click/pinch depuis l'interface.
- Inertie au relachement pour donner une sensation de lancer.
- HUD temps reel avec FPS, nombre de mains et position des curseurs.

L'image webcam reste locale dans le navigateur. TonySpark n'a pas de backend a lancer.

## Demo d'usage

1. Autorise l'acces camera au chargement de la page.
2. Choisis la camera si plusieurs peripheriques sont disponibles.
3. Place l'index sur une fenetre.
4. Replie rapidement l'index sur un bouton pour cliquer.
5. Pince pouce-index pour saisir une fenetre, deplace ta main, puis relache.
6. Pince avec deux mains sur la meme fenetre pour la redimensionner.
7. Ajuste les seuils dans le panneau de reglages si ta webcam est trop sensible ou pas assez.

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
- `src/lib/gestures.js` convertit la flexion de l'index en clic et le pinch pouce-index en drag/resize avec hysteresis.
- `GestureSettingsPanel` expose les seuils click/pinch directement dans l'interface.
- `GestureWindowLayer` affiche les fenetres pilotables, leurs boutons d'action et leur etat visuel.
- `App` gere les captures de fenetres, le redimensionnement a deux mains, le z-index, les limites de scene et l'inertie.

## TODO

### Priorite actuelle

Rendre l'interaction stable, previsible et peu fatigante avant d'ajouter de nouveaux gestes ou de nouveaux widgets.

### Plan de travail

1. Stabiliser la detection existante.
   - Ajouter un lissage temporel des landmarks et du curseur.
   - Valider les gestes sur plusieurs frames consecutives.
   - Utiliser une hysteresis avec seuil d'entree et de sortie differents.
   - Normaliser les distances par la taille de la main plutot qu'avec des seuils absolus.
2. Passer d'une logique "proche / pas proche" a des gestes avec etat.
   - Gerer explicitement debut de geste, maintien et fin de geste.
   - Utiliser une logique de confiance pour ignorer les frames peu fiables.
   - Distinguer detection de geste et intention utilisateur.
3. Limiter le systeme a 3 gestes robustes dans un premier temps.
   - Pointer.
   - Pinch click / drag.
   - Relachement.
4. Construire une machine a etats d'interaction.
   - Etats cibles : `IDLE`, `POINTING`, `HOVER_WINDOW`, `GRAB_START`, `DRAGGING`, `RESIZING`, `DISABLED`.
   - Transitions basees sur le geste reconnu, la duree, la confiance et la fenetre ciblee.
5. Separer mode pointage et mode action.
   - Eviter que chaque mouvement naturel declenche une commande.
   - Ajouter si besoin un geste d'activation ou de desactivation clair.
6. Ameliorer le mapping camera -> ecran.
   - Ajouter une calibration simple sur les coins de la zone utile.
   - Limiter la zone active pour reduire les grands mouvements.
   - Penser l'interaction comme un trackpad invisible, pas comme une air mouse a grand debattement.
7. Ajouter du feedback visuel immediat.
   - Curseur controle.
   - Fenetre ciblee surlignee.
   - Indicateur de pinch reconnu.
   - Progression visuelle si un geste doit etre maintenu.
8. Mesurer avant d'ajouter des features.
   - Tester de vraies taches: deplacer, redimensionner, snapper.
   - Suivre temps d'execution, erreurs, faux positifs, gestes rates et fatigue ressentie.

### Cas d'usage a rendre excellent d'abord

Attraper une fenetre et la deplacer de maniere fluide et fiable. Resize, snap, bureaux virtuels et autres commandes viennent ensuite.

### Architecture cible

- `HandTracker` : recupere les landmarks MediaPipe.
- `FeatureExtractor` : calcule distances, angles, vitesse, orientation et features normalisees.
- `GestureRecognizer` : transforme les features en gestes robustes.
- `InteractionStateMachine` : decide quoi faire selon le contexte et l'etat courant.
- `WindowController` : applique les actions sur les fenetres.
- `OverlayUI` : affiche le feedback visuel.

### Backlog produit

- Menu radial : maintien du pinch sur une fenetre pour ouvrir fermer, dupliquer, agrandir ou changer la couleur.
- Snap des fenetres : accroche automatique aux bords ou en plein ecran apres un lancer.
- Mode dessin : index pour viser, pinch pour dessiner, avec palette controlee a la main.
- Widgets reels : notes editables, lecteur audio, sliders volume/luminosite, galerie d'images.
- Calibration avancee : reglages de sensibilite du clic index, du pinch, du smoothing du curseur, inversion camera et main dominante.

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
