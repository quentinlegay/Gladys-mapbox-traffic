# Gladys Mapbox Traffic

Intégration externe pour [Gladys Assistant](https://gladysassistant.com) qui
suit la **durée de vos trajets** (maison → travail…) avec le trafic en temps
réel, via l'[API Mapbox Directions](https://docs.mapbox.com/api/navigation/directions/).

- 📈 **Graphique** de la durée du trajet, comparée à la durée habituelle
  (fonctionnalités historisées + widget de tableau de bord) ;
- 🚗 **Embouteillages** détectés à partir des annotations de congestion
  Mapbox (part du trajet en circulation dense) ;
- ⏱️ **Durée anormalement longue** par rapport à la durée typique ;
- 🎬 **Scènes** : 4 déclencheurs (embouteillage / fin, durée anormale / retour
  à la normale) et 1 action (« Obtenir la durée d'un trajet »).

Construite à partir du template officiel
[integration-template-js](https://github.com/GladysAssistant/integration-template-js)
et du SDK [`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js).

Documentation utilisateur : [docs/fr.md](./docs/fr.md) · [docs/en.md](./docs/en.md).

## Fonctionnement

```
          config (jeton, trajets, seuils)
                       │
   ┌───────────────────▼────────────────────┐
   │ monitor.js  (boucle d'actualisation)   │──► publishStates  → appareils « trajet »
   │  places.js  adresse → coordonnées      │                     (graphiques, widget)
   │  mapbox.js  Directions + Geocoding     │──► publishSceneEvent → déclencheurs de scène
   │  traffic.js retard, congestion, niveau │       (uniquement aux transitions)
   └────────────────────────────────────────┘
```

À chaque actualisation (toutes les 5 min par défaut, uniquement pendant les
jours/heures actifs), pour chaque trajet dont l'appareil a été créé :

1. le départ et la destination sont résolus (coordonnées saisies, adresse
   géocodée une seule fois, ou position de la maison si le départ est vide) ;
2. un appel `GET /directions/v5/mapbox/driving-traffic/{départ};{arrivée}`
   avec `annotations=congestion,distance` renvoie la durée avec trafic
   (`duration`), la durée typique (`duration_typical`) et la congestion de
   chaque segment. Quand Mapbox n'a pas de durée typique pour une route, la
   durée sans trafic (profil `driving`) sert de référence, mise en cache 24 h ;
3. `traffic.js` calcule le retard, la part du trajet en congestion
   `heavy`/`severe` et un niveau 0–3 ;
4. les états sont publiés, et les déclencheurs de scène sont émis **à chaque
   changement** (embouteillage commencé/terminé, durée anormale
   commencée/terminée).

## Structure

```
.
├─ index.js                          # bootstrap SDK + câblage (aucune logique métier)
├─ src/
│  ├─ config.js                      # valeurs par défaut, normalisation, liste des trajets
│  ├─ schedule.js                    # jours / heures actifs (fuseau configurable)
│  ├─ mapbox.js                      # client Directions API + Geocoding API
│  ├─ places.js                      # coordonnées ou adresse → point (avec cache)
│  ├─ traffic.js                     # analyse pure : retard, congestion, niveau
│  ├─ monitor.js                     # boucle, publication des états, transitions
│  ├─ handlers.js                    # actions, action de scène, widget
│  ├─ widget.js                      # contenu déclaratif du widget « Durée de trajet »
│  └─ devices/
│     ├─ index.js                    # un appareil par trajet configuré
│     └─ route.js                    # fonctionnalités de l'appareil « trajet »
├─ test/                             # tests `node --test` (fetch Mapbox simulé)
├─ docs/{fr,en}.md                   # documentation utilisateur (ré-hébergée par Gladys)
├─ gladys-assistant-integration.json # manifeste
├─ Dockerfile                        # Node 24 Alpine, rootfs en lecture seule
└─ cover.png                         # couverture 800×534
```

## Développement

```bash
npm install
npm test               # tests unitaires (node --test)
npm run lint           # ESLint
npm run format:check   # Prettier
```

Lancer localement contre un Gladys de développement :

```bash
GLADYS_HOST_API_URL="http://localhost:1443" \
GLADYS_INTEGRATION_TOKEN="<token>" \
GLADYS_INTEGRATION_SELECTOR="mapbox-traffic" \
LOG_LEVEL=debug \
npm start
```

Valider le manifeste avec les règles du store :

```bash
npx github:GladysAssistant/integration-store .
```

## Publication

1. Ajoutez le topic GitHub `gladys-assistant-integration` au dépôt et rendez-le
   public.
2. **Actions → Release → Run workflow** (`patch` / `minor` / `major`) : la
   version est incrémentée dans `package.json` et le manifeste, le tag est
   poussé et l'image multi-arch `ghcr.io/quentinlegay/gladys-mapbox-traffic`
   est construite. Rendez le package ghcr.io public lors de la première
   publication.
3. L'indexeur du store détecte la nouvelle version.

Les déclencheurs/actions de scène et les widgets nécessitent **Gladys ≥ 5.1.0**
(`gladys_version` du manifeste).

## Notes

- Le jeton Mapbox est un champ `secret` et n'apparaît jamais dans les logs.
- Les trajets sont identifiés par leur emplacement (`route-1`…`route-3`) :
  modifier l'adresse d'un trajet conserve l'appareil et son historique.
- L'état des transitions est en mémoire : après un redémarrage, un
  embouteillage en cours déclenche à nouveau « Embouteillage sur un trajet ».

## Licence

Apache-2.0
